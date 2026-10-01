const CLIPBOARD_KEY = 'fema-design-clipboard';

function parsePayload(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : { value: v };
  } catch (e) {
    return {};
  }
}

function makeDebugRun(wf, state, { payloadText, groupId }) {
  const envs = projectEnvs(state, wf.projectId);
  const env = envs.find((e) => e.id === groupId) || envs.find((e) => e.key === 'test') || envs[0];
  const inError = new Set();
  walkNodes(wf.steps, (n) => { if (n.errorSteps) walkNodes(n.errorSteps, (x) => inError.add(x.id)); });
  const connOf = (node) => {
    const id = ['ai', 'agent'].includes(node.kind) ? node.config.connectionId : node.connectionId;
    return id ? envConnectionId(state, wf.projectId, env.key, id) : null;
  };
  const vars = Object.fromEntries(state.variables.filter((v) => v.projectId === wf.projectId).map((v) => [v.key, (v.values || {})[env.id || 'default'] ?? (v.values || {}).default]));
  const payload = parsePayload(payloadText);
  const decide = branchDecider(wf, { payload, vars });
  const branchPicks = {};
  const path = flattenPath(wf.steps, () => 0, null, (node) => {
    const pick = decide(node);
    if (pick) branchPicks[node.id] = pick.id;
    return pick;
  });
  const onPath = new Set([wf.trigger.id, ...path.map((p) => p.node.id)]);
  const bad = allNodes(wf).find((node) => {
    const conn = connOf(node) && state.connections.find((c) => c.id === connOf(node));
    return onPath.has(node.id) && !inError.has(node.id) && conn && conn.status !== 'active';
  });
  const conn = bad && state.connections.find((c) => c.id === connOf(bad));
  const dataBad = bad ? null : debugDataProblem({ wf, state, payload, path });
  const failedNode = bad || (dataBad && dataBad.node);
  const run = {
    id: uid('dbg'), workflowId: wf.id, projectId: wf.projectId, status: failedNode ? 'failed' : 'success', startedAt: Date.now(),
    triggerType: '调试', version: wf.version, kind: 'debug', errors: failedNode ? 1 : 0, by: state.me,
    payload, vars, branchPicks, env: env.key, group: env.implicit ? '默认值' : env.name,
    graph: { trigger: wf.trigger, steps: wf.steps },
    failedNodeId: failedNode ? failedNode.id : null,
    failure: bad ? { code: 'CONNECTION_AUTH_FAILED', message: conn.error || '连接不可用，请重新授权', http_status: 401, attempts: 1, connectionId: conn.id }
      : dataBad ? { code: 'MAPPING_ERROR', message: dataBad.message, http_status: null, attempts: 1 } : null,
  };
  const trace = buildRunTrace(run, wf);
  return { run: { ...run, duration: trace.reduce((a, t) => a + (t.duration || 0), 0) }, trace };
}

function WorkflowPage({ pid, wid, snapshot, mode, action, node: focusParam, tab: tabParam }) {
  const state = useStore();
  const stored = state.workflows.find((w) => w.id === wid);
  const snapshotVersion = stored && snapshot ? state.versions.find((v) => v.workflowId === stored.id && String(v.version) === String(snapshot)) : null;
  const wf = stored && snapshotVersion && snapshotVersion.snapshot ? { ...stored, ...snapshotVersion.snapshot } : stored;
  const role = stored ? projectRole(state, stored.projectId) : null;
  const canEdit = role === 'owner' || role === 'editor';
  const lock = stored ? (state.editLocks || {})[stored.id] : null;
  const lockedBy = lock && lock.userId !== state.me && Date.now() - lock.since < 2 * HOUR ? lock : null;
  const wantEdit = mode === 'edit' && !snapshot && canEdit;
  const editing = wantEdit && !lockedBy;
  const [selectedId, setSelectedId] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [requestTab, setRequestTab] = useState(null);
  const [insert, setInsert] = useState(null);
  const [side, setSide] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState({ id: null, tick: 0 });
  const [highlightId, setHighlightId] = useState(null);
  const [collapsed, setCollapsed] = useState([]);
  const [debug, setDebug] = useState({ open: false, currentId: null, width: 640 });
  const [live, setLive] = useState(null);
  const [debugModal, setDebugModal] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [linking, setLinking] = useState(null);
  const [linkPick, setLinkPick] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [previewIds, setPreviewIds] = useState(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const canvasApi = useRef(null);
  const saveTimer = useRef(null);
  const highlightTimer = useRef(null);
  const debugTimers = useRef([]);
  const lastCommit = useRef({ key: null, at: 0 });

  const clearDebugTimers = () => { debugTimers.current.forEach(clearTimeout); debugTimers.current = []; };

  useEffect(() => {
    setSelectedId(null); setInsert(null); setSide(null); setHistory({ past: [], future: [] }); setCollapsed([]); setCtxMenu(null); setLinkPick(null);
    clearDebugTimers();
    setLive(null);
    setDebug((d) => ({ ...d, open: false, currentId: null }));
    if (stored) recordRecent('workflow', stored.id);
  }, [wid]);

  useEffect(() => {
    if (editing) return;
    setSide(null); setInsert(null); setCtxMenu(null);
    if (!live) setDebug((d) => ({ ...d, open: false }));
  }, [editing]);

  useEffect(() => () => { clearTimeout(saveTimer.current); clearTimeout(highlightTimer.current); clearDebugTimers(); }, []);

  useEffect(() => {
    if (!editing) return undefined;
    const id = wid;
    Store.set((s) => {
      const cur = (s.editLocks || {})[id];
      return cur && cur.userId === s.me ? s : { ...s, editLocks: { ...(s.editLocks || {}), [id]: { userId: s.me, since: Date.now() } } };
    });
    return () => Store.set((s) => {
      const cur = (s.editLocks || {})[id];
      return cur && cur.userId === s.me ? { ...s, editLocks: Object.fromEntries(Object.entries(s.editLocks).filter(([k]) => k !== id)) } : s;
    });
  }, [editing, wid]);

  useEffect(() => {
    if (!focusParam || !stored) return undefined;
    const t = setTimeout(() => {
      const target = findInWorkflow(Store.get().workflows.find((w) => w.id === wid) || stored, focusParam);
      if (target) focusNode(focusParam, { tab: tabParam });
      else toast.info('要定位的节点已不在当前工作流中');
    }, 120);
    return () => clearTimeout(t);
  }, [wid, focusParam, tabParam]);

  useEffect(() => {
    if (action === 'publish' && stored && canEdit) {
      navigate(`/integration/${pid}/wf/${wid}`, { replace: true });
      setTimeout(() => onPublishClick(), 0);
    }
  }, [action]);

  const issues = useMemo(() => (wf && !snapshot ? workflowIssues(wf, state) : []), [wf, snapshot, state.connections, state.variables, state.members]);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const issuesByNode = useMemo(() => issues.reduce((acc, i) => ({ ...acc, [i.node.id]: [...(acc[i.node.id] || []), i] }), {}), [issues]);
  const refs = useMemo(() => (wf ? nodeRefs(wf) : {}), [wf]);
  const debugRuns = useMemo(() => (stored ? state.runs.filter((r) => r.workflowId === stored.id && r.kind === 'debug') : []), [state.runs, stored && stored.id]);

  useEffect(() => {
    if (selectedId && wf && !findInWorkflow(wf, selectedId)) setSelectedId(null);
  }, [wf, selectedId]);

  const keyRef = useRef(null);
  useEffect(() => {
    const h = (e) => keyRef.current && keyRef.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  if (!stored) {
    keyRef.current = null;
    return html`<div className="wf"><${Empty} icon="FileQuestion" title="工作流不存在或已被删除" action=${html`<${Button} onClick=${() => navigate(`/integration/${pid}`)}>返回项目<//>`} /></div>`;
  }

  const projectWfs = state.workflows.filter((w) => w.projectId === stored.projectId);
  const records = [...(live ? [live.run] : []), ...debugRuns.filter((r) => !live || r.id !== live.run.id)];
  const currentRun = records.find((r) => r.id === debug.currentId) || null;
  const currentTrace = currentRun ? (live && live.run.id === currentRun.id ? live.trace : buildRunTrace(currentRun, wf)) : null;
  const runState = debug.open && currentTrace ? Object.fromEntries(currentTrace.map((t) => [t.node.id, t.status])) : null;
  const readOnlyText = snapshot ? `这是 v${snapshot} 的快照，只能查看` : !canEdit ? '你在此项目中是「可查看」权限，只能查看' : lockedBy ? `${personName(lockedBy.userId)} 正在编辑，你现在只能查看` : '';
  const drafts = !snapshot ? allNodes(stored).filter((n) => n.aiDraft) : [];
  const staged = isStagedProject(state, stored.projectId);
  const testDep = staged ? deploymentOf(stored, 'test') : null;
  const pendingRelease = (state.releases || []).find((r) => r.workflowId === stored.id && r.status === 'pending');
  const testAhead = Boolean(staged && testDep && testDep.version > (stored.published ? stored.version : 0));

  const takeOver = async () => {
    const who = personName(lockedBy.userId);
    const ok = await confirmDialog({ title: `接管「${stored.name}」的编辑？`, content: `${who} 正在编辑这个工作流。接管后对方变为只读，对方已经自动保存的修改会保留在草稿里。`, okText: '接管编辑' });
    if (!ok) return;
    Store.set((s) => ({ ...s, editLocks: { ...(s.editLocks || {}), [stored.id]: { userId: s.me, since: Date.now() } } }));
    addAudit('接管编辑', stored.name, stored.projectId);
    toast.success(`已接管编辑，并通知了${who}`);
  };

  const commit = (patchFn, { coalesce } = {}) => {
    if (!editing) return;
    const now = Date.now();
    const merge = coalesce && lastCommit.current.key === coalesce && now - lastCommit.current.at < 1000;
    lastCommit.current = { key: coalesce || null, at: now };
    if (!merge) setHistory((h) => ({ past: [...h.past.slice(-40), { trigger: stored.trigger, steps: stored.steps }], future: [] }));
    setSaving(true);
    Store.set((s) => ({
      ...s,
      workflows: s.workflows.map((w) => (w.id === stored.id ? withRefs({ ...w, ...patchFn(w), updatedAt: now, draftChanged: true }) : w)),
    }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaving(false), 700);
  };

  const restore = (graph) => {
    Store.set((s) => ({ ...s, workflows: s.workflows.map((w) => (w.id === stored.id ? { ...w, trigger: graph.trigger, steps: graph.steps, updatedAt: Date.now(), draftChanged: true } : w)) }));
    lastCommit.current = { key: null, at: 0 };
  };
  const undo = () => {
    if (!editing || !history.past.length) return;
    const prev = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [{ trigger: stored.trigger, steps: stored.steps }, ...h.future] }));
    restore(prev);
    toast.info('已撤销');
  };
  const redo = () => {
    if (!editing || !history.future.length) return;
    const next = history.future[0];
    setHistory((h) => ({ past: [...h.past, { trigger: stored.trigger, steps: stored.steps }], future: h.future.slice(1) }));
    restore(next);
    toast.info('已重做');
  };

  const updateNode = (id, patch) => {
    const coalesce = `${id}:${Object.keys(patch).join(',')}`;
    if (id === stored.trigger.id) commit((w) => ({ trigger: { ...w.trigger, ...patch } }), { coalesce });
    else commit((w) => ({ steps: updateInSteps(w.steps, id, patch) }), { coalesce });
  };

  const select = (id, opts = {}) => {
    if (linking) return;
    setSelectedId(id);
    setSelectedBranch(opts.branch || null);
    setRequestTab(opts.tab ? { tab: opts.tab, tick: Date.now() } : null);
    setInsert(null);
    setCtxMenu(null);
    setFocus((f) => ({ id, tick: f.tick + 1 }));
  };

  const focusNode = (id, opts) => {
    select(id, opts);
    setHighlightId(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1400);
  };

  const autoConnection = (connector) => defaultConnection(state, { connector, projectId: stored.projectId });

  const insertNode = (target, pick) => {
    const base = createNodeFromPick(pick);
    const c = base.connector && resolveConnector(base.connector);
    const aiConns = ['ai', 'agent'].includes(base.kind) ? usableConnections(state, { connectors: AI_CONNECTORS, projectId: stored.projectId }) : [];
    const aiConn = aiConns.find((x) => x.connector === 'claude') || aiConns[0];
    const node = ['ai', 'agent'].includes(base.kind)
      ? { ...base, config: { ...base.config, connectionId: aiConn ? aiConn.id : null, modelName: aiConn ? (MODEL_OPTIONS[aiConn.connector] || [{ value: base.config.modelName }])[0].value : base.config.modelName } }
      : c && c.auth !== 'none' ? { ...base, connectionId: autoConnection(c.id) } : base;
    commit((w) => ({ steps: insertIntoSteps(w.steps, target, node) }));
    setInsert(null);
    const tab = node.kind === 'action' ? (c && c.auth !== 'none' && !node.connectionId ? 'conn' : 'input') : undefined;
    setTimeout(() => focusNode(node.id, { tab }), 30);
  };

  const deleteNode = async (id) => {
    const node = findNode(stored.steps, id);
    if (!node) return;
    const inner = countDescendants(node);
    const ok = await confirmDialog({ title: '确定删除此节点？', content: inner ? `「${node.name}」及其中的 ${inner} 个节点会一起删除，可以用撤销恢复。` : `「${node.name}」会从工作流中移除，可以用撤销恢复。`, danger: true, okText: '删除' });
    if (!ok) return;
    commit((w) => ({ steps: removeFromSteps(w.steps, id) }));
    if (selectedId === id) setSelectedId(null);
    toast.success('已删除节点');
  };

  const copyNode = (id, { cut } = {}) => {
    const node = findNode(stored.steps, id);
    if (!node) return;
    safeStorage.set(CLIPBOARD_KEY, JSON.stringify({ node, from: stored.id, fromName: stored.name, projectId: stored.projectId, cut: Boolean(cut) }));
    if (cut) {
      commit((w) => ({ steps: removeFromSteps(w.steps, id) }));
      if (selectedId === id) setSelectedId(null);
      toast.success('已剪切节点，可以粘贴到其他位置');
    } else {
      toast.success('已复制节点，可以在本工作流或其他工作流中粘贴');
    }
  };

  const readClipboard = () => {
    const raw = safeStorage.get(CLIPBOARD_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  const pasteNode = (anchorId, where = 'below') => {
    const clip = readClipboard();
    if (!clip || !clip.node) { toast.info('剪贴板中没有节点'); return; }
    const reuse = clip.cut && clip.from === stored.id && !allNodes(stored).some((x) => x.id === clip.node.id);
    const moved = reuse ? [clip.node] : cloneNodes([clip.node]).nodes;
    const sameProject = clip.projectId === stored.projectId;
    const cleaned = sameProject ? moved : mapSteps(moved, (n) => {
      const conn = n.connectionId && state.connections.find((c) => c.id === n.connectionId);
      return conn && !connAvailableIn(conn, stored.projectId) ? { ...n, connectionId: null } : n;
    });
    const fresh = cleaned[0];
    const isTrigger = !anchorId || anchorId === stored.trigger.id;
    const loc = !isTrigger && locateNode(stored.steps, anchorId);
    const target = loc ? { ...loc, index: loc.index + (where === 'below' ? 1 : 0) } : { parent: 'root', owner: 'root', index: 0 };
    commit((w) => ({ steps: insertIntoSteps(w.steps, target, fresh) }));
    if (reuse) safeStorage.remove(CLIPBOARD_KEY);
    const next = { ...stored, steps: insertIntoSteps(stored.steps, target, fresh) };
    const pastedIds = new Set();
    walkNodes([fresh], (n) => pastedIds.add(n.id));
    const broken = workflowIssues(next, state).filter((i) => i.ref && pastedIds.has(i.node.id)).length;
    if (broken) toast.warning(`已粘贴节点，其中 ${broken} 处引用在当前位置不可用，请重新选择`);
    else toast.success(clip.from !== stored.id ? `已粘贴来自「${clip.fromName}」的节点` : '已粘贴节点');
    setTimeout(() => focusNode(fresh.id), 30);
  };

  const addBranch = (nodeId) => {
    commit((w) => ({ steps: updateInSteps(w.steps, nodeId, (n) => {
      const def = n.branches.find((b) => b.isDefault);
      const others = n.branches.filter((b) => !b.isDefault);
      const nb = { id: uid('b'), name: `分支 ${others.length + 1}`, conditions: n.kind === 'parallel' ? undefined : [{ left: '', op: '等于', right: '' }], logic: 'and', steps: [] };
      return { branches: def ? [...others, nb, def] : [...others, nb] };
    }) }));
    select(nodeId);
  };

  const replaceTrigger = () => {
    setSelectedId(stored.trigger.id);
    const el = document.querySelector(`[data-node="${stored.trigger.id}"] .fnode-tile`);
    setInsert({ target: { key: 'trigger' }, anchorRef: { current: el }, mode: 'trigger' });
  };

  const applyTrigger = async (pick) => {
    const used = allNodes(stored).filter((n) => n.id !== stored.trigger.id && ownRefs(n).some((r) => r.head === stored.trigger.id)).length;
    setInsert(null);
    if (stored.trigger.connector && used) {
      const ok = await confirmDialog({ title: '替换触发器？', content: `有 ${used} 个节点引用了当前触发器的出参，替换后这些引用可能失效，需要重新选择。`, okText: '替换' });
      if (!ok) return;
    }
    const c = resolveConnector(pick.connector);
    const next = { ...triggerFromPick(pick.connector, pick.op), connectionId: c && c.auth !== 'none' ? autoConnection(c.id) : null };
    commit(() => ({ trigger: next }));
    focusNode(stored.trigger.id, { tab: c && c.auth !== 'none' && !next.connectionId ? 'conn' : 'trigger' });
  };

  const startLink = (e, node, cb) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const upstreamIds = upstreamNodes(stored, node.id).map((x) => x.id);
    if (!upstreamIds.length) { toast.info('没有可以连线的上游节点'); return; }
    const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setLinking({ from, to: from, upstreamIds, cb });
    const move = (ev) => setLinking((l) => l && { ...l, to: { x: ev.clientX, y: ev.clientY } });
    const up = (ev) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const nodeEl = el && el.closest('[data-node]');
      const targetId = nodeEl && nodeEl.getAttribute('data-node');
      setLinking(null);
      if (targetId && upstreamIds.includes(targetId)) {
        setLinkPick({ nodeId: targetId, anchorRef: { current: nodeEl.querySelector('.fnode-tile') }, cb });
      } else if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 30) {
        toast.info('只能连线到上游节点，不同分支之间也无法互相取值');
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const startDebug = ({ payloadText, groupId }) => {
    if (live) { toast.info('调试进行中，请等待结束或先终止'); return; }
    const { run, trace } = makeDebugRun(stored, state, { payloadText, groupId });
    const pending = trace.map((t) => ({ ...t, status: 'pending' }));
    setLive({ run: { ...run, status: 'running' }, trace: pending, final: trace });
    setDebug((d) => ({ ...d, open: true, currentId: run.id }));
    setSide(null);
    setSelectedId(null);
    clearDebugTimers();
    trace.forEach((t, i) => {
      debugTimers.current.push(setTimeout(() => setLive((l) => l && l.run.id === run.id && { ...l, trace: l.trace.map((x, j) => (j === i ? { ...x, status: 'running' } : x)) }), i * 520));
      debugTimers.current.push(setTimeout(() => setLive((l) => l && l.run.id === run.id && { ...l, trace: l.trace.map((x, j) => (j === i ? trace[i] : x)) }), i * 520 + 420));
    });
    debugTimers.current.push(setTimeout(() => {
      Store.set((s) => ({ ...s, runs: [run, ...s.runs] }));
      setLive(null);
      if (run.status === 'failed') toast.error('调试完成，存在 1 个错误节点');
      else toast.success(`调试完成，耗时 ${fmt.duration(run.duration)}`);
    }, trace.length * 520 + 200));
  };

  const stopDebug = () => {
    if (!live) return;
    clearDebugTimers();
    const doneCount = live.trace.filter((t) => !['pending', 'running'].includes(t.status)).length;
    const stopped = { ...live.run, status: 'stopped', failedNodeId: null, failure: null, errors: 0, stopIndex: Math.max(1, doneCount), duration: live.trace.reduce((a, t) => a + (['pending', 'running'].includes(t.status) ? 0 : t.duration || 0), 0) };
    Store.set((s) => ({ ...s, runs: [stopped, ...s.runs] }));
    setLive(null);
    toast.info('已终止调试');
  };

  const onDebugClick = () => {
    if (errors.length) {
      toast.error('部分错误尚未修正，无法调试');
      setDebug((d) => ({ ...d, open: false }));
      setSide('issues');
      return;
    }
    if (live) { toast.info('调试进行中，请等待结束或先终止'); return; }
    setDebugModal(true);
  };

  function onPublishClick() {
    if (lockedBy) {
      toast.warning(`${personName(lockedBy.userId)} 正在编辑，发布会带上对方还没完成的修改，请等对方编辑完成`);
      return;
    }
    if (errors.length) {
      confirmDialog({ title: `${errors.length} 个错误，需编辑修复`, content: '工作流存在未修复的错误，修复后才能发布。', okText: '去编辑修复' }).then((ok) => {
        if (!ok) return;
        navigate(`/integration/${pid}/wf/${wid}?mode=edit`);
        setTimeout(() => setSide('issues'), 50);
      });
      return;
    }
    if (staged && testDep && !stored.draftChanged) { toast.info(testAhead ? '测试环境已是最新版本，验证后可以推广到生产' : '没有未发布的修改，测试环境已是最新版本'); return; }
    if (!staged && stored.published && !stored.draftChanged) { toast.info('没有未发布的修改，线上已是最新版本'); return; }
    if (!warnings.length) { setPublishOpen(true); return; }
    confirmDialog({ title: '发布提醒', content: `检测到有 ${warnings.length} 个警告尚未解决，发布后相关节点可能运行失败。`, okText: '继续发布' }).then((ok) => { if (ok) setPublishOpen(true); });
  }

  const toggleRun = async () => {
    if (stored.status === 'enabled') {
      const ok = await confirmDialog({ title: '确认停止运行？', content: '停止后工作流不再被触发，正在运行的实例会继续跑完。', danger: true, okText: '停止' });
      if (!ok) return;
      patchList('workflows', stored.id, { status: 'disabled' });
      addAudit('停止工作流', stored.name, stored.projectId);
      toast.success('工作流已停止');
    } else {
      patchList('workflows', stored.id, { status: 'enabled' });
      addAudit('启动工作流', stored.name, stored.projectId);
      toast.success('工作流已启动');
    }
  };

  const removeWorkflow = async () => {
    const ok = await confirmDialog({ title: `删除工作流「${stored.name}」？`, content: '删除后无法恢复，运行日志保留 30 天。', danger: true, okText: '删除', confirmText: stored.name });
    if (!ok) return;
    removeFromList('workflows', stored.id);
    addAudit('删除工作流', stored.name, stored.projectId);
    toast.success('已删除');
    navigate(`/integration/${pid}`);
  };

  const toggleFullscreen = () => setFullscreen((v) => !v);

  keyRef.current = (e) => {
    if (e.isComposing || e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (layerStack.length || linking) return;
      if (ctxMenu) { setCtxMenu(null); return; }
      if (selectedId || side) { setSelectedId(null); setSide(null); return; }
      if (fullscreen) setFullscreen(false);
      return;
    }
    if (layerStack.length || e.target.closest('input, textarea, select, [contenteditable], [role="textbox"], .npanel, .side-panel, .debug-panel')) return;
    const meta = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const nodeSelected = selectedId && selectedId !== stored.trigger.id;
    if (!editing) return;
    if (meta && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (meta && key === 'y') { e.preventDefault(); redo(); }
    else if (meta && key === 'c' && nodeSelected) { e.preventDefault(); copyNode(selectedId); }
    else if (meta && key === 'x' && nodeSelected) { e.preventDefault(); copyNode(selectedId, { cut: true }); }
    else if (meta && key === 'v') { e.preventDefault(); pasteNode(selectedId); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && nodeSelected) { e.preventDefault(); deleteNode(selectedId); }
  };
  const selectedNode = selectedId ? findInWorkflow(wf, selectedId) : null;
  const searchIds = side === 'copilot' && previewIds ? previewIds : side === 'search' && searchQ ? allNodes(wf).filter((n) => `${n.name}${refs[n.id]}`.toLowerCase().includes(searchQ.toLowerCase())).map((n) => n.id) : null;
  const clip = editing ? readClipboard() : null;

  const ctx = {
    editing, state, selectedId, selectedBranch, runState, issuesByNode, highlightId, linking, searchIds, collapsed, fullscreen,
    insertTarget: insert && insert.target, focusId: focus.id, focusTick: focus.tick, canvasApi,
    leftInset: debug.open && currentRun ? debug.width + 60 : side ? (side === 'copilot' ? (editing ? 440 : 392) : 400) : editing ? 56 : 0,
    rightInset: selectedNode ? 432 : 0,
    takenBranches: debug.open && currentTrace ? currentTrace.flatMap((t) => (t.meta && t.meta.branchIds) || []) : null,
    onSelect: select,
    onToggleFullscreen: toggleFullscreen,
    onOpenInsert: (target, anchorRef) => setInsert({ target, anchorRef, mode: 'action' }),
    onDropItem: (target, item, anchorRef) => {
      if (item.kind) { insertNode(target, { kind: item.kind, variant: item.variant, name: item.name }); return; }
      const c = resolveConnector(item.connector);
      if (!c) return;
      if (item.op) { const o = [...c.actions, ...c.triggers].find((x) => x.key === item.op); insertNode(target, { kind: 'action', connector: c.id, op: item.op, name: o ? o.name : item.name }); return; }
      if (c.actions.length === 1) { insertNode(target, { kind: 'action', connector: c.id, op: c.actions[0].key, name: c.actions[0].name }); return; }
      setInsert({ target, anchorRef, mode: 'action', connector: c.id });
    },
    onDelete: deleteNode,
    onCopy: (id) => copyNode(id),
    onAddBranch: addBranch,
    onReplaceTrigger: replaceTrigger,
    onContextMenu: (id, e) => { setSelectedId(id); setCtxMenu({ id, x: e.clientX, y: e.clientY }); },
    onToggleCollapse: (id) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])),
    onCollapseAll: (on) => {
      const ids = [];
      walkNodes(wf.steps, (n) => { if (hasChildren(n)) ids.push(n.id); });
      setCollapsed(on ? ids : []);
    },
    onCanvasClick: () => { setSelectedId(null); setCtxMenu(null); if (side && side !== 'palette') setSide(null); },
  };

  const moreItems = [
    { label: '基本信息', icon: 'Info', onClick: () => setInfoOpen(true) },
    { label: '版本管理', icon: 'History', onClick: () => setVersionsOpen(true) },
    { label: '查看日志', icon: 'ScrollText', onClick: () => navigate(`/logs?workflow=${stored.id}`) },
    { divider: true },
    { label: '创建副本', icon: 'CopyPlus', onClick: () => setCopyOpen(true) },
    { label: '导出', icon: 'Download', onClick: () => integExportWorkflow(stored) },
    { label: '生成模板', icon: 'LayoutTemplate', disabled: !stored.published || !canEdit, desc: stored.published ? '' : '发布后才能生成模板', onClick: () => setTemplateOpen(true) },
    ...(canEdit ? [
      { divider: true },
      stored.status === 'enabled'
        ? { label: '停止工作流', icon: 'CirclePause', onClick: toggleRun }
        : { label: '启动工作流', icon: 'CirclePlay', disabled: !stored.published, desc: stored.published ? '' : '工作流尚未发布版本，无法启动', onClick: toggleRun },
      { divider: true },
      { label: '删除', icon: 'Trash2', danger: true, onClick: removeWorkflow },
    ] : []),
  ];

  const ctxItems = ctxMenu && (ctxMenu.id === stored.trigger.id
    ? [
      { label: '替换触发器', icon: 'Replace', onClick: replaceTrigger },
      { label: '粘贴到下方', icon: 'ClipboardPaste', shortcut: shortcutLabel('mod+v'), disabled: !clip, onClick: () => pasteNode(ctxMenu.id, 'below') },
    ]
    : [
      { label: '复制', icon: 'Copy', shortcut: shortcutLabel('mod+c'), onClick: () => copyNode(ctxMenu.id) },
      { label: '剪切', icon: 'Scissors', shortcut: shortcutLabel('mod+x'), onClick: () => copyNode(ctxMenu.id, { cut: true }) },
      { label: '粘贴到下方', icon: 'ClipboardPaste', shortcut: shortcutLabel('mod+v'), disabled: !clip, onClick: () => pasteNode(ctxMenu.id, 'below') },
      { label: '粘贴到上方', icon: 'ClipboardPaste', disabled: !clip, onClick: () => pasteNode(ctxMenu.id, 'above') },
      { divider: true },
      { label: '删除', icon: 'Trash2', danger: true, shortcut: shortcutLabel('delete'), onClick: () => deleteNode(ctxMenu.id) },
    ]);

  const linkNode = linkPick && findInWorkflow(stored, linkPick.nodeId);

  return html`<div className=${cx('wf', fullscreen && 'is-fullscreen')}>
    <header className="wf-top">
      <div className="wf-top-main">
        <div className="wf-top-title">
          <${WorkflowGlyph} wf=${stored} size=${20} />
          ${renaming
            ? html`<${InlineEditAuto} value=${stored.name} onDone=${(v) => { setRenaming(false); if (v && v !== stored.name) { patchList('workflows', stored.id, { name: v, updatedAt: Date.now() }); toast.success('已重命名'); } }} />`
            : html`<${Dropdown}
              placement="bottom-start"
              width=${300}
              trigger=${html`<button type="button" className="wf-top-name" title=${stored.name}><span className="wf-top-name-text">${stored.name}</span><${Icon} name="ChevronDown" size=${14} className="muted" /></button>`}
              items=${[{ group: '切换工作流' }, ...projectWfs.map((w) => ({ key: w.id, label: w.name, active: w.id === stored.id, iconNode: html`<${WorkflowGlyph} wf=${w} size=${16} />`, onClick: () => navigate(`/integration/${pid}/wf/${w.id}${editing ? '?mode=edit' : ''}`) }))]}
            />`}
          ${!snapshot && canEdit && !renaming && html`<${IconButton} icon="PenLine" size="xs" title="重命名" onClick=${() => setRenaming(true)} />`}
          <${WorkflowStatusTag} wf=${stored} size="sm" />
          ${snapshot && html`<${Tag} size="sm" tone="primary">快照 v${snapshot}<//>`}
          ${!snapshot && (stored.published || testDep) && stored.draftChanged && html`<${Tooltip} content=${staged ? '编辑内容还没有发布到测试环境' : '编辑内容还没有发布，线上运行的仍是上一个版本'}><${Tag} size="sm" tone="warning">有更新未发布<//><//>`}
          ${!snapshot && !stored.published && !testDep && html`<${Tag} size="sm" tone="outline">未发布<//>`}
          ${!snapshot && pendingRelease && html`<${Tooltip} content=${`v${pendingRelease.version} 推广到生产环境，等待${pendingRelease.approvers.map((u) => personName(u)).join('、')}审批`}><${Tag} size="sm" tone="info">推广待审批<//><//>`}
          ${!canEdit && !snapshot && html`<${Tag} size="sm" tone="default">只读<//>`}
          ${!snapshot && lockedBy && html`<${Tooltip} content=${`${fmt.relative(lockedBy.since)}开始编辑`}><span className="wf-presence"><${Avatar} name=${personName(lockedBy.userId)} size=${18} />${personName(lockedBy.userId)} 正在编辑<//></span>`}
        </div>
        <div className="wf-top-meta">
          ${snapshot && snapshotVersion
            ? html`<span>发布于 ${fmt.dateTime(snapshotVersion.publishedAt)} · 发布人 ${personName(snapshotVersion.publisher)}</span>`
            : html`<span>最后更新时间：${fmt.dateTime(stored.updatedAt)}</span>`}
          ${editing && html`<span className="row-4">${saving ? html`<${Fragment}><${Icon} name="LoaderCircle" size=${12} className="spin" />保存中…<//>` : html`<${Fragment}><${Icon} name="Cloud" size=${12} />已自动保存<//>`}</span>`}
          ${!snapshot && staged && html`<span>测试 ${testDep ? `v${testDep.version}` : '未发布'} · 生产 ${stored.published ? `v${stored.version}` : '未发布'}</span>`}
          ${!snapshot && !staged && stored.version > 0 && html`<span>线上版本 v${stored.version}</span>`}
        </div>
      </div>
      <div className="wf-top-actions">
        ${snapshot
          ? html`<${Fragment}>
            <${Button} icon="CopyPlus" onClick=${() => setCopyOpen(true)}>基于此版本创建副本<//>
            <${Button} variant="primary" icon="ArrowLeft" onClick=${() => navigate(`/integration/${pid}/wf/${wid}`)}>返回当前版本<//>
          <//>`
          : html`<${Fragment}>
            <${MoreMenu} items=${moreItems} size="md" width=${200} />
            <${Button} icon="Sparkles" variant=${side === 'copilot' ? 'soft' : 'outline'} onClick=${() => { setDebug((d) => ({ ...d, open: false })); setSide(side === 'copilot' ? null : 'copilot'); }}>AI 助手<//>
            ${editing
              ? html`<${Fragment}>
                <span data-tour="debug"><${Button} icon="CodeXml" loading=${Boolean(live)} onClick=${onDebugClick}>${live ? '调试中' : '调试'}<//></span>
                <${Button} variant="primary" icon="Check" onClick=${() => { navigate(`/integration/${pid}/wf/${wid}`); toast.success(staged ? '已保存，发布到测试环境后生效' : '已保存，发布后生效'); }}>完成<//>
              <//>`
              : canEdit
                ? html`<${Fragment}>
                  <${Button} icon="PenLine" onClick=${() => navigate(`/integration/${pid}/wf/${wid}?mode=edit`)}>编辑<//>
                  ${staged && (pendingRelease
                    ? html`<${Button} icon="ClipboardCheck" onClick=${() => navigate(`/integration/${pid}/releases/${pendingRelease.id}`)}>查看推广审批<//>`
                    : html`<${Button} icon="Rocket" disabled=${!testAhead} title=${testAhead ? '' : '测试环境没有比生产环境更新的版本'} onClick=${() => setPromoteOpen(true)}>推广到生产<//>`)}
                  <span data-tour="publish"><${Button} variant="primary" icon="CloudUpload" onClick=${onPublishClick}>${staged ? '发布到测试' : '发布'}<//></span>
                <//>`
                : null}
          <//>`}
      </div>
    </header>
    ${!editing && !snapshot && canEdit && !stored.trigger.connector && html`<div className="wf-banner"><${Icon} name="Info" size=${14} />这是一个空白工作流，点击右上角「编辑」开始搭建。</div>`}
    ${!canEdit && !snapshot && html`<div className="wf-banner"><${Icon} name="Eye" size=${14} />你在项目中是「可查看」权限，可以查看配置和日志，不能编辑或发布。</div>`}
    ${wantEdit && lockedBy && html`<div className="wf-banner is-warning">
      <${Icon} name="Lock" size=${14} />
      <span className="grow">${personName(lockedBy.userId)} 正在编辑这个工作流（${fmt.relative(lockedBy.since)}开始）。为避免互相覆盖，同一时间只能一个人编辑，你现在只能查看。</span>
      <${Button} size="xs" onClick=${() => toast.success(`已向${personName(lockedBy.userId)}发送编辑请求`)}>请求编辑<//>
      ${role === 'owner' && html`<${Button} size="xs" variant="primary" onClick=${takeOver}>接管编辑<//>`}
    </div>`}
    ${drafts.length > 0 && html`<div className="wf-banner is-ai">
      <${Icon} name="Sparkles" size=${14} />
      <span className="grow">${stored.aiGenerated ? `AI 根据「${stored.aiGenerated.prompt.length > 40 ? `${stored.aiGenerated.prompt.slice(0, 40)}…` : stored.aiGenerated.prompt}」生成了这个工作流，` : ''}${drafts.length} 个节点待确认。逐个检查操作、连接和入参后确认，再调试和发布。</span>
      <${Button} size="xs" variant="primary" onClick=${() => focusNode(drafts[0].id)}>检查下一个<//>
    </div>`}
    ${snapshot && html`<div className="wf-banner is-warning"><${Icon} name="History" size=${14} />你正在查看 v${snapshot} 的快照，只读。如需在此基础上修改，可以基于此版本创建副本。</div>`}
    <div className="wf-body">
      <${FlowCanvas}
        wf=${wf}
        ctx=${ctx}
        fitKey=${`${wid}:${snapshot || ''}`}
        bottomLeft=${editing && html`<${Fragment}>
          <${IconButton} icon="Undo2" size="sm" title=${`撤销 ${shortcutLabel('mod+z')}`} disabled=${!history.past.length} onClick=${undo} />
          <${IconButton} icon="Redo2" size="sm" title=${`重做 ${shortcutLabel('mod+shift+z')}`} disabled=${!history.future.length} onClick=${redo} />
        <//>`}
        overlay=${html`<${Fragment}>
          ${editing && html`<div className="canvas-float canvas-toolbar" data-tour="toolbar">
            ${[
              { key: 'palette', icon: 'Plug', title: '连接器' },
              { key: 'logs', icon: 'ScrollText', title: '调试记录' },
              { key: 'issues', icon: errors.length ? 'CircleX' : 'TriangleAlert', title: '校验', badge: errors.length || warnings.length, warn: !errors.length },
              { key: 'config', icon: 'SlidersHorizontal', title: '项目配置' },
              { key: 'storage', icon: 'Database', title: '数据存储' },
              { key: 'search', icon: 'Search', title: '搜索节点' },
            ].map((b) => html`<${Tooltip} key=${b.key} content=${b.title} placement="right">
              <button type="button" aria-label=${b.title} className=${cx('tb-btn', (side === b.key || (b.key === 'logs' && debug.open && currentRun)) && 'is-active')} onClick=${() => {
                setDebug((d) => ({ ...d, open: false }));
                setSide(side === b.key || (b.key === 'logs' && debug.open) ? null : b.key);
              }}>
                <${Icon} name=${b.icon} size=${17} />
                ${b.badge ? html`<span className=${cx('tb-badge', b.warn && 'is-warning')}>${b.badge}</span>` : null}
              </button>
            <//>`)}
          </div>`}
          ${side === 'copilot' && !(debug.open && currentRun) && html`<${CopilotPanel}
            wf=${stored}
            state=${state}
            editing=${editing}
            flush=${!editing}
            onClose=${() => setSide(null)}
            onLocate=${(id, tab) => { if (findInWorkflow(stored, id)) focusNode(id, { tab }); else toast.info('该节点已不在当前工作流中'); }}
            onPreview=${(ids) => { setPreviewIds(ids && ids.length ? ids : null); if (ids && ids.length) setFocus((f) => ({ id: ids[0], tick: f.tick + 1 })); }}
            onEnterEdit=${() => navigate(`/integration/${pid}/wf/${wid}?mode=edit`)}
            onApply=${(patch, target) => {
              commit((w) => patch(w));
              toast.success('已应用修改，可以撤销');
              if (target && target.id) setTimeout(() => focusNode(target.id, { tab: target.tab }), 60);
            }}
          />`}
          ${side && side !== 'copilot' && !(debug.open && currentRun) && html`<${SidePanel}
            kind=${side}
            wf=${stored}
            state=${state}
            refs=${refs}
            errors=${errors}
            warnings=${warnings}
            records=${records}
            searchQ=${searchQ}
            setSearchQ=${setSearchQ}
            onClose=${() => setSide(null)}
            onLocate=${(id, tab) => focusNode(id, { tab })}
            onStartDebug=${onDebugClick}
            onOpenRecord=${(id) => { setSide(null); setDebug((d) => ({ ...d, open: true, currentId: id })); }}
          />`}
          ${debug.open && currentRun && html`<${DebugPanel}
            state=${state}
            debug=${debug}
            rightInset=${selectedNode ? 432 : 0}
            setDebug=${setDebug}
            records=${records}
            run=${currentRun}
            trace=${currentTrace}
            running=${Boolean(live && live.run.id === currentRun.id)}
            refs=${refs}
            onStop=${stopDebug}
            onLocate=${(id) => { if (findInWorkflow(wf, id)) focusNode(id); else toast.info('该节点已不在当前工作流中'); }}
            onClose=${() => setDebug((d) => ({ ...d, open: false }))}
            onApplyOutput=${editing ? (nodeId, output) => { if (!findInWorkflow(stored, nodeId)) { toast.info('该节点已不在当前工作流中'); return; } updateNode(nodeId, { sampleOutput: output }); toast.success('已把实际输出应用为出参结构'); } : null}
          />`}
          ${selectedNode && html`<${NodePanel}
            key=${`${selectedNode.id}:${selectedNode.kind}:${selectedNode.connector || ''}`}
            wf=${wf}
            node=${selectedNode}
            issues=${issuesByNode[selectedNode.id] || []}
            state=${state}
            refs=${refs}
            readOnly=${!editing}
            readOnlyText=${readOnlyText}
            focusBranch=${selectedBranch}
            requestTab=${requestTab}
            onChange=${(patch) => updateNode(selectedNode.id, patch)}
            onClose=${() => setSelectedId(null)}
            onDelete=${deleteNode}
            onCopy=${(id) => copyNode(id)}
            startLink=${startLink}
            onReplaceTrigger=${replaceTrigger}
            onApplySame=${(same) => {
              const ids = same.map((x) => x.id);
              commit((w) => ({
                steps: ids.reduce((steps, id) => updateInSteps(steps, id, { connectionId: selectedNode.connectionId }), w.steps),
                trigger: ids.includes(w.trigger.id) ? { ...w.trigger, connectionId: selectedNode.connectionId } : w.trigger,
              }));
              toast.success(`已更新 ${same.length} 个节点的连接`);
            }}
            onApplyErrorAll=${async () => {
              const same = allNodes(stored).filter((x) => x.id !== selectedNode.id && x.kind === selectedNode.kind && (selectedNode.kind !== 'action' || (x.connector === selectedNode.connector && x.op === selectedNode.op)));
              if (!same.length) { toast.info('没有其他同类节点'); return; }
              const settings = selectedNode.settings || { strategy: 'stop', rules: [] };
              const needBranch = usesErrorBranch(settings);
              const losing = needBranch ? [] : same.filter((x) => x.errorSteps && x.errorSteps.length);
              if (losing.length && !(await confirmDialog({ title: '移除异常处理分支？', content: `${losing.length} 个节点的异常处理分支里有节点，应用后这些分支会被删除。可以用撤销恢复。`, danger: true, okText: '继续应用' }))) return;
              commit((w) => ({ steps: same.reduce((steps, x) => updateInSteps(steps, x.id, (n) => ({ settings, errorSteps: needBranch ? (n.errorSteps || []) : undefined })), w.steps) }));
              toast.success(`已应用到 ${same.length} 个同类节点`);
            }}
          />`}
        <//>`}
      />
    </div>
    <${Floating}
      anchorRef=${insert ? insert.anchorRef : { current: null }}
      open=${Boolean(insert)}
      onClose=${() => setInsert(null)}
      placement="right-start"
      offset=${12}
      className="popover"
    >
      ${insert && html`<${NodePicker}
        key=${insert.target.key + (insert.connector || '')}
        mode=${insert.mode}
        state=${state}
        projectId=${stored.projectId}
        initialConnector=${insert.connector}
        onPick=${(pick) => (insert.mode === 'trigger' ? applyTrigger(pick) : insertNode(insert.target, pick))}
      />`}
    <//>
    ${linkPick && linkNode && html`<${Floating} anchorRef=${linkPick.anchorRef} open=${true} onClose=${() => setLinkPick(null)} placement="right-start" offset=${10} className="popover var-pop">
      <div className="var-pop-head row"><${NodeIcon} node=${linkNode} size=${20} /><b className="grow ellipsis">${linkNode.name}</b><span className="text-xs muted">选择出参</span></div>
      <div className="var-pop-body">
        <${OutputTree} value=${outputOf(linkNode, stored)} prefix=${linkNode.id} shown=${refs[linkNode.id]} defaultOpen=${2} onPick=${(path) => { linkPick.cb(path); setLinkPick(null); toast.success('已获取出参'); }} />
      </div>
    <//>`}
    ${linking && html`<${Portal}>
      <svg className="link-overlay" aria-hidden="true">
        <defs><linearGradient id="linkgrad" x1="0" x2="1"><stop offset="0" stopColor="var(--primary)" /><stop offset="1" stopColor="var(--info)" /></linearGradient></defs>
        <path d=${`M ${linking.from.x} ${linking.from.y} C ${linking.from.x - 120} ${linking.from.y}, ${linking.to.x + 120} ${linking.to.y}, ${linking.to.x} ${linking.to.y}`} stroke="url(#linkgrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx=${linking.to.x} cy=${linking.to.y} r="4" fill="var(--info)" />
      </svg>
      <div className="link-tip" style=${{ left: linking.to.x + 12, top: linking.to.y + 12 }}>拖到高亮的上游节点上松开</div>
    <//>`}
    ${ctxMenu && html`<${ContextMenu} x=${ctxMenu.x} y=${ctxMenu.y} onClose=${() => setCtxMenu(null)} items=${ctxItems} />`}
    <${DebugModal} open=${debugModal} onClose=${() => setDebugModal(false)} wf=${stored} state=${state} onRun=${(opts) => { setDebugModal(false); startDebug(opts); }} />
    <${PublishModal} open=${publishOpen} onClose=${() => setPublishOpen(false)} wf=${stored} state=${state} />
    <${PromoteModal} open=${promoteOpen} onClose=${() => setPromoteOpen(false)} wf=${stored} state=${state} />
    <${VersionsDrawer} open=${versionsOpen} onClose=${() => setVersionsOpen(false)} wf=${stored} state=${state} pid=${pid} canEdit=${canEdit && !lockedBy} />
    <${WorkflowInfoModal} open=${infoOpen} onClose=${() => setInfoOpen(false)} wf=${stored} state=${state} canEdit=${canEdit} />
    <${CopyWorkflowModal} open=${copyOpen} onClose=${() => setCopyOpen(false)} wf=${stored} graph=${snapshot && snapshotVersion ? snapshotVersion.snapshot : null} sourceLabel=${snapshot ? `v${snapshot}` : ''} state=${state} />
    <${GenerateTemplateModal} open=${templateOpen} onClose=${() => setTemplateOpen(false)} wf=${stored} state=${state} />
  </div>`;
}

function InlineEditAuto({ value, onDone }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  const done = useRef(false);
  const finish = (next) => { if (done.current) return; done.current = true; onDone(next); };
  useEffect(() => { ref.current.focus(); ref.current.select(); }, []);
  return html`<input
    ref=${ref}
    className="inline-edit-input"
    aria-label="工作流名称"
    value=${v}
    maxLength=${100}
    onChange=${(e) => setV(e.target.value)}
    onBlur=${() => finish(v.trim())}
    onKeyDown=${(e) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter') finish(v.trim());
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(value); }
    }}
  />`;
}

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const isTop = useLayer(true, onClose);
  useEffect(() => {
    const h = (e) => { if (isTop() && ref.current && !ref.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, []);
  return html`<${Portal}><div ref=${ref} className="popover ctx-menu floating" style=${{ left: Math.min(x, window.innerWidth - 210), top: Math.min(y, window.innerHeight - 230) }}><${Menu} items=${items} close=${onClose} /></div><//>`;
}

function SidePanel({ kind, wf, state, refs, errors, warnings, records, searchQ, setSearchQ, onClose, onLocate, onStartDebug, onOpenRecord }) {
  const titles = { palette: '连接器', logs: '调试记录', issues: '校验', config: '项目配置', storage: '数据存储', search: '搜索节点' };
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('logic');
  const groups = paletteGroups(state, wf.projectId);
  const all = [...errors, ...warnings];
  const nodes = allNodes(wf);
  const searchHits = searchQ ? nodes.filter((n) => `${n.name}${refs[n.id]}`.toLowerCase().includes(searchQ.toLowerCase())) : [];
  const vars = state.variables.filter((v) => v.projectId === wf.projectId);
  const stores = state.storages.filter((s) => s.projectId === wf.projectId);
  const ql = q.trim().toLowerCase();
  const tiles = ql ? [...groups.logic, ...groups.helper, ...groups.app, ...groups.ai].filter((x) => x.name.toLowerCase().includes(ql)) : groups[tab];
  const hits = operationHits(state, ql, 'action', wf.projectId);
  return html`<div className=${cx('side-panel', ['issues', 'search', 'logs'].includes(kind) && 'is-auto')} onMouseDown=${(e) => e.stopPropagation()} aria-label=${titles[kind]}>
    <div className="side-panel-head">
      <span className="side-panel-title">${titles[kind]}</span>
      <${IconButton} icon="X" size="sm" title="关闭" onClick=${onClose} />
    </div>
    <div className="side-panel-body">
      ${kind === 'palette' && html`<${Fragment}>
        <${Input} icon="Search" placeholder="搜索连接器或操作" value=${q} onChange=${setQ} allowClear size="sm" />
        ${!ql && html`<${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'logic', label: '逻辑' }, { value: 'helper', label: '助手' }, { value: 'app', label: '应用' }, { value: 'ai', label: 'AI' }]} />`}
        <div className="text-xs muted" style=${{ margin: '10px 2px 6px' }}>拖到画布连线上的 + 处即可添加</div>
        <div className="ptile-grid">${tiles.map((item) => html`<${PaletteTile} key=${item.id} item=${item} draggable=${true} onPick=${() => toast.info('按住拖到画布连线上的 + 处，或直接点击连线上的 +')} />`)}</div>
        ${hits.length > 0 && html`<div className="menu-group">操作</div>`}
        ${hits.map((item) => html`<${OperationHit} key=${item.id} item=${item} draggable=${true} onPick=${() => toast.info('按住拖到画布连线上的 + 处即可添加该操作')} />`)}
        ${ql && !tiles.length && !hits.length && html`<${Empty} size="sm" icon="SearchX" title="没有找到相关结果" />`}
        ${tab === 'app' && !ql && html`<div className="picker-more"><${Link} to="/connectors" className="link">想发现更多连接器？前往连接器市场<//></div>`}
      <//>`}
      ${kind === 'issues' && html`<${Fragment}>
        ${all.length === 0
          ? html`<${Empty} size="sm" icon="CircleCheck" title="没有发现问题" description="校验通过，可以调试和发布。" />`
          : html`<${Fragment}>
            ${errors.length > 0 && html`<div className="issue-summary"><${Icon} name="CircleX" size=${16} style=${{ color: 'var(--destructive)' }} />${errors.length} 个错误，需修复后才能调试和发布</div>`}
            ${warnings.length > 0 && html`<div className="issue-summary"><${Icon} name="TriangleAlert" size=${16} style=${{ color: 'var(--warning)' }} />${warnings.length} 个警告，请关注</div>`}
            ${all.map((i, k) => html`<button key=${`${i.node.id}-${k}`} type="button" className="issue-row" onClick=${() => onLocate(i.node.id, i.tab)}>
              <span className=${cx('status-ic', i.level === 'error' ? 'tone-danger' : 'tone-warning')}><${Icon} name=${i.level === 'error' ? 'CircleX' : 'TriangleAlert'} size=${14} /></span>
              <${NodeIcon} node=${i.node} size=${24} />
              <span className="ellipsis" title=${`「${i.node.name || '触发器'}」${i.text}`}>「${i.node.name || '触发器'}」${i.text}</span>
              <${Icon} name="LocateFixed" size=${14} className="muted" />
            </button>`)}
          <//>`}
      <//>`}
      ${kind === 'search' && html`<${Fragment}>
        <${Input} icon="Search" placeholder="搜索节点名称或 ID" value=${searchQ} onChange=${setSearchQ} allowClear autoFocus />
        <div style=${{ marginTop: 8 }}>
          ${searchQ && html`<div className="text-xs muted" style=${{ padding: '4px 2px' }}>共 ${searchHits.length} 个结果</div>`}
          ${searchHits.map((n) => html`<button key=${n.id} type="button" className="issue-row" onClick=${() => onLocate(n.id)}>
            <${NodeIcon} node=${n} size=${24} /><span className="ellipsis">${n.name}</span><span className="text-xs muted mono">${refs[n.id]}</span>
          </button>`)}
        </div>
      <//>`}
      ${kind === 'logs' && html`<${Fragment}>
        ${records.length === 0
          ? html`<${Empty} size="sm" icon="ScrollText" title="暂无调试记录" description="调试后，每次调试的节点输入输出会记录在这里。" action=${html`<${Button} icon="CodeXml" onClick=${onStartDebug}>调试<//>`} />`
          : records.map((r) => html`<button key=${r.id} type="button" className="issue-row" onClick=${() => onOpenRecord(r.id)}>
            <span className=${cx('status-ic', `tone-${RUN_STATUS[r.status].tone}`)}><${Icon} name=${RUN_STATUS[r.status].icon} size=${15} className=${r.status === 'running' ? 'spin' : ''} /></span>
            <span className="grow">${fmt.dateTime(r.startedAt)}</span><span className="text-xs muted">${r.status === 'running' ? '运行中' : fmt.duration(r.duration)}</span>
          </button>`)}
      <//>`}
      ${kind === 'config' && html`<${Fragment}>
        <div className="text-xs muted" style=${{ marginBottom: 8 }}>在入参中输入 $ 可引用项目配置。${isStagedProject(state, wf.projectId) ? '测试环境和生产环境各自使用自己的值。' : ''}</div>
        ${vars.length === 0 && html`<${Empty} size="sm" icon="SlidersHorizontal" title="还没有项目配置" />`}
        ${vars.map((v) => html`<div key=${v.id} className="issue-row" style=${{ cursor: 'default' }}>
          <span className="otree-type">${v.type === 'number' ? '123' : v.type === 'boolean' ? 'T/F' : v.type === 'object' ? '{ }' : 'Aa'}</span>
          <div className="grow" style=${{ minWidth: 0 }}><div className="mono text-sm">${v.key}</div><div className="text-xs muted ellipsis">${v.description}</div></div>
          <${CopyButton} text=${`{{config.${v.key}}}`} />
        </div>`)}
        <div style=${{ marginTop: 8 }}><${Button} size="sm" block iconRight="ArrowUpRight" onClick=${() => navigate(`/integration/${wf.projectId}/config`)}>管理项目配置<//></div>
      <//>`}
      ${kind === 'storage' && html`<${Fragment}>
        <div className="text-xs muted" style=${{ marginBottom: 8 }}>用「数据存储」助手在运行之间读写键值，适合去重和保存游标。</div>
        ${stores.length === 0 && html`<${Empty} size="sm" icon="Database" title="还没有数据存储" />`}
        ${stores.map((s) => html`<button key=${s.id} type="button" className="issue-row" onClick=${() => navigate(`/integration/${wf.projectId}/storage?id=${s.id}`)}>
          <${Icon} name="Database" size=${16} className="muted" />
          <div className="grow"><div>${s.name}</div><div className="text-xs muted">${s.records.length} 条 · 有效期 ${s.ttlDays} 天</div></div>
          <${Icon} name="ChevronRight" size=${14} className="muted" />
        </button>`)}
      <//>`}
    </div>
  </div>`;
}

function debugRecentEvents(wf, state) {
  const base = nodeOutput(wf.trigger);
  const c = resolveConnector(wf.trigger.connector);
  if (!c || c.auth === 'none' || !base || typeof base !== 'object') return [];
  const table = (state.mappingTables || []).find((t) => t.projectId === wf.projectId && t.keyLabel.includes('北森部门'));
  const missingDept = (d) => Boolean(table && d && !table.rows.some((r) => r.k === d));
  if (base.employee_id !== undefined) {
    return [base, ...DEBUG_PEOPLE.map(([id, name, mobile, department, position]) => ({ ...base, employee_id: id, name, ...(base.mobile !== undefined ? { mobile } : {}), ...(base.department !== undefined ? { department } : {}), ...(base.position !== undefined ? { position } : {}) }))]
      .map((p, i) => ({ key: p.employee_id, title: `${p.name} · ${p.employee_id}`, sub: [p.department, p.position].filter(Boolean).join(' · '), at: Date.now() - (i * 7 + 3) * HOUR, tag: missingDept(p.department) ? `映射表「${table.name}」里没有这个部门` : base.mobile !== undefined && !p.mobile ? '没有手机号' : '', payload: p }));
  }
  if (base.instance_code !== undefined) {
    return [0, 1, 2].map((i) => ({ ...base, instance_code: `${String(base.instance_code).slice(0, -2)}${String(17 + i * 9).padStart(2, '0')}` }))
      .map((p, i) => ({ key: p.instance_code, title: `审批单 ${p.instance_code}`, sub: p.title || p.approval_name || '', at: Date.now() - (i * 5 + 1) * HOUR, tag: '', payload: p }));
  }
  return [];
}

function debugDataProblem({ wf, state, payload, path }) {
  const tables = (state.mappingTables || []).filter((t) => t.projectId === wf.projectId);
  const byId = Object.fromEntries(allNodes(wf).map((n) => [n.id, n]));
  const resolve = (head) => (head === 'trigger' || head === wf.trigger.id ? payload : byId[head] ? nodeOutput(byId[head]) : undefined);
  const found = path.map((p) => p.node).filter((n) => n.kind === 'action').map((node) => {
    const hit = Object.entries(node.config || {}).find(([, v]) => isMapping(v));
    if (!hit) return null;
    const [fkey, v] = hit;
    const ev = evalMapping(v.$map, { resolve, tables, schema: mappingSchema(node, fkey) || [] });
    const row = ev.rows.find((r) => r.error);
    return row ? { node, message: `「${row.target}」${row.error}` } : null;
  }).find(Boolean);
  return found || null;
}

function DebugModal({ open, onClose, wf, state, onRun }) {
  const sample = JSON.stringify(nodeOutput(wf.trigger), null, 2);
  const [text, setText] = useState('{}');
  const events = useMemo(() => (open ? debugRecentEvents(wf, state) : []), [open, wf.trigger.connector, wf.trigger.op]);
  const [src, setSrc] = useState('recent');
  const [picked, setPicked] = useState(null);
  const sourceName = (resolveConnector(wf.trigger.connector) || {}).name || '';
  const envs = projectEnvs(state, wf.projectId);
  const [group, setGroup] = useState(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!open) return;
    const ev = debugRecentEvents(wf, state);
    setSrc(ev.length ? 'recent' : 'manual');
    setPicked(ev.length ? ev[0].key : null);
    setText(ev.length ? JSON.stringify(ev[0].payload, null, 2) : wf.trigger.connector === 'manual-trigger' ? '{}' : sample);
    setGroup((envs.find((e) => e.key === 'test') || envs[0]).id);
  }, [open]);
  const pick = (e) => { setPicked(e.key); setText(JSON.stringify(e.payload, null, 2)); };
  const env = envs.find((e) => e.id === group) || envs[0];
  const used = new Set(allNodes(wf).map((n) => (['ai', 'agent'].includes(n.kind) ? n.config.connectionId : n.connectionId)).filter(Boolean));
  const swaps = Object.entries(env.connectionMap || {}).filter(([from]) => used.has(from)).map(([from, to]) => [state.connections.find((c) => c.id === from), state.connections.find((c) => c.id === to)]).filter(([a, b]) => a && b);
  const valid = (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })();
  const writes = allNodes(wf).filter((n) => n.kind === 'action' && n.connectionId && !/^(get|query|search|list|read|bitable_search)/.test(n.op || '')).map((n) => {
    const swapped = Boolean(env && (env.connectionMap || {})[n.connectionId]);
    const conn = state.connections.find((c) => c.id === (swapped ? env.connectionMap[n.connectionId] : n.connectionId));
    return { id: n.id, name: n.name, conn: conn ? conn.name : '未选择连接', sameAsProd: Boolean(env && env.key === 'test' && !swapped) };
  });
  const risky = writes.some((w) => w.sameAsProd) || (env && env.key === 'prod');
  const editor = (rows) => html`<${CodeEditor} light value=${text} onChange=${setText} rows=${rows} label="调试出参" tools=${html`<${Fragment}>
    <${Button} size="xs" icon="CodeXml" onClick=${() => setText(sample)}>生成默认出参<//>
    <${Button} size="xs" icon="Trash2" onClick=${() => setText('{}')}>清除<//>
    ${!full && html`<${Button} size="xs" icon="Maximize2" onClick=${() => setFull(true)}>全屏编辑<//>`}
  <//>`} />`;
  return html`<${Fragment}>
    <${Modal} open=${open && !full} onClose=${onClose} title="调试" width=${760} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${() => onRun({ payloadText: text, groupId: group })}>调试<//><//>`}>
      <${Field} label="用这条数据试跑" required help="这条数据会当作触发器收到的数据，交给后面的节点。" error=${valid ? null : 'JSON 格式不正确'}>
        ${events.length > 0 && html`<${Segmented} value=${src} onChange=${setSrc} options=${[{ value: 'recent', label: `${sourceName}里最近的记录` }, { value: 'manual', label: '自己填写' }]} />`}
        ${src === 'recent' && events.length > 0
          ? html`<div className="debug-events">${events.map((e) => html`<button key=${e.key} type="button" className=${cx('debug-event', picked === e.key && 'is-active')} onClick=${() => pick(e)}>
              <span className=${cx('radio-dot', picked === e.key && 'is-checked')} />
              <span className="grow"><b>${e.title}</b><span className="text-xs muted">${e.sub}</span></span>
              ${e.tag && html`<${Tag} size="sm" tone="warning">${e.tag}<//>`}
              <span className="text-xs muted">${fmt.relative(e.at)}</span>
            </button>`)}</div>
            <div className="text-xs muted" style=${{ marginTop: 6 }}>从${sourceName}读取最近的记录，只读，不会改动${sourceName}里的数据。可以挑一条带提示的，看看出错时会怎样。</div>`
          : editor(14)}
      <//>
      ${envs.length > 1 && html`<${Field} label="运行环境" help="调试使用哪个环境的项目配置值和连接">
        <${Segmented} value=${group} onChange=${setGroup} options=${envs.map((e) => ({ value: e.id, label: e.name }))} />
        ${swaps.map(([a, b]) => html`<div key=${a.id} className="field-hint">连接替换：${a.name} → ${b.name}</div>`)}
        ${env.key === 'prod' && html`<div className="field-hint is-warning">调试会真实调用生产环境的系统，写入类操作会产生真实数据。</div>`}
      <//>`}
      ${writes.length > 0 && html`<${Alert} tone=${risky ? 'warning' : 'info'} title=${`调试会真的执行 ${writes.length} 个写操作`}>
        ${writes.map((w) => html`<div key=${w.id}>「${w.name}」→ ${w.conn}${w.sameAsProd ? '（测试环境没有替换，和生产是同一个连接）' : ''}</div>`)}
        <div className="text-xs muted" style=${{ marginTop: 4 }}>建议用测试数据，例如测试员工的工号和手机号。</div>
      <//>`}
    <//>
    <${Modal} open=${open && full} onClose=${() => setFull(false)} title="用这条数据试跑" width=${1040} footer=${html`<${Button} variant="primary" onClick=${() => setFull(false)}>完成<//>`}>${editor(28)}<//>
  <//>`;
}

function DebugPanel({ state, debug, setDebug, records, run, trace, running, refs, onStop, onLocate, onClose, onApplyOutput, rightInset }) {
  const [sel, setSel] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [kw, setKw] = useState('');
  const [ioTab, setIoTab] = useState('Input');
  const [zoom, setZoom] = useState(false);
  const [revealed, setRevealed] = useState({});
  useEffect(() => { setSel(null); setIoTab('Input'); setRevealed({}); }, [run.id]);
  const nodeRef = (t) => refs[t.node.id] || t.node.ref || '';
  const items = trace.filter((t) => (statusFilter === 'all' || t.status === statusFilter || (statusFilter === 'failed' && t.status === 'timeout')) && (!kw || kw.split(/[,，]/).some((k) => k.trim() && `${t.node.name}${nodeRef(t)}`.includes(k.trim()))));
  const firstError = trace.find((t) => ['failed', 'timeout'].includes(t.status));
  const current = trace.find((t) => t.node.id === sel) || firstError || trace.find((t) => t.status === 'running') || trace[0];
  useEffect(() => { if (current && ['failed', 'timeout'].includes(current.status)) setIoTab('Error'); }, [current && current.node.id, current && current.status]);
  const total = running ? null : trace.reduce((a, t) => a + (t.duration || 0), 0);
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const w0 = debug.width;
    const move = (ev) => setDebug((d) => ({ ...d, width: Math.max(520, Math.min(window.innerWidth - 520, w0 + ev.clientX - startX)) }));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const rawIo = current && (ioTab === 'Input' ? current.input || {} : ioTab === 'Output' ? current.output : current.error);
  const isRevealed = Boolean(current && revealed[current.node.id]);
  const masked = rawIo && typeof rawIo === 'object' && ioTab !== 'Error' && !isRevealed ? maskDeep(rawIo, state.privacy, { all: ioTab === 'Output' && current.node.sensitive }) : { value: rawIo, count: 0 };
  const io = masked.value;
  const me = state.users.find((u) => u.id === state.me);
  const canReveal = Boolean(me && (state.privacy.revealRoles || []).includes(me.role));
  return html`<div className="debug-panel" style=${{ width: debug.width, maxWidth: `calc(100% - ${72 + (rightInset || 0)}px)` }} onMouseDown=${(e) => e.stopPropagation()} aria-label="调试记录">
    <div className="debug-resize" onMouseDown=${startResize} />
    <div className="debug-head">
      <${IconButton} icon="ChevronLeft" size="sm" title="收起" onClick=${onClose} />
      <b>调试记录：</b>
      <${Select}
        width=${230}
        size="sm"
        value=${run.id}
        onChange=${(v) => setDebug((d) => ({ ...d, currentId: v }))}
        options=${records.map((r) => ({ value: r.id, label: fmt.dateTime(r.startedAt), iconNode: html`<span className=${cx('status-ic', `tone-${RUN_STATUS[r.status].tone}`)}><${Icon} name=${RUN_STATUS[r.status].icon} size=${14} className=${r.status === 'running' ? 'spin' : ''} /></span>` }))}
      />
      <span className="text-xs muted">耗时：${running ? '运行中…' : fmt.duration(total)}</span>
      <${Popover} placement="bottom-start" width=${300} trigger=${html`<button type="button" className="link text-xs">运行信息</button>`}>
        <div className="debug-info">
          <div><span className="muted">运行 ID：</span><span className="mono">${run.id}</span></div>
          <div><span className="muted">开始时间：</span>${fmt.dateTime(run.startedAt)}</div>
          <div><span className="muted">结束时间：</span>${running ? '-' : fmt.dateTime(run.startedAt + (total || 0))}</div>
          <div><span className="muted">运行环境：</span>${run.group || '默认值'}</div>
          <div><span className="muted">调试人：</span>${personName(run.by || Store.get().me)}</div>
          <div><span className="muted">类型：</span>调试日志</div>
        </div>
      <//>
      <span className="spacer" />
      ${running && html`<${Button} size="sm" variant="danger-outline" icon="CircleStop" onClick=${onStop}>终止调试<//>`}
      ${firstError && html`<${Button} size="sm" variant="ghost" icon="CircleX" onClick=${() => { setSel(firstError.node.id); onLocate(firstError.node.id); }}>存在 1 个错误节点，点击快速定位<//>`}
    </div>
    <div className="debug-filter">
      <${Select} size="sm" width=${140} value=${statusFilter} onChange=${setStatusFilter} options=${[{ value: 'all', label: '节点状态：全部' }, { value: 'success', label: '运行成功' }, { value: 'failed', label: '运行失败' }, { value: 'stopped', label: '运行终止' }, { value: 'skipped', label: '未执行' }]} />
      <${Input} size="sm" icon="Search" placeholder="请输入关键词，使用逗号分隔" value=${kw} onChange=${setKw} allowClear style=${{ flex: 1 }} />
    </div>
    <div className="debug-body">
      <div className="debug-list">
        ${items.map((t) => html`<button key=${t.node.id} type="button" className=${cx('debug-item', current && current.node.id === t.node.id && 'is-active')} onClick=${() => { setSel(t.node.id); setIoTab(['failed', 'timeout'].includes(t.status) ? 'Error' : 'Input'); }}>
          <${NodeIcon} node=${t.node} size=${26} />
          <div className="debug-item-body">
            <div className="debug-item-name">${t.node.name}</div>
            <div className="debug-item-ref">${nodeRef(t)}${t.meta && t.meta.iterations ? ` · ${t.meta.iterations} 次` : ''}</div>
          </div>
          <span className=${cx('status-ic', `tone-${RUN_TONE[t.status]}`)} title=${RUN_STATUS[t.status].label}><${Icon} name=${RUN_STATUS[t.status].icon} size=${15} className=${t.status === 'running' ? 'spin' : ''} /></span>
        </button>`)}
        ${items.length === 0 && html`<div className="text-xs muted" style=${{ padding: 10 }}>没有符合条件的节点</div>`}
      </div>
      ${current && html`<div className="debug-detail">
        <div className="debug-detail-head">
          <${NodeIcon} node=${current.node} size=${30} />
          <div className="grow"><div style=${{ fontWeight: 600 }}>${current.node.name}</div><div className="text-xs muted mono">${nodeRef(current)}</div></div>
          <${IconButton} icon="LocateFixed" size="sm" title="在画布中定位" onClick=${() => onLocate(current.node.id)} />
        </div>
        <div className="debug-times">
          <div>开始时间：${fmt.dateTime(current.startedAt)}</div>
          <div>结束时间：${current.duration != null ? fmt.dateTime(current.startedAt + current.duration) : '-'}</div>
          <div>运行时长：${current.duration != null ? fmt.duration(current.duration) : '-'}</div>
          ${current.meta && current.meta.branch && html`<div>命中分支：${current.meta.branch}</div>`}
        </div>
        <div className="debug-io">
          <div className="debug-io-tabs" role="tablist">
            ${['Input', 'Output', 'Error'].map((t) => html`<button key=${t} type="button" role="tab" aria-selected=${ioTab === t} className=${cx('debug-io-tab', ioTab === t && 'is-active')} onClick=${() => setIoTab(t)}>${t}</button>`)}
            <span className="spacer" />
            ${ioTab === 'Output' && current.output && onApplyOutput && current.node.kind !== 'trigger' && html`<${Button} size="xs" variant="ghost" icon="Wand" onClick=${() => onApplyOutput(current.node.id, current.output)}>使用输出<//>`}
            <${Button} size="xs" variant="ghost" icon="Copy" onClick=${() => { if (copyText(JSON.stringify(io, null, 2))) toast.success('已复制到剪贴板'); else toast.error('复制失败，请手动选中复制'); }}>复制<//>
            <${Button} size="xs" variant="ghost" icon="Maximize2" onClick=${() => setZoom(true)}>放大<//>
          </div>
          ${(masked.count > 0 || isRevealed) && !['pending', 'running'].includes(current.status) && html`<${MaskBar}
            count=${masked.count}
            sensitive=${ioTab === 'Output' && Boolean(current.node.sensitive)}
            revealed=${isRevealed}
            canReveal=${canReveal}
            requireReason=${state.privacy.requireReason}
            onReveal=${(reason) => {
              setRevealed((r) => ({ ...r, [current.node.id]: true }));
              addAudit('查看调试原文', `${current.node.name} · ${run.id}${reason ? ` · ${reason}` : ''}`, run.projectId);
              toast.success('已显示原文，本次查看已记录审计');
            }}
            onHide=${() => setRevealed((r) => ({ ...r, [current.node.id]: false }))}
          />`}
          <div className="debug-io-body json">
            ${current.status === 'pending' || current.status === 'running'
              ? html`<div className="muted text-xs" style=${{ padding: 8 }}>${current.status === 'running' ? '节点运行中…' : '等待运行'}</div>`
              : io
                ? html`<${Fragment}>
                  <${JsonView} value=${io} />
                  ${ioTab === 'Error' && current.error && html`<div style=${{ padding: 8 }}><${Alert} tone="warning" title="排查建议">${current.error.code === 'CONNECTION_AUTH_FAILED' ? '连接的授权已失效。到「连接」页面重新授权后，再重新调试。' : current.error.code === 'MAPPING_ERROR' ? '数据对不上：按提示补映射表里的对照，或者改这个节点的字段映射，再重新调试。' : current.error.code === 'STEP_TIMEOUT' ? '节点执行超时。检查上游数据量是否过大，或在「错误处理」中配置重试。' : '检查入参是否符合接口要求，必要时在「错误处理」中为该错误码配置重试策略。'}<//></div>`}
                <//>`
                : html`<div className="muted text-xs" style=${{ padding: 8 }}>${ioTab === 'Error' ? '没有错误' : ioTab === 'Output' ? '该节点没有输出' : '{}'}</div>`}
          </div>
        </div>
        <${Modal} open=${zoom} onClose=${() => setZoom(false)} title=${`${current.node.name} · ${ioTab}`} width=${900}>
          <div className="json" style=${{ maxHeight: '70vh', overflow: 'auto' }}><${JsonView} value=${io || {}} defaultExpandDepth=${4} /></div>
        <//>
      </div>`}
    </div>
  </div>`;
}

function MaskBar({ count, sensitive, revealed, canReveal, requireReason, onReveal, onHide }) {
  const [reason, setReason] = useState('');
  if (revealed) {
    return html`<div className="mask-bar is-revealed">
      <${Icon} name="Eye" size=${14} />
      <span className="grow">正在显示原文，本次查看已记录审计</span>
      <${Button} size="xs" variant="ghost" onClick=${onHide}>重新脱敏<//>
    </div>`;
  }
  return html`<div className="mask-bar">
    <${Icon} name="EyeOff" size=${14} />
    <span className="grow">${sensitive ? `节点出参标记为敏感，已全部脱敏（${count} 个字段）` : `已按平台规则脱敏 ${count} 个字段`}</span>
    ${canReveal
      ? html`<${Popover} placement="bottom-end" width=${280} trigger=${html`<button type="button" className="btn btn-ghost btn-xs">查看原文</button>`}>
        ${({ close }) => html`<div className="mask-pop">
          <div className="fmap-chip-title">查看原文</div>
          <div className="text-xs muted">原文只对你显示，查看记录会写入审计日志。</div>
          ${requireReason && html`<${Textarea} rows=${2} value=${reason} onChange=${setReason} placeholder="填写查看原因，例如：排查金额字段格式" />`}
          <div className="row" style=${{ justifyContent: 'flex-end', gap: 6 }}>
            <${Button} size="xs" onClick=${close}>取消<//>
            <${Button} size="xs" variant="primary" disabled=${requireReason && !reason.trim()} onClick=${() => { close(); onReveal(reason.trim()); setReason(''); }}>查看<//>
          </div>
        </div>`}
      <//>`
      : html`<${Tooltip} content="只有平台管理员设置的角色可以查看原文"><span className="text-xs muted">无权查看原文</span><//>`}
  </div>`;
}

function PublishModal({ open, onClose, wf, state }) {
  const staged = isStagedProject(state, wf.projectId);
  const testEnv = staged ? projectEnvs(state, wf.projectId).find((e) => e.key === 'test') : null;
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (open) { setNote(''); setLoading(false); }
    return () => clearTimeout(timer.current);
  }, [open]);
  const current = deploymentOf(wf, staged ? 'test' : 'prod');
  const base = current && state.versions.find((v) => v.workflowId === wf.id && v.version === current.version);
  const diff = open && base && base.snapshot ? diffGraphs(base.snapshot, wf) : null;
  const nextVersion = nextVersionNumber(state, wf);
  const used = new Set(allNodes(wf).map((n) => (['ai', 'agent'].includes(n.kind) ? n.config.connectionId : n.connectionId)).filter(Boolean));
  const swaps = testEnv ? Object.entries(testEnv.connectionMap).filter(([from]) => used.has(from)).map(([from, to]) => [state.connections.find((c) => c.id === from), state.connections.find((c) => c.id === to)]).filter(([a, b]) => a && b) : [];
  const cancel = () => { clearTimeout(timer.current); setLoading(false); onClose(); };
  const publish = () => {
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const latest = Store.get().workflows.find((w) => w.id === wf.id);
      if (!latest) { setLoading(false); onClose(); return; }
      const version = nextVersionNumber(Store.get(), latest);
      const now = Date.now();
      const snapshot = { trigger: latest.trigger, steps: latest.steps };
      Store.set((s) => ({
        ...s,
        workflows: s.workflows.map((w) => (w.id !== wf.id ? w : staged
          ? { ...w, test: { version, status: 'enabled', at: now, by: s.me }, draftChanged: false, updatedAt: now }
          : { ...w, version, published: true, draftChanged: false, status: 'enabled', updatedAt: now })),
        versions: [{ id: `v_${wf.id}_${version}`, workflowId: wf.id, version, publishedAt: now, publisher: s.me, note: note.trim(), envs: [staged ? 'test' : 'prod'], snapshot }, ...s.versions],
      }));
      addAudit(staged ? '发布到测试环境' : '发布工作流', `${wf.name} v${version}`, wf.projectId);
      setLoading(false);
      onClose();
      toast.success(staged ? `已发布 v${version} 到测试环境，验证后可以推广到生产` : `已发布 v${version}，工作流开始运行`);
    }, 900);
  };
  const names = (list) => list.slice(0, 3).map((n) => `「${n.node ? n.node.name : n.name}」`).join('') + (list.length > 3 ? ` 等 ${list.length} 个` : '');
  return html`<${Modal} open=${open} onClose=${cancel} title=${staged ? '发布到测试环境' : '发布工作流'} width=${560} footer=${html`<${Fragment}><${Button} onClick=${cancel}>取消<//><${Button} variant="primary" loading=${loading} onClick=${publish}>${staged ? '发布到测试' : '发布'}<//><//>`}>
    ${staged
      ? html`<${Alert} tone="info" title="先发布到测试环境">运行时使用测试环境的配置值${swaps.length ? '和连接替换' : ''}，不会影响生产。验证通过后，在工作流页面「推广到生产」。<//>`
      : html`<${Alert} tone="warning">发布后，工作流将开始运行。若当前工作流正在运行，新版本会替换正在运行的版本，请慎重操作。<//>`}
    <div style=${{ height: 16 }} />
    <${Field} label="本次改动" help=${current ? `和当前${staged ? '测试环境' : '线上'}的 v${current.version} 相比` : ''}>
      ${!diff
        ? html`<div className="text-sm muted">首次发布</div>`
        : diff.same
          ? html`<div className="text-sm muted">节点结构和配置没有变化</div>`
          : html`<div className="publish-diff">
            ${diff.added.length > 0 && html`<div><${Tag} size="sm" tone="success">新增 ${diff.added.length}<//><span>${names(diff.added)}</span></div>`}
            ${diff.modified.length > 0 && html`<div><${Tag} size="sm" tone="info">修改 ${diff.modified.length}<//><span>${names(diff.modified)}</span></div>`}
            ${diff.removed.length > 0 && html`<div><${Tag} size="sm" tone="danger">删除 ${diff.removed.length}<//><span>${names(diff.removed)}</span></div>`}
          </div>`}
    <//>
    ${swaps.length > 0 && html`<${Field} label="测试环境的连接替换">
      ${swaps.map(([a, b]) => html`<div key=${a.id} className="text-sm">${a.name} <${Icon} name="ArrowRight" size=${12} className="muted" /> ${b.name}</div>`)}
    <//>`}
    <${Field} label="发布描述">
      <${Textarea} value=${note} onChange=${(v) => setNote(v.slice(0, 300))} rows=${3} placeholder="说明这次改了什么，方便团队追溯" />
      <div className="field-hint" style=${{ textAlign: 'right' }}>${note.length}/300</div>
    <//>
    <div className="text-xs muted">将发布为 v${nextVersion}，当前${staged ? '测试环境' : '线上'}版本 ${current ? `v${current.version}` : '无'}</div>
  <//>`;
}

function VersionsDrawer({ open, onClose, wf, state, pid, canEdit }) {
  const versions = state.versions.filter((v) => v.workflowId === wf.id).sort((a, b) => b.version - a.version);
  const staged = isStagedProject(state, wf.projectId);
  const testDep = deploymentOf(wf, 'test');
  const prodVersion = wf.published ? wf.version : null;
  const [diff, setDiff] = useState(null);
  const rollback = async (r) => {
    const next = nextVersionNumber(state, wf);
    const prodEnv = projectEnvs(state, wf.projectId).find((e) => e.key === 'prod');
    const approvers = staged && prodEnv && prodEnv.requireApproval ? prodEnv.approvers : [];
    const pending = (state.releases || []).filter((x) => x.workflowId === wf.id && x.status === 'pending');
    const ok = await confirmDialog({
      title: `回滚到 v${r.version}？`,
      content: [
        `会把 v${r.version} 的内容重新发布为 v${next}，${staged ? '同时部署到测试环境和生产环境' : '立即替换线上版本'}。历史版本不会被改写。`,
        wf.draftChanged ? `草稿里还没发布的修改会被 v${r.version} 的内容覆盖。` : '',
        pending.length ? `待审批的推广申请会自动撤回。` : '',
        approvers.length ? `紧急回滚不需要审批，会通知审批人${approvers.map((u) => personName(u)).join('、')}。` : '',
      ].filter(Boolean).join(''),
      okText: '回滚',
    });
    if (!ok) return;
    const now = Date.now();
    Store.set((s) => ({
      ...s,
      workflows: s.workflows.map((w) => (w.id === wf.id ? { ...w, trigger: r.snapshot.trigger, steps: r.snapshot.steps, version: next, published: true, draftChanged: false, updatedAt: now, ...(staged ? { test: { version: next, status: (w.test || {}).status || 'enabled', at: now, by: s.me } } : {}) } : w)),
      versions: [{ id: `v_${wf.id}_${next}`, workflowId: wf.id, version: next, publishedAt: now, publisher: s.me, note: `回滚到 v${r.version}`, envs: staged ? ['test', 'prod'] : ['prod'], rollbackOf: r.version, snapshot: r.snapshot }, ...s.versions],
      releases: (s.releases || []).map((x) => (x.workflowId === wf.id && x.status === 'pending' ? { ...x, status: 'cancelled', decidedBy: s.me, decidedAt: now, comment: `回滚到 v${r.version} 时自动撤回` } : x)),
    }));
    addAudit('回滚工作流', `${wf.name} v${r.version} → v${next}`, wf.projectId);
    toast.success(`已回滚：v${r.version} 的内容已发布为 v${next}`);
  };
  const envCell = (r) => html`<span className="row-4">
    ${(r.envs || ['prod']).map((e) => html`<span key=${e} className="text-xs muted">${e === 'test' ? '测试' : '生产'}</span>`).reduce((acc, x, i) => (i ? [...acc, html`<${Icon} key=${`a${i}`} name="ArrowRight" size=${11} className="muted" />`, x] : [x]), [])}
  </span>`;
  const base = versions.find((v) => v.version === prodVersion) || versions[1] || versions[0];
  return html`<${Drawer}
    open=${open}
    onClose=${onClose}
    title="版本管理"
    subtitle=${wf.name}
    width=${880}
    extra=${versions.length > 1 && html`<${Button} size="sm" icon="GitCompare" onClick=${() => setDiff({ base: base.version === versions[0].version ? versions[1].version : base.version, target: versions[0].version })}>对比版本<//>`}
  >
    ${versions.length === 0
      ? html`<${Empty} icon="History" title="暂无发布记录" description="发布后，每个版本的快照都会保留在这里，可以对比和回滚。" />`
      : html`<${Table}
        columns=${[
          { key: 'v', title: '版本号', width: 150, render: (r) => html`<span className="row-4">
            <b>v${r.version}</b>
            ${staged && testDep && testDep.version === r.version && html`<${Tag} size="sm" tone="info">测试<//>`}
            ${prodVersion === r.version && html`<${Tag} size="sm" tone="success">${staged ? '生产' : '线上'}<//>`}
          </span>` },
          { key: 'time', title: '发布时间', width: 160, render: (r) => fmt.dateTime(r.publishedAt) },
          { key: 'note', title: '版本描述', wrap: true, render: (r) => (canEdit
            ? html`<${InlineEdit} value=${r.note || '无描述'} maxLength=${300} onSave=${(v) => { patchList('versions', r.id, { note: v === '无描述' ? '' : v }); toast.success('已更新版本描述'); }} />`
            : html`<span className=${r.note ? '' : 'muted'}>${r.note || '无描述'}</span>`) },
          ...(staged ? [{ key: 'env', title: '部署过', width: 110, render: envCell }] : []),
          { key: 'who', title: '发布人', width: 100, render: (r) => html`<span className="row-4"><${Avatar} name=${personName(r.publisher)} size=${20} />${personName(r.publisher)}</span>` },
          { key: 'op', title: '操作', width: 170, render: (r) => html`<span className="row-4">
            <${Button} size="xs" variant="link" onClick=${() => { onClose(); navigate(`/integration/${pid}/wf/${wf.id}/v/${r.version}`); }}>查看<//>
            <${Button} size="xs" variant="link" disabled=${versions.length < 2} onClick=${() => setDiff({ base: (versions.find((x) => x.version < r.version) || versions[versions.length - 1]).version, target: r.version })}>对比<//>
            ${canEdit && r.version !== prodVersion && r.snapshot && html`<${Button} size="xs" variant="link" onClick=${() => rollback(r)}>回滚<//>`}
          </span>` },
        ]}
        data=${versions}
      />`}
    <${VersionDiffModal} open=${Boolean(diff)} onClose=${() => setDiff(null)} wf=${wf} baseVersion=${diff && diff.base} targetVersion=${diff && diff.target} state=${state} />
  <//>`;
}

function WorkflowInfoModal({ open, onClose, wf, state, canEdit }) {
  const [name, setName] = useState(wf.name);
  const [desc, setDesc] = useState(wf.description);
  useEffect(() => { if (open) { setName(wf.name); setDesc(wf.description); } }, [open]);
  const owner = state.users.find((u) => u.id === wf.owner);
  const project = state.projects.find((p) => p.id === wf.projectId);
  const dup = state.workflows.some((w) => w.id !== wf.id && w.projectId === wf.projectId && w.name === name.trim());
  return html`<${Modal} open=${open} onClose=${onClose} title="基本信息" width=${540} footer=${canEdit
    ? html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!name.trim() || dup} onClick=${() => { patchList('workflows', wf.id, { name: name.trim(), description: desc.trim(), updatedAt: Date.now() }); onClose(); toast.success('保存成功'); }}>保存<//><//>`
    : html`<${Button} onClick=${onClose}>关闭<//>`}>
    <${Field} label="工作流名称" required error=${dup ? '项目内已有同名工作流' : !name.trim() ? '名称不能为空' : null}><${Input} readOnly=${!canEdit} value=${name} onChange=${(v) => setName(v.slice(0, 100))} suffix=${`${name.length}/100`} /><//>
    <${Field} label="描述"><${Textarea} readOnly=${!canEdit} value=${desc} onChange=${(v) => setDesc(v.slice(0, 300))} rows=${3} /><div className="field-hint" style=${{ textAlign: 'right' }}>${desc.length}/300</div><//>
    <div className="info-grid">
      <div><span className="muted">工作流 ID：</span><span className="mono">${wf.id}</span></div>
      <div><span className="muted">所属项目：</span>${project ? project.name : '-'}</div>
      <div><span className="muted">所有者：</span>${owner ? owner.name : '已移除的用户'}</div>
      <div><span className="muted">线上版本：</span>${wf.version ? `v${wf.version}` : '未发布'}</div>
      <div><span className="muted">创建时间：</span>${fmt.dateTime(wf.createdAt)}</div>
      <div><span className="muted">最后更新：</span>${fmt.dateTime(wf.updatedAt)}</div>
    </div>
  <//>`;
}

function CopyWorkflowModal({ open, onClose, wf, graph, sourceLabel, state }) {
  const editable = state.projects.filter((p) => canEditProject(state, p.id));
  const [project, setProject] = useState(wf.projectId);
  const [name, setName] = useState(`${wf.name} 副本`);
  useEffect(() => {
    if (!open) return;
    setProject(editable.some((p) => p.id === wf.projectId) ? wf.projectId : (editable[0] || {}).id);
    setName(`${wf.name}${sourceLabel ? ` ${sourceLabel}` : ''} 副本`);
  }, [open]);
  const dup = state.workflows.some((w) => w.projectId === project && w.name === name.trim());
  const source = graph || { trigger: wf.trigger, steps: wf.steps };
  const create = () => {
    const cross = project !== wf.projectId;
    let cleared = 0;
    const scrubbed = cross ? mapGraph(source, (n) => {
      const isModel = ['ai', 'agent'].includes(n.kind);
      const connId = isModel ? n.config.connectionId : n.connectionId;
      const conn = connId && state.connections.find((c) => c.id === connId);
      if (!connId || (conn && connAvailableIn(conn, project))) return n;
      cleared += 1;
      return isModel ? { ...n, config: { ...n.config, connectionId: null } } : { ...n, connectionId: null };
    }) : source;
    const { nodes } = cloneNodes(scrubbed.steps);
    const copy = { ...newWorkflow({ projectId: project, name: name.trim(), description: wf.description, folderId: cross ? null : wf.folderId, trigger: { ...scrubbed.trigger, ref: null }, steps: nodes }), tags: wf.tags || [] };
    prependToList('workflows', copy);
    addAudit('创建工作流', copy.name, project);
    onClose();
    toast.success(cleared ? `已创建副本，${cleared} 个节点的连接在目标项目不可用，需要重新选择` : '已创建副本');
    navigate(`/integration/${project}/wf/${copy.id}`);
  };
  return html`<${Modal} open=${open} onClose=${onClose} title="创建副本" width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!name.trim() || dup || !project} onClick=${create}>创建<//><//>`}>
    ${sourceLabel && html`<div style=${{ marginBottom: 12 }}><${Alert} tone="info">副本基于 ${sourceLabel} 的快照创建，不包含之后的草稿修改。<//></div>`}
    <${Field} label="名称" required error=${!name.trim() ? '名称不能为空' : dup ? '目标项目中已有同名工作流' : null}><${Input} value=${name} onChange=${(v) => setName(v.slice(0, 100))} suffix=${`${name.length}/100`} /><//>
    <${Field} label="复制到项目" required hint="只列出你有编辑权限的项目。跨项目复制时，目标项目不可用的连接会被清空">
      <${Select} value=${project} onChange=${setProject} placeholder="没有可编辑的项目" options=${editable.map((p) => ({ value: p.id, label: p.name, iconNode: html`<${ProjectAvatar} project=${p} size=${18} />` }))} />
    <//>
  <//>`;
}

function GenerateTemplateModal({ open, onClose, wf, state }) {
  const [name, setName] = useState(wf.name);
  const [desc, setDesc] = useState(wf.description);
  const [help, setHelp] = useState('');
  const [scope, setScope] = useState('org');
  const [shared, setShared] = useState(null);
  useEffect(() => { if (open) { setName(wf.name); setDesc(wf.description); setHelp(''); setShared(null); } }, [open]);
  const helpError = help && !/^https?:\/\/\S+$/.test(help) ? '请输入 http:// 或 https:// 开头的链接' : null;
  const create = () => {
    const graph = stripConnections({ trigger: wf.trigger, steps: wf.steps });
    const tplId = uid('t');
    const actions = allNodes(wf).filter((n) => n.kind === 'action').map((n) => ({ connector: n.connector, op: n.op }));
    prependToList('templates', { id: tplId, name: name.trim(), category: '我的模板', uses: 0, desc: desc.trim(), mine: true, owner: state.me, scope, helpUrl: help, createdAt: Date.now(), trigger: { connector: wf.trigger.connector, op: wf.trigger.op }, steps: actions, graph });
    setShared(`https://${state.tenant.domain}/templates/share/${tplId.slice(-6)}`);
  };
  if (shared) {
    return html`<${Modal} open=${open} onClose=${onClose} title="分享模板" width=${480} footer=${html`<${Button} variant="primary" onClick=${onClose}>完成<//>`}>
      <${Alert} tone="success" title="模板已创建">${scope === 'org' ? '组织内成员可以通过链接或模板中心使用这个模板。' : '任何拿到链接的人都可以查看并使用这个模板。'}<//>
      <div style=${{ height: 12 }} />
      <${Field} label="模板链接"><div className="webhook-url"><span className="url">${shared}</span><${CopyButton} text=${shared} label="复制链接" /></div><//>
    <//>`;
  }
  return html`<${Modal} open=${open} onClose=${onClose} title="生成模板" width=${540} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!name.trim() || Boolean(helpError)} onClick=${create}>创建并分享<//><//>`}>
    <${Alert} tone="info">连接、项目配置的值和运行日志不会被分享。<//>
    <div style=${{ height: 12 }} />
    <${Field} label="选择工作流"><${Input} value=${wf.name} readOnly /><//>
    <${Field} label="模板名称" required error=${!name.trim() ? '模板名称不能为空' : null}><${Input} value=${name} onChange=${(v) => setName(v.slice(0, 50))} suffix=${`${name.length}/50`} /><//>
    <${Field} label="模板描述"><${Textarea} value=${desc} onChange=${(v) => setDesc(v.slice(0, 300))} rows=${3} /><//>
    <${Field} label="帮助文档链接" error=${helpError}><${Input} placeholder="https://" value=${help} onChange=${setHelp} invalid=${Boolean(helpError)} /><//>
    <${Field} label="分享范围"><${RadioGroup} value=${scope} onChange=${setScope} options=${[{ value: 'org', label: '分享到组织内' }, { value: 'public', label: '分享到互联网' }]} /><//>
  <//>`;
}

const DEBUG_PEOPLE = [
  ['XH20260921', '林雨桐', '13811110001', '人力资源部', 'HR 专员'],
  ['XH20260920', '高远', '13811110003', '深圳研发中心-平台组', '后端工程师'],
  ['XH20260919', '陈一鸣', '', '销售运营部', '客户经理'],
];
