const SOL_CATEGORIES = ['全部', '人力资源', '审批协同', '财务', '研发', '通知提醒'];

const SOL_FEISHU_CHATS = ['HR 入职服务', '人力资源部', '行政综合群', 'IT 桌面支持', '集成值班'];

const SOL_FEISHU_DEPTS = { 研发中心: 'od-rd-001', 销售运营部: 'od-sales-002', 人力资源部: 'od-hr-003', 财务部: 'od-fin-004', 信息技术部: 'od-it-005', 行政部: 'od-admin-006' };

const SOL_BEISEN_DEPTS = ['研发中心', '销售运营部', '人力资源部', '财务部', '信息技术部', '行政部', '深圳研发中心-平台组', '华南销售中心-深圳部'];

const SOL_ATTENDANCE_SQL = 'SELECT dept, name, type, minutes\nFROM attendance_exception\nWHERE day = CURDATE() - INTERVAL 1 DAY\n  AND minutes > 10;';

function solAttendancePatch(wf) {
  return { ...wf, steps: wf.steps.map((n) => (n.op === 'execute_query' && n.config && !/minutes > 10/.test(n.config.sql || '') ? { ...n, config: { ...n.config, sql: String(n.config.sql || '').replace(/;?\s*$/, '\n  AND minutes > 10;') } } : n)) };
}

function solMap(rows) {
  return { $map: { mode: 'object', fields: rows.map(([target, source, transforms]) => ({ id: uid('m'), target, source, transforms: transforms || [] })) } };
}

function solLookup(table) {
  return table ? [{ type: 'lookup', arg: table.id }] : [];
}

const SOLUTION_CATALOG = [
  {
    id: 'beisen-feishu', name: '北森 → 飞书 人员同步', category: '人力资源', provider: 'official', version: '1.2', installs: 860, updatedAt: Date.now() - 12 * DAY,
    summary: '员工入职、调岗、离职后，自动在飞书通讯录开通账号、调整部门、暂停或删除账号，并通知 HR 群和 IT 群。',
    points: ['入职后按部门对照开通飞书账号，可以提前一天发出激活邀请', '调岗时同步部门、直属上级和职务，只处理调岗，不处理入职和离职', '离职当天暂停账号（可以恢复）或删除账号，并通知 IT 回收设备', '同一员工的变动按顺序处理，重复推送的事件自动去重'],
    connectors: ['beisen', 'feishu'],
    workflows: [
      {
        key: 'onboard', name: '员工入职开通飞书账号', desc: '北森入职办完后，按部门对照在飞书开通账号，并在 HR 群发欢迎卡片。',
        trigger: { connector: 'beisen', op: 'onboarding_completed' }, steps: [{ connector: 'feishu', op: 'create_user' }, { connector: 'feishu', op: 'send_card' }],
        build: (cfg, env) => ({
          trigger: { connector: 'beisen', op: 'onboarding_completed', name: '员工入职完成', config: { interval: '5 分钟' }, dedupe: '{{trigger.employee_id}}' },
          steps: [
            { connector: 'feishu', op: 'create_user', name: '开通飞书账号', config: { employee: solMap([['工号', '{{trigger.employee_id}}'], ['姓名', '{{trigger.name}}'], ['手机号', '{{trigger.mobile}}'], ['部门', '{{trigger.department}}', solLookup(env.deptTable)], ['直属上级', '{{trigger.manager}}'], ['职务', '{{trigger.position}}'], ['邮箱', '{{trigger.email}}']]), activateAt: cfg.openAt === 'day0' ? '入职当天 08:00' : '入职前 1 天 08:00' } },
            { connector: 'feishu', op: 'send_card', name: '在 HR 群发欢迎卡片', config: { receiveType: '群聊', receiver: cfg.hrChat, template: '入职欢迎卡片' } },
          ],
        }),
      },
      {
        key: 'transfer', name: '员工调岗同步部门', desc: '北森调岗生效后，更新飞书里的部门、直属上级和职务。',
        trigger: { connector: 'beisen', op: 'employee_changed' }, steps: [{ connector: 'feishu', op: 'update_user' }],
        build: (cfg, env) => ({
          trigger: { connector: 'beisen', op: 'employee_changed', name: '员工调岗', config: { interval: '5 分钟', changeType: '调岗' }, dedupe: '{{trigger.employee_id}}-{{trigger.effective_date}}' },
          steps: [
            { connector: 'feishu', op: 'update_user', name: '更新飞书部门和上级', config: { employee: solMap([['工号', '{{trigger.employee_id}}'], ['部门', '{{trigger.department}}', solLookup(env.deptTable)], ['直属上级', '{{trigger.manager}}'], ['职务', '{{trigger.position}}']]) } },
          ],
        }),
      },
      {
        key: 'leave', name: '员工离职处理飞书账号', desc: '北森离职生效当天暂停或删除飞书账号（安装时选择），并通知 IT 回收设备。',
        trigger: { connector: 'beisen', op: 'employee_left' }, steps: [{ connector: 'feishu', op: 'freeze_user' }, { connector: 'feishu', op: 'send_message' }],
        build: (cfg) => ({
          trigger: { connector: 'beisen', op: 'employee_left', name: '员工离职', config: { interval: '15 分钟' }, dedupe: '{{trigger.employee_id}}' },
          steps: [
            cfg.leaveAction === 'delete'
              ? { connector: 'feishu', op: 'delete_user', name: '删除飞书账号', config: { employeeId: '{{trigger.employee_id}}', heir: '直属上级' } }
              : { connector: 'feishu', op: 'freeze_user', name: '暂停飞书账号', config: { employeeId: '{{trigger.employee_id}}' } },
            { connector: 'feishu', op: 'send_message', name: '通知 IT 回收设备', config: { receiveType: '群聊', receiver: cfg.itChat, content: `{{trigger.name}}（{{trigger.employee_id}}）已离职，飞书账号已${cfg.leaveAction === 'delete' ? '删除，文档和邮件已转给直属上级' : '暂停'}，请回收设备` } },
          ],
        }),
      },
    ],
    mappingTables: [{ name: '北森部门 → 飞书部门', keyLabel: '北森部门', valueLabel: '飞书部门 ID', desc: '开通账号和调岗时用它把北森部门换成飞书部门', matches: SOL_FEISHU_DEPTS }],
    alerts: ['人员同步出现新问题时通知值班群'],
    config: [
      { key: 'hrChat', label: 'HR 通知群', type: 'select', options: SOL_FEISHU_CHATS, defaultValue: 'HR 入职服务', affects: ['员工入职开通飞书账号'], hint: '入职欢迎卡片发到这个群' },
      { key: 'itChat', label: 'IT 通知群', type: 'select', options: SOL_FEISHU_CHATS, defaultValue: 'IT 桌面支持', affects: ['员工离职处理飞书账号'], hint: '离职后提醒回收设备' },
      { key: 'openAt', label: '开通时间', type: 'radio', options: [{ value: 'day0', label: '入职当天 08:00' }, { value: 'day-1', label: '入职前 1 天 08:00', desc: '新员工第一天就能登录；飞书会提前发出激活邀请' }], defaultValue: 'day-1', affects: ['员工入职开通飞书账号'] },
      { key: 'leaveAction', label: '离职处理', type: 'radio', options: [{ value: 'freeze', label: '暂停账号（推荐）', desc: '不能登录，数据保留，可以恢复' }, { value: 'delete', label: '直接删除账号', desc: '不可恢复；文档、邮件转给直属上级', danger: true }], defaultValue: 'freeze', affects: ['员工离职处理飞书账号'] },
      { key: 'deptMap', label: '部门对照', type: 'radio', options: [{ value: 'auto', label: '按部门名称自动匹配，安装后确认' }, { value: 'manual', label: '安装后手工维护映射表' }], defaultValue: 'auto', affects: ['员工入职开通飞书账号', '员工调岗同步部门'], table: true },
    ],
    checks: [
      { key: 'conn-beisen', label: '北森连接可用', kind: 'connection', connector: 'beisen', blocking: true },
      { key: 'conn-feishu', label: '飞书连接可用', kind: 'connection', connector: 'feishu', blocking: true },
      { key: 'perm', label: '飞书应用已开通所需权限', detail: '更新通讯录、通过手机号或邮箱获取用户 ID、以应用身份发消息', who: '飞书管理员', blocking: true, sim: 'pass' },
      { key: 'scope', label: '飞书应用的通讯录权限范围覆盖要同步的部门', detail: '范围之外的部门无法开通账号，会在运行时报 40004', who: '飞书管理员', blocking: false, sim: 'fail-once', fix: ['飞书管理后台 › 工作台 › 应用管理 › 星河集成助手 › 权限管理 › 通讯录权限范围', '选「全部成员」，或加上「深圳研发中心」', '创建应用版本，并审核通过'], failText: '当前范围缺少「深圳研发中心」，北森里有 5 名员工在这个部门' },
      { key: 'ip', label: '北森开放平台的 IP 白名单包含本实例出口 IP', detail: '本实例出口 IP：118.31.42.17', who: '北森管理员', blocking: false, sim: 'warn', failText: '无法从这里确认，请北森管理员核对白名单；不在白名单时，北森会拒绝调用' },
    ],
    versions: [
      { v: '1.2', at: Date.now() - 12 * DAY, notes: '新增「员工调岗同步部门」；离职默认改为暂停账号' },
      { v: '1.1', at: Date.now() - 40 * DAY, notes: '入职开通改为按工号查重，已有账号时直接返回' },
      { v: '1.0', at: Date.now() - 90 * DAY, notes: '首个版本' },
    ],
  },
  {
    id: 'beisen-wecom', name: '北森 → 企业微信 人员同步', category: '人力资源', provider: 'official', version: '1.0', installs: 312, updatedAt: Date.now() - 20 * DAY,
    summary: '门店和分公司常用：北森员工入职、离职后，同步企业微信成员并通知店长或 HR。',
    points: ['入职后在企业微信创建成员，按部门对照放进对应部门', '离职当天禁用成员，聊天记录保留，可以恢复'],
    connectors: ['beisen', 'wecom'],
    workflows: [
      {
        key: 'onboard', name: '员工入职创建企业微信成员', desc: '北森入职办完后创建成员并通知店长。',
        trigger: { connector: 'beisen', op: 'onboarding_completed' }, steps: [{ connector: 'wecom', op: 'create_member' }, { connector: 'wecom', op: 'send_app_message' }],
        build: (cfg, env) => ({
          trigger: { connector: 'beisen', op: 'onboarding_completed', name: '员工入职完成', config: { interval: '5 分钟' }, dedupe: '{{trigger.employee_id}}' },
          steps: [
            { connector: 'wecom', op: 'create_member', name: '创建企业微信成员', config: { employee: solMap([['工号', '{{trigger.employee_id}}'], ['姓名', '{{trigger.name}}'], ['手机号', '{{trigger.mobile}}'], ['部门', '{{trigger.department}}', solLookup(env.deptTable)], ['职务', '{{trigger.position}}']]) } },
            { connector: 'wecom', op: 'send_app_message', name: cfg.notify === 'manager' ? '通知店长' : '通知 HR', config: { receiver: cfg.notify === 'manager' ? '{{trigger.manager}}' : '人力资源部', content: '新员工 {{trigger.name}}（{{trigger.employee_id}}）已加入企业微信，请安排入职引导' } },
          ],
        }),
      },
      {
        key: 'leave', name: '员工离职禁用企业微信成员', desc: '北森离职当天禁用成员。',
        trigger: { connector: 'beisen', op: 'employee_left' }, steps: [{ connector: 'wecom', op: 'disable_member' }, { connector: 'wecom', op: 'send_app_message' }],
        build: (cfg) => ({
          trigger: { connector: 'beisen', op: 'employee_left', name: '员工离职', config: { interval: '15 分钟' }, dedupe: '{{trigger.employee_id}}' },
          steps: [
            { connector: 'wecom', op: 'disable_member', name: '禁用企业微信成员', config: { employeeId: '{{trigger.employee_id}}' } },
            { connector: 'wecom', op: 'send_app_message', name: cfg.notify === 'manager' ? '通知店长' : '通知 HR', config: { receiver: cfg.notify === 'manager' ? '{{trigger.manager}}' : '人力资源部', content: '{{trigger.name}}（{{trigger.employee_id}}）已离职，企业微信成员已禁用' } },
          ],
        }),
      },
    ],
    mappingTables: [{ name: '北森部门 → 企业微信部门', keyLabel: '北森部门', valueLabel: '企业微信部门 ID', desc: '创建成员时用它把北森部门换成企业微信部门', matches: {} }],
    alerts: ['人员同步出现新问题时通知值班群'],
    config: [
      { key: 'notify', label: '通知谁', type: 'radio', options: [{ value: 'manager', label: '所在门店店长' }, { value: 'hr', label: 'HR' }], defaultValue: 'manager', affects: ['员工入职创建企业微信成员', '员工离职禁用企业微信成员'] },
    ],
    checks: [
      { key: 'conn-beisen', label: '北森连接可用', kind: 'connection', connector: 'beisen', blocking: true },
      { key: 'conn-wecom', label: '企业微信连接可用', kind: 'connection', connector: 'wecom', blocking: true },
      { key: 'sync', label: '企业微信已开启通讯录同步', detail: '只有通讯录同步 Secret 能写成员；需要配置企业可信 IP', who: '企业微信管理员', blocking: true, sim: 'pass' },
    ],
    versions: [{ v: '1.0', at: Date.now() - 20 * DAY, notes: '首个版本' }],
  },
  {
    id: 'beisen-dingtalk', name: '北森 → 钉钉 人员同步', category: '人力资源', provider: 'official', version: '0.9', installs: 0, updatedAt: Date.now() - 3 * DAY, building: true,
    summary: '钉钉连接器的写操作还在开发，暂不能安装。',
    points: [], connectors: ['beisen', 'dingtalk'], workflows: [], mappingTables: [], alerts: [], config: [], checks: [], versions: [],
  },
  {
    id: 'onboard-it', name: '入职前一天提醒 IT 准备设备', category: '人力资源', provider: 'official', version: '1.1', installs: 540, updatedAt: Date.now() - 30 * DAY,
    summary: '每个工作日下午查询预计入职的员工，把名单发到 IT 群。',
    points: ['工作日 17:00 运行，跳过法定节假日', '名单里带部门、岗位和入职日期'],
    connectors: ['schedule', 'beisen', 'feishu'],
    workflows: [{
      key: 'remind', name: '入职前一天提醒 IT', desc: '查询预计入职的员工并通知 IT。',
      trigger: { connector: 'schedule', op: 'every' }, steps: [{ connector: 'beisen', op: 'list_onboarding' }, { connector: 'feishu', op: 'send_card' }],
      build: (cfg) => ({
        trigger: { connector: 'schedule', op: 'every', name: '定时任务', config: { mode: '按周触发', weekdays: ['周一', '周二', '周三', '周四', '周五'], at: cfg.at, timezone: 'Asia/Shanghai', skipHoliday: true } },
        steps: [
          { connector: 'beisen', op: 'list_onboarding', name: '查询待入职员工', config: { entryDate: cfg.entryDate } },
          { connector: 'feishu', op: 'send_card', name: '通知 IT 准备设备', config: { receiveType: '群聊', receiver: cfg.chat, template: '通用通知卡片' } },
        ],
      }),
    }],
    mappingTables: [], alerts: [],
    config: [
      { key: 'chat', label: '通知群', type: 'select', options: SOL_FEISHU_CHATS, defaultValue: 'IT 桌面支持', affects: ['入职前一天提醒 IT'] },
      { key: 'entryDate', label: '提醒哪天入职的人', type: 'select', options: ['明天', '后天', '本周内'], defaultValue: '明天', affects: ['入职前一天提醒 IT'] },
      { key: 'at', label: '运行时间', type: 'select', options: ['16:00', '17:00', '18:00'], defaultValue: '17:00', affects: ['入职前一天提醒 IT'] },
    ],
    checks: [
      { key: 'conn-beisen', label: '北森连接可用', kind: 'connection', connector: 'beisen', blocking: true },
      { key: 'conn-feishu', label: '飞书连接可用', kind: 'connection', connector: 'feishu', blocking: true },
    ],
    versions: [{ v: '1.1', at: Date.now() - 30 * DAY, notes: '名单带上岗位和入职日期' }, { v: '1.0', at: Date.now() - 80 * DAY, notes: '首个版本' }],
  },
  {
    id: 'attendance-alert', name: '每日考勤异常提醒', category: '人力资源', provider: 'official', version: '1.1', installs: 1260, updatedAt: Date.now() - 8 * DAY,
    summary: '工作日早上汇总前一天的迟到、缺卡，发到管理群。',
    points: ['工作日运行，跳过法定节假日', '只发到管理群，不在大群里公开'],
    connectors: ['schedule', 'mysql', 'feishu'],
    workflows: [{
      key: 'daily', name: '每日考勤异常日报', desc: '汇总前一天的考勤异常并发到管理群。',
      trigger: { connector: 'schedule', op: 'every' }, steps: [{ connector: 'mysql', op: 'execute_query' }, { connector: 'feishu', op: 'send_card' }],
      build: (cfg) => ({
        trigger: { connector: 'schedule', op: 'every', name: '定时任务', config: { mode: '按周触发', weekdays: ['周一', '周二', '周三', '周四', '周五'], at: cfg.at, timezone: 'Asia/Shanghai', skipHoliday: true } },
        steps: [
          { connector: 'mysql', op: 'execute_query', name: '查询考勤异常', config: { sql: SOL_ATTENDANCE_SQL } },
          { connector: 'feishu', op: 'send_card', name: '推送到管理群', config: { receiveType: '群聊', receiver: cfg.chat, template: '考勤日报卡片' } },
        ],
      }),
    }],
    mappingTables: [], alerts: [],
    config: [
      { key: 'chat', label: '通知群', type: 'select', options: ['部门负责人群', ...SOL_FEISHU_CHATS], defaultValue: '部门负责人群', affects: ['每日考勤异常日报'] },
      { key: 'at', label: '运行时间', type: 'select', options: ['09:00', '09:30', '10:00'], defaultValue: '09:30', affects: ['每日考勤异常日报'] },
    ],
    checks: [
      { key: 'conn-mysql', label: '考勤库连接可用', kind: 'connection', connector: 'mysql', blocking: true },
      { key: 'conn-feishu', label: '飞书连接可用', kind: 'connection', connector: 'feishu', blocking: true },
      { key: 'table', label: '考勤库里有 attendance_exception 表', detail: '表里需要 dept、name、type、minutes、day 五列', who: '考勤系统管理员', blocking: false, sim: 'warn', failText: '无法从这里确认，请考勤系统管理员核对表结构' },
    ],
    versions: [
      { v: '1.1', at: Date.now() - 8 * DAY, notes: '只汇总迟到、缺卡超过 10 分钟的记录', changes: ['「查询考勤异常」的 SQL 加上 minutes > 10'], patch: solAttendancePatch },
      { v: '1.0', at: Date.now() - 60 * DAY, notes: '首个版本' },
    ],
  },
  {
    id: 'approval-kingdee', name: '飞书采购审批通过后生成金蝶采购订单', category: '财务', provider: 'official', version: '1.0', installs: 205, updatedAt: Date.now() - 15 * DAY,
    summary: '采购申请审批通过后，在金蝶云星空保存并提交采购订单，把订单号发给申请人。',
    points: ['按审批单号查重，同一张审批不会生成两张订单', '采购明细逐行映射成金蝶明细行，物料编码走映射表', '金蝶里的审核由财务完成，平台只负责保存和提交'],
    connectors: ['feishu', 'kingdee'],
    workflows: [{
      key: 'po', name: '采购审批生成金蝶采购订单', desc: '审批通过后保存并提交采购订单。',
      trigger: { connector: 'feishu', op: 'approval_approved' }, steps: [{ connector: 'feishu', op: 'get_approval' }, { connector: 'kingdee', op: 'save_bill' }, { connector: 'kingdee', op: 'submit_bill' }, { connector: 'feishu', op: 'send_message' }],
      build: (cfg, env) => ({
        trigger: { connector: 'feishu', op: 'approval_approved', name: '审批实例通过', config: { approval: cfg.approval }, dedupe: '{{trigger.instance_code}}', dedupeWindow: '7d' },
        steps: [
          { connector: 'feishu', op: 'get_approval', name: '获取审批表单', config: { instanceCode: '{{trigger.instance_code}}' } },
          { connector: 'kingdee', op: 'save_bill', name: '保存采购订单', config: { formId: 'PUR_PurchaseOrder', model: { $map: { mode: 'object', fields: [
            { id: uid('m'), target: 'FDate', source: '{{trigger.end_time}}', transforms: [{ type: 'date', arg: 'YYYY-MM-DD' }] },
            { id: uid('m'), target: 'FSupplierId', source: '', constant: cfg.supplier, transforms: [] },
            { id: uid('m'), target: 'FEntity', source: '{{s1.form[0].value}}', transforms: [], eachOn: true, each: [
              { id: uid('m'), target: 'FMaterialId', source: '{{item.物料编码}}', transforms: [{ type: 'trim' }, ...solLookup(env.materialTable)] },
              { id: uid('m'), target: 'FQty', source: '{{item.数量}}', transforms: [{ type: 'number' }] },
              { id: uid('m'), target: 'FPrice', source: '{{item.单价}}', transforms: [{ type: 'number' }, { type: 'round', arg: '2' }] },
            ] },
          ] } } } },
          { connector: 'kingdee', op: 'submit_bill', name: '提交采购订单', config: { formId: 'PUR_PurchaseOrder', number: '{{s2.Result.Number}}' } },
          { connector: 'feishu', op: 'send_message', name: '通知申请人', config: { receiveType: '用户', receiver: '{{trigger.user_id}}', content: '你的采购申请已生成金蝶订单 {{s2.Result.Number}}' } },
        ],
      }),
    }],
    mappingTables: [{ name: '物料编码对照', keyLabel: '采购物料编码', valueLabel: '金蝶物料内码', desc: '采购申请里的物料编码换成金蝶物料内码', matches: {} }],
    alerts: ['采购订单出现新问题时通知财务群'],
    config: [
      { key: 'approval', label: '审批定义', type: 'select', options: ['采购申请（新）', '大额报销复核', '请假', '用印申请'], defaultValue: '采购申请（新）', affects: ['采购审批生成金蝶采购订单'] },
      { key: 'supplier', label: '默认供应商编码', type: 'text', defaultValue: 'VEN00018', affects: ['采购审批生成金蝶采购订单'], hint: '审批表单里没有供应商时，订单用这个供应商' },
    ],
    checks: [
      { key: 'conn-feishu', label: '飞书连接可用', kind: 'connection', connector: 'feishu', blocking: true },
      { key: 'conn-kingdee', label: '金蝶连接可用', kind: 'connection', connector: 'kingdee', blocking: true },
      { key: 'unique', label: '金蝶采购订单已开启「第三方单据编号」唯一校验', detail: '防止人工录入同一审批号的单据', who: '金蝶管理员', blocking: false, sim: 'warn', failText: '无法从这里确认，请金蝶管理员核对' },
    ],
    versions: [{ v: '1.0', at: Date.now() - 15 * DAY, notes: '首个版本' }],
  },
  {
    id: 'gitlab-jira', name: '流水线失败自动建缺陷', category: '研发', provider: 'official', version: '1.0', installs: 430, updatedAt: Date.now() - 50 * DAY,
    summary: 'GitLab 流水线失败时在 Jira 创建缺陷。',
    points: ['同一条流水线只建一个缺陷'],
    connectors: ['gitlab', 'jira'],
    workflows: [{
      key: 'bug', name: '流水线失败自动建缺陷', desc: '失败时建缺陷。',
      trigger: { connector: 'gitlab', op: 'pipeline_failed' }, steps: [{ connector: 'jira', op: 'create_issue' }],
      build: (cfg) => ({
        trigger: { connector: 'gitlab', op: 'pipeline_failed', name: '流水线失败', config: {}, dedupe: '{{trigger.pipeline_id}}' },
        steps: [{ connector: 'jira', op: 'create_issue', name: '创建缺陷', config: { project: cfg.project, issueType: '缺陷', summary: '流水线失败：{{trigger.ref}} · {{trigger.stage}}' } }],
      }),
    }],
    mappingTables: [], alerts: [],
    config: [{ key: 'project', label: 'Jira 项目', type: 'select', options: ['PLAT', 'IT', 'HR'], defaultValue: 'PLAT', affects: ['流水线失败自动建缺陷'] }],
    checks: [{ key: 'conn-gitlab', label: 'GitLab 连接可用', kind: 'connection', connector: 'gitlab', blocking: true }, { key: 'conn-jira', label: 'Jira 连接可用', kind: 'connection', connector: 'jira', blocking: true }],
    versions: [{ v: '1.0', at: Date.now() - 50 * DAY, notes: '首个版本' }],
  },
];

function solAll(state) {
  return [...SOLUTION_CATALOG, ...(state.customSolutions || [])];
}

function solById(state, id) {
  return solAll(state).find((x) => x.id === id);
}

function solInstalls(state, id) {
  return (state.solutionInstalls || []).filter((i) => !id || i.solutionId === id);
}

function solVersionCmp(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function solProviderLabel(sol) {
  return sol.provider === 'official' ? '官方' : '本企业';
}

function solConnectorsOf(sol) {
  if (sol.connectors && sol.connectors.length) return sol.connectors;
  return [...new Set(sol.workflows.flatMap((w) => (w.graph ? [w.graph.trigger, ...w.graph.steps] : [w.trigger, ...w.steps]).map((n) => n && n.connector).filter(Boolean)))];
}

function solUsableConnections(state, connector, pid) {
  const testTargets = new Set(pid ? projectEnvs(state, pid).filter((e) => e.key === 'test').flatMap((e) => Object.values(e.connectionMap || {})) : []);
  return state.connections.filter((c) => !testTargets.has(c.id)).filter((c) => c.connector === connector && (!pid || c.scope === 'tenant' || (c.projectIds || []).includes(pid)) && connectionPerm(state, c));
}

function SolChain({ connectors, size = 26 }) {
  return html`<div className="sol-chain">
    ${connectors.slice(0, 4).map((id, i) => html`<${Fragment} key=${id}>
      ${i > 0 && html`<${Icon} name="ChevronRight" size=${12} className="muted" />`}
      <${ConnectorIcon} id=${id} size=${size} tile />
    <//>`)}
  </div>`;
}

function SolCard({ sol, installed, onClick }) {
  return html`<button type="button" className=${cx('sol-card', sol.building && 'is-building')} onClick=${onClick}>
    <div className="row"><${SolChain} connectors=${solConnectorsOf(sol)} /><span className="spacer" />${sol.building ? html`<${Tag} size="sm" tone="warning">开发中<//>` : installed > 0 && html`<${Tag} size="sm" tone="success" icon="Check">已安装<//>`}</div>
    <div className="sol-card-name">${sol.name}</div>
    <div className="sol-card-desc">${sol.summary}</div>
    <div className="sol-card-foot">
      <span>${solProviderLabel(sol)}</span>
      <span>v${sol.version}</span>
      <span>${sol.workflows.length} 个工作流</span>
      ${sol.provider === 'official' && sol.installs > 0 && html`<span className="row-4"><${Icon} name="Download" size=${12} />${fmt.number(sol.installs)}</span>`}
    </div>
  </button>`;
}

function SolutionsPage({ query }) {
  const state = useStore();
  const tab = ['market', 'installed', 'mine'].includes(query.tab) ? query.tab : 'market';
  const [cat, setCat] = useState('全部');
  const [q, setQ] = useState('');
  const [generating, setGenerating] = useState(false);
  const [upgrading, setUpgrading] = useState(null);
  const installs = solInstalls(state);
  const mine = state.customSolutions || [];
  const ql = q.trim().toLowerCase();
  const market = solAll(state)
    .filter((s) => cat === '全部' || s.category === cat)
    .filter((s) => !ql || `${s.name}${s.summary}${solConnectorsOf(s).map((c) => (resolveConnector(c) || {}).name).join('')}`.toLowerCase().includes(ql));
  const setTab = (t) => navigate(t === 'market' ? '/solutions' : `/solutions?tab=${t}`);
  return html`<div className="page"><div className="page-inner">
    <${PageHeader}
      title="方案"
      description="装上就能用的一组工作流、映射表和告警。安装时按向导选连接、填配置、过安装检查。"
      actions=${html`<${Button} icon="PackagePlus" onClick=${() => setGenerating(true)}>基于项目生成方案<//>`}
      tabs=${html`<${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'market', label: '方案市场' }, { value: 'installed', label: '已安装', count: installs.length }, { value: 'mine', label: '本企业开发', count: mine.length }]} />`}
    />
    ${tab === 'market' && html`<${Fragment}>
      <div className="toolbar sol-toolbar">
        <div className="sol-cats">${SOL_CATEGORIES.map((c) => html`<button key=${c} type="button" className=${cx('chip', cat === c && 'is-active')} onClick=${() => setCat(c)}>${c}</button>`)}</div>
        <span className="spacer" />
        <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索方案或连接器" />
      </div>
      ${market.length
        ? html`<div className="sol-grid">${market.map((s) => html`<${SolCard} key=${s.id} sol=${s} installed=${solInstalls(state, s.id).length} onClick=${() => navigate(`/solutions/${s.id}`)} />`)}</div>`
        : html`<div className="card"><${Empty} icon="SearchX" title="没有找到相关方案" description="换个关键词，或者基于自己的项目生成方案。" /></div>`}
    <//>`}
    ${tab === 'installed' && (installs.length
      ? html`<${Table}
        onRowClick=${(r) => navigate(`/solutions/${r.solutionId}`)}
        columns=${[
          { key: 'name', title: '方案', render: (r) => { const s = solById(state, r.solutionId); return s ? html`<div className="cell-main"><${SolChain} connectors=${solConnectorsOf(s)} size=${22} /><span className="cell-title">${s.name}</span></div>` : '已下架的方案'; } },
          { key: 'ver', title: '版本', width: 150, render: (r) => { const s = solById(state, r.solutionId); const newer = s && solVersionCmp(s.version, r.version) > 0; return html`<span className="row">v${r.version}${newer && html`<${Tag} size="sm" tone="primary">可升级到 v${s.version}<//>`}</span>`; } },
          { key: 'project', title: '安装到', width: 150, render: (r) => { const p = state.projects.find((x) => x.id === r.projectId); return p ? html`<span className="row-4"><${ProjectAvatar} project=${p} size=${18} />${p.name}</span>` : '-'; } },
          { key: 'wf', title: '工作流', width: 150, render: (r) => { const wfs = state.workflows.filter((w) => r.workflowIds.includes(w.id)); return html`<span>${wfs.length} 个 · <span className="muted">${wfs.filter((w) => w.status === 'enabled').length} 个运行中</span></span>`; } },
          { key: 'by', title: '安装人', width: 150, render: (r) => html`<span>${personName(r.by)} <span className="muted text-xs">${fmt.relative(r.installedAt)}</span></span>` },
          { key: 'op', title: '', width: 90, render: (r) => { const s = solById(state, r.solutionId); return s && solVersionCmp(s.version, r.version) > 0 && html`<${Button} size="sm" onClick=${(e) => { e.stopPropagation(); setUpgrading(r); }}>升级<//>`; } },
        ]}
        data=${installs}
      />`
      : html`<div className="card"><${Empty} icon="Package" title="还没有安装方案" action=${html`<${Button} variant="primary" onClick=${() => setTab('market')}>去方案市场<//>`} /></div>`)}
    ${tab === 'mine' && (mine.length
      ? html`<div className="sol-grid">${mine.map((s) => html`<${SolCard} key=${s.id} sol=${s} installed=${solInstalls(state, s.id).length} onClick=${() => navigate(`/solutions/${s.id}`)} />`)}</div>`
      : html`<div className="card"><${Empty} icon="PackagePlus" title="还没有本企业开发的方案" description="把一个项目里调通的工作流、映射表打包成方案，其他项目就能按向导安装。" action=${html`<${Button} variant="primary" onClick=${() => setGenerating(true)}>基于项目生成方案<//>`} /></div>`)}
    <${SolGenerateModal} open=${generating} onClose=${() => setGenerating(false)} />
    ${upgrading && html`<${SolUpgradeModal} install=${upgrading} onClose=${() => setUpgrading(null)} />`}
  </div></div>`;
}

function SolutionDetailPage({ id }) {
  const state = useStore();
  const sol = solById(state, id);
  const [upgrading, setUpgrading] = useState(null);
  const [releasing, setReleasing] = useState(false);
  if (!sol) return html`<div className="page"><div className="page-inner"><${Empty} icon="PackageX" title="方案不存在或已下架" action=${html`<${Button} onClick=${() => navigate('/solutions')}>回到方案市场<//>`} /></div></div>`;
  const installs = solInstalls(state, sol.id);
  return html`<div className="page"><div className="page-inner">
    <${Breadcrumb} items=${[{ label: '方案', to: '/solutions' }, { label: sol.name }]} />
    <div className="sol-head">
      <${SolChain} connectors=${solConnectorsOf(sol)} size=${40} />
      <div className="grow">
        <h1 className="page-title">${sol.name}</h1>
        <div className="muted">${solProviderLabel(sol)} · v${sol.version} · ${sol.category} · 更新于 ${fmt.date(sol.updatedAt || Date.now())}${sol.provider === 'official' && sol.installs ? ` · ${fmt.number(sol.installs)} 次安装` : ''}</div>
      </div>
      ${sol.provider === 'tenant' && html`<${Button} icon="Upload" onClick=${() => setReleasing(true)}>发布新版本<//>`}
      ${sol.building
        ? html`<${Button} disabled>开发中，暂不能安装<//>`
        : html`<${Button} variant="primary" icon="Download" onClick=${() => navigate(`/solutions/${sol.id}/install`)}>${installs.length ? '再安装一份' : '安装'}<//>`}
    </div>
    ${installs.length > 0 && html`<${Alert} tone="success" title=${`已安装到 ${installs.length} 个项目`}>${installs.map((i) => { const p = state.projects.find((x) => x.id === i.projectId); return html`<span key=${i.id} className="sol-installed">${p ? html`<${Link} to=${`/integration/${p.id}`} className="link">${p.name}<//>` : '已删除的项目'}（v${i.version}，${personName(i.by)} ${fmt.relative(i.installedAt)}）${solVersionCmp(sol.version, i.version) > 0 && html`<${Button} size="xs" variant="link" onClick=${() => setUpgrading(i)}>升级到 v${sol.version}<//>`}</span>`; })}<//>`}
    <div className="sol-detail">
      <div className="col" style=${{ gap: 16, minWidth: 0 }}>
        <${Card} title="方案介绍">
          <p>${sol.summary}</p>
          ${sol.points.length > 0 && html`<ul className="sol-points">${sol.points.map((p) => html`<li key=${p}><${Icon} name="Check" size=${14} />${p}</li>`)}</ul>`}
        <//>
        <${Card} title="包含的资源" subtitle="安装后出现在你选的项目里；工作流默认不启用，调试通过后再启用">
          <div className="sol-res">
            ${sol.workflows.map((w) => html`<div key=${w.key || w.name} className="sol-res-row">
              <span className="sol-res-icon"><${Icon} name="Workflow" size=${16} /></span>
              <div className="grow"><b>${w.name}</b><div className="text-xs muted">${w.desc || ''}</div></div>
              ${w.trigger && html`<${SolChain} connectors=${[w.trigger.connector, ...w.steps.map((s) => s.connector)].filter((v, i, a) => a.indexOf(v) === i)} size=${22} />`}
            </div>`)}
            ${sol.mappingTables.map((m) => html`<div key=${m.name} className="sol-res-row"><span className="sol-res-icon"><${Icon} name="Table2" size=${16} /></span><div className="grow"><b>映射表「${m.name}」</b><div className="text-xs muted">${m.desc}</div></div></div>`)}
            ${sol.alerts.map((a) => html`<div key=${a} className="sol-res-row"><span className="sol-res-icon"><${Icon} name="BellRing" size=${16} /></span><div className="grow"><b>告警策略</b><div className="text-xs muted">${a}</div></div></div>`)}
          </div>
        <//>
        ${sol.checks.length > 0 && html`<${Card} title="安装前要准备" subtitle="安装向导的最后一步会逐项检查；标「必须」的不通过就不能安装">
          <div className="sol-res">
            ${sol.checks.map((c) => html`<div key=${c.key} className="sol-res-row">
              <span className="sol-res-icon"><${Icon} name="ClipboardCheck" size=${16} /></span>
              <div className="grow"><b>${c.label}</b>${c.detail && html`<div className="text-xs muted">${c.detail}</div>`}</div>
              ${c.who && html`<${Tag} size="sm">${c.who}<//>`}
              <${Tag} size="sm" tone=${c.blocking ? 'danger' : 'default'}>${c.blocking ? '必须' : '建议'}<//>
            </div>`)}
          </div>
        <//>`}
      </div>
      <aside className="col" style=${{ gap: 16 }}>
        <${Card} title="需要的连接">
          <div className="col" style=${{ gap: 8 }}>
            ${solConnectorsOf(sol).filter((c) => (resolveConnector(c) || {}).auth !== 'none').map((c) => { const conn = resolveConnector(c); const have = state.connections.filter((x) => x.connector === c).length; return html`<div key=${c} className="row"><${ConnectorIcon} id=${c} size=${24} /><span className="grow">${conn ? conn.name : c}</span><span className="text-xs muted">${have ? `已有 ${have} 个连接` : '需要新建'}</span></div>`; })}
          </div>
        <//>
        ${sol.config.length > 0 && html`<${Card} title="安装时要填的配置">
          <div className="col" style=${{ gap: 10 }}>${sol.config.map((c) => html`<div key=${c.key} className="sol-cfg"><div className="row-4"><${Icon} name="SlidersHorizontal" size=${13} className="muted" /><span>${c.label}</span></div><div className="text-xs muted">默认：${solDefaultLabel(c)}</div></div>`)}</div>
        <//>`}
        ${sol.versions.length > 0 && html`<${Card} title="版本记录">
          <div className="col" style=${{ gap: 10 }}>${sol.versions.map((v) => html`<div key=${v.v}><div className="row"><b>v${v.v}</b><span className="text-xs muted">${fmt.date(v.at)}</span></div><div className="text-xs muted">${v.notes}</div></div>`)}</div>
        <//>`}
      </aside>
    </div>
    ${upgrading && html`<${SolUpgradeModal} install=${upgrading} onClose=${() => setUpgrading(null)} />`}
    ${releasing && html`<${SolReleaseModal} sol=${sol} onClose=${() => setReleasing(false)} />`}
  </div></div>`;
}

function SolUpgradeModal({ install, onClose }) {
  const state = useStore();
  const sol = solById(state, install.solutionId);
  if (!sol) return null;
  const newer = sol.versions.filter((v) => solVersionCmp(v.v, install.version) > 0);
  const wfs = state.workflows.filter((w) => install.workflowIds.includes(w.id));
  const edited = wfs.filter((w) => w.draftChanged);
  const patches = newer.filter((v) => v.patch).sort((a, b) => solVersionCmp(a.v, b.v)).map((v) => v.patch);
  const changes = newer.flatMap((v) => v.changes || []);
  const upgrade = () => {
    Store.set((s) => ({
      ...s,
      workflows: s.workflows.map((w) => (install.workflowIds.includes(w.id) ? { ...patches.reduce((acc, p) => p(acc), w), draftChanged: true, solution: { id: sol.id, version: sol.version }, updatedAt: Date.now() } : w)),
      solutionInstalls: s.solutionInstalls.map((i) => (i.id === install.id ? { ...i, version: sol.version, upgradedAt: Date.now() } : i)),
    }));
    addAudit('升级方案', `${sol.name} v${install.version} → v${sol.version}`, install.projectId);
    toast.success('已升级。新版本在草稿里，调试后发布才生效');
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} width=${600} title=${`升级到 v${sol.version}`} description=${`${sol.name}，当前 v${install.version}`}
    footer=${html`<${Fragment}><span className="spacer" /><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" onClick=${upgrade}>升级<//><//>`}
  >
    <div className="col" style=${{ gap: 16 }}>
      <div>
        <div className="sol-label">版本变化</div>
        <div className="col" style=${{ gap: 8 }}>${newer.map((v) => html`<div key=${v.v}><div className="row"><b>v${v.v}</b><span className="text-xs muted">${fmt.date(v.at)}</span></div><div className="text-xs">${v.notes}</div></div>`)}</div>
      </div>
      <div>
        <div className="sol-label">升级会做什么</div>
        <ul className="sol-points">
          <li><${Icon} name="Check" size=${14} />把新版本的改动放进 ${wfs.length} 个工作流的草稿。线上正在运行的版本不变，调试后发布才生效</li>
          ${changes.map((c) => html`<li key=${c}><${Icon} name="CornerDownRight" size=${14} />${c}</li>`)}
          <li><${Icon} name="Check" size=${14} />连接、配置、映射表的内容都沿用，不会清空；发布时会列出本次改动</li>
        </ul>
      </div>
      ${edited.length > 0 && html`<${Alert} tone="warning">${edited.map((w) => `「${w.name}」`).join('')}已经有没发布的改动，新版本的改动会叠加在这份草稿上。<//>`}
    </div>
  <//>`;
}

function SolReleaseModal({ sol, onClose }) {
  const state = useStore();
  const [notes, setNotes] = useState('');
  const [major, minor] = sol.version.split('.').map(Number);
  const next = `${major}.${(minor || 0) + 1}`;
  const source = state.projects.find((p) => p.id === sol.sourceProject);
  const live = sol.workflows.map((w) => ({ w, cur: state.workflows.find((x) => x.id === w.key) }));
  const release = () => {
    Store.set((s) => ({
      ...s,
      customSolutions: s.customSolutions.map((x) => (x.id === sol.id ? {
        ...x, version: next, updatedAt: Date.now(),
        workflows: live.map(({ w, cur }) => (cur ? { ...w, name: cur.name, desc: cur.description, graph: JSON.parse(JSON.stringify({ trigger: cur.trigger, steps: cur.steps })) } : w)),
        versions: [{ v: next, at: Date.now(), notes: notes.trim() || '更新工作流' }, ...x.versions],
      } : x)),
    }));
    addAudit('发布方案新版本', `${sol.name} v${next}`, sol.sourceProject);
    toast.success(`已发布 v${next}，安装过的项目会看到「可升级」`);
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} width=${560} title=${`发布 v${next}`} description=${`从来源项目「${source ? source.name : '已删除'}」重新打包`}
    footer=${html`<${Fragment}><span className="spacer" /><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${live.every(({ cur }) => !cur)} onClick=${release}>发布<//><//>`}
  >
    <div className="col" style=${{ gap: 12 }}>
      <div className="sol-res">${live.map(({ w, cur }) => html`<div key=${w.key} className="sol-res-row"><span className="sol-res-icon"><${Icon} name="Workflow" size=${16} /></span><div className="grow"><b>${cur ? cur.name : w.name}</b><div className="text-xs muted">${cur ? '按来源项目里的当前草稿打包' : '来源项目里已删除，沿用上个版本'}</div></div></div>`)}</div>
      <${Field} label="这个版本改了什么" hint="安装过的人升级前会看到"><${Textarea} value=${notes} onChange=${setNotes} rows=${2} placeholder="例如：入职卡片加上工位信息" /><//>
    </div>
  <//>`;
}

function solDefaultLabel(c) {
  if (c.type === 'radio') { const o = c.options.find((x) => x.value === c.defaultValue); return o ? o.label : '-'; }
  return c.defaultValue || '-';
}

function SolutionInstallPage({ id, query }) {
  const state = useStore();
  const sol = solById(state, id);
  const editable = integEditableProjects(state);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState('existing');
  const [pid, setPid] = useState(query.project || (editable[0] || {}).id || null);
  const [newName, setNewName] = useState(sol ? sol.name.replace(/ · .*$/, '') : '');
  const [conns, setConns] = useState({});
  const [config, setConfig] = useState(() => Object.fromEntries(((sol && sol.config) || []).map((c) => [c.key, c.defaultValue])));
  const [checks, setChecks] = useState({});
  const [checking, setChecking] = useState(false);
  const [creatingFor, setCreatingFor] = useState(null);
  const [result, setResult] = useState(null);
  if (!sol || sol.building) return html`<div className="page"><div className="page-inner"><${Empty} icon="PackageX" title="这个方案现在不能安装" action=${html`<${Button} onClick=${() => navigate('/solutions')}>回到方案市场<//>`} /></div></div>`;
  const reusable = target === 'existing' && pid ? (state.mappingTables || []).find((t) => t.projectId === pid && sol.mappingTables.some((m) => m.keyLabel === t.keyLabel && m.valueLabel === t.valueLabel)) : null;
  const needConnectors = solConnectorsOf(sol).filter((c) => (resolveConnector(c) || {}).auth !== 'none');
  const connOf = (c) => state.connections.find((x) => x.id === conns[c]);
  const projectError = target === 'existing' ? (!pid ? '请选择项目' : integLimitError(state, pid)) : (!newName.trim() ? '请输入项目名称' : state.projects.some((p) => p.name === newName.trim()) ? '已有同名项目' : null);
  const connErrors = needConnectors.map((c) => { const conn = connOf(c); if (!conn) return `请为「${(resolveConnector(c) || {}).name || c}」选择连接`; if (conn.status !== 'active') return `「${conn.name}」不可用：${conn.error || '请重新授权'}`; return null; }).filter(Boolean);
  const runChecks = (only) => {
    setChecking(true);
    const list = only ? sol.checks.filter((c) => c.key === only) : sol.checks;
    list.forEach((c, i) => {
      setChecks((prev) => ({ ...prev, [c.key]: { state: 'running' } }));
      setTimeout(() => {
        setChecks((prev) => {
          const before = prev[c.key] || {};
          let st;
          if (c.kind === 'connection') { const conn = connOf(c.connector); st = conn && conn.status === 'active' ? 'pass' : 'fail'; }
          else if (c.sim === 'fail-once') st = before.attempts ? 'pass' : 'fail';
          else if (c.sim === 'warn') st = 'warn';
          else st = 'pass';
          return { ...prev, [c.key]: { state: st, attempts: (before.attempts || 0) + 1, at: Date.now() } };
        });
        if (i === list.length - 1) setChecking(false);
      }, 500 + i * 450);
    });
  };
  const blockingFailed = sol.checks.filter((c) => c.blocking && (checks[c.key] || {}).state !== 'pass');
  const allRan = sol.checks.every((c) => checks[c.key] && checks[c.key].state !== 'running');
  const install = () => {
    const s = Store.get();
    let projectIdFinal = pid;
    let projects = s.projects;
    let members = s.members;
    if (target === 'new') {
      projectIdFinal = uid('p');
      projects = [...projects, { id: projectIdFinal, name: newName.trim(), description: `由方案「${sol.name}」创建`, color: PROJECT_COLORS[1], owner: s.me, createdAt: Date.now(), stages: false }];
      members = [...members, { projectId: projectIdFinal, userId: s.me, role: 'owner' }];
    }
    const connByConnector = Object.fromEntries(needConnectors.map((c) => [c, conns[c]]));
    const chosenIds = Object.values(connByConnector);
    const connections = target === 'new' ? s.connections.map((c) => (chosenIds.includes(c.id) && c.scope !== 'tenant' && !(c.projectIds || []).includes(projectIdFinal) ? { ...c, projectIds: [...(c.projectIds || []), projectIdFinal] } : c)) : s.connections;
    const attach = (node) => (node && node.connector && connByConnector[node.connector] ? { ...node, connectionId: connByConnector[node.connector] } : node);
    const base = { ...s, projects, members, connections };
    const tableResults = sol.mappingTables.map((m) => {
      const existing = (s.mappingTables || []).find((t) => t.projectId === projectIdFinal && t.keyLabel === m.keyLabel && t.valueLabel === m.valueLabel);
      if (existing) return { m, table: existing, reused: true };
      const rows = config.deptMap === 'manual' ? [] : Object.entries(m.matches || {}).map(([k, v]) => ({ k, v }));
      return { m, reused: false, table: { id: uid('mt'), projectId: projectIdFinal, name: m.name, description: m.desc, keyLabel: m.keyLabel, valueLabel: m.valueLabel, missing: 'error', defaultValue: '', updatedAt: Date.now(), updatedBy: s.me, rows } };
    });
    const tables = tableResults.filter((t) => !t.reused).map((t) => t.table);
    const tableByLabel = (label) => (tableResults.find((t) => t.m.keyLabel === label) || {}).table;
    const env = { deptTable: tableByLabel('北森部门'), materialTable: tableByLabel('采购物料编码') };
    const created = sol.workflows.map((w) => {
      const spec = w.build(config, env);
      const triggerBase = triggerFromPick(spec.trigger.connector, spec.trigger.op);
      const orderKey = /employee_id/.test(spec.trigger.dedupe || '') ? '{{trigger.employee_id}}' : '';
      const trigger = attach({
        ...triggerBase, name: spec.trigger.name || triggerBase.name, config: { ...triggerBase.config, ...(spec.trigger.config || {}) },
        ...(spec.trigger.dedupe ? { runSettings: { dedupe: { enabled: true, key: spec.trigger.dedupe, window: spec.trigger.dedupeWindow || '30d' }, concurrency: { max: 5, orderKey } } } : {}),
      });
      const steps = spec.steps.map((st, i) => attach({ ...actionFromPick(st.connector, st.op), id: `s${i + 1}`, name: st.name, config: st.config }));
      const draft = newWorkflow({ projectId: projectIdFinal, name: spec.name || w.name, description: w.desc, trigger, steps });
      return { ...draft, name: integUniqueName(base, projectIdFinal, draft.name), solution: { id: sol.id, version: sol.version } };
    });
    const unmatched = tableResults.filter((t) => t.m.keyLabel === '北森部门').flatMap((t) => SOL_BEISEN_DEPTS.filter((d) => !t.table.rows.some((r) => r.k === d)));
    const policies = sol.alerts.map((a) => ({ id: uid('ap'), name: a, enabled: true, projects: [projectIdFinal], workflows: created.map((w) => w.id), events: ['issue_new', 'issue_reopen'], channels: ['ch_ops'], groupWindow: 30, quiet: { enabled: true, from: '22:00', to: '08:00' }, escalation: { enabled: false, afterMin: 60, channel: null }, updatedBy: s.me, updatedAt: Date.now() }));
    const record = { id: uid('si'), solutionId: sol.id, projectId: projectIdFinal, version: sol.version, installedAt: Date.now(), by: s.me, workflowIds: created.map((w) => w.id), mappingTableIds: tableResults.map((t) => t.table.id), config, skippedChecks: sol.checks.filter((c) => !c.blocking && (checks[c.key] || {}).state !== 'pass').map((c) => c.label) };
    Store.set({
      ...base,
      workflows: [...created, ...s.workflows],
      mappingTables: [...tables, ...(s.mappingTables || [])],
      alertPolicies: [...policies, ...(s.alertPolicies || [])],
      solutionInstalls: [record, ...(s.solutionInstalls || [])],
    });
    addAudit('安装方案', `${sol.name} v${sol.version}`, projectIdFinal);
    setResult({ record, created, tableResults, policies, unmatched, projectId: projectIdFinal });
    setStep(4);
  };
  const steps = [{ title: '选择项目' }, { title: '连接' }, { title: '配置' }, { title: '安装检查' }, { title: '完成' }];
  const canNext = [!projectError, connErrors.length === 0, true, allRan && blockingFailed.length === 0][step];
  const next = () => {
    if (step === 2) { setStep(3); setTimeout(() => runChecks(), 50); return; }
    if (step === 3) { install(); return; }
    setStep(step + 1);
  };
  const project = state.projects.find((p) => p.id === (result ? result.projectId : pid));
  return html`<div className="page"><div className="page-inner sol-install">
    <${Breadcrumb} items=${[{ label: '方案', to: '/solutions' }, { label: sol.name, to: `/solutions/${sol.id}` }, { label: '安装' }]} />
    <div className="row" style=${{ margin: '6px 0 16px' }}><${SolChain} connectors=${solConnectorsOf(sol)} size=${30} /><h1 className="page-title">安装「${sol.name}」</h1><span className="muted">v${sol.version}</span></div>
    <div className="sol-steps"><${Steps} current=${step} items=${steps} onChange=${(i) => { if (i < step && step < 4) setStep(i); }} /></div>
    <div className="sol-body">
      ${step === 0 && html`<div className="col" style=${{ gap: 16, maxWidth: 640 }}>
        <${RadioCards} columns=${2} value=${target} onChange=${setTarget} options=${[{ value: 'existing', label: '安装到已有项目', icon: 'FolderOpen' }, { value: 'new', label: '新建一个项目', icon: 'FolderPlus' }]} />
        ${target === 'existing'
          ? html`<${Field} label="目标项目" required error=${pid && projectError} hint="只列出你有编辑权限的项目"><${Select} value=${pid} onChange=${setPid} placeholder="请选择项目" options=${editable.map((p) => ({ value: p.id, label: p.name, iconNode: html`<${ProjectAvatar} project=${p} size=${18} />`, disabled: Boolean(integLimitError(state, p.id)), desc: integLimitError(state, p.id) || '' }))} /><//>`
          : html`<${Field} label="项目名称" required error=${newName && projectError}><${Input} value=${newName} onChange=${setNewName} /><//>`}
        <div className="sol-summary">
          <div className="sol-label">安装后，${target === 'new' ? '新项目' : '这个项目'}里会多出</div>
          <div className="row" style=${{ flexWrap: 'wrap', gap: 8 }}>
            <${Tag} icon="Workflow">${sol.workflows.length} 个工作流（不启用）<//>
            ${sol.mappingTables.length > 0 && html`<${Tag} icon="Table2">${sol.mappingTables.length} 张映射表<//>`}
            ${sol.alerts.length > 0 && html`<${Tag} icon="BellRing">${sol.alerts.length} 条告警策略<//>`}
          </div>
          ${target === 'existing' && pid && sol.workflows.some((w) => state.workflows.some((x) => x.projectId === pid && x.name === w.name)) && html`<div className="text-xs muted" style=${{ marginTop: 8 }}>项目里已有同名工作流，新装的会自动加后缀「 (2)」。</div>`}
        </div>
      </div>`}
      ${step === 1 && html`<div className="col" style=${{ gap: 14, maxWidth: 720 }}>
        <div className="muted">方案里的节点会使用这里选的连接。同一个系统可以复用已有的连接，也可以新建。${target === 'new' ? '新项目会自动加入所选连接的可用范围。' : ''}</div>
        ${needConnectors.map((c) => {
          const meta = resolveConnector(c) || { name: c };
          const options = solUsableConnections(state, c, target === 'existing' ? pid : null);
          const conn = connOf(c);
          return html`<div key=${c} className="sol-conn">
            <${ConnectorIcon} id=${c} size=${32} />
            <div className="grow">
              <div className="row"><b>${meta.name}</b><span className="text-xs muted">用在：${sol.workflows.filter((w) => [w.trigger, ...(w.steps || [])].some((n) => n && n.connector === c)).map((w) => w.name).join('、') || '方案的工作流'}</span></div>
              <div className="row" style=${{ marginTop: 8 }}>
                <${Select} width=${320} value=${conns[c] || null} onChange=${(v) => setConns({ ...conns, [c]: v })} placeholder=${options.length ? '选择连接' : '还没有可用的连接'} options=${options.map((x) => ({ value: x.id, label: x.name, desc: x.status === 'active' ? x.account : `不可用：${x.error || '请重新授权'}` }))} />
                <${Button} icon="Plus" onClick=${() => setCreatingFor(c)}>新建连接<//>
              </div>
              ${conn && conn.status !== 'active' && html`<div className="field-error">「${conn.name}」不可用：${conn.error || '请重新授权'}。请到「连接」页重新授权，或选择其他连接。</div>`}
              ${conn && conn.status === 'active' && html`<div className="text-xs sol-ok"><${Icon} name="CircleCheck" size=${12} /> 连接正常</div>`}
            </div>
          </div>`;
        })}
        ${creatingFor && html`<${NewConnectionModal} open=${true} onClose=${() => setCreatingFor(null)} presetConnector=${creatingFor} presetProject=${target === 'existing' ? pid : null} onCreated=${(conn) => { setConns((m) => ({ ...m, [creatingFor]: conn.id })); setCreatingFor(null); }} />`}
      </div>`}
      ${step === 2 && html`<div className="col" style=${{ gap: 18, maxWidth: 720 }}>
        ${sol.config.length === 0 && html`<div className="muted">这个方案没有需要填写的配置。</div>`}
        ${sol.config.map((c) => html`<${Field} key=${c.key} label=${c.label} hint=${`影响：${c.affects.join('、')}${c.hint ? `。${c.hint}` : ''}`}>
          ${c.type === 'select'
            ? html`<${Select} width=${320} value=${config[c.key]} onChange=${(v) => setConfig({ ...config, [c.key]: v })} options=${c.options.map((o) => ({ value: o, label: o }))} />`
            : c.type === 'text'
              ? html`<${Input} width=${320} value=${config[c.key]} onChange=${(v) => setConfig({ ...config, [c.key]: v })} />`
              : html`<${RadioCards} columns=${c.options.length > 2 ? 3 : 2} disabled=${Boolean(c.table && reusable)} value=${config[c.key]} onChange=${(v) => setConfig({ ...config, [c.key]: v })} options=${c.options.map((o) => ({ value: o.value, label: o.label, desc: o.desc }))} />`}
          ${c.table && reusable && html`<${Alert} tone="info" className="sol-gap">项目里已有映射表「${reusable.name}」（${reusable.rows.length} 条对照），会直接沿用，这一项不会生效。<//>`}
          ${c.key === 'leaveAction' && config.leaveAction === 'delete' && html`<${Alert} tone="warning" className="sol-gap">删除不可恢复。文档、邮件会转给直属上级，没有上级时保留在原账号名下；日程和问卷会被删除。<//>`}
        <//>`)}
      </div>`}
      ${step === 3 && html`<div className="col" style=${{ gap: 12, maxWidth: 820 }}>
        <div className="row"><span className="muted grow">逐项检查安装前提。标「必须」的不通过就不能安装；「建议」的可以先跳过，跳过的会写在安装结果里。</span><${Button} size="sm" icon="RefreshCw" loading=${checking} onClick=${() => runChecks()}>全部重新检查<//></div>
        ${sol.checks.map((c) => {
          const st = (checks[c.key] || {}).state || 'running';
          const icon = { running: 'LoaderCircle', pass: 'CircleCheck', fail: 'CircleX', warn: 'TriangleAlert' }[st];
          return html`<div key=${c.key} className=${cx('sol-check', `is-${st}`)}>
            <${Icon} name=${icon} size=${18} className=${cx(st === 'running' && 'spin')} />
            <div className="grow">
              <div className="row"><b>${c.label}</b><${Tag} size="sm" tone=${c.blocking ? 'danger' : 'default'}>${c.blocking ? '必须' : '建议'}<//>${c.who && html`<span className="text-xs muted">由${c.who}处理</span>`}</div>
              ${c.detail && html`<div className="text-xs muted">${c.detail}</div>`}
              ${st === 'fail' && c.kind === 'connection' && html`<div className="field-error">连接不可用，回到上一步换一个连接，或到「连接」页重新授权。</div>`}
              ${(st === 'fail' || st === 'warn') && c.failText && html`<div className=${st === 'fail' ? 'field-error' : 'text-xs sol-warn'}>${c.failText}</div>`}
              ${st === 'fail' && c.fix && html`<div className="sol-fix">
                <ol>${c.fix.map((f) => html`<li key=${f}>${f}</li>`)}</ol>
                <div className="row">
                  <${CopyButton} text=${`请帮忙处理：${c.label}\n${c.failText || ''}\n${c.fix.map((f, i) => `${i + 1}. ${f}`).join('\n')}`} label="复制给${c.who || '管理员'}" />
                  <${Button} size="sm" icon="RefreshCw" onClick=${() => runChecks(c.key)}>重新检查<//>
                </div>
              </div>`}
            </div>
          </div>`;
        })}
        ${allRan && blockingFailed.length > 0 && html`<${Alert} tone="danger">还有 ${blockingFailed.length} 项必须通过的检查没有通过，处理后重新检查。<//>`}
        ${allRan && blockingFailed.length === 0 && sol.checks.some((c) => !c.blocking && (checks[c.key] || {}).state !== 'pass') && html`<${Alert} tone="warning">有建议项没有通过，可以先安装；运行时如果因为这些原因失败，会进入问题中心。<//>`}
      </div>`}
      ${step === 4 && result && html`<div className="col" style=${{ gap: 16, maxWidth: 760 }}>
        <div className="sol-done"><${Icon} name="PartyPopper" size=${28} /><div><h2>安装完成</h2><div className="muted">已装进项目「${project ? project.name : ''}」。工作流都还没启用，按下面的顺序检查后再启用。</div></div></div>
        <div className="sol-res">
          ${result.created.map((w) => html`<div key=${w.id} className="sol-res-row"><span className="sol-res-icon"><${Icon} name="Workflow" size=${16} /></span><div className="grow"><b>${w.name}</b><div className="text-xs muted">未启用 · 连接已填好</div></div><${Button} size="sm" onClick=${() => navigate(`/integration/${result.projectId}/wf/${w.id}?mode=edit`)}>打开调试<//></div>`)}
          ${result.tableResults.map(({ table: t, reused }) => html`<div key=${t.id} className="sol-res-row"><span className="sol-res-icon"><${Icon} name="Table2" size=${16} /></span><div className="grow"><b>映射表「${t.name}」</b><div className="text-xs muted">${reused ? '沿用项目里已有的这张表' : t.rows.length ? `按名称自动匹配了 ${t.rows.length} 个部门` : '空表，待维护'}${t.keyLabel === '北森部门' && result.unmatched.length ? `；北森里还有 ${result.unmatched.length} 个部门没有对照：${result.unmatched.join('、')}。补上之前，这些部门的员工开通账号会失败` : ''}</div></div><${Button} size="sm" onClick=${() => navigate(`/integration/${result.projectId}/mappings?id=${t.id}`)}>去确认<//></div>`)}
          ${result.policies.map((p) => html`<div key=${p.id} className="sol-res-row"><span className="sol-res-icon"><${Icon} name="BellRing" size=${16} /></span><div className="grow"><b>告警策略「${p.name}」</b><div className="text-xs muted">已启用，发到「集成值班」</div></div></div>`)}
        </div>
        ${result.record.skippedChecks.length > 0 && html`<${Alert} tone="warning" title="安装时跳过的检查">${result.record.skippedChecks.join('；')}。处理好之前，相关的运行可能失败。<//>`}
        <div className="row"><${Button} variant="primary" onClick=${() => navigate(`/integration/${result.projectId}`)}>查看项目<//><${Button} onClick=${() => navigate('/solutions?tab=installed')}>已安装的方案<//></div>
      </div>`}
    </div>
    ${step < 4 && html`<div className="sol-foot">
      <${Button} disabled=${step === 0} onClick=${() => setStep(step - 1)}>上一步<//>
      <span className="spacer" />
      <span className="text-xs muted">${step === 0 ? projectError || '' : step === 1 ? connErrors[0] || '' : ''}</span>
      <${Button} variant="primary" disabled=${!canNext || (step === 3 && checking)} onClick=${next}>${step === 2 ? '开始检查' : step === 3 ? '安装' : '下一步'}<//>
    </div>`}
  </div></div>`;
}

function SolGenerateModal({ open, onClose }) {
  const state = useStore();
  const editable = integEditableProjects(state);
  const [step, setStep] = useState(0);
  const [pid, setPid] = useState(null);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('人力资源');
  const [summary, setSummary] = useState('');
  const [checks, setChecks] = useState([]);
  const [visibility, setVisibility] = useState('tenant');
  useEffect(() => { if (open) { setStep(0); setPid((editable[0] || {}).id || null); setPicked([]); setName(''); setSummary(''); setChecks([]); setVisibility('tenant'); } }, [open]);
  if (!open) return null;
  const wfs = state.workflows.filter((w) => w.projectId === pid);
  const chosen = wfs.filter((w) => picked.includes(w.id));
  const connectorsUsed = [...new Set(chosen.flatMap((w) => [w.trigger, ...(w.steps || [])].map((n) => n && n.connector).filter(Boolean)))].filter((c) => (resolveConnector(c) || {}).auth && (resolveConnector(c) || {}).auth !== 'none');
  const autoChecks = connectorsUsed.map((c) => `${(resolveConnector(c) || { name: c }).name}连接可用`);
  const steps = [{ title: '选择资源' }, { title: '安装检查项' }, { title: '发布' }];
  const canNext = [chosen.length > 0, true, Boolean(name.trim())][step];
  const publish = () => {
    const s = Store.get();
    const sol = {
      id: uid('cs'), name: name.trim(), category, provider: 'tenant', version: '1.0', installs: 0, updatedAt: Date.now(), owner: s.me, visibility, sourceProject: pid,
      summary: summary.trim() || `基于项目「${(s.projects.find((p) => p.id === pid) || {}).name}」生成`,
      points: [], connectors: connectorsUsed,
      workflows: chosen.map((w) => ({ key: w.id, name: w.name, desc: w.description, graph: JSON.parse(JSON.stringify({ trigger: w.trigger, steps: w.steps })) })),
      mappingTables: [], alerts: [], config: [],
      checks: [...connectorsUsed.map((c) => ({ key: `conn-${c}`, label: `${(resolveConnector(c) || { name: c }).name}连接可用`, kind: 'connection', connector: c, blocking: true })), ...checks.filter((t) => t.trim()).map((t, i) => ({ key: `custom-${i}`, label: t.trim(), blocking: false, sim: 'warn', failText: '请安装人自行确认' }))],
      versions: [{ v: '1.0', at: Date.now(), notes: '首个版本' }],
    };
    Store.set((st) => ({ ...st, customSolutions: [sol, ...(st.customSolutions || [])] }));
    addAudit('发布方案', sol.name, pid);
    toast.success('方案已发布，本企业成员可以在方案市场安装');
    onClose();
    navigate(`/solutions/${sol.id}`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} width=${680} title="基于项目生成方案" description="把调通的工作流打包成方案；安装时连接由安装人重新选择，凭证、项目配置的值和运行日志不会带走"
    footer=${html`<${Fragment}>
      <${Button} disabled=${step === 0} onClick=${() => setStep(step - 1)}>上一步<//>
      <span className="spacer" />
      ${step < 2 ? html`<${Button} variant="primary" disabled=${!canNext} onClick=${() => setStep(step + 1)}>下一步<//>` : html`<${Button} variant="primary" disabled=${!canNext} onClick=${publish}>发布<//>`}
    <//>`}
  >
    <div className="sol-gen-steps"><${Steps} current=${step} items=${steps} /></div>
    ${step === 0 && html`<div className="col" style=${{ gap: 12 }}>
      <${Field} label="来源项目" required><${Select} value=${pid} onChange=${(v) => { setPid(v); setPicked([]); }} options=${editable.map((p) => ({ value: p.id, label: p.name, iconNode: html`<${ProjectAvatar} project=${p} size=${18} />` }))} /><//>
      <div className="sol-label">选择要打包的工作流</div>
      <div className="sol-pick">
        ${wfs.map((w) => html`<label key=${w.id} className="sol-pick-row"><${Checkbox} checked=${picked.includes(w.id)} onChange=${(v) => setPicked(v ? [...picked, w.id] : picked.filter((x) => x !== w.id))} /><span className="grow">${w.name}</span><span className="text-xs muted">${w.published ? `v${w.version}` : '未发布'}</span></label>`)}
        ${wfs.length === 0 && html`<div className="muted text-xs">这个项目里还没有工作流。</div>`}
      </div>
      ${chosen.length > 0 && html`<div className="text-xs muted">用到的连接器：${connectorsUsed.map((c) => (resolveConnector(c) || { name: c }).name).join('、') || '无'}；安装时由安装人选择连接。</div>`}
    </div>`}
    ${step === 1 && html`<div className="col" style=${{ gap: 10 }}>
      <div className="muted text-xs">下面这些会在安装向导的最后一步逐项检查。连接是否可用会自动检查，并且必须通过；你可以再补充需要对方系统管理员做的事。</div>
      ${autoChecks.map((t) => html`<div key=${t} className="sol-pick-row"><${Icon} name="Lock" size=${14} className="muted" /><span className="grow">${t}</span><${Tag} size="sm" tone="danger">必须<//></div>`)}
      ${checks.map((t, i) => html`<div key=${i} className="row"><${Input} value=${t} onChange=${(v) => setChecks(checks.map((x, j) => (j === i ? v : x)))} placeholder="例如：飞书应用的通讯录权限范围覆盖要同步的部门" /><${IconButton} icon="X" size="sm" title="删除" onClick=${() => setChecks(checks.filter((_, j) => j !== i))} /></div>`)}
      <div><${Button} size="sm" variant="ghost" icon="Plus" onClick=${() => setChecks([...checks, ''])}>添加检查项<//></div>
    </div>`}
    ${step === 2 && html`<div className="col" style=${{ gap: 12 }}>
      <${Field} label="方案名称" required><${Input} value=${name} onChange=${setName} placeholder="例如：采购审批入金蝶（星河内部）" /><//>
      <${Field} label="分类"><${Select} value=${category} onChange=${setCategory} options=${SOL_CATEGORIES.filter((c) => c !== '全部').map((c) => ({ value: c, label: c }))} /><//>
      <${Field} label="介绍"><${Textarea} value=${summary} onChange=${setSummary} rows=${2} placeholder="这个方案解决什么问题，装上后会发生什么" /><//>
      <${Field} label="可见范围"><${RadioCards} value=${visibility} onChange=${setVisibility} options=${[{ value: 'tenant', label: '本企业所有成员', desc: '都能在方案市场里看到并安装' }, { value: 'project', label: '来源项目的成员', desc: '只有这个项目的成员能看到' }]} /><//>
      <div className="text-xs muted">发布后版本为 v1.0。以后改了来源项目，可以发布新版本，已安装的项目会看到「可升级」。</div>
    </div>`}
  <//>`;
}
