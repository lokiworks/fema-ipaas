const PROJECT_COLORS = ['#8142E3', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626', '#DB2777', '#4F46E5', '#65A30D', '#525252'];

const INTEG_VIEWER_TIP = '你在此项目中是「可查看」权限，只能查看';
const INTEG_FOLDER_LIMIT = 100;
const INTEG_FOLDER_DEPTH = 3;

function integMemberProjects(state) {
  return state.projects.filter((p) => projectRole(state, p.id));
}

function integEditableProjects(state) {
  return state.projects.filter((p) => canEditProject(state, p.id));
}

function integFallbackProject(state, pid) {
  const mine = integMemberProjects(state);
  return mine.find((p) => p.id === pid) || mine.find((p) => p.id === state.currentProjectId) || mine[0] || null;
}

function integUniqueName(state, projectId, base) {
  const taken = new Set(state.workflows.filter((w) => w.projectId === projectId).map((w) => w.name));
  const stem = base.slice(0, 94);
  if (!taken.has(stem)) return stem;
  let i = 2;
  while (taken.has(`${stem} (${i})`)) i += 1;
  return `${stem} (${i})`;
}

function integLimitError(state, pid) {
  const p = state.projects.find((x) => x.id === pid);
  const cap = p && p.limits && p.limits.workflows;
  const count = state.workflows.filter((w) => w.projectId === pid).length;
  return cap && count >= cap ? `项目的工作流数量已达上限（${cap} 个），请联系平台管理员调整` : null;
}

function integLogsLink({ project, statuses, time }) {
  const parts = [`project=${encodeURIComponent(project)}`, ...(statuses ? [`status=${statuses.map(encodeURIComponent).join(',')}`] : []), `time=${time}`];
  return `/logs?${parts.join('&')}`;
}

function integWfStats({ runs, since, wfId }) {
  const own = runs.filter((r) => r.workflowId === wfId);
  const last = own.reduce((a, r) => (!a || r.startedAt > a.startedAt ? r : a), null);
  return { last, ...runMetrics(own.filter((r) => r.startedAt >= since)) };
}

function integConfigRefs(state, pid, key) {
  const pattern = new RegExp(`config\\.${key}(?![a-z0-9_])`);
  return state.workflows.filter((w) => w.projectId === pid && pattern.test(JSON.stringify([w.trigger, w.steps])));
}

function integTplTab(t, me) {
  if (!t.mine && !t.owner) return 'rec';
  return !t.owner || t.owner === me ? 'mine' : 'shared';
}

function integConfigError({ type, value, required, state, pid }) {
  const v = String(value ?? '').trim();
  if (!v) return required ? '默认值不能为空' : null;
  if (type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) return '请输入数字，例如 5000 或 0.5';
  if (type === 'boolean' && !['true', 'false'].includes(v)) return '只能是 true 或 false';
  if (type === 'array' || type === 'object') {
    const parsed = (() => { try { return { ok: true, value: JSON.parse(v) }; } catch (e) { return { ok: false }; } })();
    const shapeOk = parsed.ok && (type === 'array' ? Array.isArray(parsed.value) : parsed.value !== null && typeof parsed.value === 'object' && !Array.isArray(parsed.value));
    if (!shapeOk) return type === 'array' ? '请输入 JSON 数组，例如 ["a", "b"]' : '请输入 JSON 对象，例如 { "key": "value" }';
  }
  if (type === 'webhook' && !/^https?:\/\/[^\s/?#]+\.[^\s]+$/i.test(v)) return '请输入 http:// 或 https:// 开头的完整地址';
  if (type === 'connection') {
    const c = state.connections.find((x) => x.id === v);
    if (!c) return '所选连接已被删除，请重新选择';
    if (!connAvailableIn(c, pid)) return '该连接不在本项目的可用范围内';
    if (!connectionPerm(state, c)) return '该连接没有分享给你';
  }
  return null;
}

function integExportWorkflow(wf) {
  const graph = stripConnections({ trigger: wf.trigger, steps: wf.steps });
  const payload = { format: 'workflow-export', version: 1, exportedAt: new Date().toISOString(), workflow: { name: wf.name, description: wf.description || '', trigger: graph.trigger, steps: graph.steps } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${wf.name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast.success(`已导出「${wf.name}.json」`);
}

function integParseImport(text) {
  const invalid = { error: '文件格式不正确，只能导入从本平台导出的工作流文件' };
  try {
    const data = JSON.parse(text);
    const wf = data && data.format === 'workflow-export' ? data.workflow : null;
    if (!wf || typeof wf.name !== 'string' || !wf.trigger || wf.trigger.kind !== 'trigger' || !Array.isArray(wf.steps)) return invalid;
    const nodesOk = allNodes({ trigger: wf.trigger, steps: wf.steps }).every((n) => n && typeof n.id === 'string' && typeof n.kind === 'string');
    if (!nodesOk) return invalid;
    const graph = mapGraph({ trigger: wf.trigger, steps: wf.steps }, (n) => ({ ...n, config: n.config && typeof n.config === 'object' ? n.config : {} }));
    return { workflow: { name: wf.name, description: typeof wf.description === 'string' ? wf.description : '', trigger: graph.trigger, steps: graph.steps } };
  } catch (e) {
    return invalid;
  }
}

function integDeleteProjectState(s, pid) {
  const wfIds = new Set(s.workflows.filter((w) => w.projectId === pid).map((w) => w.id));
  const storageIds = new Set(s.storages.filter((x) => x.projectId === pid).map((x) => x.id));
  const members = s.members.filter((m) => m.projectId !== pid);
  const rest = s.projects.filter((p) => p.id !== pid);
  const mine = rest.filter((p) => members.some((m) => m.projectId === p.id && m.userId === s.me));
  const current = mine.some((p) => p.id === s.currentProjectId) ? s.currentProjectId : ((mine[0] || rest[0] || {}).id || null);
  return {
    ...s,
    currentProjectId: current,
    projects: rest,
    members,
    folders: s.folders.filter((f) => f.projectId !== pid),
    configGroups: s.configGroups.filter((g) => g.projectId !== pid),
    variables: s.variables.filter((v) => v.projectId !== pid),
    storages: s.storages.filter((x) => x.projectId !== pid),
    workflows: s.workflows.filter((w) => !wfIds.has(w.id)),
    versions: s.versions.filter((v) => !wfIds.has(v.workflowId)),
    runs: s.runs.filter((r) => r.projectId !== pid && !wfIds.has(r.workflowId)),
    releases: (s.releases || []).filter((r) => r.projectId !== pid),
    mappingTables: (s.mappingTables || []).filter((t) => t.projectId !== pid),
    editLocks: Object.fromEntries(Object.entries(s.editLocks || {}).filter(([k]) => !wfIds.has(k))),
    recent: (s.recent || []).filter((r) => !(r.type === 'workflow' ? wfIds.has(r.id) : storageIds.has(r.id))),
    monitorViews: (s.monitorViews || []).map((v) => ({ ...v, projects: (v.projects || []).filter((x) => x !== pid), workflows: (v.workflows || []).filter((x) => !wfIds.has(x)) })),
  };
}

function integRemapLookups(value, tableMap) {
  if (Array.isArray(value)) return value.map((v) => integRemapLookups(v, tableMap));
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'lookup' && typeof value.arg === 'string') return { ...value, arg: tableMap[value.arg] || value.arg };
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, integRemapLookups(v, tableMap)]));
}

function integNodeConns(n) {
  const cfg = n.config || {};
  return [n.connectionId, cfg.connectionId, ...(Array.isArray(cfg.tools) ? cfg.tools.map((t) => t.connectionId) : [])].filter(Boolean);
}

function integConnUsers(state, pid, connId) {
  return state.workflows.filter((w) => w.projectId === pid).map((w) => {
    const graphs = [{ trigger: w.trigger, steps: w.steps }, ...(w.test ? [relGraphOf(state, w, w.test.version)] : [])].filter(Boolean);
    const nodes = [...new Set(graphs.flatMap((g) => allNodes(g).filter((n) => integNodeConns(n).includes(connId)).map((n) => n.name)))];
    return nodes.length ? { wf: w, nodes } : null;
  }).filter(Boolean);
}

function integNextVersion(state, wf) {
  return Math.max(latestVersion(wf), ...state.versions.filter((v) => v.workflowId === wf.id).map((v) => v.version)) + 1;
}

function integTestAhead(wf) {
  return Boolean(wf.test && wf.test.version > (wf.published ? wf.version : 0));
}

function integEnableEnvsState(s, pid, approval) {
  const owners = s.members.filter((m) => m.projectId === pid && m.role === 'owner').map((m) => m.userId);
  const testId = uid('g');
  const prodId = uid('g');
  const groups = [
    { id: testId, projectId: pid, key: 'test', name: '测试环境', description: '联调和验证用，可以用连接替换换成测试账号', connectionMap: {}, requireApproval: false, approvers: [] },
    { id: prodId, projectId: pid, key: 'prod', name: '生产环境', description: '正式运行的环境', connectionMap: {}, requireApproval: approval, approvers: approval ? owners : [] },
  ];
  return {
    ...s,
    projects: s.projects.map((p) => (p.id === pid ? { ...p, envMode: 'staged' } : p)),
    configGroups: [...s.configGroups.filter((g) => !(g.projectId === pid && g.key)), ...groups],
    variables: s.variables.map((v) => (v.projectId === pid ? { ...v, values: { ...(v.values || {}), [testId]: (v.values || {}).default ?? '', [prodId]: (v.values || {}).default ?? '' } } : v)),
  };
}

function integDisableEnvsState(s, pid) {
  const envGroups = s.configGroups.filter((g) => g.projectId === pid && g.key);
  const ids = new Set(envGroups.map((g) => g.id));
  const prod = envGroups.find((g) => g.key === 'prod');
  return {
    ...s,
    projects: s.projects.map((p) => (p.id === pid ? { ...p, envMode: 'single' } : p)),
    configGroups: s.configGroups.filter((g) => !ids.has(g.id)),
    variables: s.variables.map((v) => {
      if (v.projectId !== pid) return v;
      const values = v.values || {};
      const kept = prod && !isBlank(values[prod.id]) ? values[prod.id] : values.default;
      return { ...v, values: { ...Object.fromEntries(Object.entries(values).filter(([k]) => !ids.has(k))), default: kept } };
    }),
    workflows: s.workflows.map((w) => (w.projectId === pid && w.test ? Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'test')) : w)),
  };
}

function integCopyProjectState(s, project) {
  const now = Date.now();
  const pid = uid('p');
  const own = (list) => list.filter((x) => x.projectId === project.id);
  const folderMap = Object.fromEntries(own(s.folders).map((f) => [f.id, uid('f')]));
  const groupMap = Object.fromEntries(own(s.configGroups).map((g) => [g.id, uid('g')]));
  const keep = (connId) => {
    const c = connId && s.connections.find((x) => x.id === connId);
    return Boolean(c && connAvailableIn(c, pid));
  };
  const nodeConn = (n) => (n.kind === 'ai' ? (n.config || {}).connectionId : n.connectionId);
  const tableMap = Object.fromEntries(own(s.mappingTables || []).map((t) => [t.id, uid('mt')]));
  const scrub = (n) => {
    const base = !nodeConn(n) || keep(nodeConn(n)) ? n : n.kind === 'ai' ? { ...n, config: { ...n.config, connectionId: null } } : { ...n, connectionId: null };
    return base.config ? { ...base, config: integRemapLookups(base.config, tableMap) } : base;
  };
  const sourceWfs = own(s.workflows);
  const clearedNodes = sourceWfs.reduce((acc, w) => acc + allNodes(w).filter((n) => nodeConn(n) && !keep(nodeConn(n))).length, 0);
  const workflows = sourceWfs.map((w) => {
    const graph = mapGraph({ trigger: w.trigger, steps: w.steps }, scrub);
    const { nodes } = cloneNodes(graph.steps);
    return { ...newWorkflow({ projectId: pid, name: w.name, description: w.description, folderId: w.folderId ? folderMap[w.folderId] || null : null, trigger: { ...graph.trigger, ref: null }, steps: nodes }), tags: w.tags || [] };
  });
  const sourceVars = own(s.variables);
  const clearedVars = sourceVars.filter((v) => v.type === 'connection').reduce((acc, v) => acc + Object.values(v.values || {}).filter((val) => val && !keep(val)).length, 0);
  const variables = sourceVars.map((v) => ({
    ...v,
    id: uid('v'),
    projectId: pid,
    updatedAt: now,
    updatedBy: s.me,
    values: Object.fromEntries(Object.entries(v.values || {})
      .filter(([k]) => k === 'default' || groupMap[k])
      .map(([k, val]) => [k === 'default' ? 'default' : groupMap[k], v.type === 'connection' && val && !keep(val) ? '' : val])),
  }));
  const names = new Set(s.projects.map((p) => p.name));
  const stem = `${project.name} 副本`.slice(0, 96);
  let name = stem;
  let i = 2;
  while (names.has(name)) { name = `${stem} ${i}`; i += 1; }
  const folders = own(s.folders).map((f) => ({ ...f, id: folderMap[f.id], projectId: pid, parentId: f.parentId ? folderMap[f.parentId] || null : null }));
  const groups = own(s.configGroups).map((g) => ({
    ...g,
    id: groupMap[g.id],
    projectId: pid,
    ...(g.key ? {
      connectionMap: Object.fromEntries(Object.entries(g.connectionMap || {}).filter(([from, to]) => keep(from) && keep(to))),
      approvers: g.requireApproval ? [s.me] : [],
    } : {}),
  }));
  const storages = own(s.storages).map((st) => ({ ...st, id: uid('ds'), projectId: pid, createdAt: now, owner: s.me, records: [] }));
  const tables = own(s.mappingTables || []).map((t) => ({ ...t, id: tableMap[t.id], projectId: pid, updatedAt: now, updatedBy: s.me }));
  return {
    next: {
      ...s,
      currentProjectId: pid,
      projects: [...s.projects, { ...project, id: pid, name, createdAt: now, owner: s.me }],
      members: [...s.members, { projectId: pid, userId: s.me, role: 'owner', joinedAt: now }],
      folders: [...s.folders, ...folders],
      configGroups: [...s.configGroups, ...groups],
      variables: [...variables, ...s.variables],
      storages: [...s.storages, ...storages],
      mappingTables: [...(s.mappingTables || []), ...tables],
      workflows: [...workflows, ...s.workflows],
    },
    summary: { id: pid, name, workflows: workflows.length, folders: folders.length, variables: variables.length, groups: groups.length, storages: storages.length, tables: tables.length, cleared: clearedNodes + clearedVars },
  };
}

function IntegDisabledTip({ tip, children }) {
  return tip ? html`<${Tooltip} content=${tip}>${children}<//>` : children;
}

function IntegrationLayout({ pid, children }) {
  const state = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const exact = state.projects.find((p) => p.id === pid);
  const allowed = Boolean(exact && projectRole(state, exact.id));
  const project = allowed ? exact : integFallbackProject(state, null);
  useEffect(() => {
    if (allowed && state.currentProjectId !== pid) Store.set((s) => ({ ...s, currentProjectId: pid }));
  }, [pid, allowed]);
  const blocked = html`<div className="page"><${Empty}
    icon=${exact ? 'Lock' : 'FolderX'}
    title=${exact ? '你不是该项目的成员' : '项目不存在或已被删除'}
    description=${exact ? '请联系项目所有者把项目分享给你。' : '链接可能已经失效，或者项目已被删除。'}
    action=${project
      ? html`<${Button} variant="primary" onClick=${() => navigate(`/integration/${project.id}`)}>进入「${project.name}」<//>`
      : html`<${Button} onClick=${() => navigate('/projects')}>查看全部项目<//>`}
  /></div>`;
  return html`<div className=${cx('split', collapsed && 'is-collapsed')}>
    ${!collapsed && html`<${ProjectSidebar} key=${project ? project.id : 'none'} project=${project} />`}
    <button type="button" className="split-handle" onClick=${() => setCollapsed(!collapsed)} title=${collapsed ? '展开侧栏' : '收起侧栏'} aria-label=${collapsed ? '展开侧栏' : '收起侧栏'}><${Icon} name=${collapsed ? 'ChevronRight' : 'ChevronLeft'} size=${12} /></button>
    <div className="split-main">${allowed ? children : blocked}</div>
  </div>`;
}

function ProjectSidebar({ project }) {
  const state = useStore();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState(() => new Set());
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState([]);
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const closeModal = () => setModal(null);
  if (!project) {
    return html`<aside className="psidebar">
      <div className="psidebar-top"><div className="psidebar-caption"><span>当前项目</span></div></div>
      <${Empty} size="sm" icon="FolderPlus" title="还没有项目" description="新建一个项目，再在项目里创建工作流。" action=${html`<${Button} size="sm" variant="primary" icon="Plus" onClick=${() => setModal({ type: 'project' })}>新建项目<//>`} />
      ${modal && modal.type === 'project' && html`<${ProjectModal} open=${true} onClose=${closeModal} />`}
    </aside>`;
  }
  const pid = project.id;
  const canEdit = canEditProject(state, pid);
  const owner = isProjectOwner(state, pid);
  const staged = isStagedProject(state, pid);
  const pendingReleases = (state.releases || []).filter((r) => r.projectId === pid && r.status === 'pending');
  const myApprovals = pendingReleases.filter((r) => r.approvers.includes(state.me)).length;
  const editable = integEditableProjects(state);
  const wfs = state.workflows.filter((w) => w.projectId === pid);
  const folders = state.folders.filter((f) => f.projectId === pid);
  const folderIds = new Set(folders.map((f) => f.id));
  const parentOf = (f) => (f.parentId && f.parentId !== f.id && folderIds.has(f.parentId) ? f.parentId : null);
  const folderOf = (w) => (w.folderId && folderIds.has(w.folderId) ? w.folderId : null);
  const childFolders = (parentId) => folders.filter((f) => parentOf(f) === parentId);
  const subtreeIds = (id) => [id, ...childFolders(id).flatMap((c) => subtreeIds(c.id))];
  const chainOf = (id) => { const f = folders.find((x) => x.id === id); return f ? [f.id, ...chainOf(parentOf(f))] : []; };
  const activeWf = (route.path.match(/\/wf\/([^/]+)/) || [])[1];
  const query = q.trim().toLowerCase();
  const match = (w) => !query || w.name.toLowerCase().includes(query);
  const countIn = (id) => { const ids = new Set(subtreeIds(id)); return wfs.filter((w) => ids.has(folderOf(w)) && match(w)).length; };
  const flatten = (parentId, depth) => [
    ...childFolders(parentId).flatMap((f) => {
      const count = countIn(f.id);
      if (query && !count) return [];
      const open = Boolean(query) || !closed.has(f.id);
      return [{ kind: 'folder', f, depth, open, count }, ...(open ? flatten(f.id, depth + 1) : [])];
    }),
    ...wfs.filter((w) => folderOf(w) === parentId && match(w)).map((w) => ({ kind: 'wf', w, depth })),
  ];
  const rows = flatten(null, 0);
  const visibleIds = rows.filter((r) => r.kind === 'wf').map((r) => r.w.id);
  const livePicked = picked.filter((id) => wfs.some((w) => w.id === id));
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => livePicked.includes(id));
  const allOpen = folders.every((f) => !closed.has(f.id));
  const folderFull = folders.length >= INTEG_FOLDER_LIMIT;
  const dragged = dragId ? wfs.find((w) => w.id === dragId) : null;

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleFolder = (id) => setClosed((c) => { const next = new Set(c); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const exitBatch = () => { setBatch(false); setPicked([]); };
  const endDrag = () => { setDragId(null); setDragOver(null); };

  const moveTo = (ids, folderId) => {
    const moving = wfs.filter((w) => ids.includes(w.id) && folderOf(w) !== (folderId || null)).map((w) => w.id);
    if (!moving.length) return;
    const target = folderId ? folders.find((f) => f.id === folderId) : null;
    Store.set((s) => ({ ...s, workflows: s.workflows.map((w) => (moving.includes(w.id) ? { ...w, folderId: folderId || null } : w)) }));
    if (folderId) setClosed((c) => { const next = new Set(c); chainOf(folderId).forEach((id) => next.delete(id)); return next; });
    toast.success(target ? `已将 ${moving.length} 个工作流移到「${target.name}」` : `已将 ${moving.length} 个工作流移到项目根目录`);
  };

  const dropProps = (target) => ({
    onDragOver: (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOver !== target) setDragOver(target);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragOver((d) => (d === target ? null : d));
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = e.dataTransfer.getData('text/wf') || dragId;
      endDrag();
      if (id) moveTo([id], target === 'root' ? null : target);
    },
  });

  const removeWorkflows = async (ids) => {
    const list = wfs.filter((w) => ids.includes(w.id));
    if (!list.length) return;
    const single = list.length === 1 ? list[0] : null;
    const pendingCount = (state.releases || []).filter((r) => r.status === 'pending' && ids.includes(r.workflowId)).length;
    const ok = await confirmDialog({
      title: single ? `删除工作流「${single.name}」？` : `删除 ${list.length} 个工作流？`,
      content: `删除后无法恢复，运行日志保留 30 天。${pendingCount ? `${pendingCount} 个待审批的推广申请会自动撤回。` : ''}`,
      danger: true,
      okText: '删除',
      confirmText: single ? single.name : undefined,
    });
    if (!ok) return;
    const gone = new Set(list.map((w) => w.id));
    const now = Date.now();
    Store.set((s) => ({
      ...s,
      workflows: s.workflows.filter((w) => !gone.has(w.id)),
      versions: s.versions.filter((v) => !gone.has(v.workflowId)),
      recent: (s.recent || []).filter((r) => !(r.type === 'workflow' && gone.has(r.id))),
      releases: (s.releases || []).map((r) => (gone.has(r.workflowId) && r.status === 'pending' ? { ...r, status: 'cancelled', decidedBy: s.me, decidedAt: now, comment: '工作流已删除，申请自动撤回' } : r)),
      editLocks: Object.fromEntries(Object.entries(s.editLocks || {}).filter(([k]) => !gone.has(k))),
    }));
    list.forEach((w) => addAudit('删除工作流', w.name, pid));
    setPicked((p) => p.filter((id) => !gone.has(id)));
    toast.success(single ? '已删除' : `已删除 ${list.length} 个工作流`);
    if (activeWf && gone.has(activeWf)) navigate(`/integration/${pid}`);
  };

  const toggleRun = async (w) => {
    if (w.status === 'enabled') {
      const ok = await confirmDialog({ title: staged ? '停止生产环境的运行？' : '确认停止运行？', content: staged ? '停止后生产环境不再处理新的事件，测试环境不受影响。' : '停止后的工作流将不可使用，请谨慎操作。', danger: true, okText: '停止' });
      if (!ok) return;
      patchList('workflows', w.id, { status: 'disabled' });
      addAudit('停止工作流', `${w.name}${staged ? '（生产环境）' : ''}`, pid);
      toast.success(staged ? '生产环境已停止运行' : '工作流已停止');
      return;
    }
    patchList('workflows', w.id, { status: 'enabled' });
    addAudit('启动工作流', `${w.name}${staged ? '（生产环境）' : ''}`, pid);
    toast.success(staged ? '生产环境已启动运行' : '工作流已启动');
  };

  const removeFolder = async (f) => {
    const parentId = parentOf(f);
    const parent = parentId ? folders.find((x) => x.id === parentId) : null;
    const ok = await confirmDialog({
      title: `删除文件夹「${f.name}」？`,
      content: `文件夹里的子文件夹和工作流会移到${parent ? `上一级「${parent.name}」` : '项目根目录'}，不会被删除。`,
      danger: true,
      okText: '删除',
    });
    if (!ok) return;
    Store.set((s) => ({
      ...s,
      folders: s.folders.filter((x) => x.id !== f.id).map((x) => (x.parentId === f.id ? { ...x, parentId } : x)),
      workflows: s.workflows.map((w) => (w.folderId === f.id ? { ...w, folderId: parentId } : w)),
    }));
    toast.success('已删除文件夹');
  };

  const deleteProject = async () => {
    const s = Store.get();
    const own = (list) => (list || []).filter((x) => x.projectId === pid).length;
    const ok = await confirmDialog({
      title: `删除项目「${project.name}」？`,
      content: `项目里的 ${own(s.workflows)} 个工作流（含发布版本、推广记录和运行日志）、${own(s.folders)} 个文件夹、环境设置、${own(s.variables)} 个项目配置、${own(s.mappingTables)} 个映射表、${own(s.storages)} 个数据存储和全部成员关系会一并删除，无法恢复。`,
      danger: true,
      okText: '删除项目',
      confirmText: project.name,
    });
    if (!ok) return;
    Store.set((st) => integDeleteProjectState(st, pid));
    addAudit('删除项目', project.name, null);
    toast.success(`已删除项目「${project.name}」`);
    const next = integFallbackProject(Store.get(), null);
    navigate(next ? `/integration/${next.id}` : '/projects');
  };

  const copyProject = async () => {
    const ok = await confirmDialog({
      title: `创建「${project.name}」的副本？`,
      content: '会复制文件夹、环境设置和项目配置、映射表、数据存储（不含数据）以及全部工作流。工作流复制为未发布的草稿，只在本项目可用的连接和连接替换会被清空。成员、发布版本、推广记录和运行日志不会复制。',
      okText: '创建副本',
    });
    if (!ok) return;
    const { next, summary } = integCopyProjectState(Store.get(), project);
    Store.set(next);
    addAudit('创建项目副本', summary.name, summary.id);
    toast.success(`已创建「${summary.name}」：${summary.workflows} 个工作流、${summary.folders} 个文件夹、${summary.variables} 个项目配置、${summary.tables} 个映射表、${summary.storages} 个数据存储${summary.cleared ? `，${summary.cleared} 处连接需要重新选择` : ''}`);
    navigate(`/integration/${summary.id}`);
  };

  const projectMenu = [
    { key: 'overview', label: '项目概览', icon: 'LayoutDashboard', onClick: () => navigate(`/integration/${pid}`) },
    { key: 'share', label: canEdit ? '分享' : '查看成员', icon: canEdit ? 'Share2' : 'Users', onClick: () => setModal({ type: 'share' }) },
    { divider: true },
    { key: 'edit', label: '编辑基本信息', icon: 'Info', disabled: !canEdit, desc: canEdit ? '' : '可查看权限不能修改', onClick: () => setModal({ type: 'edit' }) },
    { key: 'delete', label: '删除', icon: 'Trash2', danger: true, disabled: !owner, desc: owner ? '' : '只有项目所有者可以删除', onClick: deleteProject },
    { divider: true },
    { key: 'new', label: '新建项目', icon: 'Plus', onClick: () => setModal({ type: 'project' }) },
    { key: 'copy', label: '创建副本', icon: 'CopyPlus', disabled: !canEdit, desc: canEdit ? '' : '可查看权限不能创建副本', onClick: copyProject },
    { key: 'all', label: '查看全部项目', icon: 'LayoutGrid', onClick: () => navigate('/projects') },
  ];

  const createItems = [
    { key: 'new', label: '新建工作流', icon: 'Workflow', onClick: () => setModal({ type: 'new' }) },
    { key: 'ai', label: '用 AI 生成', icon: 'Sparkles', disabled: Boolean(integLimitError(state, pid)), desc: integLimitError(state, pid) || '用一句话描述要做的自动化', onClick: () => aiBus.open({ projectId: pid }) },
    { key: 'tpl', label: '从模板新建', icon: 'LayoutTemplate', onClick: () => setModal({ type: 'template' }) },
    { key: 'import', label: '导入工作流', icon: 'FileInput', onClick: () => setModal({ type: 'import' }) },
    { divider: true },
    { key: 'folder', label: '新建文件夹', icon: 'FolderPlus', disabled: folderFull, desc: folderFull ? `每个项目最多 ${INTEG_FOLDER_LIMIT} 个文件夹` : '', onClick: () => setModal({ type: 'folder' }) },
  ];

  const promoteState = (w) => {
    if (pendingReleases.some((r) => r.workflowId === w.id)) return '已有待审批的推广申请';
    if (!w.test) return '测试环境还没有部署';
    if (!integTestAhead(w)) return '测试环境没有比生产环境更新的版本';
    return '';
  };
  const wfMenu = (w) => (canEdit
    ? [
      { key: 'publish', label: staged ? '发布到测试环境' : '发布', icon: 'CloudUpload', onClick: () => navigate(`/integration/${pid}/wf/${w.id}?action=publish`) },
      ...(staged ? [{ key: 'promote', label: '推广到生产环境', icon: 'Rocket', disabled: Boolean(promoteState(w)), desc: promoteState(w), onClick: () => setModal({ type: 'promote', id: w.id }) }] : []),
      w.status === 'enabled'
        ? { key: 'run', label: staged ? '停止生产环境' : '停止工作流', icon: 'CirclePause', onClick: () => toggleRun(w) }
        : { key: 'run', label: staged ? '启动生产环境' : '启动工作流', icon: 'CirclePlay', disabled: !w.published, desc: w.published ? '' : staged ? '还没有推广到生产环境' : '工作流尚未发布版本，无法启动', onClick: () => toggleRun(w) },
      { key: 'info', label: '基本信息', icon: 'Info', onClick: () => setModal({ type: 'info', id: w.id }) },
      { key: 'logs', label: '查看日志', icon: 'ScrollText', onClick: () => navigate(`/logs?workflow=${w.id}`) },
      { divider: true },
      { key: 'copy', label: '创建副本', icon: 'CopyPlus', onClick: () => setModal({ type: 'copy', id: w.id }) },
      { key: 'move', label: '移动到文件夹', icon: 'FolderInput', disabled: !folders.length, desc: folders.length ? '' : '项目里还没有文件夹', onClick: () => setModal({ type: 'move', ids: [w.id] }) },
      { key: 'export', label: '导出', icon: 'Download', onClick: () => integExportWorkflow(w) },
      { divider: true },
      { key: 'delete', label: '删除', icon: 'Trash2', danger: true, onClick: () => removeWorkflows([w.id]) },
    ]
    : [
      { key: 'info', label: '基本信息', icon: 'Info', onClick: () => setModal({ type: 'info', id: w.id }) },
      { key: 'logs', label: '查看日志', icon: 'ScrollText', onClick: () => navigate(`/logs?workflow=${w.id}`) },
      { key: 'copy', label: '创建副本', icon: 'CopyPlus', disabled: !editable.length, desc: editable.length ? '复制到你有编辑权限的项目' : '没有可编辑的项目', onClick: () => setModal({ type: 'copy', id: w.id }) },
      { key: 'export', label: '导出', icon: 'Download', onClick: () => integExportWorkflow(w) },
    ]);

  const folderMenu = (f, depth) => {
    const level = depth + 1;
    const deep = level >= INTEG_FOLDER_DEPTH;
    return [
      { key: 'new', label: '新建工作流', icon: 'Plus', onClick: () => setModal({ type: 'new', folderId: f.id }) },
      { key: 'sub', label: '新建子文件夹', icon: 'FolderPlus', disabled: deep || folderFull, desc: deep ? '文件夹最多三层' : folderFull ? `每个项目最多 ${INTEG_FOLDER_LIMIT} 个文件夹` : '', onClick: () => setModal({ type: 'folder', parentId: f.id }) },
      { key: 'rename', label: '重命名', icon: 'PenLine', onClick: () => setModal({ type: 'folder', folder: f }) },
      { divider: true },
      { key: 'delete', label: '删除文件夹', icon: 'Trash2', danger: true, onClick: () => removeFolder(f) },
    ];
  };

  const folderRow = ({ f, depth, open, count }) => html`<div
    key=${f.id}
    className=${cx('ptree-item', 'is-folder', dragOver === f.id && 'is-drop')}
    style=${{ paddingLeft: 8 + depth * 16 }}
    role="treeitem"
    aria-expanded=${open}
    data-folder=${f.id}
    onClick=${() => { if (!query) toggleFolder(f.id); }}
    ...${canEdit ? dropProps(f.id) : {}}
  >
    <${Icon} name=${open ? 'ChevronDown' : 'ChevronRight'} size=${12} className="muted" />
    <${Icon} name=${open ? 'FolderOpen' : 'Folder'} size=${16} className="muted" />
    <span className="ptree-name" title=${f.name}>${f.name}</span>
    <span className="ptree-count">${count}</span>
    ${canEdit && !batch && html`<span className="ptree-more" onClick=${(e) => e.stopPropagation()}><${MoreMenu} size="xs" width=${190} items=${folderMenu(f, depth)} /></span>`}
  </div>`;

  const wfRow = ({ w, depth }) => html`<div
    key=${w.id}
    className=${cx('ptree-item', !batch && activeWf === w.id && 'is-active', batch && livePicked.includes(w.id) && 'is-picked', dragId === w.id && 'is-dragging')}
    style=${{ paddingLeft: 8 + depth * 16 }}
    role="treeitem"
    data-wf=${w.id}
    draggable=${canEdit && !batch}
    onDragStart=${(e) => { e.dataTransfer.setData('text/wf', w.id); e.dataTransfer.effectAllowed = 'move'; setDragId(w.id); }}
    onDragEnd=${endDrag}
    onClick=${() => (batch ? togglePick(w.id) : navigate(`/integration/${pid}/wf/${w.id}`))}
  >
    ${batch && html`<${Checkbox} checked=${livePicked.includes(w.id)} onChange=${() => togglePick(w.id)} />`}
    <${WorkflowGlyph} wf=${w} size=${18} />
    <span className="ptree-name" title=${w.name}>${w.name}</span>
    ${w.published && w.draftChanged && html`<${Tooltip} content="有更新未发布"><span className="ptree-dot" /><//>`}
    ${!batch && html`<span className="ptree-more" onClick=${(e) => e.stopPropagation()}><${MoreMenu} items=${wfMenu(w)} size="xs" width=${200} /></span>`}
  </div>`;

  const infoWf = modal && modal.type === 'info' ? wfs.find((w) => w.id === modal.id) : null;
  const promoteWf = modal && modal.type === 'promote' ? wfs.find((w) => w.id === modal.id) : null;
  const copyWf = modal && modal.type === 'copy' ? wfs.find((w) => w.id === modal.id) : null;
  const moveIds = modal && modal.type === 'move' ? modal.ids.filter((id) => wfs.some((w) => w.id === id)) : [];
  const moveCurrent = moveIds.length === 1 ? folderOf(wfs.find((w) => w.id === moveIds[0])) : undefined;

  return html`<aside className="psidebar">
    <div className="psidebar-top">
      <div className="psidebar-caption">
        <span>当前项目</span>
        <${MoreMenu} size="xs" width=${200} items=${projectMenu} />
      </div>
      <${ProjectSwitcher} project=${project} onNew=${() => setModal({ type: 'project' })} />
      <div className="psidebar-nav">
        <${Link} to=${`/integration/${pid}/config`} className=${cx('psidebar-link', route.path.endsWith('/config') && 'is-active')}><${Icon} name="SlidersHorizontal" size=${16} />环境与配置<//>
        ${staged && html`<${Link} to=${`/integration/${pid}/releases`} className=${cx('psidebar-link', route.path.includes('/releases') && 'is-active')} aria-label=${myApprovals ? `发布与审批，${myApprovals} 个待你审批` : '发布与审批'}>
          <${Icon} name="Rocket" size=${16} /><span className="grow">发布与审批</span>${myApprovals > 0 && html`<span className="psidebar-badge">${myApprovals > 99 ? '99+' : myApprovals}</span>`}
        <//>`}
        <${Link} to=${`/integration/${pid}/mappings`} className=${cx('psidebar-link', route.path.endsWith('/mappings') && 'is-active')}><${Icon} name="Table2" size=${16} />映射表<//>
        <${Link} to=${`/integration/${pid}/storage`} className=${cx('psidebar-link', route.path.endsWith('/storage') && 'is-active')}><${Icon} name="Database" size=${16} />数据存储<//>
      </div>
    </div>
    <div className="psidebar-res">
      <div className="psidebar-res-head">
        <span>项目资源(${wfs.length})</span>
        <span className="spacer" />
        <${IconButton} icon="ListChecks" size="xs" title=${canEdit ? (batch ? '退出批量操作' : '批量操作') : INTEG_VIEWER_TIP} active=${batch} disabled=${!canEdit || !wfs.length} onClick=${() => { if (batch) { exitBatch(); return; } setBatch(true); setPicked([]); setClosed(new Set()); }} />
        ${folders.length > 0 && html`<${IconButton} icon=${allOpen ? 'ChevronsDownUp' : 'ChevronsUpDown'} size="xs" title=${allOpen ? '收起全部文件夹' : '展开全部文件夹'} onClick=${() => setClosed(allOpen ? new Set(folders.map((f) => f.id)) : new Set())} />`}
        ${canEdit
          ? html`<${Dropdown} width=${190} placement="bottom-end" trigger=${html`<button type="button" className="icon-btn icon-btn-xs icon-btn-ghost" aria-label="新建"><${Icon} name="Plus" size=${15} /></button>`} items=${createItems} />`
          : html`<${IconButton} icon="Plus" size="xs" title=${INTEG_VIEWER_TIP} disabled=${true} />`}
      </div>
      <div className="psidebar-search"><${Input} size="sm" icon="Search" placeholder="搜索工作流名称" value=${q} onChange=${setQ} allowClear /></div>
      ${batch && html`<div className="psidebar-batch">
        <span>已选择 <b>${livePicked.length}</b> 个资源</span>
        <span className="spacer" />
        <${Button} size="xs" variant="link" disabled=${!visibleIds.length} onClick=${() => setPicked(allPicked ? livePicked.filter((id) => !visibleIds.includes(id)) : [...new Set([...livePicked, ...visibleIds])])}>${allPicked ? '取消全选' : '全选'}<//>
        <${Button} size="xs" variant="ghost" onClick=${exitBatch}>退出<//>
      </div>`}
      <div className="ptree" role="tree">
        ${dragged && folderOf(dragged) && html`<div className=${cx('ptree-item', 'ptree-root-drop', dragOver === 'root' && 'is-drop')} data-drop="root" ...${dropProps('root')}>
          <${Icon} name="CornerLeftUp" size=${14} />
          <span className="ptree-name">移到项目根目录</span>
        </div>`}
        ${rows.map((r) => (r.kind === 'folder' ? folderRow(r) : wfRow(r)))}
        ${rows.length === 0 && html`<${Empty}
          size="sm"
          icon=${query ? 'SearchX' : 'Workflow'}
          title=${query ? '没有匹配的工作流' : '暂无工作流'}
          description=${query || canEdit ? '' : INTEG_VIEWER_TIP}
          action=${!query && canEdit && html`<${Button} size="sm" variant="primary" icon="Plus" onClick=${() => setModal({ type: 'new' })}>新建工作流<//>`}
        />`}
      </div>
      ${batch && html`<div className="psidebar-batch-actions">
        <${Button} size="sm" disabled=${!livePicked.length} onClick=${() => setModal({ type: 'batchPublish', ids: livePicked })}>批量发布<//>
        <${Button} size="sm" disabled=${!livePicked.length || !folders.length} title=${folders.length ? '' : '项目里还没有文件夹'} onClick=${() => setModal({ type: 'move', ids: livePicked })}>移动到<//>
        <${Button} size="sm" variant="danger-outline" disabled=${!livePicked.length} onClick=${() => removeWorkflows(livePicked)}>删除<//>
      </div>`}
    </div>
    ${modal && modal.type === 'new' && html`<${NewWorkflowModal} open=${true} onClose=${closeModal} projectId=${pid} folderId=${modal.folderId} />`}
    ${modal && modal.type === 'template' && html`<${TemplatePickerModal} open=${true} onClose=${closeModal} projectId=${pid} />`}
    ${modal && modal.type === 'import' && html`<${ImportWorkflowModal} open=${true} onClose=${closeModal} projectId=${pid} />`}
    ${modal && modal.type === 'folder' && html`<${FolderModal} open=${true} onClose=${closeModal} projectId=${pid} folder=${modal.folder} parentId=${modal.parentId} />`}
    ${modal && modal.type === 'move' && moveIds.length > 0 && html`<${MoveModal} open=${true} onClose=${closeModal} ids=${moveIds} folders=${folders} current=${moveCurrent} onMove=${(fid) => { moveTo(moveIds, fid); closeModal(); exitBatch(); }} />`}
    ${modal && (modal.type === 'project' || modal.type === 'edit') && html`<${ProjectModal} open=${true} onClose=${closeModal} project=${modal.type === 'edit' ? project : null} />`}
    ${modal && modal.type === 'share' && html`<${ProjectShareModal} open=${true} onClose=${closeModal} project=${project} />`}
    ${modal && modal.type === 'batchPublish' && html`<${BatchPublishModal} open=${true} onClose=${() => { closeModal(); exitBatch(); }} ids=${modal.ids} projectId=${pid} />`}
    ${promoteWf && html`<${PromoteModal} open=${true} onClose=${closeModal} wf=${promoteWf} state=${state} />`}
    ${copyWf && html`<${CopyWorkflowModal} open=${true} onClose=${closeModal} wf=${copyWf} state=${state} />`}
    ${infoWf && html`<${WorkflowInfoModal} open=${true} onClose=${closeModal} wf=${infoWf} state=${state} canEdit=${canEdit} />`}
  </aside>`;
}

function ProjectSwitcher({ project, onNew }) {
  const state = useStore();
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const shown = integMemberProjects(state).filter((p) => !ql || p.name.toLowerCase().includes(ql));
  return html`<${Popover}
    placement="bottom-start"
    width=${260}
    onOpenChange=${(v) => { if (!v) setQ(''); }}
    trigger=${html`<button type="button" className="pswitch" aria-label="切换项目">
      <${ProjectAvatar} project=${project} size=${32} />
      <span className="pswitch-name">${project.name}</span>
      <${Icon} name="ChevronDown" size=${14} className="muted" />
    </button>`}
  >
    ${({ close }) => html`<div className="pswitch-pop">
      <div style=${{ padding: 8 }}><${Input} size="sm" icon="Search" placeholder="搜索项目名称" value=${q} onChange=${setQ} autoFocus allowClear /></div>
      <div className="menu-group row-4">我的项目<${Tooltip} content="你是成员的项目"><${Icon} name="Info" size=${12} /><//></div>
      <div className="pswitch-list">
        ${shown.map((p) => html`<button key=${p.id} type="button" className=${cx('menu-item', p.id === project.id && 'is-active')} onClick=${() => { close(); setQ(''); navigate(`/integration/${p.id}`); }}>
          <${ProjectAvatar} project=${p} size=${22} />
          <span className="menu-item-body"><span className="menu-item-label">${p.name}</span></span>
          ${projectRole(state, p.id) === 'viewer' && html`<${Tag} size="sm">可查看<//>`}
          ${p.id === project.id && html`<${Icon} name="Check" size=${14} className="menu-item-check" />`}
        </button>`)}
        ${shown.length === 0 && html`<div className="select-empty">没有匹配的项目</div>`}
      </div>
      <div className="pswitch-foot">
        <${Button} size="sm" variant="ghost" icon="Plus" onClick=${() => { close(); onNew(); }}>新建项目<//>
        <${Button} size="sm" variant="ghost" icon="LayoutGrid" onClick=${() => { close(); navigate('/projects'); }}>全部项目<//>
      </div>
    </div>`}
  <//>`;
}

function CharInput({ value, onChange, max, placeholder, autoFocus, invalid, onKeyDown, mono }) {
  return html`<${Input} value=${value} onChange=${(v) => onChange(v.slice(0, max))} placeholder=${placeholder} autoFocus=${autoFocus} invalid=${invalid} onKeyDown=${onKeyDown} mono=${mono} suffix=${html`<span className="char-count">${(value || '').length}/${max}</span>`} />`;
}

function CharTextarea({ value, onChange, max, placeholder, rows = 3, invalid, mono }) {
  return html`<div className="char-textarea">
    <${Textarea} value=${value} onChange=${(v) => onChange(v.slice(0, max))} placeholder=${placeholder} rows=${rows} invalid=${invalid} mono=${mono} />
    <span className="char-count">${(value || '').length}/${max}</span>
  </div>`;
}

const APP_EVENT_APPS = ['feishu', 'beisen', 'github', 'jira', 'gitlab', 'salesforce', 'shopify', 'gmail', 'mysql', 'dingtalk'];

function NewWorkflowModal({ open, onClose, projectId, folderId, pickProject }) {
  const state = useStore();
  const editable = integEditableProjects(state);
  const [target, setTarget] = useState(projectId || null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [trig, setTrig] = useState('webhook');
  const [appEvent, setAppEvent] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    const room = editable.filter((p) => !integLimitError(state, p.id));
    setTarget(editable.some((p) => p.id === projectId) ? projectId : ((room[0] || editable[0] || {}).id || null));
    setName(''); setDesc(''); setTrig('webhook'); setAppEvent(null); setDirty(false);
  }, [open]);
  const apps = APP_EVENT_APPS.map((id) => resolveConnector(id)).filter((c) => c && c.triggers.length);
  const eventApp = appEvent ? resolveConnector(appEvent.connector) : null;
  const trimmed = name.trim();
  const dup = Boolean(target && trimmed && state.workflows.some((w) => w.projectId === target && w.name === trimmed));
  const nameError = dup ? '项目内已有同名工作流' : dirty && !trimmed ? '请输入工作流名称' : null;
  const limit = target ? integLimitError(state, target) : null;
  const canCreate = Boolean(target && trimmed && !dup && !limit && canEditProject(state, target));
  const create = () => {
    if (!canCreate) return;
    const s = Store.get();
    if (!s.projects.some((p) => p.id === target)) { toast.error('项目不存在或已被删除'); onClose(); return; }
    if (!canEditProject(s, target)) { toast.error('你在该项目中没有编辑权限'); return; }
    const folder = folderId && s.folders.some((f) => f.id === folderId && f.projectId === target) ? folderId : null;
    const base = TRIGGER_TYPES.find((t) => t.connector === trig) || TRIGGER_TYPES[0];
    const picked = appEvent ? triggerFromPick(appEvent.connector, appEvent.op) : triggerFromPick(base.connector, base.op);
    const tc = resolveConnector(picked.connector);
    const trigger = tc && tc.auth !== 'none' ? { ...picked, connectionId: defaultConnection(s, { connector: tc.id, projectId: target }) } : picked;
    const wf = newWorkflow({ projectId: target, name: trimmed, description: desc.trim(), folderId: folder, trigger });
    prependToList('workflows', wf);
    addAudit('创建工作流', wf.name, target);
    onClose();
    toast.success('创建成功');
    navigate(`/integration/${target}/wf/${wf.id}?mode=edit`);
  };
  const aiReady = Boolean(target && !limit && canEditProject(state, target));
  const openAi = () => {
    if (!aiReady) return;
    const projectId = target;
    onClose();
    aiBus.open({ projectId });
  };
  return html`<${Modal} open=${open} onClose=${onClose} title="新建工作流" width=${760} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!canCreate} onClick=${create}>创建<//><//>`}>
    <div className="integ-ai-entry">
      <span className="integ-ai-icon"><${Icon} name="Sparkles" size=${16} /></span>
      <div className="grow">
        <div className="integ-ai-title">不想从头搭？用一句话描述要做的自动化</div>
        <div className="text-xs muted">AI 生成步骤、需要的连接和字段映射，确认后得到可以继续编辑的草稿</div>
      </div>
      <${Button} size="sm" icon="Sparkles" disabled=${!aiReady} onClick=${openAi}>用 AI 生成<//>
    </div>
    ${pickProject && html`<${Field} label="所属项目" required hint=${editable.length ? '只列出你有编辑权限的项目' : ''}>
      ${editable.length
        ? html`<${Select} value=${target} onChange=${setTarget} searchable=${editable.length > 6} options=${editable.map((p) => ({ value: p.id, label: p.name, desc: integLimitError(state, p.id) ? '工作流数量已达上限' : '', iconNode: html`<${ProjectAvatar} project=${p} size=${18} />` }))} />`
        : html`<${Alert} tone="warning">你还没有可编辑的项目，请先新建一个项目。<//>`}
    <//>`}
    ${limit && html`<div className="integ-gap"><${Alert} tone="warning">${limit}<//></div>`}
    <${Field} label="工作流名称" required error=${nameError}><${CharInput} value=${name} onChange=${(v) => { setName(v); setDirty(true); }} max=${100} placeholder="例：审批通过后自动发送飞书消息" autoFocus invalid=${Boolean(nameError)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) create(); }} /><//>
    <${Field} label="描述"><${CharTextarea} value=${desc} onChange=${setDesc} max=${300} placeholder="说明这个工作流做什么，方便团队理解" rows=${2} /><//>
    <${Field} label="选择触发器" required>
      <div className="text-xs muted integ-trig-tip">选择一个触发器，通过触发事件或定时任务来触发自动化流程的运行<${Tooltip} content="Webhook 和表单触发器在收到数据时运行；定时任务按计划运行；子流程触发器由其他工作流调用；告警触发器在监控规则命中时运行。创建后可以在编辑器里替换触发器。"><span className="integ-help-icon" tabIndex=${0} aria-label="触发器说明"><${Icon} name="CircleHelp" size=${13} /></span><//></div>
      <div className="trig-grid">
        ${TRIGGER_TYPES.map((t) => html`<button key=${t.connector} type="button" aria-pressed=${!appEvent && trig === t.connector} className=${cx('trig-card', 'corner-check', !appEvent && trig === t.connector && 'is-active')} onClick=${() => { setTrig(t.connector); setAppEvent(null); }}>
          <${KindTile} icon=${t.icon} size=${36} />
          <span className="grow"><span className="trig-name">${t.name}</span><span className="trig-desc">${t.desc}</span></span>
        </button>`)}
      </div>
    <//>
    <div className="text-xs muted integ-app-tip">或选择应用事件触发流程运行</div>
    <div className="app-event-row">
      ${apps.map((c) => html`<${Tooltip} key=${c.id} content=${c.name}>
        <button type="button" aria-label=${c.name} aria-pressed=${Boolean(appEvent && appEvent.connector === c.id)} className=${cx('app-event', appEvent && appEvent.connector === c.id && 'is-active')} onClick=${() => setAppEvent({ connector: c.id, op: c.triggers[0].key })}><${ConnectorIcon} connector=${c} size=${28} /><span className="app-event-name">${c.name}</span></button>
      <//>`)}
    </div>
    ${eventApp && html`<div className="integ-gap-top"><${Field} label=${`${eventApp.name} 触发事件`} required>
      <${Select} value=${appEvent.op} onChange=${(v) => setAppEvent({ ...appEvent, op: v })} options=${eventApp.triggers.map((t) => ({ value: t.key, label: t.name, desc: t.desc }))} />
    <//></div>`}
  <//>`;
}

function IntegTemplateChain({ tpl, size = 30 }) {
  const [first, ...rest] = templateConnectors(tpl);
  return html`<div className="tpl-chain">
    <${ConnectorIcon} id=${first} size=${size} tile />
    ${rest.length > 0 && html`<${Icon} name="Play" size=${10} className="tpl-arrow" />`}
    ${rest.slice(0, 3).map((id) => html`<${ConnectorIcon} key=${id} id=${id} size=${size} tile />`)}
    ${rest.length > 3 && html`<span className="tpl-more">+${rest.length - 3}</span>`}
  </div>`;
}

function TemplateCard({ tpl, onClick }) {
  return html`<button type="button" className="tpl-card" onClick=${onClick}>
    <${IntegTemplateChain} tpl=${tpl} size=${30} />
    <div className="tpl-name" title=${tpl.name}>${tpl.name}</div>
    <div className="tpl-desc">${tpl.desc || '暂无描述'}</div>
    <div className="tpl-foot"><span className="ellipsis">${tpl.category}</span>${tpl.uses != null && html`<span className="row-4"><${Icon} name="Flame" size=${12} />${fmt.number(tpl.uses)}</span>`}</div>
  </button>`;
}

function TemplatePreview({ tpl, onBack }) {
  const state = useStore();
  const tc = resolveConnector(tpl.trigger.connector);
  const top = tc && tc.triggers.find((t) => t.key === tpl.trigger.op);
  const needs = templateConnectors(tpl).map((id) => resolveConnector(id)).filter((c) => c && c.auth !== 'none');
  const official = integTplTab(tpl, state.me) === 'rec';
  return html`<div className="tpl-preview">
    ${onBack && html`<div><${Button} size="sm" variant="ghost" icon="ArrowLeft" onClick=${onBack}>返回模板列表<//></div>`}
    <div className="tpl-preview-head">
      <${IntegTemplateChain} tpl=${tpl} size=${40} />
      <h2 className="page-title">${tpl.name}</h2>
      <p className="muted">${tpl.desc || '暂无描述'}</p>
      <div className="row">
        <${Tag}>${tpl.category}<//>
        <span className="text-xs muted">${fmt.number(tpl.uses || 0)} 次使用 · ${official ? '官方模板' : `${personName(tpl.owner)} 创建`}${tpl.createdAt ? ` · ${fmt.date(tpl.createdAt)}` : ''}</span>
      </div>
    </div>
    <div className="tpl-steps">
      <div className="tpl-step-title">当触发下列事件时</div>
      <div className="tpl-step"><${ConnectorIcon} id=${tpl.trigger.connector} size=${28} /><div><b>${tc ? tc.name : '连接器已下架'}</b><div className="text-xs muted">${top ? top.name : tpl.trigger.op}</div></div></div>
      <div className="tpl-step-title">将执行下列操作</div>
      ${tpl.steps.length === 0 && html`<div className="text-xs muted">这个模板没有预置操作，使用后在编辑器里添加</div>`}
      ${tpl.steps.map((s, i) => {
        const c = resolveConnector(s.connector);
        const o = c && c.actions.find((a) => a.key === s.op);
        return html`<div key=${`${i}-${s.connector}-${s.op}`} className="tpl-step"><span className="tpl-step-no">${i + 1}</span><${ConnectorIcon} id=${s.connector} size=${28} /><div><b>${c ? c.name : '连接器已下架'}</b><div className="text-xs muted">${o ? o.name : s.op}</div></div></div>`;
      })}
    </div>
    <${Alert} tone="info" title="使用前需要准备">${needs.length ? `${needs.map((c) => c.name).join('、')} 的连接。` : '这个模板不需要连接。'}使用模板后，编辑器的校验面板会提示需要补全的配置。<//>
  </div>`;
}

function IntegTemplateActions({ tpl, onUse, onBack }) {
  return html`<${Fragment}>
    ${tpl.helpUrl && html`<a className="btn btn-outline btn-md" href=${tpl.helpUrl} target="_blank" rel="noopener noreferrer"><${Icon} name="BookOpen" size=${16} /><span className="btn-label">帮助文档</span></a>`}
    ${onBack && html`<${Button} onClick=${onBack}>返回<//>`}
    <${Button} variant="primary" icon="Plus" onClick=${onUse}>使用此模板<//>
  <//>`;
}

function useTemplateFlow({ onDone } = {}) {
  const state = useStore();
  const [pending, setPending] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const editable = integEditableProjects(state);
  const finish = (tpl, pid) => {
    const s = Store.get();
    if (!pid || !s.projects.some((p) => p.id === pid)) { toast.error('目标项目不存在或已被删除'); return false; }
    if (!canEditProject(s, pid)) { toast.error('你在目标项目中没有编辑权限'); return false; }
    const limit = integLimitError(s, pid);
    if (limit) { toast.error(limit); return false; }
    const draft = workflowFromTemplate(tpl, pid);
    const wf = { ...draft, name: integUniqueName(s, pid, draft.name) };
    prependToList('workflows', wf);
    patchList('templates', tpl.id, (t) => ({ uses: (t.uses || 0) + 1 }));
    addAudit('从模板新建工作流', wf.name, pid);
    setPending(null);
    if (onDone) onDone();
    toast.success('从模板新建成功，请在校验面板补全配置');
    navigate(`/integration/${pid}/wf/${wf.id}?mode=edit`);
    return true;
  };
  const start = (tpl, presetProject) => {
    const s = Store.get();
    if (presetProject && canEditProject(s, presetProject)) return finish(tpl, presetProject);
    const list = integEditableProjects(s).filter((p) => !integLimitError(s, p.id));
    setProjectId(list.some((p) => p.id === s.currentProjectId) ? s.currentProjectId : ((list[0] || {}).id || null));
    setPending(tpl);
    return false;
  };
  const selected = editable.some((p) => p.id === projectId && !integLimitError(state, p.id)) ? projectId : null;
  const modal = html`<${Modal}
    open=${Boolean(pending)}
    onClose=${() => setPending(null)}
    title="选择目标项目"
    width=${440}
    footer=${html`<${Fragment}><${Button} onClick=${() => setPending(null)}>取消<//><${Button} variant="primary" disabled=${!selected} onClick=${() => finish(pending, selected)}>确定<//><//>`}
  >
    ${pending && html`<div className="text-xs muted integ-gap">使用模板「${pending.name}」新建工作流</div>`}
    ${editable.length
      ? html`<${Field} label="目标项目" required hint="只列出你有编辑权限的项目"><${Select} value=${selected} onChange=${setProjectId} placeholder="请选择项目" options=${editable.map((p) => ({ value: p.id, label: p.name, disabled: Boolean(integLimitError(state, p.id)), desc: integLimitError(state, p.id) ? '工作流数量已达上限' : '', iconNode: html`<${ProjectAvatar} project=${p} size=${18} />` }))} /><//>`
      : html`<${Alert} tone="warning">你还没有可编辑的项目。先新建一个项目，再从模板新建工作流。<//>`}
  <//>`;
  return { start, modal };
}

function TemplatePickerModal({ open, onClose, projectId, initial }) {
  const state = useStore();
  const [tab, setTab] = useState('rec');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);
  const flow = useTemplateFlow({ onDone: onClose });
  useEffect(() => { if (open) { setPreview(initial || null); setQ(''); setTab(initial ? integTplTab(initial, Store.get().me) : 'rec'); } }, [open]);
  const ql = q.trim().toLowerCase();
  const count = (k) => state.templates.filter((t) => integTplTab(t, state.me) === k).length;
  const list = state.templates.filter((t) => integTplTab(t, state.me) === tab && (!ql || `${t.name}${t.desc || ''}`.toLowerCase().includes(ql)));
  const use = (t) => flow.start(t, projectId);
  return html`<${Fragment}>
    <${Modal}
      open=${open}
      onClose=${onClose}
      title=${preview ? '模板详情' : '从模板新建工作流'}
      width=${960}
      bodyClassName="tpl-modal-body"
      footer=${preview && html`<${IntegTemplateActions} tpl=${preview} onBack=${() => setPreview(null)} onUse=${() => use(preview)} />`}
    >
      ${preview
        ? html`<${TemplatePreview} tpl=${preview} />`
        : html`<${Fragment}>
          <div className="row integ-gap">
            <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'rec', label: '推荐' }, { value: 'mine', label: '我的模板', count: count('mine') }, { value: 'shared', label: '与我共享', count: count('shared') }]} />
            <span className="spacer" />
            <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索模板名称或描述" />
          </div>
          <div className="tpl-grid">${list.map((t) => html`<${TemplateCard} key=${t.id} tpl=${t} onClick=${() => setPreview(t)} />`)}</div>
          ${list.length === 0 && html`<${Empty}
            icon="LayoutTemplate"
            title=${ql ? '没有匹配的模板' : tab === 'mine' ? '还没有生成过模板' : tab === 'shared' ? '暂无与你共享的模板' : '暂无模板'}
            description=${!ql && tab === 'mine' ? '在工作流的「···」菜单中点「生成模板」，就能把它变成可复用的模板。' : ''}
          />`}
        <//>`}
    <//>
    ${flow.modal}
  <//>`;
}

function ImportWorkflowModal({ open, onClose, projectId, folderId }) {
  const state = useStore();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [over, setOver] = useState(false);
  useEffect(() => { if (open) { setFile(null); setError(null); setName(''); setOver(false); } }, [open]);
  const read = (f) => {
    if (!f) return;
    f.text()
      .then((text) => {
        const parsed = integParseImport(text);
        if (parsed.error) { setFile(null); setError(parsed.error); return; }
        setError(null);
        setFile({ name: f.name, size: f.size, workflow: parsed.workflow });
        setName(integUniqueName(Store.get(), projectId, parsed.workflow.name.trim() || '导入的工作流'));
      })
      .catch(() => { setFile(null); setError('无法读取文件，请重新选择'); });
  };
  const trimmed = name.trim();
  const dup = state.workflows.some((w) => w.projectId === projectId && w.name === trimmed);
  const nameError = file ? (!trimmed ? '请输入工作流名称' : dup ? '项目内已有同名工作流' : null) : null;
  const limit = integLimitError(state, projectId);
  const doImport = () => {
    if (!file || nameError || limit) return;
    const s = Store.get();
    if (!s.projects.some((p) => p.id === projectId) || !canEditProject(s, projectId)) { toast.error('项目不存在或你没有编辑权限'); onClose(); return; }
    const src = file.workflow;
    const { nodes } = cloneNodes(src.steps);
    const graph = stripConnections({ trigger: { ...src.trigger, id: 'trigger', ref: null }, steps: nodes });
    const folder = folderId && s.folders.some((f) => f.id === folderId && f.projectId === projectId) ? folderId : null;
    const wf = newWorkflow({ projectId, name: trimmed, description: src.description.slice(0, 300), folderId: folder, trigger: graph.trigger, steps: graph.steps });
    prependToList('workflows', wf);
    addAudit('导入工作流', wf.name, projectId);
    onClose();
    toast.success('导入成功，请补全连接后发布');
    navigate(`/integration/${projectId}/wf/${wf.id}?mode=edit`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} title="导入工作流" width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!file || Boolean(nameError) || Boolean(limit)} onClick=${doImport}>导入<//><//>`}>
    ${limit && html`<div className="integ-gap"><${Alert} tone="warning">${limit}<//></div>`}
    <button
      type="button"
      className=${cx('dropzone', over && 'is-over', error && 'is-invalid')}
      onClick=${() => inputRef.current && inputRef.current.click()}
      onDragOver=${(e) => { e.preventDefault(); if (!over) setOver(true); }}
      onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop=${(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files && e.dataTransfer.files[0]); }}
    >
      <${Icon} name=${file ? 'FileJson' : 'Upload'} size=${28} strokeWidth=${1.5} />
      ${file
        ? html`<${Fragment}><b>${file.name}</b><span className="muted text-xs">${(file.size / 1024).toFixed(1)} KB · 点击重新选择</span><//>`
        : html`<${Fragment}><b>点击或拖拽文件到这里上传</b><span className="muted text-xs">支持从本平台导出的工作流文件（.json）</span><//>`}
    </button>
    <input ref=${inputRef} type="file" accept=".json,application/json" hidden onChange=${(e) => { read(e.target.files && e.target.files[0]); e.target.value = ''; }} />
    ${error && html`<div className="field-error integ-gap-top">${error}</div>`}
    ${file && html`<div className="integ-gap-top"><${Field} label="工作流名称" required error=${nameError}><${CharInput} value=${name} onChange=${setName} max=${100} invalid=${Boolean(nameError)} /><//></div>`}
    <div className="text-xs muted integ-gap-top">导入后需要重新选择连接，工作流为未发布的草稿。</div>
  <//>`;
}

function FolderModal({ open, onClose, projectId, folder, parentId }) {
  const state = useStore();
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (open) { setName(folder ? folder.name : ''); setDirty(false); } }, [open]);
  const folders = state.folders.filter((f) => f.projectId === projectId);
  const parent = parentId ? folders.find((f) => f.id === parentId) : null;
  const levelOf = (id) => { const f = folders.find((x) => x.id === id); return f ? 1 + levelOf(f.parentId) : 0; };
  const siblingParent = folder ? folder.parentId || null : parentId || null;
  const trimmed = name.trim();
  const dup = folders.some((f) => (f.parentId || null) === siblingParent && f.name === trimmed && (!folder || f.id !== folder.id));
  const limitError = folder ? null : folders.length >= INTEG_FOLDER_LIMIT ? `每个项目最多 ${INTEG_FOLDER_LIMIT} 个文件夹，请先整理现有文件夹` : parentId && levelOf(parentId) >= INTEG_FOLDER_DEPTH ? '文件夹最多三层，不能在第三层文件夹下再建子文件夹' : null;
  const nameError = dup ? '同一层级下已有同名文件夹' : dirty && !trimmed ? '请输入文件夹名称' : null;
  const valid = trimmed && !dup && !limitError;
  const save = () => {
    if (!valid) return;
    if (folder) {
      if (trimmed !== folder.name) { patchList('folders', folder.id, { name: trimmed }); toast.success('已重命名'); }
      onClose();
      return;
    }
    Store.set((s) => ({ ...s, folders: [...s.folders, { id: uid('f'), projectId, parentId: parentId || null, name: trimmed }] }));
    toast.success(parent ? `已在「${parent.name}」下新建文件夹` : '已新建文件夹');
    onClose();
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${folder ? '重命名文件夹' : parent ? `在「${parent.name}」下新建子文件夹` : '新建文件夹'} width=${440} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>确定<//><//>`}>
    ${limitError && html`<div className="integ-gap"><${Alert} tone="warning">${limitError}<//></div>`}
    <${Field} label="文件夹名称" required error=${nameError} hint=${`文件夹最多三层，每个项目最多 ${INTEG_FOLDER_LIMIT} 个（已有 ${folders.length} 个）`}>
      <${CharInput} value=${name} onChange=${(v) => { setName(v); setDirty(true); }} max=${50} autoFocus invalid=${Boolean(nameError)} placeholder="例：入转调离" onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); }} />
    <//>
  <//>`;
}

function MoveModal({ open, onClose, ids, folders, current, onMove }) {
  const [target, setTarget] = useState(current === undefined ? null : current);
  const known = new Set(folders.map((f) => f.id));
  const parentOf = (f) => (f.parentId && known.has(f.parentId) ? f.parentId : null);
  const walk = (parentId, depth) => folders.filter((f) => parentOf(f) === parentId).flatMap((f) => [{ f, depth }, ...walk(f.id, depth + 1)]);
  const options = [{ id: null, name: '项目根目录', depth: 0 }, ...walk(null, 0).map(({ f, depth }) => ({ id: f.id, name: f.name, depth: depth + 1 }))];
  const same = current !== undefined && target === current;
  return html`<${Modal} open=${open} onClose=${onClose} title=${`移动 ${ids.length} 个工作流到`} width=${440} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${same} onClick=${() => onMove(target)}>移动<//><//>`}>
    <div className="integ-move-list">
      ${options.map((o) => html`<button key=${o.id || 'root'} type="button" className=${cx('menu-item', target === o.id && 'is-active')} style=${{ paddingLeft: 8 + o.depth * 18 }} onClick=${() => setTarget(o.id)}>
        <${Icon} name=${o.id ? 'Folder' : 'House'} size=${16} />
        <span className="menu-item-body"><span className="menu-item-label">${o.name}</span>${current !== undefined && o.id === current && html`<span className="menu-item-desc">当前位置</span>`}</span>
        ${target === o.id && html`<${Icon} name="Check" size=${14} className="menu-item-check" />`}
      </button>`)}
    </div>
  <//>`;
}

function ProjectModal({ open, onClose, project }) {
  const state = useStore();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(project ? project.name : '');
    setDesc(project ? project.description || '' : '');
    setColor(project ? project.color : PROJECT_COLORS[Math.floor(Math.random() * 6)]);
    setDirty(false);
  }, [open]);
  const trimmed = name.trim();
  const dup = state.projects.some((p) => p.name === trimmed && (!project || p.id !== project.id));
  const nameError = dup ? '已有同名项目' : dirty && !trimmed ? '请输入项目名称' : null;
  const valid = trimmed && !dup;
  const save = () => {
    if (!valid) return;
    if (project) {
      if (!canEditProject(Store.get(), project.id)) { toast.error(INTEG_VIEWER_TIP); return; }
      if (trimmed !== project.name || desc.trim() !== (project.description || '') || color !== project.color) {
        patchList('projects', project.id, { name: trimmed, description: desc.trim(), color });
        addAudit('修改项目信息', trimmed, project.id);
        toast.success('保存成功');
      }
      onClose();
      return;
    }
    const p = { id: uid('p'), name: trimmed, description: desc.trim(), color, createdAt: Date.now(), owner: state.me, limits: { workflows: 50, runsPerMonth: 100000 } };
    Store.set((s) => ({ ...s, projects: [...s.projects, p], members: [...s.members, { projectId: p.id, userId: s.me, role: 'owner', joinedAt: Date.now() }], currentProjectId: p.id }));
    addAudit('创建项目', p.name, p.id);
    onClose();
    toast.success('项目创建成功');
    navigate(`/integration/${p.id}`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${project ? '编辑基本信息' : '新建项目'} width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>${project ? '保存' : '创建'}<//><//>`}>
    <${Field} label="名称" required error=${nameError}><${CharInput} value=${name} onChange=${(v) => { setName(v); setDirty(true); }} max=${100} placeholder="例：人事行政" autoFocus invalid=${Boolean(nameError)} /><//>
    <${Field} label="项目图标">
      <div className="row">
        <${ProjectAvatar} project=${{ name: trimmed || '新', color }} size=${36} />
        <div className="color-dots" role="radiogroup" aria-label="项目颜色">${PROJECT_COLORS.map((c) => html`<button key=${c} type="button" role="radio" aria-checked=${c === color} className=${cx('color-dot', c === color && 'is-active')} style=${{ background: c }} onClick=${() => setColor(c)} aria-label=${c} />`)}</div>
      </div>
    <//>
    <${Field} label="描述"><${CharTextarea} value=${desc} onChange=${setDesc} max=${300} placeholder="说明项目覆盖的业务范围" /><//>
  <//>`;
}

function ProjectShareModal({ open, onClose, project }) {
  const state = useStore();
  const [adding, setAdding] = useState([]);
  const [perm, setPerm] = useState('editor');
  useEffect(() => { if (open) { setAdding([]); setPerm('editor'); } }, [open]);
  const canManage = canEditProject(state, project.id);
  const members = state.members.filter((m) => m.projectId === project.id);
  const order = (m) => (m.role === 'owner' ? 0 : m.userId === state.me ? 1 : 2);
  const sorted = [...members].sort((a, b) => order(a) - order(b) || (a.joinedAt || 0) - (b.joinedAt || 0));
  const candidates = state.users.filter((u) => u.status !== 'disabled' && !members.some((m) => m.userId === u.id));
  const roleOptions = ROLE_OPTIONS.filter((r) => r.value !== 'owner').map((r) => ({ value: r.value, label: r.label, desc: r.desc }));
  const add = () => {
    const ids = adding.filter((id) => candidates.some((u) => u.id === id));
    if (!ids.length || !canManage) return;
    Store.set((s) => ({ ...s, members: [...s.members, ...ids.map((userId) => ({ projectId: project.id, userId, role: perm, joinedAt: Date.now() }))] }));
    addAudit('添加项目成员', `${project.name} · ${ids.map((id) => personName(id)).join('、')} ${roleLabel(perm)}`, project.id);
    toast.success(`已添加 ${ids.length} 位成员`);
    setAdding([]);
  };
  const setRole = (m, role) => {
    if (m.role === role) return;
    Store.set((s) => ({ ...s, members: s.members.map((x) => (x.projectId === project.id && x.userId === m.userId ? { ...x, role } : x)) }));
    addAudit('修改成员权限', `${project.name} · ${personName(m.userId)} ${roleLabel(role)}`, project.id);
    toast.success(`已将「${personName(m.userId)}」的权限改为${roleLabel(role)}`);
  };
  const remove = async (m) => {
    const who = personName(m.userId);
    const ok = await confirmDialog({ title: `移除成员「${who}」？`, content: '移除后对方将无法访问这个项目。', danger: true, okText: '移除' });
    if (!ok) return;
    Store.set((s) => ({ ...s, members: s.members.filter((x) => !(x.projectId === project.id && x.userId === m.userId)) }));
    addAudit('移除项目成员', `${project.name} · ${who}`, project.id);
    toast.success('已移除');
  };
  const link = `https://${state.tenant.domain}/integration/${project.id}`;
  return html`<${Modal} open=${open} onClose=${onClose} title=${canManage ? `分享「${project.name}」` : `「${project.name}」的成员`} description="项目成员可以查看或编辑项目内的全部工作流、项目配置和数据存储" width=${600}>
    ${canManage
      ? html`<div className="row integ-share-add">
        <div className="grow"><${Select} multiple searchable value=${adding} onChange=${setAdding} placeholder=${candidates.length ? '搜索用户，可添加多位' : '所有用户都已是项目成员'} disabled=${!candidates.length} options=${candidates.map((u) => ({ value: u.id, label: u.name, desc: `${u.email} · ${u.dept}${u.status === 'invited' ? ' · 待激活' : ''}`, iconNode: html`<${Avatar} name=${u.name} size=${20} />` }))} /></div>
        <${Select} width=${110} value=${perm} onChange=${setPerm} options=${roleOptions} />
        <${Button} variant="primary" disabled=${!adding.length} onClick=${add}>添加<//>
      </div>`
      : html`<${Alert} tone="info">${INTEG_VIEWER_TIP}成员，不能添加或修改成员。<//>`}
    <div className="section-title integ-member-title">项目成员 ${members.length}</div>
    <div className="member-list">
      ${sorted.map((m) => {
        const u = state.users.find((x) => x.id === m.userId);
        const self = m.userId === state.me;
        const manageable = canManage && m.role !== 'owner' && !self;
        return html`<div key=${m.userId} className="member-row" data-member=${m.userId}>
          <${Avatar} name=${u ? u.name : '已移除'} size=${30} />
          <div className="grow">
            <div className="row-4">
              <span className=${u ? '' : 'muted'}>${u ? u.name : '已移除的用户'}</span>
              ${self && html`<span className="muted text-xs">（你）</span>`}
              ${u && u.external && html`<${Tag} size="sm" tone="warning">外部<//>`}
              ${u && u.status === 'invited' && html`<${Tag} size="sm" tone="outline">待激活<//>`}
              ${u && u.status === 'disabled' && html`<${Tag} size="sm">已禁用<//>`}
            </div>
            <div className="text-xs muted">${u ? u.email : '该用户已从企业中移除'}</div>
          </div>
          ${m.role === 'owner'
            ? html`<span className="muted member-role">所有者</span>`
            : manageable
              ? html`<div className="row-4">
                <${Select} width=${110} size="sm" value=${m.role} onChange=${(v) => setRole(m, v)} options=${roleOptions} />
                <${IconButton} icon="UserMinus" size="sm" title="移除成员" onClick=${() => remove(m)} />
              </div>`
              : html`<span className="muted member-role">${roleLabel(m.role)}</span>`}
        </div>`;
      })}
    </div>
    <div className="row integ-share-foot">
      <${CopyButton} text=${link} label="复制项目链接" size="sm" />
      <span className="spacer" />
      <span className="text-xs muted">只有项目成员能通过链接访问</span>
    </div>
  <//>`;
}

function BatchPublishModal({ open, onClose, ids, projectId }) {
  const state = useStore();
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const staged = isStagedProject(state, projectId);
  const locks = state.editLocks || {};
  const wfs = state.workflows.filter((w) => ids.includes(w.id) && w.projectId === projectId);
  const checked = wfs.map((w) => {
    const issues = workflowIssues(w, state);
    const lock = locks[w.id] && locks[w.id].userId !== state.me ? locks[w.id] : null;
    return { wf: w, errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length, unchanged: Boolean(latestVersion(w) && !w.draftChanged), lock };
  });
  const ok = checked.filter((c) => !c.errors && !c.unchanged && !c.lock);
  const bad = checked.filter((c) => c.errors);
  const same = checked.filter((c) => !c.errors && c.unchanged);
  const locked = checked.filter((c) => !c.errors && !c.unchanged && c.lock);
  const warned = ok.filter((c) => c.warnings);
  useEffect(() => {
    if (!open) return undefined;
    setStep(0); setChecking(true); setNote(''); setResult(null);
    const t = setTimeout(() => setChecking(false), 900);
    return () => clearTimeout(t);
  }, [open]);
  const next = async () => {
    if (warned.length) {
      const go = await confirmDialog({ title: '发布提醒', content: `${warned.length} 个工作流有未解决的警告，发布后相关节点可能运行失败。`, okText: '继续发布' });
      if (!go) return;
    }
    setStep(1);
  };
  const publish = () => {
    const fresh = Store.get();
    if (!canEditProject(fresh, projectId)) { toast.error(INTEG_VIEWER_TIP); return; }
    const now = Date.now();
    const toTest = isStagedProject(fresh, projectId);
    const env = projectEnvs(fresh, projectId).find((e) => e.key === (toTest ? 'test' : 'prod'));
    const freshLocks = fresh.editLocks || {};
    const targets = ok.map((c) => fresh.workflows.find((w) => w.id === c.wf.id)).filter((w) => w && !(latestVersion(w) && !w.draftChanged) && !(freshLocks[w.id] && freshLocks[w.id].userId !== fresh.me));
    const bumped = Object.fromEntries(targets.map((w) => [w.id, integNextVersion(fresh, w)]));
    Store.set((s) => ({
      ...s,
      workflows: s.workflows.map((w) => {
        if (!bumped[w.id]) return w;
        const base = { ...w, draftChanged: false, updatedAt: now };
        return toTest
          ? { ...base, test: { version: bumped[w.id], status: 'enabled', at: now, by: s.me } }
          : { ...base, version: bumped[w.id], published: true, status: 'enabled' };
      }),
      versions: [...targets.map((w) => ({ id: `v_${w.id}_${bumped[w.id]}`, workflowId: w.id, version: bumped[w.id], publishedAt: now, publisher: s.me, note: note.trim(), group: env.name, groupId: env.id || 'default', envs: [toTest ? 'test' : 'prod'], snapshot: { trigger: w.trigger, steps: w.steps } })), ...s.versions],
    }));
    targets.forEach((w) => addAudit(toTest ? '发布到测试环境' : '发布工作流', `${w.name} v${bumped[w.id]}`, projectId));
    setResult({ total: checked.length, published: targets.map((w) => ({ id: w.id, name: w.name, version: bumped[w.id] })), envName: env.name, toTest });
    setStep(2);
  };
  const statusTag = (c) => {
    if (c.errors) return html`<${Tag} tone="danger" size="sm">${c.errors} 个错误，需编辑修复<//>`;
    if (c.unchanged) return html`<${Tag} size="sm">没有未发布的修改<//>`;
    if (c.lock) return html`<${Tag} tone="warning" size="sm">${personName(c.lock.userId)} 正在编辑<//>`;
    if (c.warnings) return html`<${Tag} tone="warning" size="sm">可发布 · ${c.warnings} 个警告<//>`;
    return html`<${Tag} tone="success" size="sm">可发布<//>`;
  };
  return html`<${Modal} open=${open} onClose=${onClose} title="批量发布" width=${640} footer=${html`<${Fragment}>
    ${step === 0 && html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${checking || !ok.length} onClick=${next}>下一步<//><//>`}
    ${step === 1 && html`<${Fragment}><${Button} onClick=${() => setStep(0)}>上一步<//><${Button} variant="primary" onClick=${publish}>${staged ? `发布 ${ok.length} 个工作流到测试环境` : `发布 ${ok.length} 个工作流`}<//><//>`}
    ${step === 2 && html`<${Button} variant="primary" onClick=${onClose}>完成<//>`}
  <//>`}>
    <${Steps} current=${step} items=${[{ title: '校验资源' }, { title: '发布配置' }, { title: '发布结果' }]} />
    <div className="integ-bp-body">
      ${step === 0 && (checking
        ? html`<div className="row muted integ-bp-loading"><${Icon} name="LoaderCircle" size=${16} className="spin" />资源校验中…</div>`
        : html`<${Fragment}>
          ${bad.length > 0 && html`<div className="integ-gap"><${Alert} tone="warning">${bad.length} 个工作流存在错误，不可发布，已自动移出本次发布<//></div>`}
          ${same.length > 0 && html`<div className="integ-gap"><${Alert} tone="info">${same.length} 个工作流没有未发布的修改，无需发布<//></div>`}
          ${locked.length > 0 && html`<div className="integ-gap"><${Alert} tone="warning">${locked.length} 个工作流正在被其他人编辑，草稿可能还没改完，已移出本次发布<//></div>`}
          ${warned.length > 0 && html`<div className="integ-gap"><${Alert} tone="warning">${warned.length} 个工作流有未解决的警告，下一步会再次提醒<//></div>`}
          <div className="col integ-bp-list">
            ${checked.map((c) => html`<div key=${c.wf.id} className="integ-bp-row">
              <${WorkflowGlyph} wf=${c.wf} size=${18} /><span className="grow ellipsis">${c.wf.name}</span>${statusTag(c)}
            </div>`)}
          </div>
        <//>`)}
      ${step === 1 && html`<${Fragment}>
        <div className="integ-gap">${staged
          ? html`<${Alert} tone="info" title="发布到测试环境">将发布 ${ok.length} 个工作流，每个生成一个新版本，只部署到测试环境，生产环境不受影响。测试环境使用测试环境的配置值和连接替换，验证后在项目概览或编辑器里推广到生产环境。<//>`
          : html`<${Alert} tone="warning">将发布 ${ok.length} 个工作流，每个生成一个新版本，发布后立即在生产环境运行，正在运行的旧版本会被替换。<//>`}</div>
        <${Field} label="发布描述"><${CharTextarea} value=${note} onChange=${setNote} max=${300} rows=${3} placeholder="说明这次改了什么，方便团队追溯" /><//>
      <//>`}
      ${step === 2 && result && html`<${Fragment}>
        <${Empty} icon="CircleCheck" title=${`本次共批量发布 ${result.total} 个资源`} description=${`${result.published.length} 个已发布到${result.envName}，${result.total - result.published.length} 个不可发布或无需发布。${result.toTest ? '验证通过后再推广到生产环境。' : ''}`} />
        <div className="col integ-bp-list">
          ${result.published.map((p) => html`<div key=${p.id} className="integ-bp-row"><${Icon} name="CircleCheck" size=${16} className="integ-ok" /><span className="grow ellipsis">${p.name}</span><${Tag} size="sm" tone="success">${result.toTest ? '测试 ' : ''}v${p.version}<//></div>`)}
        </div>
      <//>`}
    </div>
  <//>`;
}

function IntegEnvCell({ wf, envKey }) {
  const d = deploymentOf(wf, envKey);
  if (!d) return html`<span className="muted">${envKey === 'test' ? '未部署' : '未发布'}</span>`;
  const on = d.status === 'enabled';
  return html`<span className="integ-env-cell"><b>v${d.version}</b><${Dot} tone=${on ? 'success' : 'default'} /><span className="muted">${on ? '运行中' : '已停止'}</span></span>`;
}

function ProjectPage({ pid }) {
  const state = useStore();
  const [modal, setModal] = useState(null);
  const [shuffle, setShuffle] = useState(0);
  const [pickedTpl, setPickedTpl] = useState(null);
  const [promoteId, setPromoteId] = useState(null);
  const project = state.projects.find((p) => p.id === pid);
  if (!project) return html`<div className="page"><${Empty} icon="FolderX" title="项目不存在或已被删除" action=${html`<${Button} onClick=${() => navigate('/projects')}>查看全部项目<//>`} /></div>`;
  const canEdit = canEditProject(state, pid);
  const viewerTip = canEdit ? '' : INTEG_VIEWER_TIP;
  const wfs = state.workflows.filter((w) => w.projectId === pid);
  const limitError = integLimitError(state, pid);
  const aiTip = viewerTip || limitError || '';
  const closeModal = () => setModal(null);
  const promoteWf = promoteId ? wfs.find((w) => w.id === promoteId) : null;
  const modals = html`<${Fragment}>
    ${modal === 'new' && html`<${NewWorkflowModal} open=${true} onClose=${closeModal} projectId=${pid} />`}
    ${modal === 'tpl' && html`<${TemplatePickerModal} open=${true} onClose=${closeModal} projectId=${canEdit ? pid : null} initial=${pickedTpl} />`}
    ${modal === 'share' && html`<${ProjectShareModal} open=${true} onClose=${closeModal} project=${project} />`}
    ${promoteWf && html`<${PromoteModal} open=${true} onClose=${() => setPromoteId(null)} wf=${promoteWf} state=${state} />`}
  <//>`;
  const openTemplates = (t) => { setPickedTpl(t || null); setModal('tpl'); };
  const aiButton = (size) => html`<${IntegDisabledTip} tip=${aiTip}><${Button} size=${size} icon="Sparkles" disabled=${Boolean(aiTip)} onClick=${() => aiBus.open({ projectId: pid })}>用 AI 生成<//><//>`;
  if (wfs.length === 0) {
    const tpls = state.templates.filter((t) => integTplTab(t, state.me) === 'rec');
    const shown = Array.from({ length: Math.min(4, tpls.length) }, (_, i) => tpls[(shuffle * 4 + i) % tpls.length]);
    return html`<div className="page"><div className="page-inner">
      <div className="landing">
        <div className="landing-art">
          <div className="landing-art-card is-a"><${KindTile} icon="Globe" size=${40} /><div><b>Webhook 触发器</b><div className="text-xs muted">webhook-trigger-1</div></div></div>
          <div className="landing-art-line" />
          <div className="landing-art-card is-b"><${ConnectorIcon} id="feishu" size=${40} /><div><b>发送消息卡片</b><div className="text-xs muted">feishu-1</div></div></div>
        </div>
        <div className="landing-text">
          <h1 className="landing-title">业务集成</h1>
          <div className="muted integ-gap">在业务集成模块，你可以：</div>
          <ul className="landing-list">
            <li>用一句话描述需求，让 AI 生成工作流草稿</li>
            <li>使用模板快速创建工作流，提升工作效率</li>
            <li>通过运行日志观察工作流运行状况</li>
            <li>以项目为维度管理工作流、数据存储，分配项目成员权限</li>
          </ul>
          <div className="row">
            <${IntegDisabledTip} tip=${viewerTip}><${Button} variant="primary" size="lg" icon="Plus" disabled=${!canEdit} onClick=${() => setModal('new')}>新建工作流<//><//>
            ${aiButton('lg')}
            <${Button} size="lg" icon=${canEdit ? 'Share2' : 'Users'} onClick=${() => setModal('share')}>${canEdit ? '分享项目' : '查看成员'}<//>
          </div>
          ${!canEdit && html`<div className="text-xs muted integ-gap-top">${INTEG_VIEWER_TIP}。下方的模板可以用在你有编辑权限的项目里。</div>`}
        </div>
      </div>
      <div className="section-head integ-landing-tpl">
        <div className="row"><span className="section-title">从模板新建工作流</span><${Button} size="xs" variant="ghost" icon="RefreshCw" disabled=${tpls.length <= 4} onClick=${() => setShuffle(shuffle + 1)}>换一批<//></div>
        <${Link} to="/templates" className="link text-xs">模板中心<//>
      </div>
      <div className="tpl-grid">${shown.map((t) => html`<${TemplateCard} key=${t.id} tpl=${t} onClick=${() => openTemplates(t)} />`)}</div>
      ${modals}
    </div></div>`;
  }
  const staged = isStagedProject(state, pid);
  const now = Date.now();
  const since7 = now - 7 * DAY;
  const runs = state.runs.filter((r) => r.projectId === pid && r.kind === 'run');
  const week = runMetrics(runs.filter((r) => r.startedAt >= since7));
  const prevWeek = runMetrics(runs.filter((r) => r.startedAt >= now - 14 * DAY && r.startedAt < since7)).total;
  const trend = prevWeek ? Math.round(((week.total - prevWeek) / prevWeek) * 1000) / 10 : null;
  const timeouts = runs.filter((r) => r.startedAt >= since7 && r.status === 'timeout').length;
  const weekLink = integLogsLink({ project: pid, time: '7d', statuses: ['success', 'failed', 'timeout', 'running', 'waiting', 'stopped'] });
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthRuns = runs.filter((r) => r.startedAt >= monthStart.getTime()).length;
  const members = state.members.filter((m) => m.projectId === pid);
  const owner = state.users.find((u) => u.id === project.owner);
  const stats = Object.fromEntries(wfs.map((w) => [w.id, integWfStats({ runs, since: since7, wfId: w.id })]));
  const me = state.users.find((u) => u.id === state.me);
  const isAdmin = Boolean(me && (me.modules || []).includes('admin'));
  const limitWf = project.limits ? project.limits.workflows : 0;
  const limitRuns = project.limits ? project.limits.runsPerMonth : 0;
  const pending = (state.releases || []).filter((r) => r.projectId === pid && r.status === 'pending');
  const pendingOf = Object.fromEntries(pending.map((r) => [r.workflowId, r]));
  const mine = pending.filter((r) => r.approvers.includes(state.me));
  const aheadCount = wfs.filter((w) => integTestAhead(w) && !pendingOf[w.id]).length;
  const nameOf = (id) => (wfs.find((w) => w.id === id) || { name: '已删除的工作流' }).name;
  const stop = (e) => e.stopPropagation();
  const nameCol = { key: 'name', title: '名称', render: (w) => html`<div className="cell-main"><${WorkflowGlyph} wf=${w} size=${18} /><span className="cell-title" title=${w.name}>${w.name}</span>${latestVersion(w) > 0 && w.draftChanged && html`<${Tooltip} content="有更新未发布"><span className="ptree-dot" /><//>`}</div>` };
  const runCols = [
    { key: 'last', title: '最近运行', width: 108, render: (w) => { const s = stats[w.id]; return s.last ? html`<span className="row-4"><${Dot} tone=${RUN_STATUS[s.last.status].tone} /><span className="muted">${fmt.relative(s.last.startedAt)}</span></span>` : html`<span className="muted">-</span>`; } },
    { key: 'count', title: '近 7 天运行', width: 96, align: 'right', render: (w) => fmt.number(stats[w.id].total) },
    { key: 'rate', title: '成功率', width: 76, align: 'right', render: (w) => { const s = stats[w.id]; return s.rate === null ? html`<span className="muted">-</span>` : html`<span className=${s.rate < 0.9 ? 'integ-bad' : ''}>${fmtRate(s.rate)}</span>`; } },
  ];
  const actionCell = (w) => {
    const pr = pendingOf[w.id];
    if (pr) {
      return html`<span onClick=${stop}><${Tooltip} content=${`${personName(pr.requestedBy)} 申请推广 v${pr.version}，等待 ${pr.approvers.map((u) => personName(u)).join('、')} 审批`}>
        <button type="button" className="integ-pending-btn" onClick=${() => navigate(`/integration/${pid}/releases/${pr.id}`)}><${Tag} tone="warning" size="sm" icon="Clock">待审批 v${pr.version}<//></button>
      <//></span>`;
    }
    if (integTestAhead(w) && canEdit) return html`<span onClick=${stop}><${Button} size="xs" icon="Rocket" onClick=${() => setPromoteId(w.id)}>推广<//></span>`;
    return html`<span className="muted">-</span>`;
  };
  const columns = staged
    ? [nameCol,
      { key: 'test', title: '测试环境', width: 128, render: (w) => html`<${IntegEnvCell} wf=${w} envKey="test" />` },
      { key: 'prod', title: '生产环境', width: 128, render: (w) => html`<${IntegEnvCell} wf=${w} envKey="prod" />` },
      ...runCols,
      { key: 'act', title: '推广', width: 112, render: actionCell }]
    : [nameCol, { key: 'status', title: '状态', width: 80, render: (w) => html`<${WorkflowStatusTag} wf=${w} size="sm" />` }, ...runCols];
  return html`<div className="page"><div className="page-inner">
    <${PageHeader}
      icon=${html`<${ProjectAvatar} project=${project} size=${44} />`}
      title=${project.name}
      description=${project.description || '暂无描述'}
      actions=${html`<${Fragment}>
        <${Button} icon=${canEdit ? 'Share2' : 'Users'} onClick=${() => setModal('share')}>${canEdit ? '分享' : '查看成员'}<//>
        <${IntegDisabledTip} tip=${viewerTip}><${Button} icon="LayoutTemplate" disabled=${!canEdit} onClick=${() => openTemplates(null)}>从模板新建<//><//>
        ${aiButton('md')}
        <${IntegDisabledTip} tip=${viewerTip}><${Button} variant="primary" icon="Plus" disabled=${!canEdit} onClick=${() => setModal('new')}>新建工作流<//><//>
      <//>`}
    />
    ${!canEdit && html`<div className="integ-gap"><${Alert} tone="info">${INTEG_VIEWER_TIP}，不能新建、编辑或发布工作流。<//></div>`}
    ${staged && mine.length > 0 && html`<div className="integ-gap"><${Alert}
      tone="warning"
      icon="Clock"
      title=${`${mine.length} 个发布等待你审批`}
      action=${html`<${Button} size="sm" variant=${mine.length === 1 ? 'primary' : 'outline'} onClick=${() => navigate(mine.length === 1 ? `/integration/${pid}/releases/${mine[0].id}` : `/integration/${pid}/releases`)}>${mine.length === 1 ? '去审批' : '查看全部'}<//>`}
    >
      ${mine.slice(0, 3).map((r) => html`<div key=${r.id}>「${nameOf(r.workflowId)}」v${r.version} 推广到生产环境 · ${personName(r.requestedBy)} 申请于 ${fmt.relative(r.requestedAt)}</div>`)}
    <//></div>`}
    <div className="stat-grid">
      <${Stat} label="工作流" icon="Workflow" value=${wfs.length} delta=${staged
        ? [`${wfs.filter((w) => w.status === 'enabled' && w.published).length} 个在生产运行`, aheadCount ? `${aheadCount} 个待推广` : '', pending.length ? `${pending.length} 个待审批` : ''].filter(Boolean).join(' · ')
        : `${wfs.filter((w) => w.status === 'enabled').length} 个运行中 · ${wfs.filter((w) => w.draftChanged && w.published).length} 个有更新未发布`} />
      <${Stat} label="近 7 天运行" icon="Play" value=${fmt.number(week.total)} delta=${trend === null ? '前 7 天没有运行' : `较前 7 天 ${trend >= 0 ? '+' : ''}${trend}%`} help=${week.deduped ? `不含调试运行和 ${fmt.number(week.deduped)} 次已去重的重复事件，点击查看对应的运行日志` : '不含调试运行，点击查看对应的运行日志'} onClick=${() => navigate(weekLink)} />
      <${Stat} label="近 7 天成功率" icon="CircleCheck" value=${fmtRate(week.rate)} delta=${week.finished ? `${fmt.number(week.success)} 次成功 · ${fmt.number(week.failed)} 次失败或超时` : '暂无已结束的运行'} tone=${week.rate !== null && week.rate < 0.9 ? 'danger' : undefined} help="成功次数 ÷ 已结束的运行次数，不含调试和运行中的记录" onClick=${() => navigate(weekLink)} />
      <${Stat} label="近 7 天失败" icon="CircleX" value=${fmt.number(week.failed)} delta=${week.failed ? `含 ${timeouts} 次超时 · 点击查看失败日志` : '没有失败或超时的运行'} tone=${week.failed ? 'danger' : undefined} help="运行失败和运行超时的次数，不含调试运行" onClick=${() => navigate(integLogsLink({ project: pid, statuses: ['failed', 'timeout'], time: '7d' }))} />
    </div>
    <div className=${cx('overview-grid', staged && 'integ-overview-staged')}>
      <${Card}
        title="工作流"
        subtitle=${staged ? '每个工作流在测试环境和生产环境运行的版本，以及近 7 天的运行情况（不含调试运行）' : '近 7 天的运行情况，不含调试运行'}
        extra=${staged && html`<${Link} to=${`/integration/${pid}/releases`} className="link text-xs">发布与审批<//>`}
        bodyClassName="card-body-flush"
      >
        <${Table}
          dense
          className=${cx('integ-wf-table', staged && 'integ-wf-table-staged')}
          onRowClick=${(w) => navigate(`/integration/${pid}/wf/${w.id}`)}
          columns=${columns}
          data=${wfs}
        />
      <//>
      <div className="col integ-side-col">
        <${Card} title="项目成员" extra=${canEdit && html`<${Button} size="xs" icon="UserPlus" onClick=${() => setModal('share')}>分享<//>`}>
          <div className="col integ-member-col">
            ${members.slice(0, 6).map((m) => html`<div key=${m.userId} className="row"><${Avatar} name=${personName(m.userId)} size=${26} /><span className="grow ellipsis">${personName(m.userId)}${m.userId === state.me ? '（你）' : ''}</span><span className="text-xs muted">${roleLabel(m.role)}</span></div>`)}
            ${members.length > 6 && html`<button type="button" className="link text-xs integ-link-btn" onClick=${() => setModal('share')}>查看全部 ${members.length} 位成员</button>`}
          </div>
        <//>
        <${Card} title="项目信息">
          <div className="kv">
            <div><span>所有者</span><span>${owner ? owner.name : personName(project.owner)}</span></div>
            <div><span>我的权限</span><span>${roleLabel(projectRole(state, pid))}</span></div>
            <div><span>环境</span><span>${staged ? html`<${Link} to=${`/integration/${pid}/config`} className="link">测试环境 + 生产环境<//>` : html`<${Link} to=${`/integration/${pid}/config`} className="link">只有生产环境<//>`}</span></div>
            <div><span>创建时间</span><span>${fmt.date(project.createdAt)}</span></div>
            <div><span>项目 ID</span><span className="mono">${project.id}</span></div>
          </div>
          <div className="divider integ-divider" />
          <div className="text-xs muted integ-limit-label">工作流数量 ${wfs.length} / ${limitWf || '不限'}</div>
          ${limitWf > 0 && html`<${Progress} value=${(wfs.length / limitWf) * 100} tone=${wfs.length >= limitWf ? 'danger' : 'primary'} />`}
          <div className="text-xs muted integ-limit-label integ-gap-top">本月运行次数 ${fmt.number(monthRuns)} / ${limitRuns ? fmt.number(limitRuns) : '不限'}</div>
          ${limitRuns > 0 && html`<${Progress} value=${(monthRuns / limitRuns) * 100} tone="success" />`}
          <div className="text-xs muted integ-gap-top">${isAdmin ? html`<${Fragment}>上限可在<${Link} to="/admin/projects" className="link">「项目与上限」<//>中调整<//>` : '上限由平台管理员设置'}</div>
        <//>
      </div>
    </div>
    ${modals}
  </div></div>`;
}

function AllProjectsPage() {
  const state = useStore();
  const [tab, setTab] = useState('mine');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const ql = q.trim().toLowerCase();
  const roleOf = (p) => projectRole(state, p.id);
  const mineCount = state.projects.filter((p) => roleOf(p)).length;
  const list = state.projects.filter((p) => (tab === 'all' || roleOf(p)) && (!ql || `${p.name}${p.description || ''}`.toLowerCase().includes(ql)));
  const lastUpdate = (p) => Math.max(p.createdAt, ...state.workflows.filter((w) => w.projectId === p.id).map((w) => w.updatedAt));
  const shareProject = modal && modal.share ? state.projects.find((p) => p.id === modal.share) : null;
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="全部项目" description="项目是最小的管理单元，项目之间权限和数据互相隔离" actions=${html`<${Button} variant="primary" icon="Plus" onClick=${() => setModal({ type: 'new' })}>新建项目<//>`} />
    <div className="toolbar">
      <${Tabs} variant="pill" value=${tab} onChange=${setTab} items=${[{ value: 'mine', label: '我的项目', count: mineCount }, { value: 'all', label: '全部项目', count: state.projects.length }]} />
      <span className="spacer" />
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索项目名称或描述" />
    </div>
    <${Table}
      onRowClick=${(p) => (roleOf(p) ? navigate(`/integration/${p.id}`) : toast.warning('你不是该项目的成员，请联系项目所有者分享给你'))}
      columns=${[
        { key: 'name', title: '项目名称', render: (p) => html`<div className="cell-main"><${ProjectAvatar} project=${p} size=${28} /><span className="cell-title">${p.name}</span>${!roleOf(p) && html`<${Tag} size="sm" icon="Lock">无权限<//>`}</div>` },
        { key: 'desc', title: '描述', render: (p) => html`<span className="muted ellipsis integ-desc-cell" title=${p.description || ''}>${p.description || '-'}</span>` },
        { key: 'wf', title: '工作流', width: 76, align: 'right', render: (p) => state.workflows.filter((w) => w.projectId === p.id).length },
        { key: 'role', title: '我的权限', width: 90, render: (p) => (roleOf(p) ? roleLabel(roleOf(p)) : html`<span className="muted">-</span>`) },
        { key: 'owner', title: '所有者', width: 110, render: (p) => html`<span className="row-4"><${Avatar} name=${personName(p.owner)} size=${20} />${personName(p.owner)}</span>` },
        { key: 'time', title: '最后更新时间', width: 170, render: (p) => fmt.dateTime(lastUpdate(p)) },
        { key: 'op', title: '操作', width: 110, render: (p) => {
          const role = roleOf(p);
          const canShare = canEditProject(state, p.id);
          return html`<span className="row-4" onClick=${(e) => e.stopPropagation()}>
            <${IntegDisabledTip} tip=${role ? '' : '你不是该项目的成员'}><${Button} size="xs" variant="link" disabled=${!role} onClick=${() => navigate(`/integration/${p.id}`)}>进入<//><//>
            <${IntegDisabledTip} tip=${!role ? '你不是该项目的成员' : canShare ? '' : '可查看权限不能分享项目'}><${Button} size="xs" variant="link" disabled=${!canShare} onClick=${() => setModal({ share: p.id })}>分享<//><//>
          </span>`;
        } },
      ]}
      data=${list}
      empty=${html`<${Empty} size="sm" icon=${ql ? 'SearchX' : 'FolderKanban'} title=${ql ? '没有匹配的项目' : '还没有项目'} />`}
    />
    <div className="pagination"><span className="pagination-total">共 ${list.length} 个项目</span></div>
    ${modal && modal.type === 'new' && html`<${ProjectModal} open=${true} onClose=${() => setModal(null)} />`}
    ${shareProject && html`<${ProjectShareModal} open=${true} onClose=${() => setModal(null)} project=${shareProject} />`}
  </div></div>`;
}

const CONFIG_TYPES = [
  { value: 'string', label: 'string', code: 'Aa' },
  { value: 'number', label: 'number', code: '123' },
  { value: 'boolean', label: 'boolean', code: 'T/F' },
  { value: 'array', label: 'array', code: '[/]' },
  { value: 'object', label: 'object', code: '{ }' },
  { value: 'connection', label: '连接', code: 'Conn' },
  { value: 'webhook', label: 'Webhook', code: 'URL' },
];

function IntegConfigCell({ v, col, colName, canEdit, conns, state }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const skipBlur = useRef(false);
  const raw = (v.values || {})[col];
  const empty = raw === undefined || raw === null || raw === '';
  const isGroup = col !== 'default';
  const code = ['object', 'array', 'webhook'].includes(v.type);
  const save = (value) => {
    if ((empty ? '' : String(raw)) === value) return;
    const values = (x) => (isGroup && value === '' ? Object.fromEntries(Object.entries(x.values || {}).filter(([k]) => k !== col)) : { ...x.values, [col]: value });
    patchList('variables', v.id, (x) => ({ values: values(x), updatedAt: Date.now(), updatedBy: Store.get().me }));
    addAudit('修改项目配置', `${v.key}${colName ? ` · ${colName}` : ''}`, v.projectId);
    toast.success('已保存');
  };
  const start = () => { skipBlur.current = false; setDraft(empty ? '' : String(raw)); setError(null); setEditing(true); };
  const commit = () => {
    const value = draft.trim();
    const err = integConfigError({ type: v.type, value, required: !isGroup, state, pid: v.projectId });
    if (err) return err;
    save(value);
    setEditing(false);
    return null;
  };
  const conn = v.type === 'connection' && !empty ? state.connections.find((c) => c.id === raw) : null;
  const connWarn = conn && (!connAvailableIn(conn, v.projectId) ? '该连接不在本项目的可用范围内' : !connectionPerm(state, conn) ? '该连接没有分享给你' : conn.status !== 'active' ? `连接${CONN_STATUS[conn.status].reason}` : '');
  const display = empty
    ? html`<span className="muted">${isGroup ? '使用默认值' : '未设置'}</span>`
    : v.type === 'connection'
      ? (conn
        ? html`<span className="row-4 integ-cfg-conn"><${ConnectorIcon} id=${conn.connector} size=${16} /><span className="ellipsis">${conn.name}</span>${connWarn && html`<${Tooltip} content=${connWarn}><${Icon} name="TriangleAlert" size=${13} className="integ-warn" /><//>`}</span>`
        : html`<${Tag} size="sm" tone="danger" icon="Link2Off">连接已删除<//>`)
      : v.type === 'boolean'
        ? html`<${Tag} size="sm" tone=${raw === 'true' ? 'success' : 'default'}>${String(raw)}<//>`
        : String(raw);
  const cellClass = cx('cfg-cell', empty && isGroup && 'is-inherit', code && 'mono');
  if (!canEdit) return html`<div className=${cx(cellClass, 'integ-cfg-static')} title=${empty || conn ? undefined : String(raw)}>${display}</div>`;
  if (v.type === 'boolean' || v.type === 'connection') {
    const options = v.type === 'boolean'
      ? [{ key: 'true', label: 'true' }, { key: 'false', label: 'false' }]
      : conns.map((c) => ({ key: c.id, label: c.name, desc: c.status !== 'active' ? CONN_STATUS[c.status].reason : '', iconNode: html`<${ConnectorIcon} id=${c.connector} size=${16} />` }));
    const items = [
      ...(isGroup ? [{ key: '__inherit', label: '使用默认值', active: empty, onClick: () => save('') }] : []),
      ...options.map((o) => ({ ...o, active: !empty && String(raw) === o.key, onClick: () => save(o.key) })),
      ...(options.length ? [] : [{ key: '__none', label: '没有可用的连接', desc: '只列出本项目可用、且分享给你的连接', disabled: true }]),
    ];
    return html`<${Dropdown} placement="bottom-start" width=${280} items=${items} trigger=${html`<button type="button" className=${cellClass} title="点击修改">${display}</button>`} />`;
  }
  if (editing) {
    return html`<div>
      <input
        className=${cx('cfg-cell-input', error && 'is-invalid', code && 'mono')}
        autoFocus
        value=${draft}
        aria-invalid=${Boolean(error)}
        onChange=${(e) => { setDraft(e.target.value); setError(null); }}
        onBlur=${() => {
          if (skipBlur.current) { skipBlur.current = false; return; }
          const err = commit();
          if (err) { setEditing(false); setError(null); toast.error(`未保存：${err}`); }
        }}
        onKeyDown=${(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            const err = commit();
            if (err) setError(err);
            else skipBlur.current = true;
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            skipBlur.current = true;
            setEditing(false);
            setError(null);
          }
        }}
      />
      ${error && html`<div className="cfg-cell-error">${error}</div>`}
    </div>`;
  }
  return html`<button type="button" className=${cellClass} onClick=${start} title=${empty ? '点击编辑' : `${String(raw)}（点击编辑）`}>${display}</button>`;
}

function IntegApprovalForm({ pid, group, owner }) {
  const state = useStore();
  const [draft, setDraft] = useState(null);
  const eligible = state.members.filter((m) => m.projectId === pid && ['owner', 'editor'].includes(m.role)).map((m) => m.userId);
  const owners = state.members.filter((m) => m.projectId === pid && m.role === 'owner').map((m) => m.userId);
  const saved = { require: Boolean(group.requireApproval), approvers: group.approvers || [] };
  const cur = draft || saved;
  const valid = cur.approvers.filter((u) => eligible.includes(u));
  const stale = cur.approvers.filter((u) => !eligible.includes(u));
  const dirty = Boolean(draft) && (cur.require !== saved.require || [...cur.approvers].sort().join() !== [...saved.approvers].sort().join());
  const error = cur.require && !valid.length ? '至少选择一位审批人' : null;
  const pending = (state.releases || []).filter((r) => r.projectId === pid && r.status === 'pending' && r.toEnv === group.key).length;
  const setRequire = (v) => setDraft({ ...cur, require: v, approvers: v && !cur.approvers.length ? owners : cur.approvers });
  const save = () => {
    if (!dirty || error) return;
    if (!isProjectOwner(Store.get(), pid)) { toast.error('只有项目所有者可以修改审批设置'); return; }
    Store.set((s) => ({ ...s, configGroups: s.configGroups.map((g) => (g.id === group.id ? { ...g, requireApproval: cur.require, approvers: cur.require ? valid : [] } : g)) }));
    addAudit('修改发布审批', cur.require ? `${group.name} · 需要审批：${valid.map((u) => personName(u)).join('、')}` : `${group.name} · 不需要审批`, pid);
    toast.success(cur.require ? '已保存，之后推广到生产环境需要审批' : '已关闭审批，之后推广会直接上线');
    setDraft(null);
  };
  return html`<div className="integ-approval">
    <label className="row integ-approval-switch">
      <${Switch} checked=${cur.require} disabled=${!owner} onChange=${setRequire} />
      <span className="grow">推广到${group.name}需要审批</span>
    </label>
    ${cur.require && html`<${Field} label="审批人" error=${owner && dirty ? error : null} hint=${owner ? '只能选择项目所有者和可编辑成员。有其他审批人时，申请人不能审批自己的申请' : ''}>
      ${owner
        ? html`<${Select} multiple searchable value=${cur.approvers} onChange=${(v) => setDraft({ ...cur, approvers: v })} placeholder="选择审批人" invalid=${Boolean(dirty && error)} options=${eligible.map((u) => ({ value: u, label: personName(u), desc: roleLabel(projectRole(state, pid, u)), iconNode: html`<${Avatar} name=${personName(u)} size=${18} />` }))} />`
        : html`<div className="row-4 integ-approver-list">${valid.length ? valid.map((u) => html`<${Tag} key=${u} size="sm">${personName(u)}<//>`) : html`<span className="muted text-xs">未设置，由项目所有者审批</span>`}</div>`}
    <//>`}
    ${!cur.require && html`<div className="text-xs muted">不需要审批时，申请人确认后立即上线，推广记录同样会保存。</div>`}
    ${stale.length > 0 && html`<div className="text-xs integ-warn-text">${stale.map((u) => personName(u)).join('、')} 已不是项目的可编辑成员，${owner ? '保存时会移出审批人' : '不会收到审批请求'}</div>`}
    ${!owner && html`<div className="text-xs muted">只有项目所有者可以修改审批设置。</div>`}
    ${dirty && html`<div className="row integ-approval-actions">
      ${pending > 0 && html`<span className="text-xs muted grow">已提交的 ${pending} 个申请仍按原来的审批人处理</span>`}
      <span className="spacer" />
      <${Button} size="sm" onClick=${() => setDraft(null)}>取消<//>
      <${Button} size="sm" variant="primary" disabled=${Boolean(error)} onClick=${save}>保存<//>
    </div>`}
  </div>`;
}

function IntegConnMap({ pid, group, canEdit, onEdit }) {
  const state = useStore();
  const entries = Object.entries(group.connectionMap || {});
  const connOf = (id) => state.connections.find((c) => c.id === id) || null;
  const remove = async (from) => {
    const a = connOf(from);
    const users = integConnUsers(Store.get(), pid, from);
    const ok = await confirmDialog({
      title: '删除这条连接替换？',
      content: `删除后${group.name}会直接使用「${a ? a.name : '已删除的连接'}」${users.length ? `，影响 ${users.length} 个工作流：${users.map((u) => u.wf.name).join('、')}` : ''}。`,
      danger: true,
      okText: '删除',
    });
    if (!ok) return;
    Store.set((s) => ({ ...s, configGroups: s.configGroups.map((g) => (g.id === group.id ? { ...g, connectionMap: Object.fromEntries(Object.entries(g.connectionMap || {}).filter(([k]) => k !== from)) } : g)) }));
    addAudit('删除连接替换', `${group.name} · ${a ? a.name : from}`, pid);
    toast.success('已删除连接替换');
  };
  return html`<div className="integ-connmap">
    ${entries.length === 0 && html`<div className="text-xs muted">没有连接替换，${group.name}直接使用节点里选择的连接，和生产环境相同。</div>`}
    ${entries.map(([from, to]) => {
      const a = connOf(from);
      const b = connOf(to);
      const users = integConnUsers(state, pid, from);
      const warn = !b ? '替换的连接已被删除' : !connAvailableIn(b, pid) ? '替换的连接不在本项目可用范围内' : b.status !== 'active' ? `连接${CONN_STATUS[b.status].reason}` : '';
      return html`<div key=${from} className="integ-connmap-row" data-map=${from}>
        <div className="row integ-connmap-line">
          <span className="integ-connmap-conn"><${ConnectorIcon} id=${a ? a.connector : null} size=${18} /><span className="ellipsis" title=${a ? a.name : ''}>${a ? a.name : '已删除的连接'}</span></span>
          <span className="spacer" />
          ${canEdit && html`<span className="row-4"><${IconButton} icon="PenLine" size="sm" title="修改连接替换" onClick=${() => onEdit(from)} /><${IconButton} icon="Trash2" size="sm" title="删除连接替换" onClick=${() => remove(from)} /></span>`}
        </div>
        <div className="row-4 integ-connmap-to">
          <${Icon} name="CornerDownRight" size=${14} className="muted" />
          <span className="text-xs muted nowrap">${group.name}改用</span>
          <span className="integ-connmap-conn"><${ConnectorIcon} id=${b ? b.connector : null} size=${18} /><span className="ellipsis" title=${b ? b.name : ''}>${b ? b.name : '已删除的连接'}</span></span>
          ${warn && html`<${Tooltip} content=${warn}><span className="row-4 text-xs integ-warn-text"><${Icon} name="TriangleAlert" size=${13} />${warn}</span><//>`}
        </div>
        <div className="text-xs muted integ-connmap-users">${users.length ? `影响 ${users.length} 个工作流：${users.map((u) => u.wf.name).join('、')}` : '当前没有工作流使用这个连接'}</div>
      </div>`;
    })}
    ${canEdit && html`<div><${Button} size="sm" variant="dashed" icon="Plus" onClick=${() => onEdit(null)}>添加连接替换<//></div>`}
  </div>`;
}

function IntegEnvCard({ env, group, pid, canEdit, owner, onEdit, onMap }) {
  const state = useStore();
  const wfs = state.workflows.filter((w) => w.projectId === pid);
  const deployed = wfs.filter((w) => deploymentOf(w, env.key));
  const running = deployed.filter((w) => deploymentOf(w, env.key).status === 'enabled').length;
  const isTest = env.key === 'test';
  const pending = (state.releases || []).filter((r) => r.projectId === pid && r.status === 'pending' && r.toEnv === env.key).length;
  const ahead = wfs.filter((w) => integTestAhead(w)).length;
  return html`<section className="card integ-env-card" data-env=${env.key}>
    <div className="integ-env-head">
      <span className=${cx('integ-env-icon', isTest ? 'is-test' : 'is-prod')}><${Icon} name=${isTest ? 'FlaskConical' : 'Rocket'} size=${18} /></span>
      <div className="grow">
        <div className="row-4"><span className="integ-env-name">${env.name}</span><span className="integ-env-key">${env.key}</span></div>
        <div className="text-xs muted">${group.description || '暂无描述'}</div>
      </div>
      ${canEdit && html`<${IconButton} icon="PenLine" size="sm" title=${`编辑${env.name}的描述`} onClick=${onEdit} />`}
    </div>
    <div className="integ-env-stats">
      <div><span className="integ-env-num">${deployed.length}</span><span className="text-xs muted">个工作流已部署</span></div>
      <div><span className="integ-env-num">${running}</span><span className="text-xs muted">个运行中</span></div>
      ${isTest
        ? html`<div><span className="integ-env-num">${ahead}</span><span className="text-xs muted">个比生产环境新</span></div>`
        : html`<${Link} to=${`/integration/${pid}/releases`} className="integ-env-stat-link"><span className="integ-env-num">${pending}</span><span className="text-xs muted">个推广待审批</span><//>`}
    </div>
    <div className="integ-env-sec">
      <div className="integ-env-sec-title">${isTest ? '发布规则' : '推广规则'}</div>
      ${isTest
        ? html`<div className="text-xs muted">在编辑器里发布后部署到这里，不需要审批。这里的运行记录会作为推广到生产环境时的验证依据。</div>`
        : html`<${IntegApprovalForm} pid=${pid} group=${group} owner=${owner} />`}
    </div>
    <div className="integ-env-sec">
      <div className="integ-env-sec-title">${isTest ? '连接替换' : '连接'}</div>
      ${isTest
        ? html`<${IntegConnMap} pid=${pid} group=${group} canEdit=${canEdit} onEdit=${onMap} />`
        : html`<div className="text-xs muted">直接使用工作流节点里选择的连接。节点里选的就是生产账号，测试环境需要换成测试账号时，在测试环境添加连接替换。</div>`}
    </div>
  </section>`;
}

function IntegConnMapModal({ open, onClose, pid, group, from: initial }) {
  const state = useStore();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setFrom(initial || null);
    setTo(initial ? (group.connectionMap || {})[initial] || null : null);
    setTouched(false);
  }, [open]);
  const map = group.connectionMap || {};
  const available = state.connections.filter((c) => connAvailableIn(c, pid));
  const targets = new Set(Object.values(map));
  const usedIds = new Set(state.workflows.filter((w) => w.projectId === pid).flatMap((w) => allNodes(w).flatMap(integNodeConns)));
  const candidates = available.filter((c) => (c.id === initial || !map[c.id]) && !targets.has(c.id));
  const option = (c) => {
    const n = integConnUsers(state, pid, c.id).length;
    return { value: c.id, label: c.name, desc: `${c.account || ''}${n ? ` · ${n} 个工作流在用` : ''}`, iconNode: html`<${ConnectorIcon} id=${c.connector} size=${16} />` };
  };
  const used = candidates.filter((c) => usedIds.has(c.id));
  const others = candidates.filter((c) => !usedIds.has(c.id));
  const fromOptions = [
    ...(used.length ? [{ group: '工作流在用的连接' }, ...used.map(option)] : []),
    ...(others.length ? [{ group: '其他本项目可用的连接' }, ...others.map(option)] : []),
  ];
  const src = from ? state.connections.find((c) => c.id === from) || null : null;
  const toCandidates = src ? available.filter((c) => c.connector === src.connector && c.id !== src.id && connectionPerm(state, c)) : [];
  const toOptions = toCandidates.map((c) => ({ value: c.id, label: c.name, desc: c.status !== 'active' ? `${CONN_STATUS[c.status].label} · ${CONN_STATUS[c.status].reason}` : c.account, iconNode: html`<${ConnectorIcon} id=${c.connector} size=${16} />` }));
  const dst = to && toCandidates.some((c) => c.id === to) ? state.connections.find((c) => c.id === to) : null;
  const users = from ? integConnUsers(state, pid, from) : [];
  const fromError = touched && !from ? '请选择生产环境使用的连接' : null;
  const toError = touched && src && !dst ? '请选择这个环境改用的连接' : null;
  const valid = Boolean(src && dst);
  const save = () => {
    setTouched(true);
    if (!valid) return;
    if (!canEditProject(Store.get(), pid)) { toast.error(INTEG_VIEWER_TIP); return; }
    if (initial && initial === from && map[from] === to) { onClose(); return; }
    Store.set((s) => ({
      ...s,
      configGroups: s.configGroups.map((g) => (g.id === group.id ? { ...g, connectionMap: { ...Object.fromEntries(Object.entries(g.connectionMap || {}).filter(([k]) => k !== initial)), [from]: to } } : g)),
    }));
    addAudit(initial ? '修改连接替换' : '新增连接替换', `${group.name} · ${src.name} → ${dst.name}`, pid);
    toast.success(`已保存：${group.name}改用「${dst.name}」`);
    onClose();
  };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    title=${initial ? '修改连接替换' : '添加连接替换'}
    description=${`${group.name}运行时，把节点里的生产连接换成下面的连接，节点本身不用改`}
    width=${560}
    footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${touched && !valid} onClick=${save}>保存<//><//>`}
  >
    <${Field} label="节点里的生产连接" required error=${fromError} hint=${initial ? '要换成别的生产连接时，删除这条替换再重新添加' : '只列出本项目可用、还没有设置替换的连接'}>
      <${Select} searchable value=${from} disabled=${Boolean(initial)} invalid=${Boolean(fromError)} onChange=${(v) => { setFrom(v); setTo(null); }} placeholder=${fromOptions.length ? '选择连接' : '没有可以替换的连接'} options=${fromOptions} />
    <//>
    <${Field} label=${`${group.name}改用`} required error=${toError} hint=${src && !toCandidates.length ? '' : '只能选择同一连接器、本项目可用并且分享给你的连接'}>
      <${Select} searchable value=${dst ? dst.id : null} disabled=${!src || !toCandidates.length} invalid=${Boolean(toError)} onChange=${setTo} placeholder=${!src ? '先选择生产连接' : toCandidates.length ? '选择连接' : '没有可用的连接'} options=${toOptions} />
    <//>
    ${src && !toCandidates.length && html`<div className="integ-gap"><${Alert} tone="warning" title=${`没有其他「${(resolveConnector(src.connector) || { name: '同一连接器' }).name}」连接`}>
      先在<${Link} to="/connections" className="link">「连接」<//>页面为测试账号新建一个连接，设为本项目可用并分享给你，再回来添加替换。
    <//></div>`}
    ${dst && dst.status !== 'active' && html`<div className="integ-gap"><${Alert} tone="warning">「${dst.name}」${CONN_STATUS[dst.status].reason}，${group.name}里用到它的节点会运行失败。<//></div>`}
    ${src && html`<div className="integ-connmap-affect">
      <div className="text-xs muted">${users.length ? `${group.name}里这 ${users.length} 个工作流会改用新连接：` : '当前没有工作流使用这个连接，之后用到它的节点会自动替换。'}</div>
      ${users.map((u) => html`<div key=${u.wf.id} className="row-4 integ-connmap-affect-row"><${WorkflowGlyph} wf=${u.wf} size=${16} /><span className="ellipsis">${u.wf.name}</span><span className="text-xs muted ellipsis">${u.nodes.join('、')}</span></div>`)}
    </div>`}
  <//>`;
}

function IntegEnvModal({ open, onClose, pid, group }) {
  const [desc, setDesc] = useState('');
  useEffect(() => { if (open) setDesc(group.description || ''); }, [open]);
  const save = () => {
    if (!canEditProject(Store.get(), pid)) { toast.error(INTEG_VIEWER_TIP); return; }
    if (desc.trim() !== (group.description || '')) {
      patchList('configGroups', group.id, { description: desc.trim() });
      addAudit('修改环境', group.name, pid);
      toast.success('已保存');
    }
    onClose();
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${`编辑${group.name}`} width=${460} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" onClick=${save}>保存<//><//>`}>
    <${Field} label="名称" hint="环境名称固定，推广和审批里都会用到"><${Input} value=${group.name} readOnly /><//>
    <${Field} label="描述"><${CharTextarea} value=${desc} onChange=${setDesc} max=${100} rows=${2} placeholder="说明这个环境连接的是哪些账号和系统" /><//>
  <//>`;
}

function IntegEnvEnableModal({ open, onClose, project }) {
  const state = useStore();
  const [approval, setApproval] = useState(true);
  useEffect(() => { if (open) setApproval(true); }, [open]);
  const pid = project.id;
  const owners = state.members.filter((m) => m.projectId === pid && m.role === 'owner').map((m) => m.userId);
  const published = state.workflows.filter((w) => w.projectId === pid && w.published).length;
  const enable = () => {
    const s = Store.get();
    if (!canEditProject(s, pid)) { toast.error(INTEG_VIEWER_TIP); return; }
    if (isStagedProject(s, pid)) { onClose(); return; }
    Store.set((st) => integEnableEnvsState(st, pid, approval));
    addAudit('开启测试与生产环境', `${project.name}${approval ? ` · 推广需要 ${owners.map((u) => personName(u)).join('、')} 审批` : ' · 推广不需要审批'}`, pid);
    toast.success('已开启测试与生产环境');
    onClose();
  };
  const items = [
    { icon: 'Layers', text: '新建「测试环境」和「生产环境」。项目配置的取值先从现在的值复制到两个环境，之后可以分别修改。' },
    { icon: 'Rocket', text: `已发布的 ${published} 个工作流继续在生产环境运行，版本不变；测试环境一开始是空的。` },
    { icon: 'CloudUpload', text: '之后在编辑器里发布，新版本只部署到测试环境；验证通过后再「推广到生产环境」。' },
    { icon: 'Replace', text: '测试环境可以用「连接替换」换成测试账号，例如金蝶测试账套，节点本身不用改。' },
  ];
  return html`<${Modal} open=${open} onClose=${onClose} title="开启测试与生产环境" description=${project.name} width=${560} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" onClick=${enable}>开启<//><//>`}>
    <ul className="integ-enable-list">
      ${items.map((it) => html`<li key=${it.icon}><span className="integ-enable-icon"><${Icon} name=${it.icon} size=${15} /></span><span>${it.text}</span></li>`)}
    </ul>
    <div className="integ-enable-approval">
      <${Checkbox} checked=${approval} onChange=${setApproval} label=${`推广到生产环境需要审批（审批人：${owners.map((u) => personName(u)).join('、') || '项目所有者'}）`} />
      <div className="text-xs muted">开启后只有项目所有者可以修改审批设置。项目可以随时关闭测试与生产环境。</div>
    </div>
  <//>`;
}

function ProjectConfigPage({ pid }) {
  const state = useStore();
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState('');
  const project = state.projects.find((p) => p.id === pid);
  const canEdit = canEditProject(state, pid);
  const owner = isProjectOwner(state, pid);
  const viewerTip = canEdit ? '' : INTEG_VIEWER_TIP;
  const envs = projectEnvs(state, pid);
  const staged = envs.length > 1;
  const groupOf = (env) => state.configGroups.find((g) => g.id === env.id) || null;
  const vars = state.variables.filter((v) => v.projectId === pid);
  const conns = state.connections.filter((c) => connAvailableIn(c, pid) && connectionPerm(state, c));
  const envCols = staged ? envs.map((e) => ({ id: e.id, name: e.name, description: (groupOf(e) || {}).description || '' })) : [];
  const cols = [{ id: 'default', name: staged ? '默认值' : '取值', description: staged ? '环境没有单独设置取值时，使用默认值' : '工作流运行时读取这里的值' }, ...envCols];
  const ql = q.trim().toLowerCase();
  const shown = vars.filter((v) => !ql || `${v.key}${v.description || ''}`.toLowerCase().includes(ql));
  const prodEnv = envs.find((e) => e.key === 'prod');
  const pendingCount = (state.releases || []).filter((r) => r.projectId === pid && r.status === 'pending').length;
  const offBlock = !canEdit ? INTEG_VIEWER_TIP : pendingCount ? `有 ${pendingCount} 个推广申请待审批，处理完才能关闭` : prodEnv && prodEnv.requireApproval && !owner ? '生产环境要求审批，只有项目所有者可以关闭' : null;
  const removeVar = async (v) => {
    const used = integConfigRefs(state, pid, v.key).length;
    const ok = await confirmDialog({ title: `删除配置「${v.key}」？`, content: used ? `${used} 个工作流引用了这个配置，删除后会在校验中提示。` : '删除后无法恢复。', danger: true, okText: '删除' });
    if (!ok) return;
    removeFromList('variables', v.id);
    addAudit('删除项目配置', v.key, pid);
    toast.success('已删除');
  };
  const disableEnvs = async () => {
    if (offBlock) return;
    const testCount = state.workflows.filter((w) => w.projectId === pid && w.test).length;
    const ok = await confirmDialog({
      title: '关闭测试与生产环境？',
      content: `关闭后项目只保留生产环境：${testCount ? `${testCount} 个工作流在测试环境的部署会被移除，` : ''}测试环境的配置值和连接替换会被删除，生产环境的配置值保留为项目配置的取值，正在运行的生产版本不受影响。之后发布会直接上线${prodEnv && prodEnv.requireApproval ? '，不再需要审批' : ''}，推广记录会保留。`,
      danger: true,
      okText: '关闭环境',
    });
    if (!ok) return;
    const s = Store.get();
    if ((s.releases || []).some((r) => r.projectId === pid && r.status === 'pending')) { toast.error('有推广申请待审批，暂时不能关闭'); return; }
    Store.set((st) => integDisableEnvsState(st, pid));
    addAudit('关闭测试与生产环境', project ? project.name : pid, pid);
    toast.success('已关闭测试与生产环境，项目只保留生产环境');
  };
  const newConfig = html`<${IntegDisabledTip} tip=${viewerTip}><${Button} variant="primary" icon="Plus" disabled=${!canEdit} onClick=${() => setModal({ type: 'edit' })}>新建配置<//><//>`;
  const modalGroup = modal && modal.groupId ? state.configGroups.find((g) => g.id === modal.groupId) || null : null;
  const offButton = html`<${Button} size="sm" variant="ghost" icon="Layers" disabled=${Boolean(offBlock)} onClick=${disableEnvs}>关闭测试与生产环境<//>`;
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="环境与配置"
      description=${staged ? '测试环境和生产环境各有一套配置值和连接替换。工作流发布后先部署到测试环境，验证后推广到生产环境。' : '这个项目只有生产环境，发布后立即生效。项目配置保存工作流共用的值，在入参中输入 $ 即可引用。'}
      actions=${html`<${Button} variant="ghost" icon="BookOpen" onClick=${() => helpBus.open('config')}>了解项目配置<//>`}
    />
    ${!canEdit && html`<div className="integ-gap"><${Alert} tone="info">${INTEG_VIEWER_TIP}，不能修改环境和项目配置。<//></div>`}
    ${staged
      ? html`<${Fragment}>
        <div className="section-head integ-env-section-head">
          <div><div className="section-title">环境</div><div className="text-xs muted">发布先到测试环境，验证后推广到生产环境；两个环境分别读取自己的配置值</div></div>
          ${offBlock ? html`<${Tooltip} content=${offBlock}>${offButton}<//>` : offButton}
        </div>
        <div className="integ-env-grid">
          ${envs.map((e) => {
            const g = groupOf(e);
            return g && html`<${IntegEnvCard} key=${e.id} env=${e} group=${g} pid=${pid} canEdit=${canEdit} owner=${owner} onEdit=${() => setModal({ type: 'env', groupId: g.id })} onMap=${(from) => setModal({ type: 'map', groupId: g.id, from })} />`;
          })}
        </div>
      <//>`
      : html`<div className="integ-env-single">
        <span className="integ-env-icon"><${Icon} name="Layers" size=${18} /></span>
        <div className="grow">
          <div className="integ-env-name">只有生产环境</div>
          <div className="text-xs muted">发布后直接在生产环境运行。需要先在测试环境验证、用测试账号联调，或者上线前由负责人审批时，开启测试与生产环境。</div>
        </div>
        <${IntegDisabledTip} tip=${viewerTip}><${Button} icon="Layers" disabled=${!canEdit} onClick=${() => setModal({ type: 'enable' })}>开启测试与生产环境<//><//>
      </div>`}
    <div className="section-head integ-cfg-head">
      <div><div className="section-title">项目配置</div><div className="text-xs muted">${staged ? '每个配置项可以在两个环境取不同的值，环境留空时使用默认值' : '在入参中输入 $ 即可引用，例如 {{config.配置项}}'}</div></div>
      ${vars.length > 0 && newConfig}
    </div>
    ${vars.length === 0
      ? html`<${Empty} icon="SlidersHorizontal" title="暂无项目配置" description="把账套 ID、群 ID、阈值这类会随环境变化的值放进项目配置，工作流里统一引用。" action=${canEdit && newConfig} />`
      : html`<${Fragment}>
        <div className="toolbar">
          <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索配置项或描述" />
          <span className="spacer" />
          <span className="text-xs muted">${canEdit ? '点击单元格即可修改' : '只能查看'}</span>
        </div>
        <div className="table-wrap">
          <table className="table cfg-table integ-cfg-table" style=${{ minWidth: 300 + cols.length * 170 }}>
            <thead><tr>
              <th style=${{ width: 240 }}>配置项</th>
              ${cols.map((c) => html`<th key=${c.id}><span className="th-inner">
                ${c.name}
                ${c.description && html`<${Tooltip} content=${c.description}><${Icon} name="CircleHelp" size=${12} /><//>`}
              </span></th>`)}
              <th style=${{ width: 60 }}>操作</th>
            </tr></thead>
            <tbody>
              ${shown.map((v) => html`<tr key=${v.id}>
                <td>
                  <div className="row"><span className="otree-type">${(CONFIG_TYPES.find((t) => t.value === v.type) || CONFIG_TYPES[0]).code}</span><span className="mono integ-cfg-key">${v.key}</span></div>
                  <div className="text-xs muted integ-cfg-desc">${v.description || '暂无描述'}</div>
                </td>
                ${cols.map((c) => html`<td key=${c.id} className="cfg-td"><${IntegConfigCell} v=${v} col=${c.id} colName=${staged ? c.name : ''} canEdit=${canEdit} conns=${conns} state=${state} /></td>`)}
                <td><${MoreMenu} items=${[
                  ...(canEdit ? [{ key: 'edit', label: '编辑', icon: 'PenLine', onClick: () => setModal({ type: 'edit', v }) }] : []),
                  { key: 'copy', label: '复制引用', icon: 'Copy', onClick: () => { if (copyText(`{{config.${v.key}}}`)) toast.success('已复制引用'); else toast.error('复制失败，请手动复制'); } },
                  ...(canEdit ? [{ divider: true }, { key: 'delete', label: '删除', icon: 'Trash2', danger: true, onClick: () => removeVar(v) }] : []),
                ]} /></td>
              </tr>`)}
              ${shown.length === 0 && html`<tr className="integ-cfg-empty"><td colSpan=${cols.length + 2}>
                <${Empty} size="sm" icon="SearchX" title="没有匹配的配置项" />
              </td></tr>`}
            </tbody>
          </table>
        </div>
      <//>`}
    ${modal && modal.type === 'edit' && html`<${ConfigItemModal} open=${true} onClose=${() => setModal(null)} pid=${pid} item=${modal.v} envs=${envCols} />`}
    ${modal && modal.type === 'env' && modalGroup && html`<${IntegEnvModal} open=${true} onClose=${() => setModal(null)} pid=${pid} group=${modalGroup} />`}
    ${modal && modal.type === 'map' && modalGroup && html`<${IntegConnMapModal} open=${true} onClose=${() => setModal(null)} pid=${pid} group=${modalGroup} from=${modal.from} />`}
    ${modal && modal.type === 'enable' && project && html`<${IntegEnvEnableModal} open=${true} onClose=${() => setModal(null)} project=${project} />`}
  </div></div>`;
}

function ConfigItemModal({ open, onClose, pid, item, envs }) {
  const state = useStore();
  const [key, setKey] = useState('');
  const [type, setType] = useState('string');
  const [desc, setDesc] = useState('');
  const [values, setValues] = useState({});
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    setKey(item ? item.key : '');
    setType(item ? item.type : 'string');
    setDesc(item ? item.description || '' : '');
    setValues(item ? { ...item.values } : {});
    setTouched({});
  }, [open]);
  const conns = state.connections.filter((c) => connAvailableIn(c, pid) && connectionPerm(state, c));
  const staged = envs.length > 0;
  const cols = [{ id: 'default', name: staged ? '默认值' : '取值' }, ...envs];
  const k = key.trim();
  const keyError = !k ? (touched.key ? '请输入配置项名称' : null) : !/^[a-z][a-z0-9_]*$/.test(k) ? '需以小写字母开头，只含小写字母、数字、下划线' : state.variables.some((x) => x.projectId === pid && x.key === k && (!item || x.id !== item.id)) ? '项目内已有同名配置项' : null;
  const errors = Object.fromEntries(cols.map((g) => [g.id, integConfigError({ type, value: values[g.id], required: g.id === 'default', state, pid })]));
  const valid = Boolean(k) && !keyError && !Object.values(errors).some(Boolean);
  const renamedRefs = item && k && k !== item.key ? integConfigRefs(state, pid, item.key).length : 0;
  const shownError = (id) => (touched[id] || !isBlank(values[id]) ? errors[id] : null);
  const setValue = (id, val) => { setValues((vs) => ({ ...vs, [id]: val == null ? '' : val })); setTouched((t) => ({ ...t, [id]: true })); };
  const changeType = (t) => { setType(t); setValues(item && t === item.type ? { ...item.values } : {}); setTouched({ key: touched.key }); };
  const save = () => {
    if (!valid) return;
    const clean = Object.fromEntries(cols.map((g) => [g.id, String(values[g.id] ?? '').trim()]).filter(([id, val]) => id === 'default' || val !== ''));
    if (item) {
      const same = item.key === k && item.type === type && (item.description || '') === desc.trim() && cols.every((g) => String((item.values || {})[g.id] ?? '') === String(clean[g.id] ?? ''));
      if (!same) {
        patchList('variables', item.id, { key: k, type, description: desc.trim(), values: clean, updatedAt: Date.now(), updatedBy: state.me });
        addAudit('修改项目配置', k, pid);
        toast.success('已保存');
      }
      onClose();
      return;
    }
    prependToList('variables', { id: uid('v'), projectId: pid, key: k, type, description: desc.trim(), values: clean, updatedAt: Date.now(), updatedBy: state.me });
    addAudit('新建项目配置', k, pid);
    toast.success('已新建配置');
    onClose();
  };
  const valueInput = (id) => {
    const isEnv = id !== 'default';
    const bad = Boolean(shownError(id));
    const val = values[id];
    if (type === 'connection') {
      return html`<${Select} searchable clearable=${isEnv} invalid=${bad} value=${val || null} onChange=${(v) => setValue(id, v)} placeholder=${isEnv ? '使用默认值' : conns.length ? '选择连接' : '没有可用的连接'} options=${conns.map((c) => ({ value: c.id, label: c.name, desc: c.status !== 'active' ? CONN_STATUS[c.status].reason : c.account, iconNode: html`<${ConnectorIcon} id=${c.connector} size=${16} />` }))} />`;
    }
    if (type === 'boolean') {
      return html`<${Select} clearable=${isEnv} invalid=${bad} value=${val || null} onChange=${(v) => setValue(id, v)} placeholder=${isEnv ? '使用默认值' : '请选择'} options=${[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]} />`;
    }
    if (type === 'object' || type === 'array') {
      return html`<${Textarea} mono rows=${3} invalid=${bad} value=${val} onChange=${(v) => setValue(id, v)} placeholder=${isEnv ? '留空时使用默认值' : type === 'array' ? '例：["a", "b"]' : '例：{ "key": "value" }'} />`;
    }
    return html`<${Input} mono=${type !== 'string'} invalid=${bad} value=${val} onChange=${(v) => setValue(id, v)} placeholder=${isEnv ? '留空时使用默认值' : type === 'number' ? '例：5000' : type === 'webhook' ? 'https://' : '请输入'} />`;
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${item ? '编辑配置' : '新建配置'} width=${600} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>保存<//><//>`}>
    <div className="form-grid">
      <${Field} label="配置项名称" required error=${keyError} hint="小写字母开头，只含小写字母、数字、下划线"><${Input} mono value=${key} onChange=${(v) => { setKey(v.slice(0, 64)); setTouched((t) => ({ ...t, key: true })); }} placeholder="例：hr_group_chat_id" autoFocus invalid=${Boolean(keyError)} /><//>
      <${Field} label="类型" required><${Select} value=${type} onChange=${changeType} options=${CONFIG_TYPES.map((t) => ({ value: t.value, label: t.label }))} /><//>
    </div>
    ${renamedRefs > 0 && html`<div className="integ-gap"><${Alert} tone="warning">${renamedRefs} 个工作流引用了「${item.key}」，改名后这些引用会失效，需要在工作流里重新选择。<//></div>`}
    <${Field} label="描述"><${CharInput} value=${desc} onChange=${setDesc} max=${100} placeholder="说明这个配置的用途" /><//>
    <div className="section-title integ-values-title">取值</div>
    ${cols.map((g) => html`<${Field} key=${g.id} label=${g.name} layout="horizontal" required=${g.id === 'default'} error=${shownError(g.id)} hint=${g.id === 'default' ? (staged ? '环境没有单独设置取值时使用默认值' : '工作流运行时读取这个值') : ''}>${valueInput(g.id)}<//>`)}
    ${type === 'connection' && html`<div className="text-xs muted">只列出本项目可用、且分享给你的连接</div>`}
  <//>`;
}

function DataStoragePage({ pid }) {
  const state = useStore();
  const route = useRoute();
  const [sel, setSel] = useState(route.query.id || null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const canEdit = canEditProject(state, pid);
  const viewerTip = canEdit ? '' : INTEG_VIEWER_TIP;
  const stores = state.storages.filter((s) => s.projectId === pid);
  const cur = stores.find((s) => s.id === sel) || stores[0] || null;
  useEffect(() => {
    const id = route.query.id;
    if (id && Store.get().storages.some((s) => s.id === id && s.projectId === pid)) { setSel(id); recordRecent('storage', id); }
  }, [route.query.id]);
  const pick = (id) => { setSel(id); setQ(''); recordRecent('storage', id); };
  const ql = q.trim().toLowerCase();
  const records = cur ? cur.records.filter((r) => !ql || r.key.toLowerCase().includes(ql)) : [];
  const clearAll = async () => {
    const ok = await confirmDialog({ title: '清空全部数据？', content: `「${cur.name}」中的 ${cur.records.length} 条数据会被删除，无法恢复。`, danger: true, okText: '清空' });
    if (!ok) return;
    patchList('storages', cur.id, { records: [] });
    addAudit('清空数据存储', cur.name, pid);
    toast.success('已清空');
  };
  const removeStore = async () => {
    const ok = await confirmDialog({ title: `删除数据存储「${cur.name}」？`, content: '存储里的数据会一并删除，引用它的工作流运行时会报错。', danger: true, okText: '删除', confirmText: cur.name });
    if (!ok) return;
    const id = cur.id;
    Store.set((s) => ({ ...s, storages: s.storages.filter((x) => x.id !== id), recent: (s.recent || []).filter((r) => !(r.type === 'storage' && r.id === id)) }));
    addAudit('删除数据存储', cur.name, pid);
    setSel(null);
    toast.success('已删除');
  };
  const removeRecord = async (r) => {
    const ok = await confirmDialog({ title: `删除键「${r.key}」？`, content: '删除后无法恢复，工作流下次读取这个键时会得到空值。', danger: true, okText: '删除' });
    if (!ok) return;
    patchList('storages', cur.id, (s) => ({ records: s.records.filter((x) => x.key !== r.key) }));
    toast.success('已删除');
  };
  const expiry = (r) => {
    const left = r.expiresAt - Date.now();
    if (left <= 0) return html`<span className="integ-bad">已过期</span>`;
    return html`<span className=${left < 2 * DAY ? 'integ-soon' : 'muted'}>${fmt.relative(r.expiresAt)}</span>`;
  };
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="数据存储" description="项目级的键值数据集合，工作流通过「数据存储」助手读写，每条数据到期后自动清理" actions=${html`<${IntegDisabledTip} tip=${viewerTip}><${Button} variant="primary" icon="Plus" disabled=${!canEdit} onClick=${() => setModal({ type: 'store' })}>新建数据存储<//><//>`} />
    ${!canEdit && html`<div className="integ-gap"><${Alert} tone="info">${INTEG_VIEWER_TIP}，不能新建或修改数据。<//></div>`}
    ${stores.length === 0
      ? html`<${Empty} icon="Database" title="暂无数据存储" description="数据存储适合做去重、保存同步游标、缓存会话上下文。" action=${canEdit && html`<${Button} variant="primary" icon="Plus" onClick=${() => setModal({ type: 'store' })}>新建数据存储<//>`} />`
      : html`<div className="storage-layout">
        <div className="storage-list">
          ${stores.map((s) => html`<button key=${s.id} type="button" className=${cx('storage-item', cur && cur.id === s.id && 'is-active')} onClick=${() => pick(s.id)}>
            <${Icon} name="Database" size=${16} />
            <span className="grow"><span className="storage-name">${s.name}</span><span className="text-xs muted">${s.records.length} 条 · 有效期 ${s.ttlDays} 天</span></span>
          </button>`)}
        </div>
        ${cur && html`<div className="storage-main">
          <div className="row integ-storage-head">
            <div className="grow">
              <div className="section-title">${cur.name}</div>
              <div className="text-xs muted">${cur.description || '暂无描述'} · 有效期 ${cur.ttlDays} 天 · 创建人 ${personName(cur.owner)}</div>
            </div>
            ${canEdit && html`<${MoreMenu} size="md" items=${[
              { key: 'edit', label: '编辑', icon: 'PenLine', onClick: () => setModal({ type: 'store', store: cur }) },
              { key: 'clear', label: '清空数据', icon: 'Eraser', disabled: !cur.records.length, desc: cur.records.length ? '' : '没有数据', onClick: clearAll },
              { divider: true },
              { key: 'delete', label: '删除', icon: 'Trash2', danger: true, onClick: removeStore },
            ]} />`}
          </div>
          <div className="toolbar">
            <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索键" />
            <span className="spacer" />
            <${IntegDisabledTip} tip=${viewerTip}><${Button} icon="Plus" disabled=${!canEdit} onClick=${() => setModal({ type: 'record' })}>新建数据<//><//>
          </div>
          <${Table}
            dense
            rowKey="key"
            className="integ-records"
            columns=${[
              { key: 'key', title: '键', width: 160, render: (r) => html`<span className="mono ellipsis integ-key-cell" title=${r.key}>${r.key}</span>` },
              { key: 'value', title: '值', render: (r) => html`<span className="mono ellipsis integ-value-cell" title=${r.value}>${r.value}</span>` },
              { key: 'u', title: '更新时间', width: 116, render: (r) => html`<span className="nowrap" title=${fmt.dateTime(r.updatedAt)}>${fmt.short(r.updatedAt)}</span>` },
              { key: 'e', title: '过期时间', width: 96, render: expiry },
              { key: 'op', title: '操作', width: 60, render: (r) => html`<${MoreMenu} items=${[
                ...(canEdit ? [{ key: 'edit', label: '编辑', icon: 'PenLine', onClick: () => setModal({ type: 'record', record: r }) }] : []),
                { key: 'copy', label: '复制值', icon: 'Copy', onClick: () => { if (copyText(r.value)) toast.success('已复制'); else toast.error('复制失败，请手动复制'); } },
                ...(canEdit ? [{ divider: true }, { key: 'delete', label: '删除', icon: 'Trash2', danger: true, onClick: () => removeRecord(r) }] : []),
              ]} />` },
            ]}
            data=${records}
            empty=${html`<${Empty} size="sm" icon=${ql ? 'SearchX' : 'Database'} title=${ql ? '没有匹配的键' : '暂无数据'} description=${ql ? '' : '工作流运行时写入的数据会出现在这里。'} />`}
          />
        </div>`}
      </div>`}
    ${modal && modal.type === 'store' && html`<${StorageModal} open=${true} onClose=${() => setModal(null)} pid=${pid} store=${modal.store} onCreated=${pick} />`}
    ${modal && modal.type === 'record' && cur && html`<${RecordModal} open=${true} onClose=${() => setModal(null)} store=${cur} record=${modal.record} />`}
  </div></div>`;
}

function StorageModal({ open, onClose, pid, store, onCreated }) {
  const state = useStore();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [ttl, setTtl] = useState('30');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (open) { setName(store ? store.name : ''); setDesc(store ? store.description || '' : ''); setTtl(String(store ? store.ttlDays : 30)); setDirty(false); } }, [open]);
  const trimmed = name.trim();
  const dup = state.storages.some((s) => s.projectId === pid && s.name === trimmed && (!store || s.id !== store.id));
  const nameError = dup ? '项目内已有同名数据存储' : dirty && !trimmed ? '请输入名称' : null;
  const t = String(ttl).trim();
  const days = Number(t);
  const ttlError = !t ? '请输入有效期' : !/^\d+$/.test(t) || days < 1 || days > 365 ? '有效期需为 1 到 365 之间的整数' : null;
  const valid = trimmed && !dup && !ttlError;
  const save = () => {
    if (!valid) return;
    const patch = { name: trimmed, description: desc.trim(), ttlDays: days };
    if (store) {
      if (trimmed !== store.name || patch.description !== (store.description || '') || days !== store.ttlDays) {
        patchList('storages', store.id, patch);
        addAudit('修改数据存储', trimmed, pid);
        toast.success('已保存');
      }
      onClose();
      return;
    }
    const s = { id: uid('ds'), projectId: pid, ...patch, createdAt: Date.now(), owner: state.me, records: [] };
    Store.set((st) => ({ ...st, storages: [...st.storages, s] }));
    addAudit('新建数据存储', trimmed, pid);
    onCreated(s.id);
    toast.success('已新建数据存储');
    onClose();
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${store ? '编辑数据存储' : '新建数据存储'} width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>确定<//><//>`}>
    <${Field} label="名称" required error=${nameError}><${CharInput} value=${name} onChange=${(v) => { setName(v); setDirty(true); }} max=${50} autoFocus invalid=${Boolean(nameError)} placeholder="例：入职开通去重" /><//>
    <${Field} label="描述"><${CharTextarea} value=${desc} onChange=${setDesc} max=${200} rows=${2} placeholder="说明存储里放的是什么数据" /><//>
    <${Field} label="数据有效期" required error=${ttlError} hint=${store ? '修改只影响之后写入的数据；每条数据写入后超过有效期自动清理，最长 365 天' : '每条数据写入后超过有效期自动清理，最长 365 天'}>
      <div className="row"><${Input} type="number" value=${ttl} onChange=${setTtl} invalid=${Boolean(ttlError)} style=${{ width: 120 }} /><span className="muted">天</span></div>
    <//>
  <//>`;
}

function RecordModal({ open, onClose, store, record }) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (open) { setKey(record ? record.key : ''); setValue(record ? record.value : ''); setDirty(false); } }, [open]);
  if (!store) return null;
  const k = key.trim();
  const dup = !record && store.records.some((r) => r.key === k);
  const keyError = dup ? '这个键已存在，请在列表中编辑这条数据' : dirty && !k ? '请输入键' : null;
  const valid = Boolean(k) && !dup;
  const save = () => {
    if (!valid) return;
    if (record && value === record.value) { onClose(); return; }
    const now = Date.now();
    const rec = { key: k, value, updatedAt: now, expiresAt: now + store.ttlDays * DAY };
    patchList('storages', store.id, (s) => ({ records: [rec, ...s.records.filter((r) => r.key !== k)] }));
    toast.success(record ? '已保存' : '已新建数据');
    onClose();
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${record ? '编辑数据' : '新建数据'} width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>保存<//><//>`}>
    <${Field} label="键" required error=${keyError} hint=${record ? '键创建后不能修改' : '同一个数据存储里键不能重复'}><${Input} mono value=${key} onChange=${(v) => { setKey(v.slice(0, 128)); setDirty(true); }} readOnly=${Boolean(record)} autoFocus=${!record} invalid=${Boolean(keyError)} placeholder="例：XH20260918" /><//>
    <${Field} label="值" hint=${`保存后 ${store.ttlDays} 天过期`}><${CharTextarea} mono value=${value} onChange=${setValue} max=${10000} rows=${6} placeholder="文本或 JSON" /><//>
  <//>`;
}
