const CONNECTOR_CATEGORIES = [
  { value: 'all', label: '全部', icon: 'LayoutGrid' },
  { value: 'office', label: '办公协同', icon: 'Users' },
  { value: 'hr', label: '人力资源', icon: 'IdCard' },
  { value: 'crm', label: '客户管理', icon: 'Handshake' },
  { value: 'erp', label: '财务与 ERP', icon: 'Landmark' },
  { value: 'dev', label: '研发工具', icon: 'Code' },
  { value: 'ecommerce', label: '电商零售', icon: 'ShoppingBag' },
  { value: 'database', label: '数据库', icon: 'Database' },
  { value: 'storage', label: '文件存储', icon: 'HardDrive' },
  { value: 'ai', label: 'AI 大模型', icon: 'Sparkles' },
  { value: 'marketing', label: '营销与通讯', icon: 'Megaphone' },
  { value: 'builtin', label: '内置工具', icon: 'Wrench' },
  { value: 'custom', label: '自定义', icon: 'Blocks' },
];

const img = (name) => ({ type: 'img', src: `assets/connectors/${name}.svg` });
const brand = (key) => ({ type: 'brand', key });
const letter = (text, color) => ({ type: 'letter', text, color });
const op = (key, name, desc, extra = {}) => ({ key, name, desc, ...extra });

const CONNECTORS = [
  {
    id: 'feishu', name: '飞书', category: 'office', icon: img('feishu'), auth: 'oauth2', official: true, version: '2.4.1', usage: 18420,
    desc: '飞书消息、审批、多维表格、日历与通讯录的全量能力。',
    triggers: [
      op('approval_approved', '审批实例通过', '指定审批定义下的实例被最终通过时触发', { type: 'webhook', group: '审批' }),
      op('approval_created', '审批实例创建', '有人发起指定审批时触发', { type: 'webhook', group: '审批' }),
      op('message_received', '机器人收到消息', '用户在单聊或群聊中 @ 机器人时触发', { type: 'webhook', group: '消息' }),
      op('bitable_record_changed', '多维表格记录变更', '新增、修改或删除记录时触发', { type: 'webhook', group: '多维表格' }),
      op('user_created', '员工入职', '通讯录新增员工时触发', { type: 'webhook', group: '通讯录' }),
      op('calendar_event_created', '日程创建', '指定日历新增日程时触发', { type: 'polling', group: '日历' }),
    ],
    actions: [
      op('send_message', '发送消息', '以机器人身份向用户或群发送文本、富文本或卡片消息', { group: '消息' }),
      op('send_card', '发送消息卡片', '发送可交互的消息卡片，支持按钮回调', { group: '消息' }),
      op('create_approval', '发起审批', '以指定用户身份发起一个审批实例', { group: '审批' }),
      op('get_approval', '获取审批实例详情', '按实例 Code 查询审批表单和审批进度', { group: '审批' }),
      op('bitable_create_record', '新增多维表格记录', '向指定数据表写入一行', { group: '多维表格' }),
      op('bitable_update_record', '更新多维表格记录', '按记录 ID 更新字段', { group: '多维表格' }),
      op('bitable_search_record', '查询多维表格记录', '按筛选条件查询记录，最多返回 500 条', { group: '多维表格' }),
      op('create_chat', '创建群组', '创建群聊并拉入成员', { group: '群组' }),
      op('get_user', '获取用户信息', '按 open_id、手机号或邮箱查询用户', { group: '通讯录' }),
      op('create_user', '开通账号', '在指定部门开通员工账号；按工号查重，已存在时返回原账号', { group: '通讯录' }),
      op('update_user', '调整部门和上级', '按工号更新员工的部门、直属上级和职务', { group: '通讯录' }),
      op('freeze_user', '暂停账号', '暂停后不能登录，数据保留，可以恢复', { group: '通讯录' }),
      op('create_calendar_event', '创建日程', '在指定日历中创建日程并邀请参与人', { group: '日历' }),
      op('create_doc', '创建云文档', '在指定文件夹下新建文档', { group: '云文档' }),
    ],
  },
  {
    id: 'beisen', name: '北森', category: 'hr', icon: img('beisen'), auth: 'apikey', official: true, version: '1.3.0', usage: 3210,
    desc: '北森 iTalent 的员工、组织、入转调离与招聘数据。',
    triggers: [
      op('onboarding_completed', '员工入职完成', '北森中员工入职流程完成时触发', { type: 'polling' }),
      op('employee_left', '员工离职', '员工离职生效时触发', { type: 'polling' }),
      op('employee_changed', '员工变动', '入职、调岗、离职等任职信息变化时，按员工逐条触发', { type: 'polling' }),
      op('offer_accepted', '候选人接受 Offer', '招聘模块中候选人接受 Offer 时触发', { type: 'polling' }),
    ],
    actions: [
      op('get_employee', '获取员工信息', '按工号查询员工档案'),
      op('list_departments', '查询组织架构', '返回全部部门与上下级关系'),
      op('update_employee', '更新员工信息', '修改员工档案字段'),
      op('create_candidate', '新建候选人', '在招聘模块中新建候选人'),
    ],
  },
  {
    id: 'jira', name: 'Jira', category: 'dev', icon: img('jira'), auth: 'basic', official: true, version: '3.1.2', usage: 9021,
    desc: '创建和更新 Jira 问题，监听问题状态变化。',
    triggers: [
      op('issue_created', '问题创建', '指定项目中新建问题时触发', { type: 'webhook' }),
      op('issue_updated', '问题更新', '问题字段或状态变化时触发', { type: 'webhook' }),
    ],
    actions: [
      op('create_issue', '创建问题', '在指定项目中创建问题'),
      op('update_issue', '更新问题', '修改问题字段'),
      op('transition_issue', '流转问题状态', '把问题移动到指定状态'),
      op('add_comment', '添加评论', '为问题添加一条评论'),
      op('search_issues', '搜索问题', '使用 JQL 搜索问题'),
    ],
  },
  {
    id: 'github', name: 'GitHub', category: 'dev', icon: brand('github'), auth: 'oauth2', official: true, version: '2.0.5', usage: 12876,
    desc: '仓库、Pull Request、Issue 与 Actions 的事件和操作。',
    triggers: [
      op('pr_opened', 'Pull Request 创建', '仓库中新建 Pull Request 时触发', { type: 'webhook' }),
      op('pr_merged', 'Pull Request 合并', 'Pull Request 被合并时触发', { type: 'webhook' }),
      op('push', '代码推送', '指定分支有新提交时触发', { type: 'webhook' }),
      op('issue_opened', 'Issue 创建', '新建 Issue 时触发', { type: 'webhook' }),
      op('release_published', '发布 Release', '发布新 Release 时触发', { type: 'webhook' }),
    ],
    actions: [
      op('create_issue', '创建 Issue', '在仓库中创建 Issue'),
      op('comment_pr', '评论 Pull Request', '在 Pull Request 下发表评论'),
      op('get_file', '获取文件内容', '读取仓库中指定路径的文件'),
      op('dispatch_workflow', '触发 Actions 工作流', '手动触发一个 workflow_dispatch'),
    ],
  },
  {
    id: 'gitlab', name: 'GitLab', category: 'dev', icon: brand('gitlab'), auth: 'apikey', official: true, version: '1.6.0', usage: 4120,
    desc: '合并请求、流水线与 Issue 自动化。',
    triggers: [op('mr_merged', '合并请求已合并', '合并请求被合并时触发', { type: 'webhook' }), op('pipeline_failed', '流水线失败', '流水线执行失败时触发', { type: 'webhook' })],
    actions: [op('create_issue', '创建 Issue', '在项目中创建 Issue'), op('retry_pipeline', '重试流水线', '重新执行失败的流水线')],
  },
  {
    id: 'salesforce', name: 'Salesforce', category: 'crm', icon: img('salesforce'), auth: 'oauth2', official: true, version: '2.2.0', usage: 5230,
    desc: '线索、商机、客户与自定义对象。',
    triggers: [op('opportunity_won', '商机赢单', '商机阶段变为 Closed Won 时触发', { type: 'polling' }), op('lead_created', '新线索', '新建线索时触发', { type: 'polling' })],
    actions: [op('create_lead', '创建线索', '新建一条线索'), op('update_record', '更新记录', '更新任意对象的记录'), op('soql_query', '执行 SOQL 查询', '使用 SOQL 查询数据')],
  },
  {
    id: 'hubspot', name: 'HubSpot', category: 'crm', icon: img('hubspot'), auth: 'oauth2', official: true, version: '1.9.3', usage: 3920,
    desc: '联系人、公司、交易与营销邮件。',
    triggers: [op('contact_created', '新联系人', '新建联系人时触发', { type: 'webhook' }), op('deal_stage_changed', '交易阶段变更', '交易阶段变化时触发', { type: 'webhook' })],
    actions: [op('create_contact', '创建联系人', '新建联系人'), op('create_deal', '创建交易', '新建交易')],
  },
  {
    id: 'xiaoshouyi', name: '销售易', category: 'crm', icon: letter('销', '#1D6FE8'), auth: 'oauth2', official: false, author: '社区', version: '0.8.2', usage: 860,
    desc: '销售易 CRM 的客户、商机与合同。',
    triggers: [op('contract_signed', '合同签订', '合同状态变为已签订时触发', { type: 'polling' })],
    actions: [op('create_account', '创建客户', '新建客户'), op('update_opportunity', '更新商机', '修改商机字段')],
  },
  {
    id: 'kingdee', name: '金蝶云星空', category: 'erp', icon: letter('金', '#1E73BE'), auth: 'custom', official: true, version: '1.1.0', usage: 1740,
    desc: '凭证、应收应付、采购与库存单据。',
    triggers: [op('voucher_audited', '凭证审核', '凭证审核通过时触发', { type: 'polling' })],
    actions: [op('save_bill', '保存单据', '保存任意表单单据'), op('submit_bill', '提交单据', '提交单据进入审批'), op('query_bill', '单据查询', '按条件查询单据')],
  },
  {
    id: 'netsuite', name: 'NetSuite', category: 'erp', icon: img('netsuite'), auth: 'custom', official: true, version: '1.0.4', usage: 690,
    desc: 'Oracle NetSuite 的记录与 SuiteQL 查询。',
    triggers: [op('record_created', '记录创建', '指定类型的记录创建时触发', { type: 'polling' })],
    actions: [op('create_record', '创建记录', '新建任意类型的记录'), op('suiteql', '执行 SuiteQL', '执行 SuiteQL 查询')],
  },
  {
    id: 'sap-ariba', name: 'SAP Ariba', category: 'erp', icon: img('sap-ariba'), auth: 'oauth2', official: true, version: '0.9.1', usage: 310,
    desc: '采购申请、采购订单与供应商。',
    triggers: [op('po_approved', '采购订单审批通过', '采购订单审批通过时触发', { type: 'polling' })],
    actions: [op('get_po', '获取采购订单', '按编号查询采购订单')],
  },
  {
    id: 'mysql', name: 'MySQL', category: 'database', icon: img('mysql'), auth: 'custom', official: true, version: '1.4.0', usage: 7600,
    desc: '执行 SQL、增删改查与新行监听。',
    triggers: [op('new_row', '新增行', '指定表出现新行时触发', { type: 'polling' })],
    actions: [op('execute_query', '执行 SQL', '执行任意 SQL 语句'), op('insert_row', '插入行', '向表中插入一行'), op('update_row', '更新行', '按条件更新行'), op('find_rows', '查询行', '按条件查询行')],
  },
  {
    id: 'postgres', name: 'PostgreSQL', category: 'database', icon: img('postgres'), auth: 'custom', official: true, version: '1.4.0', usage: 6120,
    desc: '执行 SQL、增删改查与新行监听。',
    triggers: [op('new_row', '新增行', '指定表出现新行时触发', { type: 'polling' })],
    actions: [op('execute_query', '执行 SQL', '执行任意 SQL 语句'), op('insert_row', '插入行', '向表中插入一行')],
  },
  {
    id: 'redis', name: 'Redis', category: 'database', icon: brand('redis'), auth: 'custom', official: false, author: '社区', version: '0.5.0', usage: 540,
    desc: '键值读写、发布订阅。',
    triggers: [],
    actions: [op('get', '读取键', '读取一个键的值'), op('set', '写入键', '写入键值并设置过期时间')],
  },
  {
    id: 'snowflake', name: 'Snowflake', category: 'database', icon: img('snowflake'), auth: 'custom', official: true, version: '1.0.0', usage: 420,
    desc: '在 Snowflake 中执行查询。',
    triggers: [],
    actions: [op('run_query', '执行查询', '执行 SQL 查询并返回结果')],
  },
  {
    id: 'aliyun-oss', name: '阿里云 OSS', category: 'storage', icon: brand('alibabacloud'), auth: 'apikey', official: true, version: '1.2.0', usage: 2210,
    desc: '对象上传、下载与签名链接。',
    triggers: [op('object_created', '新文件上传', 'Bucket 中出现新对象时触发', { type: 'polling' })],
    actions: [op('put_object', '上传文件', '上传文件到指定 Bucket'), op('sign_url', '生成签名链接', '生成限时访问链接')],
  },
  {
    id: 'google-drive', name: 'Google Drive', category: 'storage', icon: brand('googledrive'), auth: 'oauth2', official: true, version: '1.8.0', usage: 2980,
    desc: '文件与文件夹管理。',
    triggers: [op('new_file', '新文件', '指定文件夹中新增文件时触发', { type: 'polling' })],
    actions: [op('upload_file', '上传文件', '上传文件'), op('create_folder', '创建文件夹', '新建文件夹')],
  },
  {
    id: 'openai', name: 'OpenAI', category: 'ai', icon: img('openai'), auth: 'apikey', official: true, version: '3.0.1', usage: 15230,
    desc: '对话补全、结构化抽取、向量与图像生成。',
    triggers: [],
    actions: [op('chat', '对话补全', '调用 Chat Completions 生成回复'), op('extract', '结构化抽取', '按 JSON Schema 从文本中抽取字段'), op('embedding', '生成向量', '把文本转成 embedding'), op('image', '生成图片', '根据描述生成图片')],
  },
  {
    id: 'claude', name: 'Claude', category: 'ai', icon: brand('claude'), auth: 'apikey', official: true, version: '1.5.0', usage: 8340,
    desc: '调用 Claude 模型进行对话、总结、分类与抽取。',
    triggers: [],
    actions: [op('message', '发送消息', '调用 Messages API 生成回复'), op('classify', '文本分类', '按给定类别对文本分类'), op('summarize', '总结', '总结长文本')],
  },
  {
    id: 'deepseek', name: 'DeepSeek', category: 'ai', icon: letter('D', '#4D6BFE'), auth: 'apikey', official: false, author: '社区', version: '0.6.0', usage: 4410,
    desc: 'DeepSeek 对话与推理模型。',
    triggers: [],
    actions: [op('chat', '对话补全', '调用对话模型生成回复')],
  },
  {
    id: 'shopify', name: 'Shopify', category: 'ecommerce', icon: brand('shopify'), auth: 'apikey', official: true, version: '2.1.0', usage: 3010,
    desc: '订单、商品、库存与客户。',
    triggers: [op('order_created', '新订单', '店铺产生新订单时触发', { type: 'webhook' }), op('order_refunded', '订单退款', '订单退款时触发', { type: 'webhook' })],
    actions: [op('get_order', '获取订单', '按订单号查询'), op('update_inventory', '更新库存', '调整商品库存')],
  },
  {
    id: 'youzan', name: '有赞', category: 'ecommerce', icon: letter('有', '#E5352C'), auth: 'oauth2', official: false, author: '社区', version: '0.4.1', usage: 380,
    desc: '有赞商城订单与会员。',
    triggers: [op('trade_paid', '订单支付成功', '买家付款后触发', { type: 'webhook' })],
    actions: [op('get_trade', '获取订单详情', '按订单号查询')],
  },
  {
    id: 'stripe', name: 'Stripe', category: 'ecommerce', icon: brand('stripe'), auth: 'apikey', official: true, version: '1.7.2', usage: 2330,
    desc: '支付、订阅与发票。',
    triggers: [op('payment_succeeded', '支付成功', '收到支付成功事件时触发', { type: 'webhook' })],
    actions: [op('create_customer', '创建客户', '新建客户'), op('create_invoice', '创建发票', '新建发票')],
  },
  {
    id: 'slack', name: 'Slack', category: 'marketing', icon: img('slack'), auth: 'oauth2', official: true, version: '2.3.0', usage: 6210,
    desc: '频道消息、提醒与交互。',
    triggers: [op('new_message', '频道新消息', '频道中出现新消息时触发', { type: 'webhook' })],
    actions: [op('send_message', '发送消息', '向频道或用户发送消息')],
  },
  {
    id: 'microsoft-teams', name: 'Microsoft Teams', category: 'office', icon: img('microsoft-teams'), auth: 'oauth2', official: true, version: '1.2.0', usage: 1820,
    desc: '频道消息与会议。',
    triggers: [op('channel_message', '频道新消息', '频道中出现新消息时触发', { type: 'polling' })],
    actions: [op('send_message', '发送频道消息', '向频道发送消息')],
  },
  {
    id: 'dingtalk', name: '钉钉', category: 'office', icon: letter('钉', '#1677FF'), auth: 'apikey', official: true, version: '1.6.0', usage: 5230,
    desc: '钉钉工作通知、群机器人与审批。',
    triggers: [op('approval_finished', '审批结束', '审批实例结束时触发', { type: 'webhook' })],
    actions: [op('send_work_notice', '发送工作通知', '向指定员工发送工作通知'), op('robot_message', '群机器人消息', '通过自定义机器人发送群消息')],
  },
  {
    id: 'wecom', name: '企业微信', category: 'office', icon: letter('企', '#0082EF'), auth: 'apikey', official: true, version: '1.4.3', usage: 4760,
    desc: '应用消息、群机器人与通讯录。',
    triggers: [op('external_contact_added', '添加客户', '成员添加外部联系人时触发', { type: 'webhook' })],
    actions: [op('send_app_message', '发送应用消息', '向成员发送应用消息'), op('robot_message', '群机器人消息', '通过群机器人发送消息')],
  },
  {
    id: 'gmail', name: 'Gmail', category: 'marketing', icon: img('gmail'), auth: 'oauth2', official: true, version: '1.9.0', usage: 5120,
    desc: '收发邮件、标签与附件。',
    triggers: [op('new_email', '收到新邮件', '收件箱收到符合条件的邮件时触发', { type: 'polling' })],
    actions: [op('send_email', '发送邮件', '发送一封邮件'), op('add_label', '添加标签', '为邮件添加标签')],
  },
  {
    id: 'zendesk', name: 'Zendesk', category: 'crm', icon: img('zendesk'), auth: 'apikey', official: true, version: '1.3.0', usage: 1330,
    desc: '工单与客户支持。',
    triggers: [op('ticket_created', '新工单', '新建工单时触发', { type: 'polling' })],
    actions: [op('create_ticket', '创建工单', '新建工单'), op('update_ticket', '更新工单', '修改工单状态或负责人')],
  },
  {
    id: 'service-now', name: 'ServiceNow', category: 'crm', icon: img('service-now'), auth: 'basic', official: true, version: '1.0.2', usage: 610,
    desc: '事件、变更与服务请求。',
    triggers: [op('incident_created', '新事件', '新建事件单时触发', { type: 'polling' })],
    actions: [op('create_incident', '创建事件', '新建事件单')],
  },
  {
    id: 'notion', name: 'Notion', category: 'office', icon: brand('notion'), auth: 'oauth2', official: true, version: '1.5.0', usage: 2870,
    desc: '数据库条目与页面。',
    triggers: [op('db_item_created', '数据库新增条目', '数据库新增条目时触发', { type: 'polling' })],
    actions: [op('create_page', '创建页面', '新建页面'), op('update_db_item', '更新数据库条目', '修改条目属性')],
  },
  {
    id: 'http', name: 'HTTP 请求', category: 'builtin', icon: img('http'), auth: 'none', official: true, builtin: true, version: '内置', usage: 30210,
    desc: '向任意 HTTP 接口发送请求，支持鉴权、重试与超时。',
    triggers: [],
    actions: [op('request', '发送 HTTP 请求', '支持 GET / POST / DELETE 等方法')],
  },
  {
    id: 'webhook', name: 'Webhook 触发器', category: 'builtin', icon: img('webhooks'), auth: 'none', official: true, builtin: true, version: '1.2', usage: 21400,
    desc: '通过 URL 接收其他服务发出的事件；同步调用时可用「同步回调」节点返回结果。',
    triggers: [op('catch', '异步 Webhook', '收到请求后立即返回 200，流程在后台运行', { type: 'webhook' }), op('catch_sync', '同步 Webhook', '调用方等待流程中的「同步回调」节点返回结果', { type: 'webhook' })],
    actions: [op('respond', '同步回调', '向同步 Webhook 的调用方返回响应，最大 256 KB')],
  },
  {
    id: 'schedule', name: '定时任务', category: 'builtin', icon: img('schedule'), auth: 'none', official: true, builtin: true, version: '内置', usage: 25600,
    desc: '按固定频率或 Cron 表达式定时运行。',
    triggers: [op('every', '按计划触发', '每天、按周、按月、仅一次或按间隔触发', { type: 'schedule' }), op('cron', 'Cron 表达式', '使用 Cron 表达式精确控制运行时间', { type: 'schedule' })],
    actions: [],
  },
  {
    id: 'manual-trigger', name: '手动触发器', category: 'builtin', icon: img('manual-trigger'), auth: 'none', official: true, builtin: true, version: '内置', usage: 8800,
    desc: '在调试时手动触发，适合一次性任务和调试。',
    triggers: [op('manual', '手动触发', '点击运行时触发', { type: 'manual' })],
    actions: [],
  },
  {
    id: 'alert', name: '告警触发器', category: 'builtin', icon: { type: 'kind', icon: 'Siren', color: '#E11D48' }, auth: 'none', official: true, builtin: true, version: '1.0', usage: 2100,
    desc: '当工作流运行失败、超时或失败率超过阈值时触发，后续节点负责把告警发出去。',
    triggers: [op('alert', '监控告警', '满足告警规则时触发', { type: 'alert' })],
    actions: [],
  },
  {
    id: 'forms', name: '表单触发器', category: 'builtin', icon: img('human-input'), auth: 'none', official: true, builtin: true, version: '内置', usage: 4300,
    desc: '生成一个可分享的表单页面，提交后触发工作流。',
    triggers: [op('form_submitted', '表单提交', '有人提交表单时触发', { type: 'webhook' })],
    actions: [op('human_approval', '等待人工确认', '暂停运行，直到指定人员确认后继续')],
  },
  {
    id: 'subflows', name: '子流程触发器', category: 'builtin', icon: img('subflows'), auth: 'none', official: true, builtin: true, version: '内置', usage: 3900,
    desc: '把公共逻辑拆成子流程，在多个工作流中复用。',
    triggers: [op('called', '触发子流程运行', '被其他工作流的「调用子流程」节点调用时触发', { type: 'manual' })],
    actions: [op('call', '调用子流程', '调用另一个工作流并等待它返回'), op('respond', '子流程响应', '向调用方返回子流程结果')],
  },
  {
    id: 'store', name: '数据存储', category: 'builtin', icon: img('store'), auth: 'none', official: true, builtin: true, version: '内置', usage: 11020,
    desc: '在运行之间持久化键值，常用于去重和游标。',
    triggers: [],
    actions: [op('get', '读取', '按键读取值'), op('put', '写入', '写入键值'), op('append', '追加到列表', '把值追加到列表'), op('remove', '删除', '删除键')],
  },
  {
    id: 'data-mapper', name: '数据转换', category: 'builtin', icon: img('data-mapper'), auth: 'none', official: true, builtin: true, version: '内置', usage: 9300,
    desc: '把上游数据重新组织成目标结构。',
    triggers: [],
    actions: [op('map', '字段映射', '按映射规则生成新对象')],
  },
  {
    id: 'text-helper', name: '字符串助手', category: 'builtin', icon: img('text-helper'), auth: 'none', official: true, builtin: true, version: '内置', usage: 7800,
    desc: '拼接、替换、截取、正则提取、Markdown 转换。',
    triggers: [],
    actions: [op('concat', '拼接文本', '拼接多个文本'), op('replace', '替换', '替换文本'), op('regex', '正则提取', '用正则表达式提取内容')],
  },
  {
    id: 'date-helper', name: '时间和日期助手', category: 'builtin', icon: img('date-helper'), auth: 'none', official: true, builtin: true, version: '内置', usage: 6900,
    desc: '格式化、时区转换、加减与差值计算。',
    triggers: [],
    actions: [op('format', '格式化日期', '按格式输出日期'), op('add', '日期加减', '在日期上加减时间'), op('diff', '计算差值', '计算两个日期的差')],
  },
  {
    id: 'math-helper', name: '数学计算', category: 'builtin', icon: img('math-helper'), auth: 'none', official: true, builtin: true, version: '内置', usage: 2100,
    desc: '四则运算、取整与随机数。',
    triggers: [],
    actions: [op('calc', '计算表达式', '计算数学表达式')],
  },
  {
    id: 'csv', name: 'CSV 助手', category: 'builtin', icon: img('csv'), auth: 'none', official: true, builtin: true, version: '内置', usage: 2600,
    desc: 'CSV 与 JSON 互转。',
    triggers: [],
    actions: [op('parse', '解析 CSV', 'CSV 文本转 JSON 数组'), op('stringify', '生成 CSV', 'JSON 数组转 CSV 文本')],
  },
  {
    id: 'xml', name: 'XML 助手', category: 'builtin', icon: img('xml'), auth: 'none', official: true, builtin: true, version: '内置', usage: 1200,
    desc: 'XML 与 JSON 互转。',
    triggers: [],
    actions: [op('parse', '解析 XML', 'XML 转 JSON')],
  },
  {
    id: 'crypto', name: '加解密助手', category: 'builtin', icon: img('crypto'), auth: 'none', official: true, builtin: true, version: '内置', usage: 1800,
    desc: '哈希、HMAC 签名、Base64 与 AES。',
    triggers: [],
    actions: [op('hmac', 'HMAC 签名', '计算 HMAC 签名'), op('hash', '哈希', '计算 MD5 / SHA256'), op('base64', 'Base64 编解码', 'Base64 编码或解码')],
  },
  {
    id: 'file-helper', name: '文件助手', category: 'builtin', icon: img('file-helper'), auth: 'none', official: true, builtin: true, version: '内置', usage: 1500,
    desc: '读取、创建与转换文件。',
    triggers: [],
    actions: [op('read', '读取文件', '读取文件内容'), op('create', '创建文件', '由文本创建文件')],
  },
  {
    id: 'data-summarizer', name: '列表助手', category: 'builtin', icon: img('data-summarizer'), auth: 'none', official: true, builtin: true, version: '内置', usage: 1700,
    desc: '对列表求和、计数、平均值与分组。',
    triggers: [],
    actions: [op('aggregate', '聚合计算', '对列表做聚合')],
  },
];

const LOGIC_NODES = [
  { id: 'k-branch', kind: 'branch', name: '分支', icon: 'Split', desc: '互斥分支从左到右依次判断，并行分支同时运行所有分支' },
  { id: 'k-loop', kind: 'loop', name: '循环', icon: 'Repeat', desc: '遍历列表，对每一项执行循环体内的节点，可串行或并行' },
  { id: 'k-while', kind: 'loop', variant: 'while', name: 'While 循环', icon: 'RefreshCcw', desc: '条件满足时重复执行循环体，达到最大次数后停止' },
  { id: 'k-delay', kind: 'delay', name: '延迟', icon: 'Hourglass', desc: '等待一段时间，或等到指定时间点后继续' },
  { id: 'k-end', kind: 'end', name: '终止', icon: 'CircleStop', desc: '立即结束本次运行，可标记为成功或失败' },
  { id: 'k-subflow', connector: 'subflows', op: 'call', name: '调用子流程', icon: 'Workflow', desc: '调用另一个工作流并等待它返回' },
  { id: 'k-sub-resp', connector: 'subflows', op: 'respond', name: '子流程响应', icon: 'Reply', desc: '向调用方返回子流程结果' },
  { id: 'k-sync-resp', connector: 'webhook', op: 'respond', name: '同步回调', icon: 'CornerDownLeft', desc: '向同步 Webhook 的调用方返回响应' },
];

const HELPER_NODES = [
  { id: 'k-code', kind: 'code', name: '动态脚本', icon: 'SquareCode', desc: '用 JavaScript 或 Python 处理数据' },
  { id: 'k-variable', kind: 'variable', name: '设置变量', icon: 'Variable', desc: '声明或修改流程内变量' },
  { id: 'k-json', kind: 'json', name: 'JSON 助手', icon: 'Braces', desc: 'JSON 字符串与对象互转' },
  { id: 'c-text-helper', connector: 'text-helper', name: '字符串助手', icon: 'Type' },
  { id: 'c-date-helper', connector: 'date-helper', name: '时间和日期助手', icon: 'CalendarClock' },
  { id: 'c-data-summarizer', connector: 'data-summarizer', name: '列表助手', icon: 'ListOrdered' },
  { id: 'c-data-mapper', connector: 'data-mapper', name: '数据转换', icon: 'ArrowLeftRight' },
  { id: 'c-math-helper', connector: 'math-helper', name: '数学计算', icon: 'Calculator' },
  { id: 'c-http', connector: 'http', name: 'HTTP 请求', icon: 'Globe' },
  { id: 'c-store', connector: 'store', name: '数据存储', icon: 'Database' },
  { id: 'c-csv', connector: 'csv', name: 'CSV 助手', icon: 'Sheet' },
  { id: 'c-xml', connector: 'xml', name: 'XML 助手', icon: 'Code' },
  { id: 'c-crypto', connector: 'crypto', name: '加解密助手', icon: 'LockKeyhole' },
  { id: 'c-file-helper', connector: 'file-helper', name: '文件助手', icon: 'File' },
  { id: 'c-forms', connector: 'forms', op: 'human_approval', name: '人工确认', icon: 'UserCheck' },
];

const AI_NODES = [
  { id: 'k-ai', kind: 'ai', name: 'AI 助手', icon: 'Sparkles', desc: '用大模型总结、分类、抽取文本' },
  { id: 'k-agent', kind: 'agent', name: 'AI 智能体', icon: 'Bot', desc: '在护栏内自主调用连接器、MCP 工具和子流程完成任务' },
  { id: 'c-claude', connector: 'claude', name: 'Claude' },
  { id: 'c-openai', connector: 'openai', name: 'OpenAI' },
  { id: 'c-deepseek', connector: 'deepseek', name: 'DeepSeek' },
];

const TRIGGER_TYPES = [
  { connector: 'webhook', op: 'catch', name: 'Webhook 触发器', icon: 'Globe', desc: '通过 URL 接收其他服务发出的事件' },
  { connector: 'manual-trigger', op: 'manual', name: '手动触发器', icon: 'MousePointerClick', desc: '调试流程时手动触发事件' },
  { connector: 'schedule', op: 'every', name: '定时任务', icon: 'AlarmClock', desc: '按自定义任务计划运行工作流' },
  { connector: 'subflows', op: 'called', name: '子流程触发器', icon: 'Zap', desc: '被其他工作流的「调用子流程」节点调用' },
  { connector: 'alert', op: 'alert', name: '告警触发器', icon: 'Siren', desc: '配置监控告警的触发事件' },
  { connector: 'forms', op: 'form_submitted', name: '表单触发器', icon: 'ClipboardList', desc: '有人提交表单时运行' },
];

const ROLE_OPTIONS = [
  { value: 'owner', label: '所有者', desc: '项目的创建者，可以转移所有权和删除项目' },
  { value: 'editor', label: '可编辑', desc: '可查看和编辑项目' },
  { value: 'viewer', label: '可查看', desc: '仅可查看项目' },
];

const MODULE_PERMS = [
  { value: 'integration', label: '业务集成', fixed: true },
  { value: 'connector', label: '连接器开发' },
  { value: 'mcp', label: 'MCP 服务' },
  { value: 'admin', label: '平台管理' },
];
