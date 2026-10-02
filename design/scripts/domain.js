const connectorById = (id) => CONNECTORS.find((c) => c.id === id);

const customAsConnector = (cc) => ({
  id: cc.id, key: cc.key, name: cc.name, category: 'custom', icon: letter(cc.iconText, cc.iconColor),
  auth: cc.auth && cc.auth.enabled !== false ? cc.auth.type : 'none',
  official: false, custom: true, version: cc.version, desc: cc.description, status: cc.status, owner: cc.owner,
  actions: cc.actions.map((a) => ({ key: a.key, name: a.name, desc: a.desc, group: a.group, params: a.params || [] })),
  triggers: cc.triggers.map((t) => ({ key: t.key, name: t.name, desc: t.desc, type: t.type })),
});

const mcpClientAsConnector = (mc) => ({
  id: mc.id, name: mc.name, category: 'mcp', icon: { type: 'kind', icon: 'Server' }, auth: 'none',
  official: false, custom: false, mcp: true, status: mc.status, version: 'MCP', desc: mc.description,
  actions: (mc.tools || []).map((t) => ({ key: t.name, name: t.title || t.name, desc: t.description, group: 'MCP 工具', params: (t.params || []).map((p) => ({ key: p.key, label: p.label, type: p.type, control: p.type === 'object' ? '代码' : '输入框', required: p.required, source: '输入值' })) })),
  triggers: [],
});

function resolveConnector(id) {
  if (!id) return null;
  const c = connectorById(id);
  if (c) return c;
  const state = Store.get();
  const cc = state && state.customConnectors.find((x) => x.id === id);
  if (cc) return customAsConnector(cc);
  const mc = state && (state.mcpClients || []).find((x) => x.id === id);
  return mc ? mcpClientAsConnector(mc) : null;
}

function mcpConnectors(state, projectId) {
  return (state.mcpClients || []).filter((mc) => mc.status === 'connected' && (mc.scope === 'tenant' || !projectId || (mc.projectIds || []).includes(projectId))).map(mcpClientAsConnector);
}

function publishedCustomConnectors(state) {
  return state.customConnectors.filter((c) => c.status === 'published').map(customAsConnector);
}

function versionLabel(c) {
  if (!c || !c.version) return '-';
  return c.version === '内置' ? '内置' : `v${c.version}`;
}

function connectorVersions(c) {
  if (!c) return [];
  if (c.custom) {
    const cc = Store.get().customConnectors.find((x) => x.id === c.id);
    return ((cc && cc.versions) || []).map((v) => ({ version: v.version, status: v.status || 'released' }));
  }
  if (c.version === '内置') return [{ version: '1.0', status: 'released' }];
  const [major, minor] = String(c.version).split('.').map(Number);
  const older = minor > 0 ? [{ version: `${major}.${minor - 1}.0`, status: 'released' }] : [];
  const oldest = major > 1 ? [{ version: `${major - 1}.0.0`, status: 'deprecated' }] : [];
  return [{ version: c.version, status: 'released' }, ...older, ...oldest];
}

function templateConnectors(tpl) {
  return [...new Set([tpl.trigger.connector, ...tpl.steps.map((s) => s.connector)])];
}

function KindTile({ icon, size, className }) {
  return html`<span className=${cx('cicon', 'is-kind', className)} style=${{ width: size, height: size }}>
    <${Icon} name=${icon} size=${Math.round(size * 0.5)} strokeWidth=${1.75} />
  </span>`;
}

function ConnectorIcon({ id, connector, size = 28, tile = false, className }) {
  const c = connector || resolveConnector(id);
  if (!c) return html`<${KindTile} icon="Puzzle" size=${size} className=${className} />`;
  const ic = c.icon;
  if (ic.type === 'kind') return html`<${KindTile} icon=${ic.icon} size=${size} className=${className} />`;
  if (ic.type === 'img') {
    return html`<span className=${cx('cicon', tile && 'is-tile', className)} style=${{ width: size, height: size }}><img src=${ic.src} alt=${c.name} draggable=${false} /></span>`;
  }
  if (ic.type === 'brand') {
    const b = BRAND_ICONS[ic.key];
    const color = `#${b.hex}`;
    const dark = ['000000', '181717', '191919'].includes(b.hex);
    return html`<span className=${cx('cicon', 'is-tile', className)} style=${{ width: size, height: size, background: `color-mix(in srgb, ${color} 10%, var(--surface))`, borderColor: `color-mix(in srgb, ${color} 18%, transparent)` }}>
      <svg viewBox="0 0 24 24" width=${size * 0.58} height=${size * 0.58} fill=${dark ? 'currentColor' : color} aria-hidden="true"><path d=${b.d} /></svg>
    </span>`;
  }
  return html`<span className=${cx('cicon', 'is-letter', className)} style=${{ width: size, height: size, background: ic.color, fontSize: Math.round(size * 0.44) }} aria-label=${c.name}>${ic.text}</span>`;
}

const KIND_META = {
  branch: { name: '分支', icon: 'Split', ref: 'branch' },
  parallel: { name: '并行分支', icon: 'GitFork', ref: 'branch' },
  loop: { name: '循环', icon: 'Repeat', ref: 'loop' },
  while: { name: 'While 循环', icon: 'RefreshCcw', ref: 'while' },
  delay: { name: '延迟', icon: 'Hourglass', ref: 'delay' },
  end: { name: '终止', icon: 'CircleStop', ref: 'end' },
  code: { name: '动态脚本', icon: 'SquareCode', ref: 'script' },
  variable: { name: '设置变量', icon: 'Variable', ref: 'variable' },
  json: { name: 'JSON 助手', icon: 'Braces', ref: 'json' },
  ai: { name: 'AI 助手', icon: 'Sparkles', ref: 'ai' },
  agent: { name: 'AI 智能体', icon: 'Bot', ref: 'agent' },
};

const kindMeta = (node) => KIND_META[node.kind === 'loop' && node.variant === 'while' ? 'while' : node.kind] || { name: node.kind, icon: 'Box', ref: node.kind };

const HELPER_ICON = Object.fromEntries([...HELPER_NODES, ...LOGIC_NODES].filter((x) => x.connector).map((x) => [x.connector + (x.op ? `.${x.op}` : ''), x.icon]));

function NodeIcon({ node, size = 28 }) {
  if (node.kind === 'trigger' || node.kind === 'action') {
    const c = resolveConnector(node.connector);
    const helper = HELPER_ICON[`${node.connector}.${node.op}`] || (c && c.builtin && HELPER_ICON[node.connector]);
    if (helper) return html`<${KindTile} icon=${helper} size=${size} />`;
    if (node.kind === 'trigger' && c && c.builtin) {
      const t = TRIGGER_TYPES.find((x) => x.connector === node.connector);
      if (t) return html`<${KindTile} icon=${t.icon} size=${size} />`;
    }
    return html`<${ConnectorIcon} id=${node.connector} size=${size} />`;
  }
  return html`<${KindTile} icon=${kindMeta(node).icon} size=${size} />`;
}

function nodeTypeLabel(node) {
  const c = node.connector && resolveConnector(node.connector);
  if (node.kind === 'trigger') {
    if (!c) return '触发器：未选择';
    const o = c.triggers.find((x) => x.key === node.op);
    return `触发器：${o ? o.name : c.name}`;
  }
  if (node.kind === 'action') {
    const o = c && c.actions.find((x) => x.key === node.op);
    return `操作：${o ? o.name : '未选择'}`;
  }
  return kindMeta(node).name;
}

const errorListKey = (id) => `${id}:error`;

function childLists(node) {
  const own = node.branches
    ? node.branches.map((b) => ({ key: b.id, steps: b.steps, kind: 'branch' }))
    : node.kind === 'loop' ? [{ key: node.id, steps: node.steps, kind: 'loop' }] : [];
  return node.errorSteps ? [...own, { key: errorListKey(node.id), steps: node.errorSteps, kind: 'error' }] : own;
}

function mapChildLists(node, fn) {
  const base = node.branches
    ? { ...node, branches: node.branches.map((b) => ({ ...b, steps: fn(b.steps, b.id) })) }
    : node.kind === 'loop' ? { ...node, steps: fn(node.steps, node.id) } : node;
  return node.errorSteps ? { ...base, errorSteps: fn(node.errorSteps, errorListKey(node.id)) } : base;
}

const hasChildren = (node) => childLists(node).length > 0;

function walkNodes(steps, fn, depth = 0) {
  steps.forEach((node) => {
    fn(node, depth);
    childLists(node).forEach((list) => walkNodes(list.steps, fn, depth + 1));
  });
}

function allNodes(wf) {
  const out = [wf.trigger];
  walkNodes(wf.steps, (node) => out.push(node));
  return out;
}

function mapSteps(steps, fn) {
  return steps.map((node) => mapChildLists(fn(node), (list) => mapSteps(list, fn)));
}

function mapGraph(graph, fn) {
  return { ...graph, trigger: fn(graph.trigger), steps: mapSteps(graph.steps, fn) };
}

function refPrefix(node) {
  if (node.kind === 'trigger') return node.connector ? `${node.connector}-trigger` : 'trigger';
  if (node.kind === 'action') return node.connector || 'action';
  return kindMeta(node).ref;
}

function refNumber(ref, prefix) {
  if (typeof ref !== 'string' || !ref.startsWith(`${prefix}-`)) return 0;
  const n = Number(ref.slice(prefix.length + 1));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function withRefs(wf) {
  const top = allNodes(wf).reduce((acc, node) => {
    const p = refPrefix(node);
    return { ...acc, [p]: Math.max(acc[p] || 0, refNumber(node.ref, p)) };
  }, {});
  const next = { ...top };
  const seen = new Set();
  const fix = (node) => {
    const p = refPrefix(node);
    let ref = node.ref;
    if (!refNumber(ref, p) || seen.has(ref)) {
      next[p] = (next[p] || 0) + 1;
      ref = `${p}-${next[p]}`;
    }
    seen.add(ref);
    return ref === node.ref ? node : { ...node, ref };
  };
  return { ...wf, ...mapGraph({ trigger: wf.trigger, steps: wf.steps }, fix) };
}

function nodeRefs(wf) {
  return Object.fromEntries(allNodes(withRefs(wf)).map((node) => [node.id, node.ref]));
}

function workflowConnectors(wf) {
  return [...new Set(allNodes(wf).filter((x) => x.connector).map((x) => x.connector))];
}

function findNode(steps, id) {
  let found = null;
  walkNodes(steps, (node) => { if (node.id === id) found = node; });
  return found;
}

function findInWorkflow(wf, id) {
  return id === wf.trigger.id ? wf.trigger : findNode(wf.steps, id);
}

function insertIntoSteps(steps, target, newNode) {
  const splice = (list) => [...list.slice(0, target.index), newNode, ...list.slice(target.index)];
  if (target.parent === 'root') return splice(steps);
  return steps.map((node) => mapChildLists(node, (list, key) => (key === target.parent && node.id === target.owner ? splice(list) : insertIntoSteps(list, target, newNode))));
}

function locateNode(steps, id, parent = 'root', owner = 'root') {
  for (let i = 0; i < steps.length; i++) {
    const node = steps[i];
    if (node.id === id) return { parent, owner, index: i };
    for (const list of childLists(node)) {
      const r = locateNode(list.steps, id, list.key, node.id);
      if (r) return r;
    }
  }
  return null;
}

function removeFromSteps(steps, id) {
  return steps.filter((node) => node.id !== id).map((node) => mapChildLists(node, (list) => removeFromSteps(list, id)));
}

function updateInSteps(steps, id, patch) {
  return steps.map((node) => {
    if (node.id === id) return { ...node, ...(typeof patch === 'function' ? patch(node) : patch) };
    return mapChildLists(node, (list) => updateInSteps(list, id, patch));
  });
}

function countDescendants(node) {
  return childLists(node).flatMap((list) => list.steps).reduce((acc, x) => acc + 1 + countDescendants(x), 0);
}

function nodeContexts(wf) {
  const visit = (steps, upstream, loops) => {
    let before = upstream;
    return steps.flatMap((node) => {
      const own = [[node.id, { node, upstream: before, loops }]];
      const inner = childLists(node).flatMap((list) => visit(list.steps, [...before, node], list.kind === 'loop' ? [...loops, node] : loops));
      before = [...before, node];
      return [...own, ...inner];
    });
  };
  const base = wf.trigger.connector ? [wf.trigger] : [];
  return Object.fromEntries([[wf.trigger.id, { node: wf.trigger, upstream: [], loops: [] }], ...visit(wf.steps, base, [])]);
}

function upstreamNodes(wf, targetId) {
  const ctx = nodeContexts(wf)[targetId];
  return ctx ? ctx.upstream : [];
}

const REF_TOKEN = /\{\{\s*([^.\s}[\]]+)([^}]*?)\s*\}\}/g;

function collectRefs(value) {
  if (typeof value === 'string') return [...value.matchAll(REF_TOKEN)].map((m) => ({ head: m[1], expr: `${m[1]}${m[2]}` }));
  if (Array.isArray(value)) return value.flatMap(collectRefs);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectRefs);
  return [];
}

function remapRefs(value, idMap) {
  if (typeof value === 'string') return value.replace(REF_TOKEN, (m, head, rest) => (idMap[head] ? `{{${idMap[head]}${rest}}}` : m));
  if (Array.isArray(value)) return value.map((v) => remapRefs(v, idMap));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapRefs(v, idMap)]));
  return value;
}

function dropItemRefs(value) {
  if (typeof value === 'string') return value.replace(/\{\{\s*item(?=[.\s}[])[^}]*\}\}/g, '');
  if (Array.isArray(value)) return value.map(dropItemRefs);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dropItemRefs(v)]));
  return value;
}

function refScope(value) {
  if (Array.isArray(value)) return value.map(refScope);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => k !== '__alt').map(([k, v]) => [k, k === 'each' ? dropItemRefs(v) : refScope(v)]));
  return value;
}

function ownRefs(node) {
  return collectRefs({ config: refScope(node.config || {}), conditions: (node.branches || []).map((b) => b.conditions || []) });
}

function cloneNodes(nodes) {
  const idMap = {};
  const copy = (node) => {
    const id = uid('n');
    idMap[node.id] = id;
    const base = mapChildLists({ ...node, id, ref: null }, (list) => list.map(copy));
    return base.branches ? { ...base, branches: base.branches.map((b) => ({ ...b, id: uid('b') })) } : base;
  };
  const fresh = nodes.map(copy);
  return { nodes: remapRefs(fresh, idMap), idMap };
}

function projectRole(state, pid, userId) {
  const m = state.members.find((x) => x.projectId === pid && x.userId === (userId || state.me));
  return m ? m.role : null;
}

const canEditProject = (state, pid) => ['owner', 'editor'].includes(projectRole(state, pid));
const isProjectOwner = (state, pid) => projectRole(state, pid) === 'owner';

function connAvailableIn(conn, pid) {
  return conn.scope === 'tenant' || (conn.projectIds || []).includes(pid);
}

function connectionPerm(state, conn, userId) {
  const who = userId || state.me;
  if (conn.owner === who) return 'owner';
  const s = (conn.shares || []).find((x) => x.userId === who);
  return s ? s.perm : null;
}

function defaultConnection(state, { connector, projectId }) {
  const testTargets = new Set(projectEnvs(state, projectId).filter((e) => e.key === 'test').flatMap((e) => Object.values(e.connectionMap || {})));
  const list = usableConnections(state, { connector, projectId }).filter((c) => !testTargets.has(c.id));
  const active = list.filter((c) => c.status === 'active');
  if (list.length === 1) return list[0].id;
  return active.length === 1 ? active[0].id : null;
}

function usableConnections(state, { connector, connectors, projectId }) {
  const ids = connectors || [connector];
  return state.connections.filter((c) => ids.includes(c.connector) && connAvailableIn(c, projectId) && connectionPerm(state, c));
}

function connectionIssue(state, connId, projectId) {
  const conn = state.connections.find((x) => x.id === connId);
  if (!conn) return { level: 'error', text: '所选连接已被删除，请重新选择' };
  if (projectId && !connAvailableIn(conn, projectId)) return { level: 'error', text: `连接「${conn.name}」不在本项目的可用范围内` };
  if (!connectionPerm(state, conn)) return { level: 'error', text: `连接「${conn.name}」没有分享给你` };
  if (conn.pending) return { level: 'warning', text: `连接「${conn.name}」尚未完成测试` };
  if (conn.status !== 'active') return { level: 'warning', text: `连接「${conn.name}」${(CONN_STATUS[conn.status] || CONN_STATUS.error).reason}` };
  return null;
}

const FEISHU_SCOPE_OPS = { create_chat: '创建群聊', create_doc: '创建云文档' };

function nodeIssues(node, state, context) {
  const ctx = context || { upstream: [], loops: [], projectId: null };
  const issues = [];
  const push = (level, tab, text, ref) => issues.push({ level, tab, text, ref: Boolean(ref) });
  if (node.kind === 'trigger' && !node.connector) return [{ level: 'error', tab: 'trigger', text: '未选择触发器' }];
  const opTab = node.kind === 'trigger' ? 'trigger' : 'op';
  const refTab = ['branch', 'parallel', 'loop', 'variable', 'delay', 'end'].includes(node.kind) ? 'config' : node.kind === 'trigger' && ['schedule', 'alert'].includes(node.connector) ? 'settings' : 'input';
  if (node.kind === 'trigger' || node.kind === 'action') {
    const c = resolveConnector(node.connector);
    if (!c) return [{ level: 'error', tab: opTab, text: '连接器不存在或已下架' }];
    const opList = node.kind === 'trigger' ? c.triggers : c.actions;
    const opDef = opList.find((x) => x.key === node.op);
    if (!node.op || !opDef) push('error', opTab, node.kind === 'trigger' ? '未选择触发事件' : '未选择操作');
    if (c.mcp && c.status !== 'connected') push('warning', opTab, `MCP 服务器「${c.name}」连接异常，这个节点运行时会失败`);
    if (c.auth !== 'none') {
      if (!node.connectionId) push('error', 'conn', '未选择连接');
      else {
        const ci = connectionIssue(state, node.connectionId, ctx.projectId);
        if (ci) push(ci.level, 'conn', ci.text);
      }
      if (node.connector === 'feishu' && FEISHU_SCOPE_OPS[node.op]) push('warning', 'conn', `飞书应用未开通「${FEISHU_SCOPE_OPS[node.op]}」权限`);
    }
    const required = c.custom || c.mcp
      ? ((opDef && opDef.params) || []).filter((p) => p.required).map((p) => p.key)
      : (OP_FIELDS[`${node.connector}.${node.op}`] || []).filter((k) => FIELD_DEFS[k] && FIELD_DEFS[k].required);
    if (required.some((k) => isBlank(node.config[k]))) push('error', 'input', '入参必填项未填写');
    if (node.connector === 'schedule') {
      const cfg = node.config;
      if (node.op === 'cron' && !cronPreview(cfg.cron).ok) push('error', 'settings', 'Cron 表达式不正确');
      if (node.op !== 'cron' && cfg.mode === '按周触发' && !(cfg.weekdays || []).length) push('error', 'settings', '按周触发至少选择一天');
      if (node.op !== 'cron' && cfg.mode === '仅触发一次' && !cfg.once) push('error', 'settings', '未设置触发时间');
      if (node.op !== 'cron' && !['仅触发一次', '间隔触发'].includes(cfg.mode || '每天触发') && isBlank(cfg.at)) push('error', 'settings', '未设置触发时间');
      if (node.op !== 'cron' && cfg.mode === '间隔触发' && !(Number(cfg.interval) > 0)) push('error', 'settings', '触发间隔需大于 0');
    }
    if (node.connector === 'forms' && !(node.config.fields || []).length) push('error', 'settings', '表单至少需要一个字段');
    const dedupe = node.kind === 'trigger' && node.runSettings && node.runSettings.dedupe;
    if (dedupe && dedupe.enabled) {
      if (isBlank(dedupe.key)) push('error', 'run', '去重已开启，但没有设置去重键');
      else if (collectRefs(dedupe.key).some((r) => r.head !== 'trigger')) push('error', 'run', '去重键只能引用触发器的出参');
    }
    const tables = (state.mappingTables || []).filter((t) => !ctx.projectId || t.projectId === ctx.projectId);
    const sampleOf = (head) => {
      if (head === 'config') return Object.fromEntries(state.variables.filter((v) => v.projectId === ctx.projectId).map((v) => [v.key, (v.values || {}).default]));
      const src = ctx.nodesById && ctx.nodesById[head];
      return src ? nodeOutput(src) : undefined;
    };
    Object.entries(node.config || {}).filter(([, v]) => isMapping(v)).forEach(([k, v]) => {
      const lookups = JSON.stringify(v.$map).match(/"type":"lookup","arg":"([^"]*)"/g) || [];
      lookups.map((x) => x.replace(/.*"arg":"([^"]*)"/, '$1')).filter((id) => !tables.some((t) => t.id === id)).forEach(() => push('error', 'input', '字段映射引用的映射表不存在'));
      const schema = mappingSchema(node, k);
      const result = evalMapping(v.$map, { resolve: sampleOf, tables, schema });
      result.missing.forEach((f) => push('error', 'input', `字段映射缺少必填字段「${f.key}」`));
      if (schema) (v.$map.fields || []).filter((f) => f.target && !schema.some((s) => s.key === f.target)).forEach((f) => push('warning', 'input', `字段映射里的「${f.target}」在目标中不存在`));
      result.rows.filter((r) => r.error && r.error !== '映射表不存在').forEach((r) => push('warning', 'input', `字段映射「${r.target}」按样例数据：${r.error}`));
    });
    if (node.connector === 'alert') {
      if (isBlank(node.config.rule)) push('error', 'settings', '规则名称未填写');
      if (!(node.config.scope || []).length) push('error', 'settings', '未选择需要监控的资源');
    }
  }
  if (node.kind === 'branch') {
    node.branches.filter((b) => !b.isDefault).forEach((b) => {
      if (!(b.conditions || []).length) push('error', 'config', `分支「${b.name}」未配置条件`);
      else if (b.conditions.some((x) => (x.type === 'ai' ? isBlank(x.input) || isBlank(x.prompt) : isBlank(x.left) || (!UNARY_OPS.includes(x.op) && isBlank(x.right))))) push('error', 'config', `分支「${b.name}」的条件未填写完整`);
    });
  }
  if (node.kind === 'loop') {
    if (node.variant === 'while') {
      if (!(node.config.conditions || []).length) push('error', 'config', '未设置循环条件');
      else if (node.config.conditions.some((x) => isBlank(x.left) || (!UNARY_OPS.includes(x.op) && isBlank(x.right)))) push('error', 'config', '循环条件未填写完整');
    } else if (isBlank(node.config.items)) push('error', 'config', '未设置循环列表');
    if (!(Number(node.config.max) > 0)) push('error', 'config', '最大循环次数需大于 0');
  }
  if (node.kind === 'ai') {
    if (!node.config.connectionId) push('error', 'input', '未选择模型连接');
    else {
      const ci = connectionIssue(state, node.config.connectionId, ctx.projectId);
      if (ci) push(ci.level, 'input', ci.text);
    }
    if (isBlank(node.config.prompt)) push('error', 'input', '提示词未填写');
  }
  if (node.kind === 'code') {
    if (isBlank(node.config.code)) push('error', 'input', '代码不能为空');
    const names = (node.config.inputs || []).map((x) => (x.name || '').trim());
    if (names.some((x) => !x)) push('error', 'input', '入参名称不能为空');
    else if (new Set(names).size !== names.length) push('error', 'input', '入参名称重复');
  }
  if (node.kind === 'json' && isBlank(node.config.source)) push('error', 'input', '未设置要转换的数据');
  if (node.kind === 'agent') {
    const cfg = node.config;
    if (!cfg.connectionId) push('error', 'input', '未选择模型连接');
    else {
      const ci = connectionIssue(state, cfg.connectionId, ctx.projectId);
      if (ci) push(ci.level, 'input', ci.text);
    }
    if (isBlank(cfg.instructions)) push('error', 'input', '未填写智能体指令');
    if (!(cfg.tools || []).length) push('error', 'tools', '至少给智能体添加一个工具');
    (cfg.tools || []).forEach((t) => {
      const c = resolveConnector(t.connector);
      const op = c && c.actions.find((a) => a.key === t.op);
      const label = t.type === 'workflow' ? agentToolWorkflowName(state, t) : op ? op.name : t.op;
      if (!c || !op) push('error', 'tools', `工具「${label}」不存在或已下架`);
      else if (t.type === 'workflow' && !state.workflows.some((w) => w.id === t.workflowId && w.published)) push('error', 'tools', `子流程工具「${label}」不存在或未发布`);
      else if (c.mcp && c.status !== 'connected') push('warning', 'tools', `MCP 服务器「${c.name}」当前连接异常，工具「${label}」不可用`);
      else if (c.auth !== 'none' && !t.connectionId) push('error', 'tools', `工具「${label}」未选择连接`);
      else if (t.connectionId) {
        const ci = connectionIssue(state, t.connectionId, ctx.projectId);
        if (ci) push(ci.level, 'tools', `工具「${label}」：${ci.text}`);
      }
    });
    if (!(Number(cfg.maxSteps) > 0 && Number(cfg.maxSteps) <= 20)) push('error', 'guard', '最大步数需在 1 ~ 20 之间');
    if (!(Number(cfg.tokenBudget) > 0)) push('error', 'guard', 'Token 预算需大于 0');
  }
  if (node.kind === 'variable') {
    const names = (node.config.vars || []).map((x) => (x.name || '').trim());
    if (!names.length) push('error', 'config', '至少声明一个变量');
    else if (names.some((x) => !x)) push('error', 'config', '变量名不能为空');
    else if (new Set(names).size !== names.length) push('error', 'config', '变量名重复');
  }
  if (node.kind === 'delay') {
    if (node.config.mode === '至指定时间' ? isBlank(node.config.until) : !(Number(node.config.value) > 0)) push('error', 'config', '延迟时间未设置');
  }
  if (node.aiDraft) push('warning', node.kind === 'trigger' ? 'trigger' : node.kind === 'action' ? 'op' : ['code', 'ai', 'json', 'agent'].includes(node.kind) ? 'input' : 'config', 'AI 生成的节点尚未确认');
  const upstreamIds = new Set(ctx.upstream.map((x) => x.id));
  const known = ctx.nodesById || {};
  const vars = ctx.projectId ? state.variables.filter((v) => v.projectId === ctx.projectId).map((v) => v.key) : null;
  const seen = new Set();
  ownRefs(node).forEach(({ head, expr }) => {
    if (seen.has(expr)) return;
    seen.add(expr);
    if (head === 'config') {
      const key = expr.split('.')[1];
      if (vars && !vars.includes(key)) push('warning', refTab, `引用的项目配置「${key}」不存在`, true);
    } else if (head === 'loop') {
      if (!ctx.loops.length) push('error', refTab, '「循环变量」只能在循环体内使用', true);
    } else if (!upstreamIds.has(head)) {
      push('error', refTab, known[head] ? `引用了非上游节点「${known[head].name}」的出参` : '引用的节点已被删除', true);
    }
  });
  return issues;
}

function agentToolWorkflowName(state, tool) {
  const wf = state.workflows.find((w) => w.id === tool.workflowId);
  return wf ? wf.name : '已删除的子流程';
}

function workflowIssues(wf, state) {
  const contexts = nodeContexts(wf);
  const nodesById = Object.fromEntries(Object.values(contexts).map((x) => [x.node.id, x.node]));
  return Object.values(contexts).flatMap(({ node, upstream, loops }) => nodeIssues(node, state, { upstream, loops, nodesById, projectId: wf.projectId }).map((i) => ({ ...i, node })));
}

const UNARY_OPS = ['为空', '不为空', '为 true', '为 false'];

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && !v.trim());
}

function cronPreview(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return { ok: false, runs: [] };
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const parse = (part, [lo, hi]) => {
    const out = new Set();
    const ok = part.split(',').every((seg) => {
      const [base, stepText] = seg.split('/');
      const step = stepText === undefined ? 1 : Number(stepText);
      if (!Number.isInteger(step) || step < 1) return false;
      const [from, to] = base === '*' ? [lo, hi] : base.includes('-') ? base.split('-').map(Number) : [Number(base), stepText === undefined ? Number(base) : hi];
      if (![from, to].every((x) => Number.isInteger(x) && x >= lo && x <= hi) || from > to) return false;
      for (let x = from; x <= to; x += step) out.add(x);
      return true;
    });
    return ok ? out : null;
  };
  const sets = parts.map((p, i) => parse(p, ranges[i]));
  if (sets.some((s) => !s)) return { ok: false, runs: [] };
  const [mins, hours, days, months, weekdays] = sets;
  const runs = [];
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let guard = 0; guard < 60 * 24 * 400 && runs.length < 5; guard++) {
    if (months.has(d.getMonth() + 1) && days.has(d.getDate()) && weekdays.has(d.getDay()) && hours.has(d.getHours()) && mins.has(d.getMinutes())) runs.push(new Date(d));
    if (!hours.has(d.getHours()) || !months.has(d.getMonth() + 1) || !days.has(d.getDate())) d.setMinutes(60);
    else d.setMinutes(d.getMinutes() + 1);
  }
  return { ok: true, runs };
}

function runMetrics(runs) {
  const all = runs.filter((r) => r.kind !== 'debug');
  const deduped = all.filter((r) => r.status === 'deduped').length;
  const real = all.filter((r) => r.status !== 'deduped');
  const finished = real.filter((r) => !['running', 'waiting'].includes(r.status));
  const success = finished.filter((r) => r.status === 'success').length;
  const failed = finished.filter((r) => ['failed', 'timeout'].includes(r.status)).length;
  return { total: real.length, finished: finished.length, success, failed, running: real.length - finished.length, deduped, rate: finished.length ? success / finished.length : null };
}

const fmtRate = (rate) => (rate === null ? '-' : `${(rate * 100).toFixed(1)}%`);

const RUN_STATUS = {
  success: { label: '运行成功', short: '成功', tone: 'success', icon: 'CircleCheck' },
  failed: { label: '运行失败', short: '失败', tone: 'danger', icon: 'CircleX' },
  running: { label: '运行中', short: '运行中', tone: 'info', icon: 'LoaderCircle' },
  waiting: { label: '等待中', short: '等待中', tone: 'warning', icon: 'CirclePause' },
  stopped: { label: '运行终止', short: '已终止', tone: 'default', icon: 'CircleSlash' },
  timeout: { label: '运行超时', short: '超时', tone: 'danger', icon: 'TimerOff' },
  skipped: { label: '未执行', short: '未执行', tone: 'default', icon: 'CircleDashed' },
  pending: { label: '待执行', short: '待执行', tone: 'default', icon: 'CircleDashed' },
  deduped: { label: '已去重', short: '已去重', tone: 'default', icon: 'CopyX' },
  reused: { label: '沿用原结果', short: '沿用', tone: 'default', icon: 'History' },
};

function RunStatusDot({ status }) {
  const m = RUN_STATUS[status];
  return html`<span className="row-4 nowrap"><${Dot} tone=${m.tone} pulse=${status === 'running'} /><span>${m.label}</span></span>`;
}

function RunStatusTag({ status, size }) {
  const m = RUN_STATUS[status];
  return html`<${Tag} tone=${m.tone} size=${size}>
    <${Icon} name=${m.icon} size=${12} className=${status === 'running' ? 'spin' : ''} />${m.label}
  <//>`;
}

function WorkflowStatusTag({ wf, size }) {
  if (wf.status === 'enabled') return html`<${Tag} tone="success" size=${size}>运行中<//>`;
  return html`<${Tag} tone="default" size=${size}>未运行<//>`;
}

const CONN_STATUS = {
  active: { label: '已连接', tone: 'success', reason: '' },
  expired: { label: '已过期', tone: 'warning', reason: '授权已过期' },
  error: { label: '未连接', tone: 'danger', reason: '连接异常' },
};

const VERSION_STATUS = { gray: { label: '灰度中', tone: 'info' }, released: { label: '全量发布', tone: 'success' }, deprecated: { label: '停止支持', tone: 'default' } };

const AUTH_LABEL = { oauth2: 'OAuth 2.0', client: '客户端凭证', apikey: 'API Key', basic: 'Basic Auth', custom: '自定义认证', none: '无需认证' };

const roleLabel = (r) => (ROLE_OPTIONS.find((o) => o.value === r) || { label: r }).label;

function currentProject(state) {
  return state.projects.find((p) => p.id === state.currentProjectId) || state.projects[0] || null;
}

function ProjectAvatar({ project, size = 24 }) {
  return html`<span className="avatar is-square" style=${{ width: size, height: size, background: project.color, fontSize: Math.round(size * 0.46), borderRadius: Math.round(size * 0.26) }}>${project.name.slice(0, 1)}</span>`;
}

function WorkflowGlyph({ wf, size = 18 }) {
  return html`<span className="wf-glyph" style=${{ width: size, height: size }}>
    <${Icon} name="Workflow" size=${Math.round(size * 0.66)} strokeWidth=${2.25} />
    ${wf && html`<span className=${cx('wf-glyph-dot', wf.status === 'enabled' ? 'is-on' : 'is-off')} />`}
  </span>`;
}

function newWorkflow({ projectId, name, folderId, description, trigger, steps }) {
  const now = Date.now();
  return withRefs({
    id: uid('wf'), projectId, folderId: folderId || null, name, description: description || '',
    status: 'disabled', published: false, draftChanged: true, version: 0, owner: Store.get().me,
    createdAt: now, updatedAt: now, tags: [],
    trigger: trigger || { id: 'trigger', kind: 'trigger', connector: null, op: null, name: '选择触发器', config: {}, connectionId: null },
    steps: steps || [],
  });
}

function defaultTriggerConfig(connector, opKey) {
  if (connector === 'schedule') return opKey === 'cron' ? { cron: '0 9 * * 1-5', timezone: 'Asia/Shanghai' } : { mode: '每天触发', at: '09:00', timezone: 'Asia/Shanghai' };
  if (connector === 'webhook') return { auth: '无鉴权', bodyType: 'JSON' };
  if (connector === 'alert') return { rule: '', event: '流程运行失败', scope: [], frequency: '实时', periods: 1, activeHours: '全天' };
  if (connector === 'forms') return { fields: [{ id: uid('f'), name: '姓名', type: '单行文本', required: true }] };
  if (connector === 'subflows') return { params: [{ name: 'input', type: '字符串', required: false }] };
  return {};
}

function triggerFromPick(connector, opKey) {
  const t = TRIGGER_TYPES.find((x) => x.connector === connector);
  const c = resolveConnector(connector);
  const o = c && c.triggers.find((x) => x.key === opKey);
  return { id: 'trigger', kind: 'trigger', connector, op: opKey, name: t ? t.name : o ? o.name : '选择触发器', config: defaultTriggerConfig(connector, opKey), connectionId: null };
}

function actionFromPick(connector, opKey) {
  const c = resolveConnector(connector);
  const o = c && c.actions.find((x) => x.key === opKey);
  return { id: uid('n'), kind: 'action', connector, op: opKey, name: o ? o.name : opKey, config: {}, connectionId: null, settings: { strategy: 'stop', rules: [], times: 3, interval: 10 } };
}

function stripConnections(graph) {
  return mapGraph(graph, (node) => ({
    ...node,
    ...(node.connectionId !== undefined ? { connectionId: null } : {}),
    ...(node.kind === 'ai' ? { config: { ...node.config, connectionId: null } } : {}),
  }));
}

function workflowFromTemplate(tpl, projectId) {
  if (tpl.graph) {
    const { nodes } = cloneNodes(tpl.graph.steps);
    const graph = stripConnections({ trigger: { ...tpl.graph.trigger, ref: null }, steps: nodes });
    return newWorkflow({ projectId, name: tpl.name, description: tpl.desc, trigger: graph.trigger, steps: graph.steps });
  }
  return newWorkflow({
    projectId, name: tpl.name, description: tpl.desc,
    trigger: triggerFromPick(tpl.trigger.connector, tpl.trigger.op),
    steps: tpl.steps.map((s) => actionFromPick(s.connector, s.op)),
  });
}

function recordRecent(type, id) {
  Store.set((s) => ({ ...s, recent: [{ type, id, time: Date.now() }, ...(s.recent || []).filter((r) => !(r.type === type && r.id === id))].slice(0, 12) }));
}

function addAudit(action, resource, project) {
  Store.set((s) => ({ ...s, auditLogs: [{ id: uid('al'), time: Date.now(), user: s.me, action, resource, project: project || null, ip: '10.12.4.21' }, ...s.auditLogs] }));
}

function projectEnvs(state, pid) {
  const project = state.projects.find((p) => p.id === pid);
  const groups = state.configGroups.filter((g) => g.projectId === pid && g.key);
  if (project && project.envMode === 'staged' && groups.length > 1) {
    return [...groups].sort((a, b) => (a.key === 'test' ? -1 : b.key === 'test' ? 1 : 0)).map((g) => ({ key: g.key, id: g.id, name: g.name, requireApproval: Boolean(g.requireApproval), approvers: g.approvers || [], connectionMap: g.connectionMap || {} }));
  }
  return [{ key: 'prod', id: null, name: '生产环境', requireApproval: false, approvers: [], connectionMap: {}, implicit: true }];
}

const isStagedProject = (state, pid) => projectEnvs(state, pid).length > 1;

function deploymentOf(wf, envKey) {
  if (envKey === 'test') return wf.test || null;
  return wf.published ? { version: wf.version, status: wf.status } : null;
}

function latestVersion(wf) {
  return Math.max(wf.version || 0, (wf.test && wf.test.version) || 0);
}

function nextVersionNumber(state, wf) {
  return Math.max(latestVersion(wf), ...state.versions.filter((v) => v.workflowId === wf.id).map((v) => v.version)) + 1;
}

function envConnectionId(state, pid, envKey, connId) {
  const env = projectEnvs(state, pid).find((e) => e.key === envKey);
  return (env && env.connectionMap[connId]) || connId;
}

function releaseChecks(state, wf, version, toEnv) {
  const v = state.versions.find((x) => x.workflowId === wf.id && x.version === version);
  const graph = v && v.snapshot ? { ...wf, ...v.snapshot } : wf;
  const env = projectEnvs(state, wf.projectId).find((e) => e.key === toEnv) || projectEnvs(state, wf.projectId)[0];
  const checks = [];
  const errors = workflowIssues(graph, state).filter((i) => i.level === 'error');
  checks.push(errors.length ? { level: 'error', text: `版本 v${version} 有 ${errors.length} 个校验错误，需要先修复` } : { level: 'ok', text: '校验通过，没有错误' });
  const connIds = [...new Set(allNodes(graph).map((n) => (n.kind === 'ai' || n.kind === 'agent' ? n.config.connectionId : n.connectionId)).filter(Boolean))];
  connIds.forEach((id) => {
    const target = state.connections.find((c) => c.id === envConnectionId(state, wf.projectId, env.key, id));
    if (!target) checks.push({ level: 'error', text: `${env.name}缺少连接（原连接已删除）` });
    else if (!connAvailableIn(target, wf.projectId)) checks.push({ level: 'error', text: `连接「${target.name}」不在本项目可用范围内` });
    else if (target.status !== 'active') checks.push({ level: 'warning', text: `连接「${target.name}」${(CONN_STATUS[target.status] || CONN_STATUS.error).reason}，上线后相关节点会失败` });
  });
  if (connIds.length) checks.push({ level: 'ok', text: `检查了 ${connIds.length} 个连接在${env.name}的可用性` });
  const keys = [...new Set(allNodes(graph).flatMap((n) => ownRefs(n)).filter((r) => r.head === 'config').map((r) => r.expr.split('.')[1]))];
  const configProblems = keys.flatMap((key) => {
    const variable = state.variables.find((x) => x.projectId === wf.projectId && x.key === key);
    const value = variable && ((variable.values || {})[env.id] ?? (variable.values || {}).default);
    if (!variable) return [{ level: 'error', text: `引用的项目配置「${key}」不存在` }];
    if (isBlank(value)) return [{ level: 'error', text: `项目配置「${key}」在${env.name}没有值` }];
    return [];
  });
  checks.push(...configProblems);
  if (keys.length && !configProblems.length) checks.push({ level: 'ok', text: `${keys.length} 个项目配置在${env.name}都有值` });
  if (env.requireApproval) checks.push({ level: 'info', text: `${env.name}的发布需要审批：${env.approvers.map((u) => personName(u)).join('、') || '项目所有者'}` });
  return checks;
}

function pendingApprovals(state) {
  const releases = (state.releases || []).filter((r) => r.status === 'pending' && r.approvers.includes(state.me)).map((r) => ({ type: 'release', id: r.id, at: r.requestedAt, item: r }));
  const runs = state.runs.filter((r) => r.status === 'waiting' && r.pendingApproval && r.pendingApproval.approvers.includes(state.me)).map((r) => ({ type: 'agent', id: r.id, at: r.pendingApproval.requestedAt, item: r }));
  return [...releases, ...runs].sort((a, b) => b.at - a.at);
}

function issueSignature(run) {
  if (!run.failure) return null;
  if (run.failure.code === 'CONNECTION_AUTH_FAILED' && run.failure.connectionId) return `conn:${run.failure.connectionId}`;
  return `${run.workflowId}:${run.failedNodeId || '-'}:${run.failure.code}`;
}

function collectIssues(state) {
  const groups = state.runs
    .filter((r) => r.kind === 'run' && ['failed', 'timeout'].includes(r.status) && r.failure)
    .reduce((acc, r) => {
      const sig = issueSignature(r);
      return { ...acc, [sig]: [...(acc[sig] || []), r] };
    }, {});
  return Object.entries(groups).map(([sig, runs]) => {
    const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
    const latest = sorted[0];
    const saved = (state.issueStates || {})[sig] || {};
    const connId = sig.startsWith('conn:') ? sig.slice(5) : null;
    const conn = connId && state.connections.find((c) => c.id === connId);
    const wf = state.workflows.find((w) => w.id === latest.workflowId);
    const node = wf && latest.failedNodeId ? findInWorkflow({ ...wf, ...graphForRun(latest, wf) }, latest.failedNodeId) : null;
    const reopened = saved.status === 'resolved' && saved.resolvedAt && latest.startedAt > saved.resolvedAt;
    const status = reopened ? 'open' : saved.status || 'open';
    const workflowIds = [...new Set(sorted.map((r) => r.workflowId))];
    const triggers = sorted.filter((r) => !r.retryOf).length || sorted.length;
    const title = conn ? `${conn.name}：${conn.error || '连接认证失败'}` : latest.failure.message;
    return {
      sig, kind: conn ? 'connection' : 'node', code: latest.failure.code, http: latest.failure.http_status, connectionId: connId, nodeId: conn ? null : latest.failedNodeId,
      workflowName: wf ? wf.name : '已删除的工作流', nodeName: conn ? conn.name : node ? node.name : '未知节点',
      title, message: latest.failure.message, workflowIds, projectIds: [...new Set(sorted.map((r) => r.projectId))],
      runIds: sorted.map((r) => r.id), count: triggers, firstAt: sorted[sorted.length - 1].startedAt, lastAt: latest.startedAt,
      envs: [...new Set(sorted.map((r) => r.env || 'prod'))], status, reopened, assignee: saved.assignee || null, mutedUntil: saved.mutedUntil || null,
      notes: saved.notes || [], resolvedAt: saved.resolvedAt || null, resolvedBy: saved.resolvedBy || null,
      severity: conn || triggers >= 10 ? 'high' : triggers >= 3 ? 'medium' : 'low',
    };
  }).sort((a, b) => b.lastAt - a.lastAt);
}

function issueInsight(issue, state) {
  if (issue.code === 'CONNECTION_AUTH_FAILED') {
    const conn = state.connections.find((c) => c.id === issue.connectionId);
    const fixed = conn && conn.status === 'active';
    return {
      cause: `连接「${conn ? conn.name : '已删除的连接'}」认证失败${conn && conn.error ? `：${conn.error}` : ''}。所有使用这个连接的节点都会在认证阶段失败，和工作流本身的配置无关。`,
      impact: `影响 ${issue.workflowIds.length} 个工作流、${issue.count} 次运行。`,
      confidence: 0.96,
      fixes: [
        fixed ? { kind: 'done', label: '连接已恢复为已连接' } : { kind: 'reauth', label: '重新授权连接', target: issue.connectionId },
        { kind: 'replay', label: `从失败节点重跑 ${issue.count} 次运行`, target: issue.sig, disabled: !fixed, reason: fixed ? '' : '连接恢复后才能重跑，否则会再次失败' },
      ],
    };
  }
  if (issue.code === 'STEP_TIMEOUT') {
    return {
      cause: '节点执行超过了 600 秒的上限。最常见的原因是一次查询或处理的数据量过大，其次是下游系统响应慢。',
      impact: `影响 ${issue.count} 次运行。`,
      confidence: 0.72,
      fixes: [
        { kind: 'openNode', label: '打开节点，改为分页查询', target: { workflowId: issue.workflowIds[0], nodeId: issue.nodeId, tab: 'input' } },
        { kind: 'openNode', label: '配置超时后重试', target: { workflowId: issue.workflowIds[0], nodeId: issue.nodeId, tab: 'error' } },
      ],
    };
  }
  const open = (label, tab) => ({ kind: 'openNode', label, target: { workflowId: issue.workflowIds[0], nodeId: issue.nodeId, tab } });
  const impact = `影响 ${issue.count} 次运行，最近一次在 ${fmt.relative(issue.lastAt)}。`;
  if ([429, 529].includes(issue.http)) {
    return {
      cause: '下游服务限流或繁忙，属于偶发问题，和工作流配置无关。节点已经重试过但仍然失败，说明重试间隔太短。',
      impact, confidence: 0.83,
      fixes: [open('把重试间隔调到 30 秒以上', 'error'), { kind: 'ignore', label: '确认是偶发问题，忽略' }],
    };
  }
  if (issue.http === 404) {
    return {
      cause: '要操作的数据在下游系统里已经不存在（可能被人工删除）。这类失败重跑也不会成功。',
      impact, confidence: 0.78,
      fixes: [open('为 404 配置「忽略」策略', 'error'), { kind: 'ignore', label: '确认数据已删除，忽略' }],
    };
  }
  if (issue.http === 504) {
    return {
      cause: '下游系统在超时时间内没有响应，通常是对方服务负载高或网络不稳定。',
      impact, confidence: 0.7,
      fixes: [open('配置超时后重试', 'error'), { kind: 'replay', label: `整体重跑 ${issue.count} 次运行`, target: issue.sig }],
    };
  }
  return {
    cause: `下游接口拒绝了请求（HTTP ${issue.http || 422}）：${issue.message}。这是数据或配置问题，需要修改后再重跑，直接重跑会再次失败。`,
    impact, confidence: 0.68,
    fixes: [open('打开节点检查入参和字段映射', 'input'), { kind: 'replay', label: `修改后从失败节点重跑 ${issue.count} 次运行`, target: issue.sig }],
  };
}

const MASK_DETECTORS = {
  phone: { key: /(mobile|phone|^tel$|手机|电话)/i, value: /^1\d{10}$/, mask: (v) => (v.length > 7 ? `${v.slice(0, 3)}${'*'.repeat(v.length - 7)}${v.slice(-4)}` : '****') },
  idcard: { key: /(id_?card|身份证)/i, value: /^\d{17}[\dXx]$/, mask: (v) => (v.length > 7 ? `${v.slice(0, 3)}${'*'.repeat(v.length - 7)}${v.slice(-4)}` : '****') },
  bankcard: { key: /(bank_?card|card_?no|卡号|银行卡)/i, value: /^\d{16,19}$/, mask: (v) => `${'*'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` },
  email: { key: /(email|mail|邮箱)/i, value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, mask: (v) => (v.includes('@') ? v.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : '******') },
  secret: { key: /(secret|token|password|passwd|api[_-]?key|authorization|cookie|密码|密钥|令牌)/i, value: null, stringOnly: true, mask: () => '******' },
};

function safeRegExp(pattern) {
  try {
    return pattern ? new RegExp(pattern, 'i') : null;
  } catch (e) {
    return null;
  }
}

function maskDeep(value, privacy, options = {}) {
  const rules = ((privacy && privacy.maskRules) || []).filter((r) => r.enabled);
  const fieldRules = rules.filter((r) => r.type === 'field').map((r) => safeRegExp(r.pattern)).filter(Boolean);
  const builtin = rules.filter((r) => r.type === 'builtin').map((r) => MASK_DETECTORS[r.key]).filter(Boolean);
  let count = 0;
  const walk = (v, key, forced) => {
    const k = String(key || '');
    const hard = forced || (k !== '' && fieldRules.some((re) => re.test(k)));
    if (Array.isArray(v)) return v.map((x) => walk(x, key, hard));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([ck, x]) => [ck, walk(x, ck, hard)]));
    if (v === null || v === undefined || typeof v === 'boolean') return v;
    if (hard) {
      count += 1;
      return '******';
    }
    const text = String(v);
    const hit = builtin.find((d) => (d.value ? d.value.test(text) : false) || (d.key.test(k) && text.length > 0 && (!d.stringOnly || typeof v === 'string')));
    if (!hit) return v;
    count += 1;
    return hit.mask(text);
  };
  return { value: walk(value, '', Boolean(options.all)), count };
}

const MAP_TRANSFORMS = {
  trim: { label: '去除首尾空格' },
  number: { label: '转数字' },
  string: { label: '转文本' },
  date: { label: '日期格式', arg: '格式', placeholder: 'YYYY-MM-DD' },
  default: { label: '为空时用默认值', arg: '默认值', placeholder: '例如：个人客户' },
  lookup: { label: '查映射表', arg: '映射表' },
  round: { label: '保留小数', arg: '位数', placeholder: '2' },
  upper: { label: '转大写' },
  lower: { label: '转小写' },
  split: { label: '按分隔符拆成列表', arg: '分隔符', placeholder: '，' },
};

const MAPPING_SCHEMAS = {
  '待入职': [
    { key: '姓名', type: '文本', required: true }, { key: '岗位', type: '文本' }, { key: '部门', type: '文本' },
    { key: '预计入职日期', type: '日期' }, { key: 'HRBP', type: '人员' }, { key: '状态', type: '单选', options: ['待入职', '已入职', '已放弃'] },
  ],
  '票据': [
    { key: '发票号码', type: '文本', required: true }, { key: '开票日期', type: '日期' }, { key: '金额', type: '数字', required: true },
    { key: '销售方', type: '文本' }, { key: '提交人', type: '人员' }, { key: '状态', type: '单选', options: ['待复核', '已入账', '已退回'] },
  ],
  '资产': [{ key: '资产编号', type: '文本', required: true }, { key: '名称', type: '文本' }, { key: '状态', type: '单选', options: ['在用', '待回收', '已回收'] }, { key: '使用人', type: '人员' }],
  '生日': [{ key: '姓名', type: '文本', required: true }, { key: '生日', type: '日期', required: true }, { key: 'open_id', type: '文本' }],
  '合同': [{ key: '合同编号', type: '文本', required: true }, { key: '到期日', type: '日期' }, { key: '负责人', type: '人员' }],
  'salesforce.create_lead': [
    { key: 'LastName', type: '文本', required: true }, { key: 'Company', type: '文本', required: true }, { key: 'Email', type: '文本' },
    { key: 'Phone', type: '文本' }, { key: 'LeadSource', type: '单选', options: ['Web', 'Trade Show', 'Referral', 'WeCom', 'Other'] }, { key: 'Description', type: '文本' },
  ],
  'feishu.create_user': [
    { key: '工号', type: '文本', required: true }, { key: '姓名', type: '文本', required: true }, { key: '手机号', type: '文本', required: true },
    { key: '部门', type: '文本', required: true }, { key: '直属上级', type: '人员' }, { key: '职务', type: '文本' }, { key: '邮箱', type: '文本' },
  ],
  'wecom.create_member': [
    { key: '工号', type: '文本', required: true }, { key: '姓名', type: '文本', required: true }, { key: '手机号', type: '文本', required: true },
    { key: '部门', type: '文本', required: true }, { key: '职务', type: '文本' },
  ],
  'feishu.update_user': [
    { key: '工号', type: '文本', required: true }, { key: '部门', type: '文本' }, { key: '直属上级', type: '人员' }, { key: '职务', type: '文本' },
  ],
  'kingdee.save_bill': [
    { key: 'FDate', type: '日期', required: true }, { key: 'FSupplierId', type: '文本', required: true }, { key: 'FPurchaseOrgId', type: '文本' },
    { key: 'FEntity', type: '数组', required: true, item: [{ key: 'FMaterialId', type: '文本', required: true }, { key: 'FQty', type: '数字', required: true }, { key: 'FPrice', type: '数字' }] },
  ],
};

function mappingSchema(node, fkey) {
  if (['bitable_create_record', 'bitable_update_record'].includes(node.op) && fkey === 'fields') return MAPPING_SCHEMAS[node.config.table] || null;
  return MAPPING_SCHEMAS[`${node.connector}.${node.op}`] || null;
}

const isMapping = (v) => Boolean(v && typeof v === 'object' && v.$map);

function readPath(root, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((acc, k) => (acc !== null && acc !== undefined && typeof acc === 'object' ? acc[k] : undefined), root);
}

function resolveMapSource(expr, resolve) {
  const text = String(expr || '').trim();
  const m = /^\{\{\s*([^.\s}[\]]+)((?:\.[^}]+|\[\d+\][^}]*)?)\s*\}\}$/.exec(text);
  if (m) return readPath(resolve(m[1]), m[2] || '');
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{\s*([^.\s}[\]]+)([^}]*?)\s*\}\}/g, (_, head, rest) => {
    const v = readPath(resolve(head), rest || '');
    return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function applyTransform(value, t, tables) {
  if (t.type === 'trim') return typeof value === 'string' ? { value: value.trim() } : { value };
  if (t.type === 'string') return { value: value === undefined || value === null ? '' : String(value) };
  if (t.type === 'upper') return { value: typeof value === 'string' ? value.toUpperCase() : value };
  if (t.type === 'lower') return { value: typeof value === 'string' ? value.toLowerCase() : value };
  if (t.type === 'number') {
    if (value === undefined || value === null || value === '') return { value };
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? { value: n } : { value, error: `「${value}」无法转为数字` };
  }
  if (t.type === 'round') return typeof value === 'number' ? { value: Number(value.toFixed(Number(t.arg) || 0)) } : { value };
  if (t.type === 'default') return { value: value === undefined || value === null || value === '' ? t.arg : value };
  if (t.type === 'split') return { value: typeof value === 'string' ? value.split(t.arg || ',').map((x) => x.trim()).filter(Boolean) : value };
  if (t.type === 'date') {
    if (!value) return { value };
    const d = new Date(String(value).replace(/\//g, '-'));
    if (Number.isNaN(d.getTime())) return { value, error: `「${value}」不是有效日期` };
    const pad = (x) => String(x).padStart(2, '0');
    const fmtText = (t.arg || 'YYYY-MM-DD').replace('YYYY', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('DD', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes()));
    return { value: fmtText };
  }
  if (t.type === 'lookup') {
    const table = tables.find((x) => x.id === t.arg);
    if (!table) return { value, error: '映射表不存在' };
    if (value === undefined || value === null) return { value, error: '来源不可用，无法查映射表' };
    const row = table.rows.find((r) => r.k === String(value));
    if (row) return { value: row.v };
    if (table.missing === 'default') return { value: table.defaultValue };
    if (table.missing === 'passthrough') return { value };
    return { value, error: `映射表「${table.name}」里没有「${value}」` };
  }
  return { value };
}

function checkMappedType(value, field) {
  if (value === undefined || value === null || value === '') return field.required ? '必填字段没有值' : null;
  if (field.type === '数字' && typeof value !== 'number') return `需要数字，当前是「${value}」`;
  if (field.type === '日期' && !/^\d{4}-\d{2}-\d{2}/.test(String(value))) return `需要日期（YYYY-MM-DD），当前是「${value}」`;
  if (field.type === '单选' && field.options && !field.options.includes(String(value))) return `「${value}」不在可选项里`;
  if (field.type === '数组' && !Array.isArray(value)) return '需要列表';
  return null;
}

function evalMapping(mapping, { resolve, tables, schema }) {
  const fields = (mapping && mapping.fields) || [];
  const evalRow = (row, scopeResolve, fieldSchema) => {
    const sub = row.each && fieldSchema && fieldSchema.type === '数组';
    let value = row.source ? resolveMapSource(row.source, scopeResolve) : row.constant;
    let error = null;
    if (sub) {
      const list = Array.isArray(value) ? value : [];
      const items = list.map((item) => evalMapping({ fields: row.each }, { resolve: (head) => (head === 'item' ? item : scopeResolve(head)), tables, schema: fieldSchema.item }));
      value = items.map((x) => x.value);
      error = items.flatMap((x) => x.rows.filter((r) => r.error).map((r) => `第 1 项「${r.target}」${r.error}`))[0] || (Array.isArray(list) ? null : '来源不是列表');
    } else {
      for (const t of row.transforms || []) {
        const out = applyTransform(value, t, tables);
        value = out.value;
        if (out.error) { error = out.error; break; }
      }
    }
    if (!error && fieldSchema) error = checkMappedType(value, fieldSchema);
    return { id: row.id, target: row.target, value, error };
  };
  const rows = fields.filter((r) => r.target).map((r) => evalRow(r, resolve, (schema || []).find((f) => f.key === r.target)));
  const missing = (schema || []).filter((f) => f.required && !fields.some((r) => r.target === f.key && (r.source || !isBlank(r.constant) || (r.transforms || []).some((t) => t.type === 'default'))));
  return { value: Object.fromEntries(rows.map((r) => [r.target, r.value])), rows, missing };
}

const MAP_SYNONYMS = [
  ['姓名', 'name', 'lastname', 'full_name', 'user_name', 'visitor'], ['邮箱', 'email', 'mail'], ['手机号', 'mobile', 'phone', '电话'],
  ['岗位', 'position', 'title', 'job'], ['部门', 'department', 'dept'], ['预计入职日期', 'expected_date', 'entry_date', 'hire_date', '入职日期'],
  ['公司', 'company', 'corp_name', '企业', '来访单位'], ['发票号码', 'invoice_no', 'invoice'], ['开票日期', 'date', 'invoice_date'],
  ['金额', 'amount', 'total', 'total_price'], ['销售方', 'seller', 'vendor', 'supplier'], ['提交人', 'submitter', 'user_id', 'sender'],
  ['hrbp', 'hrbp'], ['来源', 'source', 'leadsource'], ['物料', 'fmaterialid', '物料编码'], ['数量', 'fqty'], ['单价', 'fprice'],
];

function mapCandidates(value, prefix, label, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3) return [];
  if (Array.isArray(value)) return [{ path: prefix, key: prefix.split('.').pop(), sample: value, label }];
  return Object.entries(value).flatMap(([k, v]) => {
    const path = `${prefix}.${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) return mapCandidates(v, path, label, depth + 1);
    return [{ path, key: k, sample: v, label }];
  });
}

function suggestMapping(schema, candidates, existing) {
  const taken = new Set((existing || []).filter((r) => r.source || !isBlank(r.constant)).map((r) => r.target));
  const norm = (x) => String(x).toLowerCase().replace(/[\s_-]/g, '');
  return (schema || []).filter((f) => !taken.has(f.key) && f.type !== '数组').map((f) => {
    const group = MAP_SYNONYMS.find((g) => g.some((x) => norm(x) === norm(f.key)));
    let best = null;
    candidates.forEach((c) => {
      const exact = norm(c.key) === norm(f.key);
      const syn = group && group.some((x) => norm(x) === norm(c.key));
      const partial = !exact && !syn && (norm(c.key).includes(norm(f.key)) || norm(f.key).includes(norm(c.key)));
      const score = exact ? 0.95 : syn ? 0.88 : partial ? 0.55 : 0;
      const typeOk = f.type !== '数字' || typeof c.sample === 'number' || !Number.isNaN(Number(c.sample));
      const final = score * (typeOk ? 1 : 0.7);
      if (final > 0 && (!best || final > best.confidence)) best = { target: f.key, source: `{{${c.path}}}`, confidence: final, reason: exact ? `字段名相同：${c.key}` : syn ? `同义字段：${c.key}${c.label ? `（${c.label}）` : ''}` : `名称相近：${c.key}`, transforms: f.type === '数字' && typeof c.sample !== 'number' ? [{ type: 'number' }] : f.type === '日期' ? [{ type: 'date', arg: 'YYYY-MM-DD' }] : [] };
    });
    return best;
  }).filter(Boolean);
}

function graphNodeMap(graph) {
  return Object.fromEntries(allNodes(graph).map((n) => [n.id, n]));
}

function nodeSignature(node) {
  const shallow = Object.fromEntries(Object.entries(node).filter(([k]) => !['ref', 'name'].includes(k)));
  if (shallow.branches) shallow.branches = shallow.branches.map((b) => ({ id: b.id, name: b.name, conditions: b.conditions, isDefault: b.isDefault }));
  if (shallow.steps) shallow.steps = shallow.steps.map((s) => s.id);
  if (shallow.errorSteps) shallow.errorSteps = shallow.errorSteps.map((s) => s.id);
  return JSON.stringify(shallow);
}

function diffGraphs(base, target) {
  const a = graphNodeMap(base);
  const b = graphNodeMap(target);
  const added = Object.values(b).filter((n) => !a[n.id]);
  const removed = Object.values(a).filter((n) => !b[n.id]);
  const modified = Object.values(b).filter((n) => a[n.id] && (nodeSignature(a[n.id]) !== nodeSignature(n) || a[n.id].name !== n.name)).map((n) => {
    const before = a[n.id];
    const keys = [...new Set([...Object.keys(before.config || {}), ...Object.keys(n.config || {})])].filter((k) => !k.startsWith('__'));
    const fields = [
      ...(before.name !== n.name ? [{ label: '节点名称', before: before.name, after: n.name }] : []),
      ...(before.op !== n.op ? [{ label: '操作', before: before.op, after: n.op }] : []),
      ...(before.connectionId !== n.connectionId ? [{ label: '连接', before: before.connectionId, after: n.connectionId }] : []),
      ...keys.filter((k) => JSON.stringify((before.config || {})[k]) !== JSON.stringify((n.config || {})[k])).map((k) => ({ label: k, before: (before.config || {})[k], after: (n.config || {})[k] })),
      ...(JSON.stringify(before.settings) !== JSON.stringify(n.settings) ? [{ label: '错误处理', before: before.settings && before.settings.strategy, after: n.settings && n.settings.strategy }] : []),
      ...(JSON.stringify((before.branches || []).map((x) => [x.name, x.conditions])) !== JSON.stringify((n.branches || []).map((x) => [x.name, x.conditions])) ? [{ label: '分支条件', before: (before.branches || []).map((x) => x.name).join('、'), after: (n.branches || []).map((x) => x.name).join('、') }] : []),
    ];
    return { node: n, before, fields };
  });
  return { added, removed, modified, same: !added.length && !removed.length && !modified.length };
}

function MissingAppGuide({ q, options, compact }) {
  return html`<div className=${cx('missing-app', compact && 'is-compact')}>
    <div className="missing-app-head">
      <${Icon} name="SearchX" size=${compact ? 16 : 20} />
      <div><b>${q ? `没有找到「${q}」` : '没有找到相关应用'}</b><div className="text-xs muted">还没有现成的连接器也能接，按需要选一种：</div></div>
    </div>
    ${options.filter(Boolean).map((o) => html`<button key=${o.title} type="button" className="missing-app-row" onClick=${o.onClick}>
      <span className="missing-app-icon"><${Icon} name=${o.icon} size=${16} /></span>
      <span className="grow"><span className="missing-app-title">${o.title}</span><span className="text-xs muted">${o.desc}</span></span>
      <${Icon} name="ChevronRight" size=${14} className="muted" />
    </button>`)}
  </div>`;
}
