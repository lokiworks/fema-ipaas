const MCP_STATUS = {
  enabled: { label: '已启用', tone: 'success' },
  paused: { label: '已暂停', tone: 'warning' },
  draft: { label: '待发布', tone: 'default' },
};

const MCP_PARAM_MODES = [
  { value: 'ai', label: 'AI 推断' },
  { value: 'fixed', label: '固定值' },
  { value: 'ref', label: '引用值' },
  { value: 'context', label: '客户端上下文' },
];

const MCP_CONTEXT_KEYS = [
  { value: 'user_email', label: '调用者邮箱' },
  { value: 'user_id', label: '调用者 ID' },
  { value: 'user_name', label: '调用者姓名' },
  { value: 'client', label: '客户端名称' },
];

const MCP_CRED_MODES = [
  { value: 'developer', label: '开发者配置的固定连接', desc: '所有调用都使用你选择的连接，适合只读查询或机器人账号', icon: 'KeyRound' },
  { value: 'consumer', label: '由服务使用者配置', desc: '获取服务的团队各自选择自己的连接', icon: 'Users' },
  { value: 'user', label: '由使用 MCP 的用户授权', desc: '每位用户首次调用时授权自己的账号，按个人权限访问数据', icon: 'UserCheck' },
];

function mcpParamMode(p) {
  if (!p || !p.mode) return 'ai';
  return p.mode === 'ctx' ? 'context' : p.mode;
}

function mcpSecret(prefix = 'mcp_sk_', length = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = window.crypto && window.crypto.getRandomValues
    ? Array.from(window.crypto.getRandomValues(new Uint8Array(length)))
    : Array.from({ length }, () => Math.floor(Math.random() * 256));
  return `${prefix}${bytes.map((b) => chars[b % chars.length]).join('')}`;
}

function mcpMask(key) {
  const text = String(key || '');
  if (text.length <= 12) return '•'.repeat(text.length);
  return `${text.slice(0, 9)}${'•'.repeat(10)}${text.slice(-4)}`;
}

function mcpSnake(text) {
  const s = String(text || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) return 'tool';
  return /^[a-z]/.test(s) ? s.slice(0, 64) : `tool_${s}`.slice(0, 64);
}

function mcpUniqueName(base, taken) {
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function mcpScope(svc) {
  if (svc.scope === 'all' || svc.scope === '全员') return { mode: 'all', targets: [] };
  if (svc.scope === 'part') return { mode: 'part', targets: svc.scopeTargets || [] };
  return { mode: 'part', targets: svc.scopeTargets || String(svc.scope || '').split('、').filter(Boolean) };
}

function mcpPublishedTrigger(state, wf) {
  const latest = state.versions.filter((v) => v.workflowId === wf.id && v.snapshot && v.snapshot.trigger).sort((a, b) => b.version - a.version)[0];
  return latest ? latest.snapshot.trigger : wf.trigger;
}

function mcpSourceParams(state, source) {
  if (!source) return null;
  if (source.type === 'workflow') {
    const wf = state.workflows.find((w) => w.id === source.workflowId);
    const trigger = wf && mcpPublishedTrigger(state, wf);
    if (!trigger || trigger.connector !== 'subflows') return null;
    return ((trigger.config && trigger.config.params) || []).filter((p) => p.name).map((p) => ({ name: p.name, label: p.type || '', required: Boolean(p.required), def: { label: p.name, type: 'var' } }));
  }
  const c = resolveConnector(source.connector);
  const op = c && c.actions.find((a) => a.key === source.op);
  if (!op) return null;
  const node = { kind: 'action', connector: source.connector, op: source.op, config: {} };
  return fieldsFor(node).map((key) => {
    const def = fieldDef(node, key);
    return { name: key, label: def.label || key, required: Boolean(def.required), def };
  });
}

function mcpSyncParams(state, tool) {
  const expected = mcpSourceParams(state, tool.source);
  if (!expected) return { tool, removed: [] };
  const params = expected.map((e) => {
    const cur = tool.params.find((p) => p.name === e.name);
    return cur ? { ...cur, mode: mcpParamMode(cur), desc: cur.desc || e.label } : { name: e.name, desc: e.label, mode: 'ai' };
  });
  return { tool: { ...tool, params }, removed: tool.params.filter((p) => !expected.some((e) => e.name === p.name)) };
}

function mcpSourceLabel(state, source) {
  if (source.type === 'workflow') {
    const wf = state.workflows.find((w) => w.id === source.workflowId);
    if (!wf) return { text: '工作流已删除', broken: true };
    const p = state.projects.find((x) => x.id === wf.projectId);
    return { text: `${wf.name}${p ? ` · ${p.name}` : ''}`, broken: false };
  }
  const c = resolveConnector(source.connector);
  if (!c) return { text: '连接器不存在或已下架', broken: true };
  const op = c.actions.find((a) => a.key === source.op);
  return op ? { text: `${c.name} · ${op.name}`, broken: false } : { text: `${c.name} · 操作不存在`, broken: true };
}

function mcpWorkflowBlock(state, wf) {
  if (!wf.published) return '未发布';
  if (mcpPublishedTrigger(state, wf).connector !== 'subflows') return '触发器不是子流程触发器';
  return null;
}

function mcpSourceIssue(state, source) {
  if (source.type === 'workflow') {
    const wf = state.workflows.find((w) => w.id === source.workflowId);
    if (!wf) return { level: 'error', text: '来源工作流已被删除' };
    const block = mcpWorkflowBlock(state, wf);
    if (block) return { level: 'error', text: `来源工作流${block}` };
    if (wf.status !== 'enabled') return { level: 'warning', text: '来源工作流未启用，调用会失败' };
    return null;
  }
  const c = resolveConnector(source.connector);
  if (!c) return { level: 'error', text: '来源连接器不存在或已下架' };
  if (c.custom && c.status !== 'published') return { level: 'error', text: `自定义连接器「${c.name}」未发布或已下架` };
  if (!c.actions.some((a) => a.key === source.op)) return { level: 'error', text: `连接器「${c.name}」中已经没有这个操作` };
  return null;
}

function mcpToolConnectors(svc) {
  const ids = [...new Set(svc.tools.filter((t) => t.source.type === 'connector').map((t) => t.source.connector))];
  return ids.filter((cid) => { const c = resolveConnector(cid); return c && c.auth !== 'none'; });
}

function mcpFixedIssue(state, svc, connId) {
  if (!connId) return { level: 'error', text: '请选择连接' };
  const conn = state.connections.find((c) => c.id === connId);
  if (!conn) return { level: 'error', text: '所选连接已被删除，请重新选择' };
  if (!connectionPerm(state, conn, svc.owner || state.me)) return { level: 'error', text: `连接「${conn.name}」没有分享给服务所有者` };
  if (conn.status !== 'active') return { level: 'warning', text: `连接「${conn.name}」${CONN_STATUS[conn.status].reason}，调用会失败` };
  return null;
}

function mcpRefs(value) {
  return [...String(value || '').matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]);
}

function mcpToolErrors(tool, siblings) {
  const errors = {};
  const name = String(tool.name || '').trim();
  if (!name) errors.name = '请输入工具名称';
  else if (!/^[a-z][a-z0-9_]*$/.test(name)) errors.name = '只能使用小写字母、数字和下划线，并以小写字母开头';
  else if (name.length > 64) errors.name = '不能超过 64 个字符';
  else if (siblings.includes(name)) errors.name = '这个服务里已经有同名工具';
  if (!String(tool.title || '').trim()) errors.title = '请输入展示名称';
  if (!String(tool.description || '').trim()) errors.description = '请输入工具描述';
  const names = tool.params.map((p) => p.name);
  const params = tool.params.reduce((acc, p) => {
    const mode = mcpParamMode(p);
    const v = String(p.value ?? '').trim();
    if (mode === 'fixed' && !v) return { ...acc, [p.name]: '请填写固定值' };
    if (mode === 'ref') {
      const refs = mcpRefs(v);
      if (!v) return { ...acc, [p.name]: '请填写引用值' };
      if (!refs.length) return { ...acc, [p.name]: '至少引用一个其他入参，例如 {{summary}}' };
      if (refs.includes(p.name)) return { ...acc, [p.name]: '不能引用参数自己' };
      const missing = refs.find((r) => !names.includes(r));
      if (missing) return { ...acc, [p.name]: `入参「${missing}」不存在` };
      if (refs.some((r) => mcpParamMode(tool.params.find((x) => x.name === r)) === 'ref')) return { ...acc, [p.name]: '不能引用另一个引用值参数' };
    }
    return acc;
  }, {});
  return Object.keys(params).length ? { ...errors, params } : errors;
}

function mcpServiceIssues(state, svc) {
  const toolIssues = svc.tools.flatMap((t) => {
    const siblings = svc.tools.filter((x) => x.id !== t.id).map((x) => x.name);
    const errs = mcpToolErrors(t, siblings);
    const label = t.title || t.name;
    const own = [
      errs.name && { level: 'error', text: `工具「${label}」的名称${errs.name === '这个服务里已经有同名工具' ? '与其他工具重复' : '不符合规范'}`, toolId: t.id },
      errs.description && { level: 'error', text: `工具「${label}」没有描述`, toolId: t.id },
      !errs.description && String(t.description).trim().length < 10 && { level: 'warning', text: `工具「${label}」的描述过短，AI 可能无法正确选择工具`, toolId: t.id },
      errs.params && { level: 'error', text: `工具「${label}」有 ${Object.keys(errs.params).length} 个入参没有填写完整`, toolId: t.id },
    ].filter(Boolean);
    const src = mcpSourceIssue(state, t.source);
    const expected = src && src.level === 'error' ? null : mcpSourceParams(state, t.source);
    const mismatch = expected && (expected.length !== t.params.length || expected.some((e) => !t.params.some((p) => p.name === e.name)));
    return [
      ...own,
      src && { ...src, text: `工具「${label}」：${src.text}`, toolId: t.id },
      mismatch && { level: 'warning', text: `工具「${label}」的入参与来源不一致，打开工具保存一次即可同步`, toolId: t.id },
    ].filter(Boolean);
  });
  const connIssues = svc.credentialMode === 'developer'
    ? mcpToolConnectors(svc).map((cid) => {
      const issue = mcpFixedIssue(state, svc, (svc.fixedConnections || {})[cid]);
      return issue && { level: issue.level, text: `${resolveConnector(cid).name}：${issue.text}`, tab: 'conn' };
    }).filter(Boolean)
    : [];
  const scope = mcpScope(svc);
  return [
    ...(svc.tools.length ? [] : [{ level: 'warning', text: '还没有工具，AI 助手连接后看不到任何能力', tab: 'tools' }]),
    ...toolIssues,
    ...connIssues,
    ...(scope.mode === 'part' && !scope.targets.length ? [{ level: 'error', text: '可用范围选择了指定部门或成员，但还没有选择任何人', tab: 'scope' }] : []),
  ];
}

function mcpNextVersion(svc) {
  const latest = [...svc.releases].sort((a, b) => b.publishedAt - a.publishedAt)[0];
  if (!latest) return '1.0';
  const [major, minor] = String(latest.version).split('.').map((x) => Number(x) || 0);
  return `${major || 1}.${minor + 1}`;
}

function mcpBuildTool(state, svc, source) {
  const taken = svc.tools.map((t) => t.name);
  const params = (mcpSourceParams(state, source) || []).map((e) => ({ name: e.name, desc: e.label, mode: 'ai' }));
  if (source.type === 'workflow') {
    const wf = state.workflows.find((w) => w.id === source.workflowId);
    return { id: uid('tl'), name: mcpUniqueName(mcpSnake(`run_${wf.id.replace(/^wf_/, '')}`), taken), title: wf.name.slice(0, 30), description: wf.description || '', source, params };
  }
  const c = resolveConnector(source.connector);
  const op = c.actions.find((a) => a.key === source.op);
  return { id: uid('tl'), name: mcpUniqueName(mcpSnake(`${c.key || c.id}_${op.key}`), taken), title: op.name.slice(0, 30), description: op.desc || '', source, params };
}

function mcpPatch(svc, patch, { changed } = {}) {
  patchList('mcpServices', svc.id, (s) => ({
    ...(typeof patch === 'function' ? patch(s) : patch),
    ...(changed && s.releases.length ? { draftChanged: true } : {}),
    updatedAt: Date.now(),
  }));
}

function ImageUploadButton({ onPick, maxKb = 256, minSize = 0, label = '上传', size = 'sm' }) {
  const ref = useRef(null);
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) { toast.error('只支持 PNG、JPG、WebP 或 SVG 图片'); return; }
    if (file.size > maxKb * 1024) { toast.error(`图片不能超过 ${maxKb} KB`); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!minSize || file.type === 'image/svg+xml') { onPick(url); return; }
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth < minSize || img.naturalHeight < minSize) toast.error(`图片尺寸不能小于 ${minSize}×${minSize}`);
        else onPick(url);
      };
      img.onerror = () => toast.error('图片无法读取，请换一张');
      img.src = url;
    };
    reader.onerror = () => toast.error('图片无法读取，请换一张');
    reader.readAsDataURL(file);
  };
  return html`<${Fragment}>
    <input ref=${ref} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="img-upload-input" onChange=${onFile} />
    <${Button} size=${size} icon="Upload" onClick=${() => ref.current && ref.current.click()}>${label}<//>
  <//>`;
}

function McpIcon({ svc, size = 40 }) {
  if (svc.icon) return html`<span className="cicon mcp-icon-img" style=${{ width: size, height: size }}><img src=${svc.icon} alt="" /></span>`;
  if (svc.type === 'official') return html`<${ConnectorIcon} id="feishu" size=${size} />`;
  return html`<span className="cicon is-letter" style=${{ width: size, height: size, background: '#2563EB', fontSize: Math.round(size * 0.42) }}>${svc.name.slice(0, 1)}</span>`;
}

function McpListPage() {
  const state = useStore();
  const route = useRoute();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(null);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    const { newTool, connector, op } = route.query;
    if (!newTool) return;
    navigate('/mcp', { replace: true });
    const c = resolveConnector(connector);
    const o = c && c.actions.find((x) => x.key === op);
    if (newTool !== 'connector' || !o) { toast.error('要开放的连接器操作不存在'); return; }
    setPending({ connector: c.id, op: o.key, key: uid('pd') });
  }, [route.query.newTool, route.query.connector, route.query.op]);
  const ql = q.trim().toLowerCase();
  const inTab = state.mcpServices.filter((s) => (tab === 'all' ? true : tab === 'mine' ? s.type === 'custom' && s.owner === state.me : Boolean(s.obtained)));
  const list = inTab.filter((s) => !ql || `${s.name}${s.description}${s.key}`.toLowerCase().includes(ql));
  const counts = {
    all: state.mcpServices.length,
    mine: state.mcpServices.filter((s) => s.type === 'custom' && s.owner === state.me).length,
    got: state.mcpServices.filter((s) => s.obtained).length,
  };
  const empty = ql
    ? html`<${Empty} icon="SearchX" title="没有找到匹配的服务" description=${`没有名称、标识或描述包含「${q.trim()}」的服务`} action=${html`<${Button} onClick=${() => setQ('')}>清除搜索<//>`} />`
    : tab === 'got'
      ? html`<${Empty} icon="Download" title="还没有获取任何服务" description="在「全部服务」中打开平台官方服务并点击「获取」，就能在 AI 助手里使用它。" />`
      : html`<${Empty} icon="Server" title="你还没有开发 MCP 服务" description="把连接器操作或已发布的工作流打包成服务，AI 助手就能直接调用。" action=${html`<${Button} variant="primary" icon="Plus" onClick=${() => setCreating({})}>创建 MCP 服务<//>`} />`;
  return html`<div className="page"><div className="page-inner">
    <${PageHeader}
      title="MCP 服务"
      description="把连接器操作和已发布的工作流打包成 MCP 服务，Claude、Cursor 等 AI 助手就能直接调用"
      actions=${html`<${Button} variant="primary" icon="Plus" onClick=${() => setCreating({})}>创建 MCP 服务<//>`}
    />
    <div className="toolbar">
      <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'all', label: '全部服务', count: counts.all }, { value: 'mine', label: '我开发的', count: counts.mine }, { value: 'got', label: '我获取的', count: counts.got }]} />
      <span className="spacer" />
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索服务名称、标识或描述" width=${260} />
    </div>
    ${list.length === 0 ? html`<div className="card">${empty}</div>` : html`<div className="mcp-grid">
      ${list.map((s) => html`<button key=${s.id} type="button" className="mcp-card" onClick=${() => navigate(`/mcp/${s.id}`)}>
        <div className="row"><${McpIcon} svc=${s} /><div className="grow"><div className="conn-name">${s.name}</div><div className="row-4"><${Tag} size="sm" tone=${s.type === 'official' ? 'outline' : 'primary'}>${s.type === 'official' ? '平台官方' : '企业自定义'}<//><${Tag} size="sm" tone=${MCP_STATUS[s.status].tone} dot>${MCP_STATUS[s.status].label}<//>${s.listed && html`<${Tag} size="sm" tone="info">已上架<//>`}</div></div></div>
        <div className="conn-desc">${s.description}</div>
        <div className="conn-foot"><span>${s.tools.length} 个工具</span><span>近 7 天调用 ${fmt.number(s.calls7d)} 次</span><span className="spacer" />${s.owner ? html`<${Tooltip} content=${`所有者：${personName(s.owner)}`}><${Avatar} name=${personName(s.owner)} size=${20} /><//>` : html`<span>平台维护</span>`}</div>
      </button>`)}
      ${!ql && tab !== 'got' && html`<button type="button" className="mcp-card is-new" onClick=${() => setCreating({})}><${Icon} name="Plus" size=${20} /><span>创建 MCP 服务</span></button>`}
    </div>`}
    ${creating && html`<${McpInfoModal} key="create" onClose=${() => setCreating(null)} onCreated=${creating.then ? (svc) => navigate(`/mcp/${svc.id}?newTool=connector&connector=${encodeURIComponent(creating.then.connector)}&op=${encodeURIComponent(creating.then.op)}`) : null} />`}
    ${pending && html`<${McpAddToServiceModal} key=${pending.key} pending=${pending} onClose=${() => setPending(null)} onCreateNew=${() => { setCreating({ then: pending }); setPending(null); }} />`}
  </div></div>`;
}

function McpAddToServiceModal({ pending, onClose, onCreateNew }) {
  const state = useStore();
  const mine = state.mcpServices.filter((s) => s.type === 'custom' && s.owner === state.me);
  const [target, setTarget] = useState(mine[0] ? mine[0].id : 'new');
  const c = resolveConnector(pending.connector);
  const op = c.actions.find((a) => a.key === pending.op);
  const go = () => {
    if (target === 'new') { onCreateNew(); return; }
    onClose();
    navigate(`/mcp/${target}?newTool=connector&connector=${encodeURIComponent(c.id)}&op=${encodeURIComponent(op.key)}`);
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="开放为 MCP 工具" description="选择要把这个操作添加到哪个 MCP 服务" width=${560} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" onClick=${go}>${target === 'new' ? '下一步：创建服务' : '下一步：确认工具'}<//><//>`}>
    <div className="mcp-source-card">
      <${ConnectorIcon} connector=${c} size=${36} />
      <div className="grow"><div className="cell-title">${c.name} · ${op.name}</div><div className="cell-sub">${op.desc || '没有描述'}</div></div>
    </div>
    <${Field} label="添加到">
      <${RadioCards} columns=${1} value=${target} onChange=${setTarget} options=${[
        ...mine.map((s) => ({ value: s.id, label: s.name, desc: `${s.tools.length} 个工具 · ${MCP_STATUS[s.status].label}`, icon: 'Server' })),
        { value: 'new', label: '创建新的 MCP 服务', desc: '先填写服务信息，再把这个操作添加为工具', icon: 'Plus' },
      ]} />
    <//>
  <//>`;
}

function McpInfoModal({ svc, onClose, onCreated }) {
  const state = useStore();
  const editing = Boolean(svc);
  const [name, setName] = useState(editing ? svc.name : '');
  const [key, setKey] = useState(editing ? svc.key : '');
  const [desc, setDesc] = useState(editing ? svc.description : '');
  const [icon, setIcon] = useState(editing ? svc.icon || null : null);
  const [touched, setTouched] = useState({});
  const touch = (k) => setTouched((t) => ({ ...t, [k]: true }));
  const keyTaken = !editing && state.mcpServices.some((s) => s.key === key.trim());
  const errors = {
    name: !name.trim() ? '请输入服务名称' : null,
    key: editing ? null : !key.trim() ? '请输入服务唯一标识' : !/^[a-z][a-z0-9-]*$/.test(key.trim()) ? '以小写字母开头，只能包含小写字母、数字和中划线' : key.trim().length > 40 ? '不能超过 40 个字符' : keyTaken ? '这个标识已被其他服务使用' : null,
    desc: !desc.trim() ? '请填写描述，AI 助手会据此判断什么时候使用这个服务' : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const dirty = !editing || name !== svc.name || desc !== svc.description || icon !== (svc.icon || null);
  const show = (k) => (touched[k] ? errors[k] : null);
  const submit = () => {
    if (!valid) return;
    if (editing) {
      mcpPatch(svc, { name: name.trim(), description: desc.trim(), icon });
      addAudit('编辑 MCP 服务', name.trim());
      toast.success('已保存');
      onClose();
      return;
    }
    const now = Date.now();
    const s = { id: uid('mcp'), name: name.trim(), key: key.trim(), description: desc.trim(), icon, type: 'custom', status: 'draft', owner: state.me, createdAt: now, updatedAt: now, credentialMode: 'developer', fixedConnections: {}, scope: 'all', scopeTargets: [], calls7d: 0, apiKey: mcpSecret(), tools: [], releases: [] };
    prependToList('mcpServices', s);
    addAudit('创建 MCP 服务', s.name);
    onClose();
    toast.success('已创建，接下来添加工具');
    if (onCreated) onCreated(s);
    else navigate(`/mcp/${s.id}`);
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${editing ? '编辑服务信息' : '创建 MCP 服务'} width=${560} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid || !dirty} onClick=${submit}>${editing ? '保存' : '创建'}<//><//>`}>
    <${Field} label="服务名称" required error=${show('name')}><${CharInput} value=${name} onChange=${(v) => { setName(v); touch('name'); }} max=${30} autoFocus invalid=${Boolean(show('name'))} /><//>
    <${Field} label="服务唯一标识" required hint=${editing ? '用于服务地址，创建后不能修改' : '用于服务地址，创建后不能修改，例如 hr-toolkit'} error=${show('key')}>
      ${editing ? html`<${Input} mono value=${key} readOnly />` : html`<${Input} mono value=${key} onChange=${(v) => { setKey(v.slice(0, 40)); touch('key'); }} placeholder="hr-toolkit" invalid=${Boolean(show('key'))} />`}
    <//>
    <${Field} label="描述" required hint="AI 助手会根据描述判断什么时候使用这个服务" error=${show('desc')}><${CharTextarea} value=${desc} onChange=${(v) => { setDesc(v); touch('desc'); }} max=${300} rows=${3} placeholder="例如：让 AI 助手查询员工信息、查询审批进度" /><//>
    <${Field} label="图标" hint="PNG、JPG 或 SVG，不小于 240×240，不超过 256 KB；不上传时使用名称首字">
      <div className="row"><${McpIcon} svc=${{ name: name || '服', icon, type: 'custom' }} size=${40} /><${ImageUploadButton} minSize=${240} onPick=${setIcon} label=${icon ? '更换图标' : '上传图标'} />${icon && html`<${Button} size="sm" variant="ghost" onClick=${() => setIcon(null)}>移除<//>`}</div>
    <//>
  <//>`;
}

function McpDetailPage({ id }) {
  const state = useStore();
  const route = useRoute();
  const svc = state.mcpServices.find((s) => s.id === id);
  const [tab, setTab] = useState('tools');
  const [wizard, setWizard] = useState(null);
  const [toolView, setToolView] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const canEdit = Boolean(svc) && svc.type === 'custom' && svc.owner === state.me;
  useEffect(() => {
    const { newTool, connector, op } = route.query;
    if (!newTool || !svc) return;
    navigate(`/mcp/${id}`, { replace: true });
    if (!canEdit) { toast.error('只有服务所有者可以添加工具'); return; }
    const c = resolveConnector(connector);
    const o = c && c.actions.find((x) => x.key === op);
    if (newTool !== 'connector' || !o) { toast.error('要开放的连接器操作不存在'); return; }
    setTab('tools');
    setWizard({ mode: 'connector', preset: { connector: c.id, op: o.key }, key: uid('wz') });
  }, [id, route.query.newTool, route.query.connector, route.query.op]);
  if (!svc) return html`<div className="page"><${Empty} icon="ServerOff" title="服务不存在" description="服务可能已被删除，或链接有误。" action=${html`<${Button} onClick=${() => navigate('/mcp')}>返回 MCP 服务<//>`} /></div>`;
  const readOnly = !canEdit;
  const issues = canEdit ? mcpServiceIssues(state, svc) : [];
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.length - errorCount;
  const url = `https://${state.tenant.domain}/mcp/${svc.key}`;
  const publishBlock = !svc.tools.length ? '先添加工具再发布' : svc.releases.length && !svc.draftChanged ? '没有需要发布的修改' : null;
  const removeTool = async (t) => {
    if (!(await confirmDialog({ title: `删除工具「${t.title}」？`, content: svc.releases.length ? '重新发布后，AI 助手将无法再调用这个工具。' : '删除后不可恢复。', danger: true, okText: '删除' }))) return;
    mcpPatch(svc, (s) => ({ tools: s.tools.filter((x) => x.id !== t.id) }), { changed: true });
    addAudit('删除 MCP 工具', `${svc.name} · ${t.name}`);
    toast.success('已删除工具');
  };
  const toggleStatus = async () => {
    if (svc.status === 'enabled') {
      if (!(await confirmDialog({ title: `暂停「${svc.name}」？`, content: '暂停期间，AI 助手调用这个服务会收到错误。可以随时重新启用。', okText: '暂停' }))) return;
      mcpPatch(svc, { status: 'paused' });
      addAudit('暂停 MCP 服务', svc.name);
      toast.success('已暂停，AI 助手将无法调用');
    } else {
      mcpPatch(svc, { status: 'enabled' });
      addAudit('启用 MCP 服务', svc.name);
      toast.success('已启用');
    }
  };
  const toggleListed = async () => {
    if (svc.listed) {
      if (!(await confirmDialog({ title: '从 MCP 市场下架？', content: '下架后，其他成员在「全部服务」里仍能看到它，但不能再获取；已获取的成员不受影响。', okText: '下架' }))) return;
      mcpPatch(svc, { listed: false });
      addAudit('下架 MCP 服务', svc.name);
      toast.success('已从市场下架');
    } else {
      mcpPatch(svc, { listed: true });
      addAudit('上架 MCP 服务', svc.name);
      toast.success('已上架到企业内的 MCP 市场');
    }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `删除「${svc.name}」？`, content: '正在使用该服务的 AI 助手会立刻失去这些工具，删除后不可恢复。', danger: true, okText: '删除', confirmText: svc.name }))) return;
    removeFromList('mcpServices', svc.id);
    addAudit('删除 MCP 服务', svc.name);
    toast.success('已删除');
    navigate('/mcp');
  };
  const onIssue = (issue) => {
    if (issue.toolId) { setTab('tools'); setToolView(issue.toolId); return; }
    if (issue.tab) setTab(issue.tab);
  };
  const tabDot = (t) => issues.some((i) => i.level === 'error' && (t === 'tools' ? i.toolId : i.tab === t));
  return html`<div className="page"><div className="page-inner">
    <${Breadcrumb} items=${[{ label: 'MCP 服务', to: '/mcp' }, { label: svc.name }]} />
    <div className="conn-hero">
      <${McpIcon} svc=${svc} size=${56} />
      <div className="grow">
        <div className="row"><h1 className="page-title">${svc.name}</h1><${Tag} tone=${MCP_STATUS[svc.status].tone} dot>${MCP_STATUS[svc.status].label}<//>${svc.draftChanged && svc.releases.length > 0 && html`<${Tag} tone="warning">有未发布的修改<//>`}${svc.listed && html`<${Tag} tone="info">已上架<//>`}</div>
        <p className="muted mcp-hero-desc">${svc.description}</p>
        <div className="row text-xs muted mcp-hero-meta"><span className="mono">${svc.key}</span><span>${svc.tools.length} 个工具</span><span>近 7 天调用 ${fmt.number(svc.calls7d)} 次</span><span>${svc.owner ? `所有者 ${personName(svc.owner)}` : '平台官方维护'}</span></div>
      </div>
      ${canEdit && html`<div className="row">
        <${Popover} placement="bottom-end" width=${380} trigger=${html`<${Button} icon=${errorCount ? 'CircleX' : warnCount ? 'TriangleAlert' : 'CircleCheck'} className=${cx('mcp-check', errorCount ? 'is-error' : warnCount ? 'is-warning' : 'is-ok')}>${issues.length ? `问题检查 · ${errorCount} 错误 ${warnCount} 警告` : '问题检查'}<//>`}>
          ${({ close }) => html`<${McpProblems} issues=${issues} onPick=${(i) => { close(); onIssue(i); }} />`}
        <//>
        <${Button} icon="Bug" onClick=${() => setDebugOpen(true)}>调试<//>
        <${Tooltip} content=${publishBlock}><${Button} variant="primary" icon="CloudUpload" disabled=${Boolean(publishBlock)} onClick=${() => setPublishOpen(true)}>发布<//><//>
        <${MoreMenu} size="md" width=${180} items=${[
          { label: '编辑服务信息', icon: 'PenLine', onClick: () => setInfoOpen(true) },
          svc.status === 'enabled'
            ? { label: '暂停服务', icon: 'CirclePause', onClick: toggleStatus }
            : { label: '启用服务', icon: 'CirclePlay', disabled: !svc.releases.length, desc: svc.releases.length ? '' : '发布后才能启用', onClick: toggleStatus },
          { label: svc.listed ? '从 MCP 市场下架' : '上架到 MCP 市场', icon: 'Store', disabled: !svc.releases.length, desc: svc.releases.length ? '' : '发布后才能上架', onClick: toggleListed },
          { label: '转移所有权', icon: 'ArrowRightLeft', onClick: () => setTransferOpen(true) },
          { divider: true },
          { label: '删除服务', icon: 'Trash2', danger: true, onClick: remove },
        ]} />
      </div>`}
      ${svc.type === 'official' && html`<${Button} variant="primary" icon=${svc.obtained ? 'Check' : 'Download'} disabled=${svc.obtained} onClick=${() => { mcpPatch(svc, { obtained: true }); addAudit('获取 MCP 服务', svc.name); toast.success('已获取，可以在「使用方式」中查看接入配置'); }}>${svc.obtained ? '已获取' : '获取'}<//>`}
    </div>
    ${svc.type === 'custom' && !canEdit && html`<div className="mcp-notice"><${Alert} tone="info">这个服务由 ${personName(svc.owner)} 开发和维护，你可以查看工具和接入方式；如需修改，请联系所有者。<//></div>`}
    <${Tabs} value=${tab} onChange=${setTab} items=${[
      { value: 'tools', label: '工具', count: svc.tools.length, dot: tabDot('tools') },
      { value: 'conn', label: '连接配置', dot: tabDot('conn') },
      { value: 'usage', label: '使用方式' },
      { value: 'scope', label: '可用范围', dot: tabDot('scope') },
      { value: 'releases', label: '发布记录', count: svc.releases.length },
    ]} />
    <div className="mcp-tab-body">
      ${tab === 'tools' && html`<${McpToolsTab} svc=${svc} canEdit=${canEdit} onOpen=${setToolView} onRemove=${removeTool} onNew=${(mode) => setWizard({ mode, key: uid('wz') })} />`}
      ${tab === 'conn' && html`<${McpConnTab} key=${`conn-${svc.id}`} svc=${svc} canEdit=${canEdit} />`}
      ${tab === 'usage' && html`<${McpUsage} svc=${svc} url=${url} canEdit=${canEdit} />`}
      ${tab === 'scope' && html`<${McpScopeTab} key=${`scope-${svc.id}`} svc=${svc} canEdit=${canEdit} />`}
      ${tab === 'releases' && html`<${Table} rowKey="version" columns=${[
        { key: 'v', title: '版本', width: 90, render: (r) => html`<b>${r.version}</b>` },
        { key: 'n', title: '发布描述', wrap: true, render: (r) => r.note || html`<span className="muted">未填写</span>` },
        { key: 't', title: '发布时间', width: 170, render: (r) => fmt.dateTime(r.publishedAt) },
        { key: 'p', title: '发布人', width: 110, render: (r) => (r.publisher ? personName(r.publisher) : '平台') },
      ]} data=${[...svc.releases].sort((a, b) => b.publishedAt - a.publishedAt)} empty=${html`<${Empty} size="sm" icon="History" title="还没有发布记录" description=${canEdit ? '添加工具后点击右上角「发布」，AI 助手才能使用这个服务。' : null} />`} />`}
    </div>
    ${wizard && html`<${McpToolWizard} key=${wizard.key} svc=${svc} mode=${wizard.mode} preset=${wizard.preset} onClose=${() => setWizard(null)} onCreate=${(tool) => { mcpPatch(svc, (s) => ({ tools: [...s.tools, tool] }), { changed: true }); addAudit('添加 MCP 工具', `${svc.name} · ${tool.name}`); setWizard(null); toast.success('工具已添加'); }} />`}
    ${toolView && html`<${McpToolDrawer} key=${toolView} svc=${svc} toolId=${toolView} readOnly=${readOnly} onClose=${() => setToolView(null)} />`}
    <${Drawer} open=${debugOpen} onClose=${() => setDebugOpen(false)} title="调试 MCP 服务" subtitle=${svc.name} width=${640}>
      ${debugOpen && html`<${McpDebug} svc=${svc} onUsage=${() => { setDebugOpen(false); setTab('usage'); }} />`}
    <//>
    ${publishOpen && html`<${McpPublishModal} svc=${svc} issues=${issues} onClose=${() => setPublishOpen(false)} onIssue=${(i) => { setPublishOpen(false); onIssue(i); }} />`}
    ${transferOpen && html`<${McpTransferModal} svc=${svc} onClose=${() => setTransferOpen(false)} />`}
    ${infoOpen && html`<${McpInfoModal} svc=${svc} onClose=${() => setInfoOpen(false)} />`}
  </div></div>`;
}

function McpProblems({ issues, onPick }) {
  if (!issues.length) return html`<div className="mcp-issues-empty"><${Icon} name="CircleCheck" size=${16} /><span>没有发现问题，可以发布</span></div>`;
  return html`<div className="mcp-issues">
    <div className="mcp-issues-head">共 ${issues.length} 个问题，错误需要修复后才能发布</div>
    ${issues.map((i, idx) => html`<button key=${`${idx}-${i.text}`} type="button" className="mcp-issue" onClick=${() => onPick(i)}>
      <${Icon} name=${i.level === 'error' ? 'CircleX' : 'TriangleAlert'} size=${14} className=${i.level === 'error' ? 'is-error' : 'is-warning'} />
      <span className="grow">${i.text}</span>
      <${Icon} name="ChevronRight" size=${14} className="muted" />
    </button>`)}
  </div>`;
}

function McpToolsTab({ svc, canEdit, onOpen, onRemove, onNew }) {
  const state = useStore();
  const newMenu = html`<${Dropdown} width=${210} trigger=${html`<${Button} variant="primary" icon="Plus" iconRight="ChevronDown">新建工具<//>`} items=${[
    { label: '从连接器新建', icon: 'Plug', desc: '选择一个连接器操作', onClick: () => onNew('connector') },
    { label: '从工作流新建', icon: 'Workflow', desc: '需要已发布的子流程触发器工作流', onClick: () => onNew('workflow') },
  ]} />`;
  return html`<${Fragment}>
    ${canEdit && html`<div className="toolbar"><span className="text-xs muted">工具名称和描述会直接给到大模型，写清楚「什么时候用、需要什么参数」</span><span className="spacer" />${newMenu}</div>`}
    <${Table}
      onRowClick=${(t) => onOpen(t.id)}
      columns=${[
        { key: 'n', title: '工具', render: (t) => html`<div className="cell-main">${t.source.type === 'workflow' ? html`<${KindTile} icon="Workflow" size=${28} />` : html`<${ConnectorIcon} id=${t.source.connector} size=${28} />`}<div className="mcp-cell-text"><div className="cell-title">${t.title}</div><div className="cell-sub mono">${t.name}</div></div></div>` },
        { key: 'd', title: '工具描述', wrap: true, render: (t) => html`<span className="mcp-desc-cell"><span className="muted">${t.description || '未填写'}</span>${canEdit && String(t.description || '').trim().length < 10 && html`<${Tag} size="sm" tone="warning">描述过短<//>`}</span>` },
        { key: 's', title: '来源', width: 210, render: (t) => { const src = mcpSourceLabel(state, t.source); return html`<span className=${cx('mcp-source', src.broken && 'is-broken')} title=${src.text}><${Icon} name=${t.source.type === 'workflow' ? 'Workflow' : 'Plug'} size=${13} /><span>${src.text}</span></span>`; } },
        { key: 'p', title: '入参', width: 190, render: (t) => (t.params.length
          ? html`<${Tooltip} content=${html`<div className="mcp-param-tip">${t.params.map((p) => html`<div key=${p.name}><span className="mono">${p.name}</span> · ${(MCP_PARAM_MODES.find((m) => m.value === mcpParamMode(p)) || MCP_PARAM_MODES[0]).label}</div>`)}</div>`}><span className="mcp-params mono">${t.params.map((p) => p.name).join('、')}</span><//>`
          : html`<span className="muted">无</span>`) },
        { key: 'o', title: '', width: 56, render: (t) => canEdit && html`<${MoreMenu} items=${[{ label: '编辑', icon: 'PenLine', onClick: () => onOpen(t.id) }, { label: '删除', icon: 'Trash2', danger: true, onClick: () => onRemove(t) }]} />` },
      ]}
      data=${svc.tools}
      empty=${html`<${Empty} icon="Wrench" title="还没有工具" description=${canEdit ? '从连接器操作或已发布的子流程工作流新建工具。' : '服务所有者还没有添加工具。'} action=${canEdit ? newMenu : null} />`}
    />
  <//>`;
}

function McpToolDrawer({ svc, toolId, readOnly, onClose }) {
  const state = useStore();
  const tool = svc.tools.find((t) => t.id === toolId);
  const [synced] = useState(() => (tool ? mcpSyncParams(state, tool) : null));
  const [draft, setDraft] = useState(synced ? synced.tool : null);
  if (!tool || !draft) return null;
  const siblings = svc.tools.filter((t) => t.id !== tool.id).map((t) => t.name);
  const errors = readOnly ? {} : mcpToolErrors(draft, siblings);
  const valid = !Object.keys(errors).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(tool);
  const save = () => {
    const clean = { ...draft, name: draft.name.trim(), title: draft.title.trim(), description: draft.description.trim() };
    mcpPatch(svc, (s) => ({ tools: s.tools.map((t) => (t.id === tool.id ? clean : t)) }), { changed: true });
    addAudit('编辑 MCP 工具', `${svc.name} · ${clean.name}`);
    toast.success('已保存工具');
    onClose();
  };
  return html`<${Drawer} open=${true} onClose=${onClose} title=${readOnly ? '工具详情' : '编辑工具'} subtitle=${tool.title} width=${640} footer=${readOnly ? null : html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid || !dirty} onClick=${save}>保存<//><//>`}>
    <${McpToolForm} tool=${draft} onChange=${setDraft} errors=${errors} readOnly=${readOnly} removed=${readOnly ? [] : synced.removed} />
  <//>`;
}

function McpToolForm({ tool, onChange, errors = {}, readOnly, removed = [] }) {
  const state = useStore();
  const meta = mcpSourceParams(state, tool.source) || [];
  const src = mcpSourceLabel(state, tool.source);
  const setParam = (name, patch) => onChange({ ...tool, params: tool.params.map((p) => (p.name === name ? { ...p, ...patch } : p)) });
  const errOf = (k) => errors[k] || null;
  const shortDesc = !errors.description && String(tool.description || '').trim().length < 10;
  if (readOnly) {
    return html`<div className="mcp-tool-view">
      <div className="kv">
        <div><span>工具名称</span><span className="mono">${tool.name}</span></div>
        <div><span>展示名称</span><span>${tool.title}</span></div>
        <div><span>工具描述</span><span>${tool.description || '未填写'}</span></div>
        <div><span>来源</span><span className=${cx(src.broken && 'mcp-broken-text')}>${src.text}</span></div>
      </div>
      <div className="mcp-form-title">工具入参（${tool.params.length}）</div>
      ${tool.params.map((p) => html`<div key=${p.name} className="cond-group mcp-param">
        <div className="mcp-param-head"><span className="mono mcp-param-name">${p.name}</span><span className="muted text-xs grow">${p.desc}</span><${Tag} size="sm">${(MCP_PARAM_MODES.find((m) => m.value === mcpParamMode(p)) || MCP_PARAM_MODES[0]).label}<//></div>
        <div className="text-xs muted">${mcpParamMode(p) === 'ai' ? p.hint || '由 AI 根据对话内容推断' : mcpParamMode(p) === 'context' ? (MCP_CONTEXT_KEYS.find((k) => k.value === p.value) || MCP_CONTEXT_KEYS[0]).label : p.value}</div>
      </div>`)}
      ${tool.params.length === 0 && html`<div className="text-xs muted">该工具没有入参</div>`}
    </div>`;
  }
  return html`<div className="mcp-tool-form">
    <${Field} label="工具名称" required hint="小写字母、数字和下划线，大模型用它调用工具" error=${errOf('name')}>
      <${Input} mono value=${tool.name} onChange=${(v) => onChange({ ...tool, name: v.slice(0, 64) })} invalid=${Boolean(errOf('name'))} />
    <//>
    <${Field} label="展示名称" required error=${errOf('title')}>
      <${CharInput} value=${tool.title} onChange=${(v) => onChange({ ...tool, title: v })} max=${30} invalid=${Boolean(errOf('title'))} />
    <//>
    <${Field} label="工具描述" required hint=${shortDesc ? '描述过短，AI 可能无法判断什么时候使用这个工具' : '写清楚什么时候应该调用它、会返回什么，AI 会据此选择工具'} error=${errOf('description')}>
      <${CharTextarea} value=${tool.description} onChange=${(v) => onChange({ ...tool, description: v })} max=${500} rows=${3} />
    <//>
    <${Field} label="来源">
      <div className=${cx('mcp-source', 'is-block', src.broken && 'is-broken')}>${tool.source.type === 'workflow' ? html`<${KindTile} icon="Workflow" size=${22} />` : html`<${ConnectorIcon} id=${tool.source.connector} size=${22} />`}<span>${src.text}</span></div>
    <//>
    <div className="mcp-form-title">工具入参（${tool.params.length}）</div>
    ${removed.length > 0 && html`<div className="mcp-notice"><${Alert} tone="warning">来源中已经没有 ${removed.map((p) => p.name).join('、')}，保存后会从工具中移除。<//></div>`}
    ${tool.params.map((p) => {
      const mode = mcpParamMode(p);
      const m = meta.find((x) => x.name === p.name);
      const def = m ? m.def : { type: 'var' };
      const err = errors.params && errors.params[p.name];
      const others = tool.params.filter((x) => x.name !== p.name && mcpParamMode(x) !== 'ref');
      const fixedInput = def.type === 'select'
        ? html`<${Select} size="sm" value=${p.value || null} onChange=${(v) => setParam(p.name, { value: v })} options=${(def.options || []).map((o) => ({ value: o, label: o }))} placeholder="选择固定值" invalid=${Boolean(err)} />`
        : def.type === 'switch'
          ? html`<${Select} size="sm" value=${p.value || null} onChange=${(v) => setParam(p.name, { value: v })} options=${[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} placeholder="选择固定值" invalid=${Boolean(err)} />`
          : html`<${Input} size="sm" value=${p.value || ''} onChange=${(v) => setParam(p.name, { value: v })} placeholder="固定值，AI 看不到这个参数" invalid=${Boolean(err)} />`;
      return html`<div key=${p.name} className=${cx('cond-group', 'mcp-param', err && 'has-error')}>
        <div className="mcp-param-head">
          <span className="mono mcp-param-name">${p.name}</span>
          ${m && m.required && html`<${Tag} size="sm" tone="warning">必填<//>`}
          <span className="muted text-xs grow">${p.desc}</span>
          <${Select} size="sm" width=${132} value=${mode} onChange=${(v) => setParam(p.name, { mode: v, value: v === 'context' ? 'user_email' : '' })} options=${MCP_PARAM_MODES} />
        </div>
        ${mode === 'ai' && html`<${Input} size="sm" value=${p.hint || ''} onChange=${(v) => setParam(p.name, { hint: v.slice(0, 200) })} placeholder="给 AI 的填写提示（可选），例如：6 位以上工号" />`}
        ${mode === 'fixed' && fixedInput}
        ${mode === 'ref' && html`<div className="col mcp-ref">
          <${Input} size="sm" mono value=${p.value || ''} onChange=${(v) => setParam(p.name, { value: v })} placeholder=${others[0] ? `例如：{{${others[0].name}}}` : '例如：{{summary}}'} invalid=${Boolean(err)} />
          ${others.length > 0 && html`<div className="mcp-ref-chips"><span className="text-xs muted">插入</span>${others.map((o) => html`<button key=${o.name} type="button" className="mcp-ref-chip mono" onClick=${() => setParam(p.name, { value: `${p.value || ''}{{${o.name}}}` })}>${`{{${o.name}}}`}</button>`)}</div>`}
        </div>`}
        ${mode === 'context' && html`<${Select} size="sm" value=${p.value || 'user_email'} onChange=${(v) => setParam(p.name, { value: v })} options=${MCP_CONTEXT_KEYS} />`}
        ${err && html`<div className="field-error">${err}</div>`}
      </div>`;
    })}
    ${tool.params.length === 0 && html`<div className="text-xs muted">该工具没有入参</div>`}
  </div>`;
}

function McpToolWizard({ svc, mode, preset, onClose, onCreate }) {
  const state = useStore();
  const isConn = mode === 'connector';
  const [step, setStep] = useState(preset ? 2 : 0);
  const [a, setA] = useState(preset ? preset.connector : null);
  const [b, setB] = useState(preset ? preset.op : null);
  const [tool, setTool] = useState(() => (preset ? mcpBuildTool(state, svc, { type: 'connector', connector: preset.connector, op: preset.op }) : null));
  const [q, setQ] = useState('');
  const titles = isConn ? ['选择连接器', '选择操作', '确认信息'] : ['选择项目', '选择工作流', '确认信息'];
  const connectors = [...publishedCustomConnectors(state).filter((c) => c.actions.length), ...CONNECTORS.filter((c) => !c.builtin && c.actions.length)];
  const ql = q.trim().toLowerCase();
  const shown = connectors.filter((c) => !ql || `${c.name}${c.id}${c.desc || ''}`.toLowerCase().includes(ql));
  const myProjects = state.projects.filter((p) => projectRole(state, p.id));
  const project = state.projects.find((p) => p.id === a);
  const viewerOnly = !isConn && project && !canEditProject(state, project.id);
  const projectWfs = !isConn && a ? state.workflows.filter((w) => w.projectId === a) : [];
  const usedWfs = svc.tools.filter((t) => t.source.type === 'workflow').map((t) => t.source.workflowId);
  const siblings = svc.tools.map((t) => t.name);
  const errors = tool ? mcpToolErrors(tool, siblings) : {};
  const next = () => {
    if (step === 1) {
      const source = isConn ? { type: 'connector', connector: a, op: b } : { type: 'workflow', workflowId: b };
      if (!tool || JSON.stringify(tool.source) !== JSON.stringify(source)) setTool(mcpBuildTool(state, svc, source));
    }
    setStep(step + 1);
  };
  const pickA = (v) => { if (v !== a) { setA(v); setB(null); } };
  const canNext = step === 0 ? Boolean(a) : step === 1 ? Boolean(b) : true;
  const create = () => onCreate({ ...tool, name: tool.name.trim(), title: tool.title.trim(), description: tool.description.trim() });
  return html`<${Modal} open=${true} onClose=${onClose} title=${`${isConn ? '从连接器新建工具' : '从工作流新建工具'}`} description=${`第 ${step + 1} 步，共 3 步：${titles[step]}`} width=${720} footer=${html`<${Fragment}>
    <${Button} onClick=${step === 0 ? onClose : () => setStep(step - 1)}>${step === 0 ? '取消' : '上一步'}<//>
    ${step < 2 ? html`<${Button} variant="primary" disabled=${!canNext} onClick=${next}>下一步<//>` : html`<${Button} variant="primary" disabled=${Object.keys(errors).length > 0} onClick=${create}>创建工具<//>`}
  <//>`}>
    <${Steps} current=${step} items=${titles.map((t) => ({ title: t }))} />
    <div className="mcp-wizard-body">
      ${step === 0 && isConn && html`<${Fragment}>
        <${Input} icon="Search" placeholder="搜索连接器" value=${q} onChange=${setQ} allowClear autoFocus />
        ${shown.length === 0
          ? html`<${Empty} size="sm" icon="SearchX" title="没有找到连接器" description="换个关键词试试；自定义连接器需要先在连接器开发中发布。" />`
          : html`<div className="ptile-grid mcp-conn-grid">
            ${shown.map((c) => html`<button key=${c.id} type="button" className=${cx('ptile', 'corner-check', a === c.id && 'is-active')} onClick=${() => pickA(c.id)} title=${c.desc || c.name}><${ConnectorIcon} connector=${c} size=${36} /><span className="ptile-name">${c.name}</span>${c.custom && html`<span className="ptile-badge">自定义</span>`}</button>`)}
          </div>`}
      <//>`}
      ${step === 0 && !isConn && html`<div className="col mcp-pick-list">
        ${myProjects.map((p) => {
          const usable = state.workflows.filter((w) => w.projectId === p.id && !mcpWorkflowBlock(state, w)).length;
          return html`<button key=${p.id} type="button" className=${cx('opcard', a === p.id && 'is-active')} onClick=${() => pickA(p.id)}>
            <span className="row"><${ProjectAvatar} project=${p} size=${22} /><span className="opcard-name grow">${p.name}</span>${!canEditProject(state, p.id) && html`<${Tag} size="sm">可查看<//>`}<span className="text-xs muted">${usable ? `${usable} 个可用工作流` : '没有可用工作流'}</span></span>
          </button>`;
        })}
      </div>`}
      ${step === 1 && isConn && html`<${OperationList} connector=${resolveConnector(a)} mode="action" selected=${b} onPick=${(o) => setB(o.key)} />`}
      ${step === 1 && !isConn && html`<${Fragment}>
        ${projectWfs.length === 0
          ? html`<${Empty} size="sm" icon="Workflow" title=${`「${project ? project.name : ''}」还没有工作流`} description="在项目里创建一个以「子流程触发器」开始的工作流并发布后，就能把它开放为 MCP 工具。" />`
          : html`<${Fragment}>
            <div className="text-xs muted mcp-pick-hint">只有已发布、并且触发器是「子流程触发器」的工作流可以作为工具，子流程触发器的参数就是工具的入参。</div>
            ${viewerOnly && html`<div className="mcp-notice"><${Alert} tone="warning">你在「${project.name}」中只有查看权限，不能把它的工作流开放为工具。<//></div>`}
            <div className="col mcp-pick-list">
              ${[...projectWfs].sort((x, y) => Number(Boolean(mcpWorkflowBlock(state, x))) - Number(Boolean(mcpWorkflowBlock(state, y)))).map((w) => {
                const block = viewerOnly ? '只有查看权限' : mcpWorkflowBlock(state, w) || (usedWfs.includes(w.id) ? '已添加为工具' : null);
                return html`<button key=${w.id} type="button" disabled=${Boolean(block)} className=${cx('opcard', b === w.id && 'is-active', block && 'is-disabled')} onClick=${() => setB(w.id)}>
                  <span className="row"><${WorkflowGlyph} wf=${w} size=${18} /><span className="opcard-name grow">${w.name}</span>${block && html`<${Tag} size="sm">${block}<//>`}</span>
                  <span className="opcard-desc">${w.description || '无描述'}</span>
                </button>`;
              })}
            </div>
          <//>`}
      <//>`}
      ${step === 2 && tool && html`<${McpToolForm} tool=${tool} onChange=${setTool} errors=${errors} />`}
    </div>
  <//>`;
}

function McpConnTab({ svc, canEdit }) {
  const state = useStore();
  const saved = { mode: svc.credentialMode || 'developer', fixed: svc.fixedConnections || {} };
  const [mode, setMode] = useState(saved.mode);
  const [fixed, setFixed] = useState(saved.fixed);
  const cids = mcpToolConnectors(svc);
  const dirty = mode !== saved.mode || cids.some((cid) => (fixed[cid] || null) !== (saved.fixed[cid] || null));
  const issueOf = (cid) => (mode === 'developer' ? mcpFixedIssue(state, svc, fixed[cid]) : null);
  const blocking = cids.some((cid) => { const i = issueOf(cid); return fixed[cid] && i && i.level === 'error'; });
  const save = () => {
    const pruned = Object.fromEntries(cids.filter((cid) => fixed[cid]).map((cid) => [cid, fixed[cid]]));
    mcpPatch(svc, { credentialMode: mode, fixedConnections: pruned }, { changed: true });
    addAudit('修改 MCP 服务连接配置', svc.name);
    toast.success('已保存连接配置');
  };
  const reset = () => { setMode(saved.mode); setFixed(saved.fixed); };
  const names = cids.map((cid) => resolveConnector(cid).name).join('、');
  return html`<div className="mcp-narrow">
    <${RadioCards} columns=${1} value=${mode} disabled=${!canEdit} onChange=${setMode} options=${MCP_CRED_MODES} />
    <div className="mcp-conn-body">
      ${cids.length === 0 && html`<div className="text-xs muted">${svc.tools.length ? '这个服务的工具不需要连接：工作流工具使用工作流里配置的连接。' : '添加来自连接器的工具后，在这里配置它们使用的连接。'}</div>`}
      ${cids.length > 0 && mode === 'developer' && html`<${Fragment}>
        <div className="mcp-form-title">为每个连接器选择固定连接</div>
        ${cids.map((cid) => {
          const c = resolveConnector(cid);
          const options = state.connections.filter((x) => x.connector === cid && connectionPerm(state, x, svc.owner || state.me)).map((x) => ({ value: x.id, label: x.name, desc: `${CONN_STATUS[x.status].label} · ${x.account}`, iconNode: html`<${ConnectorIcon} id=${cid} size=${16} />` }));
          const issue = issueOf(cid);
          const current = state.connections.find((x) => x.id === fixed[cid]);
          return html`<${Field} key=${cid} label=${`${c.name} 连接`} layout="horizontal" error=${canEdit && issue && issue.level === 'error' ? issue.text : null} hint=${issue && issue.level === 'warning' ? issue.text : null}>
            ${canEdit
              ? (options.length
                ? html`<${Select} value=${fixed[cid] || null} onChange=${(v) => setFixed({ ...fixed, [cid]: v })} options=${options} placeholder="选择连接" invalid=${Boolean(issue && issue.level === 'error')} />`
                : html`<div className="mcp-empty-line"><span className="text-xs muted">你还没有可用的「${c.name}」连接</span><${Button} size="sm" variant="link" onClick=${() => navigate('/connections')}>前往新建<//></div>`)
              : html`<span className="mcp-readonly-value">${current ? current.name : '未选择'}</span>`}
          <//>`;
        })}
      <//>`}
      ${cids.length > 0 && mode === 'consumer' && html`<${Alert} tone="info">获取这个服务的团队需要为 ${names} 选择自己的连接，调用时使用他们的连接。<//>`}
      ${cids.length > 0 && mode === 'user' && html`<${Alert} tone="info">每位用户第一次调用需要 ${names} 的工具时，客户端会给出授权链接；授权后按个人权限访问数据。<//>`}
    </div>
    ${canEdit && html`<div className="mcp-save-bar">
      ${dirty && html`<span className="text-xs muted">有未保存的修改</span>`}
      <span className="spacer" />
      <${Button} disabled=${!dirty} onClick=${reset}>取消<//>
      <${Button} variant="primary" disabled=${!dirty || blocking} onClick=${save}>保存<//>
    </div>`}
  </div>`;
}

function McpScopeTab({ svc, canEdit }) {
  const state = useStore();
  const saved = mcpScope(svc);
  const [mode, setMode] = useState(saved.mode);
  const [targets, setTargets] = useState(saved.targets);
  const active = state.users.filter((u) => u.status !== 'disabled');
  const depts = [...new Set(active.map((u) => u.dept).filter(Boolean))];
  const options = [
    { group: '部门' },
    ...depts.map((d) => ({ value: d, label: d, icon: 'Building2' })),
    { group: '成员' },
    ...active.map((u) => ({ value: u.id, label: u.name, desc: `${u.dept} · ${u.email}`, iconNode: html`<${Avatar} name=${u.name} size=${18} />` })),
  ];
  const labelOf = (t) => { const u = state.users.find((x) => x.id === t); return u ? u.name : t; };
  const covered = mode === 'all' ? active.length : active.filter((u) => targets.includes(u.dept) || targets.includes(u.id)).length;
  const dirty = mode !== saved.mode || JSON.stringify(mode === 'part' ? targets : []) !== JSON.stringify(saved.mode === 'part' ? saved.targets : []);
  const error = mode === 'part' && !targets.length ? '请至少选择一个部门或成员' : null;
  const save = () => {
    mcpPatch(svc, { scope: mode, scopeTargets: mode === 'part' ? targets : [] });
    addAudit('修改 MCP 服务可用范围', svc.name);
    toast.success('已保存可用范围，立即生效');
  };
  if (!canEdit) {
    return html`<div className="mcp-narrow"><div className="kv">
      <div><span>人员可用范围</span><span>${saved.mode === 'all' ? '全员' : saved.targets.map(labelOf).join('、') || '未选择'}</span></div>
      <div><span>覆盖人数</span><span>${covered} 人</span></div>
    </div></div>`;
  }
  return html`<div className="mcp-narrow">
    <${Field} label="人员可用范围" hint="只有范围内的成员可以在 AI 助手里连接和调用这个服务，保存后立即生效，不需要重新发布">
      <${RadioGroup} value=${mode} onChange=${setMode} options=${[{ value: 'all', label: '全员' }, { value: 'part', label: '指定部门或成员' }]} />
    <//>
    ${mode === 'part' && html`<${Field} label="部门或成员" required error=${dirty ? error : null}>
      <${Select} multiple searchable value=${targets} onChange=${setTargets} options=${options} placeholder="搜索部门或成员" invalid=${Boolean(dirty && error)} />
    <//>`}
    <div className="text-xs muted">当前范围覆盖 ${covered} 位成员${mode === 'part' && targets.length ? `：${targets.map(labelOf).join('、')}` : ''}</div>
    <div className="mcp-save-bar">
      ${dirty && html`<span className="text-xs muted">有未保存的修改</span>`}
      <span className="spacer" />
      <${Button} disabled=${!dirty} onClick=${() => { setMode(saved.mode); setTargets(saved.targets); }}>取消<//>
      <${Button} variant="primary" disabled=${!dirty || Boolean(error)} onClick=${save}>保存<//>
    </div>
  </div>`;
}

function McpPublishModal({ svc, issues, onClose, onIssue }) {
  const state = useStore();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const version = mcpNextVersion(svc);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const noteError = !note.trim() ? '请填写发布描述' : null;
  const publish = () => {
    const status = svc.status === 'paused' ? 'paused' : 'enabled';
    mcpPatch(svc, (s) => ({ status, draftChanged: false, releases: [{ version, publishedAt: Date.now(), publisher: state.me, note: note.trim() }, ...s.releases] }));
    addAudit('发布 MCP 服务', `${svc.name} ${version}`);
    onClose();
    toast.success(status === 'paused' ? `已发布 ${version}，服务仍处于暂停状态` : `已发布 ${version}，服务已启用`);
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${`发布 ${version}`} description=${svc.name} width=${540} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${errors.length > 0 || Boolean(noteError)} onClick=${publish}>发布<//><//>`}>
    ${errors.length > 0
      ? html`<div className="mcp-notice"><${Alert} tone="danger" title=${`有 ${errors.length} 个错误需要先修复`}>
        <div className="mcp-issue-links">${errors.map((i, idx) => html`<a key=${`${idx}-${i.text}`} className="link" onClick=${() => onIssue(i)}>${i.text}</a>`)}</div>
      <//></div>`
      : html`<div className="mcp-notice"><${Alert} tone="info">发布后，已连接该服务的 AI 助手会在下次会话中看到最新的工具列表。${warnings.length ? ` 另有 ${warnings.length} 个警告，不影响发布。` : ''}<//></div>`}
    <${Field} label="本次包含的工具">
      <div className="mcp-release-tools">${svc.tools.map((t) => html`<${Tag} key=${t.id} size="sm"><span className="mono">${t.name}</span><//>`)}</div>
    <//>
    <${Field} label="发布描述" required error=${touched ? noteError : null}>
      <${CharTextarea} value=${note} onChange=${(v) => { setNote(v); setTouched(true); }} max=${200} rows=${3} placeholder="说明这次新增或修改了哪些工具" />
    <//>
  <//>`;
}

function McpTransferModal({ svc, onClose }) {
  const state = useStore();
  const [to, setTo] = useState(null);
  const candidates = state.users.filter((u) => u.status === 'active' && u.id !== svc.owner && (u.modules || []).includes('mcp'));
  const confirm = () => {
    mcpPatch(svc, { owner: to });
    addAudit('转移 MCP 服务所有权', `${svc.name} → ${personName(to)}`);
    toast.success(`已把「${svc.name}」转移给 ${personName(to)}`);
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="转移所有权" description=${svc.name} width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!to} onClick=${confirm}>转移<//><//>`}>
    <div className="mcp-notice"><${Alert} tone="warning">转移后，你将不能再编辑、发布或删除这个服务；新的所有者可以管理它的工具、连接和 API Key。<//></div>
    ${candidates.length
      ? html`<${Field} label="新的所有者" required hint="只能转移给拥有「MCP 服务」模块权限的成员">
        <${Select} searchable value=${to} onChange=${setTo} placeholder="选择成员" options=${candidates.map((u) => ({ value: u.id, label: u.name, desc: u.email, iconNode: html`<${Avatar} name=${u.name} size=${20} />` }))} />
      <//>`
      : html`<${Empty} size="sm" icon="UserX" title="没有可以转移的成员" description="只有拥有「MCP 服务」模块权限的正常成员可以接收，可以先在管理后台的用户管理中分配权限。" />`}
  <//>`;
}

function McpUsage({ svc, url, canEdit }) {
  const [client, setClient] = useState('cursor');
  const key = svc.apiKey || '';
  const masked = mcpMask(key);
  const build = (k) => ({
    cursor: `{\n  "mcpServers": {\n    "${svc.key}": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${k}" }\n    }\n  }\n}`,
    'claude-code': `claude mcp add --transport http ${svc.key} ${url} \\\n  --header "Authorization: Bearer ${k}"`,
    json: `{\n  "mcpServers": {\n    "${svc.key}": {\n      "type": "http",\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${k}" }\n    }\n  }\n}`,
  });
  const shown = build(masked)[client];
  const full = build(key)[client];
  const notes = {
    cursor: '粘贴到项目的 .cursor/mcp.json 或全局的 ~/.cursor/mcp.json，保存后在 Cursor 设置的 MCP 页面确认服务已连接。',
    'claude-code': '在终端执行这条命令；加上 --scope project 会写入项目根目录的 .mcp.json，方便与团队共享。',
    json: '适用于支持 Streamable HTTP 的 MCP 客户端，例如 Claude Code 的 .mcp.json。其他客户端按各自的格式填写服务地址和 Authorization 请求头即可。',
  };
  const reset = async () => {
    if (!(await confirmDialog({ title: '重置 API Key？', content: '旧 Key 会立即失效，所有使用旧 Key 的客户端都需要更新配置。', okText: '重置', danger: true }))) return;
    mcpPatch(svc, { apiKey: mcpSecret() });
    addAudit('重置 MCP 服务 API Key', svc.name);
    toast.success('已重置，请复制新的 Key 更新客户端配置');
  };
  return html`<div className="mcp-usage">
    ${!svc.releases.length && html`<div className="mcp-notice"><${Alert} tone="warning">服务还没有发布，客户端暂时无法连接。${canEdit ? '添加工具并发布后即可使用。' : ''}<//></div>`}
    ${svc.releases.length > 0 && svc.status === 'paused' && html`<div className="mcp-notice"><${Alert} tone="warning">服务已暂停，客户端调用会返回错误。<//></div>`}
    <${Field} label="服务地址"><div className="webhook-url"><span className="url">${url}</span><${CopyButton} text=${url} /></div><//>
    <${Field} label="API Key" help="客户端用它鉴权；复制时会复制完整的 Key">
      <div className="webhook-url"><span className="url">${masked}</span><${CopyButton} text=${key} />${canEdit && html`<${Button} size="sm" variant="ghost" icon="RotateCcw" onClick=${reset}>重置<//>`}</div>
    <//>
    ${svc.credentialMode === 'user' && html`<div className="text-xs muted mcp-usage-tip">这个服务由使用者本人授权：每位用户第一次调用时，客户端会给出授权链接。</div>`}
    <div className="mcp-form-title">添加到客户端</div>
    <${Tabs} value=${client} onChange=${setClient} items=${[{ value: 'cursor', label: 'Cursor' }, { value: 'claude-code', label: 'Claude Code' }, { value: 'json', label: '其他客户端' }]} extra=${html`<${CopyButton} text=${full} label="复制全部" />`} />
    <div className="mcp-code"><${CodeBlock} code=${shown} /></div>
    <div className="text-xs muted mcp-usage-tip">${notes[client]}复制的内容包含完整的 API Key，请不要提交到公开仓库。</div>
  </div>`;
}

function McpDebug({ svc, onUsage }) {
  const state = useStore();
  const [view, setView] = useState('direct');
  const [toolId, setToolId] = useState(svc.tools[0] ? svc.tools[0].id : null);
  const [values, setValues] = useState({});
  const [tried, setTried] = useState(false);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const t = svc.tools.find((x) => x.id === toolId);
  const meta = t ? mcpSourceParams(state, t.source) || [] : [];
  const me = state.users.find((u) => u.id === state.me) || {};
  const ctxValue = (k) => ({ user_email: me.email, user_id: state.me, user_name: me.name, client: 'Claude Code' }[k] || '');
  const aiParams = t ? t.params.filter((p) => mcpParamMode(p) === 'ai') : [];
  const missing = aiParams.filter((p) => { const m = meta.find((x) => x.name === p.name); return m && m.required && !String(values[p.name] || '').trim(); });
  const args = () => {
    const base = Object.fromEntries(t.params.map((p) => {
      const mode = mcpParamMode(p);
      if (mode === 'ai') return [p.name, values[p.name] || ''];
      if (mode === 'context') return [p.name, ctxValue(p.value || 'user_email')];
      return [p.name, p.value || ''];
    }));
    return Object.fromEntries(Object.entries(base).map(([k, v]) => {
      const p = t.params.find((x) => x.name === k);
      return [k, mcpParamMode(p) === 'ref' ? String(v).replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, name) => (base[name] !== undefined ? base[name] : m)) : v];
    }).filter(([, v]) => v !== ''));
  };
  const outcome = () => {
    const src = mcpSourceIssue(state, t.source);
    if (src && src.level === 'error') return { isError: true, data: src.text };
    if (t.source.type === 'workflow') return { isError: false, data: { status: 'success', output: (SAMPLE_OUTPUT['subflows.call'] || {}).result || {} } };
    const c = resolveConnector(t.source.connector);
    if (c.auth !== 'none') {
      const conn = svc.credentialMode === 'developer'
        ? state.connections.find((x) => x.id === (svc.fixedConnections || {})[c.id])
        : state.connections.find((x) => x.connector === c.id && connectionPerm(state, x) && x.status === 'active') || state.connections.find((x) => x.connector === c.id && connectionPerm(state, x));
      if (!conn) return { isError: true, data: svc.credentialMode === 'developer' ? `还没有为「${c.name}」选择固定连接` : `你还没有可用的「${c.name}」连接` };
      if (conn.status !== 'active') return { isError: true, data: `连接「${conn.name}」${CONN_STATUS[conn.status].reason}` };
    }
    const cc = c.custom && state.customConnectors.find((x) => x.id === c.id);
    const sample = cc ? (cc.actions.find((x) => x.key === t.source.op) || {}).sample : SAMPLE_OUTPUT[`${c.id}.${t.source.op}`];
    return { isError: false, data: sample || { ok: true } };
  };
  const run = () => {
    setTried(true);
    if (missing.length) return;
    setRunning(true);
    setRes(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const out = outcome();
      setRunning(false);
      setRes({ args: args(), ...out });
      if (out.isError) toast.error('调用返回错误');
      else toast.success('调用成功');
    }, 900);
  };
  return html`<div className="mcp-debug">
    <${Segmented} value=${view} onChange=${setView} options=${[{ value: 'direct', label: '直接调试' }, { value: 'agent', label: '在 AI 助手中调试' }]} />
    ${view === 'agent' && html`<div className="mcp-debug-agent">
      <ol className="mcp-steps">
        <li>在「使用方式」里复制配置，把服务添加到 Cursor 或 Claude Code。</li>
        <li>在客户端里用自然语言描述任务，例如「帮我查一下工号 XH20210311 的员工信息」。</li>
        <li>客户端会显示它选择了哪个工具、传了什么参数，据此调整工具名称和描述。</li>
      </ol>
      <${Button} icon="Plug" onClick=${onUsage}>查看接入方式<//>
    </div>`}
    ${view === 'direct' && (svc.tools.length === 0 ? html`<${Empty} size="sm" icon="Wrench" title="先添加工具再调试" />` : html`<div className="mcp-debug-form">
      <${Field} label="工具"><${Select} value=${toolId} onChange=${(v) => { setToolId(v); setValues({}); setRes(null); setTried(false); }} options=${svc.tools.map((x) => ({ value: x.id, label: x.title, desc: x.name }))} /><//>
      ${t && t.params.map((p) => {
        const mode = mcpParamMode(p);
        const m = meta.find((x) => x.name === p.name);
        const err = tried && missing.includes(p) ? '请填写这个参数' : null;
        return html`<${Field} key=${p.name} label=${html`<span><span className="mono">${p.name}</span>${p.desc ? `（${p.desc}）` : ''}</span>`} required=${Boolean(m && m.required && mode === 'ai')} error=${err} hint=${mode === 'ai' ? p.hint || '正式调用时由 AI 推断，调试时手动填写' : null}>
          ${mode === 'ai'
            ? html`<${Input} value=${values[p.name] || ''} onChange=${(v) => setValues({ ...values, [p.name]: v })} invalid=${Boolean(err)} />`
            : html`<div className="mcp-readonly-value">${mode === 'context' ? `${(MCP_CONTEXT_KEYS.find((k) => k.value === p.value) || MCP_CONTEXT_KEYS[0]).label}：${ctxValue(p.value || 'user_email')}` : mode === 'ref' ? `引用值：${p.value}` : `固定值：${p.value}`}</div>`}
        <//>`;
      })}
      <div><${Button} variant="primary" icon="Play" loading=${running} onClick=${run}>调用<//></div>
      ${res && html`<div className="mcp-debug-result">
        <div className="mcp-form-title">请求参数</div>
        <div className="card mcp-json"><div className="json"><${JsonView} value=${res.args} defaultExpandDepth=${2} /></div></div>
        <div className="mcp-form-title">返回结果 ${res.isError ? html`<${Tag} size="sm" tone="danger">isError<//>` : html`<${Tag} size="sm" tone="success">成功<//>`}</div>
        <div className="card mcp-json"><div className="json"><${JsonView} value=${{ content: [{ type: 'text', text: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) }], isError: res.isError }} defaultExpandDepth=${3} /></div></div>
      </div>`}
    </div>`)}
  </div>`;
}
