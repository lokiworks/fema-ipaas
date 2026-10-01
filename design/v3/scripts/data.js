const SYSTEMS = {
  beisen: { name: '北森', logo: '../assets/connectors/beisen.svg' },
  feishu: { name: '飞书', logo: '../assets/connectors/feishu.svg' },
  wecom: { name: '企业微信', mark: '企', color: '#0F9D58' },
  dingtalk: { name: '钉钉', mark: '钉', color: '#1677FF' },
  weaver: { name: '泛微 OA', mark: '泛', color: '#1E5BB8' },
  seeyon: { name: '致远 OA', mark: '致', color: '#2F6FD6' },
  http: { name: 'HTTP 请求', logo: '../assets/connectors/http.svg' },
  mapper: { name: '映射表', logo: '../assets/connectors/data-mapper.svg' },
  schedule: { name: '定时', logo: '../assets/connectors/schedule.svg' },
  logic: { name: '分支', icon: 'Split' },
};

const DEPTH_CHECKS = [
  { key: 'wizard', label: '连接向导与缺权限提示', desc: '写清对方后台的菜单路径，按功能列出所需权限；缺权限时报错里写明权限名。' },
  { key: 'paging', label: '分页取全', desc: '列表类操作自动翻页，不会只拿到第一页。' },
  { key: 'rate', label: '声明速率上限', desc: '按对方文档声明速率，平台据此在连接上排队，而不是撞上限流再失败。' },
  { key: 'idempotency', label: '写操作声明幂等', desc: '每个写操作标明是否幂等，超时重试、重放和批量重跑都据此决定执行还是跳过。' },
  { key: 'errors', label: '错误码映射', desc: '把对方的错误码翻译成问题中心能聚合的原因，并给出修复建议。' },
  { key: 'schema', label: '输出结构', desc: '出参带字段说明和类型，做映射时可以直接选。' },
  { key: 'listAll', label: '能列出全量名单', desc: '提供只读的全量列表操作，对账才能接上。' },
];

const CONNECTORS = [
  {
    id: 'beisen', system: 'beisen', category: '人事', batch: '首批', state: 'ready',
    desc: '读取员工、组织和入职数据，按变动触发工作流。',
    rate: 20,
    checks: { wizard: true, paging: true, rate: true, idempotency: true, errors: true, schema: true, listAll: true },
    actions: [
      { name: '员工变动', kind: 'trigger', effect: 'read', desc: '轮询北森，按员工逐条触发；翻完所有分页，跨页的变动不会漏。' },
      { name: '读取员工', effect: 'read', desc: '按工号读取员工的最新信息。' },
      { name: '列出员工', effect: 'read', desc: '分页列出在职和近 30 天离职的员工，供对账使用。', recon: true },
      { name: '列出部门', effect: 'read', desc: '列出组织架构，用来检查映射表的覆盖率。' },
      { name: '查询待入职', effect: 'read', desc: '按入职日期查询待入职员工。' },
    ],
  },
  {
    id: 'feishu', system: 'feishu', category: '即时通讯', batch: '首批', state: 'ready',
    desc: '通讯录开通与停用账号、发送消息、多维表格。',
    rate: 50,
    checks: { wizard: true, paging: true, rate: true, idempotency: true, errors: true, schema: true, listAll: true },
    actions: [
      { name: '确保账号', effect: 'idempotent', idemKey: '工号', desc: '没有就开通，有就更新姓名和部门；返回「已开通 / 已更新 / 无变化」。', perms: ['更新通讯录', '通过手机号或邮箱获取用户 ID'] },
      { name: '停用账号', effect: 'idempotent', idemKey: '工号', desc: '已经停用时直接返回，不会报错。', perms: ['更新通讯录'] },
      { name: '发送群消息', effect: 'non-idempotent', desc: '同一条消息发两次，群里会出现两条。', perms: ['以应用身份发消息'] },
      { name: '列出通讯录用户', effect: 'read', desc: '分页列出应用权限范围内的全部用户，供对账使用。', perms: ['读取通讯录'], recon: true },
      { name: '查找用户', effect: 'read', desc: '按手机号、邮箱或工号查找。', perms: ['通过手机号或邮箱获取用户 ID'] },
    ],
  },
  {
    id: 'wecom', system: 'wecom', category: '即时通讯', batch: '第二批', state: 'ready',
    desc: '通讯录成员管理与应用消息。',
    rate: 30,
    checks: { wizard: true, paging: true, rate: true, idempotency: true, errors: false, schema: true, listAll: true },
    gaps: { errors: '还有 11 个错误码没有映射，命中时问题标题只显示原始错误码。' },
    actions: [
      { name: '确保成员', effect: 'idempotent', idemKey: '工号', desc: '没有就创建，有就更新部门和姓名。' },
      { name: '禁用成员', effect: 'idempotent', idemKey: '工号', desc: '已经禁用时直接返回。' },
      { name: '发送应用消息', effect: 'non-idempotent', desc: '发给成员或群聊。' },
      { name: '列出成员', effect: 'read', desc: '分页列出可见范围内的成员。', recon: true },
    ],
  },
  {
    id: 'dingtalk', system: 'dingtalk', category: '即时通讯', batch: '第二批', state: 'building',
    desc: '通讯录与工作通知，正在开发。',
    rate: 20,
    checks: { wizard: true, paging: true, rate: true, idempotency: false, errors: false, schema: false, listAll: true },
    gaps: { idempotency: '「创建用户」还没有确保存在的语义，重复调用会报手机号已存在。', errors: '错误码映射未开始。', schema: '出参还没有字段说明。' },
    actions: [
      { name: '确保用户', effect: 'unknown', desc: '开发中。' },
      { name: '发送工作通知', effect: 'non-idempotent', desc: '开发中。' },
    ],
  },
  {
    id: 'weaver', system: 'weaver', category: 'OA', batch: '第三批', state: 'planned',
    desc: '流程归档与人员信息，排在第三批。',
    checks: {},
    actions: [],
  },
  {
    id: 'seeyon', system: 'seeyon', category: 'OA', batch: '第三批', state: 'planned',
    desc: '流程归档与人员信息，排在第三批。',
    checks: {},
    actions: [],
  },
  {
    id: 'http', system: 'http', category: '通用', batch: '内置', state: 'ready', generic: true,
    desc: '调用任意 HTTP 接口，或从 OpenAPI 文档导入成连接器草稿。',
    checks: {},
    actions: [
      { name: '发送请求', effect: 'declare', desc: '是否幂等由搭建者在节点上声明，没有声明时按不幂等处理。' },
    ],
  },
];

const WF_TEMPLATES = {
  'sync-feishu': [
    { id: 't', role: 'trigger', title: '员工变动', system: 'beisen', effect: 'read', detail: '轮询 · 每 5 分钟' },
    { id: 's1', role: 'readSource', title: '读取员工最新信息', system: 'beisen', action: '读取员工', effect: 'read', detail: '按工号重新读取，不依赖变动内容' },
    { id: 's2', role: 'branch', title: '按在职状态分支', system: 'logic', effect: 'read', detail: '在职（含待入职）/ 离职' },
    { id: 's3', role: 'mapDept', lane: 'active', title: '部门映射', system: 'mapper', action: '查映射表', effect: 'read', detail: '北森部门 → 飞书部门，查不到时报错' },
    { id: 's4', role: 'ensure', lane: 'active', title: '确保账号', system: 'feishu', action: '确保账号', effect: 'idempotent', idemKey: '工号', detail: '没有就开通，有就更新姓名和部门' },
    { id: 's5', role: 'notifyNew', lane: 'active', title: '通知 HR 入职群', system: 'feishu', action: '发送群消息', effect: 'non-idempotent', when: '仅新开通时', detail: '群「HR 入职服务」' },
    { id: 's6', role: 'disable', lane: 'left', title: '停用账号', system: 'feishu', action: '停用账号', effect: 'idempotent', idemKey: '工号', detail: '停用后保留账号数据' },
    { id: 's7', role: 'notifyLeft', lane: 'left', title: '通知 IT 资产群', system: 'feishu', action: '发送群消息', effect: 'non-idempotent', when: '仅实际停用时', detail: '群「IT 资产回收」' },
  ],
  'sync-wecom': [
    { id: 't', role: 'trigger', title: '员工变动', system: 'beisen', effect: 'read', detail: '轮询 · 每 5 分钟 · 仅门店组织' },
    { id: 's1', role: 'readSource', title: '读取员工最新信息', system: 'beisen', action: '读取员工', effect: 'read', detail: '按工号重新读取，不依赖变动内容' },
    { id: 's2', role: 'branch', title: '按在职状态分支', system: 'logic', effect: 'read', detail: '在职（含待入职）/ 离职' },
    { id: 's3', role: 'mapDept', lane: 'active', title: '门店映射', system: 'mapper', action: '查映射表', effect: 'read', detail: '北森门店 → 企业微信部门，查不到时报错' },
    { id: 's4', role: 'ensure', lane: 'active', title: '确保成员', system: 'wecom', action: '确保成员', effect: 'idempotent', idemKey: '工号', detail: '没有就创建，有就更新部门' },
    { id: 's5', role: 'notifyNew', lane: 'active', title: '通知店长', system: 'wecom', action: '发送应用消息', effect: 'non-idempotent', when: '仅新创建时', detail: '发给所在门店店长' },
    { id: 's6', role: 'disable', lane: 'left', title: '禁用成员', system: 'wecom', action: '禁用成员', effect: 'idempotent', idemKey: '工号', detail: '禁用后保留聊天记录' },
    { id: 's7', role: 'notifyLeft', lane: 'left', title: '通知店长', system: 'wecom', action: '发送应用消息', effect: 'non-idempotent', when: '仅实际禁用时', detail: '发给所在门店店长' },
  ],
  'remind-it': [
    { id: 't', role: 'schedule', title: '每个工作日 17:00', system: 'schedule', effect: 'read', detail: '跳过法定节假日' },
    { id: 's1', role: 'remindQuery', title: '查询明天入职的员工', system: 'beisen', action: '查询待入职', effect: 'read', detail: '按入职日期查询' },
    { id: 's2', role: 'remindSend', title: '通知 IT 准备设备', system: 'feishu', action: '发送群消息', effect: 'non-idempotent', detail: '群「IT 桌面支持」' },
  ],
};

const HR_DEPTS = [
  ['总部', ['总裁办', '战略部']],
  ['人力资源中心', ['招聘组', '薪酬绩效组', 'HRBP 组']],
  ['财务中心', ['会计组', '资金组']],
  ['市场部', ['品牌组', '增长组']],
  ['华东销售中心', ['上海一部', '上海二部', '杭州部', '南京部']],
  ['华北销售中心', ['北京部', '天津部']],
  ['华南销售中心', ['广州部', '深圳部']],
  ['北京研发中心', ['平台组', '算法组', '前端组', '测试组']],
  ['上海研发中心', ['数据组', '移动组', '客户端组']],
  ['深圳研发中心', ['平台组', '测试组']],
  ['产品部', ['产品一组', '产品二组', '设计组']],
  ['客户成功部', ['实施组', '售后组']],
  ['行政部', ['前台', '采购组']],
  ['IT 部', ['运维组', '桌面支持组']],
  ['法务部', ['合规组']],
];

const FEISHU_TOP_RENAME = {
  华东销售中心: '华东销售', 华北销售中心: '华北销售', 华南销售中心: '华南销售', 人力资源中心: '人力资源', 'IT 部': '信息技术部',
};

const STORE_DEPTS = [
  ['上海门店', ['徐汇店', '静安店', '浦东店', '闵行店']],
  ['杭州门店', ['西湖店', '滨江店']],
  ['南京门店', ['新街口店', '河西店']],
];

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '田', '董', '潘', '袁', '蔡', '蒋', '余', '杜', '叶', '程', '魏', '苏', '吕', '丁', '沈', '姚', '卢', '钟'];
const GIVEN_NAMES = ['晓雨', '子航', '书瑶', '一鸣', '嘉', '若彤', '立', '悦', '磊', '思远', '航', '文', '晓', '敏', '静', '伟', '芳', '娜', '秀英', '丽', '强', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '浩然', '梓涵', '欣怡', '宇轩', '子墨', '雨桐', '一诺', '梓萱', '诗涵', '俊杰', '思琪', '嘉怡', '皓轩', '佳琪', '明轩', '雅琪', '振宇', '晨曦', '乐怡', '文博', '可馨', '天佑', '若曦', '子豪', '语嫣', '博文', '安然', '星辰', '沐阳', '清妍', '景行'];

function seedRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function dayStart(now, daysAgo) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

function lastDailyAt(now, h, m = 0) {
  const today = dayStart(now, 0) + h * HOUR + m * MIN;
  return today <= now ? today : today - DAY;
}

function deptPairs(depts, renameTop = {}, sep = '/') {
  return depts.flatMap(([top, subs]) => subs.map((sub) => ({
    beisen: `${top}-${sub}`,
    target: `${renameTop[top] || top}${sep}${sub.replace(/ ?组$/, '')}`,
    top,
  })));
}

function makeNamer(rand) {
  const used = new Set();
  return () => {
    for (let i = 0; i < 200; i++) {
      const name = pickOne(rand, SURNAMES) + pickOne(rand, GIVEN_NAMES);
      if (!used.has(name)) { used.add(name); return name; }
    }
    return pickOne(rand, SURNAMES) + pickOne(rand, GIVEN_NAMES) + used.size;
  };
}

function maskedMobile(rand) {
  const head = pickOne(rand, ['138', '139', '136', '186', '158', '177', '133', '150']);
  return `${head}****${String(Math.floor(rand() * 10000)).padStart(4, '0')}`;
}

function pickOneFixed(list, i) {
  return list[i % list.length];
}

function hexId(rand, len = 8) {
  return Array.from({ length: len }, () => Math.floor(rand() * 16).toString(16)).join('');
}

function seedState() {
  const now = Date.now();
  const rand = seedRandom(20261001);
  const nextName = makeNamer(rand);
  const LR = lastDailyAt(now, 2, 0);
  const dayOf = (ts) => dayStart(ts, 0);

  const hrPairs = deptPairs(HR_DEPTS, FEISHU_TOP_RENAME);
  const storePairs = deptPairs(STORE_DEPTS, {}, '/');
  const hrMapRows = hrPairs
    .filter((p) => p.beisen !== '深圳研发中心-平台组')
    .map((p) => ({
      from: p.beisen,
      to: p.target,
      addedBy: p.top === '深圳研发中心' ? '李航' : '王磊',
      addedAt: p.top === '深圳研发中心' ? LR - 26 * HOUR : now - 45 * DAY,
    }));
  const normalPairs = hrPairs.filter((p) => p.top !== '深圳研发中心');

  let keySeq = 9400;
  const nextKey = () => { keySeq += 1 + Math.floor(rand() * 3); return `E${String(keySeq).padStart(5, '0')}`; };
  const people = [];
  const runs = [];
  const runSeq = { n: 1 };
  const runId = (ts) => {
    const d = new Date(ts);
    runSeq.n += 1;
    return `R${fmt.pad(d.getMonth() + 1)}${fmt.pad(d.getDate())}-${String(runSeq.n).padStart(4, '0')}`;
  };

  const addPerson = (p) => { people.push(p); return p; };
  const feishuUserId = () => `ou_${hexId(rand, 10)}`;

  const syncRun = ({ person, wf, project, change, at, steps, status = 'success', source = 'trigger', version = 4, extra = {} }) => {
    const run = {
      id: runId(at), workflowId: wf, projectId: project, key: person.key, name: person.name, change, source,
      status, at, durationMs: 1200 + Math.floor(rand() * 2600), version, steps, ...extra,
    };
    runs.push(run);
    return run;
  };

  const okActiveSteps = (result) => ({ s1: 'ok', s3: 'ok', s4: `ok:${result}`, s5: result === '已开通' ? 'ok' : 'skip' });
  const okLeftSteps = (result) => ({ s1: 'ok', s6: `ok:${result}`, s7: result === '已停用' ? 'ok' : 'skip' });

  const changeTimes = [];
  for (let d = 6; d >= 0; d--) {
    const base = dayOf(LR) - d * DAY;
    const n = d === 0 ? 0 : 8 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) changeTimes.push(base + (9 + rand() * 9) * HOUR);
  }
  changeTimes.sort((a, b) => a - b);

  const recentPeople = [];
  changeTimes.forEach((at, i) => {
    const kind = pickOneFixed(['入职', '调岗', '入职', '离职', '信息变更', '入职', '调岗', '离职'], i + Math.floor(rand() * 3));
    const pair = pickOne(rand, normalPairs);
    const name = nextName();
    const key = nextKey();
    const left = kind === '离职';
    const person = addPerson({
      key, name, mobile: maskedMobile(rand), projectId: 'p_hr',
      beisen: { status: left ? '离职' : '在职', dept: pair.beisen, hireDate: kind === '入职' ? dayOf(at) + DAY : at - (200 + Math.floor(rand() * 900)) * DAY, leaveDate: left ? dayOf(at) : null },
      target: { exists: true, active: !left, dept: pair.target, userId: feishuUserId() },
      changes: [{ type: kind, at: at - 5 * MIN }],
    });
    recentPeople.push(person);
    const result = kind === '入职' ? '已开通' : kind === '信息变更' && rand() < 0.4 ? '无变化' : '已更新';
    syncRun({
      person, wf: 'wf_sync', project: 'p_hr', change: kind, at,
      steps: left ? okLeftSteps('已停用') : okActiveSteps(result),
    });
  });

  const recruitDay = dayOf(LR) - 3 * DAY;
  const recruitDepts = normalPairs.filter((p) => /研发|产品/.test(p.top));
  const recruitRuns = [];
  for (let i = 0; i < 186; i++) {
    const at = recruitDay + 9 * HOUR + Math.floor((i / 186) * 40 * MIN) + Math.floor(rand() * 40000);
    const pair = pickOne(rand, recruitDepts);
    const person = addPerson({
      key: nextKey(), name: nextName(), mobile: maskedMobile(rand), projectId: 'p_hr', batch: '2026 校招',
      beisen: { status: '在职', dept: pair.beisen, hireDate: recruitDay, leaveDate: null },
      target: { exists: true, active: true, dept: pair.target, userId: feishuUserId() },
      changes: [{ type: '入职', at: at - 4 * MIN }],
    });
    const waitMs = i < 20 ? Math.floor(rand() * 4000) : Math.min(192000, Math.floor(((i - 20) / 166) * 192000) + Math.floor(rand() * 6000));
    const run = syncRun({
      person, wf: 'wf_sync', project: 'p_hr', change: '入职', at,
      steps: okActiveSteps('已开通'),
      extra: { queueWaitMs: Math.min(192000, waitMs) },
    });
    run.durationMs += run.queueWaitMs;
    recruitRuns.push(run);
  }

  const downtimeStart = dayOf(LR) - DAY + 22 * HOUR;
  const downtimeEnd = downtimeStart + 95 * MIN;
  for (let i = 0; i < 14; i++) {
    const changedAt = downtimeStart + Math.floor((i / 14) * 90 * MIN) + Math.floor(rand() * 200000);
    const kind = i % 5 === 0 ? '离职' : i % 3 === 0 ? '调岗' : '入职';
    const pair = pickOne(rand, normalPairs);
    const left = kind === '离职';
    const person = addPerson({
      key: nextKey(), name: nextName(), mobile: maskedMobile(rand), projectId: 'p_hr',
      beisen: { status: left ? '离职' : '在职', dept: pair.beisen, hireDate: kind === '入职' ? dayOf(changedAt) + DAY : changedAt - 400 * DAY, leaveDate: left ? dayOf(changedAt) : null },
      target: { exists: true, active: !left, dept: pair.target, userId: feishuUserId() },
      changes: [{ type: kind, at: changedAt }],
    });
    syncRun({
      person, wf: 'wf_sync', project: 'p_hr', change: kind, at: downtimeEnd + 60000 + i * 14000, source: 'catchup',
      steps: left ? okLeftSteps('已停用') : okActiveSteps(kind === '入职' ? '已开通' : '已更新'),
    });
  }

  const pool = runs.filter((r) => r.source === 'trigger' && r.change !== '离职' && !r.queueWaitMs);
  pool.slice(3, 10).forEach((r) => {
    r.steps = { ...r.steps, s4: `${r.steps.s4}|retry` };
    r.durationMs += 30000;
  });
  const dedupeSources = pool.slice(12, 24);
  dedupeSources.forEach((r, i) => {
    runs.push({
      id: runId(r.at + 300000), workflowId: 'wf_sync', projectId: 'p_hr', key: r.key, name: r.name, change: r.change,
      source: 'trigger', status: 'deduped', at: r.at + (5 + (i % 3) * 5) * MIN, durationMs: 0, version: 4, steps: {}, dedupeOf: r.id,
    });
  });

  const szPairs = hrPairs.filter((p) => p.top === '深圳研发中心');
  const szEntered = LR - 9 * HOUR;
  const szPeople = [
    ['E10226', '林书瑶', 1], ['E10227', '唐一鸣', 1], ['E10228', '许嘉', 1], ['E10231', '张晓雨', 0], ['E10232', '周子航', 0],
  ].map(([key, name, pairIndex], i) => addPerson({
    key, name, mobile: maskedMobile(rand), projectId: 'p_hr', batch: '深圳研发中心首批',
    beisen: { status: '待入职', dept: szPairs[pairIndex].beisen, hireDate: dayOf(LR), leaveDate: null },
    target: { exists: false, active: false, dept: null, userId: null },
    changes: [{ type: '入职', at: szEntered + i * 40000, note: 'HR 批量录入深圳研发中心首批员工' }],
  }));
  const failedRuns = szPeople.map((person, i) => {
    const scope = person.beisen.dept === '深圳研发中心-测试组';
    return syncRun({
      person, wf: 'wf_sync', project: 'p_hr', change: '入职', at: szEntered + 5 * MIN + i * 3000, status: 'failed',
      steps: scope ? { s1: 'ok', s3: 'ok', s4: 'fail:scope' } : { s1: 'ok', s3: 'fail:mapping' },
      extra: { issueId: scope ? 'I-20' : 'I-19' },
    });
  });

  const huang = addPerson({
    key: 'E10235', name: '黄若彤', mobile: '139****6021', projectId: 'p_hr',
    beisen: { status: '待入职', dept: '人力资源中心-招聘组', hireDate: dayOf(LR), leaveDate: null },
    target: { exists: true, active: true, dept: '人力资源/招聘', userId: 'ou_7f3a2c91e0' },
    changes: [{ type: '入职', at: LR - 7 * HOUR - 5 * MIN }],
  });
  const huangRun = syncRun({
    person: huang, wf: 'wf_sync', project: 'p_hr', change: '入职', at: LR - 7 * HOUR, status: 'unknown',
    steps: { s1: 'ok', s3: 'ok', s4: 'ok:已开通', s5: 'unknown' },
    extra: { issueId: 'I-18' },
  });
  huangRun.durationMs = 31800;

  const chen = addPerson({
    key: 'E10087', name: '陈立', mobile: '186****3317', projectId: 'p_hr',
    beisen: { status: '离职', dept: '华东销售中心-上海二部', hireDate: now - 700 * DAY, leaveDate: dayOf(LR) - 4 * DAY },
    target: { exists: true, active: true, dept: '华东销售/上海二部', userId: 'ou_2b81d07c5e', manual: { by: '周文', at: LR - 10 * HOUR, text: '在飞书管理后台恢复了账号（交接时导出邮件）' } },
    changes: [{ type: '离职', at: dayOf(LR) - 4 * DAY + 10 * HOUR }],
  });
  syncRun({ person: chen, wf: 'wf_sync', project: 'p_hr', change: '离职', at: dayOf(LR) - 4 * DAY + 10 * HOUR + 5 * MIN, steps: okLeftSteps('已停用') });

  addPerson({
    key: 'E09961', name: '孙悦', mobile: '158****0476', projectId: 'p_hr',
    beisen: { status: '离职', dept: '客户成功部-实施组', hireDate: now - 900 * DAY, leaveDate: dayOf(LR) - DAY },
    target: { exists: true, active: true, dept: '客户成功部/实施', userId: 'ou_9c04e6a1b3' },
    changes: [{ type: '离职', at: dayOf(LR) - DAY + 15 * HOUR, missing: true }],
  });

  addPerson({
    key: 'E10140', name: '赵磊', mobile: '177****8820', projectId: 'p_hr',
    beisen: { status: '在职', dept: '市场部-品牌组', hireDate: now - 420 * DAY, leaveDate: null },
    target: { exists: true, active: true, dept: '市场部', userId: 'ou_51d9fa02c7', manual: { by: '飞书管理员', at: LR - 3 * DAY, text: '在飞书里把部门改成了「市场部」' } },
    changes: [],
  });

  const sinceLR = Math.max(0, Math.min(8, Math.floor((now - LR) / (55 * MIN))));
  for (let i = 0; i < sinceLR; i++) {
    const at = LR + (i + 0.6) * 55 * MIN;
    const kind = pickOneFixed(['调岗', '信息变更', '入职', '调岗'], i);
    const pair = pickOne(rand, normalPairs);
    const person = addPerson({
      key: nextKey(), name: nextName(), mobile: maskedMobile(rand), projectId: 'p_hr',
      beisen: { status: '在职', dept: pair.beisen, hireDate: kind === '入职' ? dayOf(at) + DAY : at - 300 * DAY, leaveDate: null },
      target: { exists: true, active: true, dept: pair.target, userId: feishuUserId() },
      changes: [{ type: kind, at: at - 4 * MIN }],
    });
    syncRun({ person, wf: 'wf_sync', project: 'p_hr', change: kind, at, steps: okActiveSteps(kind === '入职' ? '已开通' : '已更新') });
  }

  for (let d = 7; d >= 1; d--) {
    const at = dayOf(LR) - d * DAY + 17 * HOUR;
    const wd = new Date(at).getDay();
    if (wd === 0 || wd === 6) continue;
    runs.push({
      id: runId(at), workflowId: 'wf_remind', projectId: 'p_hr', key: null, name: `明天入职 ${d === 4 ? 186 : 3 + Math.floor(rand() * 6)} 人`, change: '定时',
      source: 'schedule', status: 'success', at, durationMs: 2100 + Math.floor(rand() * 900), version: 2, steps: { s1: 'ok', s2: 'ok' },
    });
  }

  const storeDisabledAt = dayOf(LR) - 2 * DAY + 15 * HOUR;
  for (let i = 0; i < 34; i++) {
    const at = storeDisabledAt - (5 * DAY) + Math.floor((i / 34) * 5 * DAY) + Math.floor(rand() * 3 * HOUR);
    const kind = pickOneFixed(['入职', '调岗', '离职', '入职', '信息变更'], i);
    const pair = pickOne(rand, storePairs);
    const left = kind === '离职';
    const person = addPerson({
      key: nextKey(), name: nextName(), mobile: maskedMobile(rand), projectId: 'p_store',
      beisen: { status: left ? '离职' : '在职', dept: pair.beisen, hireDate: kind === '入职' ? dayOf(at) + DAY : at - 200 * DAY, leaveDate: left ? dayOf(at) : null },
      target: { exists: true, active: !left, dept: pair.target, userId: `wm_${hexId(rand, 8)}` },
      changes: [{ type: kind, at: at - 4 * MIN }],
    });
    runs.push({
      id: runId(at), workflowId: 'wf_store', projectId: 'p_store', key: person.key, name: person.name, change: kind, source: 'trigger',
      status: 'success', at, durationMs: 900 + Math.floor(rand() * 1800), version: 3,
      steps: left ? okLeftSteps('已停用') : okActiveSteps(kind === '入职' ? '已开通' : '已更新'),
    });
  }
  for (let i = 0; i < 6; i++) {
    const at = storeDisabledAt + (4 + i * 5) * HOUR;
    const kind = i === 3 ? '调岗' : '入职';
    const pair = pickOne(rand, storePairs);
    const prevPair = pickOne(rand, storePairs.filter((p) => p.beisen !== pair.beisen));
    addPerson({
      key: nextKey(), name: nextName(), mobile: maskedMobile(rand), projectId: 'p_store',
      beisen: { status: kind === '入职' ? '待入职' : '在职', dept: pair.beisen, hireDate: kind === '入职' ? dayOf(at) + DAY : at - 300 * DAY, leaveDate: null },
      target: kind === '入职'
        ? { exists: false, active: false, dept: null, userId: null }
        : { exists: true, active: true, dept: prevPair.target, userId: `wm_${hexId(rand, 8)}` },
      changes: [{ type: kind, at, pending: true }],
    });
  }

  const targetOnly = [
    { id: 'fx_liu', projectId: 'p_hr', name: '刘工（外部顾问）', account: 'liu.consultant', dept: '外部协作', createdAt: now - 80 * DAY, createdBy: '周文', active: true },
    { id: 'fx_test', projectId: 'p_hr', name: '测试账号 test01', account: 'test01', dept: '信息技术部/运维', createdAt: now - 60 * DAY, createdBy: '周文', active: true },
    { id: 'fx_ipad', projectId: 'p_hr', name: '前台 iPad', account: 'frontdesk.ipad', dept: '行政部/前台', createdAt: now - 120 * DAY, createdBy: '周文', active: true },
    { id: 'fx_zhao', projectId: 'p_hr', name: '赵工（驻场工程师）', account: 'zhao.onsite', dept: '信息技术部/桌面支持', createdAt: now - 20 * DAY, createdBy: '周文', active: true },
  ];

  const hrHistory = [3, 2, 4, 2, 1, 2, 0, 1, 3, 2, 1, 2, 4];
  const storeHistory = [1, 0, 0, 2, 1, 0, 0, 1, 0, 0, 1, 2, 4];

  const state = {
    anchorAt: now,
    lastRecon: LR,
    me: { name: '王磊', role: '集成工程师', onCall: { from: dayOf(LR), to: dayOf(LR) + 6 * DAY } },
    users: [
      { name: '王磊', role: '集成工程师 · 本周值班' },
      { name: '李航', role: '值班运维' },
      { name: '陈思远', role: '人力资源 · 业务负责人' },
      { name: '周文', role: 'IT 管理员 · 飞书后台' },
      { name: '林晓', role: '平台管理员' },
    ],
    projects: [
      {
        id: 'p_hr', name: '人员同步', source: 'beisen', target: 'feishu', owner: '王磊', members: ['王磊', '李航', '陈思远'],
        desc: '北森员工入职、调岗、离职后，在飞书开通、更新或停用账号，并通知相关的群。',
        object: '员工', createdAt: now - 45 * DAY, solution: 'beisen-feishu', connections: ['c_beisen', 'c_feishu'], baseConsistent: 930,
      },
      {
        id: 'p_store', name: '门店人员同步', source: 'beisen', target: 'wecom', owner: '李航', members: ['李航', '王磊'],
        desc: '门店员工的企业微信成员与北森保持一致，新人入职通知店长。',
        object: '员工', createdAt: now - 120 * DAY, solution: 'beisen-wecom', connections: ['c_beisen', 'c_wecom'], baseConsistent: 386,
      },
    ],
    workflows: [
      {
        id: 'wf_sync', projectId: 'p_hr', name: '员工同步', template: 'sync-feishu', status: 'on', version: 4,
        updatedAt: now - 9 * DAY, updatedBy: '王磊',
        trigger: { label: '北森 · 员工变动', mode: '轮询 · 每 5 分钟', keyField: '工号', keyPath: 'EmployeeNumber', displayField: '姓名', dedupe: '工号 + 变动时间', checkpointAt: now - 3 * MIN },
        history: [
          { at: now - 45 * DAY, type: 'enable', by: '王磊', start: 'backfill', note: '首次启用，补处理了过去 7 天的 64 条变动' },
          { at: now - 21 * DAY, type: 'publish', by: '王磊', version: 3, note: '改为按工号重新读取员工，不再使用变动内容' },
          { at: now - 12 * DAY, type: 'disable', by: '王磊', note: '飞书侧调整部门结构，暂停同步' },
          { at: now - 12 * DAY + 3 * HOUR + 29 * MIN, type: 'enable', by: '王磊', start: 'gap', note: '从停用时刻开始，补处理了 3 条变动' },
          { at: now - 9 * DAY, type: 'publish', by: '王磊', version: 4, note: '通知只在新开通、实际停用时发送' },
        ],
      },
      {
        id: 'wf_remind', projectId: 'p_hr', name: '入职前一天提醒 IT', template: 'remind-it', status: 'on', version: 2,
        updatedAt: now - 30 * DAY, updatedBy: '李航',
        trigger: { label: '定时 · 每个工作日 17:00', mode: '定时', keyField: null, missedPolicy: '错过的不补' },
        history: [{ at: now - 40 * DAY, type: 'enable', by: '李航', start: 'now', note: '首次启用' }],
      },
      {
        id: 'wf_store', projectId: 'p_store', name: '店员同步', template: 'sync-wecom', status: 'off', version: 3,
        updatedAt: now - 20 * DAY, updatedBy: '李航',
        disabledAt: storeDisabledAt, disabledBy: '李航', disabledNote: '企业微信接口升级，暂停同步',
        trigger: { label: '北森 · 员工变动', mode: '轮询 · 每 5 分钟', keyField: '工号', keyPath: 'EmployeeNumber', displayField: '姓名', dedupe: '工号 + 变动时间', checkpointAt: storeDisabledAt },
        history: [
          { at: now - 120 * DAY, type: 'enable', by: '李航', start: 'now', note: '首次启用' },
          { at: storeDisabledAt, type: 'disable', by: '李航', note: '企业微信接口升级，暂停同步' },
        ],
      },
    ],
    connections: [
      {
        id: 'c_feishu', system: 'feishu', name: '飞书 · 星河人事助手', owner: '王磊', createdAt: now - 46 * DAY,
        authKind: '企业自建应用', fields: [{ label: 'App ID', value: 'cli_a5f3e8b29c21' }, { label: 'App Secret', value: '已加密保存', secret: true }],
        expiresAt: null, credentialNote: '访问令牌由平台自动续期',
        rate: { declared: 50, limit: 50 },
        scope: { label: '通讯录权限范围', mode: '部分部门', included: ['总部', '人力资源', '财务中心', '市场部', '华东销售', '华北销售', '华南销售', '北京研发中心', '上海研发中心', '产品部', '客户成功部', '行政部', '信息技术部', '法务部', '外部协作'], missing: ['深圳研发中心'] },
        permissions: [
          { name: '更新通讯录', usedBy: ['确保账号', '停用账号'], state: 'verified', at: now - 40 * MIN },
          { name: '通过手机号或邮箱获取用户 ID', usedBy: ['确保账号'], state: 'verified', at: now - 40 * MIN },
          { name: '以应用身份发消息', usedBy: ['发送群消息'], state: 'verified', at: LR - 7 * HOUR - 30 * MIN },
          { name: '读取通讯录', usedBy: ['列出通讯录用户（对账）'], state: 'verified', at: LR },
        ],
        queueDaily: [0, 0, 0, 1240, 35, 0, 12],
        waitDaily: [0, 0, 0, 192000, 4100, 0, 2300],
        callsToday: 1842,
      },
      {
        id: 'c_beisen', system: 'beisen', name: '北森 · 星河科技', owner: '王磊', createdAt: now - 46 * DAY,
        authKind: '开放平台应用', fields: [{ label: '租户 ID', value: '208761' }, { label: 'App Key', value: 'bs_k_31f0a6' }, { label: 'App Secret', value: '已加密保存', secret: true }],
        expiresAt: dayOf(now) + 5 * DAY + 23 * HOUR + 59 * MIN, credentialNote: '应用密钥设置了到期时间，到期前要在北森后台重新生成',
        rate: { declared: 20, limit: 20 },
        permissions: [
          { name: '员工信息（只读）', usedBy: ['员工变动', '读取员工', '列出员工（对账）'], state: 'verified', at: now - 3 * MIN },
          { name: '组织信息（只读）', usedBy: ['列出部门（映射覆盖率）'], state: 'verified', at: LR },
          { name: '入职信息（只读）', usedBy: ['查询待入职'], state: 'verified', at: dayOf(LR) - DAY + 17 * HOUR },
        ],
        queueDaily: [0, 0, 0, 0, 0, 0, 0],
        waitDaily: [0, 0, 0, 0, 0, 0, 0],
        callsToday: 2310,
      },
      {
        id: 'c_wecom', system: 'wecom', name: '企业微信 · 门店助手', owner: '李航', createdAt: now - 121 * DAY,
        authKind: '自建应用', fields: [{ label: '企业 ID', value: 'ww8f21c0a7d3' }, { label: 'AgentId', value: '1000006' }, { label: 'Secret', value: '已加密保存', secret: true }],
        expiresAt: null, credentialNote: '访问令牌由平台自动续期',
        rate: { declared: 30, limit: 30 },
        scope: { label: '可见范围', mode: '部分部门', included: ['上海门店', '杭州门店', '南京门店'], missing: [] },
        permissions: [
          { name: '通讯录管理', usedBy: ['确保成员', '禁用成员', '列出成员（对账）'], state: 'verified', at: LR },
          { name: '发送应用消息', usedBy: ['发送应用消息'], state: 'verified', at: storeDisabledAt - HOUR },
        ],
        queueDaily: [0, 0, 0, 0, 0, 0, 0],
        waitDaily: [0, 0, 0, 0, 0, 0, 0],
        callsToday: 96,
      },
    ],
    mappingTables: [
      {
        id: 'mt_dept', projectId: 'p_hr', name: '北森部门 → 飞书部门', fromLabel: '北森部门', toLabel: '飞书部门', missing: 'error',
        rows: hrMapRows,
        sourceValues: hrPairs.map((p) => ({ value: p.beisen, firstSeenAt: p.top === '深圳研发中心' ? LR - 50 * HOUR : now - 300 * DAY })),
        targetValues: hrPairs.map((p) => p.target).concat(['市场部', '外部协作']),
      },
      {
        id: 'mt_store', projectId: 'p_store', name: '北森门店 → 企业微信部门', fromLabel: '北森门店', toLabel: '企业微信部门', missing: 'error',
        rows: storePairs.map((p) => ({ from: p.beisen, to: p.target, addedBy: '李航', addedAt: now - 120 * DAY })),
        sourceValues: storePairs.map((p) => ({ value: p.beisen, firstSeenAt: now - 300 * DAY })),
        targetValues: storePairs.map((p) => p.target),
      },
    ],
    people,
    targetOnly,
    runs,
    recons: [
      {
        id: 'rc_hr', projectId: 'p_hr', name: '北森 ↔ 飞书 员工对账', hour: 2, minute: 0,
        sourceDesc: '北森 · 列出员工：在职、待入职，以及 30 天内离职的员工',
        targetDesc: '飞书 · 列出通讯录用户：应用权限范围内的全部用户',
        matchDesc: '北森「工号」对飞书用户的「工号」字段；对不上时用手机号兜底',
        fields: [
          { name: '账号状态', rule: '北森在职、待入职 ↔ 飞书已激活；北森离职 ↔ 飞书已停用' },
          { name: '部门', rule: '北森部门经「北森部门 → 飞书部门」映射后比较' },
        ],
        remediation: 'wf_sync',
        exceptions: [
          { id: 'ex_ext', kind: 'rule', text: '飞书部门为「外部协作」的账号不参与对账', by: '王磊', at: now - 40 * DAY, reason: '外部顾问和合作方，不在北森里' },
        ],
        history: hrHistory.map((n, i) => ({ at: LR - (hrHistory.length - i) * DAY, total: n })),
        runs: [],
      },
      {
        id: 'rc_store', projectId: 'p_store', name: '北森 ↔ 企业微信 门店员工对账', hour: 2, minute: 30,
        sourceDesc: '北森 · 列出员工：门店组织下在职、待入职，以及 30 天内离职的员工',
        targetDesc: '企业微信 · 列出成员：可见范围内的全部成员',
        matchDesc: '北森「工号」对企业微信成员的「账号」',
        fields: [
          { name: '成员状态', rule: '北森在职、待入职 ↔ 企业微信已启用；北森离职 ↔ 企业微信已禁用' },
          { name: '部门', rule: '北森门店经「北森门店 → 企业微信部门」映射后比较' },
        ],
        remediation: 'wf_store',
        exceptions: [],
        history: storeHistory.map((n, i) => ({ at: LR + 30 * MIN - (storeHistory.length - i) * DAY, total: n })),
        runs: [],
      },
    ],
    issues: [
      {
        id: 'I-21', kind: 'recon', severity: 'high', status: 'open', projectId: 'p_hr', category: 'leftActive',
        title: '离职员工的飞书账号仍可登录', keys: ['E10087', 'E09961'],
        firstSeenAt: LR + 4 * MIN, lastSeenAt: LR + 4 * MIN, assignee: '王磊',
        timeline: [
          { at: LR + 4 * MIN, text: '对账发现 2 名离职员工的飞书账号仍是激活状态' },
          { at: LR + 4 * MIN, text: '高危：已通知飞书群「集成值班」，并短信通知值班人王磊' },
        ],
      },
      {
        id: 'I-20', kind: 'failure', severity: 'normal', status: 'open', projectId: 'p_hr', workflowId: 'wf_sync', stepId: 's4',
        code: 'HTTP_400', cause: 'scope', title: '确保账号失败：部门不在飞书应用的通讯录权限范围内',
        keys: szPeople.filter((p) => p.beisen.dept === '深圳研发中心-测试组').map((p) => p.key),
        runIds: failedRuns.filter((r) => r.issueId === 'I-20').map((r) => r.id),
        firstSeenAt: szEntered + 5 * MIN, lastSeenAt: szEntered + 5 * MIN + 6000, assignee: '王磊',
        timeline: [
          { at: szEntered + 5 * MIN, text: '3 次运行在「确保账号」失败，飞书返回 HTTP 400' },
          { at: szEntered + 5 * MIN, text: '已通知飞书群「集成值班」（同一原因只通知一次）' },
        ],
      },
      {
        id: 'I-19', kind: 'failure', severity: 'normal', status: 'open', projectId: 'p_hr', workflowId: 'wf_sync', stepId: 's3',
        code: 'MAPPING_MISSING', cause: 'mapping', mappingValue: '深圳研发中心-平台组', tableId: 'mt_dept',
        title: '部门映射缺失：北森部门「深圳研发中心-平台组」',
        keys: szPeople.filter((p) => p.beisen.dept === '深圳研发中心-平台组').map((p) => p.key),
        runIds: failedRuns.filter((r) => r.issueId === 'I-19').map((r) => r.id),
        firstSeenAt: szEntered + 5 * MIN + 9000, lastSeenAt: szEntered + 5 * MIN + 12000, assignee: null,
        timeline: [
          { at: LR - 50 * HOUR, text: '设计期检查：北森出现新部门「深圳研发中心-平台组」，映射表里没有（当时没有人处理）' },
          { at: szEntered + 5 * MIN + 9000, text: '2 次运行在「部门映射」失败' },
          { at: szEntered + 5 * MIN + 9000, text: '已通知飞书群「集成值班」' },
        ],
      },
      {
        id: 'I-18', kind: 'unknown', severity: 'normal', status: 'open', projectId: 'p_hr', workflowId: 'wf_sync', stepId: 's5',
        code: 'STEP_TIMEOUT', title: '通知 HR 入职群超时，无法确定消息是否已发出',
        keys: ['E10235'], runIds: [huangRun.id], firstSeenAt: LR - 7 * HOUR + 31000, lastSeenAt: LR - 7 * HOUR + 31000, assignee: null,
        timeline: [
          { at: LR - 7 * HOUR + 31000, text: '「发送群消息」请求已发出，30 秒内没有收到飞书的响应' },
          { at: LR - 7 * HOUR + 31000, text: '这一步不幂等，平台没有自动重试，等待人工确认' },
        ],
      },
      {
        id: 'I-17', kind: 'credential', severity: 'normal', status: 'open', projectId: 'p_hr', connectionId: 'c_beisen',
        title: '北森连接的应用密钥即将到期', keys: [],
        firstSeenAt: dayOf(now) - DAY + 9 * HOUR, lastSeenAt: dayOf(now) - DAY + 9 * HOUR, assignee: '王磊',
        timeline: [{ at: dayOf(now) - DAY + 9 * HOUR, text: '距到期不足 7 天，已提醒连接负责人王磊' }],
      },
      {
        id: 'I-23', kind: 'paused', severity: 'normal', status: 'open', projectId: 'p_store', workflowId: 'wf_store',
        title: '「店员同步」已停用，北森的变动没有处理', keys: [],
        firstSeenAt: storeDisabledAt + 6 * HOUR, lastSeenAt: LR + 30 * MIN, assignee: '李航',
        timeline: [
          { at: storeDisabledAt, text: '李航停用了工作流：企业微信接口升级，暂停同步' },
          { at: storeDisabledAt + 6 * HOUR, text: '停用期间北森出现第一条门店员工变动' },
          { at: LR + 30 * MIN, text: '对账发现的差异都和这次停用有关，已关联到这里' },
        ],
      },
      {
        id: 'I-16', kind: 'failure', severity: 'normal', status: 'resolved', projectId: 'p_hr', workflowId: 'wf_sync', stepId: 's4',
        code: 'HTTP_401', title: '确保账号失败：飞书凭证无效', keys: [], runIds: [],
        firstSeenAt: now - 9 * DAY - 2 * HOUR, lastSeenAt: now - 9 * DAY - HOUR, resolvedAt: now - 9 * DAY, assignee: '王磊', resolvedNote: '重新填写 App Secret 后重放 4 次运行，全部成功',
        timeline: [{ at: now - 9 * DAY, text: '王磊重放 4 次运行，全部成功，问题自动关闭' }],
      },
      {
        id: 'I-15', kind: 'failure', severity: 'normal', status: 'resolved', projectId: 'p_store', workflowId: 'wf_store', stepId: 's3',
        code: 'MAPPING_MISSING', title: '门店映射缺失：北森门店「南京门店-河西店」', keys: [], runIds: [],
        firstSeenAt: now - 14 * DAY, lastSeenAt: now - 14 * DAY, resolvedAt: now - 14 * DAY + 2 * HOUR, assignee: '李航', resolvedNote: '补上映射后重放 2 次运行，全部成功',
        timeline: [{ at: now - 14 * DAY + 2 * HOUR, text: '李航补上映射并重放，问题自动关闭' }],
      },
    ],
    journal: [
      {
        id: 'j_queue', kind: 'queue', at: recruitDay + 9 * HOUR, projectId: 'p_hr', connectionId: 'c_feishu',
        title: '校招集中入职，飞书请求在连接上排队', detail: `186 人在 40 分钟内入职，飞书请求按连接上限每秒 50 次排队，最长等了 3 分 12 秒，没有一条失败。`,
        value: 1240, unit: '次请求排队',
      },
      {
        id: 'j_catchup', kind: 'catchup', at: downtimeEnd, projectId: 'p_hr',
        title: '升级停机后从检查点继续', detail: `实例升级停机 95 分钟，恢复后从停机前的检查点继续轮询，补处理了北森的 14 条变动。`,
        value: 14, unit: '条变动补处理',
      },
      {
        id: 'j_dedupe', kind: 'dedupe', at: dedupeSources.length ? dedupeSources[0].at : now - 3 * DAY, projectId: 'p_hr',
        title: '拦下重复的变动', detail: '北森对同一员工的同一次变动重复返回，按「工号 + 变动时间」拦下，没有重复开通。',
        value: 12, unit: '条重复变动',
      },
      {
        id: 'j_retry', kind: 'retry', at: pool[3] ? pool[3].at : now - 4 * DAY, projectId: 'p_hr',
        title: '超时后安全重试', detail: '飞书「确保账号」调用超时 7 次。这个操作声明了幂等，平台自动重试，全部成功，没有产生重复账号。',
        value: 7, unit: '次安全重试',
      },
    ],
    platform: { name: '星河科技', version: '1.4.2', downtime: { from: downtimeStart, to: downtimeEnd } },
  };
  state.runs.sort((a, b) => b.at - a.at);
  state.recons.forEach((recon) => {
    recon.runs = [buildReconRun(state, recon.projectId, recon.id === 'rc_store' ? LR + 30 * MIN : LR)];
  });
  state.issues = syncReconIssues(state, 'p_hr', LR + 4 * MIN);
  state.issues = syncReconIssues(state, 'p_store', LR + 34 * MIN);
  return state;
}
