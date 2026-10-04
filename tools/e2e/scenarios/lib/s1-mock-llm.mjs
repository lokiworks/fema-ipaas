import http from 'node:http'

const BEISEN = '@fema-ipaas/connector-beisen'
const FEISHU = '@fema-ipaas/connector-feishu'

export function startMockLlm({ port }) {
  const calls = []
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      const userText = lastUserText(body)
      calls.push({ url: request.url, userText })
      if (userText.includes('模型故障')) {
        response.writeHead(500, { 'content-type': 'application/json', connection: 'close' })
        response.end(JSON.stringify({ error: { message: 'upstream overloaded' } }))
        return
      }
      const reply = respond({ userText })
      response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
      response.end(JSON.stringify({
        id: 'mock-completion',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
        usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
      }))
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({
      calls,
      baseUrl: `http://127.0.0.1:${port}/v1`,
      close: () => new Promise((done) => server.close(() => done())),
    }))
  })
}

function lastUserText(body) {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const user = messages.filter((message) => message.role === 'user').pop()
  if (!user) {
    return ''
  }
  return typeof user.content === 'string' ? user.content : JSON.stringify(user.content)
}

function respond({ userText }) {
  const requestText = (userText.split('Request:\n')[1] ?? '').split('\n\nAnswers to your earlier questions:')[0]
  const answers = userText.includes('Answers to your earlier questions:') ? userText.split('Answers to your earlier questions:\n')[1] : ''
  if (requestText.includes('乱码')) {
    return 'Sorry, I am unable to help with that.'
  }
  if (requestText.includes('SAP')) {
    return JSON.stringify(unknownSystemPlan())
  }
  if (requestText.includes('入职')) {
    return JSON.stringify(onboardingPlan({ answers, withDedupe: !requestText.includes('无去重') }))
  }
  return JSON.stringify({
    displayName: '未识别',
    summary: '没有找到合适的触发器',
    trigger: { connector: '@fema-ipaas/connector-nothing', name: 'nothing', displayName: '无', input: {} },
    steps: [],
    questions: [],
    warnings: [],
  })
}

function onboardingPlan({ answers, withDedupe }) {
  const chat = (answers.match(/oc_[A-Za-z0-9_-]+/) ?? [])[0] ?? ''
  const department = (answers.match(/od-[A-Za-z0-9_-]+/) ?? [])[0] ?? ''
  return {
    displayName: '员工入职后在飞书建档并通知 HR 群',
    summary: '北森出现入职员工后，在飞书按部门开通账号，再在 HR 群发一条欢迎消息。',
    trigger: {
      connector: BEISEN,
      name: 'employee_changed',
      displayName: '北森员工入职',
      input: { statusScope: 'ONBOARDING', queryType: 2, timezone: 'Asia/Shanghai' },
    },
    steps: [
      {
        connector: FEISHU,
        name: 'provision_user',
        displayName: '开通飞书账号',
        input: {
          name: "{{trigger['output']['employeeInfo']['name']}}",
          mobile: "{{trigger['output']['employeeInfo']['mobilePhone']}}",
          email: "{{trigger['output']['employeeInfo']['email']}}",
          employeeNo: "{{trigger['output']['recordInfo']['jobNumber']}}",
          employeeType: 1,
          ...(department ? { departmentId: department } : {}),
        },
      },
      {
        connector: FEISHU,
        name: 'send_group_message',
        displayName: '通知 HR 群',
        input: {
          chatId: chat,
          messageType: 'text',
          content: "{{trigger['output']['employeeInfo']['name']}} 已入职，飞书账号已开通",
        },
      },
    ],
    questions: [
      ...(chat ? [] : ['通知哪个飞书群？请给出群 ID（以 oc_ 开头）']),
      ...(department ? [] : ['新员工放进哪个飞书部门？请给出飞书部门 ID']),
    ],
    warnings: [],
    ...(withDedupe ? { dedupe: { keyPath: 'recordInfo.jobNumber', keyLabel: '工号' } } : {}),
  }
}

function unknownSystemPlan() {
  return {
    displayName: '入职后同步到 SAP',
    summary: '北森入职后写入 SAP，并通知 HR 群。',
    trigger: { connector: BEISEN, name: 'employee_changed', displayName: '北森员工入职', input: { statusScope: 'ONBOARDING' } },
    steps: [
      { connector: '@fema-ipaas/connector-sap', name: 'create_employee', displayName: '在 SAP 建档', input: {} },
      {
        connector: FEISHU,
        name: 'send_group_message',
        displayName: '通知 HR 群',
        input: { messageType: 'text', content: "{{trigger['output']['employeeInfo']['name']}} 已入职" },
      },
    ],
    questions: [],
    warnings: [],
  }
}
