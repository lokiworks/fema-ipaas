import { createServer } from 'node:http'

const port = Number(process.env.FAKE_LLM_PORT ?? 18978)
const state = { requests: 0, last: null }

function lastUserText(messages) {
  const first = messages.find((message) => message.role === 'user')
  return typeof first?.content === 'string' ? first.content : JSON.stringify(first?.content ?? '')
}

function toolResults(messages) {
  return messages.filter((message) => message.role === 'tool')
}

function toolCall({ name, args }) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: `call_${state.requests}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  }
}

function answer(text) {
  return { role: 'assistant', content: text }
}

function decide({ messages, tools }) {
  const marker = /case=([a-z_]+)/.exec(lastUserText(messages))?.[1] ?? 'lookup'
  const results = toolResults(messages)
  const lastResult = results.at(-1)?.content ?? ''
  const toolNames = tools.map((tool) => tool.function.name)
  const has = (name) => toolNames.includes(name)
  if (marker === 'lookup') {
    if (results.length === 0) return toolCall({ name: 'query_employee', args: { keyword: '张' } })
    return answer(`查到员工：${lastResult.slice(0, 200)}`)
  }
  if (marker === 'ticket') {
    if (results.length === 0) return toolCall({ name: 'query_employee', args: { keyword: '王' } })
    if (results.length === 1) return toolCall({ name: 'create_ticket', args: { title: '新员工电脑申请', assignee: 'E1004' } })
    if (/rejected|驳回/i.test(lastResult)) return answer('工单没有创建：审批人驳回了这次调用')
    return answer(`工单已创建：${lastResult.slice(0, 120)}`)
  }
  if (marker === 'loop') {
    return toolCall({ name: 'query_employee', args: { keyword: '张' } })
  }
  if (marker === 'budget') {
    return toolCall({ name: 'query_employee', args: { keyword: '张' } })
  }
  if (marker === 'error') {
    if (results.length === 0) return toolCall({ name: 'always_error', args: {} })
    return answer(`工具失败了：${lastResult.slice(0, 160)}`)
  }
  if (marker === 'huge') {
    if (results.length === 0) return toolCall({ name: 'huge_output', args: { kb: 512 } })
    return answer(`收到超大结果，长度 ${lastResult.length}`)
  }
  if (marker === 'slow') {
    if (results.length === 0) return toolCall({ name: 'slow_tool', args: { seconds: 75 } })
    return answer(`慢工具结果：${lastResult.slice(0, 160)}`)
  }
  if (marker === 'drop') {
    if (results.length === 0) return toolCall({ name: 'drop_connection', args: {} })
    return answer(`服务器中途掉线：${lastResult.slice(0, 200)}`)
  }
  if (marker === 'forbidden') {
    if (results.length === 0) return toolCall({ name: has('slow_tool') ? 'slow_tool' : 'huge_output', args: { seconds: 1, kb: 1 } })
    return answer(`越权调用结果：${lastResult.slice(0, 160)}`)
  }
  return answer('未知场景')
}

const server = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  if (url.pathname === '/admin/state') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state))
    return
  }
  if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') {
    const body = JSON.parse(raw)
    state.requests += 1
    state.last = { model: body.model, toolNames: (body.tools ?? []).map((tool) => tool.function.name), messageCount: body.messages.length }
    const message = decide({ messages: body.messages, tools: body.tools ?? [] })
    const usage = { prompt_tokens: 400 + 50 * body.messages.length, completion_tokens: 100, total_tokens: 500 + 50 * body.messages.length }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: `chatcmpl-${state.requests}`,
      object: 'chat.completion',
      model: body.model,
      choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
      usage,
    }))
    return
  }
  res.writeHead(404).end('not found')
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`fake llm on ${port}\n`)
})
