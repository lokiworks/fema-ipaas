function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  return [...String(s)].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7);
}

const PEOPLE = [
  { id: 'u1', name: '林晓', email: 'linxiao@xinghe.tech', dept: '信息技术部', title: '集成平台负责人' },
  { id: 'u2', name: '陈思远', email: 'chensiyuan@xinghe.tech', dept: '人力资源部', title: 'HRBP' },
  { id: 'u3', name: '王磊', email: 'wanglei@xinghe.tech', dept: '信息技术部', title: '后端工程师' },
  { id: 'u4', name: '赵敏', email: 'zhaomin@xinghe.tech', dept: '财务部', title: '财务系统专员' },
  { id: 'u5', name: '周宁', email: 'zhouning@xinghe.tech', dept: '研发中心', title: '效能工程师' },
  { id: 'u6', name: '孙悦', email: 'sunyue@xinghe.tech', dept: '销售运营部', title: '销售运营经理' },
  { id: 'u7', name: '李航', email: 'lihang@xinghe.tech', dept: '信息技术部', title: '运维工程师' },
  { id: 'u8', name: '吴倩', email: 'wuqian@xinghe.tech', dept: '行政部', title: '行政主管' },
  { id: 'u9', name: '郑凯', email: 'zhengkai@xinghe.tech', dept: '研发中心', title: '前端工程师' },
  { id: 'u10', name: '何静', email: 'hejing@xinghe.tech', dept: '人力资源部', title: '招聘经理' },
  { id: 'u11', name: '高远', email: 'gaoyuan@partner.cn', dept: '外部顾问', title: '实施顾问' },
  { id: 'u12', name: '马骁', email: 'maxiao@xinghe.tech', dept: '财务部', title: '财务经理' },
];

function personName(id) {
  const state = typeof Store !== 'undefined' ? Store.get() : null;
  const user = (state && state.users && state.users.find((u) => u.id === id)) || PEOPLE.find((p) => p.id === id);
  return user ? user.name : '已移除的用户';
}

const DEFAULT_ERROR_SETTINGS = { strategy: 'stop', rules: [], times: 3, interval: 10 };

const n = (id, kind, extra) => ({ id, kind, ...extra });
const act = (id, connector, opKey, name, config = {}, extra = {}) => ({ id, kind: 'action', connector, op: opKey, name, config, connectionId: null, settings: { ...DEFAULT_ERROR_SETTINGS }, ...extra });
const trig = (connector, opKey, name, config = {}, extra = {}) => ({ id: 'trigger', kind: 'trigger', connector, op: opKey, name, config, connectionId: null, ...extra });

function seedWorkflows(now) {
  return [
    {
      id: 'wf_onboard', projectId: 'p1', folderId: 'f_lifecycle', name: '新员工入职自动开通账号',
      description: '北森入职完成后，自动在飞书建档、按部门开通研发账号，并通知 HR 群。',
      status: 'enabled', published: true, draftChanged: false, version: 7, owner: 'u1',
      createdAt: now - 62 * DAY, updatedAt: now - 2 * HOUR, tags: ['入职', '账号'],
      test: { version: 7, status: 'enabled', at: now - 3 * HOUR, by: 'u1' },
      trigger: trig('beisen', 'onboarding_completed', '员工入职完成', { interval: '5 分钟' }, { connectionId: 'c_beisen', runSettings: { dedupe: { enabled: true, key: '{{trigger.employee_id}}', window: '30d' }, concurrency: { max: 5, orderKey: '' } } }),
      steps: [
        act('s1', 'feishu', 'get_user', '查询飞书用户', { lookup: '邮箱', email: '{{trigger.email}}' }, { connectionId: 'c_feishu' }),
        n('s2', 'branch', {
          name: '按部门分流',
          branches: [
            { id: 'b1', name: '研发中心', conditions: [{ left: '{{trigger.department}}', op: '等于', right: '研发中心' }], logic: 'and', steps: [
              act('s3', 'github', 'create_issue', '邀请加入 GitHub 组织', { repo: 'xinghe/it-requests', title: '开通 GitHub：{{trigger.name}}' }, { connectionId: 'c_github' }),
              act('s4', 'jira', 'create_issue', '创建 Jira 账号工单', { project: 'IT', issueType: '任务', summary: '开通 Jira：{{trigger.name}}' }, { connectionId: 'c_jira' }),
            ] },
            { id: 'b2', name: '销售运营部', conditions: [{ left: '{{trigger.department}}', op: '等于', right: '销售运营部' }], logic: 'and', steps: [
              act('s5', 'salesforce', 'update_record', '开通 Salesforce 席位', { object: 'User', fields: '{ "IsActive": true }' }, { connectionId: 'c_sf' }),
            ] },
            { id: 'b3', name: '默认', isDefault: true, steps: [] },
          ],
        }),
        act('s6', 'feishu', 'send_card', '通知 HR 群', { receiveType: '群聊', receiver: 'HR 入职服务群', template: '入职开通结果卡片' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_offboard', projectId: 'p1', folderId: 'f_lifecycle', name: '离职交接与资产回收提醒',
      description: '员工离职生效后，查询名下资产并逐项提醒行政回收。',
      status: 'enabled', published: true, draftChanged: true, version: 4, owner: 'u2',
      createdAt: now - 40 * DAY, updatedAt: now - 26 * MIN, tags: ['离职'],
      trigger: trig('beisen', 'employee_left', '员工离职', { interval: '15 分钟' }, { connectionId: 'c_beisen' }),
      steps: [
        act('s1', 'feishu', 'bitable_search_record', '查询名下资产', { app: 'IT 资产台账', table: '资产', filter: '使用人 = {{trigger.name}}' }, { connectionId: 'c_feishu' }),
        n('s2', 'loop', { name: '逐项处理资产', config: { items: '{{s1.items}}', mode: '串行', max: 100, concurrency: 5 }, steps: [
          act('s3', 'feishu', 'bitable_update_record', '标记为待回收', { app: 'IT 资产台账', table: '资产', recordId: '{{loop.item.record_id}}', fields: '{ "状态": "待回收" }' }, { connectionId: 'c_feishu' }),
        ] }),
        act('s4', 'feishu', 'send_message', '通知行政', { receiveType: '用户', receiver: '吴倩', content: '{{trigger.name}} 已离职，共 {{s1.total}} 项资产待回收' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_purchase', projectId: 'p1', folderId: 'f_finance', name: '采购审批通过后写入金蝶',
      description: '飞书采购审批通过后，自动生成金蝶采购订单并提交。',
      status: 'enabled', published: true, draftChanged: false, version: 12, owner: 'u4',
      createdAt: now - 90 * DAY, updatedAt: now - 3 * DAY, tags: ['审批', '财务'],
      test: { version: 12, status: 'enabled', at: now - 3 * DAY - 2 * HOUR, by: 'u4' },
      trigger: trig('feishu', 'approval_approved', '审批实例通过', { approval: '采购申请（新）' }, { connectionId: 'c_feishu', runSettings: { dedupe: { enabled: true, key: '{{trigger.instance_code}}', window: '7d' }, concurrency: { max: 3, orderKey: '{{trigger.user_id}}' } } }),
      steps: [
        act('s1', 'feishu', 'get_approval', '获取审批表单', { instanceCode: '{{trigger.instance_code}}' }, { connectionId: 'c_feishu' }),
        act('s3', 'kingdee', 'save_bill', '保存采购订单', { formId: 'PUR_PurchaseOrder', model: { $map: { mode: 'object', fields: [
          { id: 'm1', target: 'FDate', source: '{{trigger.end_time}}', transforms: [{ type: 'date', arg: 'YYYY-MM-DD' }] },
          { id: 'm2', target: 'FSupplierId', source: '', constant: 'VEN00018', transforms: [] },
          { id: 'm3', target: 'FEntity', source: '{{s1.form[0].value}}', transforms: [], eachOn: true, each: [
            { id: 'e1', target: 'FMaterialId', source: '{{item.物料编码}}', transforms: [{ type: 'trim' }, { type: 'lookup', arg: 'mt2' }] },
            { id: 'e2', target: 'FQty', source: '{{item.数量}}', transforms: [{ type: 'number' }] },
            { id: 'e3', target: 'FPrice', source: '{{item.单价}}', transforms: [{ type: 'number' }, { type: 'round', arg: '2' }] },
          ] },
        ] } } }, { connectionId: 'c_kingdee', settings: { strategy: 'retry-stop', times: 3, interval: 30, rules: [{ id: 'r1', name: '限流时重试', cond: '等于任一目标值', codes: ['429', '503'], strategy: 'retry-stop' }] } }),
        act('s4', 'kingdee', 'submit_bill', '提交采购订单', { formId: 'PUR_PurchaseOrder', number: '{{s3.Result.Number}}' }, { connectionId: 'c_kingdee' }),
        act('s5', 'feishu', 'send_message', '通知申请人', { receiveType: '用户', receiver: '{{trigger.user_id}}', content: '你的采购申请已生成金蝶订单 {{s3.Result.Number}}' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_attendance', projectId: 'p1', folderId: 'f_notice', name: '每日考勤异常日报',
      description: '工作日早 9 点汇总前一天的考勤异常，由 AI 生成摘要后推送到管理群。',
      status: 'enabled', published: true, draftChanged: false, version: 3, owner: 'u2',
      createdAt: now - 21 * DAY, updatedAt: now - 5 * DAY, tags: ['日报'],
      trigger: trig('schedule', 'every', '定时任务', { mode: '按周触发', weekdays: ['周一', '周二', '周三', '周四', '周五'], at: '09:00', timezone: 'Asia/Shanghai', skipHoliday: true }),
      steps: [
        act('s1', 'mysql', 'execute_query', '查询考勤异常', { sql: "SELECT dept, name, type, minutes\nFROM attendance_exception\nWHERE day = CURDATE() - INTERVAL 1 DAY;" }, { connectionId: 'c_mysql', sensitive: true }),
        act('s2', 'data-summarizer', 'aggregate', '按部门汇总', { list: '{{s1.rows}}', groupBy: 'dept', aggregate: '计数' }),
        n('s3', 'ai', { name: '生成日报摘要', config: { connectionId: 'c_claude', modelName: 'claude-sonnet-5', prompt: '根据以下考勤异常汇总写一段 100 字以内的日报摘要：{{s2.result}}', format: '文本' }, settings: { ...DEFAULT_ERROR_SETTINGS, strategy: 'retry-stop' } }),
        act('s4', 'feishu', 'send_card', '推送到管理群', { receiveType: '群聊', receiver: '部门负责人群', template: '考勤日报卡片' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_offer', projectId: 'p1', folderId: 'f_lifecycle', name: '候选人接受 Offer 后创建入职任务',
      description: '在多维表格中生成入职待办，并给 HRBP 建一个入职沟通日程。',
      status: 'disabled', published: true, draftChanged: false, version: 2, owner: 'u10',
      createdAt: now - 33 * DAY, updatedAt: now - 9 * DAY, tags: ['招聘'],
      trigger: trig('beisen', 'offer_accepted', '候选人接受 Offer', { interval: '15 分钟' }, { connectionId: 'c_beisen' }),
      steps: [
        act('s1', 'feishu', 'bitable_create_record', '新增入职待办', { app: '入职管理', table: '待入职', fields: { $map: { mode: 'object', fields: [
          { id: 'm1', target: '姓名', source: '{{trigger.name}}', transforms: [{ type: 'trim' }] },
          { id: 'm2', target: '岗位', source: '{{trigger.position}}', transforms: [] },
          { id: 'm3', target: '预计入职日期', source: '{{trigger.expected_date}}', transforms: [{ type: 'date', arg: 'YYYY-MM-DD' }] },
          { id: 'm4', target: 'HRBP', source: '{{trigger.hrbp}}', transforms: [] },
          { id: 'm5', target: '状态', source: '', constant: '待入职', transforms: [] },
        ] } } }, { connectionId: 'c_feishu' }),
        act('s2', 'feishu', 'create_calendar_event', '创建入职沟通日程', { summary: '入职沟通：{{trigger.name}}', attendees: '{{trigger.hrbp}}' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_meeting', projectId: 'p1', folderId: 'f_notice', name: '会议室预订同步',
      description: '',
      status: 'disabled', published: false, draftChanged: true, version: 0, owner: 'u8',
      createdAt: now - 1 * DAY, updatedAt: now - 1 * DAY, tags: [],
      trigger: trig('feishu', 'calendar_event_created', '日程创建', {}, { connectionId: 'c_feishu' }),
      steps: [],
    },
    {
      id: 'wf_ocr', projectId: 'p1', folderId: 'f_finance', name: '报销票据识别入表',
      description: '接收报销系统推送的票据图片，用 AI 抽取发票字段后写入多维表格。',
      status: 'enabled', published: true, draftChanged: false, version: 5, owner: 'u4',
      createdAt: now - 18 * DAY, updatedAt: now - 50 * MIN, tags: ['报销', 'AI'],
      test: { version: 6, status: 'enabled', at: now - 40 * MIN, by: 'u4' },
      trigger: trig('webhook', 'catch_sync', 'Webhook 触发器', { auth: 'HMAC 签名', bodyType: 'JSON' }),
      steps: [
        n('s1', 'ai', { name: '抽取发票字段', config: { connectionId: 'c_openai', modelName: 'gpt-4.1', prompt: '从票据图片 {{trigger.body.image_url}} 中抽取：发票号码、开票日期、金额、销售方名称', format: 'JSON', outputFields: [{ k: 'invoice_no', t: '字符串', d: '发票号码' }, { k: 'date', t: '字符串', d: '开票日期' }, { k: 'amount', t: '数值', d: '价税合计' }, { k: 'seller', t: '字符串', d: '销售方名称' }] }, settings: { ...DEFAULT_ERROR_SETTINGS, strategy: 'retry-stop' } }),
        n('s2', 'branch', {
          name: '金额校验',
          branches: [
            { id: 'b1', name: '金额 > 5000', conditions: [{ left: '{{s1.amount}}', op: '大于', right: '{{config.large_amount_threshold}}' }], logic: 'and', steps: [
              act('s3', 'feishu', 'create_approval', '发起大额复核', { approval: '大额报销复核', user: '{{trigger.body.submitter}}' }, { connectionId: 'c_feishu' }),
            ] },
            { id: 'b2', name: '默认', isDefault: true, steps: [] },
          ],
        }),
        act('s4', 'feishu', 'bitable_create_record', '写入报销台账', { app: '报销台账', table: '票据', fields: { $map: { mode: 'object', fields: [
          { id: 'm1', target: '发票号码', source: '{{s1.invoice_no}}', transforms: [{ type: 'trim' }] },
          { id: 'm2', target: '开票日期', source: '{{s1.date}}', transforms: [{ type: 'date', arg: 'YYYY-MM-DD' }] },
          { id: 'm3', target: '金额', source: '{{s1.amount}}', transforms: [{ type: 'number' }, { type: 'round', arg: '2' }] },
          { id: 'm4', target: '销售方', source: '{{s1.seller}}', transforms: [] },
          { id: 'm5', target: '提交人', source: '{{trigger.body.submitter}}', transforms: [] },
          { id: 'm6', target: '状态', source: '', constant: '待复核', transforms: [] },
        ] } } }, { connectionId: 'c_feishu' }),
        act('s5', 'webhook', 'respond', '同步回调识别结果', { status: '200', body: '{ "ok": true, "invoice": "{{s1.invoice_no}}" }' }),
      ],
    },
    {
      id: 'wf_birthday', projectId: 'p1', folderId: 'f_notice', name: '员工生日祝福',
      description: '每天早上查询当天过生日的同事并发送祝福。',
      status: 'enabled', published: true, draftChanged: false, version: 2, owner: 'u8',
      createdAt: now - 70 * DAY, updatedAt: now - 30 * DAY, tags: ['关怀'],
      trigger: trig('schedule', 'every', '定时任务', { mode: '每天触发', at: '09:30', timezone: 'Asia/Shanghai', skipHoliday: true }),
      steps: [
        act('s1', 'feishu', 'bitable_search_record', '查询今日寿星', { app: '员工关怀', table: '生日', filter: '生日 = TODAY()' }, { connectionId: 'c_feishu' }),
        n('s2', 'loop', { name: '逐个发送', config: { items: '{{s1.items}}', mode: '串行', max: 50, concurrency: 5 }, steps: [
          act('s3', 'feishu', 'send_card', '发送生日卡片', { receiveType: '用户', receiver: '{{loop.item.fields.open_id}}', template: '生日祝福卡片' }, { connectionId: 'c_feishu' }),
        ] }),
      ],
    },
    {
      id: 'wf_contract', projectId: 'p1', folderId: 'f_finance', name: '合同到期提醒',
      description: '每周一检查 30 天内到期的合同，提醒负责人续签。',
      status: 'disabled', published: true, draftChanged: false, version: 1, owner: 'u12',
      createdAt: now - 12 * DAY, updatedAt: now - 12 * DAY, tags: [],
      trigger: trig('schedule', 'every', '定时任务', { mode: '按周触发', weekdays: ['周一'], at: '10:00', timezone: 'Asia/Shanghai' }),
      steps: [
        act('s1', 'feishu', 'bitable_search_record', '查询即将到期合同', { app: '合同台账', table: '合同', filter: '到期日 <= TODAY() + 30' }, { connectionId: 'c_feishu' }),
        n('s2', 'branch', { name: '是否有到期合同', branches: [
          { id: 'b1', name: '有到期合同', conditions: [{ left: '{{s1.total}}', op: '大于', right: '0' }], logic: 'and', steps: [
            act('s3', 'feishu', 'send_message', '提醒负责人', { receiveType: '用户', receiver: '马骁', content: '有 {{s1.total}} 份合同将在 30 天内到期' }, { connectionId: 'c_feishu' }),
          ] },
          { id: 'b2', name: '默认', isDefault: true, steps: [n('s4', 'end', { name: '结束流程', config: { status: '成功', message: '没有即将到期的合同' } })] },
        ] }),
      ],
    },
    {
      id: 'wf_ticket', projectId: 'p1', folderId: null, name: 'IT 工单自动分派',
      description: '员工 @IT 助手机器人提问，AI 判断类别后建 Jira 工单或直接回复。',
      status: 'enabled', published: true, draftChanged: false, version: 9, owner: 'u7',
      createdAt: now - 48 * DAY, updatedAt: now - 1 * DAY, tags: ['IT', 'AI'],
      trigger: trig('feishu', 'message_received', '机器人收到消息', { bot: 'IT 助手' }, { connectionId: 'c_feishu' }),
      steps: [
        n('s1', 'ai', { name: '识别问题类别', config: { connectionId: 'c_claude', modelName: 'claude-haiku-4-5', prompt: '把用户的问题分类为：硬件、账号权限、网络、其他。只输出类别。\n问题：{{trigger.text}}', format: '文本', temperature: 0 }, settings: { ...DEFAULT_ERROR_SETTINGS, strategy: 'retry-stop' } }),
        n('s2', 'branch', { name: '按类别处理', branches: [
          { id: 'b1', name: '硬件', conditions: [{ left: '{{s1.result}}', op: '等于', right: '硬件' }], logic: 'and', steps: [
            act('s3', 'jira', 'create_issue', '创建硬件工单', { project: 'IT', issueType: '硬件报修', summary: '{{trigger.text}}' }, { connectionId: 'c_jira' }),
          ] },
          { id: 'b2', name: '账号权限', conditions: [{ left: '{{s1.result}}', op: '等于', right: '账号权限' }], logic: 'and', steps: [
            act('s4', 'jira', 'create_issue', '创建权限工单', { project: 'IT', issueType: '权限申请', summary: '{{trigger.text}}' }, { connectionId: 'c_jira' }),
          ] },
          { id: 'b3', name: '默认', isDefault: true, steps: [
            act('s5', 'feishu', 'send_message', '回复知识库链接', { receiveType: '用户', receiver: '{{trigger.sender}}', content: '可以先看看 IT 自助手册：https://xinghe.feishu.cn/wiki/it' }, { connectionId: 'c_feishu' }),
          ] },
        ] }),
      ],
    },
    {
      id: 'wf_visitor', projectId: 'p1', folderId: 'f_notice', name: '访客登记通知',
      description: '访客填写登记表后通知被访人和前台。',
      status: 'enabled', published: true, draftChanged: false, version: 1, owner: 'u8',
      createdAt: now - 8 * DAY, updatedAt: now - 8 * DAY, tags: ['行政'],
      trigger: trig('forms', 'form_submitted', '表单触发器', { form: '访客登记', fields: [{ id: 'f1', key: 'visitor', name: '访客姓名', type: '单行文本', required: true }, { id: 'f2', key: 'company', name: '来访单位', type: '单行文本', required: true }, { id: 'f3', key: 'host', name: '被访人', type: '成员', required: true }, { id: 'f4', key: 'visit_time', name: '来访时间', type: '日期时间', required: true }] }),
      steps: [
        act('s1', 'feishu', 'send_message', '通知被访人', { receiveType: '用户', receiver: '{{trigger.host}}', content: '{{trigger.visitor}} 已到访前台' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_notify_sub', projectId: 'p1', folderId: 'f_shared', name: '公共子流程：发送群通知',
      description: '统一的群通知出口，供其他工作流调用。',
      status: 'enabled', published: true, draftChanged: false, version: 3, owner: 'u1',
      createdAt: now - 100 * DAY, updatedAt: now - 20 * DAY, tags: ['子流程'],
      trigger: trig('subflows', 'called', '子流程触发器', { params: [{ name: 'chat', type: '字符串', required: true }, { name: 'title', type: '字符串', required: true }, { name: 'content', type: '字符串', required: false }] }),
      steps: [
        act('s1', 'feishu', 'send_card', '发送通知卡片', { receiveType: '群聊', receiver: '{{trigger.chat}}', template: '通用通知卡片' }, { connectionId: 'c_feishu' }),
        act('s2', 'subflows', 'respond', '返回发送结果', { body: '{ "message_id": "{{s1.message_id}}" }' }),
      ],
    },
    {
      id: 'wf_alert', projectId: 'p1', folderId: 'f_shared', name: '工作流运行失败告警',
      description: '核心工作流运行失败时，把错误信息和日志链接推送到运维群。',
      status: 'enabled', published: true, draftChanged: false, version: 2, owner: 'u7',
      createdAt: now - 30 * DAY, updatedAt: now - 12 * DAY, tags: ['告警'],
      trigger: trig('alert', 'alert', '告警触发器', { rule: '核心流程运行失败', event: '流程运行失败', scope: ['wf_onboard', 'wf_purchase', 'wf_ocr'], frequency: '实时', periods: 1, activeHours: '全天' }),
      steps: [
        act('s1', 'feishu', 'send_card', '推送告警卡片', { receiveType: '群聊', receiver: '集成平台运维群', template: '通用通知卡片' }, { connectionId: 'c_feishu' }),
      ],
    },
    {
      id: 'wf_pr_notify', projectId: 'p2', folderId: null, name: 'PR 合并通知到研发群',
      description: 'Pull Request 合并后把标题、作者推送到平台研发群。', status: 'enabled', published: true, draftChanged: false, version: 3, owner: 'u5',
      createdAt: now - 30 * DAY, updatedAt: now - 4 * DAY, tags: [],
      trigger: trig('github', 'pr_merged', 'Pull Request 合并', { repo: 'xinghe/platform' }, { connectionId: 'c_github' }),
      steps: [act('s1', 'feishu', 'send_card', '发送合并卡片', { receiveType: '群聊', receiver: '平台研发群', template: '通用通知卡片' }, { connectionId: 'c_feishu' })],
    },
    {
      id: 'wf_pipeline', projectId: 'p2', folderId: null, name: '流水线失败自动建 Jira',
      description: 'GitLab 流水线失败时在 Jira 创建缺陷。', status: 'enabled', published: true, draftChanged: false, version: 5, owner: 'u9',
      createdAt: now - 25 * DAY, updatedAt: now - 6 * DAY, tags: [],
      trigger: trig('gitlab', 'pipeline_failed', '流水线失败', {}, { connectionId: 'c_gitlab' }),
      steps: [act('s1', 'jira', 'create_issue', '创建缺陷', { project: 'PLAT', issueType: '缺陷', summary: '流水线失败：{{trigger.ref}} · {{trigger.stage}}' }, { connectionId: 'c_jira' })],
    },
    {
      id: 'wf_lead', projectId: 'p3', folderId: null, name: '官网线索分配',
      description: '官网表单提交后在 Salesforce 创建线索。', status: 'enabled', published: true, draftChanged: false, version: 6, owner: 'u6',
      createdAt: now - 55 * DAY, updatedAt: now - 2 * DAY, tags: [],
      trigger: trig('webhook', 'catch', 'Webhook 触发器', { auth: '无鉴权', bodyType: 'JSON' }),
      steps: [act('s1', 'salesforce', 'create_lead', '创建线索', { params: { $map: { mode: 'object', fields: [
        { id: 'm1', target: 'LastName', source: '{{trigger.body.name}}', transforms: [{ type: 'trim' }] },
        { id: 'm2', target: 'Company', source: '{{trigger.body.company}}', transforms: [] },
        { id: 'm3', target: 'Email', source: '{{trigger.body.email}}', transforms: [{ type: 'lower' }] },
        { id: 'm4', target: 'Phone', source: '{{trigger.body.phone}}', transforms: [] },
        { id: 'm5', target: 'LeadSource', source: '{{trigger.body.source}}', transforms: [{ type: 'lookup', arg: 'mt3' }] },
      ] } } }, { connectionId: 'c_sf' })],
    },
    {
      id: 'wf_wecom_lead', projectId: 'p3', folderId: null, name: '企业微信新客户同步到 Salesforce',
      description: '销售在企业微信添加外部联系人后，自动在 Salesforce 建线索，并在销售群里提醒跟进。', status: 'enabled', published: true, draftChanged: false, version: 3, owner: 'u6',
      createdAt: now - 26 * DAY, updatedAt: now - 5 * DAY, tags: ['客户'],
      trigger: trig('wecom', 'external_contact_added', '添加外部联系人', {}, { connectionId: 'c_wecom', runSettings: { dedupe: { enabled: true, key: '{{trigger.external_userid}}', window: '30d' }, concurrency: { max: 5, orderKey: '' } } }),
      steps: [
        act('s1', 'salesforce', 'create_lead', '创建线索', { params: { $map: { mode: 'object', fields: [
          { id: 'm1', target: 'LastName', source: '{{trigger.name}}', transforms: [{ type: 'trim' }] },
          { id: 'm2', target: 'Company', source: '{{trigger.corp_name}}', transforms: [{ type: 'default', arg: '个人客户' }] },
          { id: 'm3', target: 'Phone', source: '{{trigger.mobile}}', transforms: [] },
          { id: 'm4', target: 'LeadSource', source: '', constant: 'WeCom', transforms: [] },
        ] } } }, { connectionId: 'c_sf' }),
        act('s2', 'wecom', 'robot_message', '提醒销售群跟进', { content: '新客户 {{trigger.name}}（{{trigger.corp_name}}）已同步为线索，请尽快跟进' }, { connectionId: 'c_wecom' }),
      ],
    },
    {
      id: 'wf_itdesk', projectId: 'p1', folderId: null, name: 'IT 服务台智能体',
      description: '员工在飞书里向 IT 助手提问，智能体先查知识库，解决不了再建 Jira 工单并把工单号回复给提问人。',
      status: 'enabled', published: true, draftChanged: false, version: 2, owner: 'u7',
      createdAt: now - 9 * DAY, updatedAt: now - 2 * DAY, tags: ['AI', 'IT'],
      trigger: trig('feishu', 'message_received', '机器人收到消息', { bot: 'IT 助手' }, { connectionId: 'c_feishu' }),
      steps: [
        n('s1', 'agent', { name: 'IT 助手智能体', config: {
          connectionId: 'c_claude', modelName: 'claude-sonnet-5', input: '{{trigger.text}}',
          instructions: '你是星河科技的 IT 服务台助手。先在知识库里找答案；找不到答案或需要人工处理时，在 Jira 的 IT 项目创建工单，并把工单号告诉提问的同事。回答保持简短。',
          tools: [
            { id: 't1', type: 'mcp', connector: 'mcpc_kb', op: 'search_pages', approval: false },
            { id: 't2', type: 'op', connector: 'jira', op: 'create_issue', connectionId: 'c_jira', approval: true },
          ],
          maxSteps: 6, tokenBudget: 20000,
          outputFields: [{ k: 'answer', t: '字符串', d: '回复内容' }, { k: 'ticket', t: '字符串', d: 'Jira 工单号，没有建单时为空' }],
        }, settings: { ...DEFAULT_ERROR_SETTINGS, strategy: 'retry-stop' } }),
        act('s2', 'feishu', 'send_message', '回复提问人', { receiveType: '用户', receiver: '{{trigger.sender}}', content: '{{s1.answer}}' }, { connectionId: 'c_feishu' }),
      ],
    },
  ];
}

const VERSION_NOTES = {
  wf_onboard: { 7: '研发分支增加 Jira 账号工单', 6: '通知改为消息卡片', 5: '增加销售分支', 3: '修复邮箱查询为空时报错', 1: '首个版本' },
  wf_offboard: { 4: '资产改为逐项标记待回收', 1: '首个版本' },
  wf_purchase: { 12: '保存订单开启失败重试', 10: '采购明细改为逐项字段映射，物料编码查映射表，去掉脚本节点', 1: '首个版本' },
  wf_ocr: { 6: '金额阈值改为读取项目配置', 5: 'AI 抽取改为 JSON 输出字段', 1: '首个版本' },
  wf_ticket: { 9: '换用更快的分类模型', 1: '首个版本' },
  wf_itdesk: { 2: '接入知识库 MCP，建工单前需要人工确认', 1: '首个版本' },
  wf_wecom_lead: { 3: '线索来源统一记为 WeCom', 1: '首个版本' },
};

const BROKEN_SINCE_OFFSET = { c_kingdee: 20 * MIN, c_sf: 2 * DAY };

const FAILURE_SPOTS = {
  wf_purchase: [{ node: 's4', http: 422, message: '提交采购订单失败：物料 M-4096 在金蝶中未审核，单据不能提交' }],
  wf_ocr: [{ node: 's1', http: 422, message: '抽取发票字段失败：模型返回的 JSON 缺少 amount 字段' }, { node: 's5', http: 504, message: '同步回调超时：报销系统 30 秒内没有响应' }],
  wf_ticket: [{ node: 's1', http: 529, message: '识别问题类别失败：模型服务繁忙（overloaded），请稍后重试' }],
  wf_onboard: [{ node: 's3', http: 422, message: '邀请加入 GitHub 组织失败：该邮箱已是组织成员' }],
  wf_offboard: [{ node: 's3', http: 404, message: '标记为待回收失败：记录 recA3 已被删除' }],
  wf_pipeline: [{ node: 's1', http: 400, message: '创建缺陷失败：Jira 项目 PLAT 要求填写「影响版本」字段' }],
  wf_pr_notify: [{ node: 's1', http: 429, message: '发送合并卡片失败：机器人发送频率超过限制' }],
  wf_notify_sub: [{ node: 's1', http: 400, message: '发送通知卡片失败：群聊不存在或机器人不在群内' }],
  wf_lead: [{ node: 's1', http: 400, message: '创建线索失败：Company 字段不能为空' }],
  wf_itdesk: [{ node: 's1', http: 529, message: 'IT 助手智能体失败：模型服务繁忙（overloaded），请稍后重试' }],
  wf_wecom_lead: [{ node: 's1', http: 400, message: '创建线索失败：Phone 字段格式不正确' }],
};

const AI_WORKFLOWS = { wf_attendance: 'claude-sonnet-5', wf_ocr: 'gpt-4.1', wf_ticket: 'claude-haiku-4-5', wf_itdesk: 'claude-sonnet-5' };

function snapshotFor(wf, v) {
  const base = { trigger: wf.trigger, steps: wf.steps };
  if (wf.id === 'wf_onboard') {
    let steps = wf.steps;
    if (v <= 6) steps = removeFromSteps(steps, 's4');
    if (v <= 5) steps = updateInSteps(steps, 's6', { op: 'send_message', config: { receiveType: '群聊', receiver: 'HR 入职服务群', content: '{{trigger.name}} 的账号已开通' } });
    if (v <= 4) steps = updateInSteps(steps, 's2', (node) => ({ branches: node.branches.filter((b) => b.id !== 'b2') }));
    return { ...base, steps };
  }
  if (wf.id === 'wf_offboard') return { ...base, steps: removeFromSteps(wf.steps, 's4') };
  if (wf.id === 'wf_ocr' && v <= 5) return { ...base, steps: updateInSteps(wf.steps, 's2', (node) => ({ branches: node.branches.map((b) => (b.id === 'b1' ? { ...b, conditions: [{ left: '{{s1.amount}}', op: '大于', right: '5000' }] } : b)) })) };
  if (wf.id === 'wf_purchase') {
    const retry = v <= 11 ? updateInSteps(wf.steps, 's3', { settings: { ...DEFAULT_ERROR_SETTINGS } }) : wf.steps;
    if (v > 9) return { ...base, steps: retry };
    const script = n('s2', 'code', { name: '整理采购明细', config: { language: 'javascript', inputs: [{ name: 'form', value: '{{s1.form}}' }], code: "export default async function main(input) {\n  const rows = input.form.find((f) => f.name === '采购明细').value;\n  return {\n    result: rows.map((r) => ({\n      FMaterialId: r.物料编码,\n      FQty: Number(r.数量),\n      FPrice: Number(r.单价),\n    })),\n  };\n}" }, settings: { ...DEFAULT_ERROR_SETTINGS } });
    const legacy = updateInSteps(retry, 's3', (node) => ({ config: { formId: node.config.formId, model: '{{s2.result}}' } }));
    return { ...base, steps: insertIntoSteps(legacy, { parent: 'root', owner: 'root', index: 1 }, script) };
  }
  return base;
}

function seedVersions(workflows) {
  return workflows.filter((wf) => wf.version > 0).flatMap((wf) => {
    const latestAt = wf.draftChanged ? wf.updatedAt - 1 * DAY : wf.test && wf.test.version > wf.version ? wf.updatedAt - 2 * DAY : wf.updatedAt;
    const span = Math.max(DAY, latestAt - wf.createdAt);
    const prod = Array.from({ length: wf.version }, (_, i) => {
      const v = wf.version - i;
      const publishedAt = v === wf.version ? latestAt : wf.createdAt + Math.round((span * (v - 1)) / wf.version) + HOUR;
      const publisher = wf.id === 'wf_onboard' && (v === 5 || v === 4) ? 'u3' : wf.owner;
      return {
        id: `v_${wf.id}_${v}`, workflowId: wf.id, version: v, publishedAt, publisher,
        note: (VERSION_NOTES[wf.id] || {})[v] || '', group: wf.projectId === 'p1' ? '生产环境' : '默认值',
        envs: wf.test && wf.test.version === v ? ['test', 'prod'] : ['prod'],
        snapshot: snapshotFor(wf, v),
      };
    });
    const extra = wf.test && wf.test.version > wf.version ? Array.from({ length: wf.test.version - wf.version }, (_, i) => {
      const v = wf.test.version - i;
      return {
        id: `v_${wf.id}_${v}`, workflowId: wf.id, version: v, publishedAt: wf.test.at, publisher: wf.test.by,
        note: (VERSION_NOTES[wf.id] || {})[v] || '', group: '测试环境', envs: ['test'],
        snapshot: { trigger: wf.trigger, steps: wf.steps },
      };
    }) : [];
    return [...extra, ...prod];
  });
}

const RUN_PLAN = {
  wf_onboard: { perDay: 4, fail: 0.06 },
  wf_offboard: { perDay: 1.5, fail: 0.05 },
  wf_purchase: { perDay: 6, fail: 0.18 },
  wf_attendance: { perDay: 1, fail: 0 },
  wf_ocr: { perDay: 9, fail: 0.08 },
  wf_birthday: { perDay: 1, fail: 0 },
  wf_ticket: { perDay: 12, fail: 0.04 },
  wf_visitor: { perDay: 3, fail: 0 },
  wf_notify_sub: { perDay: 5, fail: 0.02 },
  wf_pr_notify: { perDay: 8, fail: 0.01 },
  wf_pipeline: { perDay: 2, fail: 0.1 },
  wf_lead: { perDay: 7, fail: 0.03 },
  wf_alert: { perDay: 0.6, fail: 0 },
  wf_wecom_lead: { perDay: 4, fail: 0.02 },
  wf_itdesk: { perDay: 6, fail: 0.03 },
};

function triggerLabel(wf) {
  const c = wf.trigger.connector;
  if (c === 'schedule') return '定时触发';
  if (c === 'webhook') return 'Webhook';
  if (c === 'manual-trigger') return '手动触发';
  if (c === 'subflows') return '子流程调用';
  if (c === 'forms') return '表单提交';
  if (c === 'alert') return '告警触发';
  return '事件触发';
}

function versionAt(versions, wfId, ts, env = 'prod') {
  const list = versions.filter((v) => v.workflowId === wfId && v.publishedAt <= ts && (v.envs || ['prod']).includes(env)).sort((a, b) => b.version - a.version);
  return list.length ? list[0].version : 1;
}

function brokenNodeAt(wf, versions, connections, startedAt, now) {
  const graph = graphForRun({ kind: 'run', workflowId: wf.id, version: versionAt(versions, wf.id, startedAt) }, wf, versions);
  const nodes = allNodes({ ...wf, ...graph });
  return nodes.find((node) => {
    const offset = node.connectionId && BROKEN_SINCE_OFFSET[node.connectionId];
    return offset && startedAt >= now - offset && connections.some((c) => c.id === node.connectionId && c.status !== 'active');
  }) || null;
}

function aiUsage(wf, rand) {
  const model = AI_WORKFLOWS[wf.id];
  if (!model) return undefined;
  const input = Math.round((wf.id === 'wf_itdesk' ? 2400 : 300) + rand() * (wf.id === 'wf_itdesk' ? 5200 : 900));
  return { model, input, output: Math.round(input * (0.08 + rand() * 0.2)) };
}

function seedRuns(workflows, versions, connections, now) {
  const rand = mulberry32(20260925);
  const runs = [];
  const nextId = () => `run_${(runs.length + 1296).toString(36)}${Math.floor(rand() * 46656).toString(36)}`;
  workflows.forEach((wf) => {
    const p = RUN_PLAN[wf.id];
    if (!p) return;
    for (let day = 0; day < 30; day++) {
      const density = day < 7 ? 1 : 0.9;
      const expected = p.perDay * density;
      const count = Math.floor(expected) + (rand() < expected - Math.floor(expected) ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const startedAt = now - day * DAY - Math.floor(rand() * DAY) - 2 * MIN;
        if (startedAt < wf.createdAt) continue;
        const broken = brokenNodeAt(wf, versions, connections, startedAt, now);
        const onMainPath = broken && !findNode(wf.steps.filter((x) => x.branches), broken.id);
        const forced = broken && (onMainPath || rand() < 0.25);
        const status = forced || rand() < p.fail ? 'failed' : 'success';
        const ai = aiUsage(wf, rand);
        runs.push({
          id: nextId(), workflowId: wf.id, projectId: wf.projectId, status, startedAt, env: 'prod',
          duration: Math.round(400 + rand() * (wf.id === 'wf_attendance' ? 9000 : 3200)),
          triggerType: triggerLabel(wf), version: versionAt(versions, wf.id, startedAt), kind: 'run', errors: status === 'failed' ? 1 : 0,
          ...(forced ? { failedNodeId: broken.id } : {}),
          ...(ai ? { ai } : {}),
        });
      }
    }
  });
  const TEST_PLAN = { wf_ocr: { count: 12, span: 38 * MIN }, wf_onboard: { count: 3, span: 3 * HOUR }, wf_purchase: { count: 5, span: 3 * DAY } };
  workflows.filter((wf) => wf.test && TEST_PLAN[wf.id]).forEach((wf) => {
    const plan = TEST_PLAN[wf.id];
    for (let i = 0; i < plan.count; i++) {
      const startedAt = now - Math.round(((i + 0.5) / plan.count) * plan.span);
      const ai = aiUsage(wf, rand);
      runs.push({
        id: nextId(), workflowId: wf.id, projectId: wf.projectId, status: 'success', startedAt, env: 'test',
        duration: Math.round(400 + rand() * 2800), triggerType: triggerLabel(wf), version: wf.test.version, kind: 'run', errors: 0,
        ...(ai ? { ai } : {}),
      });
    }
  });
  const DEDUPE_PLAN = { wf_onboard: 3, wf_purchase: 2, wf_wecom_lead: 1 };
  Object.entries(DEDUPE_PLAN).forEach(([wid, count]) => {
    const originals = runs.filter((r) => r.workflowId === wid && r.status === 'success' && r.env === 'prod' && r.startedAt > now - 6 * DAY).slice(0, count);
    originals.forEach((orig, i) => {
      const wf = workflows.find((w) => w.id === wid);
      runs.push({
        id: nextId(), workflowId: wid, projectId: wf.projectId, status: 'deduped', startedAt: orig.startedAt + (3 + i * 7) * MIN, env: 'prod',
        duration: 12 + Math.round(rand() * 20), triggerType: triggerLabel(wf), version: orig.version, kind: 'run', errors: 0,
        dedupeOf: orig.id, dedupeKey: { wf_onboard: 'XH20260918', wf_purchase: '7A1C3F2E-88B1-4E0A', wf_wecom_lead: 'wmJ8Kd2x' }[wid],
      });
    });
  });
  const fixed = [
    { id: 'run_retry01', workflowId: 'wf_purchase', projectId: 'p1', status: 'failed', startedAt: now - 5 * MIN, duration: 1180, triggerType: '手动重试', retryBy: 'u7', retryOf: 'run_fail01', startNodeId: 's3', version: 12, kind: 'run', errors: 1, failedNodeId: 's3' },
    { id: 'run_agent_wait01', workflowId: 'wf_itdesk', projectId: 'p1', status: 'waiting', startedAt: now - 12 * MIN, duration: null, triggerType: '事件触发', version: 2, kind: 'run', errors: 0, ai: { model: 'claude-sonnet-5', input: 3120, output: 410 },
      pendingApproval: { nodeId: 's1', tool: 'jira.create_issue', toolName: '创建问题', input: { project: 'IT', issueType: '硬件报修', summary: '3 楼 301 会议室投影仪无法投屏' }, requestedAt: now - 11 * MIN, approvers: ['u7', 'u1'], reason: '知识库里没有找到投影仪故障的处理办法，需要建工单' } },
    { id: 'run_dbg01', workflowId: 'wf_onboard', projectId: 'p1', status: 'success', startedAt: now - 2 * HOUR - 10 * MIN, duration: 1830, triggerType: '调试', version: 7, kind: 'debug', errors: 0 },
    { id: 'run_live01', workflowId: 'wf_ticket', projectId: 'p1', status: 'running', startedAt: now - 8 * 1000, duration: null, triggerType: '事件触发', version: 9, kind: 'run', errors: 0 },
    { id: 'run_wait01', workflowId: 'wf_purchase', projectId: 'p1', status: 'waiting', startedAt: now - 42 * MIN, duration: null, triggerType: '事件触发', version: 12, kind: 'run', errors: 0 },
    { id: 'run_fail01', workflowId: 'wf_purchase', projectId: 'p1', status: 'failed', startedAt: now - 17 * MIN, duration: 3120, triggerType: '事件触发', version: 12, kind: 'run', errors: 1, failedNodeId: 's3' },
    { id: 'run_stop01', workflowId: 'wf_ocr', projectId: 'p1', status: 'stopped', startedAt: now - 3 * HOUR, duration: 61000, triggerType: 'Webhook', version: 5, kind: 'run', errors: 0, stoppedBy: 'u4' },
    { id: 'run_to01', workflowId: 'wf_attendance', projectId: 'p1', status: 'timeout', startedAt: now - 2 * DAY - 3 * HOUR, duration: 600000, triggerType: '定时触发', version: 3, kind: 'run', errors: 1 },
  ];
  return [...runs, ...fixed].sort((a, b) => b.startedAt - a.startedAt);
}

function withFailures(runs, workflows, versions, connections, now) {
  return runs.map((run) => {
    if (!['failed', 'timeout'].includes(run.status)) return run;
    const wf = workflows.find((w) => w.id === run.workflowId);
    if (!wf) return run;
    const graph = graphForRun(run, wf, versions);
    const rand = mulberry32(hashString(`${run.id}-fail`));
    const nodes = allNodes({ ...wf, ...graph }).filter((node) => node.kind !== 'trigger' && !['branch', 'parallel', 'loop', 'end'].includes(node.kind));
    if (!nodes.length) return run;
    const spots = (FAILURE_SPOTS[wf.id] || []).filter((x) => nodes.some((n) => n.id === x.node));
    const spot = !run.failedNodeId && spots.length ? spots[Math.floor(rand() * spots.length)] : null;
    const preset = (run.failedNodeId && nodes.find((node) => node.id === run.failedNodeId)) || (spot && nodes.find((node) => node.id === spot.node));
    const node = preset || nodes[Math.floor(rand() * nodes.length)];
    const conn = node.connectionId && connections.find((c) => c.id === node.connectionId);
    const brokenAt = conn && BROKEN_SINCE_OFFSET[conn.id] ? now - BROKEN_SINCE_OFFSET[conn.id] : Infinity;
    let failure;
    if (run.status === 'timeout') failure = { code: 'STEP_TIMEOUT', message: '节点执行超过 600 秒，已被终止', http_status: null, attempts: 1 };
    else if (conn && conn.status !== 'active' && run.startedAt >= brokenAt) failure = { code: 'CONNECTION_AUTH_FAILED', message: conn.error || '连接不可用，请重新授权', http_status: 401, attempts: 3, connectionId: conn.id };
    else if (spot) failure = { code: 'UPSTREAM_ERROR', message: spot.message, http_status: spot.http, attempts: spot.http === 529 || spot.http === 429 ? 3 : 1 };
    else failure = { code: 'UPSTREAM_ERROR', message: `${node.name} 调用失败：上游返回 422 Unprocessable Entity`, http_status: 422, attempts: 1 };
    return { ...run, failedNodeId: node.id, failure };
  });
}

function seedState() {
  const now = Date.now();
  const todayBackup = new Date(now).setHours(2, 0, 0, 0);
  const lastBackupAt = todayBackup + 4 * MIN > now ? todayBackup - DAY : todayBackup;
  const workflows = seedWorkflows(now).map((wf) => withRefs(wf));
  const versions = seedVersions(workflows);
  const connections = [
    { id: 'c_feishu', name: '飞书 · 星河科技企业自建应用', connector: 'feishu', authType: 'oauth2', scope: 'tenant', projectIds: [], status: 'active', owner: 'u1', shares: [{ userId: 'u2', perm: 'use' }, { userId: 'u4', perm: 'use' }, { userId: 'u3', perm: 'edit' }, { userId: 'u7', perm: 'use' }, { userId: 'u8', perm: 'use' }], account: 'cli_a5f3e8b2c1（星河集成助手）', createdAt: now - 118 * DAY, updatedAt: now - 7 * DAY },
    { id: 'c_beisen', name: '北森 iTalent 生产环境', connector: 'beisen', authType: 'apikey', scope: 'project', projectIds: ['p1'], status: 'active', owner: 'u2', shares: [{ userId: 'u1', perm: 'edit' }, { userId: 'u10', perm: 'use' }], account: 'tenant-80321', createdAt: now - 95 * DAY, updatedAt: now - 30 * DAY },
    { id: 'c_kingdee', name: '金蝶云星空 · 正式账套', connector: 'kingdee', authType: 'custom', scope: 'project', projectIds: ['p1'], status: 'error', owner: 'u4', shares: [{ userId: 'u1', perm: 'edit' }, { userId: 'u12', perm: 'use' }], account: '账套 100231 · kd_api', createdAt: now - 88 * DAY, updatedAt: now - 17 * MIN, error: '登录失败：用户密码已过期，请重新授权' },
    { id: 'c_github', name: 'GitHub · xinghe 组织', connector: 'github', authType: 'oauth2', scope: 'tenant', projectIds: [], status: 'active', owner: 'u5', shares: [{ userId: 'u1', perm: 'use' }, { userId: 'u9', perm: 'use' }], account: '@xinghe-bot', createdAt: now - 80 * DAY, updatedAt: now - 12 * DAY },
    { id: 'c_gitlab', name: 'GitLab 自建实例', connector: 'gitlab', authType: 'apikey', scope: 'project', projectIds: ['p2'], status: 'active', owner: 'u5', shares: [{ userId: 'u1', perm: 'use' }, { userId: 'u9', perm: 'use' }], account: 'gitlab.xinghe.tech · ci-bot', createdAt: now - 25 * DAY, updatedAt: now - 25 * DAY },
    { id: 'c_jira', name: 'Jira Cloud', connector: 'jira', authType: 'basic', scope: 'project', projectIds: ['p1', 'p2'], status: 'active', owner: 'u7', shares: [{ userId: 'u1', perm: 'use' }, { userId: 'u9', perm: 'use' }], account: 'it-bot@xinghe.tech', createdAt: now - 70 * DAY, updatedAt: now - 20 * DAY },
    { id: 'c_sf', name: 'Salesforce 生产组织', connector: 'salesforce', authType: 'oauth2', scope: 'project', projectIds: ['p1', 'p3'], status: 'expired', owner: 'u6', shares: [{ userId: 'u1', perm: 'use' }], account: 'sunyue@xinghe.tech', createdAt: now - 60 * DAY, updatedAt: now - 2 * DAY, error: 'Refresh token 已失效，需要所有者重新授权' },
    { id: 'c_mysql', name: '考勤库（只读）', connector: 'mysql', authType: 'custom', scope: 'project', projectIds: ['p1'], status: 'active', owner: 'u3', shares: [{ userId: 'u1', perm: 'edit' }, { userId: 'u2', perm: 'use' }], account: 'readonly@10.2.3.14:3306/hr_attendance', createdAt: now - 21 * DAY, updatedAt: now - 21 * DAY },
    { id: 'c_openai', name: 'OpenAI 公司账号', connector: 'openai', authType: 'apikey', scope: 'tenant', projectIds: [], status: 'active', owner: 'u1', shares: [{ userId: 'u4', perm: 'use' }], account: 'sk-…9f2a', createdAt: now - 50 * DAY, updatedAt: now - 50 * DAY },
    { id: 'c_claude', name: 'Claude 公司账号', connector: 'claude', authType: 'apikey', scope: 'tenant', projectIds: [], status: 'active', owner: 'u1', shares: [{ userId: 'u2', perm: 'use' }, { userId: 'u7', perm: 'use' }], account: 'sk-ant-…4d1c', createdAt: now - 45 * DAY, updatedAt: now - 45 * DAY },
    { id: 'c_kingdee_test', name: '金蝶云星空 · 测试账套', connector: 'kingdee', authType: 'custom', scope: 'project', projectIds: ['p1'], status: 'active', owner: 'u4', shares: [{ userId: 'u1', perm: 'edit' }, { userId: 'u12', perm: 'use' }], account: '账套 900001 · kd_api_test', createdAt: now - 40 * DAY, updatedAt: now - 10 * DAY },
    { id: 'c_wecom', name: '企业微信 · 销售助手应用', connector: 'wecom', authType: 'apikey', scope: 'project', projectIds: ['p3'], status: 'active', owner: 'u6', shares: [{ userId: 'u1', perm: 'use' }], account: 'corp ww8a2c · 应用 1000012', createdAt: now - 26 * DAY, updatedAt: now - 26 * DAY },
    { id: 'c_oa', name: '泛微 OA 生产环境', connector: 'cc_oa', authType: 'apikey', scope: 'tenant', projectIds: [], status: 'active', owner: 'u3', shares: [{ userId: 'u1', perm: 'use' }], account: 'X-Api-Token · oa-integration', createdAt: now - 60 * DAY, updatedAt: now - 4 * DAY },
  ];
  const runs = withBizKeys(withFailures(seedRuns(workflows, versions, connections, now), workflows, versions, connections, now), workflows);
  return {
    version: 7,
    anchorAt: now,
    theme: 'light',
    me: 'u1',
    currentProjectId: 'p1',
    tenant: {
      name: '星河科技',
      appearance: { productName: '星河集成平台', primaryColor: null, welcome: '用自动化连接每一个业务系统', logo: null },
      domain: 'ipaas.xinghe.tech',
    },
    projects: [
      { id: 'p1', name: '人事行政', color: '#8142E3', description: '入转调离、审批、行政通知相关的集成', createdAt: now - 120 * DAY, owner: 'u1', limits: { workflows: 100, runsPerMonth: 200000 }, envMode: 'staged' },
      { id: 'p2', name: '研发效能', color: '#2563EB', description: '代码协作、CI/CD、缺陷流转', createdAt: now - 80 * DAY, owner: 'u5', limits: { workflows: 50, runsPerMonth: 100000 }, envMode: 'single' },
      { id: 'p3', name: '销售运营', color: '#059669', description: '线索、商机与合同', createdAt: now - 60 * DAY, owner: 'u6', limits: { workflows: 50, runsPerMonth: 100000 }, envMode: 'single' },
      { id: 'p4', name: '财务共享', color: '#D97706', description: '费控、应收应付与凭证', createdAt: now - 20 * DAY, owner: 'u12', limits: { workflows: 30, runsPerMonth: 50000 }, envMode: 'single' },
    ],
    members: [
      { projectId: 'p1', userId: 'u1', role: 'owner', joinedAt: now - 120 * DAY },
      { projectId: 'p1', userId: 'u2', role: 'editor', joinedAt: now - 100 * DAY },
      { projectId: 'p1', userId: 'u4', role: 'editor', joinedAt: now - 90 * DAY },
      { projectId: 'p1', userId: 'u7', role: 'editor', joinedAt: now - 60 * DAY },
      { projectId: 'p1', userId: 'u8', role: 'editor', joinedAt: now - 70 * DAY },
      { projectId: 'p1', userId: 'u10', role: 'editor', joinedAt: now - 33 * DAY },
      { projectId: 'p1', userId: 'u12', role: 'editor', joinedAt: now - 14 * DAY },
      { projectId: 'p1', userId: 'u11', role: 'viewer', joinedAt: now - 3 * DAY },
      { projectId: 'p2', userId: 'u5', role: 'owner', joinedAt: now - 80 * DAY },
      { projectId: 'p2', userId: 'u1', role: 'editor', joinedAt: now - 80 * DAY },
      { projectId: 'p2', userId: 'u9', role: 'editor', joinedAt: now - 40 * DAY },
      { projectId: 'p3', userId: 'u6', role: 'owner', joinedAt: now - 60 * DAY },
      { projectId: 'p3', userId: 'u1', role: 'editor', joinedAt: now - 60 * DAY },
      { projectId: 'p4', userId: 'u12', role: 'owner', joinedAt: now - 20 * DAY },
      { projectId: 'p4', userId: 'u1', role: 'viewer', joinedAt: now - 20 * DAY },
    ],
    users: PEOPLE.map((p, i) => ({
      ...p,
      role: i === 0 ? 'owner' : ['u5', 'u7'].includes(p.id) ? 'admin' : 'member',
      status: p.id === 'u11' ? 'invited' : p.id === 'u9' ? 'disabled' : 'active',
      external: p.id === 'u11',
      modules: i === 0 ? ['integration', 'connector', 'mcp', 'admin'] : ['u3', 'u7'].includes(p.id) ? ['integration', 'connector', 'mcp'] : ['u5', 'u8'].includes(p.id) ? ['integration', 'connector'] : ['integration'],
      lastActiveAt: p.id === 'u11' ? null : now - Math.round((i * 7 + 1) * HOUR),
      createdAt: now - (130 - i * 8) * DAY,
    })),
    folders: [
      { id: 'f_lifecycle', projectId: 'p1', parentId: null, name: '入转调离' },
      { id: 'f_finance', projectId: 'p1', parentId: null, name: '审批与财务' },
      { id: 'f_notice', projectId: 'p1', parentId: null, name: '日常通知' },
      { id: 'f_shared', projectId: 'p1', parentId: null, name: '公共与运维' },
    ],
    workflows,
    runs,
    versions,
    connections,
    templates: [
      { id: 't1', name: '审批通过后发送飞书通知', category: '审批', uses: 12840, featured: true, createdAt: now - 200 * DAY, desc: '任意飞书审批通过后，把结果以消息卡片推送给申请人或指定群。', trigger: { connector: 'feishu', op: 'approval_approved' }, steps: [{ connector: 'feishu', op: 'get_approval' }, { connector: 'feishu', op: 'send_card' }] },
      { id: 't2', name: '新员工入职一键开通账号', category: '人力资源', uses: 6320, featured: true, createdAt: now - 150 * DAY, desc: '从北森读取入职信息，按部门在各系统中开通账号并通知 HR。', trigger: { connector: 'beisen', op: 'onboarding_completed' }, steps: [{ connector: 'feishu', op: 'get_user' }, { connector: 'github', op: 'create_issue' }, { connector: 'jira', op: 'create_issue' }] },
      { id: 't3', name: 'GitHub PR 合并通知到群', category: '研发', uses: 9120, featured: true, createdAt: now - 170 * DAY, desc: 'PR 合并后把提交信息、作者和变更文件推送到研发群。', trigger: { connector: 'github', op: 'pr_merged' }, steps: [{ connector: 'feishu', op: 'send_card' }] },
      { id: 't4', name: '多维表格新增记录时同步到 MySQL', category: '数据同步', uses: 4410, createdAt: now - 90 * DAY, desc: '多维表格有新记录时写入 MySQL 表，保持两边一致。', trigger: { connector: 'feishu', op: 'bitable_record_changed' }, steps: [{ connector: 'mysql', op: 'insert_row' }] },
      { id: 't5', name: '每日销售数据日报', category: '通知提醒', uses: 3820, createdAt: now - 60 * DAY, desc: '每天定时汇总商机数据并生成日报卡片。', trigger: { connector: 'schedule', op: 'every' }, steps: [{ connector: 'salesforce', op: 'soql_query' }, { connector: 'feishu', op: 'send_card' }] },
      { id: 't6', name: '用 AI 自动分类工单', category: 'AI', uses: 2760, featured: true, createdAt: now - 20 * DAY, desc: '新工单进入时由 Claude 判断优先级和类别，自动分派给对应小组。', trigger: { connector: 'zendesk', op: 'ticket_created' }, steps: [{ connector: 'claude', op: 'classify' }, { connector: 'zendesk', op: 'update_ticket' }] },
      { id: 't7', name: 'Shopify 新订单写入多维表格', category: '电商', uses: 2210, createdAt: now - 110 * DAY, desc: '新订单实时写入多维表格，方便运营跟进。', trigger: { connector: 'shopify', op: 'order_created' }, steps: [{ connector: 'feishu', op: 'bitable_create_record' }] },
      { id: 't8', name: '合同到期提醒', category: '通知提醒', uses: 1980, createdAt: now - 45 * DAY, desc: '每周检查即将到期的合同并提醒负责人。', trigger: { connector: 'schedule', op: 'every' }, steps: [{ connector: 'feishu', op: 'bitable_search_record' }, { connector: 'feishu', op: 'send_message' }] },
      { id: 't9', name: '报销票据 AI 识别入账', category: 'AI', uses: 1760, createdAt: now - 12 * DAY, desc: '接收票据图片，AI 抽取发票要素后写入报销台账。', trigger: { connector: 'webhook', op: 'catch_sync' }, steps: [{ connector: 'openai', op: 'extract' }, { connector: 'feishu', op: 'bitable_create_record' }, { connector: 'webhook', op: 'respond' }] },
      { id: 't10', name: '钉钉审批结束同步到金蝶', category: '审批', uses: 1320, createdAt: now - 75 * DAY, desc: '钉钉费用审批结束后在金蝶生成付款单。', trigger: { connector: 'dingtalk', op: 'approval_finished' }, steps: [{ connector: 'kingdee', op: 'save_bill' }, { connector: 'kingdee', op: 'submit_bill' }] },
      { id: 't11', name: '流水线失败自动建缺陷', category: '研发', uses: 1210, createdAt: now - 30 * DAY, desc: 'GitLab 流水线失败时在 Jira 创建缺陷并指派给提交人。', trigger: { connector: 'gitlab', op: 'pipeline_failed' }, steps: [{ connector: 'jira', op: 'create_issue' }] },
      { id: 't13', name: '钉钉审批通过后通知企业微信群', category: '审批', uses: 860, createdAt: now - 6 * DAY, desc: '钉钉审批结束后，把结果推送到企业微信群机器人，适合两套 IM 并存的公司。', trigger: { connector: 'dingtalk', op: 'approval_finished' }, steps: [{ connector: 'wecom', op: 'robot_message' }] },
      { id: 't14', name: 'Slack 消息一键建 Jira 工单', category: '研发', uses: 1540, createdAt: now - 16 * DAY, desc: '在 Slack 频道里提到机器人，自动在 Jira 建工单并回帖工单链接。', trigger: { connector: 'slack', op: 'new_message' }, steps: [{ connector: 'jira', op: 'create_issue' }, { connector: 'slack', op: 'send_message' }] },
      { id: 't15', name: '知识库问答智能体', category: 'AI', uses: 690, createdAt: now - 2 * DAY, featured: true, desc: '员工提问时，智能体先查知识库 MCP，找不到答案再建工单，建单前需要人工确认。', trigger: { connector: 'feishu', op: 'message_received' }, steps: [{ connector: 'claude', op: 'message' }, { connector: 'jira', op: 'create_issue' }] },
      { id: 't12', name: '企业微信新客户录入 CRM', category: '客户管理', uses: 980, createdAt: now - 8 * DAY, desc: '销售添加外部联系人后自动在销售易建客户。', trigger: { connector: 'wecom', op: 'external_contact_added' }, steps: [{ connector: 'xiaoshouyi', op: 'create_account' }] },
    ],
    customConnectors: [
      {
        id: 'cc_oa', key: 'custom_oa', name: '泛微 OA（内部）', description: '对接公司内部泛微 e-cology 的流程与人员接口', iconColor: '#0EA5E9', iconText: '泛',
        status: 'published', version: '1.2.0', visibility: 'tenant', owner: 'u3', developers: ['u3', 'u7'], updatedAt: now - 4 * DAY, createdAt: now - 70 * DAY, helpUrl: 'https://xinghe.feishu.cn/wiki/oa-connector',
        baseUrl: 'https://oa.xinghe.tech/api', auth: { type: 'apikey', name: '泛微 OA API Key', status: 'published', enabled: true, tests: { flow: true, api: true }, location: 'header', keyName: 'X-Api-Token' },
        i18n: { en: 'OA (internal)' }, listing: 'none',
        actions: [
          { id: 'a1', key: 'create_workflow', name: '发起流程', method: 'POST', path: '/workflow/create', desc: '以指定人员身份发起 OA 流程', group: '流程',
            params: [
              { key: 'workflowId', label: '流程 ID', type: 'string', control: '下拉单选', required: true, source: 'HTTP 接口', options: ['1001 · 请假申请', '1002 · 采购申请', '1003 · 用印申请'] },
              { key: 'creator', label: '发起人工号', type: 'string', control: '输入框', required: true, source: '输入值' },
              { key: 'formData', label: '表单数据', type: 'object', control: '代码', required: true, source: '输入值' },
              { key: 'urgent', label: '是否紧急', type: 'boolean', control: '开关', required: false, source: '输入值' },
            ],
            sample: { code: 0, data: { requestId: 88213, status: '审批中', currentNode: '部门负责人' } } },
          { id: 'a2', key: 'get_workflow', name: '查询流程状态', method: 'GET', path: '/workflow/{requestId}', desc: '按请求 ID 查询流程当前节点', group: '流程',
            params: [{ key: 'requestId', label: '请求 ID', type: 'string', control: '输入框', required: true, source: '输入值' }],
            sample: { code: 0, data: { requestId: 88213, status: '审批中', currentNode: '财务复核', operators: ['赵敏'] } } },
          { id: 'a3', key: 'get_user', name: '查询人员', method: 'GET', path: '/hrm/user', desc: '按工号查询人员', group: '人员',
            params: [{ key: 'workcode', label: '工号', type: 'string', control: '输入框', required: true, source: '输入值' }],
            sample: { code: 0, data: { workcode: 'XH20210311', name: '许诺', department: '销售运营部', status: '在职' } } },
        ],
        triggers: [{ id: 'tr1', key: 'workflow_done', name: '流程归档', type: 'webhook', desc: 'OA 流程归档时回调' }],
        versions: [
          { version: '1.2.0', status: 'released', publishedAt: now - 4 * DAY, publisher: 'u3', note: '新增「查询人员」操作', snapshot: ['create_workflow', 'get_workflow', 'get_user'] },
          { version: '1.1.0', status: 'released', publishedAt: now - 30 * DAY, publisher: 'u3', note: '支持流程归档回调', snapshot: ['create_workflow', 'get_workflow'] },
          { version: '1.0.0', status: 'deprecated', publishedAt: now - 70 * DAY, publisher: 'u7', note: '首个版本', snapshot: ['create_workflow'] },
        ],
      },
      {
        id: 'cc_mes', key: 'custom_mes', name: 'MES 生产系统', description: '工单、报工与设备状态', iconColor: '#16A34A', iconText: 'M',
        status: 'draft', version: '0.1.0', visibility: 'project', owner: 'u1', developers: ['u1'], updatedAt: now - 3 * HOUR, createdAt: now - 2 * DAY, helpUrl: '',
        baseUrl: 'https://mes.xinghe.tech/openapi/v2', auth: { type: 'client', name: 'MES 客户端凭证', status: 'draft', enabled: true, tests: { flow: false, api: false }, tokenUrl: 'https://mes.xinghe.tech/oauth/token' },
        i18n: {}, listing: 'none',
        actions: [{ id: 'a1', key: 'list_orders', name: '查询生产工单', method: 'GET', path: '/orders', desc: '分页查询生产工单', group: '工单',
          params: [{ key: 'status', label: '工单状态', type: 'string', control: '下拉单选', required: false, source: '输入值', options: ['待生产', '生产中', '已完工'] }, { key: 'page', label: '页码', type: 'number', control: '输入框', required: false, source: '输入值' }],
          sample: { total: 128, items: [{ orderNo: 'MO-2026-0918', product: '主板 A3', qty: 500, status: '生产中' }] } }],
        triggers: [],
        versions: [],
      },
      {
        id: 'cc_sms', key: 'custom_sms', name: '短信网关', description: '公司统一短信通道', iconColor: '#E11D48', iconText: '短',
        status: 'published', version: '2.0.1', visibility: 'tenant', owner: 'u7', developers: ['u7'], updatedAt: now - 40 * DAY, createdAt: now - 150 * DAY, helpUrl: '',
        baseUrl: 'https://sms.xinghe.tech', auth: { type: 'basic', name: '短信网关账号', status: 'published', enabled: true, tests: { flow: true, api: true } },
        i18n: {}, listing: 'none',
        actions: [{ id: 'a1', key: 'send', name: '发送短信', method: 'POST', path: '/v2/send', desc: '按模板发送短信', group: '短信',
          params: [{ key: 'phone', label: '手机号', type: 'string', control: '输入框', required: true, source: '输入值' }, { key: 'templateId', label: '短信模板', type: 'string', control: '下拉单选', required: true, source: 'HTTP 接口', options: ['SMS_001 · 验证码', 'SMS_002 · 审批提醒', 'SMS_003 · 到期提醒'] }, { key: 'vars', label: '模板变量', type: 'object', control: '代码', required: false, source: '输入值' }],
          sample: { code: 0, msgId: 'sms_20260925_8812', fee: 1 } }],
        triggers: [],
        versions: [
          { version: '2.0.1', status: 'released', publishedAt: now - 40 * DAY, publisher: 'u7', note: '修复签名', snapshot: ['send'] },
          { version: '2.0.0', status: 'released', publishedAt: now - 60 * DAY, publisher: 'u7', note: '切换到 v2 接口', snapshot: ['send'] },
        ],
      },
    ],
    configGroups: [
      { id: 'g_test', projectId: 'p1', key: 'test', name: '测试环境', description: '联调用的沙箱账套与测试群', connectionMap: { c_kingdee: 'c_kingdee_test' }, requireApproval: false, approvers: [] },
      { id: 'g_prod', projectId: 'p1', key: 'prod', name: '生产环境', description: '正式账套与正式群', connectionMap: {}, requireApproval: true, approvers: ['u1'] },
    ],
    variables: [
      { id: 'v1', projectId: 'p1', key: 'hr_group_chat_id', type: 'string', description: 'HR 入职服务群的 chat_id', values: { default: 'oc_5e2c8a91d0b4f7', g_test: 'oc_test_7a1c02', g_prod: 'oc_5e2c8a91d0b4f7' }, updatedAt: now - 20 * DAY, updatedBy: 'u2' },
      { id: 'v2', projectId: 'p1', key: 'kingdee_acct_id', type: 'string', description: '金蝶账套 ID', values: { default: '100231', g_test: '900001', g_prod: '100231' }, updatedAt: now - 60 * DAY, updatedBy: 'u4' },
      { id: 'v3', projectId: 'p1', key: 'large_amount_threshold', type: 'number', description: '大额报销复核阈值（元）', values: { default: '5000', g_test: '10', g_prod: '5000' }, updatedAt: now - 10 * DAY, updatedBy: 'u12' },
      { id: 'v4', projectId: 'p1', key: 'notify_on_success', type: 'boolean', description: '成功时是否也发送通知', values: { default: 'false', g_test: 'true', g_prod: 'false' }, updatedAt: now - 8 * DAY, updatedBy: 'u1' },
      { id: 'v5', projectId: 'p1', key: 'it_assignees', type: 'object', description: 'IT 工单分派规则', values: { default: '{ "硬件": "李航", "账号权限": "王磊" }', g_test: '{ "硬件": "林晓", "账号权限": "林晓" }', g_prod: '{ "硬件": "李航", "账号权限": "王磊" }' }, updatedAt: now - 5 * DAY, updatedBy: 'u7' },
      { id: 'v6', projectId: 'p1', key: 'kingdee_connection', type: 'connection', description: '金蝶连接', values: { default: 'c_kingdee', g_test: 'c_kingdee', g_prod: 'c_kingdee' }, updatedAt: now - 60 * DAY, updatedBy: 'u4' },
      { id: 'v7', projectId: 'p1', key: 'reimburse_webhook', type: 'webhook', description: '报销系统回调地址', values: { default: 'https://reimburse.xinghe.tech/callback', g_test: 'https://reimburse-test.xinghe.tech/callback', g_prod: 'https://reimburse.xinghe.tech/callback' }, updatedAt: now - 18 * DAY, updatedBy: 'u4' },
    ],
    storages: [
      { id: 'ds1', projectId: 'p1', name: '入职开通去重', description: '记录已处理的员工工号，避免重复开通', ttlDays: 30, createdAt: now - 60 * DAY, owner: 'u1',
        records: [
          { key: 'XH20260918', value: '{"status":"done","at":"2026-09-22 09:12"}', updatedAt: now - 3 * DAY, expiresAt: now + 27 * DAY },
          { key: 'XH20260911', value: '{"status":"done","at":"2026-09-15 09:08"}', updatedAt: now - 10 * DAY, expiresAt: now + 20 * DAY },
          { key: 'XH20260904', value: '{"status":"done","at":"2026-09-08 09:21"}', updatedAt: now - 17 * DAY, expiresAt: now + 13 * DAY },
          { key: 'XH20260828', value: '{"status":"failed","reason":"GitHub 422"}', updatedAt: now - 24 * DAY, expiresAt: now + 6 * DAY },
        ] },
      { id: 'ds2', projectId: 'p1', name: '考勤游标', description: '上次同步到的考勤记录 ID', ttlDays: 365, createdAt: now - 21 * DAY, owner: 'u2',
        records: [{ key: 'last_exception_id', value: '88213', updatedAt: now - 1 * DAY, expiresAt: now + 364 * DAY }] },
      { id: 'ds3', projectId: 'p1', name: '工单会话', description: '机器人会话上下文', ttlDays: 1, createdAt: now - 48 * DAY, owner: 'u7',
        records: [
          { key: 'ou_52aa81c0f9', value: '{"category":"硬件","issue":"IT-3317"}', updatedAt: now - 20 * MIN, expiresAt: now + 23 * HOUR },
          { key: 'ou_7d8a6fd1e2', value: '{"category":"账号权限","issue":"IT-3309"}', updatedAt: now - 5 * HOUR, expiresAt: now + 19 * HOUR },
        ] },
    ],
    mcpServices: [
      { id: 'mcp_hr', name: '人事助手工具集', key: 'hr-toolkit', description: '让 AI 助手查询员工信息、查询审批进度、往 HR 群发送通知', type: 'custom', status: 'enabled', owner: 'u1', createdAt: now - 25 * DAY, updatedAt: now - 2 * DAY, credentialMode: 'developer', fixedConnections: { beisen: 'c_beisen', feishu: 'c_feishu' }, scope: 'part', scopeTargets: ['人力资源部', '信息技术部'], calls7d: 1832, apiKey: 'mcp_sk_9Xv2hQ4mTk7Lf',
        tools: [
          { id: 'tl1', name: 'get_employee', title: '查询员工信息', description: '按工号查询员工档案，包括部门、岗位和入职日期', source: { type: 'connector', connector: 'beisen', op: 'get_employee' }, params: [{ name: 'employeeId', desc: '工号', mode: 'ai', hint: '6 位以上工号，例如 XH20210311' }] },
          { id: 'tl2', name: 'get_approval_status', title: '查询审批进度', description: '按审批实例 Code 查询审批当前节点和审批人', source: { type: 'connector', connector: 'feishu', op: 'get_approval' }, params: [{ name: 'instanceCode', desc: '审批实例 Code', mode: 'ai' }] },
          { id: 'tl3', name: 'send_group_notice', title: '发送群通知', description: '通过公共子流程往指定飞书群发送一条通知卡片', source: { type: 'workflow', workflowId: 'wf_notify_sub' }, params: [{ name: 'chat', desc: '群名称', mode: 'ai' }, { name: 'title', desc: '标题', mode: 'ai' }, { name: 'content', desc: '正文', mode: 'ai' }] },
        ],
        releases: [{ version: '1.2', publishedAt: now - 2 * DAY, publisher: 'u1', note: '新增发送群通知工具' }, { version: '1.1', publishedAt: now - 15 * DAY, publisher: 'u1', note: '查询员工信息支持按工号' }, { version: '1.0', publishedAt: now - 25 * DAY, publisher: 'u1', note: '首个版本' }] },
      { id: 'mcp_it', name: 'IT 服务台', key: 'it-desk', description: '创建和查询 IT 工单', type: 'custom', status: 'draft', owner: 'u7', createdAt: now - 3 * DAY, updatedAt: now - 3 * HOUR, credentialMode: 'user', fixedConnections: {}, scope: 'all', scopeTargets: [], calls7d: 0, apiKey: 'mcp_sk_2bQ8nV5rWc3Hp',
        tools: [{ id: 'tl1', name: 'create_ticket', title: '创建 IT 工单', description: '在 Jira 的 IT 项目中创建工单，用于报修和权限申请', source: { type: 'connector', connector: 'jira', op: 'create_issue' }, params: [{ name: 'project', desc: '项目', mode: 'fixed', value: 'IT' }, { name: 'issueType', desc: '问题类型', mode: 'ai', hint: '硬件报修或权限申请' }, { name: 'summary', desc: '概要', mode: 'ai' }] }],
        releases: [] },
      { id: 'mcp_feishu', name: '飞书官方 MCP', key: 'feishu-official', description: '消息、日历、多维表格等常用飞书能力', type: 'official', status: 'enabled', owner: null, createdAt: now - 90 * DAY, updatedAt: now - 9 * DAY, credentialMode: 'user', fixedConnections: {}, scope: 'all', scopeTargets: [], calls7d: 5410, obtained: true, apiKey: 'mcp_sk_7fKd1Qs9Zu4Rn',
        tools: [
          { id: 'tl1', name: 'send_message', title: '发送消息', description: '以机器人身份向用户或群发送文本消息', source: { type: 'connector', connector: 'feishu', op: 'send_message' }, params: [{ name: 'receiveType', desc: '接收者类型', mode: 'ai' }, { name: 'receiver', desc: '接收者', mode: 'ai' }, { name: 'content', desc: '消息内容', mode: 'ai' }] },
          { id: 'tl2', name: 'search_records', title: '查询多维表格', description: '按筛选条件查询多维表格记录，最多返回 500 条', source: { type: 'connector', connector: 'feishu', op: 'bitable_search_record' }, params: [{ name: 'app', desc: '多维表格', mode: 'ai' }, { name: 'table', desc: '数据表', mode: 'ai' }, { name: 'filter', desc: '筛选条件', mode: 'ai' }] },
        ],
        releases: [{ version: '2.3', publishedAt: now - 9 * DAY, publisher: null, note: '官方发布' }] },
    ],
    permissionRequests: [
      { id: 'pr1', userId: 'u10', module: 'connector', reason: '需要为北森招聘模块开发一个自定义连接器', time: now - 5 * HOUR, status: 'pending' },
      { id: 'pr2', userId: 'u6', module: 'mcp', reason: '想把销售易查询能力开放给销售 AI 助手', time: now - 1 * DAY, status: 'pending' },
      { id: 'pr3', userId: 'u8', module: 'connector', reason: '行政系统需要一个内部连接器', time: now - 6 * DAY, status: 'approved' },
    ],
    permSettings: { tip: 'admins', person: 'u7', url: 'https://xinghe.feishu.cn/wiki/ipaas-rules', allowRequest: true, review: 'platform', notice: '申请连接器开发权限需要部门负责人同意，审核通常在 1 个工作日内完成。', rulesUrl: 'https://xinghe.feishu.cn/wiki/ipaas-rules' },
    usageAlert: { enabled: true, threshold: 80, receivers: ['u1'] },
    monitorViews: [{ id: 'view_hr', name: '人事行政 · 近 7 天', range: '7d', projects: ['p1'], workflows: [], metric: 'all' }],
    tokens: [{ id: 'tk1', name: 'CI 发布脚本', createdAt: now - 40 * DAY, lastUsedAt: now - 2 * HOUR }],
    releases: [
      { id: 'rel_ocr6', workflowId: 'wf_ocr', projectId: 'p1', version: 6, fromEnv: 'test', toEnv: 'prod', status: 'pending', requestedBy: 'u4', requestedAt: now - 30 * MIN, approvers: ['u1'], note: '金额阈值改为读取项目配置，测试环境已验证 12 笔票据', decidedBy: null, decidedAt: null, comment: '' },
      { id: 'rel_onb7', workflowId: 'wf_onboard', projectId: 'p1', version: 7, fromEnv: 'test', toEnv: 'prod', status: 'deployed', requestedBy: 'u3', requestedAt: now - 2 * HOUR - 40 * MIN, approvers: ['u1'], note: '研发分支增加 Jira 账号工单', decidedBy: 'u1', decidedAt: now - 2 * HOUR - 5 * MIN, comment: '差异已确认，可以上线' },
      { id: 'rel_pur12', workflowId: 'wf_purchase', projectId: 'p1', version: 12, fromEnv: 'test', toEnv: 'prod', status: 'deployed', requestedBy: 'u4', requestedAt: now - 3 * DAY - HOUR, approvers: ['u1'], note: '保存订单开启失败重试', decidedBy: 'u1', decidedAt: now - 3 * DAY - 20 * MIN, comment: '' },
    ],
    issueStates: {
      'conn:c_kingdee': { status: 'investigating', assignee: 'u4', mutedUntil: null, notes: [{ id: 'in1', by: 'u7', at: now - 12 * MIN, text: '已联系金蝶管理员重置 kd_api 账号密码，预计 30 分钟内完成' }], resolvedAt: null, resolvedBy: null },
      'conn:c_sf': { status: 'open', assignee: 'u6', mutedUntil: null, notes: [], resolvedAt: null, resolvedBy: null },
      'wf_ticket:s1:UPSTREAM_ERROR': { status: 'ignored', assignee: null, mutedUntil: null, notes: [{ id: 'in2', by: 'u7', at: now - 5 * DAY, text: '模型偶发超载，已开启重试，影响可以接受' }], resolvedAt: null, resolvedBy: null },
    },
    channels: [
      { id: 'ch_ops', type: 'feishu', name: '集成平台运维群', target: '飞书群 · oc_ops_2a1f', status: 'active', createdBy: 'u7' },
      { id: 'ch_fin', type: 'wecom', name: '财务系统值班群', target: '企业微信群机器人 · 5f1c…a8', status: 'active', createdBy: 'u4' },
      { id: 'ch_sales', type: 'dingtalk', name: '销售运营群', target: '钉钉群机器人 · 7d22…31', status: 'active', createdBy: 'u6' },
      { id: 'ch_pager', type: 'webhook', name: '值班系统 Webhook', target: 'https://oncall.xinghe.tech/hooks/ipaas', status: 'active', createdBy: 'u7' },
      { id: 'ch_mail', type: 'email', name: '运维邮件组', target: 'it-ops@xinghe.tech', status: 'unavailable', createdBy: 'u7' },
    ],
    alertPolicies: [
      { id: 'ap_core', name: '核心流程出现新问题', enabled: true, projects: ['p1'], workflows: ['wf_onboard', 'wf_purchase', 'wf_ocr'], events: ['issue_new', 'issue_reopen'], channels: ['ch_ops'], groupWindow: 30, quiet: { enabled: true, from: '22:00', to: '08:00' }, escalation: { enabled: true, afterMin: 60, channel: 'ch_pager' }, updatedBy: 'u7', updatedAt: now - 10 * DAY },
      { id: 'ap_conn', name: '连接失效', enabled: true, projects: [], workflows: [], events: ['connection_invalid'], channels: ['ch_ops', 'ch_fin'], groupWindow: 1440, quiet: { enabled: false, from: '22:00', to: '08:00' }, escalation: { enabled: false, afterMin: 60, channel: null }, updatedBy: 'u1', updatedAt: now - 20 * DAY },
      { id: 'ap_rate', name: '失败率超过 20%', enabled: true, projects: ['p1', 'p3'], workflows: [], events: ['failure_rate'], threshold: 20, window: '1h', channels: ['ch_ops', 'ch_sales'], groupWindow: 60, quiet: { enabled: false, from: '22:00', to: '08:00' }, escalation: { enabled: false, afterMin: 60, channel: null }, updatedBy: 'u7', updatedAt: now - 6 * DAY },
    ],
    alertEvents: [
      { id: 'ae1', policyId: 'ap_conn', issue: 'conn:c_kingdee', kind: 'new', at: now - 17 * MIN, channels: ['ch_ops', 'ch_fin'], merged: 1 },
      { id: 'ae2', policyId: 'ap_core', issue: 'conn:c_kingdee', kind: 'new', at: now - 17 * MIN, channels: ['ch_ops'], merged: 1 },
      { id: 'ae3', policyId: 'ap_conn', issue: 'conn:c_sf', kind: 'new', at: now - 2 * DAY, channels: ['ch_ops', 'ch_fin'], merged: 23 },
      { id: 'ae4', policyId: 'ap_rate', issue: 'conn:c_sf', kind: 'threshold', at: now - 2 * DAY + 50 * MIN, channels: ['ch_ops', 'ch_sales'], merged: 6 },
      { id: 'ae5', policyId: 'ap_core', issue: 'wf_ocr:s1:UPSTREAM_ERROR', kind: 'reopen', at: now - 3 * DAY, channels: ['ch_ops'], merged: 2 },
    ],
    privacy: {
      retentionDays: 30,
      projectRetention: { p4: 14 },
      payloadLevel: 'full',
      maskRules: [
        { id: 'mr_phone', name: '手机号', type: 'builtin', key: 'phone', enabled: true },
        { id: 'mr_idcard', name: '身份证号', type: 'builtin', key: 'idcard', enabled: true },
        { id: 'mr_bank', name: '银行卡号', type: 'builtin', key: 'bankcard', enabled: true },
        { id: 'mr_email', name: '邮箱', type: 'builtin', key: 'email', enabled: false },
        { id: 'mr_secret', name: '密钥与令牌', type: 'builtin', key: 'secret', enabled: true },
        { id: 'mr_salary', name: '薪资字段', type: 'field', pattern: 'salary|薪资|工资|月薪', enabled: true },
      ],
      revealRoles: ['owner', 'admin'],
      requireReason: true,
      erasureRequests: [
        { id: 'er1', subject: '许诺（XH20210311）', requestedBy: 'u2', requestedAt: now - 2 * DAY, status: 'done', affected: 14, doneAt: now - 2 * DAY + HOUR },
      ],
    },
    solutionInstalls: [
      { id: 'si1', solutionId: 'attendance-alert', projectId: 'p1', version: '1.0', installedAt: now - 58 * DAY, by: 'u3', workflowIds: ['wf_attendance'], mappingTableIds: [], config: { at: '09:30' }, skippedChecks: [] },
    ],
    customSolutions: [],
    mappingTables: [
      { id: 'mt1', projectId: 'p1', name: '部门编码对照', description: '北森部门名称 → 飞书部门 ID，用于入职建档', keyLabel: '北森部门', valueLabel: '飞书部门 ID', missing: 'error', defaultValue: '', updatedAt: now - 12 * DAY, updatedBy: 'u2',
        rows: [{ k: '研发中心', v: 'od-rd-001' }, { k: '销售运营部', v: 'od-sales-002' }, { k: '人力资源部', v: 'od-hr-003' }, { k: '财务部', v: 'od-fin-004' }, { k: '信息技术部', v: 'od-it-005' }, { k: '行政部', v: 'od-admin-006' }] },
      { id: 'mt2', projectId: 'p1', name: '物料编码对照', description: '采购申请里的物料编码 → 金蝶物料内码', keyLabel: '采购物料编码', valueLabel: '金蝶物料内码', missing: 'error', defaultValue: '', updatedAt: now - 30 * DAY, updatedBy: 'u4',
        rows: [{ k: 'M-1024', v: '100231-0001' }, { k: 'M-2048', v: '100231-0002' }, { k: 'M-4096', v: '100231-0015' }] },
      { id: 'mt3', projectId: 'p3', name: '线索来源映射', description: '官网表单和企业微信里的来源 → Salesforce LeadSource', keyLabel: '来源', valueLabel: 'LeadSource', missing: 'default', defaultValue: 'Other', updatedAt: now - 20 * DAY, updatedBy: 'u6',
        rows: [{ k: '官网', v: 'Web' }, { k: '展会', v: 'Trade Show' }, { k: '转介绍', v: 'Referral' }, { k: '企业微信', v: 'WeCom' }] },
    ],
    mcpClients: [
      { id: 'mcpc_kb', name: '内部知识库', description: 'Confluence 知识库的搜索和页面读取', url: 'https://kb.xinghe.tech/mcp', transport: 'streamable-http', auth: { type: 'bearer', configured: true }, status: 'connected', error: null, owner: 'u7', scope: 'tenant', projectIds: [], createdAt: now - 12 * DAY, lastSyncAt: now - 2 * HOUR,
        tools: [
          { name: 'search_pages', title: '搜索知识库', description: '按关键词搜索知识库页面，返回标题、摘要和链接', params: [{ key: 'query', label: '关键词', type: 'string', required: true }, { key: 'limit', label: '返回条数', type: 'number', required: false }] },
          { name: 'get_page', title: '读取页面', description: '按页面 ID 读取正文', params: [{ key: 'pageId', label: '页面 ID', type: 'string', required: true }] },
        ] },
      { id: 'mcpc_erp', name: '金蝶助手 MCP（试用）', description: '供应商提供的金蝶查询工具', url: 'http://10.2.8.15:8765/mcp', transport: 'sse', auth: { type: 'none', configured: true }, status: 'error', error: '连接超时：10.2.8.15:8765 在 10 秒内没有响应', owner: 'u4', scope: 'project', projectIds: ['p1'], createdAt: now - 3 * DAY, lastSyncAt: now - 3 * DAY,
        tools: [{ name: 'query_voucher', title: '查询凭证', description: '按期间查询会计凭证', params: [{ key: 'period', label: '会计期间', type: 'string', required: true }] }] },
    ],
    system: {
      version: '1.8.2', build: '2026-09-10', installedAt: now - 130 * DAY,
      update: { checkedAt: now - 6 * HOUR, channel: 'stable', offline: false, available: { version: '1.9.0', releasedAt: now - 5 * DAY, highlights: ['问题中心支持按连接聚合', '字段映射支持数组逐项映射', '外部 MCP 服务器可以作为连接器接入'], breaking: ['环境变量 FEMA_WORKER_TOKEN 更名为 FEMA_WORKER_SECRET，旧名称在 1.10 移除'], migrations: 3 } },
      backupPolicy: { enabled: true, schedule: '每天 02:00', keep: 7, target: 'local', path: '/data/fema/backups', s3: { configured: false } },
      backups: [
        { id: 'bk1', at: lastBackupAt, size: 412, type: 'auto', status: 'success', target: 'local' },
        { id: 'bk2', at: lastBackupAt - DAY, size: 409, type: 'auto', status: 'success', target: 'local' },
        { id: 'bk3', at: lastBackupAt - 2 * DAY, size: 406, type: 'auto', status: 'failed', target: 'local', error: '磁盘剩余空间不足 1 GB，备份已中止' },
        { id: 'bk4', at: lastBackupAt - 3 * DAY + 9 * HOUR + 12 * MIN, size: 398, type: 'manual', status: 'success', target: 'local', by: 'u1', note: '升级到 1.8.2 前' },
        { id: 'bk5', at: lastBackupAt - 3 * DAY, size: 401, type: 'auto', status: 'success', target: 'local' },
      ],
      setup: { completed: true, completedAt: now - 130 * DAY, skipped: ['smtp', 'objectStorage'] },
    },
    editLocks: { wf_offboard: { userId: 'u2', since: now - 6 * MIN } },
    recent: [
      { type: 'workflow', id: 'wf_onboard', time: now - 2 * HOUR },
      { type: 'workflow', id: 'wf_purchase', time: now - 5 * HOUR },
      { type: 'workflow', id: 'wf_ocr', time: now - 1 * DAY },
      { type: 'storage', id: 'ds1', time: now - 2 * DAY },
      { type: 'workflow', id: 'wf_ticket', time: now - 3 * DAY },
    ],
    notifications: [
      { id: 'nt1', type: 'alert', title: '采购审批通过后写入金蝶 运行失败', desc: '保存采购订单：登录失败，用户密码已过期', time: now - 17 * MIN, read: false, to: '/logs?run=run_fail01' },
      { id: 'nt2', type: 'connection', title: 'Salesforce 生产组织 授权已失效', desc: '2 个工作流受影响，需要所有者孙悦重新授权', time: now - 2 * DAY, read: false, to: '/connections?id=c_sf' },
      { id: 'nt3', type: 'member', title: '高远 已被邀请加入项目「人事行政」', desc: '权限：可查看，对方激活账号后即可访问', time: now - 3 * DAY, read: true, to: '/integration/p1' },
      { id: 'nt5', type: 'release', title: '赵敏 申请把「报销票据识别入表」v6 推广到生产环境', desc: '需要你审批：金额阈值改为读取项目配置，测试环境已验证 12 笔票据', time: now - 30 * MIN, read: false, to: '/integration/p1/releases/rel_ocr6' },
      { id: 'nt6', type: 'issue', title: '新问题：金蝶云星空 · 正式账套 登录失败', desc: '影响「采购审批通过后写入金蝶」，已合并告警，赵敏正在处理', time: now - 17 * MIN, read: false, to: '/issues/conn:c_kingdee' },
      { id: 'nt7', type: 'approval', title: 'IT 服务台智能体 等待人工确认', desc: '智能体想在 Jira 创建工单「3 楼 301 会议室投影仪无法投屏」', time: now - 11 * MIN, read: false, to: '/logs?run=run_agent_wait01' },
      { id: 'nt4', type: 'publish', title: '王磊 发布了 新员工入职自动开通账号 v5', desc: '增加销售分支', time: versions.find((v) => v.id === 'v_wf_onboard_5').publishedAt, read: true, to: '/integration/p1/wf/wf_onboard/v/5' },
    ],
    auditLogs: [
      { id: 'al1', time: versions.find((v) => v.id === 'v_wf_onboard_7').publishedAt, user: 'u1', action: '发布工作流', resource: '新员工入职自动开通账号 v7', project: 'p1', ip: '10.12.4.21' },
      { id: 'al2', time: now - 3 * HOUR, user: 'u4', action: '更新连接', resource: '金蝶云星空 · 正式账套', project: 'p1', ip: '10.12.8.73' },
      { id: 'al3', time: now - 5 * MIN, user: 'u7', action: '重试运行', resource: 'run_fail01', project: 'p1', ip: '10.12.4.9' },
      { id: 'al4', time: now - 3 * DAY - 1 * HOUR, user: 'u1', action: '邀请成员', resource: 'gaoyuan@partner.cn', project: 'p1', ip: '10.12.4.21' },
      { id: 'al5', time: now - 1 * DAY - 2 * HOUR, user: 'u5', action: '修改成员权限', resource: '研发效能 · 郑凯 可编辑', project: 'p2', ip: '10.12.6.11' },
      { id: 'al6', time: now - 9 * DAY, user: 'u10', action: '停止工作流', resource: '候选人接受 Offer 后创建入职任务', project: 'p1', ip: '10.12.9.2' },
      { id: 'al7', time: now - 4 * DAY, user: 'u3', action: '发布自定义连接器', resource: '泛微 OA（内部） 1.2.0', project: null, ip: '10.12.4.30' },
      { id: 'al8', time: now - 4 * DAY - 3 * HOUR, user: 'u1', action: '修改登录方式', resource: '飞书登录', project: null, ip: '10.12.4.21' },
      { id: 'al9', time: now - 5 * DAY, user: 'u12', action: '删除项目配置', resource: 'old_finance_token', project: 'p1', ip: '10.12.8.5' },
      { id: 'al10', time: now - 7 * DAY, user: 'u1', action: '登录', resource: '飞书登录', project: null, ip: '10.12.4.21' },
      { id: 'al11', time: now - 40 * DAY, user: 'u2', action: '创建工作流', resource: '离职交接与资产回收提醒', project: 'p1', ip: '10.12.7.44' },
    ],
    workers: [
      { id: 'w1', host: 'worker-7d9f8-2xk4p', status: 'online', version: '1.8.2', cpu: 38, mem: 61, jobs: 12, concurrency: 20, labels: ['default'], startedAt: now - 6 * DAY, heartbeatAt: now - 4000 },
      { id: 'w2', host: 'worker-7d9f8-9qz1m', status: 'online', version: '1.8.2', cpu: 52, mem: 70, jobs: 17, concurrency: 20, labels: ['default'], startedAt: now - 6 * DAY, heartbeatAt: now - 2000 },
      { id: 'w3', host: 'worker-7d9f8-lm3vt', status: 'online', version: '1.8.2', cpu: 21, mem: 44, jobs: 6, concurrency: 20, labels: ['default'], startedAt: now - 2 * DAY, heartbeatAt: now - 6000 },
      { id: 'w4', host: 'worker-6c1a2-bb8rw', status: 'offline', version: '1.8.1', cpu: 0, mem: 0, jobs: 0, concurrency: 20, labels: ['intranet'], startedAt: now - 9 * DAY, heartbeatAt: now - 3 * HOUR },
    ],
    sso: {
      feishu: { enabled: true, appId: 'cli_a5f3e8b2c1', configured: true },
      oidc: { enabled: false, configured: false, issuer: '', clientId: '' },
      saml: { enabled: false, configured: false, metadataUrl: '' },
      password: { enabled: true, configured: true, minLength: 10 },
      wecom: { enabled: false, configured: false, corpId: '', agentId: '' },
      dingtalk: { enabled: false, configured: false, appKey: '' },
      policy: { autoProvision: true, domains: 'xinghe.tech, partner.cn', session: '7d' },
    },
    onboarding: { dismissed: false },
  };
}

const SAMPLE_OUTPUT = {
  'beisen.onboarding_completed': { employee_id: 'XH20260918', name: '唐可欣', email: 'tangkexin@xinghe.tech', mobile: '13812345678', id_card: '310101199203051234', department: '研发中心', position: '前端工程师', manager: '周宁', entry_date: '2026-09-22' },
  'beisen.employee_changed': { employee_id: 'XH20230415', name: '赵磊', change_type: '调岗', department: '研发中心', previous_department: '销售运营部', position: '解决方案工程师', manager: '周宁', effective_date: '2026-10-08' },
  'beisen.employee_left': { employee_id: 'XH20210311', name: '许诺', mobile: '13987654321', department: '销售运营部', last_day: '2026-09-24', reason: '个人发展' },
  'beisen.offer_accepted': { candidate_id: 'C88412', name: '宋雨桐', position: '招聘专员', hrbp: '陈思远', expected_date: '2026-10-08' },
  'beisen.get_employee': { employee_id: 'XH20210311', name: '许诺', department: '销售运营部', position: '大客户经理', entry_date: '2021-03-11', status: '离职' },
  'feishu.approval_approved': { instance_code: '7A1C3F2E-88B1-4E0A', approval_name: '采购申请（新）', user_id: 'ou_7d8a6fd1e2', user_name: '赵敏', status: 'APPROVED', end_time: '2026-09-25 10:14:02' },
  'feishu.approval_created': { instance_code: '9C2F11A0-1B7E', approval_name: '请假', user_id: 'ou_52aa81c0f9', user_name: '郑凯', status: 'PENDING' },
  'feishu.message_received': { message_id: 'om_x100b4e1f', chat_type: 'p2p', sender: 'ou_52aa81c0f9', sender_name: '郑凯', text: '我的显示器闪屏，能帮忙换一台吗？' },
  'feishu.bitable_record_changed': { app_token: 'bascn1Xyz', table_id: 'tbl8Kd', action: 'record_added', record_id: 'recN7x2kd', fields: { 姓名: '宋雨桐', 岗位: '招聘专员' } },
  'feishu.user_created': { user: { open_id: 'ou_3b9e11af72', name: '唐可欣', email: 'tangkexin@xinghe.tech' } },
  'feishu.calendar_event_created': { event_id: 'evt_2f81c', summary: '周会', start_time: '2026-09-28 10:00', organizer: '林晓' },
  'feishu.get_user': { user: { open_id: 'ou_3b9e11af72', name: '唐可欣', email: 'tangkexin@xinghe.tech', department_ids: ['od-研发中心'], status: { is_activated: true } } },
  'feishu.get_approval': { approval_name: '采购申请（新）', status: 'APPROVED', form: [{ name: '采购明细', value: [{ 物料编码: 'M-1024', 数量: '20', 单价: '399' }, { 物料编码: 'M-2048', 数量: '5', 单价: '1299' }] }, { name: '事由', value: 'Q4 新员工办公设备' }] },
  'feishu.send_message': { message_id: 'om_8c2e7a1b40', chat_id: 'oc_5e2c8a91d0b4f7', create_time: '1758770042' },
  'feishu.send_card': { message_id: 'om_c1d9e02f33', chat_id: 'oc_5e2c8a91d0b4f7', create_time: '1758770045' },
  'feishu.bitable_search_record': { total: 3, has_more: false, items: [{ record_id: 'recA1', fields: { 资产编号: 'IT-NB-0231', 名称: 'MacBook Pro 14', 状态: '在用', open_id: 'ou_3b9e11af72' } }, { record_id: 'recA2', fields: { 资产编号: 'IT-MN-0877', 名称: 'Dell 27 显示器', 状态: '在用', open_id: 'ou_3b9e11af72' } }, { record_id: 'recA3', fields: { 资产编号: 'IT-KB-1102', 名称: '机械键盘', 状态: '在用', open_id: 'ou_3b9e11af72' } }] },
  'feishu.bitable_create_record': { record: { record_id: 'recN7x2kd', fields: { 姓名: '宋雨桐', 岗位: '招聘专员' } } },
  'feishu.bitable_update_record': { record: { record_id: 'recA1', fields: { 状态: '待回收' } } },
  'feishu.create_approval': { instance_code: '9B7E-11C2-4F0D' },
  'feishu.create_chat': { chat_id: 'oc_9d1f22ab7c', name: '新项目讨论组' },
  'feishu.create_calendar_event': { event: { event_id: 'evt_2f81c', summary: '入职沟通：宋雨桐', start_time: '2026-10-08 10:00' } },
  'feishu.create_doc': { document_id: 'doxcn8Kd2', url: 'https://xinghe.feishu.cn/docx/doxcn8Kd2' },
  'kingdee.save_bill': { Result: { ResponseStatus: { IsSuccess: true }, Id: 100874, Number: 'CGDD-2026-09-0412' } },
  'kingdee.submit_bill': { Result: { ResponseStatus: { IsSuccess: true } } },
  'github.create_issue': { number: 1284, html_url: 'https://github.com/xinghe/it-requests/issues/1284', state: 'open' },
  'github.pr_merged': { number: 842, title: 'feat: 支持批量重试', merged_by: 'zhouning', repo: 'xinghe/platform' },
  'gitlab.pipeline_failed': { pipeline_id: 55812, ref: 'main', stage: 'test', author: 'zhengkai' },
  'jira.create_issue': { id: '10421', key: 'IT-3317', self: 'https://xinghe.atlassian.net/rest/api/3/issue/10421' },
  'salesforce.update_record': { id: '0055j00000A1bCdE', success: true },
  'salesforce.create_lead': { id: '00Q5j00000Kx9aB', success: true },
  'salesforce.soql_query': { totalSize: 42, records: [{ Name: '云帆物流 年度采购', Amount: 360000, StageName: 'Negotiation' }] },
  'mysql.execute_query': { rowCount: 17, rows: [{ dept: '研发中心', name: '郑凯', type: '迟到', minutes: 12 }, { dept: '销售运营部', name: '孙悦', type: '缺卡', minutes: 0 }] },
  'mysql.insert_row': { insertId: 3021, affectedRows: 1 },
  'data-summarizer.aggregate': { result: [{ dept: '研发中心', count: 9 }, { dept: '销售运营部', count: 5 }, { dept: '财务部', count: 3 }] },
  'schedule.cron': { fired_at: '2026-09-25T09:00:00+08:00', cron: '0 9 * * 1-5' },
  'schedule.every': { fired_at: '2026-09-25T09:30:00+08:00' },
  'webhook.catch': { headers: { 'content-type': 'application/json' }, body: { name: '王先生', company: '云帆物流', email: 'Wang.Lei@YunfanLogistics.com', phone: '13822912291', source: '官网' }, query: {} },
  'webhook.catch_sync': { headers: { 'content-type': 'application/json' }, body: { submitter: 'ou_7d8a6fd1e2', image_url: 'https://reimburse.xinghe.tech/files/inv-88213.jpg' }, query: {} },
  'webhook.respond': { status: 200 },
  'forms.form_submitted': { visitor: '刘先生', company: '云帆物流', host: '孙悦', visit_time: '2026-09-25 14:00' },
  'forms.human_approval': { approved: true, approver: '林晓', comment: '同意' },
  'subflows.called': { chat: '平台研发群', title: '发布提醒', content: 'v1.8.2 已发布' },
  'subflows.call': { result: { message_id: 'om_c1d9e02f33' } },
  'subflows.respond': { status: 'ok' },
  'alert.alert': { event_name: 'flow_execute_failure', resource_name: '采购审批通过后写入金蝶', resource_url: 'https://ipaas.xinghe.tech/integration/p1/wf/wf_purchase', resource_running_log_url: 'https://ipaas.xinghe.tech/logs?run=run_fail01', error_message: '登录失败：用户密码已过期', occurred_at: '2026-09-25 14:26:22' },
  'manual-trigger.manual': { triggered_by: '林晓' },
  'http.request': { status: 200, headers: { 'content-type': 'application/json' }, body: { ok: true } },
  'store.get': { value: '{"status":"done"}', found: true },
  'store.put': { ok: true },
  'claude.message': { content: '已根据工单内容判断为硬件问题。', usage: { input_tokens: 182, output_tokens: 20 } },
  'claude.classify': { category: '硬件', confidence: 0.94 },
  'openai.chat': { content: '好的。', usage: { prompt_tokens: 120, completion_tokens: 8 } },
  'openai.extract': { invoice_no: '044001900211', date: '2026-09-20', amount: 6280, seller: '上海云帆物流有限公司' },
  'zendesk.ticket_created': { ticket_id: 88213, subject: '无法登录', priority: 'normal', requester: 'wang@example.com' },
  'shopify.order_created': { order_id: 5021, total_price: '329.00', customer: '李女士', items: 2 },
  'dingtalk.approval_finished': { process_instance_id: 'PROC-8F2A', title: '差旅报销', result: 'agree', amount: 3280 },
  'wecom.external_contact_added': { external_userid: 'wmJ8Kd2x', name: '陈先生', corp_name: '云帆物流', mobile: '13900001111', add_way: '扫描名片', sales: '孙悦' },
  'wecom.robot_message': { errcode: 0, errmsg: 'ok' },
  'mcpc_kb.search_pages': { total: 2, items: [{ title: '会议室投屏常见问题', url: 'https://kb.xinghe.tech/pages/2231', snippet: '无法投屏时先检查投屏器是否连到 Xinghe-Meeting 网络……' }, { title: '会议室设备报修流程', url: 'https://kb.xinghe.tech/pages/1874', snippet: '硬件故障请在 IT 服务台建工单，类型选择硬件报修……' }] },
  'mcpc_kb.get_page': { title: '会议室投屏常见问题', url: 'https://kb.xinghe.tech/pages/2231', content: '1. 确认投屏器指示灯为绿色……' },
  ai: { result: '硬件', usage: { input_tokens: 182, output_tokens: 4 } },
  agent: {
    answer: '已帮你在 IT 服务台建了硬件报修工单 IT-3321，工程师会在 2 小时内联系你。投屏器的常见问题可以先看：https://kb.xinghe.tech/pages/2231',
    ticket: 'IT-3321',
    steps: [
      { tool: '搜索知识库', input: { query: '会议室 投影仪 无法投屏' }, output: { total: 2 }, approved: null },
      { tool: 'Jira · 创建问题', input: { project: 'IT', issueType: '硬件报修', summary: '3 楼 301 会议室投影仪无法投屏' }, output: { key: 'IT-3321' }, approved: '李航' },
    ],
    usage: { input_tokens: 3120, output_tokens: 410 },
  },
  code: { result: [{ FMaterialId: 'M-1024', FQty: 20, FPrice: 399 }, { FMaterialId: 'M-2048', FQty: 5, FPrice: 1299 }] },
  loop: { item: { record_id: 'recA1', fields: { 资产编号: 'IT-NB-0231', 名称: 'MacBook Pro 14', open_id: 'ou_3b9e11af72' } }, index: 0, context: { total: 3, completed: 3, failed: 0 } },
  json: { result: { invoice_no: '044001900211', amount: 6280 } },
  delay: { resumed_at: '2026-09-25 14:40:00' },
  branch: { branch: '研发中心' },
  parallel: { completed: 2 },
  end: { status: '成功' },
};

function customSample(node) {
  const state = typeof Store !== 'undefined' ? Store.get() : null;
  const cc = state && state.customConnectors && state.customConnectors.find((x) => x.id === node.connector);
  if (!cc) return null;
  const a = [...cc.actions, ...cc.triggers].find((x) => x.key === node.op);
  return a && a.sample ? a.sample : { code: 0, data: {} };
}

const SAMPLE_BY_TYPE = { 数值: 0, 布尔: false, 数组: [], 对象: {} };

function nodeOutput(node) {
  if (!node) return {};
  if (node.sampleOutput) return node.sampleOutput;
  if (node.kind === 'agent') {
    const base = SAMPLE_OUTPUT.agent;
    const extra = Object.fromEntries((node.config.outputFields || []).filter((f) => f.k && base[f.k] === undefined).map((f) => [f.k, SAMPLE_BY_TYPE[f.t] ?? '']));
    return { ...base, ...extra };
  }
  if (node.kind === 'ai' && node.config && node.config.format === 'JSON' && (node.config.outputFields || []).length) {
    const sample = SAMPLE_OUTPUT['openai.extract'];
    return Object.fromEntries(node.config.outputFields.filter((f) => f.k).map((f) => [f.k, sample[f.k] ?? (SAMPLE_BY_TYPE[f.t] ?? '')]));
  }
  if (node.connector === 'forms' && node.op === 'form_submitted' && (node.config.fields || []).length) {
    const sample = SAMPLE_OUTPUT['forms.form_submitted'];
    return Object.fromEntries(node.config.fields.map((f) => [f.key || f.name, sample[f.key] ?? (f.type === '数字' ? 0 : '')]));
  }
  if (node.connector === 'subflows' && node.op === 'called' && (node.config.params || []).length) {
    const sample = SAMPLE_OUTPUT['subflows.called'];
    return Object.fromEntries(node.config.params.filter((x) => x.name).map((x) => [x.name, sample[x.name] ?? (x.type === '数值' ? 0 : '')]));
  }
  if (node.kind === 'variable') {
    return Object.fromEntries((node.config.vars || []).map((v) => [v.name, v.type === 'number' ? 0 : v.type === 'boolean' ? false : v.type === 'array' ? [] : v.type === 'object' ? {} : '']));
  }
  if (node.kind === 'code' && node.id !== 's2') return { result: {} };
  if (node.kind === 'ai' && node.config && node.config.format === 'JSON') return SAMPLE_OUTPUT['openai.extract'];
  return SAMPLE_OUTPUT[`${node.connector}.${node.op}`] || customSample(node) || SAMPLE_OUTPUT[node.kind] || (String(node.connector || '').startsWith('mcpc_') ? { content: [] } : node.connector ? { result: '' } : {});
}

function graphForRun(run, wf, versions) {
  if (run.graph) return run.graph;
  const list = versions || (typeof Store !== 'undefined' && Store.get() ? Store.get().versions : []);
  const v = run.kind === 'run' && list.find((x) => x.workflowId === run.workflowId && x.version === run.version);
  if (v && v.snapshot) return v.snapshot;
  return wf ? { trigger: wf.trigger, steps: wf.steps } : null;
}

function flattenPath(steps, rand, mustInclude, decide) {
  return steps.flatMap((node) => {
    if (node.kind === 'parallel') {
      return [{ node, meta: { branch: node.branches.map((b) => b.name).join('、'), branchIds: node.branches.map((b) => b.id) } }, ...node.branches.flatMap((b) => flattenPath(b.steps, rand, mustInclude, decide))];
    }
    if (node.kind === 'branch') {
      const forced = mustInclude && node.branches.find((b) => findNode(b.steps, mustInclude));
      const pick = forced || (decide && decide(node)) || node.branches[Math.floor(rand() * node.branches.length)];
      return [{ node, meta: { branch: pick.name, branchIds: [pick.id] } }, ...flattenPath(pick.steps, rand, mustInclude, decide)];
    }
    if (node.kind === 'loop') {
      const iterations = node.variant === 'while' ? 2 : 3;
      return [{ node, meta: { iterations } }, ...flattenPath(node.steps, rand, mustInclude, decide).map((s) => ({ ...s, meta: { ...s.meta, iterations } }))];
    }
    return [{ node, meta: {} }];
  });
}

function conditionHolds(cond, resolve) {
  if (cond.type === 'ai') return false;
  const read = (text) => {
    const v = resolveMapSource(text, resolve);
    return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  };
  const l = read(cond.left);
  const r = UNARY_OPS.includes(cond.op) ? '' : read(cond.right);
  if (cond.op === '等于') return l === r;
  if (cond.op === '不等于') return l !== r;
  if (cond.op === '包含') return l.includes(r);
  if (cond.op === '不包含') return !l.includes(r);
  if (cond.op === '以…开始') return l.startsWith(r);
  if (cond.op === '以…结束') return l.endsWith(r);
  if (cond.op === '大于') return l !== '' && r !== '' && Number(l) > Number(r);
  if (cond.op === '小于') return l !== '' && r !== '' && Number(l) < Number(r);
  if (cond.op === '为空') return !l;
  if (cond.op === '不为空') return Boolean(l);
  if (cond.op === '为 true') return l === 'true';
  if (cond.op === '为 false') return l === 'false';
  return false;
}

function branchDecider(graph, { payload, vars }) {
  const byId = Object.fromEntries(allNodes(graph).map((n) => [n.id, n]));
  const resolve = (head) => (head === graph.trigger.id ? payload : head === 'config' ? vars : byId[head] ? nodeOutput(byId[head]) : undefined);
  return (node) => {
    const holds = (b) => (b.conditions || []).length > 0 && ((b.logic || 'and') === 'or' ? b.conditions.some((c) => conditionHolds(c, resolve)) : b.conditions.every((c) => conditionHolds(c, resolve)));
    return node.branches.find((b) => !b.isDefault && holds(b)) || node.branches.find((b) => b.isDefault) || null;
  };
}

function resolveRunRefs(value, run) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*(config|trigger)\.([^}\s]+)\s*\}\}/g, (m, head, path) => {
      if (head === 'config') return run.vars && run.vars[path] !== undefined ? String(run.vars[path]) : m;
      const hit = path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), run.payload);
      return hit !== undefined && typeof hit !== 'object' ? String(hit) : m;
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveRunRefs(v, run));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRunRefs(v, run)]));
  return value;
}

function runNodeInput(node, run, graph, byId) {
  if (!Object.values(node.config || {}).some(isMapping)) return resolveRunRefs(Object.fromEntries(Object.entries(node.config || {}).filter(([k]) => !k.startsWith('__'))), run);
  const state = typeof Store !== 'undefined' ? Store.get() : null;
  const tables = state ? (state.mappingTables || []).filter((t) => t.projectId === run.projectId) : [];
  const resolve = (head) => {
    if (head === 'config') return run.vars || {};
    if (head === graph.trigger.id) return run.payload || nodeOutput(graph.trigger);
    return byId[head] ? nodeOutput(byId[head]) : undefined;
  };
  const plain = Object.fromEntries(Object.entries(node.config || {}).filter(([k]) => !k.startsWith('__')).map(([k, v]) => [k, isMapping(v) ? evalMapping(v.$map, { resolve, tables, schema: mappingSchema(node, k) }).value : v]));
  return resolveRunRefs(plain, run);
}

function buildRunTrace(run, workflow) {
  const graph = graphForRun(run, workflow);
  if (!graph) return [];
  const rand = mulberry32(hashString(run.id));
  if (run.status === 'deduped') {
    return [{ node: graph.trigger, meta: { dedupeOf: run.dedupeOf, dedupeKey: run.dedupeKey }, status: 'deduped', startedAt: run.startedAt, duration: run.duration, input: null, output: run.payload || nodeOutput(graph.trigger), error: null }];
  }
  const mustInclude = run.failedNodeId || (run.pendingApproval && run.pendingApproval.nodeId) || run.startNodeId;
  const decide = run.branchPicks ? (node) => node.branches.find((b) => b.id === run.branchPicks[node.id]) || null : null;
  const path = [{ node: graph.trigger, meta: {} }, ...flattenPath(graph.steps, rand, mustInclude, decide)];
  const failIndex = ['failed', 'timeout'].includes(run.status)
    ? Math.max(1, run.failedNodeId ? path.findIndex(({ node }) => node.id === run.failedNodeId) : path.length - 1)
    : -1;
  const waitIndex = run.pendingApproval ? path.findIndex(({ node }) => node.id === run.pendingApproval.nodeId) : -1;
  const stopIndex = ['running', 'waiting', 'stopped'].includes(run.status)
    ? Math.min(path.length - 1, Math.max(1, waitIndex > 0 ? waitIndex : run.stopIndex ?? Math.floor(path.length / 2)))
    : -1;
  const reuseUntil = run.startNodeId ? path.findIndex(({ node }) => node.id === run.startNodeId) : -1;
  const byId = Object.fromEntries(allNodes(graph).map((n) => [n.id, n]));
  let offset = 0;
  return path.map(({ node, meta }, i) => {
    const duration = node.kind === 'trigger' ? 0 : Math.round(60 + rand() * 900);
    const startedAt = run.startedAt + offset;
    offset += duration;
    let status = 'success';
    if (reuseUntil > 0 && i < reuseUntil) status = 'reused';
    else if (failIndex >= 0 && i === failIndex) status = run.status === 'timeout' ? 'timeout' : 'failed';
    else if (failIndex >= 0 && i > failIndex) status = 'skipped';
    else if (stopIndex >= 0 && i === stopIndex) status = run.status === 'stopped' ? 'stopped' : run.status;
    else if (stopIndex >= 0 && i > stopIndex) status = 'pending';
    const input = node.kind === 'trigger' ? (run.payload || null) : runNodeInput(node, run, graph, byId);
    const output = ['success', 'reused'].includes(status) ? (node.kind === 'trigger' && run.payload ? run.payload : nodeOutput(node)) : null;
    const error = ['failed', 'timeout'].includes(status)
      ? (run.failure || { code: status === 'timeout' ? 'STEP_TIMEOUT' : 'UPSTREAM_ERROR', message: status === 'timeout' ? '节点执行超过 600 秒，已被终止' : `${node.name} 调用失败：上游返回 422 Unprocessable Entity`, http_status: status === 'timeout' ? null : 422, attempts: 1 })
      : null;
    return { node, meta, status, startedAt, duration: ['pending', 'skipped'].includes(status) ? null : status === 'reused' ? 0 : duration, input, output, error };
  });
}

const BIZ_KEY_FIELDS = { employee_id: '工号', instance_code: '审批单号', external_userid: '客户 ID' };

const BIZ_KEY_NAMES = ['张晓雨', '周子航', '林书瑶', '唐一鸣', '许嘉', '陈立', '孙悦', '赵磊', '刘洋', '黄若彤', '郭振宇', '程静', '宋佳', '何悦', '吕艳', '马超', '韩梅', '冯浩然', '邓欣怡', '曹子墨'];

function bizKeyField(key) {
  const m = String(key || '').match(/trigger\.([A-Za-z_]+)/);
  return m ? m[1] : '';
}

function bizKeyHash(id) {
  return [...String(id)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
}

function bizKeyFor(wf, seed) {
  const rs = wf && wf.trigger && wf.trigger.runSettings;
  const key = rs && rs.dedupe && rs.dedupe.enabled ? rs.dedupe.key : null;
  const field = bizKeyField(key);
  if (!BIZ_KEY_FIELDS[field]) return null;
  const h = bizKeyHash(seed);
  if (field === 'employee_id') return { label: '工号', value: `XH2026${String(1000 + (h % 9000))}`, name: BIZ_KEY_NAMES[h % BIZ_KEY_NAMES.length] };
  if (field === 'instance_code') return { label: '审批单号', value: `${(h % 0xfffffff).toString(16).toUpperCase().padStart(7, '0')}-${String(h % 10000).padStart(4, '0')}`, name: BIZ_KEY_NAMES[(h >> 3) % BIZ_KEY_NAMES.length] };
  return { label: '客户 ID', value: `wm${(h % 0xfffffff).toString(36)}` };
}

function withBizKeys(runs, workflows) {
  const byWf = new Map(workflows.map((w) => [w.id, w]));
  const base = new Map(runs.filter((r) => !r.dedupeOf && !r.retryOf).map((r) => [r.id, bizKeyFor(byWf.get(r.workflowId), r.id)]));
  return runs.map((r) => {
    const origin = r.dedupeOf || r.retryOf;
    const key = origin && base.get(origin) ? base.get(origin) : base.get(r.id) || bizKeyFor(byWf.get(r.workflowId), origin || r.id);
    if (!key) return r;
    return { ...r, bizKey: key, ...(r.dedupeOf ? { dedupeKey: key.value } : {}) };
  });
}
