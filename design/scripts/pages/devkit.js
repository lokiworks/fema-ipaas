const DEVKIT_PRESET_SERVICES = [
  { id: 'github', name: 'GitHub' }, { id: 'jira', name: 'Jira' }, { id: 'salesforce', name: 'Salesforce' }, { id: 'kingdee', name: '金蝶云星空' },
  { id: 'dingtalk', name: '钉钉' }, { id: 'wecom', name: '企业微信' }, { id: 'shopify', name: 'Shopify' }, { id: 'notion', name: 'Notion' },
  { id: 'zendesk', name: 'Zendesk' }, { id: 'hubspot', name: 'HubSpot' }, { id: 'gitlab', name: 'GitLab' },
];

const DEVKIT_AUTH_TYPES = [
  { value: 'oauth2', label: '授权码', desc: 'OAuth2Code，用户跳转到服务方授权', icon: 'KeyRound' },
  { value: 'client', label: '客户端凭证', desc: 'OAuth2ClientCredentials，服务间调用', icon: 'Server' },
  { value: 'apikey', label: 'API Key', desc: '在请求头或参数中携带密钥', icon: 'Key' },
  { value: 'basic', label: 'Basic Auth', desc: '用户名 + 密码', icon: 'UserRound' },
];

const DEVKIT_ICON_COLORS = ['#0EA5E9', '#2563EB', '#8142E3', '#0891B2', '#16A34A', '#D97706', '#E11D48', '#DB2777', '#525252'];

const DEVKIT_KEY_RE = /^[a-z][a-z0-9_]*$/;

const DEVKIT_FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const DEVKIT_CONTROLS = ['输入框', '下拉单选', '代码', '开关'];

const DEVKIT_TYPES = ['string', 'number', 'boolean', 'object', 'array'];

const DEVKIT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const DEVKIT_AUTH_CONTROLS = ['单行文本', '密码', '多行文本', '下拉单选'];

const DEVKIT_CHANGE = { add: { label: '新增', tone: 'success' }, update: { label: '更新', tone: 'info' }, remove: { label: '删除', tone: 'danger' } };

const DEVKIT_KIND = { action: '操作', trigger: '触发器', base: '连接器配置' };

const DEVKIT_FIELD_LABELS = {
  name: '名称', key: '标识', method: '请求方法', path: '请求路径', desc: '说明', group: '分组', params: '入参', api: 'API 配置',
  statusFollow: '状态码', statusCodes: '状态码', sample: '出参', type: '类型', settings: '设置表单', config: '触发配置', baseUrl: 'Base URL',
};

const DEVKIT_PLUGIN_TEMPLATE = 'function beforeRequest(request, auth) {\n  return request;\n}\n';

const DEVKIT_OPENAPI_SAMPLE = {
  openapi: '3.0.1',
  info: { title: '工单系统', description: '内部 IT 工单的查询与创建接口' },
  servers: [{ url: 'https://tickets.example.com/api/v1' }],
  paths: {
    '/tickets': {
      get: {
        operationId: 'listTickets', summary: '查询工单列表', tags: ['工单'],
        parameters: [{ name: 'status', in: 'query', description: '工单状态', schema: { type: 'string', enum: ['open', 'closed'] } }, { name: 'page', in: 'query', description: '页码', schema: { type: 'integer' } }],
        responses: { 200: { content: { 'application/json': { example: { total: 1, items: [{ id: 'T-1024', title: 'VPN 无法连接', status: 'open' }] } } } } },
      },
      post: {
        operationId: 'createTicket', summary: '创建工单', tags: ['工单'],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: '标题' }, urgent: { type: 'boolean', description: '是否紧急' }, detail: { type: 'object', description: '详细信息' } } } } } },
        responses: { 201: { content: { 'application/json': { example: { id: 'T-1025', status: 'open' } } } } },
      },
    },
    '/tickets/{id}': {
      get: {
        operationId: 'getTicket', summary: '查询工单详情', tags: ['工单'],
        parameters: [{ name: 'id', in: 'path', required: true, description: '工单 ID', schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/json': { example: { id: 'T-1024', title: 'VPN 无法连接', status: 'open', assignee: 'IT 服务台' } } } } },
      },
    },
  },
};

function devkitIsAdmin(state) {
  const me = state.users.find((u) => u.id === state.me);
  return Boolean(me && (me.role === 'owner' || me.role === 'admin'));
}

function devkitCanAccess(state, cc) {
  return cc.owner === state.me || (cc.developers || []).includes(state.me) || devkitIsAdmin(state);
}

function devkitUnique(list) {
  return [...new Set(list)];
}

function devkitOmit(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

function devkitDevelopers(cc) {
  return devkitUnique([cc.owner, ...(cc.developers || [])]);
}

function devkitScopeUsers(cc) {
  return cc.scopeUsers && cc.scopeUsers.length ? cc.scopeUsers : devkitDevelopers(cc);
}

function devkitScope(cc) {
  if (cc.visibility === 'dept') return { label: '指定部门', list: cc.scopeDepts || [] };
  if (cc.visibility === 'project') return { label: '指定成员', list: devkitScopeUsers(cc).map(personName) };
  return { label: '全部成员', list: [] };
}

function devkitAuthOf(cc) {
  return cc.auth && cc.auth.type && cc.auth.type !== 'none' ? cc.auth : null;
}

function devkitAuthLabel(type) {
  const t = DEVKIT_AUTH_TYPES.find((x) => x.value === type);
  return t ? t.label : AUTH_LABEL[type] || type;
}

function devkitTestState(t) {
  if (t === true || (t && t.ok === true)) return 'pass';
  if (t && t.ok === false) return 'fail';
  return 'none';
}

function devkitIconText(name) {
  const ch = [...String(name || '').trim()][0] || '新';
  return /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
}

function devkitIsUrl(s) {
  return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(String(s || '').trim());
}

function devkitVersionCmp(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  const i = [0, 1, 2].find((k) => (pa[k] || 0) !== (pb[k] || 0));
  return i === undefined ? 0 : (pa[i] || 0) - (pb[i] || 0);
}

function devkitUniqueKey(base, taken) {
  return Array.from({ length: taken.length + 2 }, (_, i) => (i === 0 ? base : `${base}${i + 1}`)).find((k) => !taken.includes(k));
}

function devkitSame(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function devkitReleaseState(versions, fallback) {
  const live = versions.filter((v) => v.status !== 'deprecated');
  const released = live.filter((v) => v.status === 'released');
  const pool = released.length ? released : live;
  const top = [...pool].sort((a, b) => devkitVersionCmp(b.version, a.version))[0];
  return { version: top ? top.version : fallback, status: live.length ? 'published' : versions.length ? 'offline' : 'draft' };
}

function devkitParamDef(p) {
  return {
    key: p.key, label: p.label, type: p.type, control: p.control, required: Boolean(p.required), source: p.source || '输入值',
    options: p.options, optionsFrom: p.optionsFrom, hint: p.hint, pattern: p.pattern, patternMsg: p.patternMsg, visibleIf: p.visibleIf,
  };
}

function devkitOpDef(a) {
  const own = a.statusFollow === false;
  return {
    name: a.name, key: a.key, method: a.method, path: a.path, desc: a.desc || '', group: a.group || '',
    params: (a.params || []).map(devkitParamDef), api: a.api, statusFollow: own ? false : undefined, statusCodes: own ? a.statusCodes : undefined, sample: a.sample,
  };
}

function devkitTrigDef(t) {
  return { name: t.name, key: t.key, type: t.type, desc: t.desc || '', settings: (t.settings || []).map(devkitParamDef), config: t.config, sample: t.sample };
}

function devkitStatusDefaults() {
  return {
    codePath: '{{body.code}}', msgPath: '{{body.message}}', unmatched: 'fail',
    rows: [
      { id: 'sc1', code: '0', ok: true, retry: false, tip: '' },
      { id: 'sc2', code: '401', ok: false, retry: false, tip: '认证失败，检查连接是否过期' },
      { id: 'sc3', code: '429', ok: false, retry: true, tip: '触发限流，稍后自动重试' },
      { id: 'sc4', code: '500', ok: false, retry: true, tip: '服务端异常，稍后重试或联系服务方' },
    ],
  };
}

function devkitStatusOf(cc) {
  return cc.statusCodes || devkitStatusDefaults();
}

function devkitBaseDef(cc) {
  return { baseUrl: cc.baseUrl || '', statusCodes: devkitStatusOf(cc) };
}

function devkitPublishedOps(cc) {
  return cc.versions[0] ? cc.versions[0].snapshot || [] : [];
}

function devkitPublishedTrigs(cc) {
  const v = cc.versions[0];
  if (!v) return [];
  if (v.triggerKeys) return v.triggerKeys;
  return cc.triggers.filter((t) => !t.createdAt || t.createdAt <= v.publishedAt).map((t) => t.key).concat((cc.removed || []).filter((r) => r.kind === 'trigger' && (!r.createdAt || r.createdAt <= v.publishedAt)).map((r) => r.key));
}

function devkitTouchOp(cc, op, next) {
  if (op.baseline !== undefined || !devkitPublishedOps(cc).includes(op.key)) return next;
  return { ...next, baseline: devkitOpDef(op) };
}

function devkitTouchTrig(cc, t, next) {
  if (t.baseline !== undefined || !devkitPublishedTrigs(cc).includes(t.key)) return next;
  return { ...next, baseline: devkitTrigDef(t) };
}

function devkitBaseMark(cc) {
  if (cc.pendingBase !== undefined || !cc.versions.length) return {};
  return { pendingBase: devkitBaseDef(cc) };
}

function devkitChanges(cc) {
  const opKeys = devkitPublishedOps(cc);
  const trigKeys = devkitPublishedTrigs(cc);
  const ops = cc.actions.flatMap((a) => {
    const after = devkitOpDef(a);
    const row = { id: `action:${a.id}`, kind: 'action', ref: a.id, key: a.key, name: a.name, method: a.method, after };
    if (!opKeys.includes(a.key)) return [{ ...row, change: 'add', before: null }];
    if (a.baseline && !devkitSame(a.baseline, after)) return [{ ...row, change: 'update', before: a.baseline }];
    return [];
  });
  const trigs = cc.triggers.flatMap((t) => {
    const after = devkitTrigDef(t);
    const row = { id: `trigger:${t.id}`, kind: 'trigger', ref: t.id, key: t.key, name: t.name, after };
    if (!trigKeys.includes(t.key)) return [{ ...row, change: 'add', before: null }];
    if (t.baseline && !devkitSame(t.baseline, after)) return [{ ...row, change: 'update', before: t.baseline }];
    return [];
  });
  const gone = (cc.removed || [])
    .filter((r) => (r.kind === 'action' ? opKeys : trigKeys).includes(r.key))
    .map((r) => ({ id: `removed:${r.id}`, kind: r.kind, ref: r.id, key: r.key, name: r.name, method: r.def && r.def.method, change: 'remove', before: r.def, after: null }));
  const base = cc.pendingBase && !devkitSame(cc.pendingBase, devkitBaseDef(cc))
    ? [{ id: 'base', kind: 'base', ref: 'base', key: 'base', name: 'Base URL 与状态码', change: 'update', before: cc.pendingBase, after: devkitBaseDef(cc) }]
    : [];
  return [...ops, ...trigs, ...gone, ...base];
}

function devkitChangedFields(before, after) {
  if (!before || !after) return [];
  return devkitUnique(Object.keys({ ...before, ...after }).filter((k) => !devkitSame(before[k], after[k])).map((k) => DEVKIT_FIELD_LABELS[k] || k));
}

function devkitLineDiff(a, b) {
  const x = a ? a.split('\n') : [];
  const y = b ? b.split('\n') : [];
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i -= 1) {
    for (let j = y.length - 1; j >= 0; j -= 1) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const left = [];
  const right = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      left.push({ text: x[i], kind: 'same' });
      right.push({ text: y[j], kind: 'same' });
      i += 1;
      j += 1;
    } else if (j >= y.length || (i < x.length && dp[i + 1][j] >= dp[i][j + 1])) {
      left.push({ text: x[i], kind: 'del' });
      i += 1;
    } else {
      right.push({ text: y[j], kind: 'add' });
      j += 1;
    }
  }
  return { left, right };
}

function devkitJsonError(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    JSON.parse(raw.replace(/\{\{[^{}]*\}\}/g, 'null'));
    return '';
  } catch (e) {
    return 'JSON 格式不正确';
  }
}

function devkitUnknownRefs(text, params) {
  const keys = params.map((p) => p.key);
  return devkitUnique([...String(text || '').matchAll(/\{\{\s*input\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]).filter((k) => !keys.includes(k)));
}

function devkitBodyTemplate(params) {
  if (!params.length) return '{}';
  const line = (p) => `  "${p.key}": ${['object', 'array', 'number', 'boolean'].includes(p.type) ? `{{input.${p.key}}}` : `"{{input.${p.key}}}"`}`;
  return `{\n${params.map(line).join(',\n')}\n}`;
}

function devkitApiOf(op) {
  const params = op.params || [];
  const pathKeys = [...String(op.path || '').matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);
  const noBody = ['GET', 'DELETE'].includes(op.method);
  const rest = params.filter((p) => !pathKeys.includes(p.key));
  const defaults = {
    headers: noBody ? [] : [{ id: 'h1', key: 'Content-Type', value: 'application/json' }],
    query: noBody ? rest.map((p, i) => ({ id: `q${i + 1}`, key: p.key, value: `{{input.${p.key}}}` })) : [],
    bodyType: noBody ? 'none' : 'JSON',
    body: noBody ? '' : devkitBodyTemplate(rest),
    form: [],
    timeout: 30,
    followRedirect: true,
  };
  return { ...defaults, ...(op.api || {}) };
}

function devkitKvErrors(rows, { caseInsensitive } = {}) {
  const norm = (k) => (caseInsensitive ? k.trim().toLowerCase() : k.trim());
  return rows.map((r, i) => {
    if (!r.key.trim()) return r.value.trim() ? '请填写 Key' : '';
    return rows.findIndex((x) => norm(x.key) === norm(r.key)) < i ? `Key「${r.key.trim()}」重复` : '';
  });
}

function devkitFormFields(auth) {
  if (auth.type === 'apikey') return [{ key: 'api_key', label: 'API Key', control: '密码', required: true }];
  if (auth.type === 'basic') return [{ key: 'username', label: '用户名', control: '单行文本', required: true }, { key: 'password', label: '密码', control: '密码', required: true }];
  return [{ key: 'client_id', label: 'Client ID', control: '单行文本', required: true }, { key: 'client_secret', label: 'Client Secret', control: '密码', required: true }];
}

function devkitFlowDefs(type) {
  if (type === 'oauth2') {
    return [
      { key: 'token', title: '授权-获取访问令牌', required: true, desc: '用户在服务方完成授权后，用授权码换取访问令牌' },
      { key: 'refresh', title: '刷新访问令牌', required: false, desc: '访问令牌过期前自动刷新，避免连接失效' },
      { key: 'user', title: '获取授权用户', required: false, desc: '读取授权账号信息，显示在连接列表里' },
    ];
  }
  if (type === 'client') {
    return [
      { key: 'token', title: '获取访问令牌', required: true, desc: '用 Client ID 和 Client Secret 换取访问令牌' },
      { key: 'user', title: '获取授权用户', required: false, desc: '读取应用或账号信息，显示在连接列表里' },
    ];
  }
  return [{ key: 'user', title: '获取授权用户', required: true, desc: '用填写的认证信息请求一次，校验是否有效' }];
}

function devkitDefaultFlow(key, auth) {
  if (key === 'token' && auth.type === 'oauth2') {
    return { enabled: true, method: 'POST', url: auth.tokenUrl || '/oauth/token', config: '{\n  "body": {\n    "grant_type": "authorization_code",\n    "code": "{{authInput.code}}",\n    "client_id": "{{authInput.client_id}}",\n    "client_secret": "{{authInput.client_secret}}",\n    "redirect_uri": "{{redirectUri}}"\n  }\n}' };
  }
  if (key === 'token') {
    return { enabled: true, method: 'POST', url: auth.tokenUrl || '/oauth/token', config: '{\n  "body": {\n    "grant_type": "client_credentials",\n    "client_id": "{{authInput.client_id}}",\n    "client_secret": "{{authInput.client_secret}}"\n  }\n}' };
  }
  if (key === 'refresh') {
    return { enabled: true, method: 'POST', url: auth.tokenUrl || '/oauth/token', config: '{\n  "body": {\n    "grant_type": "refresh_token",\n    "refresh_token": "{{authData.refresh_token}}"\n  }\n}' };
  }
  if (auth.type === 'apikey') {
    const where = auth.location === 'query' ? 'query' : 'headers';
    return { enabled: true, method: 'GET', url: '/me', config: `{\n  "${where}": { "${auth.keyName || 'X-Api-Key'}": "{{authInput.api_key}}" }\n}` };
  }
  if (auth.type === 'basic') {
    return { enabled: true, method: 'GET', url: '/me', config: '{\n  "headers": { "Authorization": "Basic {{base64(authInput.username + \':\' + authInput.password)}}" }\n}' };
  }
  return { enabled: true, method: 'GET', url: '/me', config: '{\n  "headers": { "Authorization": "Bearer {{authData.access_token}}" }\n}' };
}

function devkitAuthDraft(cc) {
  const a = devkitAuthOf(cc);
  if (!a) return null;
  return {
    name: a.name || '',
    desc: a.desc || '',
    ...(a.type === 'apikey' ? { location: a.location || 'header', keyName: a.keyName || 'X-Api-Key' } : {}),
    fields: a.fields || [],
    flows: Object.fromEntries(devkitFlowDefs(a.type).map((f) => [f.key, (a.flows && a.flows[f.key]) || devkitDefaultFlow(f.key, a)])),
    plugin: a.plugin || { enabled: false, code: DEVKIT_PLUGIN_TEMPLATE },
  };
}

function devkitAuthCfg(d) {
  return d ? devkitOmit(d, ['name', 'desc']) : null;
}

function devkitFlowError(def, flow) {
  if (!def.required && !flow.enabled) return '';
  const url = String(flow.url || '').trim();
  if (!url) return '请填写请求地址';
  if (!url.startsWith('/') && !devkitIsUrl(url)) return '请求地址需要以 / 或 http(s):// 开头';
  if (devkitJsonError(flow.config)) return '请求配置不是有效的 JSON';
  return '';
}

function devkitGroups(cc) {
  const names = devkitUnique([...(cc.groups || []), ...cc.actions.map((a) => a.group || '')]);
  const ordered = [...names.filter(Boolean), ...(names.includes('') ? [''] : [])];
  return ordered.map((n) => ({ name: n, label: n || '未分组', ops: cc.actions.filter((a) => (a.group || '') === n) }));
}

function devkitUsage(state, cc) {
  const nodes = state.workflows.flatMap((wf) => allNodes(wf).filter((n) => n.connector === cc.id).map((n) => ({ wf, node: n })));
  return {
    nodes: nodes.length,
    workflows: devkitUnique(nodes.map((x) => x.wf.id)).length,
    connections: state.connections.filter((c) => c.connector === cc.id).length,
    byVersion: (v) => nodes.filter((x) => (x.node.connectorVersion || cc.version) === v).length,
  };
}

function devkitTrigCfg(t) {
  const c = t.config || {};
  return {
    webhook: {
      subscribe: { enabled: true, method: 'POST', path: '/webhooks', ...((c.webhook && c.webhook.subscribe) || {}) },
      unsubscribe: { enabled: true, method: 'DELETE', path: '/webhooks/{{subscriptionId}}', ...((c.webhook && c.webhook.unsubscribe) || {}) },
      handle: (c.webhook && c.webhook.handle) || '{\n  "id": "{{event.id}}",\n  "type": "{{event.type}}",\n  "data": {{event.data}}\n}',
    },
    polling: {
      method: 'GET', path: `/${t.key}`, interval: '5', paging: 'page', startPage: '1', cursorPath: '{{body.next_cursor}}', hasMorePath: '{{body.has_more}}',
      sort: 'desc', listPath: '{{body.items}}', dedupKey: '{{item.id}}', checkpoint: 'lastTime = max(item.updatedAt)',
      ...(c.polling || {}),
    },
  };
}

function devkitParamValueError(p, v) {
  const empty = v === undefined || v === null || String(v).trim() === '';
  if (p.control === '开关') return '';
  if (empty) return p.required ? `请填写${p.label}` : '';
  if (p.type === 'number' && p.control === '输入框' && Number.isNaN(Number(v))) return '需要填写数字';
  if (p.control === '代码' && devkitJsonError(v)) return 'JSON 格式不正确';
  if (p.pattern) {
    try {
      if (!new RegExp(p.pattern).test(String(v))) return p.patternMsg || '格式不正确';
    } catch (e) {
      return '';
    }
  }
  return '';
}

function devkitHash(s) {
  return [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100000, 7);
}

function devkitAuthHeader(auth) {
  if (!auth || auth.enabled === false) return '';
  if (auth.type === 'apikey') return auth.location === 'query' ? '' : `${auth.keyName || 'X-Api-Key'}: ••••••`;
  if (auth.type === 'basic') return 'Authorization: Basic ••••••';
  return 'Authorization: Bearer ••••••';
}

function devkitSimulate({ cc, op, values, conn }) {
  const auth = devkitAuthOf(cc);
  const api = devkitApiOf(op);
  const params = op.params || [];
  const text = (k) => (values[k] === undefined || values[k] === null ? '' : String(values[k]));
  const fill = (s) => String(s || '').replace(/\{\{\s*input\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, k) => text(k));
  const path = String(op.path || '').replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => encodeURIComponent(text(k)) || m);
  const query = api.query.filter((r) => r.key.trim()).map((r) => `${encodeURIComponent(r.key.trim())}=${encodeURIComponent(fill(r.value))}`);
  const keyQuery = auth && auth.enabled !== false && auth.type === 'apikey' && auth.location === 'query' ? [`${auth.keyName || 'api_key'}=••••••`] : [];
  const qs = [...query, ...keyQuery].join('&');
  const url = `${cc.baseUrl || ''}${path}${qs ? `?${qs}` : ''}`;
  const typed = (k) => {
    const p = params.find((x) => x.key === k);
    const v = values[k];
    if (!p || v === undefined || v === '') return 'null';
    if (p.control === '代码') return String(v);
    if (p.type === 'number' || p.type === 'boolean') return String(v);
    return JSON.stringify(String(v));
  };
  const body = api.bodyType === 'JSON'
    ? String(api.body || '').replace(/"\{\{\s*input\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}"/g, (m, k) => JSON.stringify(text(k))).replace(/\{\{\s*input\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, k) => typed(k))
    : api.bodyType === 'none' ? '' : (api.form || []).filter((r) => r.key.trim()).map((r) => `${r.key.trim()}=${fill(r.value)}`).join('&');
  const headers = [...api.headers.filter((h) => h.key.trim()).map((h) => `${h.key.trim()}: ${fill(h.value)}`), devkitAuthHeader(auth)].filter(Boolean);
  const request = [`${op.method} ${url}`, ...headers, ...(body ? ['', body] : [])].join('\n');
  const duration = 120 + (devkitHash(`${op.key}${JSON.stringify(values)}`) % 380);
  const at = Date.now();
  const clock = (ms) => new Date(at + ms).toTimeString().slice(0, 8);
  const host = (/^https?:\/\/([^/?#]+)/i.exec(cc.baseUrl || '') || [])[1] || '';
  if (!host) return { ok: false, status: 0, duration: 0, at, request, response: { error: 'Base URL 未配置，无法发起请求' }, log: `[${clock(0)}] 请求失败：Base URL 未配置` };
  if (conn && conn.status !== 'active') {
    return { ok: false, status: 401, duration, at, request, response: { error: conn.error || '连接已失效，需要重新授权' }, log: [`[${clock(0)}] 解析 ${host}`, `[${clock(20)}] → ${op.method} ${path}`, `[${clock(duration)}] ← 401 (${duration} ms)`].join('\n') };
  }
  return {
    ok: true, status: 200, duration, at, request,
    response: op.sample && typeof op.sample === 'object' ? op.sample : {},
    log: [`[${clock(0)}] 解析 ${host}`, `[${clock(18)}] 建立 TLS 连接`, `[${clock(26)}] → ${op.method} ${path}`, `[${clock(duration)}] ← 200 (${duration} ms)`].join('\n'),
  };
}

function devkitSlug(s) {
  const k = String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (/^[a-z]/.test(k) ? k : `op_${k}`).replace(/_+$/g, '').slice(0, 40);
}

function devkitSchemaParam(key, s, required, description) {
  const type = s.type === 'integer' ? 'number' : DEVKIT_TYPES.includes(s.type) ? s.type : 'string';
  const control = s.enum ? '下拉单选' : type === 'boolean' ? '开关' : type === 'object' || type === 'array' ? '代码' : '输入框';
  return { key, label: String(description || key).slice(0, 30), type, control, required: Boolean(required) && control !== '开关', source: '输入值', ...(s.enum ? { options: s.enum.map(String) } : {}) };
}

function devkitOpenApiParams(op) {
  const fromParams = (op.parameters || []).filter((p) => p && p.name && (p.in === 'query' || p.in === 'path')).map((p) => devkitSchemaParam(p.name, p.schema || {}, p.required, p.description));
  const content = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
  const schema = (content && content.schema) || {};
  const req = schema.required || [];
  const fromBody = schema.properties ? Object.entries(schema.properties).map(([k, s]) => devkitSchemaParam(k, s || {}, req.includes(k), s && s.description)) : [];
  return [...fromParams, ...fromBody].filter((p, i, arr) => DEVKIT_FIELD_RE.test(p.key) && arr.findIndex((x) => x.key === p.key) === i);
}

function devkitOpenApiSample(op) {
  const r = op.responses && (op.responses['200'] || op.responses['201']);
  const c = r && r.content && r.content['application/json'];
  const examples = c && c.examples ? Object.values(c.examples) : [];
  const ex = c && (c.example || (examples[0] && examples[0].value));
  return ex && typeof ex === 'object' ? ex : {};
}

function devkitParseOpenApi(text, takenKeys) {
  if (!text.trim()) return { ok: false, error: '' };
  let spec = null;
  try {
    spec = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'JSON 格式不正确，请检查后重新粘贴' };
  }
  if (!spec || typeof spec !== 'object' || !/^3\./.test(String(spec.openapi || '')) || !spec.paths || typeof spec.paths !== 'object') {
    return { ok: false, error: '不是 OpenAPI 3.x 规范：缺少 openapi 版本号或 paths' };
  }
  const found = Object.entries(spec.paths).flatMap(([path, item]) => ['get', 'post', 'put', 'patch', 'delete'].filter((m) => item && item[m]).map((m) => ({ path, method: m.toUpperCase(), op: item[m] })));
  if (!found.length) return { ok: false, error: 'paths 里没有可导入的接口' };
  const keys = found.reduce((acc, o) => [...acc, devkitUniqueKey(devkitSlug(o.op.operationId || `${o.method}_${o.path}`), acc)], []);
  const title = String((spec.info && spec.info.title) || '').trim().slice(0, 30) || '导入的连接器';
  const server = spec.servers && spec.servers[0] && spec.servers[0].url ? String(spec.servers[0].url).replace(/\/+$/, '') : '';
  const now = Date.now();
  return {
    ok: true,
    title,
    description: String((spec.info && spec.info.description) || '').slice(0, 200),
    baseUrl: devkitIsUrl(server) ? server : '',
    key: devkitUniqueKey(devkitSlug(`custom_${title}`), takenKeys),
    actions: found.map((o, i) => ({
      id: uid('a'), key: keys[i], name: String(o.op.summary || o.op.operationId || `${o.method} ${o.path}`).slice(0, 30), method: o.method, path: o.path,
      desc: String(o.op.description || '').slice(0, 100), group: String((o.op.tags && o.op.tags[0]) || '').slice(0, 20), params: devkitOpenApiParams(o.op), sample: devkitOpenApiSample(o.op), createdAt: now,
    })),
  };
}

function devkitPublishIssues(cc) {
  const auth = devkitAuthOf(cc);
  const base = `/devkit/${cc.id}`;
  return [
    !cc.name.trim() && { id: 'name', text: '连接器名称未填写', to: `${base}/basic` },
    !(cc.description || '').trim() && { id: 'desc', text: '连接器说明未填写', to: `${base}/basic` },
    !devkitIsUrl(cc.baseUrl) && { id: 'base', text: 'Base URL 未配置', to: `${base}/basic` },
    cc.actions.length + cc.triggers.length === 0 && { id: 'ops', text: '至少需要一个操作或触发器', to: `${base}/basic` },
    auth && auth.enabled !== false && auth.status !== 'published' && { id: 'auth', text: `认证「${auth.name}」尚未发布`, to: `${base}/auth` },
    ...cc.actions.filter((a) => !String(a.path || '').startsWith('/')).map((a) => ({ id: `path:${a.id}`, text: `操作「${a.name}」的请求路径无效`, to: `${base}/op/${a.id}` })),
  ].filter(Boolean);
}

function devkitStatusTag(cc) {
  if (cc.status === 'published') return html`<${Tag} tone="success" dot>已发布 v${cc.version}<//>`;
  if (cc.status === 'offline') return html`<${Tag} dot>已下线<//>`;
  return html`<${Tag} dot>草稿<//>`;
}

function DevkitCharInput({ value, onChange, max, placeholder, autoFocus, invalid, mono }) {
  return html`<${Input} value=${value} mono=${mono} onChange=${(v) => onChange(v.slice(0, max))} placeholder=${placeholder} autoFocus=${autoFocus} invalid=${invalid} suffix=${html`<span className="devkit-count">${(value || '').length}/${max}</span>`} />`;
}

function DevkitCharTextarea({ value, onChange, max, placeholder, rows = 3, invalid }) {
  return html`<div className="devkit-char-area">
    <${Textarea} value=${value} onChange=${(v) => onChange(v.slice(0, max))} placeholder=${placeholder} rows=${rows} invalid=${invalid} />
    <span className="devkit-count">${(value || '').length}/${max}</span>
  </div>`;
}

function DevkitGroupInput({ value, onChange, groups, invalid }) {
  return html`<div className="col" style=${{ gap: 6 }}>
    <${Input} value=${value} onChange=${(v) => onChange(v.slice(0, 20))} placeholder="未分组" invalid=${invalid} allowClear />
    ${groups.length > 0 && html`<div className="devkit-chips">${groups.map((g) => html`<button key=${g} type="button" className=${cx('devkit-chip', g === value.trim() && 'is-active')} onClick=${() => onChange(g)}>${g}</button>`)}</div>`}
  </div>`;
}

function DevkitListPage() {
  const state = useStore();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState('mine');
  const [q, setQ] = useState('');
  const admin = devkitIsAdmin(state);
  const all = state.customConnectors;
  const lists = {
    mine: all.filter((c) => c.owner === state.me),
    collab: all.filter((c) => c.owner !== state.me && (c.developers || []).includes(state.me)),
    all,
  };
  const current = tab === 'all' && !admin ? 'mine' : tab;
  const ql = q.trim().toLowerCase();
  const list = lists[current].filter((c) => !ql || `${c.name} ${c.key} ${c.description || ''}`.toLowerCase().includes(ql));
  const newButton = html`<${Button} variant="primary" icon="Plus" onClick=${() => setOpen(true)}>新建连接器<//>`;
  const modals = html`<${Fragment}>
    <${DevkitNewConnectorModal} open=${open} onClose=${() => setOpen(false)} />
    <${DevkitImportModal} open=${importOpen} onClose=${() => setImportOpen(false)} />
  <//>`;
  if (all.length === 0) {
    return html`<div className="page devkit-page"><div className="page-inner">
      <${Empty} icon="SquareCode" title="Hi，创建你的第一个连接器" description="把公司内部系统或还没有官方连接器的服务封装成连接器，在工作流中像官方连接器一样使用。" action=${html`<${Fragment}>${newButton}<${Button} icon="FileJson" onClick=${() => setImportOpen(true)}>从 OpenAPI 导入<//><//>`} />
      ${modals}
    </div></div>`;
  }
  const empties = {
    mine: { icon: 'SquareCode', title: '你还没有开发连接器', description: '新建一个连接器，把内部系统或还没有官方连接器的服务接入工作流。', action: newButton },
    collab: { icon: 'Users', title: '暂无协作中的连接器', description: '其他开发者把你加为开发者成员后，连接器会出现在这里。' },
    all: { icon: 'Inbox', title: '暂无连接器', description: '企业内还没有自定义连接器。', action: newButton },
  };
  const emptyCfg = ql ? { icon: 'Search', title: '没有匹配的连接器', description: '换个关键词试试，可以按名称、标识符或说明搜索。' } : empties[current];
  const tabs = [
    { value: 'mine', label: '我开发的', count: lists.mine.length },
    { value: 'collab', label: '我参与协作的', count: lists.collab.length },
    ...(admin ? [{ value: 'all', label: '全部连接器', count: all.length }] : []),
  ];
  return html`<div className="page devkit-page"><div className="page-inner">
    <${PageHeader} title="连接器开发" description="为内部系统或未收录的服务开发连接器，发布后可在工作流和 MCP 服务中使用" actions=${html`<${Fragment}><${Button} icon="FileJson" onClick=${() => setImportOpen(true)}>从 OpenAPI 导入<//>${newButton}<//>`} />
    <div className="toolbar">
      <${Tabs} variant="pill" value=${current} onChange=${setTab} items=${tabs} />
      <span className="spacer" />
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索名称、标识符" width=${240} />
    </div>
    <${Table}
      onRowClick=${(c) => navigate(`/devkit/${c.id}/basic`)}
      columns=${[
        { key: 'name', title: '连接器', render: (c) => html`<div className="cell-main"><${ConnectorIcon} connector=${customAsConnector(c)} size=${32} /><div className="grow"><div className="cell-title">${c.name}</div><div className="cell-sub">${c.description || '暂无说明'}</div></div></div>` },
        { key: 'key', title: '标识符', width: 150, render: (c) => html`<span className="mono muted">${c.key}</span>` },
        { key: 'status', title: '状态', width: 190, render: (c) => { const n = devkitChanges(c).length; return html`<span className="row-4">${devkitStatusTag(c)}${c.status !== 'draft' && n > 0 && html`<${Tag} size="sm" tone="warning">待发布 ${n}<//>`}</span>`; } },
        { key: 'ops', title: '操作 / 触发器', width: 110, render: (c) => `${c.actions.length} / ${c.triggers.length}` },
        { key: 'vis', title: '可用范围', width: 100, render: (c) => devkitScope(c).label },
        { key: 'owner', title: '所有者', width: 110, render: (c) => html`<span className="row-4"><${Avatar} name=${personName(c.owner)} size=${20} />${personName(c.owner)}</span>` },
        { key: 't', title: '最近保存', width: 170, render: (c) => fmt.dateTime(c.updatedAt) },
      ]}
      data=${list}
      empty=${html`<${Empty} size="sm" icon=${emptyCfg.icon} title=${emptyCfg.title} description=${emptyCfg.description} action=${emptyCfg.action} />`}
    />
    ${modals}
  </div></div>`;
}

function DevkitNewConnectorModal({ open, onClose }) {
  const state = useStore();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('preset');
  const [svc, setSvc] = useState(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(DEVKIT_ICON_COLORS[0]);
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setMode('preset');
    setSvc(null);
    setQ('');
    setName('');
    setKey('');
    setDesc('');
    setColor(DEVKIT_ICON_COLORS[0]);
    setTouched({});
  }, [open]);
  const taken = state.customConnectors.map((c) => c.key);
  const ql = q.trim().toLowerCase();
  const services = mode === 'preset'
    ? DEVKIT_PRESET_SERVICES.filter((s) => s.name.toLowerCase().includes(ql)).map((s) => ({ value: `preset:${s.id}`, id: s.id, name: s.name, key: `custom_${s.id}`, color: null }))
    : state.customConnectors.filter((c) => c.name.toLowerCase().includes(ql)).map((c) => ({ value: `custom:${c.id}`, id: c.id, name: c.name, key: `${c.key}_v2`, color: c.iconColor, custom: c }));
  const owner = state.customConnectors.find((c) => c.key === key);
  const errors = {
    name: !name.trim() && touched.name ? '请填写连接器名称' : '',
    key: !key ? (touched.key ? '请填写连接器标识符' : '')
      : !DEVKIT_KEY_RE.test(key) ? '以小写字母开头，只能包含小写字母、数字和下划线'
        : key.length > 40 ? '不能超过 40 个字符'
          : owner ? `标识符已被「${owner.name}」使用` : '',
  };
  const valid = Boolean(name.trim()) && DEVKIT_KEY_RE.test(key) && key.length <= 40 && !owner;
  const next = () => {
    if (svc && svc.value !== 'new') {
      setName(mode === 'preset' ? `企业自建-${svc.name}`.slice(0, 30) : svc.name.slice(0, 30));
      setKey(devkitUniqueKey(svc.key, taken));
      if (svc.color) setColor(svc.color);
    } else {
      setName('');
      setKey('');
    }
    setTouched({});
    setStep(1);
  };
  const create = () => {
    if (!valid) return;
    const now = Date.now();
    const cc = {
      id: uid('cc'), key, name: name.trim(), description: desc.trim(), iconColor: color, iconText: devkitIconText(name),
      status: 'draft', version: '0.1.0', visibility: 'tenant', scopeUsers: [], scopeDepts: [], owner: state.me, developers: [state.me],
      updatedAt: now, createdAt: now, helpUrl: '', baseUrl: '', auth: null, i18n: {}, listing: 'none', groups: [],
      actions: [], triggers: [], versions: [], removed: [],
    };
    prependToList('customConnectors', cc);
    addAudit('新建自定义连接器', cc.name, null);
    onClose();
    toast.success('连接器已创建');
    navigate(`/devkit/${cc.id}/basic`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title=${`新建连接器 ${step + 1}/2`} description=${step === 0 ? '选择要集成的服务' : '填写基本信息'} width=${640} footer=${html`<${Fragment}>
    <${Button} onClick=${step === 0 ? onClose : () => setStep(0)}>${step === 0 ? '取消' : '上一步'}<//>
    ${step === 0
      ? html`<${Button} variant="primary" disabled=${!svc} onClick=${next}>下一步<//>`
      : html`<${Button} variant="primary" disabled=${!valid} onClick=${create}>创建<//>`}
  <//>`}>
    ${step === 0
      ? html`<${Fragment}>
        <div className="row" style=${{ marginBottom: 12 }}>
          <${Input} icon="Search" placeholder="按名称搜索要集成的服务" value=${q} onChange=${setQ} allowClear style=${{ flex: 1 }} />
          <${Segmented} value=${mode} onChange=${(v) => { setMode(v); setSvc(null); }} options=${[{ value: 'preset', label: '平台预置' }, { value: 'custom', label: '自定义' }]} />
        </div>
        <div className="svc-grid">
          <button type="button" className=${cx('svc-item', 'is-new', svc && svc.value === 'new' && 'is-active')} onClick=${() => setSvc({ value: 'new' })}><${Icon} name="Plus" size=${20} /><span>新建</span></button>
          ${services.map((s) => html`<button key=${s.value} type="button" className=${cx('svc-item', 'corner-check', svc && svc.value === s.value && 'is-active')} onClick=${() => setSvc(s)}>
            ${s.custom ? html`<${ConnectorIcon} connector=${customAsConnector(s.custom)} size=${36} />` : connectorById(s.id) ? html`<${ConnectorIcon} id=${s.id} size=${36} />` : html`<${KindTile} icon="Box" size=${36} />`}
            <span>${s.name}</span>
          </button>`)}
        </div>
        ${services.length === 0 && html`<div className="text-xs muted" style=${{ marginTop: 10 }}>${mode === 'custom' && !ql ? '企业还没有自定义的服务，选择「新建」从零开始。' : '没有匹配的服务，可以选择「新建」自定义一个。'}</div>`}
      <//>`
      : html`<${Fragment}>
        <${Field} label="连接器图标" hint="图标文字取名称的第一个字">
          <div className="row">
            <span className="cicon is-letter" style=${{ width: 44, height: 44, background: color, fontSize: 20 }}>${devkitIconText(name)}</span>
            <div className="devkit-swatches">${DEVKIT_ICON_COLORS.map((c) => html`<button key=${c} type="button" aria-label=${`图标颜色 ${c}`} className=${cx('devkit-swatch', c === color && 'is-active')} style=${{ background: c }} onClick=${() => setColor(c)} />`)}</div>
          </div>
        <//>
        <${Field} label="连接器名称" required error=${errors.name}><${DevkitCharInput} value=${name} onChange=${(v) => { setName(v); setTouched((t) => ({ ...t, name: true })); }} max=${30} autoFocus invalid=${Boolean(errors.name)} /><//>
        <${Field} label="连接器标识符" required hint="保存后不可修改。以小写字母开头，只能包含小写字母、数字和下划线" error=${errors.key}><${Input} mono value=${key} onChange=${(v) => { setKey(v.trim()); setTouched((t) => ({ ...t, key: true })); }} placeholder="例：custom_crm" invalid=${Boolean(errors.key)} /><//>
        <${Field} label="连接器说明" hint="发布前必须填写"><${DevkitCharTextarea} value=${desc} onChange=${setDesc} max=${200} rows=${3} /><//>
      <//>`}
  <//>`;
}

function DevkitImportModal({ open, onClose }) {
  const state = useStore();
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  const parsed = useMemo(() => devkitParseOpenApi(text, state.customConnectors.map((c) => c.key)), [text, state.customConnectors]);
  const create = () => {
    if (!parsed.ok) return;
    const now = Date.now();
    const cc = {
      id: uid('cc'), key: parsed.key, name: parsed.title, description: parsed.description, iconColor: DEVKIT_ICON_COLORS[1], iconText: devkitIconText(parsed.title),
      status: 'draft', version: '0.1.0', visibility: 'tenant', scopeUsers: [], scopeDepts: [], owner: state.me, developers: [state.me],
      updatedAt: now, createdAt: now, helpUrl: '', baseUrl: parsed.baseUrl, auth: null, i18n: {}, listing: 'none', groups: [],
      actions: parsed.actions, triggers: [], versions: [], removed: [],
    };
    prependToList('customConnectors', cc);
    addAudit('从 OpenAPI 导入自定义连接器', cc.name, null);
    onClose();
    toast.success(`已导入 ${cc.actions.length} 个操作`);
    navigate(`/devkit/${cc.id}/basic`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title="从 OpenAPI 导入" description="粘贴 OpenAPI 3.x 的 JSON 规范，自动生成连接器的基础路径和操作" width=${680} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!parsed.ok} onClick=${create}>导入<//><//>`}>
    <div className="row" style=${{ marginBottom: 8 }}>
      <span className="text-xs muted grow">YAML 格式需要先转换成 JSON。导入后是草稿，认证需要另外配置。</span>
      <${Button} size="sm" variant="ghost" icon="FileJson" onClick=${() => setText(JSON.stringify(DEVKIT_OPENAPI_SAMPLE, null, 2))}>填入示例<//>
    </div>
    <${CodeEditor} light rows=${12} value=${text} onChange=${setText} label="OpenAPI 规范" placeholderHint='{ "openapi": "3.0.1", "paths": { … } }' />
    ${parsed.error && html`<div className="field-error">${parsed.error}</div>`}
    ${parsed.ok && html`<div className="devkit-import-preview">
      <div className="row"><b>${parsed.title}</b><span className="mono text-xs muted">${parsed.key}</span></div>
      <div className="text-xs muted">${parsed.baseUrl ? `Base URL：${parsed.baseUrl}` : '规范里没有可用的 servers 地址，导入后需要在基础信息里配置 Base URL'}</div>
      <div className="devkit-import-ops">${parsed.actions.map((a) => html`<div key=${a.key} className="row"><span className=${cx('method-tag', `m-${a.method.toLowerCase()}`)}>${a.method}</span><span className="grow ellipsis">${a.name}</span><span className="mono text-xs muted">${a.path}</span></div>`)}</div>
    </div>`}
  <//>`;
}

function DevkitLayout({ id, section, sub }) {
  const state = useStore();
  const cc = state.customConnectors.find((c) => c.id === id);
  const [collapsed, setCollapsed] = useState([]);
  const [transfer, setTransfer] = useState(false);
  const [opModal, setOpModal] = useState(null);
  const [trigModal, setTrigModal] = useState(false);
  const [groupModal, setGroupModal] = useState(null);
  if (!cc) {
    return html`<div className="page"><${Empty} icon="PackageX" title="连接器不存在" description="它可能已经被删除。" action=${html`<${Button} onClick=${() => navigate('/devkit')}>返回连接器开发<//>`} /></div>`;
  }
  if (!devkitCanAccess(state, cc)) {
    return html`<div className="page"><${Empty} icon="Lock" title="没有这个连接器的开发权限" description=${`请联系所有者 ${personName(cc.owner)} 把你加为开发者成员。`} action=${html`<${Button} onClick=${() => navigate('/devkit')}>返回连接器开发<//>`} /></div>`;
  }
  const patch = (p) => patchList('customConnectors', cc.id, (item) => ({ ...(typeof p === 'function' ? p(item) : p), updatedAt: Date.now() }));
  const patchOp = (opId, fn, raw) => patch((item) => ({
    actions: item.actions.map((a) => {
      if (a.id !== opId) return a;
      const next = { ...a, ...(typeof fn === 'function' ? fn(a) : fn) };
      return raw ? next : devkitTouchOp(item, a, next);
    }),
  }));
  const patchTrig = (tid, fn) => patch((item) => ({ triggers: item.triggers.map((t) => (t.id === tid ? devkitTouchTrig(item, t, { ...t, ...(typeof fn === 'function' ? fn(t) : fn) }) : t)) }));
  const patchBase = (p) => patch((item) => ({ ...devkitBaseMark(item), ...p }));
  if (section === 'publish' && !sub) return html`<${DevkitPublish} key=${cc.id} cc=${cc} patch=${patch} />`;
  const changes = devkitChanges(cc);
  const pending = new Set(changes.map((c) => c.ref));
  const baseChange = changes.find((c) => c.kind === 'base');
  const statusPending = Boolean(baseChange && !devkitSame(baseChange.before.statusCodes, baseChange.after.statusCodes));
  const auth = devkitAuthOf(cc);
  const groups = devkitGroups(cc);
  const folders = [...groups.map((g) => g.name), ...(cc.triggers.length ? ['__triggers'] : [])];
  const allCollapsed = folders.length > 0 && folders.every((f) => collapsed.includes(f));
  const toggle = (name) => setCollapsed((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));
  const canManage = cc.owner === state.me || devkitIsAdmin(state);
  const accessible = state.customConnectors.filter((c) => devkitCanAccess(state, c));
  const op = section === 'op' ? cc.actions.find((a) => a.id === sub) : null;
  const trig = section === 'trigger' ? cc.triggers.find((t) => t.id === sub) : null;
  const known = { basic: !sub, auth: !sub || sub === 'dev', op: Boolean(sub), trigger: Boolean(sub), status: !sub, versions: !sub };
  const valid = Object.prototype.hasOwnProperty.call(known, section) && known[section];
  const baseTodo = !devkitIsUrl(cc.baseUrl) || !(cc.description || '').trim();
  const authTodo = Boolean(auth && auth.enabled !== false && auth.status !== 'published');
  const removeConnector = async () => {
    const usage = devkitUsage(state, cc);
    const impact = usage.nodes || usage.connections ? `${usage.workflows} 个工作流中的 ${usage.nodes} 个节点和 ${usage.connections} 个连接在使用它，删除后这些节点会运行出错。` : '目前没有工作流或连接在使用它。';
    if (!(await confirmDialog({ title: `删除连接器「${cc.name}」？`, content: `${impact}删除后不可恢复。`, danger: true, okText: '删除', confirmText: cc.name }))) return;
    removeFromList('customConnectors', cc.id);
    addAudit('删除自定义连接器', cc.name, null);
    toast.success('连接器已删除');
    navigate('/devkit');
  };
  const groupMenu = (g) => [
    { label: '在此分组新建操作', icon: 'Plus', onClick: () => setOpModal({ group: g.name }) },
    ...(g.name ? [
      { label: '重命名分组', icon: 'PenLine', onClick: () => setGroupModal({ mode: 'rename', from: g.name }) },
      { label: '删除分组', icon: 'Trash2', danger: true, onClick: async () => {
        if (g.ops.length && !(await confirmDialog({ title: `删除分组「${g.name}」？`, content: `分组里的 ${g.ops.length} 个操作会移到「未分组」，操作本身不会删除。`, okText: '删除分组', danger: true }))) return;
        patch((item) => ({ groups: (item.groups || []).filter((x) => x !== g.name), actions: item.actions.map((a) => ((a.group || '') === g.name ? devkitTouchOp(item, a, { ...a, group: '' }) : a)) }));
        toast.success('分组已删除');
      } },
    ] : []),
  ];
  const main = !valid
    ? html`<${DevkitNotFound} cc=${cc} />`
    : section === 'basic' ? html`<${DevkitBasic} key=${cc.id} cc=${cc} patch=${patch} patchBase=${patchBase} />`
      : section === 'auth' ? (sub === 'dev' ? html`<${DevkitAuthDev} key=${cc.id} cc=${cc} patch=${patch} />` : html`<${DevkitAuth} key=${cc.id} cc=${cc} patch=${patch} />`)
        : section === 'op' ? (op ? html`<${DevkitOperation} key=${`${cc.id}:${op.id}`} cc=${cc} op=${op} patch=${patch} patchOp=${patchOp} />` : html`<${DevkitNotFound} cc=${cc} title="操作不存在" description="它可能已经被删除。" />`)
          : section === 'trigger' ? (trig ? html`<${DevkitTrigger} key=${`${cc.id}:${trig.id}`} cc=${cc} trig=${trig} patch=${patch} patchTrig=${patchTrig} />` : html`<${DevkitNotFound} cc=${cc} title="触发器不存在" description="它可能已经被删除。" />`)
            : section === 'status' ? html`<div className="page devkit-page"><div className="page-inner"><${PageHeader} title="状态码配置" description="根据响应里的应用状态码判断请求成功还是失败，对连接器的所有操作生效，单个操作可以单独配置" /><${DevkitStatusEditor} key=${cc.id} value=${devkitStatusOf(cc)} onSave=${(v) => patchBase({ statusCodes: v })} /></div></div>`
              : html`<${DevkitVersions} key=${cc.id} cc=${cc} patch=${patch} />`;
  return html`<div className="split devkit-split">
    <aside className="psidebar">
      <div className="psidebar-top">
        <div className="psidebar-caption"><span>当前连接器</span><${MoreMenu} size="xs" width=${190} items=${[
          { label: '管理开发者成员', icon: 'Users', onClick: () => navigate(`/devkit/${cc.id}/basic`) },
          { label: '转移所有权', icon: 'ArrowRightLeft', disabled: !canManage, desc: canManage ? '' : '只有所有者和管理员可以转移', onClick: () => setTransfer(true) },
          { divider: true },
          { label: '删除连接器', icon: 'Trash2', danger: true, disabled: !canManage, desc: canManage ? '' : '只有所有者和管理员可以删除', onClick: removeConnector },
        ]} /></div>
        <${Dropdown}
          placement="bottom-start"
          width=${230}
          trigger=${html`<button type="button" className="pswitch"><${ConnectorIcon} connector=${customAsConnector(cc)} size=${32} /><span className="pswitch-name">${cc.name}</span><${Icon} name="ChevronDown" size=${14} className="muted" /></button>`}
          items=${[...accessible.map((c) => ({ key: c.id, label: c.name, active: c.id === cc.id, iconNode: html`<${ConnectorIcon} connector=${customAsConnector(c)} size=${18} />`, onClick: () => navigate(`/devkit/${c.id}/basic`) })), { divider: true }, { key: 'all', label: '全部连接器', icon: 'LayoutGrid', onClick: () => navigate('/devkit') }]}
        />
        <div className="text-xs muted" style=${{ padding: '6px 4px 0' }}>最近保存：${fmt.dateTime(cc.updatedAt)}</div>
        <div className="psidebar-nav">
          <${Link} to=${`/devkit/${cc.id}/basic`} className=${cx('psidebar-link', section === 'basic' && 'is-active')}><${Icon} name="FileText" size=${16} /><span className="grow">基础信息</span>${baseTodo && html`<span className="tab-dot" title="Base URL 或连接器说明未填写" />`}<//>
          <${Link} to=${`/devkit/${cc.id}/auth`} className=${cx('psidebar-link', section === 'auth' && 'is-active')}><${Icon} name="ShieldCheck" size=${16} /><span className="grow">认证与授权</span>${authTodo && html`<span className="tab-dot" title="认证尚未发布" />`}<//>
          <${Link} to=${`/devkit/${cc.id}/versions`} className=${cx('psidebar-link', section === 'versions' && 'is-active')}><${Icon} name="GitBranch" size=${16} /><span className="grow">版本与发布</span>${changes.length > 0 && html`<span className="devkit-nav-count" title="待发布的变更">${changes.length}</span>`}<//>
        </div>
      </div>
      <div className="psidebar-res">
        <div className="psidebar-res-head">
          <span>操作</span><span className="spacer" />
          ${folders.length > 0 && html`<${IconButton} icon=${allCollapsed ? 'ChevronsUpDown' : 'ChevronsDownUp'} size="xs" title=${allCollapsed ? '展开全部' : '收起全部'} onClick=${() => setCollapsed(allCollapsed ? [] : folders)} />`}
          <${Dropdown} width=${160} placement="bottom-end" trigger=${html`<button type="button" className="icon-btn icon-btn-xs icon-btn-ghost" aria-label="新建"><${Icon} name="Plus" size=${15} /></button>`} items=${[
            { label: '新建操作', icon: 'Play', onClick: () => setOpModal({ group: '' }) },
            { label: '新建触发器', icon: 'Zap', onClick: () => setTrigModal(true) },
            { label: '新建分组', icon: 'FolderPlus', onClick: () => setGroupModal({ mode: 'new' }) },
          ]} />
        </div>
        <div className="ptree">
          <${Link} to=${`/devkit/${cc.id}/status`} className=${cx('ptree-item', section === 'status' && 'is-active')}><${Icon} name="CodeXml" size=${15} className="muted" /><span className="ptree-name">状态码配置</span>${statusPending && html`<span className="ptree-dot" title="有未发布的修改" />`}<//>
          ${groups.map((g) => {
            const open = !collapsed.includes(g.name);
            return html`<div key=${`g:${g.name}`}>
              <div className="ptree-item is-folder" role="button" tabIndex=${0} aria-expanded=${open} onClick=${() => toggle(g.name)} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(g.name); } }}>
                <${Icon} name=${open ? 'ChevronDown' : 'ChevronRight'} size=${12} className="muted" />
                <${Icon} name="Folder" size=${15} className="muted" />
                <span className="ptree-name">${g.label}</span>
                <span className="ptree-count">${g.ops.length}</span>
                <span className="ptree-more" onClick=${(e) => e.stopPropagation()}><${MoreMenu} size="xs" width=${170} items=${groupMenu(g)} /></span>
              </div>
              ${open && g.ops.length === 0 && html`<div className="devkit-tree-empty">分组里还没有操作</div>`}
              ${open && g.ops.map((a) => html`<${Link} key=${a.id} to=${`/devkit/${cc.id}/op/${a.id}`} className=${cx('ptree-item', section === 'op' && sub === a.id && 'is-active')} style=${{ paddingLeft: 24 }}><span className=${cx('method-tag', `m-${String(a.method).toLowerCase()}`)}>${a.method}</span><span className="ptree-name">${a.name}</span>${pending.has(a.id) && html`<span className="ptree-dot" title="有未发布的修改" />`}<//>`)}
            </div>`;
          })}
          ${cc.triggers.length > 0 && html`<div>
            <div className="ptree-item is-folder" role="button" tabIndex=${0} aria-expanded=${!collapsed.includes('__triggers')} onClick=${() => toggle('__triggers')} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle('__triggers'); } }}>
              <${Icon} name=${collapsed.includes('__triggers') ? 'ChevronRight' : 'ChevronDown'} size=${12} className="muted" />
              <${Icon} name="Zap" size=${15} className="muted" />
              <span className="ptree-name">触发器</span><span className="ptree-count">${cc.triggers.length}</span>
            </div>
            ${!collapsed.includes('__triggers') && cc.triggers.map((t) => html`<${Link} key=${t.id} to=${`/devkit/${cc.id}/trigger/${t.id}`} className=${cx('ptree-item', section === 'trigger' && sub === t.id && 'is-active')} style=${{ paddingLeft: 24 }}><${Tag} size="sm">${t.type === 'webhook' ? '即时' : '轮询'}<//><span className="ptree-name">${t.name}</span>${pending.has(t.id) && html`<span className="ptree-dot" title="有未发布的修改" />`}<//>`)}
          </div>`}
          ${cc.actions.length === 0 && cc.triggers.length === 0 && html`<${Empty} size="sm" icon="Play" title="暂无操作" description="操作是工作流里可以调用的一个接口。" action=${html`<${Button} size="sm" icon="Plus" onClick=${() => setOpModal({ group: '' })}>新建操作<//>`} />`}
        </div>
      </div>
    </aside>
    <div className="split-main">${main}</div>
    <${DevkitTransferModal} open=${transfer} onClose=${() => setTransfer(false)} cc=${cc} patch=${patch} />
    <${DevkitNewOpModal} open=${Boolean(opModal)} group=${opModal ? opModal.group : ''} onClose=${() => setOpModal(null)} cc=${cc} patch=${patch} />
    <${DevkitNewTriggerModal} open=${trigModal} onClose=${() => setTrigModal(false)} cc=${cc} patch=${patch} />
    <${DevkitGroupModal} open=${Boolean(groupModal)} mode=${groupModal ? groupModal.mode : 'new'} from=${groupModal ? groupModal.from : ''} onClose=${() => setGroupModal(null)} cc=${cc} patch=${patch} />
  </div>`;
}

function DevkitNotFound({ cc, title, description }) {
  return html`<div className="page"><${Empty} icon="FileQuestion" title=${title || '页面不存在'} description=${description || '链接可能已经失效。'} action=${html`<${Button} onClick=${() => navigate(`/devkit/${cc.id}/basic`)}>返回基础信息<//>`} /></div>`;
}

function DevkitTransferModal({ open, onClose, cc, patch }) {
  const state = useStore();
  const [to, setTo] = useState(null);
  useEffect(() => { if (open) setTo(null); }, [open]);
  const options = state.users
    .filter((u) => u.status === 'active' && (u.modules || []).includes('connector') && u.id !== cc.owner)
    .map((u) => ({ value: u.id, label: u.name, desc: `${u.dept} · ${u.email}` }));
  const submit = async () => {
    if (!to) return;
    const name = personName(to);
    const prev = cc.owner;
    if (!(await confirmDialog({ title: `把「${cc.name}」转移给 ${name}？`, content: `转移后 ${name} 成为所有者，${personName(prev)} 保留为开发者成员，仍可查看和编辑。`, okText: '确认转移' }))) return;
    patch((item) => ({ owner: to, developers: devkitUnique([to, ...(item.developers || []), prev]) }));
    addAudit('转移自定义连接器所有权', `${cc.name}：${personName(prev)} → ${name}`, null);
    toast.success(`已转移给 ${name}`);
    onClose();
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title="转移所有权" width=${460} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!to} onClick=${submit}>转移<//><//>`}>
    <div className="row" style=${{ marginBottom: 14 }}><span className="text-xs muted">当前所有者</span><${Avatar} name=${personName(cc.owner)} size=${20} /><span>${personName(cc.owner)}</span></div>
    <${Field} label="新所有者" required hint="只能转移给有「连接器开发」权限的在职成员">
      <${Select} searchable value=${to} onChange=${setTo} placeholder="搜索成员" options=${options} />
    <//>
    <div className="text-xs muted">转移后 ${personName(cc.owner)} 会保留为开发者成员。</div>
  <//>`;
}

function DevkitNewOpModal({ open, onClose, cc, patch, group }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [method, setMethod] = useState('POST');
  const [path, setPath] = useState('/');
  const [grp, setGrp] = useState('');
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    setName('');
    setKey('');
    setMethod('POST');
    setPath('/');
    setGrp(group || '');
    setTouched({});
  }, [open]);
  const taken = [...cc.actions.map((a) => a.key), ...(cc.removed || []).filter((r) => r.kind === 'action').map((r) => r.key)];
  const errors = {
    name: !name.trim() && touched.name ? '请填写操作名称' : '',
    key: !key ? (touched.key ? '请填写操作唯一标识' : '') : !DEVKIT_KEY_RE.test(key) ? '以小写字母开头，只能包含小写字母、数字和下划线' : taken.includes(key) ? '这个标识已被其他操作使用（包括已删除但还没发布的操作）' : '',
    path: !path.startsWith('/') ? '请求路径需要以 / 开头' : '',
  };
  const valid = Boolean(name.trim()) && DEVKIT_KEY_RE.test(key) && !taken.includes(key) && path.startsWith('/');
  const create = () => {
    if (!valid) return;
    const op = { id: uid('a'), key, name: name.trim(), method, path: path.trim(), desc: '', group: grp.trim(), params: [], sample: {}, createdAt: Date.now() };
    patch((item) => ({ actions: [...item.actions, op] }));
    onClose();
    toast.success('操作已创建，接着配置入参和 API');
    navigate(`/devkit/${cc.id}/op/${op.id}`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title="新建操作" description="操作是工作流里可以调用的一个接口" width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${create}>创建<//><//>`}>
    <${Field} label="操作名称" required error=${errors.name}><${DevkitCharInput} value=${name} onChange=${(v) => { setName(v); setTouched((t) => ({ ...t, name: true })); }} max=${30} autoFocus placeholder="例：创建工单" invalid=${Boolean(errors.name)} /><//>
    <${Field} label="操作唯一标识" required hint="创建后不可修改，工作流通过它引用操作" error=${errors.key}><${Input} mono value=${key} onChange=${(v) => { setKey(v.trim()); setTouched((t) => ({ ...t, key: true })); }} placeholder="例：create_ticket" invalid=${Boolean(errors.key)} /><//>
    <${Field} label="请求" required error=${errors.path}>
      <div className="devkit-url-row"><${Select} width=${110} value=${method} onChange=${setMethod} options=${DEVKIT_METHODS.map((m) => ({ value: m, label: m }))} /><${Input} mono value=${path} onChange=${setPath} placeholder="/tickets" invalid=${Boolean(errors.path)} style=${{ flex: 1 }} /></div>
    <//>
    <${Field} label="所属分组"><${DevkitGroupInput} value=${grp} onChange=${setGrp} groups=${devkitGroups(cc).map((g) => g.name).filter(Boolean)} /><//>
  <//>`;
}

function DevkitNewTriggerModal({ open, onClose, cc, patch }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState('webhook');
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    setName('');
    setKey('');
    setType('webhook');
    setTouched({});
  }, [open]);
  const taken = [...cc.triggers.map((t) => t.key), ...(cc.removed || []).filter((r) => r.kind === 'trigger').map((r) => r.key)];
  const errors = {
    name: !name.trim() && touched.name ? '请填写触发器名称' : '',
    key: !key ? (touched.key ? '请填写唯一标识' : '') : !DEVKIT_KEY_RE.test(key) ? '以小写字母开头，只能包含小写字母、数字和下划线' : taken.includes(key) ? '这个标识已被其他触发器使用' : '',
  };
  const valid = Boolean(name.trim()) && DEVKIT_KEY_RE.test(key) && !taken.includes(key);
  const create = () => {
    if (!valid) return;
    const t = { id: uid('tr'), key, name: name.trim(), type, desc: '', settings: [], sample: {}, createdAt: Date.now() };
    patch((item) => ({ triggers: [...item.triggers, t] }));
    onClose();
    toast.success('触发器已创建');
    navigate(`/devkit/${cc.id}/trigger/${t.id}`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title="新建触发器" width=${560} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${create}>创建<//><//>`}>
    <${Field} label="触发器名称" required error=${errors.name}><${DevkitCharInput} value=${name} onChange=${(v) => { setName(v); setTouched((t) => ({ ...t, name: true })); }} max=${30} autoFocus placeholder="例：工单状态变更" invalid=${Boolean(errors.name)} /><//>
    <${Field} label="唯一标识" required hint="创建后不可修改" error=${errors.key}><${Input} mono value=${key} onChange=${(v) => { setKey(v.trim()); setTouched((t) => ({ ...t, key: true })); }} placeholder="例：ticket_updated" invalid=${Boolean(errors.key)} /><//>
    <${Field} label="触发器类型"><${RadioCards} columns=${2} value=${type} onChange=${setType} options=${[{ value: 'webhook', label: '即时触发器', desc: '服务方主动推送事件，实时触发', icon: 'Zap' }, { value: 'polling', label: '轮询触发器', desc: '平台定期调用接口检查新数据', icon: 'RefreshCw' }]} /><//>
  <//>`;
}

function DevkitGroupModal({ open, mode, from, onClose, cc, patch }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(mode === 'rename' ? from : ''); }, [open]);
  const others = devkitGroups(cc).map((g) => g.name).filter((g) => g && g !== from);
  const v = name.trim();
  const error = !v ? '' : v === '未分组' ? '「未分组」是保留名称' : others.includes(v) ? '已有同名分组' : '';
  const valid = Boolean(v) && !error && !(mode === 'rename' && v === from);
  const submit = () => {
    if (!valid) return;
    if (mode === 'rename') {
      patch((item) => ({
        groups: devkitUnique([...(item.groups || []).map((g) => (g === from ? v : g)), v]),
        actions: item.actions.map((a) => ((a.group || '') === from ? devkitTouchOp(item, a, { ...a, group: v }) : a)),
      }));
      toast.success('分组已重命名');
    } else {
      patch((item) => ({ groups: [...(item.groups || []), v] }));
      toast.success('分组已创建');
    }
    onClose();
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title=${mode === 'rename' ? '重命名分组' : '新建分组'} width=${420} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${submit}>${mode === 'rename' ? '保存' : '创建'}<//><//>`}>
    <${Field} label="分组名称" required error=${error} hint="分组用于在节点面板里归类操作"><${DevkitCharInput} value=${name} onChange=${setName} max=${20} autoFocus invalid=${Boolean(error)} /><//>
  <//>`;
}

function DevkitEditCard({ title, badge, extra, init, validate, onSave, form, children }) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const errors = editing && validate ? validate(draft) : {};
  const invalid = Object.values(errors).some((e) => (Array.isArray(e) ? e.some(Boolean) : Boolean(e)));
  const dirty = editing && !devkitSame(draft, init());
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => {
    if (invalid || !dirty) return;
    onSave(draft);
    setDraft(null);
    toast.success('已保存');
  };
  return html`<section className="ecard">
    <div className="ecard-head">
      <div className="row"><span className="ecard-title">${title}</span>${badge}</div>
      <div className="row">
        ${extra}
        ${editing
          ? html`<${Fragment}><${Button} size="sm" onClick=${() => setDraft(null)}>取消<//><${Button} size="sm" variant="primary" disabled=${invalid || !dirty} onClick=${save}>保存<//><//>`
          : html`<${Button} size="sm" icon="PenLine" onClick=${() => setDraft(init())}>编辑<//>`}
      </div>
    </div>
    <div className="ecard-body">${editing ? form({ draft, set, setDraft, errors }) : children}</div>
  </section>`;
}

function DevkitBasic({ cc, patch, patchBase }) {
  const state = useStore();
  const scope = devkitScope(cc);
  const devs = devkitDevelopers(cc);
  const activeUsers = state.users.filter((u) => u.status === 'active');
  const devOptions = state.users
    .filter((u) => u.id !== cc.owner && ((u.status === 'active' && (u.modules || []).includes('connector')) || devs.includes(u.id)))
    .map((u) => ({ value: u.id, label: u.name, desc: u.dept }));
  const depts = devkitUnique(state.users.map((u) => u.dept).filter(Boolean));
  const i18n = cc.i18n || {};
  return html`<div className="page devkit-page"><div className="page-inner">
    <${PageHeader} title="基础信息" description="名称、说明、可用范围和开发者保存后立即生效；Base URL 的修改在下次发布时进入新版本" />
    <div className="ecard ecard-hero">
      <${ConnectorIcon} connector=${customAsConnector(cc)} size=${52} />
      <div className="grow">
        <div className="row"><b className="devkit-hero-name">${cc.name}</b><${Tag} size="sm" tone="primary">自定义<//>${devkitStatusTag(cc)}</div>
        <div className="muted">${cc.description || '还没有填写连接器说明'}</div>
        <div className="row text-xs muted" style=${{ marginTop: 4 }}><span className="mono">${cc.key}</span><span>·</span><span>所有者 ${personName(cc.owner)}</span><span>·</span><span>创建于 ${fmt.date(cc.createdAt)}</span></div>
      </div>
    </div>
    <${DevkitEditCard}
      title="名称、说明和帮助文档"
      init=${() => ({ name: cc.name, description: cc.description || '', helpUrl: cc.helpUrl || '', iconColor: cc.iconColor })}
      validate=${(d) => ({ name: d.name.trim() ? '' : '请填写连接器名称', helpUrl: d.helpUrl.trim() && !devkitIsUrl(d.helpUrl) ? '请填写以 http:// 或 https:// 开头的地址' : '' })}
      onSave=${(d) => patch({ name: d.name.trim(), description: d.description.trim(), helpUrl: d.helpUrl.trim(), iconColor: d.iconColor, iconText: devkitIconText(d.name) })}
      form=${({ draft, set, errors }) => html`<${Fragment}>
        <${Field} label="连接器图标" hint="图标文字取名称的第一个字">
          <div className="row">
            <span className="cicon is-letter" style=${{ width: 40, height: 40, background: draft.iconColor, fontSize: 18 }}>${devkitIconText(draft.name)}</span>
            <div className="devkit-swatches">${DEVKIT_ICON_COLORS.map((c) => html`<button key=${c} type="button" aria-label=${`图标颜色 ${c}`} className=${cx('devkit-swatch', c === draft.iconColor && 'is-active')} style=${{ background: c }} onClick=${() => set('iconColor')(c)} />`)}</div>
          </div>
        <//>
        <${Field} label="连接器名称" required error=${errors.name}><${DevkitCharInput} value=${draft.name} onChange=${set('name')} max=${30} invalid=${Boolean(errors.name)} /><//>
        <${Field} label="连接器说明" hint="发布前必须填写，会显示在连接器市场和节点面板里"><${DevkitCharTextarea} value=${draft.description} onChange=${set('description')} max=${200} rows=${2} /><//>
        <${Field} label="帮助文档" error=${errors.helpUrl}><${Input} value=${draft.helpUrl} onChange=${set('helpUrl')} placeholder="https://" invalid=${Boolean(errors.helpUrl)} /><//>
      <//>`}
    >
      <div className="kv">
        <div><span>连接器名称</span><span>${cc.name}</span></div>
        <div><span>连接器标识符</span><span className="mono">${cc.key}</span></div>
        <div><span>连接器说明</span><span className=${cc.description ? '' : 'muted'}>${cc.description || '未填写，发布前必须填写'}</span></div>
        <div><span>帮助文档</span>${cc.helpUrl ? html`<a className="link" href=${cc.helpUrl} target="_blank" rel="noreferrer">${cc.helpUrl}</a>` : html`<span className="muted">未配置</span>`}</div>
      </div>
    <//>
    <${DevkitEditCard}
      title="基础路径（Base URL）"
      badge=${!cc.baseUrl && html`<${Tag} size="sm" tone="danger">待配置<//>`}
      init=${() => ({ baseUrl: cc.baseUrl || '' })}
      validate=${(d) => ({ baseUrl: !d.baseUrl.trim() ? '请填写 Base URL' : !devkitIsUrl(d.baseUrl) ? '请填写以 http:// 或 https:// 开头的地址' : '' })}
      onSave=${(d) => patchBase({ baseUrl: d.baseUrl.trim().replace(/\/+$/, '') })}
      form=${({ draft, set, errors }) => html`<${Field} label="Base URL" required hint="所有操作的请求路径都拼接在这个地址后面" error=${errors.baseUrl}><${Input} mono value=${draft.baseUrl} onChange=${set('baseUrl')} placeholder="https://api.example.com/v1" invalid=${Boolean(errors.baseUrl)} /><//>`}
    >
      <span className=${cc.baseUrl ? 'mono' : 'muted'}>${cc.baseUrl || 'Base URL 待配置，发布前必须填写'}</span>
    <//>
    <${DevkitEditCard}
      title="可用范围"
      init=${() => ({ visibility: cc.visibility || 'tenant', scopeUsers: devkitScopeUsers(cc), scopeDepts: cc.scopeDepts || [] })}
      validate=${(d) => ({ scopeUsers: d.visibility === 'project' && !d.scopeUsers.length ? '至少选择一位成员' : '', scopeDepts: d.visibility === 'dept' && !d.scopeDepts.length ? '至少选择一个部门' : '' })}
      onSave=${(d) => patch({ visibility: d.visibility, scopeUsers: d.visibility === 'project' ? d.scopeUsers : [], scopeDepts: d.visibility === 'dept' ? d.scopeDepts : [] })}
      form=${({ draft, set, errors }) => html`<${Fragment}>
        <${RadioCards} columns=${3} value=${draft.visibility} onChange=${set('visibility')} options=${[{ value: 'tenant', label: '全部成员', desc: '企业内所有人都能在工作流中使用' }, { value: 'project', label: '指定成员', desc: '只有选中的成员可以使用' }, { value: 'dept', label: '指定部门', desc: '按部门授权使用' }]} />
        ${draft.visibility === 'project' && html`<div style=${{ marginTop: 12 }}><${Field} label="可以使用的成员" required error=${errors.scopeUsers}><${Select} multiple searchable value=${draft.scopeUsers} onChange=${set('scopeUsers')} placeholder="选择成员" invalid=${Boolean(errors.scopeUsers)} options=${activeUsers.map((u) => ({ value: u.id, label: u.name, desc: u.dept }))} /><//></div>`}
        ${draft.visibility === 'dept' && html`<div style=${{ marginTop: 12 }}><${Field} label="可以使用的部门" required error=${errors.scopeDepts}><${Select} multiple value=${draft.scopeDepts} onChange=${set('scopeDepts')} placeholder="选择部门" invalid=${Boolean(errors.scopeDepts)} options=${depts.map((d) => ({ value: d, label: d }))} /><//></div>`}
      <//>`}
    >
      <div>${scope.label}${scope.list.length ? html`<span className="muted">：${scope.list.join('、')}</span>` : html`<span className="muted">：企业内所有成员都能在工作流中使用</span>`}</div>
    <//>
    <${DevkitEditCard}
      title="开发者成员"
      init=${() => ({ developers: devs.filter((u) => u !== cc.owner) })}
      onSave=${(d) => patch({ developers: devkitUnique([cc.owner, ...d.developers]) })}
      form=${({ draft, set }) => html`<${Fragment}>
        <${Field} label="开发者" hint=${`所有者 ${personName(cc.owner)} 始终是开发者。开发者可以查看、编辑和发布连接器`}><${Select} multiple searchable value=${draft.developers} onChange=${set('developers')} placeholder="选择有「连接器开发」权限的成员" options=${devOptions} /><//>
      <//>`}
    >
      <div className="devkit-dev-list">
        ${devs.map((u) => html`<div key=${u} className="row"><${Avatar} name=${personName(u)} size=${24} /><span>${personName(u)}</span>${u === cc.owner && html`<${Tag} size="sm" tone="primary">所有者<//>`}</div>`)}
      </div>
      <div className="text-xs muted" style=${{ marginTop: 8 }}>${devs.length} 位开发者，可以查看、编辑和发布连接器</div>
    <//>
    <${DevkitEditCard}
      title="国际化配置"
      init=${() => ({ en: i18n.en || '', enDesc: i18n.enDesc || '' })}
      onSave=${(d) => patch({ i18n: { ...devkitOmit(i18n, ['en', 'enDesc']), ...(d.en.trim() ? { en: d.en.trim() } : {}), ...(d.enDesc.trim() ? { enDesc: d.enDesc.trim() } : {}) } })}
      form=${({ draft, set }) => html`<${Fragment}>
        <${Field} label="English 名称" hint="界面语言是英文时显示，留空则显示中文名称"><${DevkitCharInput} value=${draft.en} onChange=${set('en')} max=${60} placeholder=${cc.name} /><//>
        <${Field} label="English 说明"><${DevkitCharTextarea} value=${draft.enDesc} onChange=${set('enDesc')} max=${200} rows=${2} /><//>
      <//>`}
    >
      <div className="kv">
        <div><span>简体中文</span><span>${cc.name}<${Tag} size="sm" tone="success" className="devkit-inline-tag">默认<//></span></div>
        <div><span>English</span>${i18n.en ? html`<span>${i18n.en}${i18n.enDesc && html`<span className="muted"> · ${i18n.enDesc}</span>`}</span>` : html`<span className="muted">未配置</span>`}</div>
      </div>
    <//>
  </div></div>`;
}

function DevkitAuth({ cc, patch }) {
  const state = useStore();
  const [open, setOpen] = useState(false);
  const auth = devkitAuthOf(cc);
  const conns = state.connections.filter((c) => c.connector === cc.id);
  const enabled = Boolean(auth && auth.enabled !== false);
  const pick = async (v) => {
    if (!auth) return;
    if (v === 'none' && enabled) {
      if (!(await confirmDialog({ title: '改为不使用认证？', content: conns.length ? `工作流节点将不再要求选择连接，已有的 ${conns.length} 个连接会保留。认证配置不会删除，重新选择即可恢复。` : '工作流节点将不再要求选择连接。认证配置不会删除，重新选择即可恢复。', okText: '不使用认证' }))) return;
      patch((item) => ({ auth: { ...item.auth, enabled: false } }));
      addAudit('停用连接器认证', `${cc.name} · ${auth.name}`, null);
      toast.success('已改为不使用认证，认证配置已保留');
    }
    if (v === 'auth' && !enabled) {
      patch((item) => ({ auth: { ...item.auth, enabled: true } }));
      addAudit('启用连接器认证', `${cc.name} · ${auth.name}`, null);
      toast.success(`已恢复使用「${auth.name}」`);
    }
  };
  const removeAuth = async () => {
    if (!(await confirmDialog({ title: `删除认证「${auth.name}」？`, content: '认证还没有发布，删除后可以重新新建，并选择其他认证类型。', danger: true, okText: '删除' }))) return;
    patch({ auth: null });
    toast.success('认证已删除');
  };
  const statusText = auth ? `${auth.status === 'published' ? '已发布' : '草稿'}${auth.changed ? '，有未发布的修改' : ''} · ${conns.length} 个连接在使用` : '';
  return html`<div className="page devkit-page"><div className="page-inner">
    <${PageHeader} title="认证与授权" description="定义工作流调用这个服务时如何证明身份" />
    <${Alert} tone="info" title="什么是认证？">用户新建连接时填写的表单、平台如何获取和刷新令牌，都在这里配置。认证类型创建后不能更改，每个连接器只有一个认证。<//>
    <div style=${{ height: 16 }} />
    <section className="ecard">
      <div className="ecard-head"><span className="ecard-title">要集成的服务</span></div>
      <div className="ecard-body row"><${ConnectorIcon} connector=${customAsConnector(cc)} size=${36} /><div><b>${cc.name}</b><div className="text-xs muted mono">${cc.baseUrl || 'Base URL 待配置'}</div></div></div>
    </section>
    <section className="ecard">
      <div className="ecard-head">
        <span className="ecard-title">认证</span>
        <${Tooltip} content=${auth ? '每个连接器只能有一个认证；草稿状态的认证可以删除后重新新建' : ''}><${Button} size="sm" icon="Plus" disabled=${Boolean(auth)} onClick=${() => setOpen(true)}>新建认证<//><//>
      </div>
      <div className="ecard-body">
        ${auth
          ? html`<${Fragment}>
            <${RadioCards} columns=${1} value=${enabled ? 'auth' : 'none'} onChange=${pick} options=${[
              { value: 'none', label: '不使用认证', desc: '服务是公开接口，或鉴权信息直接写在请求里' },
              { value: 'auth', label: `${auth.name} · ${devkitAuthLabel(auth.type)}`, desc: statusText },
            ]} />
            <div className="row" style=${{ marginTop: 12 }}>
              <${Button} size="sm" icon="PenLine" onClick=${() => navigate(`/devkit/${cc.id}/auth/dev`)}>开发认证<//>
              ${auth.status === 'draft' && html`<${Button} size="sm" variant="ghost" icon="Trash2" disabled=${conns.length > 0} title=${conns.length > 0 ? '已有连接在使用这个认证，不能删除' : '删除后可以重新新建，并选择其他认证类型'} onClick=${removeAuth}>删除认证<//>`}
              <span className="text-xs muted">${!enabled ? '当前不使用认证，配置已保留' : auth.status === 'published' ? '认证发布后立即生效，不能撤回' : '测试全部通过后才能发布认证'}</span>
            </div>
          <//>`
          : html`<${Empty} size="sm" icon="ShieldQuestion" title="暂无认证" description="工作流节点调用这个服务时不需要连接。需要鉴权时新建一个认证。" action=${html`<${Button} size="sm" variant="primary" icon="Plus" onClick=${() => setOpen(true)}>新建认证<//>`} />`}
      </div>
    </section>
    <${DevkitNewAuthModal} open=${open} onClose=${() => setOpen(false)} cc=${cc} patch=${patch} />
  </div></div>`;
}

function DevkitNewAuthModal({ open, onClose, cc, patch }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState('apikey');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName('');
    setDesc('');
    setType('apikey');
    setTouched(false);
  }, [open]);
  const error = touched && !name.trim() ? '请填写认证名称' : '';
  const create = () => {
    if (!name.trim() || devkitAuthOf(cc)) return;
    const extra = type === 'apikey' ? { location: 'header', keyName: 'X-Api-Key' } : type === 'client' || type === 'oauth2' ? { tokenUrl: '/oauth/token' } : {};
    patch({ auth: { type, name: name.trim(), desc: desc.trim(), status: 'draft', enabled: true, changed: false, tests: { flow: null, api: null }, ...extra } });
    addAudit('新建连接器认证', `${cc.name} · ${name.trim()}`, null);
    onClose();
    navigate(`/devkit/${cc.id}/auth/dev`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title="新建认证" width=${600} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!name.trim()} onClick=${create}>创建并开发<//><//>`}>
    <${Field} label="认证名称" required error=${error}><${DevkitCharInput} value=${name} onChange=${(v) => { setName(v); setTouched(true); }} max=${30} autoFocus placeholder=${`例：${cc.name} API Key`} invalid=${Boolean(error)} /><//>
    <${Field} label="认证说明" hint="会显示在用户新建连接的弹窗里"><${DevkitCharTextarea} rows=${2} value=${desc} onChange=${setDesc} max=${200} placeholder="例：在服务的管理后台「开放平台」页面生成 API Key" /><//>
    <${Field} label="认证类型" required><${RadioCards} columns=${2} value=${type} onChange=${setType} options=${DEVKIT_AUTH_TYPES.map((a) => ({ ...a, label: a.value === 'oauth2' ? '授权码（OAuth2Code）' : a.label }))} /><//>
    <${Alert} tone="warning">认证创建后不能更改认证类型；每个连接器只有一个认证。<//>
  <//>`;
}

function DevkitAuthDev({ cc, patch }) {
  const auth = devkitAuthOf(cc);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => devkitAuthDraft(cc));
  const [testing, setTesting] = useState({});
  const [fieldEdit, setFieldEdit] = useState(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [apiOp, setApiOp] = useState(() => (cc.actions[0] ? cc.actions[0].id : null));
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  if (!auth || !draft) {
    return html`<div className="page"><${Empty} icon="ShieldQuestion" title="还没有认证" description="先在「认证与授权」里新建一个认证，再开发认证流程。" action=${html`<${Button} onClick=${() => navigate(`/devkit/${cc.id}/auth`)}>去新建认证<//>`} /></div>`;
  }
  const saved = devkitAuthDraft(cc);
  const dirty = !devkitSame(draft, saved);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const setFlow = (key, p) => setDraft((d) => ({ ...d, flows: { ...d.flows, [key]: { ...d.flows[key], ...p } } }));
  const platform = devkitFormFields(auth);
  const fields = [...platform.map((f) => ({ ...f, platform: true })), ...draft.fields];
  const savedFields = [...platform, ...(auth.fields || [])];
  const flowDefs = devkitFlowDefs(auth.type);
  const tests = auth.tests || {};
  const testData = auth.testData || {};
  const stepErrors = [
    { name: draft.name.trim() ? '' : '请填写认证名称' },
    { keyName: auth.type === 'apikey' && !/^[A-Za-z0-9_-]+$/.test(draft.keyName || '') ? '参数名只能包含字母、数字、下划线和短横线' : '' },
    Object.fromEntries(flowDefs.map((f) => [f.key, devkitFlowError(f, draft.flows[f.key])])),
    {},
    {},
  ];
  const stepValid = (i) => !Object.values(stepErrors[i]).some(Boolean);
  const allValid = [0, 1, 2].every(stepValid);
  const save = () => {
    if (!allValid) return;
    const cfgChanged = !devkitSame(devkitAuthCfg(draft), devkitAuthCfg(saved));
    patch((item) => ({ auth: { ...item.auth, ...draft, name: draft.name.trim(), desc: draft.desc.trim(), changed: item.auth.status === 'published', tests: cfgChanged ? { flow: null, api: null } : item.auth.tests } }));
    toast.success(cfgChanged ? '已保存，认证配置有变化，需要重新测试' : '已保存');
  };
  const discard = async () => {
    if (!(await confirmDialog({ title: '放弃未保存的修改？', content: '认证的修改会恢复到上次保存的状态。', okText: '放弃修改', danger: true }))) return;
    setDraft(saved);
  };
  const next = () => {
    if (!stepValid(step)) return;
    if (dirty && allValid) save();
    setStep(step + 1);
  };
  const runTest = (kind) => {
    setTesting((t) => ({ ...t, [kind]: true }));
    clearTimeout(timers.current[kind]);
    timers.current[kind] = setTimeout(() => {
      const fresh = Store.get().customConnectors.find((c) => c.id === cc.id);
      const a = fresh && devkitAuthOf(fresh);
      setTesting((t) => ({ ...t, [kind]: false }));
      if (!a) return;
      const data = a.testData || {};
      const req = [...devkitFormFields(a), ...(a.fields || [])].filter((f) => f.required && !String(data[f.key] || '').trim());
      const d = devkitAuthDraft(fresh);
      const badFlow = devkitFlowDefs(a.type).find((f) => devkitFlowError(f, d.flows[f.key]));
      const relative = devkitFlowDefs(a.type).some((f) => (f.required || d.flows[f.key].enabled) && String(d.flows[f.key].url).startsWith('/'));
      const target = fresh.actions.find((x) => x.id === apiOp) || fresh.actions[0];
      const flowTitle = a.type === 'oauth2' || a.type === 'client' ? '获取访问令牌' : '获取授权用户';
      const result = kind === 'flow'
        ? req.length ? { ok: false, message: `缺少测试数据：${req.map((f) => f.label).join('、')}` }
          : badFlow ? { ok: false, message: `认证流程「${badFlow.title}」配置不完整` }
            : relative && !devkitIsUrl(fresh.baseUrl) ? { ok: false, message: 'Base URL 未配置，无法解析相对路径' }
              : { ok: true, message: `${flowTitle}成功 · 200 OK · ${180 + (devkitHash(JSON.stringify(data)) % 240)} ms` }
        : devkitTestState((a.tests || {}).flow) !== 'pass' ? { ok: false, message: '请先通过认证流程测试' }
          : !target ? { ok: false, message: '连接器还没有操作，无法调用业务接口' }
            : !devkitIsUrl(fresh.baseUrl) ? { ok: false, message: 'Base URL 未配置' }
              : { ok: true, message: `调用「${target.name}」成功 · 200 OK` };
      patchList('customConnectors', cc.id, (item) => ({ auth: { ...item.auth, tests: { ...(item.auth.tests || {}), [kind]: { ...result, at: Date.now() } } } }));
      if (result.ok) toast.success(kind === 'flow' ? '认证流程测试通过' : '业务接口测试通过');
      else toast.error(result.message);
    }, 900);
  };
  const publish = async () => {
    if (!(await confirmDialog({ title: `发布认证「${auth.name}」？`, content: '发布后立即生效，不能撤回。已有连接不受影响，新建的连接会使用新的认证配置。', okText: '发布' }))) return;
    patch((item) => ({ auth: { ...item.auth, status: 'published', changed: false, publishedAt: Date.now() } }));
    addAudit('发布连接器认证', `${cc.name} · ${auth.name}`, null);
    toast.success('认证已发布');
    navigate(`/devkit/${cc.id}/auth`);
  };
  const checks = [
    { id: 'c0', label: '基础信息完整', ok: stepValid(0) },
    { id: 'c1', label: '认证表单有效', ok: stepValid(1) },
    { id: 'c2', label: '认证流程配置完整', ok: stepValid(2) },
    { id: 'c3', label: '修改已保存', ok: !dirty },
    { id: 'c4', label: '认证流程测试通过', ok: devkitTestState(tests.flow) === 'pass' },
    { id: 'c5', label: '业务接口测试通过', ok: devkitTestState(tests.api) === 'pass' },
  ];
  const ready = checks.every((c) => c.ok);
  const already = auth.status === 'published' && !auth.changed;
  const statusTag = auth.status === 'published' ? html`<${Tag} size="sm" tone=${auth.changed ? 'warning' : 'success'}>${auth.changed ? '已发布 · 有未发布的修改' : '已发布'}<//>` : html`<${Tag} size="sm">草稿<//>`;
  const testRow = (kind, title, desc, extra) => {
    const st = devkitTestState(tests[kind]);
    const t = tests[kind] && typeof tests[kind] === 'object' ? tests[kind] : null;
    return html`<div className="test-row">
      <span className=${cx('status-ic', st === 'pass' ? 'tone-success' : st === 'fail' ? 'tone-danger' : 'tone-default')}><${Icon} name=${st === 'pass' ? 'CircleCheck' : st === 'fail' ? 'CircleX' : 'CircleDashed'} size=${18} /></span>
      <div className="grow">
        <b>${title}</b>
        <div className=${cx('text-xs', st === 'fail' ? 'devkit-fail-text' : 'muted')}>${t ? `${t.message} · ${fmt.dateTime(t.at)}` : st === 'pass' ? '已通过' : desc}</div>
      </div>
      ${extra}
      <${Button} size="sm" loading=${Boolean(testing[kind])} disabled=${dirty} onClick=${() => runTest(kind)}>${st === 'none' ? '开始测试' : '重新测试'}<//>
    </div>`;
  };
  return html`<div className="page devkit-page"><div className="page-inner">
    <div className="row"><${Breadcrumb} items=${[{ label: '认证与授权', to: `/devkit/${cc.id}/auth` }, { label: `开发认证 · ${auth.name}` }]} /><span className="spacer" />${statusTag}</div>
    ${auth.enabled === false && html`<div style=${{ marginTop: 12 }}><${Alert} tone="warning">连接器当前选择了「不使用认证」，这里的配置会保留，但不会生效。<//></div>`}
    <div style=${{ margin: '16px 0 24px' }}><${Steps} current=${step} onChange=${setStep} items=${[{ title: '基础信息' }, { title: '认证表单' }, { title: '认证流程' }, { title: '测试认证' }, { title: '发布认证' }]} /></div>
    ${step === 0 && html`<section className="ecard"><div className="ecard-body">
      <${Field} label="认证名称" required error=${stepErrors[0].name}><${DevkitCharInput} value=${draft.name} onChange=${set('name')} max=${30} invalid=${Boolean(stepErrors[0].name)} /><//>
      <${Field} label="认证类型" hint="认证创建后不能更改类型"><${Input} value=${devkitAuthLabel(auth.type)} readOnly /><//>
      <${Field} label="认证说明" hint="会显示在用户新建连接的弹窗里，告诉用户去哪里获取认证信息"><${DevkitCharTextarea} rows=${3} value=${draft.desc} onChange=${set('desc')} max=${200} placeholder="例：在服务的管理后台「开放平台」页面生成 API Key" /><//>
    </div></section>`}
    ${step === 1 && html`<section className="ecard">
      <div className="ecard-head"><span className="ecard-title">认证表单</span><${Button} size="sm" icon="Plus" onClick=${() => setFieldEdit({ index: -1 })}>添加自定义字段<//></div>
      <div className="ecard-body">
        <div className="text-xs muted" style=${{ marginBottom: 10 }}>用户新建连接时填写这些字段，认证流程里通过 <span className="mono">{{authInput.字段标识}}</span> 引用。</div>
        <${Table} dense rowKey="key" columns=${[
          { key: 'k', title: '字段标识', render: (r) => html`<span className="mono">${r.key}</span>` },
          { key: 'l', title: '展示名称', render: (r) => r.label },
          { key: 'c', title: '控件', width: 100, render: (r) => r.control },
          { key: 'r', title: '必填', width: 60, render: (r) => (r.required ? '是' : '否') },
          { key: 's', title: '来源', width: 90, render: (r) => html`<${Tag} size="sm" tone=${r.platform ? 'default' : 'primary'}>${r.platform ? '平台生成' : '自定义'}<//>` },
          { key: 'o', title: '', width: 76, align: 'right', render: (r) => (r.platform ? null : html`<span className="row-4">
            <${IconButton} icon="PenLine" size="xs" title="编辑" onClick=${() => setFieldEdit({ index: draft.fields.findIndex((f) => f.key === r.key) })} />
            <${IconButton} icon="Trash2" size="xs" title="删除" onClick=${() => set('fields')(draft.fields.filter((f) => f.key !== r.key))} />
          </span>`) },
        ]} data=${fields} />
        ${auth.type === 'apikey' && html`<div className="form-grid" style=${{ marginTop: 16 }}>
          <${Field} label="API Key 携带位置"><${RadioGroup} value=${draft.location} onChange=${set('location')} options=${[{ value: 'header', label: '请求头' }, { value: 'query', label: '查询参数' }]} /><//>
          <${Field} label="参数名" required error=${stepErrors[1].keyName}><${Input} mono value=${draft.keyName} onChange=${set('keyName')} placeholder="X-Api-Key" invalid=${Boolean(stepErrors[1].keyName)} /><//>
        </div>`}
      </div>
    </section>`}
    ${step === 2 && html`<${Fragment}>
      ${flowDefs.map((f) => {
        const fl = draft.flows[f.key];
        const err = stepErrors[2][f.key];
        const on = f.required || fl.enabled;
        return html`<section key=${f.key} className="ecard">
          <div className="ecard-head">
            <div className="row"><span className="ecard-title">${f.title}</span><${Tag} size="sm">${f.required ? '必需' : '可选'}<//></div>
            ${!f.required && html`<div className="row"><span className="text-xs muted">启用</span><${Switch} checked=${fl.enabled} onChange=${(v) => setFlow(f.key, { enabled: v })} /></div>`}
          </div>
          <div className="ecard-body">
            <div className="text-xs muted" style=${{ marginBottom: 10 }}>${f.desc}</div>
            ${on
              ? html`<${Fragment}>
                <${Field} label="请求地址" required error=${err && !err.includes('JSON') ? err : ''} hint=${String(fl.url).startsWith('/') ? `相对 Base URL：${cc.baseUrl || '（Base URL 未配置）'}${fl.url}` : ''}>
                  <div className="devkit-url-row"><${Select} width=${100} value=${fl.method} onChange=${(v) => setFlow(f.key, { method: v })} options=${['GET', 'POST'].map((m) => ({ value: m, label: m }))} /><${Input} mono value=${fl.url} onChange=${(v) => setFlow(f.key, { url: v })} placeholder="/oauth/token" invalid=${Boolean(err && !err.includes('JSON'))} style=${{ flex: 1 }} /></div>
                <//>
                <${Field} label="请求配置" hint="JSON，可包含 headers、query、body。{{authInput.x}} 引用认证表单，{{authData.x}} 引用上一步返回的数据" error=${err && err.includes('JSON') ? err : ''}>
                  <${CodeEditor} light rows=${6} value=${fl.config} onChange=${(v) => setFlow(f.key, { config: v })} label=${`${f.title}的请求配置`} />
                <//>
              <//>`
              : html`<div className="text-xs muted">已停用，不会执行这一步。</div>`}
          </div>
        </section>`;
      })}
      <section className="ecard">
        <div className="ecard-head"><div className="row"><span className="ecard-title">令牌和加签插件</span><${Tag} size="sm">可选<//></div><div className="row"><span className="text-xs muted">启用</span><${Switch} checked=${draft.plugin.enabled} onChange=${(v) => set('plugin')({ ...draft.plugin, enabled: v })} /></div></div>
        <div className="ecard-body">
          <div className="text-xs muted" style=${{ marginBottom: 10 }}>用 JavaScript 在每次请求前处理参数，例如给请求签名或附加时间戳。</div>
          ${draft.plugin.enabled ? html`<${CodeEditor} light rows=${6} value=${draft.plugin.code} onChange=${(v) => set('plugin')({ ...draft.plugin, code: v })} label="加签插件代码" />` : html`<div className="text-xs muted">未启用。</div>`}
        </div>
      </section>
    <//>`}
    ${step === 3 && html`<${Fragment}>
      <section className="ecard">
        <div className="ecard-head"><span className="ecard-title">测试数据</span><${Button} size="sm" icon="PenLine" onClick=${() => setDataOpen(true)}>编辑测试数据<//></div>
        <div className="ecard-body">
          <div className="kv">${savedFields.map((f) => html`<div key=${f.key}><span>${f.label}${f.required ? ' *' : ''}</span>${String(testData[f.key] || '').trim() ? html`<span className=${f.control === '密码' ? 'mono' : ''}>${f.control === '密码' ? '••••••' : testData[f.key]}</span>` : html`<span className="muted">未填写</span>`}</div>`)}</div>
        </div>
      </section>
      <section className="ecard"><div className="ecard-body">
        ${dirty && html`<div style=${{ marginBottom: 12 }}><${Alert} tone="warning">有未保存的修改，保存后再测试。<//></div>`}
        ${testRow('flow', '测试认证流程', '用测试数据走一遍认证流程')}
        ${testRow('api', '调用一个业务接口', '用拿到的令牌调用一个操作', cc.actions.length > 0 && html`<${Select} size="sm" width=${170} value=${apiOp} onChange=${setApiOp} options=${cc.actions.map((a) => ({ value: a.id, label: a.name }))} />`)}
        <div className="text-xs muted">两项测试可以同时进行；修改认证配置或测试数据后需要重新测试。</div>
      </div></section>
    <//>`}
    ${step === 4 && html`<section className="ecard"><div className="ecard-body">
      <div className="devkit-checklist">
        ${checks.map((c) => html`<div key=${c.id} className="row"><span className=${cx('status-ic', c.ok ? 'tone-success' : 'tone-default')}><${Icon} name=${c.ok ? 'CircleCheck' : 'CircleDashed'} size=${16} /></span><span className=${c.ok ? '' : 'muted'}>${c.label}</span></div>`)}
      </div>
      <div style=${{ marginTop: 14 }}>
        ${already
          ? html`<${Alert} tone="success" title="认证已发布">当前配置已经生效。修改认证配置后需要重新测试并发布。<//>`
          : ready
            ? html`<${Alert} tone="success" title="测试全部通过，可以发布">发布后立即生效，不能撤回。已有连接不受影响，新建连接会使用新的认证配置。<//>`
            : html`<${Alert} tone="warning" title="还不能发布">完成上面所有检查项后才能发布认证。<//>`}
      </div>
      <div style=${{ marginTop: 14 }}><${Button} variant="primary" icon="Rocket" disabled=${already || !ready} onClick=${publish}>${already ? '已发布' : '发布认证'}<//></div>
    </div></section>`}
    <div className="devkit-stepbar">
      <${Button} disabled=${step === 0} onClick=${() => setStep(step - 1)}>上一步<//>
      <span className="spacer" />
      ${dirty && html`<${Fragment}>
        <span className="text-xs muted">有未保存的修改</span>
        <${Button} variant="ghost" onClick=${discard}>放弃修改<//>
        <${Button} disabled=${!allValid} title=${allValid ? '' : '有步骤的配置不完整'} onClick=${save}>保存<//>
      <//>`}
      ${step < 4 && html`<${Button} variant="primary" disabled=${!stepValid(step)} onClick=${next}>下一步<//>`}
    </div>
    <${DevkitAuthFieldModal}
      open=${Boolean(fieldEdit)}
      initial=${fieldEdit && fieldEdit.index >= 0 ? draft.fields[fieldEdit.index] : null}
      taken=${fields.map((f) => f.key).filter((k) => !(fieldEdit && fieldEdit.index >= 0 && draft.fields[fieldEdit.index] && draft.fields[fieldEdit.index].key === k))}
      onClose=${() => setFieldEdit(null)}
      onSave=${(f) => { set('fields')(fieldEdit.index >= 0 ? draft.fields.map((x, i) => (i === fieldEdit.index ? f : x)) : [...draft.fields, f]); setFieldEdit(null); }}
    />
    <${DevkitTestDataModal} open=${dataOpen} onClose=${() => setDataOpen(false)} fields=${savedFields} value=${testData} onSave=${(v) => { patch((item) => ({ auth: { ...item.auth, testData: v, tests: { flow: null, api: null } } })); setDataOpen(false); toast.success('测试数据已保存，请重新测试'); }} />
  </div></div>`;
}

function DevkitAuthFieldModal({ open, initial, taken, onClose, onSave }) {
  const [d, setD] = useState({ key: '', label: '', control: '单行文本', required: true, options: '' });
  useEffect(() => {
    if (!open) return;
    setD(initial ? { ...initial, options: (initial.options || []).join('\n') } : { key: '', label: '', control: '单行文本', required: true, options: '' });
  }, [open]);
  const opts = d.options.split('\n').map((x) => x.trim()).filter(Boolean);
  const errors = {
    key: !d.key ? '' : !DEVKIT_FIELD_RE.test(d.key) ? '以字母或下划线开头，只能包含字母、数字和下划线' : taken.includes(d.key) ? '字段标识重复' : '',
    label: '',
    options: d.control === '下拉单选' && !opts.length ? '至少填写一个选项' : '',
  };
  const valid = Boolean(d.key) && Boolean(d.label.trim()) && !Object.values(errors).some(Boolean);
  const submit = () => {
    if (!valid) return;
    onSave({ key: d.key, label: d.label.trim(), control: d.control, required: d.required, ...(d.control === '下拉单选' ? { options: devkitUnique(opts) } : {}) });
  };
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title=${initial ? '编辑自定义字段' : '添加自定义字段'} width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${submit}>保存<//><//>`}>
    <div className="form-grid">
      <${Field} label="字段标识" required error=${errors.key}><${Input} mono value=${d.key} onChange=${(v) => setD({ ...d, key: v.trim() })} placeholder="tenant_id" invalid=${Boolean(errors.key)} /><//>
      <${Field} label="展示名称" required><${DevkitCharInput} value=${d.label} onChange=${(v) => setD({ ...d, label: v })} max=${30} placeholder="租户 ID" /><//>
    </div>
    <div className="form-grid">
      <${Field} label="控件"><${Select} value=${d.control} onChange=${(v) => setD({ ...d, control: v })} options=${DEVKIT_AUTH_CONTROLS.map((x) => ({ value: x, label: x }))} /><//>
      <${Field} label="必填"><${Switch} checked=${d.required} onChange=${(v) => setD({ ...d, required: v })} /><//>
    </div>
    ${d.control === '下拉单选' && html`<${Field} label="选项" required hint="每行一个" error=${errors.options}><${Textarea} rows=${3} value=${d.options} onChange=${(v) => setD({ ...d, options: v })} invalid=${Boolean(errors.options)} /><//>`}
  <//>`;
}

function DevkitTestDataModal({ open, onClose, fields, value, onSave }) {
  const [d, setD] = useState({});
  useEffect(() => { if (open) setD({ ...value }); }, [open]);
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title="编辑测试数据" description="测试认证时使用，只保存在这个连接器的开发配置里" width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${devkitSame(d, value)} onClick=${() => onSave(Object.fromEntries(Object.entries(d).filter(([, v]) => String(v || '').trim())))}>保存<//><//>`}>
    ${fields.map((f) => html`<${Field} key=${f.key} label=${f.label} required=${f.required}>
      ${f.control === '下拉单选'
        ? html`<${Select} value=${d[f.key] || null} onChange=${(v) => setD({ ...d, [f.key]: v })} options=${(f.options || []).map((o) => ({ value: o, label: o }))} />`
        : f.control === '多行文本'
          ? html`<${Textarea} rows=${2} value=${d[f.key] || ''} onChange=${(v) => setD({ ...d, [f.key]: v })} />`
          : html`<${Input} type=${f.control === '密码' ? 'password' : 'text'} mono=${f.control === '密码'} value=${d[f.key] || ''} onChange=${(v) => setD({ ...d, [f.key]: v })} />`}
    <//>`)}
  <//>`;
}

function DevkitOperation({ cc, op, patch, patchOp }) {
  const [tab, setTab] = useState('basic');
  const [debugOpen, setDebugOpen] = useState(false);
  const auth = devkitAuthOf(cc);
  const published = devkitPublishedOps(cc).includes(op.key);
  const change = devkitChanges(cc).find((c) => c.kind === 'action' && c.ref === op.id);
  const groups = devkitGroups(cc).map((g) => g.name).filter(Boolean);
  const params = op.params || [];
  const copyOp = () => {
    const taken = [...cc.actions.map((a) => a.key), ...(cc.removed || []).filter((r) => r.kind === 'action').map((r) => r.key)];
    const names = cc.actions.map((a) => a.name);
    const name = Array.from({ length: names.length + 2 }, (_, i) => `${op.name.slice(0, 24)} 副本${i ? ` ${i + 1}` : ''}`).find((n) => !names.includes(n));
    const copy = { ...devkitOmit(op, ['baseline', 'records']), id: uid('a'), key: devkitUniqueKey(`${op.key}_copy`, taken), name, params: params.map((p) => ({ ...p })), createdAt: Date.now() };
    patch((item) => {
      const i = item.actions.findIndex((a) => a.id === op.id);
      return { actions: [...item.actions.slice(0, i + 1), copy, ...item.actions.slice(i + 1)] };
    });
    toast.success(`已复制为「${copy.name}」，标识 ${copy.key}`);
    navigate(`/devkit/${cc.id}/op/${copy.id}`);
  };
  const removeOp = async () => {
    if (!(await confirmDialog({ title: `删除操作「${op.name}」？`, content: published ? '操作已包含在已发布的版本里。删除会作为变更出现在下次发布中，并且只能发布为新版本。' : '操作还没有发布过，删除后不可恢复。', danger: true, okText: '删除' }))) return;
    patch((item) => {
      const cur = item.actions.find((a) => a.id === op.id);
      const pub = cur && devkitPublishedOps(item).includes(cur.key);
      return {
        actions: item.actions.filter((a) => a.id !== op.id),
        removed: pub ? [...(item.removed || []), { id: uid('rm'), kind: 'action', key: cur.key, name: cur.name, def: cur.baseline || devkitOpDef(cur), at: Date.now() }] : item.removed || [],
      };
    });
    toast.success('操作已删除');
    navigate(`/devkit/${cc.id}/basic`);
  };
  return html`<div className="devop devkit-page">
    <div className="devop-main">
      <div className="devop-head">
        <div className="grow">
          <div className="row">
            <span className=${cx('method-tag', `m-${String(op.method).toLowerCase()}`)}>${op.method}</span>
            <h1 className="page-title devkit-op-title">${op.name}</h1>
            <span className="mono text-xs muted">${op.key}</span>
            ${change && html`<${Tag} size="sm" tone=${change.change === 'add' ? 'success' : 'warning'}>${change.change === 'add' ? '未发布' : '有未发布的修改'}<//>`}
          </div>
        </div>
        <${Button} icon="Bug" onClick=${() => setDebugOpen(true)}>调试<//>
        <${MoreMenu} size="md" items=${[
          { label: '复制操作', icon: 'Copy', onClick: copyOp },
          { divider: true },
          { label: '删除操作', icon: 'Trash2', danger: true, onClick: removeOp },
        ]} />
      </div>
      <div style=${{ padding: '0 24px' }}><${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'basic', label: '基本信息' }, { value: 'input', label: '入参', count: params.length }, { value: 'output', label: '出参' }, { value: 'api', label: 'API 配置' }, { value: 'code', label: '状态码' }]} /></div>
      <div className="devop-body">
        ${tab === 'basic' && html`<${DevkitEditCard}
          title="基本信息"
          init=${() => ({ name: op.name, desc: op.desc || '', group: op.group || '' })}
          validate=${(d) => ({ name: d.name.trim() ? '' : '请填写操作名称' })}
          onSave=${(d) => patchOp(op.id, { name: d.name.trim(), desc: d.desc.trim(), group: d.group.trim() })}
          form=${({ draft, set, errors }) => html`<${Fragment}>
            <${Field} label="操作展示名称" required error=${errors.name}><${DevkitCharInput} value=${draft.name} onChange=${set('name')} max=${30} invalid=${Boolean(errors.name)} /><//>
            <${Field} label="操作唯一标识" hint="创建后不可修改"><${Input} mono value=${op.key} readOnly /><//>
            <${Field} label="操作说明"><${DevkitCharTextarea} value=${draft.desc} onChange=${set('desc')} max=${100} rows=${2} /><//>
            <${Field} label="所属分组" hint="留空表示未分组"><${DevkitGroupInput} value=${draft.group} onChange=${set('group')} groups=${groups} /><//>
          <//>`}
        >
          <div className="kv">
            <div><span>操作展示名称</span><span>${op.name}</span></div>
            <div><span>操作唯一标识</span><span className="mono">${op.key}</span></div>
            <div><span>操作说明</span><span className=${op.desc ? '' : 'muted'}>${op.desc || '未填写'}</span></div>
            <div><span>所属分组</span><span>${op.group || '未分组'}</span></div>
            <div><span>认证方式</span><span>${auth && auth.enabled !== false ? `使用连接器认证「${auth.name}」（${devkitAuthLabel(auth.type)}）` : '不使用认证'}</span></div>
          </div>
        <//>`}
        ${tab === 'input' && html`<${DevkitParamsTable} title="入参" params=${params} actions=${cc.actions.filter((a) => a.id !== op.id)} onChange=${(next) => patchOp(op.id, { params: next })} />`}
        ${tab === 'output' && html`<${DevkitSampleEditor} value=${op.sample} onSave=${(v) => patchOp(op.id, { sample: v })} />`}
        ${tab === 'api' && html`<${DevkitApiConfig} cc=${cc} op=${op} onSave=${(p) => patchOp(op.id, p)} />`}
        ${tab === 'code' && html`<${DevkitOpStatus} cc=${cc} op=${op} patchOp=${patchOp} />`}
      </div>
    </div>
    <${DevkitSimulator} cc=${cc} op=${op} />
    <${Drawer} open=${debugOpen} onClose=${() => setDebugOpen(false)} className="devkit-modal" title="调试台" subtitle=${`${op.name} · ${op.method} ${op.path}`} width=${720}>
      ${debugOpen && html`<${DevkitDebugConsole} cc=${cc} op=${op} patchOp=${patchOp} />`}
    <//>
  </div>`;
}

function DevkitParamsTable({ title, params, onChange, actions, hint }) {
  const [edit, setEdit] = useState(null);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= params.length) return;
    onChange(params.map((p, k) => (k === i ? params[j] : k === j ? params[i] : p)));
  };
  const remove = async (p) => {
    if (!(await confirmDialog({ title: `删除字段「${p.label}」？`, content: 'API 配置里引用它的插值需要同步修改。', danger: true, okText: '删除' }))) return;
    onChange(params.filter((x) => x.key !== p.key));
    toast.success('已删除');
  };
  const save = (p) => {
    onChange(edit.index >= 0 ? params.map((x, i) => (i === edit.index ? p : x)) : [...params, p]);
    setEdit(null);
    toast.success('已保存');
  };
  return html`<section className="ecard">
    <div className="ecard-head"><span className="ecard-title">${title}</span><div className="row"><span className="text-xs muted">用箭头调整字段顺序</span><${Button} size="sm" icon="Plus" onClick=${() => setEdit({ index: -1 })}>添加字段<//></div></div>
    <div className="ecard-body">
      ${hint && html`<div className="text-xs muted" style=${{ marginBottom: 10 }}>${hint}</div>`}
      <${Table} dense rowKey="key" columns=${[
        { key: 'order', title: '顺序', width: 64, render: (r, i) => html`<span className="row-4"><${IconButton} icon="ArrowUp" size="xs" title="上移" disabled=${i === 0} onClick=${() => move(i, -1)} /><${IconButton} icon="ArrowDown" size="xs" title="下移" disabled=${i === params.length - 1} onClick=${() => move(i, 1)} /></span>` },
        { key: 'key', title: '字段', render: (r) => html`<div className="devkit-param-cell"><span>${r.label}</span><span className="mono text-xs muted">${r.key}</span></div>` },
        { key: 'control', title: '控件 · 类型', width: 120, render: (r) => html`<div className="devkit-param-cell"><span>${r.control}</span><span className="mono text-xs muted">${r.type}</span></div>` },
        { key: 'req', title: '必填', width: 56, render: (r) => (r.required ? '是' : '否') },
        { key: 'source', title: '来源', width: 92, render: (r) => (r.source === 'HTTP 接口' ? html`<${Tooltip} content=${r.optionsFrom ? `选项来自操作「${((actions || []).find((a) => a.key === r.optionsFrom) || { name: r.optionsFrom }).name}」` : '还没有选择提供选项的接口'}><${Tag} size="sm" tone="info">动态下拉<//><//>` : html`<span className="muted">输入值</span>`) },
        { key: 'op', title: '操作', width: 76, align: 'right', render: (r, i) => html`<span className="row-4"><${IconButton} icon="PenLine" size="xs" title="编辑" onClick=${() => setEdit({ index: i })} /><${IconButton} icon="Trash2" size="xs" title="删除" onClick=${() => remove(r)} /></span>` },
      ]} data=${params} empty=${html`<${Empty} size="sm" icon="ListPlus" title="还没有字段" description="添加字段后，工作流节点面板里会出现对应的输入项。" />`} />
    </div>
    <${DevkitParamDrawer}
      open=${Boolean(edit)}
      initial=${edit && edit.index >= 0 ? params[edit.index] : null}
      taken=${params.filter((p, i) => !(edit && i === edit.index)).map((p) => p.key)}
      actions=${actions || []}
      onClose=${() => setEdit(null)}
      onSave=${save}
    />
  </section>`;
}

function DevkitParamDrawer({ open, initial, taken, actions, onClose, onSave }) {
  const blank = { key: '', label: '', type: 'string', control: '输入框', required: false, source: '输入值', options: '', optionsFrom: null, hint: '', pattern: '', patternMsg: '', visibleIf: '' };
  const [d, setD] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setD(initial ? { ...blank, ...initial, options: (initial.options || []).join('\n'), optionsFrom: initial.optionsFrom || null } : blank);
  }, [open]);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const setControl = (control) => setD((x) => ({
    ...x,
    control,
    type: control === '开关' ? 'boolean' : control === '代码' ? (['object', 'array'].includes(x.type) ? x.type : 'object') : x.type === 'boolean' || x.type === 'object' || x.type === 'array' ? 'string' : x.type,
    required: control === '开关' ? false : x.required,
    source: control === '下拉单选' ? x.source : '输入值',
  }));
  const setType = (type) => setD((x) => ({
    ...x,
    type,
    control: type === 'boolean' ? '开关' : type === 'object' || type === 'array' ? '代码' : x.control === '开关' || x.control === '代码' ? '输入框' : x.control,
    required: type === 'boolean' ? false : x.required,
  }));
  const opts = String(d.options || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const patternErr = (() => {
    if (!d.pattern) return '';
    try {
      new RegExp(d.pattern);
      return '';
    } catch (e) {
      return '不是有效的正则表达式';
    }
  })();
  const errors = {
    key: !d.key ? '' : !DEVKIT_FIELD_RE.test(d.key) ? '以字母或下划线开头，只能包含字母、数字和下划线' : taken.includes(d.key) ? '字段标识重复' : '',
    options: d.control === '下拉单选' && !opts.length ? (d.source === 'HTTP 接口' ? '至少填写一个示例选项' : '至少填写一个选项') : opts.length !== devkitUnique(opts).length ? '选项有重复' : '',
    pattern: patternErr,
    patternMsg: d.pattern && !String(d.patternMsg || '').trim() ? '填写校验失败时的提示' : '',
  };
  const valid = Boolean(d.key) && Boolean(d.label.trim()) && !Object.values(errors).some(Boolean);
  const submit = () => {
    if (!valid) return;
    const select = d.control === '下拉单选';
    const text = d.control === '输入框';
    onSave({
      key: d.key, label: d.label.trim(), type: d.type, control: d.control, required: d.control === '开关' ? false : Boolean(d.required), source: select ? d.source : '输入值',
      ...(select ? { options: opts } : {}),
      ...(select && d.source === 'HTTP 接口' ? { optionsFrom: d.optionsFrom } : {}),
      ...(d.hint.trim() ? { hint: d.hint.trim() } : {}),
      ...(text && d.pattern ? { pattern: d.pattern, patternMsg: d.patternMsg.trim() } : {}),
      ...(d.visibleIf.trim() ? { visibleIf: d.visibleIf.trim() } : {}),
    });
  };
  return html`<${Drawer} open=${open} onClose=${onClose} className="devkit-modal" title=${initial ? '编辑字段' : '添加字段'} width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${submit}>保存<//><//>`}>
    <div className="form-grid">
      <${Field} label="字段标识" required error=${errors.key} hint=${errors.key ? '' : 'API 配置里用 {{input.字段标识}} 引用'}><${Input} mono value=${d.key} onChange=${(v) => set('key')(v.trim())} placeholder="orderId" invalid=${Boolean(errors.key)} /><//>
      <${Field} label="展示名称" required><${DevkitCharInput} value=${d.label} onChange=${set('label')} max=${30} placeholder="订单号" /><//>
    </div>
    <div className="form-grid">
      <${Field} label="控件"><${Select} value=${d.control} onChange=${setControl} options=${DEVKIT_CONTROLS.map((x) => ({ value: x, label: x }))} /><//>
      <${Field} label="类型"><${Select} value=${d.type} onChange=${setType} options=${DEVKIT_TYPES.map((x) => ({ value: x, label: x }))} /><//>
    </div>
    <${Field} label="必填" hint=${d.control === '开关' ? '开关总有取值，不需要设为必填' : ''}><${Switch} checked=${Boolean(d.required)} disabled=${d.control === '开关'} onChange=${set('required')} /><//>
    ${d.control === '下拉单选' && html`<${Fragment}>
      <${Field} label="选项来源"><${RadioGroup} value=${d.source} onChange=${set('source')} options=${[{ value: '输入值', label: '固定选项' }, { value: 'HTTP 接口', label: 'HTTP 接口（动态下拉）' }]} /><//>
      ${d.source === 'HTTP 接口' && html`<${Field} label="提供选项的接口" hint=${d.optionsFrom ? '工作流运行时调用这个操作加载选项' : '还没有选择接口，节点面板只会显示下面的示例选项'}><${Select} value=${d.optionsFrom} onChange=${set('optionsFrom')} clearable placeholder=${actions.length ? '选择这个连接器的一个操作' : '连接器还没有其他操作'} options=${actions.map((a) => ({ value: a.key, label: a.name, desc: `${a.method} ${a.path}` }))} /><//>`}
      <${Field} label=${d.source === 'HTTP 接口' ? '示例选项' : '选项'} required hint=${d.source === 'HTTP 接口' ? '每行一个，用于模拟器和节点面板预览' : '每行一个'} error=${errors.options}><${Textarea} rows=${4} value=${d.options} onChange=${set('options')} invalid=${Boolean(errors.options)} /><//>
    <//>`}
    <${Field} label="提示信息" hint="显示在字段名旁边的问号里"><${DevkitCharInput} value=${d.hint} onChange=${set('hint')} max=${60} /><//>
    ${d.control === '输入框' && html`<${Field} label="校验规则" hint="正则表达式和校验失败时的提示，留空表示不校验" error=${errors.pattern || errors.patternMsg}>
      <div className="form-grid"><${Input} mono value=${d.pattern} onChange=${set('pattern')} placeholder="^\\d{6,}$" invalid=${Boolean(errors.pattern)} /><${Input} value=${d.patternMsg} onChange=${set('patternMsg')} placeholder="至少 6 位数字" invalid=${Boolean(errors.patternMsg)} /></div>
    <//>`}
    <${Field} label="可见性表达式" hint="表达式为 true 时才显示这个字段，留空表示一直显示"><${Input} mono value=${d.visibleIf} onChange=${set('visibleIf')} placeholder="input.mode == 'advanced'" /><//>
  <//>`;
}

function DevkitSampleEditor({ value, onSave }) {
  const initial = value && typeof value === 'object' && Object.keys(value).length ? JSON.stringify(value, null, 2) : '';
  const [text, setText] = useState(initial);
  useEffect(() => { setText(initial); }, [initial]);
  const parsed = (() => {
    if (!text.trim()) return { value: null, error: '' };
    try {
      const v = JSON.parse(text);
      return v && typeof v === 'object' ? { value: v, error: '' } : { value: null, error: '出参样例需要是 JSON 对象或数组' };
    } catch (e) {
      return { value: null, error: 'JSON 格式不正确' };
    }
  })();
  const dirty = text !== initial;
  const shown = parsed.value || (value && typeof value === 'object' && Object.keys(value).length ? value : null);
  return html`<section className="ecard">
    <div className="ecard-head">
      <span className="ecard-title">出参</span>
      <div className="row">
        ${dirty && html`<${Button} size="sm" variant="ghost" icon="RotateCcw" onClick=${() => setText(initial)}>还原<//>`}
        <${Button} size="sm" icon="Braces" disabled=${!parsed.value} onClick=${() => setText(JSON.stringify(parsed.value, null, 2))}>格式化<//>
        <${Button} size="sm" variant="primary" disabled=${!dirty || Boolean(parsed.error)} onClick=${() => { onSave(parsed.value || {}); toast.success('出参已保存'); }}>保存<//>
      </div>
    </div>
    <div className="ecard-body">
      <div className="devkit-two-col">
        <div>
          <div className="field-label" style=${{ marginBottom: 6 }}>响应样例</div>
          <${CodeEditor} light rows=${12} value=${text} onChange=${setText} label="响应样例" placeholderHint='粘贴一段真实的响应 JSON，例如 { "id": 1 }' />
          ${parsed.error ? html`<div className="field-error">${parsed.error}</div>` : html`<div className="field-hint">出参结构根据响应样例生成，保存后在工作流里可以引用</div>`}
        </div>
        <div>
          <div className="field-label" style=${{ marginBottom: 6 }}>出参结构${dirty && !parsed.error && parsed.value ? html`<span className="muted text-xs">（预览，未保存）</span>` : ''}</div>
          <div className="card devkit-otree">${shown ? html`<div className="devkit-otree-rows"><${OutputTree} value=${shown} prefix="out" defaultOpen=${3} /></div>` : html`<${Empty} size="sm" icon="Braces" title="还没有出参" description="在左侧粘贴响应样例。" />`}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function DevkitKvEditor({ rows, onChange, errors, keyPlaceholder, valuePlaceholder, addLabel }) {
  const update = (id, p) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return html`<div className="devkit-kv">
    ${rows.map((r, i) => html`<div key=${r.id} className="devkit-kv-row">
      <${Input} mono size="sm" value=${r.key} onChange=${(v) => update(r.id, { key: v })} placeholder=${keyPlaceholder || 'Key'} invalid=${Boolean(errors && errors[i])} />
      <${Input} mono size="sm" value=${r.value} onChange=${(v) => update(r.id, { value: v })} placeholder=${valuePlaceholder || 'Value'} />
      <${IconButton} icon="Trash2" size="xs" title="删除" onClick=${() => onChange(rows.filter((x) => x.id !== r.id))} />
      ${errors && errors[i] && html`<div className="field-error devkit-kv-error">${errors[i]}</div>`}
    </div>`)}
    <${Button} size="sm" variant="dashed" icon="Plus" onClick=${() => onChange([...rows, { id: uid('kv'), key: '', value: '' }])}>${addLabel || '添加'}<//>
  </div>`;
}

function DevkitApiConfig({ cc, op, onSave }) {
  const [view, setView] = useState('body');
  const params = op.params || [];
  const api = devkitApiOf(op);
  const chips = (onPick) => params.length > 0 && html`<div className="devkit-chips">${params.map((p) => html`<button key=${p.key} type="button" className="devkit-chip mono" title="复制插值" onClick=${() => onPick(`{{input.${p.key}}}`)}>{{input.${p.key}}}</button>`)}</div>`;
  const copyRef = (s) => { if (copyText(s)) toast.success(`已复制 ${s}`); else toast.error('复制失败，请手动输入'); };
  return html`<${DevkitEditCard}
    title="API 配置"
    init=${() => ({ method: op.method, path: op.path || '/', ...api })}
    validate=${(d) => {
      const refs = devkitUnknownRefs([d.path, ...d.headers.map((h) => h.value), ...d.query.map((q) => q.value), d.body, ...d.form.map((f) => f.value)].join('\n'), params);
      const timeout = Number(d.timeout);
      return {
        path: !String(d.path).startsWith('/') ? '请求路径需要以 / 开头' : '',
        headers: devkitKvErrors(d.headers, { caseInsensitive: true }),
        query: devkitKvErrors(d.query),
        form: d.bodyType === 'form-data' || d.bodyType === 'x-www-form-urlencoded' ? devkitKvErrors(d.form) : [],
        body: d.bodyType === 'JSON' ? devkitJsonError(d.body) : '',
        timeout: !(Number.isInteger(timeout) && timeout >= 1 && timeout <= 300) ? '填写 1 到 300 之间的整数' : '',
        refs: refs.length ? `引用了不存在的入参：${refs.join('、')}` : '',
      };
    }}
    onSave=${(d) => onSave({ method: d.method, path: d.path.trim(), api: { headers: d.headers, query: d.query, bodyType: d.bodyType, body: d.body, form: d.form, timeout: Number(d.timeout), followRedirect: d.followRedirect } })}
    form=${({ draft, set, errors }) => html`<${Fragment}>
      <div className="text-xs muted" style=${{ marginBottom: 12 }}>用 <span className="mono">{{input.字段标识}}</span> 引用入参，路径、请求头、查询参数和请求体里都可以使用。点击下面的插值可以复制。</div>
      ${chips(copyRef)}
      <${Field} label="请求" required error=${errors.path}>
        <div className="devkit-url-row"><${Select} width=${110} value=${draft.method} onChange=${set('method')} options=${DEVKIT_METHODS.map((m) => ({ value: m, label: m }))} /><${Input} mono value=${draft.path} onChange=${set('path')} prefix=${cc.baseUrl || 'Base URL'} invalid=${Boolean(errors.path)} style=${{ flex: 1 }} /></div>
      <//>
      <${Field} label="请求头"><${DevkitKvEditor} rows=${draft.headers} onChange=${set('headers')} errors=${errors.headers} keyPlaceholder="Content-Type" addLabel="添加请求头" /><//>
      <${Field} label="查询参数"><${DevkitKvEditor} rows=${draft.query} onChange=${set('query')} errors=${errors.query} keyPlaceholder="page" addLabel="添加查询参数" /><//>
      <${Field} label="请求体" error=${errors.body}>
        <div style=${{ marginBottom: 8 }}><${RadioGroup} value=${draft.bodyType} onChange=${set('bodyType')} options=${['none', 'form-data', 'x-www-form-urlencoded', 'JSON'].map((x) => ({ value: x, label: x }))} /></div>
        ${draft.bodyType === 'JSON' && html`<${CodeEditor} light rows=${7} value=${draft.body} onChange=${set('body')} label="JSON 请求体" />`}
        ${(draft.bodyType === 'form-data' || draft.bodyType === 'x-www-form-urlencoded') && html`<${DevkitKvEditor} rows=${draft.form} onChange=${set('form')} errors=${errors.form} keyPlaceholder="字段名" addLabel="添加表单字段" />`}
      <//>
      <div className="form-grid">
        <${Field} label="超时时间" error=${errors.timeout}><${Input} value=${String(draft.timeout)} onChange=${set('timeout')} suffix="秒" invalid=${Boolean(errors.timeout)} /><//>
        <${Field} label="跟随重定向"><${Switch} checked=${draft.followRedirect} onChange=${set('followRedirect')} /><//>
      </div>
      ${errors.refs && html`<${Alert} tone="danger">${errors.refs}<//>`}
    <//>`}
  >
    <div className="kv">
      <div><span>请求</span><span className="row-4"><span className=${cx('method-tag', `m-${String(op.method).toLowerCase()}`)}>${op.method}</span><span className="mono">${cc.baseUrl || html`<span className="muted">（Base URL 未配置）</span>`}${op.path}</span></span></div>
      <div><span>超时时间</span><span>${api.timeout} 秒 · ${api.followRedirect ? '跟随重定向' : '不跟随重定向'}</span></div>
    </div>
    <div className="row" style=${{ margin: '14px 0 10px' }}>${[['headers', `请求头 ${api.headers.length}`], ['query', `查询参数 ${api.query.length}`], ['body', '请求体']].map(([k, l]) => html`<button key=${k} type="button" className=${cx('chip', view === k && 'is-active')} onClick=${() => setView(k)}>${l}</button>`)}</div>
    ${view === 'headers' && (api.headers.length ? html`<${Fragment}><${Table} dense columns=${[{ key: 'k', title: 'Key', render: (r) => html`<span className="mono">${r.key}</span>` }, { key: 'v', title: 'Value', render: (r) => html`<span className="mono">${r.value}</span>` }]} data=${api.headers} /><div className="text-xs muted" style=${{ marginTop: 8 }}>认证信息由连接器认证自动附加</div><//>` : html`<div className="text-xs muted">没有自定义请求头，认证信息由连接器认证自动附加</div>`)}
    ${view === 'query' && (api.query.length ? html`<${Table} dense columns=${[{ key: 'k', title: 'Key', render: (r) => html`<span className="mono">${r.key}</span>` }, { key: 'v', title: 'Value', render: (r) => html`<span className="mono">${r.value}</span>` }]} data=${api.query} />` : html`<div className="text-xs muted">没有查询参数</div>`)}
    ${view === 'body' && (api.bodyType === 'none' ? html`<div className="text-xs muted">这个请求没有请求体</div>` : api.bodyType === 'JSON' ? html`<${CodeBlock} code=${api.body || '{}'} />` : html`<${CodeBlock} code=${`${api.bodyType}\n${(api.form || []).map((f) => `${f.key}=${f.value}`).join('\n') || '（空）'}`} />`)}
  <//>`;
}

function DevkitStatusView({ value }) {
  return html`<${Fragment}>
    <div className="kv" style=${{ marginBottom: 12 }}>
      <div><span>应用状态码路径</span><span className="mono">${value.codePath}</span></div>
      <div><span>错误描述路径</span><span className="mono">${value.msgPath}</span></div>
      <div><span>未匹配的状态码</span><span>${value.unmatched === 'ok' ? '视为成功' : '视为失败'}</span></div>
    </div>
    <${Table} dense rowKey="id" columns=${[
      { key: 'code', title: '取值', width: 90, render: (r) => html`<span className="mono">${r.code}</span>` },
      { key: 'ok', title: '结果', width: 80, render: (r) => html`<${Tag} size="sm" tone=${r.ok ? 'success' : 'danger'}>${r.ok ? '成功' : '失败'}<//>` },
      { key: 'retry', title: '重试', width: 90, render: (r) => (r.ok ? '-' : r.retry ? '可重试' : '不可重试') },
      { key: 'tip', title: '排查建议', wrap: true, render: (r) => r.tip || '-' },
    ]} data=${value.rows} />
  <//>`;
}

function DevkitStatusEditor({ value, onSave, title, extra }) {
  return html`<${DevkitEditCard}
    title=${title || '状态码'}
    extra=${extra}
    init=${() => ({ ...value, rows: value.rows.map((r) => ({ ...r })) })}
    validate=${(d) => ({
      codePath: d.codePath.trim() ? '' : '请填写应用状态码路径',
      msgPath: d.msgPath.trim() ? '' : '请填写错误描述路径',
      rows: d.rows.map((r, i) => (!String(r.code).trim() ? '取值不能为空' : d.rows.findIndex((x) => String(x.code).trim() === String(r.code).trim()) < i ? `取值「${String(r.code).trim()}」重复` : '')),
      empty: d.rows.length ? '' : '至少配置一个状态码',
    })}
    onSave=${(d) => onSave({ ...d, codePath: d.codePath.trim(), msgPath: d.msgPath.trim(), rows: d.rows.map((r) => ({ ...r, code: String(r.code).trim(), retry: r.ok ? false : r.retry })) })}
    form=${({ draft, set, errors }) => html`<${Fragment}>
      <div className="form-grid">
        <${Field} label="应用状态码路径" required error=${errors.codePath}><${Input} mono value=${draft.codePath} onChange=${set('codePath')} placeholder="{{body.code}}" invalid=${Boolean(errors.codePath)} /><//>
        <${Field} label="错误描述路径" required error=${errors.msgPath}><${Input} mono value=${draft.msgPath} onChange=${set('msgPath')} placeholder="{{body.message}}" invalid=${Boolean(errors.msgPath)} /><//>
      </div>
      <div className="devkit-code-head"><span>取值</span><span>结果</span><span>重试</span><span>排查建议</span><span /></div>
      ${draft.rows.map((r, i) => html`<div key=${r.id} className="devkit-code-row">
        <${Input} mono size="sm" value=${r.code} onChange=${(v) => set('rows')(draft.rows.map((x) => (x.id === r.id ? { ...x, code: v } : x)))} invalid=${Boolean(errors.rows[i])} />
        <${Select} size="sm" value=${r.ok ? 'ok' : 'fail'} onChange=${(v) => set('rows')(draft.rows.map((x) => (x.id === r.id ? { ...x, ok: v === 'ok' } : x)))} options=${[{ value: 'ok', label: '成功' }, { value: 'fail', label: '失败' }]} />
        <${Select} size="sm" disabled=${r.ok} value=${r.ok ? 'no' : r.retry ? 'yes' : 'no'} onChange=${(v) => set('rows')(draft.rows.map((x) => (x.id === r.id ? { ...x, retry: v === 'yes' } : x)))} options=${[{ value: 'yes', label: '可重试' }, { value: 'no', label: '不可重试' }]} />
        <${Input} size="sm" value=${r.tip} onChange=${(v) => set('rows')(draft.rows.map((x) => (x.id === r.id ? { ...x, tip: v } : x)))} placeholder="告诉使用者如何排查" />
        <${IconButton} icon="Trash2" size="xs" title="删除" onClick=${() => set('rows')(draft.rows.filter((x) => x.id !== r.id))} />
        ${errors.rows[i] && html`<div className="field-error devkit-kv-error">${errors.rows[i]}</div>`}
      </div>`)}
      ${errors.empty && html`<div className="field-error">${errors.empty}</div>`}
      <div className="row" style=${{ marginTop: 12 }}>
        <${Button} size="sm" variant="dashed" icon="Plus" onClick=${() => set('rows')([...draft.rows, { id: uid('sc'), code: '', ok: false, retry: false, tip: '' }])}>添加状态码<//>
        <span className="spacer" />
        <span className="text-xs muted">未匹配的状态码</span>
        <${Select} size="sm" width=${120} value=${draft.unmatched} onChange=${set('unmatched')} options=${[{ value: 'fail', label: '视为失败' }, { value: 'ok', label: '视为成功' }]} />
      </div>
    <//>`}
  >
    <${DevkitStatusView} value=${value} />
  <//>`;
}

function DevkitOpStatus({ cc, op, patchOp }) {
  const global = devkitStatusOf(cc);
  const follow = op.statusFollow !== false;
  const toggle = (v) => {
    patchOp(op.id, (a) => ({ statusFollow: v, statusCodes: v ? a.statusCodes : a.statusCodes || global }));
    toast.success(v ? '已改为跟随连接器全局配置' : '已改为单独配置，初始值复制自全局配置');
  };
  const sw = html`<span className="row"><span className="text-xs muted">跟随连接器全局配置</span><${Switch} checked=${follow} onChange=${toggle} /></span>`;
  if (!follow) return html`<${DevkitStatusEditor} title="状态码（单独配置）" extra=${sw} value=${op.statusCodes || global} onSave=${(v) => patchOp(op.id, { statusCodes: v })} />`;
  return html`<section className="ecard">
    <div className="ecard-head"><span className="ecard-title">状态码</span>${sw}</div>
    <div className="ecard-body">
      <${DevkitStatusView} value=${global} />
      <div className="text-xs muted" style=${{ marginTop: 10 }}>当前使用连接器的全局配置，<${Link} className="link" to=${`/devkit/${cc.id}/status`}>去修改全局配置<//>；关闭开关后可以为这个操作单独配置。</div>
    </div>
  </section>`;
}

function DevkitSimulator({ cc, op }) {
  const state = useStore();
  const [tab, setTab] = useState('input');
  const [values, setValues] = useState({});
  const [connId, setConnId] = useState(null);
  const auth = devkitAuthOf(cc);
  const needConn = Boolean(auth && auth.enabled !== false);
  const conns = state.connections.filter((c) => c.connector === cc.id && connectionPerm(state, c));
  const params = op.params || [];
  const setV = (k) => (v) => setValues((x) => ({ ...x, [k]: v }));
  const current = needConn || tab !== 'conn' ? tab : 'input';
  return html`<aside className="devop-sim">
    <div className="devop-sim-head"><${Icon} name="Smartphone" size=${14} />模拟器<span className="text-xs muted">预览在工作流节点面板里的样子</span></div>
    <div className="sim-panel">
      <div className="row" style=${{ padding: '12px 12px 0' }}><${ConnectorIcon} connector=${customAsConnector(cc)} size=${32} /><div className="grow"><b>${cc.name}</b><div className="text-xs muted ellipsis">操作：${op.name}</div></div></div>
      <div style=${{ padding: '0 12px' }}><${Tabs} value=${current} onChange=${setTab} items=${[{ value: 'op', label: '操作' }, ...(needConn ? [{ value: 'conn', label: '连接' }] : []), { value: 'input', label: '入参', count: params.length }, { value: 'out', label: '出参' }]} /></div>
      <div className="devkit-sim-body">
        ${current === 'op' && html`<div className="devkit-sim-op">
          <div className="row"><span className=${cx('method-tag', `m-${String(op.method).toLowerCase()}`)}>${op.method}</span><b>${op.name}</b></div>
          <div className="text-xs muted">${op.desc || '没有操作说明'}</div>
          <div className="text-xs muted">分组：${op.group || '未分组'}</div>
        </div>`}
        ${current === 'conn' && (conns.length
          ? html`<${Field} label="连接" required><${Select} value=${connId} onChange=${setConnId} placeholder="选择连接" options=${conns.map((c) => ({ value: c.id, label: c.name, desc: CONN_STATUS[c.status] ? CONN_STATUS[c.status].label : c.status }))} /><//>`
          : html`<div className="text-xs muted">还没有「${cc.name}」的连接。用户在节点面板里会看到「新建连接」，填写认证「${auth.name}」的表单。</div>`)}
        ${current === 'input' && (params.length === 0
          ? html`<div className="text-xs muted">这个操作没有入参。</div>`
          : params.map((p) => {
            const err = devkitParamValueError({ ...p, required: false }, values[p.key]);
            return html`<div key=${p.key} className="param">
              <div className="param-head">
                <span className="param-name">${p.label}</span>${p.required && html`<span className="param-req">*</span>`}
                ${p.hint && html`<${Tooltip} content=${p.hint}><${Icon} name="CircleHelp" size=${13} className="muted" /><//>`}
                ${p.visibleIf && html`<${Tag} size="sm">条件显示<//>`}
                <span className="param-mode" style=${{ marginLeft: 'auto' }}>${p.type === 'object' || p.type === 'array' ? '{ }' : p.type === 'boolean' ? 'T/F' : p.type === 'number' ? '123' : 'Aa'}</span>
              </div>
              ${p.control === '开关'
                ? html`<${Switch} checked=${Boolean(values[p.key])} onChange=${setV(p.key)} />`
                : p.control === '下拉单选'
                  ? html`<${Select} value=${values[p.key] ?? null} onChange=${setV(p.key)} placeholder=${p.source === 'HTTP 接口' ? '从接口加载选项' : '请选择'} options=${(p.options || []).map((o) => ({ value: o, label: o }))} />`
                  : p.control === '代码'
                    ? html`<${Textarea} mono rows=${3} value=${values[p.key] || ''} onChange=${setV(p.key)} placeholder="{ }" invalid=${Boolean(err)} />`
                    : html`<${Input} value=${values[p.key] || ''} onChange=${setV(p.key)} placeholder="请输入" invalid=${Boolean(err)} />`}
              ${err && html`<div className="param-error">${err}</div>`}
            </div>`;
          }))}
        ${current === 'out' && (op.sample && typeof op.sample === 'object' && Object.keys(op.sample).length
          ? html`<div className="devkit-otree-rows"><${OutputTree} value=${op.sample} prefix="out" defaultOpen=${2} /></div>`
          : html`<div className="text-xs muted">还没有出参，在「出参」里粘贴响应样例。</div>`)}
      </div>
    </div>
  </aside>`;
}

function DevkitDebugConsole({ cc, op, patchOp }) {
  const state = useStore();
  const auth = devkitAuthOf(cc);
  const needConn = Boolean(auth && auth.enabled !== false);
  const conns = state.connections.filter((c) => c.connector === cc.id && connectionPerm(state, c));
  const params = op.params || [];
  const [values, setValues] = useState(() => Object.fromEntries(params.map((p) => [p.key, p.control === '开关' ? false : ''])));
  const [connId, setConnId] = useState(() => (conns[0] ? conns[0].id : null));
  const [tried, setTried] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('resp');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const errors = Object.fromEntries(params.map((p) => [p.key, devkitParamValueError(p, values[p.key])]));
  const connErr = needConn && !connId ? '请选择连接' : '';
  const invalid = Object.values(errors).some(Boolean) || Boolean(connErr);
  const setV = (k) => (v) => setValues((x) => ({ ...x, [k]: v }));
  const run = () => {
    setTried(true);
    if (invalid) return;
    setRunning(true);
    timer.current = setTimeout(() => {
      const res = devkitSimulate({ cc, op, values, conn: needConn ? conns.find((c) => c.id === connId) : null });
      setRunning(false);
      setResult(res);
      setTab('resp');
      if (res.ok) toast.success(`调试成功 · ${res.status} · ${res.duration} ms`);
      else toast.error(`调试失败：${res.response.error}`);
    }, 700);
  };
  const saveRecord = () => {
    patchOp(op.id, (a) => ({ records: [{ id: uid('rec'), at: result.at, values, ok: result.ok, status: result.status, duration: result.duration }, ...(a.records || [])].slice(0, 20) }), true);
    toast.success('已保存本条调试记录');
  };
  const records = op.records || [];
  return html`<${Fragment}>
    <div className="section-title devkit-sub-title">调试参数</div>
    ${params.length === 0 && html`<div className="text-xs muted" style=${{ marginBottom: 12 }}>这个操作没有入参。</div>`}
    ${params.map((p) => html`<${Field} key=${p.key} label=${p.label} required=${p.required} layout="horizontal" error=${tried ? errors[p.key] : ''}>
      ${p.control === '开关'
        ? html`<${Switch} checked=${Boolean(values[p.key])} onChange=${setV(p.key)} />`
        : p.control === '下拉单选'
          ? html`<${Select} value=${values[p.key] || null} onChange=${setV(p.key)} options=${(p.options || []).map((o) => ({ value: o, label: o }))} invalid=${tried && Boolean(errors[p.key])} />`
          : p.control === '代码'
            ? html`<${Textarea} mono rows=${3} value=${values[p.key]} onChange=${setV(p.key)} placeholder="{ }" invalid=${tried && Boolean(errors[p.key])} />`
            : html`<${Input} value=${values[p.key]} onChange=${setV(p.key)} invalid=${tried && Boolean(errors[p.key])} placeholder=${p.type === 'number' ? '数字' : ''} />`}
    <//>`)}
    ${needConn && html`<${Field} label="选择连接" required layout="horizontal" error=${tried ? connErr : ''}>
      ${conns.length
        ? html`<${Select} value=${connId} onChange=${setConnId} options=${conns.map((c) => ({ value: c.id, label: c.name, desc: CONN_STATUS[c.status] ? CONN_STATUS[c.status].label : c.status }))} invalid=${tried && Boolean(connErr)} />`
        : html`<div className="text-xs muted" style=${{ paddingTop: 6 }}>还没有这个连接器的连接，<${Link} className="link" to="/connections">去新建连接<//></div>`}
    <//>`}
    <div className="row" style=${{ margin: '8px 0 20px' }}>
      <${Button} variant="primary" icon="Play" loading=${running} onClick=${run}>调试<//>
      ${result && html`<${Button} icon="Save" onClick=${saveRecord}>保存本条记录<//>`}
      ${result && html`<${Tag} tone=${result.ok ? 'success' : 'danger'}>${result.ok ? `${result.status} OK` : result.status ? `${result.status} 失败` : '请求失败'} · ${result.duration} ms<//>`}
    </div>
    ${result && html`<${Fragment}>
      <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'req', label: '请求' }, { value: 'resp', label: '响应' }, { value: 'log', label: 'HTTP 日志' }]} />
      <div style=${{ marginTop: 12 }}>
        ${tab === 'req' && html`<${CodeBlock} code=${result.request} />`}
        ${tab === 'resp' && html`<div className="card" style=${{ padding: 8 }}><div className="json"><${JsonView} value=${result.response} /></div></div>`}
        ${tab === 'log' && html`<${CodeBlock} code=${result.log} />`}
      </div>
    <//>`}
    <div className="section-title devkit-sub-title" style=${{ marginTop: 24 }}>调试记录</div>
    ${records.length === 0
      ? html`<div className="text-xs muted">保存的调试记录会出现在这里，可以一键载入当时的参数。</div>`
      : html`<div className="devkit-records">${records.map((r) => html`<div key=${r.id} className="devkit-record">
        <${Dot} tone=${r.ok ? 'success' : 'danger'} />
        <span className="grow">${fmt.dateTime(r.at)}</span>
        <span className="text-xs muted">${r.status || '-'} · ${r.duration} ms</span>
        <${Button} size="xs" variant="ghost" onClick=${() => { setValues({ ...values, ...r.values }); setTried(false); toast.success('已载入这条记录的参数'); }}>载入参数<//>
      </div>`)}</div>`}
  <//>`;
}

function DevkitTrigger({ cc, trig, patch, patchTrig }) {
  const [tab, setTab] = useState('basic');
  const change = devkitChanges(cc).find((c) => c.kind === 'trigger' && c.ref === trig.id);
  const published = devkitPublishedTrigs(cc).includes(trig.key);
  const cfg = devkitTrigCfg(trig);
  const removeTrig = async () => {
    if (!(await confirmDialog({ title: `删除触发器「${trig.name}」？`, content: published ? '触发器已包含在已发布的版本里。删除会作为变更出现在下次发布中，并且只能发布为新版本。' : '触发器还没有发布过，删除后不可恢复。', danger: true, okText: '删除' }))) return;
    patch((item) => {
      const cur = item.triggers.find((t) => t.id === trig.id);
      const pub = cur && devkitPublishedTrigs(item).includes(cur.key);
      return {
        triggers: item.triggers.filter((t) => t.id !== trig.id),
        removed: pub ? [...(item.removed || []), { id: uid('rm'), kind: 'trigger', key: cur.key, name: cur.name, def: cur.baseline || devkitTrigDef(cur), createdAt: cur.createdAt, at: Date.now() }] : item.removed || [],
      };
    });
    toast.success('触发器已删除');
    navigate(`/devkit/${cc.id}/basic`);
  };
  const endpoint = (label, ep, required, desc) => html`<div className="devkit-endpoint">
    <div className="row"><b>${label}</b><${Tag} size="sm">${required ? '必需' : ep.enabled ? '已启用' : '未启用'}<//></div>
    <div className="text-xs muted">${desc}</div>
    ${ep.enabled && html`<div className="row" style=${{ marginTop: 6 }}><span className=${cx('method-tag', `m-${ep.method.toLowerCase()}`)}>${ep.method}</span><span className="mono">${cc.baseUrl || ''}${ep.path}</span></div>`}
  </div>`;
  return html`<div className="page devkit-page"><div className="page-inner">
    <div className="row" style=${{ marginBottom: 12 }}>
      <${Icon} name="Zap" size=${18} className="muted" />
      <h1 className="page-title devkit-op-title">${trig.name}</h1>
      <span className="mono text-xs muted">${trig.key}</span>
      <${Tag} size="sm">${trig.type === 'webhook' ? '即时触发器' : '轮询触发器'}<//>
      ${change && html`<${Tag} size="sm" tone=${change.change === 'add' ? 'success' : 'warning'}>${change.change === 'add' ? '未发布' : '有未发布的修改'}<//>`}
      <span className="spacer" />
      <${MoreMenu} size="md" items=${[{ label: '删除触发器', icon: 'Trash2', danger: true, onClick: removeTrig }]} />
    </div>
    <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'basic', label: '基本信息' }, { value: 'settings', label: '设置表单', count: (trig.settings || []).length }, { value: 'output', label: '出参' }, { value: 'config', label: '触发配置' }]} />
    <div style=${{ marginTop: 16 }}>
      ${tab === 'basic' && html`<${DevkitEditCard}
        title="基本信息"
        init=${() => ({ name: trig.name, desc: trig.desc || '' })}
        validate=${(d) => ({ name: d.name.trim() ? '' : '请填写触发器名称' })}
        onSave=${(d) => patchTrig(trig.id, { name: d.name.trim(), desc: d.desc.trim() })}
        form=${({ draft, set, errors }) => html`<${Fragment}>
          <${Field} label="触发器名称" required error=${errors.name}><${DevkitCharInput} value=${draft.name} onChange=${set('name')} max=${30} invalid=${Boolean(errors.name)} /><//>
          <${Field} label="唯一标识" hint="创建后不可修改"><${Input} mono value=${trig.key} readOnly /><//>
          <${Field} label="说明"><${DevkitCharTextarea} value=${draft.desc} onChange=${set('desc')} max=${100} rows=${2} /><//>
        <//>`}
      >
        <div className="kv">
          <div><span>触发器名称</span><span>${trig.name}</span></div>
          <div><span>唯一标识</span><span className="mono">${trig.key}</span></div>
          <div><span>说明</span><span className=${trig.desc ? '' : 'muted'}>${trig.desc || '未填写'}</span></div>
        </div>
      <//>`}
      ${tab === 'settings' && html`<${DevkitParamsTable} title="设置表单" hint=${html`<span>用户在工作流里配置触发器时填写，接口中用 <span className="mono">{{settings.字段标识}}</span> 引用。</span>`} params=${trig.settings || []} actions=${cc.actions} onChange=${(next) => patchTrig(trig.id, { settings: next })} />`}
      ${tab === 'output' && html`<${DevkitSampleEditor} value=${trig.sample} onSave=${(v) => patchTrig(trig.id, { sample: v })} />`}
      ${tab === 'config' && html`<${DevkitEditCard}
        title="触发配置"
        init=${() => ({ type: trig.type, ...devkitTrigCfg(trig) })}
        validate=${(d) => {
          const w = d.webhook;
          const p = d.polling;
          const n = Number(p.interval);
          const start = Number(p.startPage);
          return d.type === 'webhook'
            ? {
              subscribe: w.subscribe.enabled && !String(w.subscribe.path).startsWith('/') ? '路径需要以 / 开头' : '',
              unsubscribe: w.unsubscribe.enabled && !String(w.unsubscribe.path).startsWith('/') ? '路径需要以 / 开头' : '',
              handle: !String(w.handle).trim() ? '请填写出参转换规则' : devkitJsonError(w.handle) ? '转换规则不是有效的 JSON' : '',
            }
            : {
              path: !String(p.path).startsWith('/') ? '路径需要以 / 开头' : '',
              interval: !(Number.isInteger(n) && n >= 1 && n <= 1440) ? '填写 1 到 1440 之间的整数' : '',
              startPage: p.paging === 'page' && !(Number.isInteger(start) && start >= 0) ? '填写不小于 0 的整数' : '',
              cursorPath: p.paging === 'cursor' && !String(p.cursorPath).trim() ? '请填写游标路径' : '',
              hasMorePath: p.paging !== 'none' && !String(p.hasMorePath).trim() ? '请填写判断是否有下一页的路径' : '',
              listPath: !String(p.listPath).trim() ? '请填写主数据路径' : '',
              dedupKey: !String(p.dedupKey).trim() ? '请填写去重唯一标识' : '',
            };
        }}
        onSave=${(d) => patchTrig(trig.id, { type: d.type, config: { webhook: d.webhook, polling: { ...d.polling, interval: String(Number(d.polling.interval)) } } })}
        form=${({ draft, setDraft, errors }) => {
          const setEp = (ep, k) => (v) => setDraft((x) => ({ ...x, webhook: { ...x.webhook, [ep]: { ...x.webhook[ep], [k]: v } } }));
          const setW = (k) => (v) => setDraft((x) => ({ ...x, webhook: { ...x.webhook, [k]: v } }));
          const setP = (k) => (v) => setDraft((x) => ({ ...x, polling: { ...x.polling, [k]: v } }));
          const epForm = (ep, label, desc) => html`<div className="devkit-endpoint">
            <div className="row"><b>${label}</b><span className="spacer" /><span className="text-xs muted">启用</span><${Switch} checked=${draft.webhook[ep].enabled} onChange=${setEp(ep, 'enabled')} /></div>
            <div className="text-xs muted" style=${{ margin: '2px 0 8px' }}>${desc}</div>
            ${draft.webhook[ep].enabled && html`<${Field} error=${errors[ep]}><div className="devkit-url-row"><${Select} width=${110} value=${draft.webhook[ep].method} onChange=${setEp(ep, 'method')} options=${DEVKIT_METHODS.map((m) => ({ value: m, label: m }))} /><${Input} mono value=${draft.webhook[ep].path} onChange=${setEp(ep, 'path')} invalid=${Boolean(errors[ep])} style=${{ flex: 1 }} /></div><//>`}
          </div>`;
          return html`<${Fragment}>
            <${Field} label="触发器类型"><${RadioCards} columns=${2} value=${draft.type} onChange=${(v) => setDraft((x) => ({ ...x, type: v }))} options=${[{ value: 'webhook', label: '即时触发器', desc: '服务方主动推送事件，实时触发', icon: 'Zap' }, { value: 'polling', label: '轮询触发器', desc: '平台定期调用接口检查新数据', icon: 'RefreshCw' }]} /><//>
            ${draft.type === 'webhook'
              ? html`<${Fragment}>
                ${epForm('subscribe', '订阅端点', '工作流启用时调用，把平台的回调地址注册到服务方，回调地址用 {{webhookUrl}} 引用')}
                ${epForm('unsubscribe', '取消订阅端点', '工作流停用时调用，注销回调')}
                <${Field} label="执行端点" required hint="收到推送后执行，把原始事件转换成出参。{{event.x}} 引用推送的数据" error=${errors.handle}><${CodeEditor} light rows=${6} value=${draft.webhook.handle} onChange=${setW('handle')} label="执行端点转换规则" /><//>
              <//>`
              : html`<${Fragment}>
                <div className="form-grid">
                  <${Field} label="请求" required error=${errors.path}><div className="devkit-url-row"><${Select} width=${100} value=${draft.polling.method} onChange=${setP('method')} options=${['GET', 'POST'].map((m) => ({ value: m, label: m }))} /><${Input} mono value=${draft.polling.path} onChange=${setP('path')} invalid=${Boolean(errors.path)} style=${{ flex: 1 }} /></div><//>
                  <${Field} label="轮询间隔" required error=${errors.interval}><${Input} value=${draft.polling.interval} onChange=${setP('interval')} suffix="分钟" invalid=${Boolean(errors.interval)} /><//>
                  <${Field} label="分页规则"><${Select} value=${draft.polling.paging} onChange=${setP('paging')} options=${[{ value: 'none', label: '不分页' }, { value: 'page', label: '页码' }, { value: 'cursor', label: '游标' }]} /><//>
                  ${draft.polling.paging === 'page' && html`<${Field} label="起始页码" required error=${errors.startPage}><${Input} value=${draft.polling.startPage} onChange=${setP('startPage')} invalid=${Boolean(errors.startPage)} /><//>`}
                  ${draft.polling.paging === 'cursor' && html`<${Field} label="游标路径" required error=${errors.cursorPath}><${Input} mono value=${draft.polling.cursorPath} onChange=${setP('cursorPath')} invalid=${Boolean(errors.cursorPath)} /><//>`}
                  ${draft.polling.paging !== 'none' && html`<${Field} label="是否有下一页" required error=${errors.hasMorePath}><${Input} mono value=${draft.polling.hasMorePath} onChange=${setP('hasMorePath')} invalid=${Boolean(errors.hasMorePath)} /><//>`}
                  <${Field} label="排序规则"><${Select} value=${draft.polling.sort} onChange=${setP('sort')} options=${[{ value: 'asc', label: '按更新时间正序' }, { value: 'desc', label: '按更新时间倒序' }]} /><//>
                  <${Field} label="主数据路径" required error=${errors.listPath}><${Input} mono value=${draft.polling.listPath} onChange=${setP('listPath')} invalid=${Boolean(errors.listPath)} /><//>
                  <${Field} label="去重唯一标识" required error=${errors.dedupKey}><${Input} mono value=${draft.polling.dedupKey} onChange=${setP('dedupKey')} invalid=${Boolean(errors.dedupKey)} /><//>
                </div>
                <${Field} label="检查点变量" hint="每次轮询结束后保存，下次轮询从这里继续，接口中用 {{checkpoint.x}} 引用"><${Input} mono value=${draft.polling.checkpoint} onChange=${setP('checkpoint')} /><//>
              <//>`}
          <//>`;
        }}
      >
        ${trig.type === 'webhook'
          ? html`<div className="col" style=${{ gap: 10 }}>
            ${endpoint('订阅端点', cfg.webhook.subscribe, false, '工作流启用时调用，把平台的回调地址注册到服务方')}
            ${endpoint('取消订阅端点', cfg.webhook.unsubscribe, false, '工作流停用时调用，注销回调')}
            <div className="devkit-endpoint"><div className="row"><b>执行端点</b><${Tag} size="sm">必需<//></div><div className="text-xs muted">收到推送后执行，把原始事件转换成出参</div><div style=${{ marginTop: 6 }}><${CodeBlock} code=${cfg.webhook.handle} /></div></div>
          </div>`
          : html`<div className="kv">
            <div><span>请求</span><span className="row-4"><span className=${cx('method-tag', `m-${cfg.polling.method.toLowerCase()}`)}>${cfg.polling.method}</span><span className="mono">${cc.baseUrl || ''}${cfg.polling.path}</span></span></div>
            <div><span>轮询间隔</span><span>每 ${cfg.polling.interval} 分钟</span></div>
            <div><span>分页规则</span><span>${cfg.polling.paging === 'none' ? '不分页' : cfg.polling.paging === 'page' ? `页码，从第 ${cfg.polling.startPage} 页开始` : `游标 ${cfg.polling.cursorPath}`}</span></div>
            ${cfg.polling.paging !== 'none' && html`<div><span>是否有下一页</span><span className="mono">${cfg.polling.hasMorePath}</span></div>`}
            <div><span>排序规则</span><span>${cfg.polling.sort === 'asc' ? '按更新时间正序' : '按更新时间倒序'}</span></div>
            <div><span>主数据路径</span><span className="mono">${cfg.polling.listPath}</span></div>
            <div><span>去重唯一标识</span><span className="mono">${cfg.polling.dedupKey}</span></div>
            <div><span>检查点变量</span><span className="mono">${cfg.polling.checkpoint || '-'}</span></div>
          </div>`}
      <//>`}
    </div>
  </div></div>`;
}

function DevkitVersions({ cc, patch }) {
  const state = useStore();
  const [detail, setDetail] = useState(null);
  const [grayEdit, setGrayEdit] = useState(null);
  const changes = devkitChanges(cc);
  const usage = devkitUsage(state, cc);
  const versions = cc.versions;
  const live = versions.filter((v) => v.status !== 'deprecated');
  const projectName = (pid) => (state.projects.find((p) => p.id === pid) || { name: '已删除的项目' }).name;
  const setStatus = (version, status, extra) => patch((item) => {
    const next = item.versions.map((v) => (v.version === version ? { ...v, status, ...(extra || {}) } : v));
    return { versions: next, ...devkitReleaseState(next, item.version) };
  });
  const act = async (v, kind) => {
    const inUse = usage.byVersion(v.version);
    const texts = {
      promote: { title: `全量发布 ${v.version}？`, content: '全量发布后，所有项目新添加的节点默认使用这个版本；已有节点不受影响。', ok: '全量发布', status: 'released', audit: '全量发布自定义连接器版本', toast: `${v.version} 已全量发布` },
      stopGray: { title: `停止 ${v.version} 的灰度？`, content: '停止灰度后这个版本变为「停止支持」，已切换到它的节点会提示升级。', ok: '停止灰度', status: 'deprecated', audit: '停止自定义连接器灰度', toast: `${v.version} 已停止灰度` },
      deprecate: { title: `停止支持 ${v.version}？`, content: `${inUse ? `有 ${inUse} 个工作流节点在使用这个版本，停止支持后会提示它们升级。` : '目前没有工作流节点在使用这个版本。'}${live.length === 1 ? '这是最后一个可用版本，停止支持后连接器会下线，不能再添加到工作流里。' : ''}`, ok: '停止支持', status: 'deprecated', audit: '停止支持自定义连接器版本', toast: `${v.version} 已停止支持`, danger: true },
      restore: { title: `恢复支持 ${v.version}？`, content: '恢复后这个版本重新变为「全量发布」，节点可以继续使用。', ok: '恢复支持', status: 'released', audit: '恢复支持自定义连接器版本', toast: `${v.version} 已恢复支持` },
    }[kind];
    if (!(await confirmDialog({ title: texts.title, content: texts.content, okText: texts.ok, danger: texts.danger }))) return;
    setStatus(v.version, texts.status, texts.status === 'released' ? { grayProjects: undefined } : null);
    addAudit(texts.audit, `${cc.name} ${v.version}`, null);
    toast.success(texts.toast);
  };
  const actions = (v) => {
    if (v.status === 'gray') {
      return [
        { key: 'promote', label: '全量发布', onClick: () => act(v, 'promote') },
        { key: 'stop', label: '停止灰度', onClick: () => act(v, 'stopGray') },
      ];
    }
    if (v.status === 'released') return [{ key: 'deprecate', label: '停止支持', onClick: () => act(v, 'deprecate') }];
    return [{ key: 'restore', label: '恢复支持', onClick: () => act(v, 'restore') }];
  };
  const scope = devkitScope(cc);
  return html`<div className="page devkit-page"><div className="page-inner">
    <${PageHeader} title="版本与发布" description="发布后，工作流中的节点可以切换到新版本；停止支持的版本会在节点面板中提示升级" actions=${html`<${Button} variant="primary" icon="CloudUpload" onClick=${() => navigate(`/devkit/${cc.id}/publish`)}>发布${changes.length ? `（${changes.length} 项变更）` : ''}<//>`} />
    <div className="devkit-summary">
      <div><span className="text-xs muted">当前版本</span><b>${cc.status === 'draft' ? '未发布' : `v${cc.version}`}</b></div>
      <div><span className="text-xs muted">状态</span>${devkitStatusTag(cc)}</div>
      <div><span className="text-xs muted">待发布变更</span><b>${changes.length} 项</b></div>
      <div><span className="text-xs muted">使用中</span><b>${usage.workflows} 个工作流 · ${usage.nodes} 个节点</b></div>
    </div>
    <${Table}
      rowKey="version"
      onRowClick=${(v) => setDetail(v.version)}
      columns=${[
        { key: 'v', title: '版本号', width: 110, render: (v, i) => html`<span className="row-4"><b>${v.version}</b>${i === 0 && html`<${Tag} size="sm" tone="primary">最新<//>`}</span>` },
        { key: 's', title: '状态', width: 170, render: (v) => html`<div className="devkit-param-cell"><span><${Tag} size="sm" tone=${VERSION_STATUS[v.status || 'released'].tone} dot>${VERSION_STATUS[v.status || 'released'].label}<//></span>${v.status === 'gray' && html`<span className="text-xs muted devkit-gray-line" onClick=${(e) => e.stopPropagation()}><span className="ellipsis">灰度：${(v.grayProjects || []).map(projectName).join('、') || '未设置'}</span><a className="link" role="button" tabIndex=${0} onClick=${() => setGrayEdit(v)} onKeyDown=${(e) => { if (e.key === 'Enter') setGrayEdit(v); }}>调整</a></span>`}</div>` },
        { key: 'n', title: '发布说明', wrap: true, render: (v) => html`<div>${v.note || '-'}${(v.updates || []).length > 0 && html`<div className="text-xs muted">在此版本内更新过 ${v.updates.length} 次</div>`}</div>` },
        { key: 't', title: '发布时间', width: 160, render: (v) => fmt.dateTime(v.publishedAt) },
        { key: 'p', title: '发布人', width: 80, render: (v) => personName(v.publisher) },
        { key: 'o', title: '操作', width: 140, render: (v) => html`<span className="row devkit-row-links" onClick=${(e) => e.stopPropagation()}>${actions(v).map((a) => html`<a key=${a.key} className="link" role="button" tabIndex=${0} onClick=${a.onClick} onKeyDown=${(e) => { if (e.key === 'Enter') a.onClick(); }}>${a.label}</a>`)}</span>` },
      ]}
      data=${versions}
      empty=${html`<${Empty} icon="GitBranch" title="还没有发布过版本" description="配置好基础信息、认证和至少一个操作后就可以发布。" action=${html`<${Button} variant="primary" onClick=${() => navigate(`/devkit/${cc.id}/publish`)}>发布<//>`} />`}
    />
    <div className="section devkit-market">
      <${Card} title="本企业连接器市场" icon="Store">
        ${cc.status === 'published'
          ? html`<div className="row"><${Tag} size="sm" tone="success" dot>已展示<//><span className="text-xs muted grow">${scope.label === '全部成员' ? '企业内所有成员' : `${scope.label}（${scope.list.join('、')}）`}可以在连接器市场找到并在工作流中使用。</span><${Button} size="sm" icon="ExternalLink" onClick=${() => navigate(`/connectors/${cc.id}`)}>在市场中查看<//></div>`
          : html`<div className="row"><${Tag} size="sm" dot>${cc.status === 'offline' ? '已下线' : '未展示'}<//><span className="text-xs muted">${cc.status === 'offline' ? '所有版本都已停止支持，恢复一个版本后会重新展示。' : '发布第一个版本后，连接器会出现在本企业的连接器市场，按「可用范围」控制谁能使用。'}</span></div>`}
      <//>
      <${Card} title="连接器仓库" icon="Globe">
        <div className="row">
          ${sysServiceStatus('registry', Store.get()) === 'ok'
            ? html`<${Tag} size="sm" tone="success" dot>已启用<//>`
            : html`<${Tag} size="sm" dot>${sysServiceStatus('registry', Store.get()) === 'off' ? '未启用' : '无法连接'}<//>`}
          <span className="text-xs muted grow">${sysServiceSummary('registry', Store.get())}。平台从这里获取和更新官方连接器；自建连接器只在本企业内公开，不会提交到外部仓库。</span>
          <${Button} size="sm" onClick=${() => navigate('/admin/system?tab=services')}>仓库设置<//>
        </div>
      <//>
    </div>
    <${DevkitVersionDrawer} cc=${cc} version=${detail} usage=${usage} projectName=${projectName} onClose=${() => setDetail(null)} />
    <${DevkitGrayModal} open=${Boolean(grayEdit)} version=${grayEdit} onClose=${() => setGrayEdit(null)} onSave=${(ids) => { setStatus(grayEdit.version, 'gray', { grayProjects: ids }); addAudit('调整自定义连接器灰度范围', `${cc.name} ${grayEdit.version}`, null); toast.success('灰度范围已更新'); setGrayEdit(null); }} />
  </div></div>`;
}

function DevkitVersionDrawer({ cc, version, usage, projectName, onClose }) {
  const v = cc.versions.find((x) => x.version === version);
  const opName = (key) => {
    const cur = cc.actions.find((a) => a.key === key);
    const gone = (cc.removed || []).find((r) => r.kind === 'action' && r.key === key);
    return cur ? cur.name : gone ? gone.name : key;
  };
  const trigKeys = v ? v.triggerKeys || (v === cc.versions[0] ? devkitPublishedTrigs(cc) : null) : null;
  return html`<${Drawer} open=${Boolean(v)} onClose=${onClose} className="devkit-modal" title=${v ? `版本 ${v.version}` : ''} subtitle=${v ? `${personName(v.publisher)} 发布于 ${fmt.dateTime(v.publishedAt)}` : ''} width=${520}>
    ${v && html`<${Fragment}>
      <div className="kv">
        <div><span>状态</span><span><${Tag} size="sm" tone=${VERSION_STATUS[v.status || 'released'].tone} dot>${VERSION_STATUS[v.status || 'released'].label}<//></span></div>
        ${v.status === 'gray' && html`<div><span>灰度范围</span><span>${(v.grayProjects || []).map(projectName).join('、') || '未设置'}</span></div>`}
        <div><span>发布说明</span><span>${v.note || '-'}</span></div>
        <div><span>使用节点</span><span>${usage.byVersion(v.version)} 个</span></div>
      </div>
      <div className="section-title devkit-sub-title" style=${{ marginTop: 20 }}>包含的操作（${(v.snapshot || []).length}）</div>
      <div className="devkit-records">${(v.snapshot || []).map((k) => html`<div key=${k} className="devkit-record"><span className="grow">${opName(k)}</span><span className="mono text-xs muted">${k}</span></div>`)}</div>
      ${trigKeys && html`<${Fragment}>
        <div className="section-title devkit-sub-title" style=${{ marginTop: 20 }}>包含的触发器（${trigKeys.length}）</div>
        ${trigKeys.length ? html`<div className="devkit-records">${trigKeys.map((k) => html`<div key=${k} className="devkit-record"><span className="grow">${(cc.triggers.find((t) => t.key === k) || { name: k }).name}</span><span className="mono text-xs muted">${k}</span></div>`)}</div>` : html`<div className="text-xs muted">没有触发器</div>`}
      <//>`}
      ${(v.updates || []).length > 0 && html`<${Fragment}>
        <div className="section-title devkit-sub-title" style=${{ marginTop: 20 }}>版本内更新</div>
        <div className="devkit-records">${v.updates.map((u) => html`<div key=${u.id} className="devkit-record is-block"><div className="row"><b className="grow">${u.note}</b><span className="text-xs muted">${personName(u.publisher)} · ${fmt.dateTime(u.at)}</span></div></div>`)}</div>
      <//>`}
    <//>`}
  <//>`;
}

function DevkitGrayModal({ open, version, onClose, onSave }) {
  const state = useStore();
  const [ids, setIds] = useState([]);
  useEffect(() => { if (open && version) setIds(version.grayProjects || []); }, [open]);
  return html`<${Modal} open=${open} onClose=${onClose} className="devkit-modal" title=${version ? `调整 ${version.version} 的灰度范围` : ''} width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!ids.length} onClick=${() => onSave(ids)}>保存<//><//>`}>
    <${Field} label="灰度项目" required hint="这些项目新添加的节点默认使用灰度版本，其他项目仍使用当前的全量版本" error=${ids.length ? '' : '至少选择一个项目'}>
      <${Select} multiple value=${ids} onChange=${setIds} placeholder="选择项目" invalid=${!ids.length} options=${state.projects.map((p) => ({ value: p.id, label: p.name }))} />
    <//>
  <//>`;
}

function DevkitDiffView({ change }) {
  const before = change.before ? JSON.stringify(change.before, null, 2) : '';
  const after = change.after ? JSON.stringify(change.after, null, 2) : '';
  const diff = devkitLineDiff(before, after);
  const fields = devkitChangedFields(change.before, change.after);
  const pane = (lines, empty, cls) => html`<div className=${cx('devkit-diff-pane', cls)}>${lines.length ? lines.map((l, i) => html`<div key=${i} className=${cx('devkit-diff-line', l.kind === 'add' && 'is-add', l.kind === 'del' && 'is-del')}>${l.text || ' '}</div>`) : html`<div className="devkit-diff-empty">${empty}</div>`}</div>`;
  return html`<${Fragment}>
    <div className="row" style=${{ marginBottom: 12 }}>
      <span className="section-title">${change.name}</span>
      <${Tag} size="sm" tone=${DEVKIT_CHANGE[change.change].tone}>${DEVKIT_CHANGE[change.change].label}<//>
      <span className="text-xs muted">${DEVKIT_KIND[change.kind]}${change.kind !== 'base' ? ` · ${change.key}` : ''}</span>
    </div>
    ${fields.length > 0 && html`<div className="text-xs muted" style=${{ marginBottom: 10 }}>变更内容：${fields.join('、')}</div>`}
    <div className="diff-grid">
      <div><div className="diff-head">变更前（最新发布版本）</div>${pane(diff.left, '（不存在）', 'is-before')}</div>
      <div><div className="diff-head">变更后（当前草稿）</div>${pane(diff.right, '（已删除）', 'is-after')}</div>
    </div>
  <//>`;
}

function DevkitPublish({ cc, patch }) {
  const state = useStore();
  const changes = devkitChanges(cc);
  const issues = devkitPublishIssues(cc);
  const latest = cc.versions[0] || null;
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(() => changes.map((c) => c.id));
  const [sel, setSel] = useState(() => (changes[0] ? changes[0].id : null));
  const [type, setType] = useState('new');
  const [mode, setMode] = useState('full');
  const [grayProjects, setGrayProjects] = useState([]);
  const suggest = latest ? (() => { const [a, b] = latest.version.split('.').map(Number); return `${a}.${(b || 0) + 1}`; })() : '1.0';
  const [ver, setVer] = useState(suggest);
  const [note, setNote] = useState('');
  const chosen = changes.filter((c) => picked.includes(c.id));
  const hasRemove = chosen.some((c) => c.change === 'remove');
  const canPatch = Boolean(latest && latest.status !== 'deprecated' && cc.status === 'published' && !hasRemove);
  const patchReason = !latest ? '还没有发布过版本，第一次发布只能发布新版本' : latest.status === 'deprecated' || cc.status !== 'published' ? `当前版本 ${latest.version} 已停止支持` : hasRemove ? '本次包含删除，只能作为新版本发布' : '';
  const kind = canPatch ? type : 'new';
  const maxVersion = cc.versions.reduce((m, v) => (devkitVersionCmp(v.version, m) > 0 ? v.version : m), '0.0.0');
  const verErr = kind !== 'new' ? '' : !/^\d{1,3}\.\d{1,3}$/.test(ver.trim()) ? '格式为「主版本.次版本」，例如 1.3' : devkitVersionCmp(`${ver.trim()}.0`, maxVersion) <= 0 ? `需要大于已发布的最高版本 ${maxVersion}` : '';
  const grayErr = kind === 'new' && mode === 'gray' && !grayProjects.length ? '至少选择一个灰度项目' : '';
  const noteErr = note.trim() ? '' : '请填写版本描述';
  const [noteTouched, setNoteTouched] = useState(false);
  const exit = () => navigate(`/devkit/${cc.id}/versions`);
  const selected = changes.find((c) => c.id === sel) || changes.find((c) => picked.includes(c.id)) || changes[0];
  const canNext = !issues.length && chosen.length > 0;
  const blockNext = issues.length ? '先处理发布前检查中的问题' : !chosen.length ? '至少选择一项变更' : '';
  const blockPublish = blockNext || verErr || grayErr || noteErr;
  const publish = () => {
    if (blockPublish) return;
    const pickedRefs = new Set(chosen.map((c) => c.id));
    const now = Date.now();
    const version = kind === 'new' ? `${ver.trim()}.0` : latest.version;
    patch((item) => {
      const cur = devkitChanges(item).filter((c) => pickedRefs.has(c.id));
      const opKeys = devkitPublishedOps(item);
      const trigKeys = devkitPublishedTrigs(item);
      const addOps = cur.filter((c) => c.kind === 'action' && c.change === 'add').map((c) => c.key);
      const rmOps = cur.filter((c) => c.kind === 'action' && c.change === 'remove').map((c) => c.key);
      const addTrigs = cur.filter((c) => c.kind === 'trigger' && c.change === 'add').map((c) => c.key);
      const rmTrigs = cur.filter((c) => c.kind === 'trigger' && c.change === 'remove').map((c) => c.key);
      const snapshotSet = new Set([...opKeys.filter((k) => !rmOps.includes(k)), ...addOps]);
      const trigSet = new Set([...trigKeys.filter((k) => !rmTrigs.includes(k)), ...addTrigs]);
      const snapshot = [...item.actions.map((a) => a.key).filter((k) => snapshotSet.has(k)), ...[...snapshotSet].filter((k) => !item.actions.some((a) => a.key === k))];
      const triggerKeys = [...item.triggers.map((t) => t.key).filter((k) => trigSet.has(k)), ...[...trigSet].filter((k) => !item.triggers.some((t) => t.key === k))];
      const doneRefs = new Set(cur.map((c) => c.ref));
      const versions = kind === 'new'
        ? [{ version, status: mode === 'gray' ? 'gray' : 'released', publishedAt: now, publisher: state.me, note: note.trim(), snapshot, triggerKeys, ...(mode === 'gray' ? { grayProjects } : {}) }, ...item.versions]
        : item.versions.map((v, i) => (i === 0 ? { ...v, snapshot, triggerKeys, updatedAt: now, updates: [{ id: uid('up'), at: now, publisher: state.me, note: note.trim() }, ...(v.updates || [])] } : v));
      return {
        actions: item.actions.map((a) => (doneRefs.has(a.id) ? devkitOmit(a, ['baseline']) : a)),
        triggers: item.triggers.map((t) => (doneRefs.has(t.id) ? devkitOmit(t, ['baseline']) : t)),
        removed: (item.removed || []).filter((r) => !doneRefs.has(r.id)),
        pendingBase: doneRefs.has('base') ? undefined : item.pendingBase,
        versions,
        ...devkitReleaseState(versions, item.version),
      };
    });
    addAudit(kind === 'new' ? (mode === 'gray' ? '灰度发布自定义连接器' : '发布自定义连接器') : '在当前版本中发布更新', `${cc.name} ${version}`, null);
    toast.success(kind === 'new' ? (mode === 'gray' ? `${version} 已开始灰度` : `已发布 ${version}`) : `已在 ${version} 中发布更新`);
    navigate(`/devkit/${cc.id}/versions`);
  };
  const groupsOf = [['action', '操作'], ['trigger', '触发器'], ['base', '连接器配置']].map(([k, label]) => ({ k, label, items: changes.filter((c) => c.kind === k) })).filter((g) => g.items.length);
  return html`<div className="publish-full devkit-page">
    <div className="publish-top">
      <${Button} variant="ghost" icon="ArrowLeft" onClick=${exit}>退出发布<//>
      <span className="devkit-top-sep" />
      <${ConnectorIcon} connector=${customAsConnector(cc)} size=${24} />
      <b className="ellipsis devkit-publish-name">发布「${cc.name}」</b>
      <${Tag} size="sm">${latest ? `当前 v${cc.version}` : '首次发布'}<//>
      <div className="devkit-publish-steps"><${Steps} current=${step} onChange=${(i) => { if (i === 0 || canNext) setStep(i); }} items=${[{ title: '确认发布变更' }, { title: '填写发布信息' }]} /></div>
      <span className="spacer" />
      ${step === 0
        ? html`<${Tooltip} content=${changes.length ? blockNext : ''}><${Button} variant="primary" disabled=${!canNext} onClick=${() => setStep(1)}>下一步<//><//>`
        : html`<${Fragment}><${Button} onClick=${() => setStep(0)}>上一步<//><${Tooltip} content=${blockPublish}><${Button} variant="primary" icon="Rocket" disabled=${Boolean(blockPublish)} onClick=${publish}>发布<//><//><//>`}
    </div>
    ${issues.length > 0 && html`<div className="devkit-publish-issues">
      <${Alert} tone="danger" title=${`发布前还需要处理 ${issues.length} 项`}>
        <ul className="devkit-issue-list">${issues.map((it) => html`<li key=${it.id}>${it.text}<${Link} className="link" to=${it.to}>去处理<//></li>`)}</ul>
      <//>
    </div>`}
    ${step === 0
      ? changes.length === 0
        ? html`<div className="devkit-publish-empty"><${Empty} icon="CircleCheck" title="没有需要发布的变更" description=${latest ? `当前草稿和最新版本 ${latest.version} 一致。修改操作、触发器、Base URL 或状态码后再来发布。` : '先新建操作或触发器，再来发布。'} action=${html`<${Button} onClick=${exit}>返回版本与发布<//>`} /></div>`
        : html`<div className="publish-body">
          <div className="publish-list">
            <div className="row devkit-publish-all"><${Checkbox} checked=${picked.length === changes.length} indeterminate=${picked.length > 0 && picked.length < changes.length} onChange=${(v) => setPicked(v ? changes.map((c) => c.id) : [])} label=${`全选（${picked.length}/${changes.length}）`} /></div>
            ${groupsOf.map((g) => html`<div key=${g.k}>
              <div className="devkit-publish-group">${g.label}</div>
              ${g.items.map((c) => html`<div key=${c.id} role="button" tabIndex=${0} className=${cx('publish-item', selected && selected.id === c.id && 'is-active')} onClick=${() => setSel(c.id)} onKeyDown=${(e) => { if (e.key === 'Enter') setSel(c.id); }}>
                <${Checkbox} checked=${picked.includes(c.id)} onChange=${(v) => setPicked(v ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
                <span className="grow devkit-publish-item-text">${c.method && html`<span className=${cx('method-tag', `m-${String(c.method).toLowerCase()}`)}>${c.method}</span>`}<span className="ellipsis">${c.name}</span></span>
                <${Tag} size="sm" tone=${DEVKIT_CHANGE[c.change].tone}>${DEVKIT_CHANGE[c.change].label}<//>
              </div>`)}
            </div>`)}
            ${!chosen.length && html`<div className="text-xs devkit-fail-text" style=${{ padding: '8px 10px' }}>至少选择一项变更</div>`}
            <div className="text-xs muted" style=${{ padding: '8px 10px' }}>没有勾选的变更会保留在草稿里，下次再发布。</div>
          </div>
          <div className="publish-diff">${selected && html`<${DevkitDiffView} change=${selected} />`}</div>
        </div>`
      : html`<div className="publish-form">
        <div className="devkit-publish-summary">本次发布 ${chosen.length} 项变更：${chosen.map((c) => `${DEVKIT_CHANGE[c.change].label}${DEVKIT_KIND[c.kind]}「${c.name}」`).join('，')}</div>
        <${Field} label="发布类型" required>
          <${RadioCards} columns=${2} value=${kind} onChange=${setType} options=${[
            { value: 'new', label: '发布新版本', desc: '节点需要切换到新版本才会使用这些变更' },
            { value: 'patch', label: '在当前版本中发布更新', desc: canPatch ? `直接更新 ${latest.version}，使用这个版本的节点自动生效` : patchReason, disabled: !canPatch },
          ]} />
        <//>
        ${kind === 'new' && html`<${Fragment}>
          <${Field} label="版本号" required hint=${`两位版本号，保存为 ${/^\d{1,3}\.\d{1,3}$/.test(ver.trim()) ? `${ver.trim()}.0` : 'x.y.0'}；已发布的最高版本 ${maxVersion === '0.0.0' ? '无' : maxVersion}`} error=${verErr}><${Input} mono value=${ver} onChange=${setVer} invalid=${Boolean(verErr)} style=${{ width: 180 }} /><//>
          <${Field} label="发布方式">
            <${RadioGroup} value=${mode} onChange=${setMode} options=${[{ value: 'full', label: '全量发布' }, { value: 'gray', label: '灰度发布' }]} />
          <//>
          ${mode === 'gray' && html`<${Field} label="灰度项目" required hint=${`这些项目新添加的节点默认使用 ${ver.trim() || '新版本'}，其他项目仍使用${latest ? ` ${cc.version}` : '现有版本'}`} error=${grayErr}><${Select} multiple value=${grayProjects} onChange=${setGrayProjects} placeholder="选择项目" invalid=${Boolean(grayErr)} options=${state.projects.map((p) => ({ value: p.id, label: p.name }))} /><//>`}
        <//>`}
        <${Field} label="版本描述" required error=${noteTouched ? noteErr : ''} hint="会显示在版本记录和节点面板的版本切换里"><${DevkitCharTextarea} value=${note} onChange=${(v) => { setNote(v); setNoteTouched(true); }} max=${300} rows=${4} placeholder="说明新增或修改了哪些操作" invalid=${noteTouched && Boolean(noteErr)} /><//>
      </div>`}
  </div>`;
}
