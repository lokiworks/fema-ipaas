const LOGS_TIME_PRESETS = [
  { value: '15m', label: '近 15 分钟', ms: 15 * MIN },
  { value: '30m', label: '近 30 分钟', ms: 30 * MIN },
  { value: 'today', label: '今天', get ms() { const d = new Date(); d.setHours(0, 0, 0, 0); return Date.now() - d.getTime(); } },
  { value: '24h', label: '近 24 小时', ms: DAY },
  { value: '3d', label: '近 3 天', ms: 3 * DAY },
  { value: '7d', label: '近 7 天', ms: 7 * DAY },
  { value: '15d', label: '近 15 天', ms: 15 * DAY },
  { value: '30d', label: '近 30 天', ms: 30 * DAY },
];

const LOGS_FILTER_FIELDS = [
  { value: 'project', label: '项目', icon: 'Layers' },
  { value: 'workflow', label: '工作流', icon: 'Workflow' },
  { value: 'bizkey', label: '业务标识', icon: 'Fingerprint' },
  { value: 'status', label: '运行状态', icon: 'CircleAlert' },
  { value: 'env', label: '环境', icon: 'Server' },
  { value: 'connector', label: '连接器', icon: 'Plug' },
  { value: 'content', label: '日志内容', icon: 'Type' },
  { value: 'duration', label: '运行时长', icon: 'Timer' },
];

const LOGS_LIST_FIELDS = ['project', 'workflow', 'status', 'env', 'connector'];

const LOGS_RUN_STATUSES = ['success', 'failed', 'timeout', 'running', 'waiting', 'stopped', 'deduped'];

const LOGS_NODE_STATUSES = ['success', 'reused', 'failed', 'timeout', 'stopped', 'running', 'waiting', 'pending', 'skipped', 'deduped'];

const LOGS_ENVS = { prod: '生产环境', test: '测试环境' };

const LOGS_DURATION_UNITS = { 毫秒: 1, 秒: 1000, 分钟: MIN, 小时: HOUR };

const LOGS_DURATION_OPS = ['小于', '等于', '大于'];

const LOGS_WINDOW_LABEL = { '24h': '24 小时', '7d': '7 天', '30d': '30 天', '90d': '90 天' };

function logsTimePreset(value) {
  return LOGS_TIME_PRESETS.find((p) => p.value === value) || LOGS_TIME_PRESETS.find((p) => p.value === '24h');
}

function logsMemberProjectIds(state) {
  return new Set(state.members.filter((m) => m.userId === state.me).map((m) => m.projectId));
}

function logsRetentionDays(state, pid) {
  const p = state.privacy || {};
  const base = Number(p.retentionDays) > 0 ? Number(p.retentionDays) : 30;
  const own = Number((p.projectRetention || {})[pid]);
  return own > 0 ? Math.min(base, own) : base;
}

function logsVisibleRuns(state) {
  const now = Date.now();
  const limits = new Map([...logsMemberProjectIds(state)].map((pid) => [pid, now - logsRetentionDays(state, pid) * DAY]));
  return state.runs.filter((r) => limits.has(r.projectId) && r.startedAt >= limits.get(r.projectId));
}

function logsRetentionInfo(state) {
  const p = state.privacy || {};
  const base = Number(p.retentionDays) > 0 ? Number(p.retentionDays) : 30;
  const pids = [...logsMemberProjectIds(state)];
  const shorter = pids.map((pid) => ({ pid, days: logsRetentionDays(state, pid) })).filter((x) => x.days < base);
  const names = shorter.map((x) => `${(state.projects.find((pp) => pp.id === x.pid) || { name: '已删除的项目' }).name} ${x.days} 天`);
  const max = pids.length ? Math.max(...pids.map((pid) => logsRetentionDays(state, pid))) : base;
  return { base, max, text: `日志保留 ${base} 天${names.length ? `（${names.join('、')}）` : ''}` };
}

function logsCanReveal(state) {
  const me = state.users.find((u) => u.id === state.me);
  const roles = (state.privacy && state.privacy.revealRoles) || [];
  return Boolean(me && roles.includes(me.role));
}

function logsRevealRolesText(state) {
  const roles = (state.privacy && state.privacy.revealRoles) || [];
  return roles.map((r) => `平台${USER_ROLE_LABEL[r] || r}`).join('、') || '没有人';
}

function logsReplayLabel(run) {
  if (run.startNodeId) return '从失败节点重跑';
  if (run.triggerType === '手动重试') return '手动重试';
  return '整体重跑';
}

function logsRunGraph(run, wf, state) {
  if (wf) return graphForRun(run, wf);
  if (run.graph) return run.graph;
  const v = run.kind === 'run' && state.versions.find((x) => x.workflowId === run.workflowId && x.version === run.version);
  return v && v.snapshot ? v.snapshot : null;
}

function logsNodeConnectionId(node) {
  return node.kind === 'ai' || node.kind === 'agent' ? (node.config || {}).connectionId : node.connectionId;
}

function logsNodeConnectors(node, state) {
  if (node.kind === 'ai' || node.kind === 'agent') {
    const conn = state.connections.find((c) => c.id === (node.config || {}).connectionId);
    const tools = node.kind === 'agent' ? ((node.config || {}).tools || []).map((t) => t.connector).filter(Boolean) : [];
    return [...(conn ? [conn.connector] : []), ...tools];
  }
  return node.connector ? [node.connector] : [];
}

function logsInitialFilter(query, state) {
  const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const pids = logsMemberProjectIds(state);
  const wfIds = new Set([...state.workflows.map((w) => w.id), ...state.runs.map((r) => r.workflowId)]);
  const specs = [
    { field: 'project', raw: list(query.project), ok: (x) => pids.has(x) },
    { field: 'workflow', raw: list(query.workflow), ok: (x) => wfIds.has(x) },
    { field: 'status', raw: list(query.status), ok: (x) => LOGS_RUN_STATUSES.includes(x) },
    { field: 'env', raw: list(query.env), ok: (x) => Boolean(LOGS_ENVS[x]) },
  ];
  const biz = String(query.biz || '').trim();
  const conds = [
    ...specs.filter((s) => s.raw.some(s.ok)).map((s) => ({ id: uid('cond'), field: s.field, value: [...new Set(s.raw.filter(s.ok))] })),
    ...(biz ? [{ id: uid('cond'), field: 'bizkey', value: biz }] : []),
  ];
  const timeOk = LOGS_TIME_PRESETS.some((p) => p.value === query.time);
  const time = timeOk ? query.time : query.run || biz ? '30d' : conds.length ? '7d' : '24h';
  const ignored = [
    ...(query.time && !timeOk ? ['时间'] : []),
    ...specs.filter((s) => s.raw.some((x) => !s.ok(x))).map((s) => LOGS_FILTER_FIELDS.find((f) => f.value === s.field).label),
  ];
  return { match: 'all', conds: [{ id: uid('cond'), field: 'time', value: time }, ...conds], ignored };
}

function logsCondState(c) {
  if (c.field === 'time') return 'ok';
  if (LOGS_LIST_FIELDS.includes(c.field)) return Array.isArray(c.value) && c.value.length ? 'ok' : 'empty';
  if (c.field === 'content' || c.field === 'bizkey') return typeof c.value === 'string' && c.value.trim() ? 'ok' : 'empty';
  if (c.field === 'duration') {
    const text = c.value == null ? '' : String(c.value).trim();
    if (!text) return 'empty';
    return /^\d+(\.\d+)?$/.test(text) ? 'ok' : 'invalid';
  }
  return 'invalid';
}

function logsEffectiveFilter(filter) {
  const conds = (filter && filter.conds) || [];
  const timeCond = conds.find((c) => c.field === 'time');
  const others = conds.filter((c) => c.field !== 'time' && LOGS_FILTER_FIELDS.some((f) => f.value === c.field));
  const active = others.filter((c) => logsCondState(c) === 'ok');
  return {
    time: logsTimePreset(timeCond && timeCond.value),
    active,
    pending: others.length - active.length,
    match: filter && filter.match === 'any' && active.length > 1 ? 'any' : 'all',
  };
}

function logsRunText(run, wf) {
  return [run.id, wf ? wf.name : '已删除的工作流', run.triggerType, run.dedupeKey, run.failure && run.failure.code, run.failure && run.failure.message]
    .filter(Boolean).join(' ').toLowerCase();
}

function logsCondTest(c, state, wfById) {
  if (c.field === 'project') return (r) => c.value.includes(r.projectId);
  if (c.field === 'workflow') return (r) => c.value.includes(r.workflowId);
  if (c.field === 'status') return (r) => c.value.includes(r.status);
  if (c.field === 'env') return (r) => c.value.includes(r.env || 'prod');
  if (c.field === 'connector') {
    return (r) => {
      const graph = logsRunGraph(r, wfById.get(r.workflowId), state);
      return Boolean(graph) && allNodes(graph).some((node) => logsNodeConnectors(node, state).some((x) => c.value.includes(x)));
    };
  }
  if (c.field === 'content') {
    const q = c.value.trim().toLowerCase();
    return (r) => logsRunText(r, wfById.get(r.workflowId)).includes(q);
  }
  if (c.field === 'bizkey') {
    const q = c.value.trim().toLowerCase();
    return (r) => logsBizText(r).includes(q);
  }
  const unit = LOGS_DURATION_UNITS[c.unit] || 1000;
  const target = Number(String(c.value).trim()) * unit;
  const op = LOGS_DURATION_OPS.includes(c.op) ? c.op : '大于';
  return (r) => r.duration != null && (op === '小于' ? r.duration < target : op === '等于' ? Math.abs(r.duration - target) < unit / 2 : r.duration > target);
}

function logsApplyFilter(runs, filter, state) {
  const eff = logsEffectiveFilter(filter);
  const since = Date.now() - eff.time.ms;
  const wfById = new Map(state.workflows.map((w) => [w.id, w]));
  const tests = eff.active.map((c) => logsCondTest(c, state, wfById));
  return runs.filter((r) => r.startedAt >= since && (!tests.length || (eff.match === 'any' ? tests.some((t) => t(r)) : tests.every((t) => t(r)))));
}

function logsCondLabel(c, state) {
  const values = Array.isArray(c.value) ? c.value : [];
  if (c.field === 'time') return `${logsTimePreset(c.value).label}日志`;
  if (c.field === 'project') return `项目：${values.map((id) => (state.projects.find((p) => p.id === id) || { name: '已删除的项目' }).name).join('、')}`;
  if (c.field === 'workflow') return `工作流：${values.map((id) => (state.workflows.find((w) => w.id === id) || { name: '已删除的工作流' }).name).join('、')}`;
  if (c.field === 'status') return `运行状态：${values.map((s) => (RUN_STATUS[s] || { label: s }).label).join('、')}`;
  if (c.field === 'env') return `环境：${values.map((e) => LOGS_ENVS[e] || e).join('、')}`;
  if (c.field === 'connector') return `连接器：${values.map((id) => (resolveConnector(id) || { name: id }).name).join('、')}`;
  if (c.field === 'duration') return `运行时长${LOGS_DURATION_OPS.includes(c.op) ? c.op : '大于'} ${String(c.value == null ? '' : c.value).trim()} ${LOGS_DURATION_UNITS[c.unit] ? c.unit : '秒'}`;
  if (c.field === 'content') return `日志内容包含：${String(c.value || '').trim()}`;
  if (c.field === 'bizkey') return `业务标识包含：${String(c.value || '').trim()}`;
  return '';
}

function logsExecPath(steps, taken) {
  return (steps || []).flatMap((node) => {
    if (node.kind === 'branch') {
      const pick = node.branches.find((b) => taken.has(b.id)) || node.branches.find((b) => b.isDefault) || node.branches[0];
      return [node, ...(pick ? logsExecPath(pick.steps, taken) : [])];
    }
    if (node.kind === 'parallel') return [node, ...node.branches.flatMap((b) => logsExecPath(b.steps, taken))];
    if (node.kind === 'loop') return [node, ...logsExecPath(node.steps, taken)];
    return [node];
  });
}

function logsReplayBlock(run, state) {
  if (!run || !['failed', 'timeout'].includes(run.status) || run.kind !== 'run') return null;
  const gate = issuesReplayGate(run, state);
  if (gate) return gate;
  if (issuesSettled(state, run)) return '这次触发已经重跑成功';
  const busy = issuesChain(state, issuesChainRoot(state, run)).find((r) => r.retryOf && ['running', 'waiting'].includes(r.status));
  return busy ? '这次触发正在重跑中' : null;
}

function logsErrorTip(code, canReplay) {
  if (code === 'CONNECTION_AUTH_FAILED') return canReplay ? '节点使用的连接授权已失效。到「连接」页面重新授权后，点右上角「从失败节点重跑」。' : '节点使用的连接授权已失效，需要到「连接」页面重新授权。';
  if (code === 'CONNECTION_NOT_FOUND') return '节点使用的连接已被删除。打开工作流为该节点重新选择连接并发布，再重跑。';
  if (code === 'CONNECTION_FORBIDDEN') return '连接不在本项目的可用范围内。请连接所有者把本项目加入可用范围，或在工作流中换用其他连接。';
  if (code === 'STEP_TIMEOUT') return '节点单次运行超过上限。缩小查询范围，或拆成多个节点分批处理，修改发布后再重跑。';
  return '检查入参是否符合接口要求，修改并发布后再重跑；如果是偶发错误，在节点的「错误处理」里为该错误码配置重试。';
}

function logsCompact(value) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function logsAgentSteps(node, output, run) {
  const pa = run.pendingApproval && run.pendingApproval.nodeId === node.id ? run.pendingApproval : null;
  if (!pa) {
    return output && Array.isArray(output.steps)
      ? output.steps.map((s, i) => ({ key: `s${i}`, tool: s.tool, input: s.input, output: s.output, state: s.approved ? 'approved' : 'auto', by: s.approved || null }))
      : [];
  }
  const ap = run.approval || null;
  const sample = nodeOutput(node).steps || [];
  const conn = resolveConnector(String(pa.tool).split('.')[0]);
  const approvalStep = sample.find((s) => s.approved);
  const before = sample.filter((s) => !s.approved).map((s, i) => ({ key: `s${i}`, tool: s.tool, input: s.input, output: s.output, state: 'auto' }));
  const pending = {
    key: 'pending',
    tool: `${conn ? conn.name : pa.tool} · ${pa.toolName}`,
    input: pa.input,
    output: ap && ap.decision === 'approved' && approvalStep ? approvalStep.output : null,
    state: ap ? ap.decision : run.status === 'waiting' ? 'waiting' : 'cancelled',
    by: ap ? personName(ap.by) : null,
    reason: ap ? ap.reason : null,
    approvers: pa.approvers || [],
  };
  return [...before, pending];
}

function LogsAgentTimeline({ steps, unrecorded, mask }) {
  if (!steps.length) return null;
  const label = (s) => {
    if (s.state === 'auto') return { text: '自动执行', tone: 'default' };
    if (s.state === 'approved') return { text: `${s.by} 确认后执行`, tone: 'success' };
    if (s.state === 'waiting') return { text: `等待 ${s.approvers.map((u) => personName(u)).join('、')} 确认`, tone: 'warning' };
    if (s.state === 'rejected') return { text: `${s.by} 已拒绝`, tone: 'danger' };
    return { text: '运行已终止，没有执行', tone: 'default' };
  };
  return html`<div className="logs-steps-wrap">
    <div className="logs-steps-title"><${Icon} name="Bot" size=${14} />工具调用（${steps.length} 步）</div>
    <ol className="logs-steps">
      ${steps.map((s, i) => {
        const l = label(s);
        return html`<li key=${s.key} className=${cx('logs-step', `is-${s.state}`)}>
          <span className="logs-step-no">${i + 1}</span>
          <div className="logs-step-body">
            <div className="logs-step-head"><b>${s.tool}</b><${Tag} size="sm" tone=${l.tone}>${l.text}<//></div>
            ${!unrecorded && s.input != null && html`<div className="logs-step-io"><span>输入</span><code>${logsCompact(mask(s.input))}</code></div>`}
            ${!unrecorded && s.output != null && html`<div className="logs-step-io"><span>输出</span><code>${logsCompact(mask(s.output))}</code></div>`}
            ${s.reason && html`<div className="logs-step-io"><span>原因</span><span>${s.reason}</span></div>`}
          </div>
        </li>`;
      })}
    </ol>
  </div>`;
}

function LogsApprovalCard({ run, state, nodeName }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const pa = run.pendingApproval;
  const ap = run.approval || null;
  const approvers = pa.approvers || [];
  const isApprover = approvers.includes(state.me);
  const waiting = run.status === 'waiting' && !ap;
  const conn = resolveConnector(String(pa.tool).split('.')[0]);
  const names = approvers.map((u) => personName(u)).join('、');
  const key = waiting ? 'waiting' : ap ? ap.decision : 'void';
  const reasonText = reason.trim();
  const markRead = (s) => s.notifications.map((n) => (n.to === `/logs?run=${run.id}` ? { ...n, read: true } : n));
  const decide = (decision) => {
    const live = Store.get();
    const cur = live.runs.find((r) => r.id === run.id);
    if (!cur || cur.status !== 'waiting' || cur.approval) { toast.error('这次调用已经被处理过了'); return; }
    const now = Date.now();
    const approval = { decision, by: live.me, at: now, ...(decision === 'rejected' ? { reason: reasonText } : {}) };
    Store.set((s) => ({
      ...s,
      runs: s.runs.map((r) => {
        if (r.id !== run.id) return r;
        return decision === 'approved'
          ? { ...r, status: 'success', errors: 0, duration: now - r.startedAt + 2400, approval }
          : { ...r, status: 'stopped', stoppedBy: s.me, duration: now - r.startedAt, approval };
      }),
      notifications: markRead(s),
    }));
    addAudit(decision === 'approved' ? '批准智能体调用' : '拒绝智能体调用', `${run.id} · ${pa.toolName}`, run.projectId);
    setRejecting(false);
    setReason('');
    toast.success(decision === 'approved' ? '已批准，智能体继续执行并完成了运行' : '已拒绝，运行已终止');
  };
  return html`<div className=${cx('logs-approval', `is-${key}`)}>
    <div className="logs-approval-head">
      <span className="logs-approval-icon"><${Icon} name=${key === 'approved' ? 'CircleCheck' : key === 'rejected' ? 'CircleSlash' : key === 'void' ? 'CircleMinus' : 'UserCheck'} size=${18} /></span>
      <div className="grow">
        <div className="logs-approval-title">${waiting ? '等待人工确认' : ap ? `${personName(ap.by)}${ap.decision === 'approved' ? '批准' : '拒绝'}了这次调用` : '运行已终止，这次确认已失效'}</div>
        <div className="text-xs muted">智能体「${nodeName}」想调用 ${conn ? conn.name : pa.tool} 的「${pa.toolName}」 · ${fmt.relative(pa.requestedAt)}申请${ap ? ` · ${fmt.relative(ap.at)}处理` : ''}</div>
      </div>
      ${waiting && isApprover && !rejecting && html`<div className="row">
        <${Button} size="sm" variant="danger-outline" icon="X" onClick=${() => setRejecting(true)}>拒绝<//>
        <${Button} size="sm" variant="primary" icon="Check" onClick=${() => decide('approved')}>批准并继续<//>
      </div>`}
    </div>
    <div className="logs-approval-grid">
      <div className="kv logs-approval-kv">
        <div><span>申请原因</span><span>${pa.reason}</span></div>
        <div><span>确认人</span><span>${names}${waiting && !isApprover ? '（你不在确认人里，只能查看）' : ''}</span></div>
        ${ap && ap.reason && html`<div><span>拒绝原因</span><span>${ap.reason}</span></div>`}
      </div>
      <div className="logs-approval-input">
        <div className="text-xs muted">调用参数</div>
        <div className="json"><${JsonView} value=${maskDeep(pa.input, state.privacy).value} defaultExpandDepth=${2} /></div>
      </div>
    </div>
    ${rejecting && html`<div className="logs-reject">
      <${Field} label="拒绝原因" required hint="原因会写进运行日志和审计日志，提问的同事也能看到" error=${reasonText.length > 200 ? '拒绝原因不能超过 200 个字' : null}>
        <${Textarea} rows=${2} value=${reason} onChange=${setReason} autoFocus placeholder="例如：投影仪故障请直接找行政处理，不需要建 IT 工单" invalid=${reasonText.length > 200} />
      <//>
      <div className="row logs-reject-foot">
        <span className="spacer" />
        <${Button} size="sm" onClick=${() => { setRejecting(false); setReason(''); }}>取消<//>
        <${Button} size="sm" variant="danger" disabled=${!reasonText || reasonText.length > 200} onClick=${() => decide('rejected')}>拒绝并终止运行<//>
      </div>
    </div>`}
  </div>`;
}

function LogsRevealModal({ open, nodeName, requireReason, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const text = reason.trim();
  const error = text.length > 200 ? '原因不能超过 200 个字' : null;
  const blocked = (requireReason && text.length < 4) || Boolean(error);
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    width=${460}
    title="查看原文"
    description=${`只显示节点「${nodeName}」的原文，其他节点仍然脱敏`}
    footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" icon="Eye" disabled=${blocked} onClick=${() => onConfirm(text)}>查看原文<//><//>`}
  >
    <div className="logs-reveal-note"><${Icon} name="ShieldCheck" size=${16} /><span>这次查看会写入审计日志，包括查看人、时间、运行和原因。</span></div>
    <${Field} label="查看原因" required=${requireReason} error=${error} hint=${requireReason ? '至少 4 个字，例如「排查采购单金额不一致，工单 IT-3321」' : '选填'}>
      <${Textarea} rows=${3} value=${reason} onChange=${setReason} autoFocus placeholder="说明为什么需要查看敏感数据" invalid=${Boolean(error)} />
    <//>
  <//>`;
}

function LogsFilterPanel({ filter, options, onApply, onCancel }) {
  const [draft, setDraft] = useState(() => ({ match: filter.match === 'any' ? 'any' : 'all', conds: filter.conds.map((c) => ({ ...c })), ignored: filter.ignored || [] }));
  const [adding, setAdding] = useState(false);
  const setCond = (id, patch) => setDraft((d) => ({ ...d, conds: d.conds.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const removeCond = (id) => setDraft((d) => ({ ...d, conds: d.conds.filter((c) => c.id !== id) }));
  const fields = LOGS_FILTER_FIELDS.filter((f) => f.value !== 'env' || options.envs.length > 0);
  const used = draft.conds.map((c) => c.field);
  const addable = fields.filter((f) => !used.includes(f.value));
  const pending = draft.conds.filter((c) => c.field !== 'time' && logsCondState(c) !== 'ok').length;
  const apply = () => onApply(draft);
  const addCond = (field) => {
    const blank = ['content', 'duration', 'bizkey'].includes(field) ? '' : [];
    setDraft((d) => ({ ...d, conds: [...d.conds, { id: uid('cond'), field, value: blank, ...(field === 'duration' ? { op: '大于', unit: '秒' } : {}) }] }));
    setAdding(false);
  };
  const valueControl = (c) => {
    if (c.field === 'time') return html`<${Select} value=${logsTimePreset(c.value).value} onChange=${(v) => setCond(c.id, { value: v })} options=${LOGS_TIME_PRESETS.map((p) => ({ value: p.value, label: p.label }))} />`;
    if (c.field === 'project') return html`<${Select} multiple searchable value=${c.value || []} onChange=${(v) => setCond(c.id, { value: v })} placeholder="请选择或搜索项目" options=${options.projects} />`;
    if (c.field === 'workflow') return html`<${Select} multiple searchable value=${c.value || []} onChange=${(v) => setCond(c.id, { value: v })} placeholder="请选择或搜索工作流" options=${options.workflows} />`;
    if (c.field === 'status') return html`<${Select} multiple value=${c.value || []} onChange=${(v) => setCond(c.id, { value: v })} placeholder="请选择运行状态" options=${options.statuses} />`;
    if (c.field === 'env') return html`<${Select} multiple value=${c.value || []} onChange=${(v) => setCond(c.id, { value: v })} placeholder="请选择环境" options=${options.envs} />`;
    if (c.field === 'connector') return html`<${Select} multiple searchable value=${c.value || []} onChange=${(v) => setCond(c.id, { value: v })} placeholder=${options.connectors.length ? '请选择连接器' : '暂无可选的连接器'} options=${options.connectors} />`;
    if (c.field === 'duration') {
      return html`<div className="row">
        <${Input} value=${c.value} onChange=${(v) => setCond(c.id, { value: v })} placeholder="输入数值" invalid=${logsCondState(c) === 'invalid'} onKeyDown=${(e) => { if (e.key === 'Enter') apply(); }} />
        <${Select} width=${90} value=${LOGS_DURATION_UNITS[c.unit] ? c.unit : '秒'} onChange=${(v) => setCond(c.id, { unit: v })} options=${Object.keys(LOGS_DURATION_UNITS).map((x) => ({ value: x, label: x }))} />
      </div>`;
    }
    if (c.field === 'bizkey') return html`<${Input} value=${c.value} onChange=${(v) => setCond(c.id, { value: v })} placeholder="输入工号、审批单号、姓名，可以只输一部分" onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) apply(); }} />`;
    return html`<${Input} value=${c.value} onChange=${(v) => setCond(c.id, { value: v })} placeholder="匹配运行 ID、工作流名称、去重键或错误信息" onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) apply(); }} />`;
  };
  const opControl = (c) => {
    if (c.field === 'duration') return html`<${Select} width=${90} value=${LOGS_DURATION_OPS.includes(c.op) ? c.op : '大于'} onChange=${(v) => setCond(c.id, { op: v })} options=${LOGS_DURATION_OPS.map((x) => ({ value: x, label: x }))} />`;
    return html`<span className="logs-fixed is-center" style=${{ width: 90 }}>${c.field === 'content' || c.field === 'bizkey' ? '包含' : '等于'}</span>`;
  };
  const hint = (c) => {
    const st = logsCondState(c);
    if (st === 'ok') return null;
    return html`<div className="logs-cond-hint">${st === 'invalid' ? '请输入不小于 0 的数字，否则查询时将忽略此条件' : '未填写，查询时将忽略此条件'}</div>`;
  };
  return html`<div className="filter-panel">
    <div className="filter-head">
      <span>设置筛选条件</span>
      <span className="spacer" />
      <span className="text-xs muted">符合以下</span>
      <${Select} size="sm" width=${76} value=${draft.match} onChange=${(v) => setDraft((d) => ({ ...d, match: v }))} options=${[{ value: 'all', label: '全部' }, { value: 'any', label: '任一' }]} />
      <span className="text-xs muted">条件</span>
    </div>
    ${draft.match === 'any' && html`<div className="logs-filter-note">时间条件始终生效，其余条件满足任一即可。</div>`}
    ${draft.conds.map((c) => html`<div key=${c.id} className="filter-row">
      ${c.field === 'time'
        ? html`<span className="logs-fixed" style=${{ width: 128 }}><${Icon} name="Clock" size=${14} />时间</span>`
        : html`<${Select} width=${128} value=${c.field} onChange=${(v) => { if (v !== c.field) setCond(c.id, { field: v, value: ['content', 'duration', 'bizkey'].includes(v) ? '' : [], op: v === 'duration' ? '大于' : undefined, unit: v === 'duration' ? '秒' : undefined }); }} options=${fields.map((f) => ({ value: f.value, label: f.label, icon: f.icon, disabled: f.value !== c.field && used.includes(f.value) }))} />`}
      ${opControl(c)}
      <div className="grow">${valueControl(c)}${hint(c)}</div>
      ${c.field === 'time' ? html`<span className="logs-row-spacer" />` : html`<${IconButton} icon="X" size="sm" title="删除条件" onClick=${() => removeCond(c.id)} />`}
    </div>`)}
    ${adding
      ? html`<div className="filter-row">
        <${Select} width=${128} value=${null} placeholder="选择字段" onChange=${addCond} options=${addable.map((f) => ({ value: f.value, label: f.label, icon: f.icon }))} />
        <span className="grow text-xs muted logs-add-tip">选择要筛选的字段</span>
        <${IconButton} icon="X" size="sm" title="取消添加" onClick=${() => setAdding(false)} />
      </div>`
      : addable.length > 0 && html`<div><${Button} size="sm" variant="ghost" icon="Plus" onClick=${() => setAdding(true)}>添加筛选条件<//></div>`}
    <div className="filter-foot">
      <span className="text-xs muted grow">${pending > 0 ? `有 ${pending} 个条件未填写完整，查询时将被忽略` : `只能查询 ${options.retention} 天内的日志`}</span>
      <${Button} onClick=${onCancel}>取消<//>
      <${Button} variant="primary" onClick=${apply}>查询<//>
    </div>
  </div>`;
}

function LogsPage() {
  const state = useStore();
  const route = useRoute();
  const query = route.query;
  const filterKey = ['project', 'workflow', 'status', 'env', 'time'].map((k) => query[k] || '').join('|');
  const [seenKey, setSeenKey] = useState(filterKey);
  const [filter, setFilter] = useState(() => logsInitialFilter(query, state));
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jump, setJump] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [selected, setSelected] = useState([]);
  const [replay, setReplay] = useState(null);
  const [typeTab, setTypeTab] = useState(() => {
    const r = query.run && state.runs.find((x) => x.id === query.run);
    return r && r.kind === 'debug' ? 'debug' : 'run';
  });
  const refreshTimer = useRef(null);
  const lastRunId = useRef(null);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setFilter(logsInitialFilter(query, state));
    setPage(1);
    setFilterOpen(false);
    setSelected([]);
  }
  const memberPids = useMemo(() => logsMemberProjectIds(state), [state.members, state.me]);
  const visible = useMemo(() => logsVisibleRuns(state), [state.runs, state.members, state.me, state.privacy]);
  const retention = logsRetentionInfo(state);
  const detailRun = query.run ? visible.find((r) => r.id === query.run) || null : null;
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  useEffect(() => {
    if (detailRun && typeTab !== 'all' && detailRun.kind !== typeTab) setTypeTab(detailRun.kind);
  }, [query.run]);
  if (detailRun) lastRunId.current = detailRun.id;
  const drawerRun = detailRun || (lastRunId.current && visible.find((r) => r.id === lastRunId.current)) || null;
  const runs = useMemo(
    () => logsApplyFilter(visible.filter((r) => typeTab === 'all' || r.kind === typeTab), filter, state),
    [visible, typeTab, filter, refreshedAt, state.workflows, state.versions, state.connections],
  );
  const stagedPids = useMemo(() => new Set([...memberPids].filter((pid) => isStagedProject(state, pid))), [memberPids, state.projects, state.configGroups]);
  const options = useMemo(() => {
    const liveIds = new Set(state.workflows.map((w) => w.id));
    const deleted = [...new Set(visible.filter((r) => !liveIds.has(r.workflowId)).map((r) => r.workflowId))];
    const mine = state.workflows.filter((w) => memberPids.has(w.projectId));
    const scopeIds = new Set([...mine.map((w) => w.id), ...deleted]);
    const graphs = [
      ...mine,
      ...state.versions.filter((v) => scopeIds.has(v.workflowId) && v.snapshot).map((v) => v.snapshot),
      ...visible.filter((r) => r.graph).map((r) => r.graph),
    ];
    const connectorIds = [...new Set(graphs.flatMap((g) => allNodes(g).flatMap((node) => logsNodeConnectors(node, state))))];
    const projectName = (pid) => (state.projects.find((p) => p.id === pid) || {}).name || '';
    return {
      projects: state.projects.filter((p) => memberPids.has(p.id)).map((p) => ({ value: p.id, label: p.name })),
      workflows: [
        ...mine.map((w) => ({ value: w.id, label: w.name, desc: projectName(w.projectId) })),
        ...(deleted.length ? [{ group: '已删除的工作流' }, ...deleted.map((id) => ({ value: id, label: '已删除的工作流', desc: id }))] : []),
      ],
      statuses: LOGS_RUN_STATUSES.map((s) => ({ value: s, label: RUN_STATUS[s].label, desc: s === 'deduped' ? '触发器去重拦下的重复事件，没有执行' : undefined })),
      envs: stagedPids.size ? Object.entries(LOGS_ENVS).map(([value, label]) => ({ value, label })) : [],
      connectors: connectorIds.map((id) => resolveConnector(id)).filter((c) => c && !c.builtin).map((c) => ({ value: c.id, label: c.name, iconNode: html`<${ConnectorIcon} connector=${c} size=${16} />` })),
      retention: retention.max,
    };
  }, [state.projects, state.workflows, state.versions, state.connections, visible, memberPids, stagedPids, retention.max]);
  const pages = Math.max(1, Math.ceil(runs.length / pageSize));
  const curPage = Math.min(page, pages);
  const pageRuns = runs.slice((curPage - 1) * pageSize, curPage * pageSize);
  const eff = logsEffectiveFilter(filter);
  const picked = selected.filter((id) => pageRuns.some((r) => r.id === id));
  const replayable = picked.filter((id) => { const r = pageRuns.find((x) => x.id === id); return r && r.kind === 'run' && ['failed', 'timeout'].includes(r.status); });
  const openRun = (id) => navigate(`/logs?${new URLSearchParams({ ...query, run: id }).toString()}`);
  const closeRun = () => {
    const q = { ...query };
    delete q.run;
    navigate(`/logs${Object.keys(q).length ? `?${new URLSearchParams(q).toString()}` : ''}`);
  };
  const turnPage = (n) => { setPage(n); setSelected([]); };
  const removeCond = (id) => { setFilter((f) => ({ ...f, conds: f.conds.filter((c) => c.id !== id) })); turnPage(1); };
  const clearConds = () => { setFilter((f) => ({ match: 'all', conds: f.conds.filter((c) => c.field === 'time').slice(0, 1), ignored: [] })); turnPage(1); };
  const refresh = () => {
    setRefreshing(true);
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { setRefreshing(false); setRefreshedAt(Date.now()); toast.success('已刷新'); }, 500);
  };
  const goJump = () => {
    const n = parseInt(jump, 10);
    if (n > 0) turnPage(Math.min(pages, n));
    setJump('');
  };
  const wfName = (r) => {
    const wf = state.workflows.find((w) => w.id === r.workflowId);
    return wf ? wf.name : null;
  };
  const admin = issuesCanManageAlerts(state);
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="运行日志"
      description="查看所有工作流的运行记录，定位失败原因并重跑"
      actions=${html`<${Tooltip} content="到期的日志会自动清理，敏感字段在写入日志前已脱敏">
        ${admin
          ? html`<${Link} to="/admin/privacy" className="logs-retention is-link"><${Icon} name="Archive" size=${14} />${retention.text}<//>`
          : html`<span className="logs-retention"><${Icon} name="Archive" size=${14} />${retention.text}</span>`}
      <//>`}
    />
    ${query.run && !detailRun && html`<div className="logs-missing"><${Alert} tone="warning" title="未找到这条日志" onClose=${closeRun}>运行记录 ${query.run} 不存在、你没有所属项目的访问权限，或已超过 ${retention.max} 天的保留期限。<//></div>`}
    <div className="toolbar">
      <${Popover}
        placement="bottom-start"
        width=${640}
        open=${filterOpen}
        onOpenChange=${setFilterOpen}
        trigger=${html`<button type="button" className=${cx('filter-pill', eff.active.length > 0 && 'is-active')}>${eff.active.length > 0 ? html`<span className="filter-count">${eff.active.length + 1}</span>` : html`<${Icon} name="ListFilter" size=${14} />`}筛选</button>`}
      >
        <${LogsFilterPanel} filter=${filter} options=${options} onCancel=${() => setFilterOpen(false)} onApply=${(f) => { setFilter({ ...f, ignored: [] }); setFilterOpen(false); turnPage(1); }} />
      <//>
      <span className="vdivider logs-toolbar-divider" />
      <${Button} icon="RefreshCw" loading=${refreshing} onClick=${refresh}>刷新<//>
      <span className="spacer" />
      <${Segmented} value=${typeTab} onChange=${(v) => { setTypeTab(v); turnPage(1); }} options=${[{ value: 'run', label: '运行日志' }, { value: 'debug', label: '调试日志' }, { value: 'all', label: '全部' }]} />
    </div>
    <div className="cond-summary">
      ${eff.match === 'any'
        ? html`<${Fragment}><${Tag} tone="outline">${eff.time.label}日志<//><span className="muted">中，符合任一筛选条件：</span><//>`
        : html`<${Fragment}><span className="muted">符合全部筛选条件：</span><${Tag} tone="outline">${eff.time.label}日志<//><//>`}
      ${eff.active.map((c) => html`<${Tag} key=${c.id} tone="outline" title=${logsCondLabel(c, state)} onClose=${() => removeCond(c.id)}><span className="logs-cond-text">${logsCondLabel(c, state)}</span><//>`)}
      ${eff.pending > 0 && html`<span className="text-xs muted">另有 ${eff.pending} 个条件未填写完整，未生效</span>`}
      ${(filter.ignored || []).length > 0 && html`<span className="text-xs muted">链接中的「${filter.ignored.join('、')}」参数无效，已忽略</span>`}
      ${(eff.active.length > 0 || eff.pending > 0) && html`<button type="button" className="link text-xs" onClick=${clearConds}>清除条件</button>`}
    </div>
    ${picked.length > 0 && html`<div className="logs-bulk" role="region" aria-label="批量操作">
      <span>已选 <b>${picked.length}</b> 条日志</span>
      <span className="text-xs muted">${replayable.length ? `其中 ${replayable.length} 条运行失败或超时，可以重跑` : '所选日志里没有失败或超时的运行'}</span>
      <span className="spacer" />
      <${Button} size="sm" variant="primary" icon="RotateCcw" disabled=${!replayable.length} onClick=${() => setReplay({ ids: replayable, mode: 'node' })}>批量重跑<//>
      <${Button} size="sm" variant="ghost" onClick=${() => setSelected([])}>取消选择<//>
    </div>`}
    <${Table}
      className="logs-table"
      loading=${refreshing}
      selectable
      selected=${picked}
      onSelect=${setSelected}
      columns=${[
        { key: 'time', title: '日志产生时间', width: 158, render: (r) => fmt.dateTime(r.startedAt) },
        { key: 'wf', title: '工作流名称', render: (r) => { const name = wfName(r); return html`<a className=${cx('link', 'logs-wf-cell', !name && 'is-deleted')} title=${name || `已删除的工作流（${r.workflowId}）`} onClick=${(e) => { e.stopPropagation(); openRun(r.id); }}>${name || '已删除的工作流'}</a>`; } },
        { key: 'biz', title: '业务标识', width: 168, render: (r) => html`<${LogsBizCell} run=${r} />` },
        { key: 'project', title: '所属项目', width: 116, render: (r) => { const p = state.projects.find((x) => x.id === r.projectId); return p ? html`<span className="row-4 logs-project-cell"><${ProjectAvatar} project=${p} size=${18} /><span className="logs-wf-cell">${p.name}</span></span>` : html`<span className="muted">-</span>`; } },
        { key: 'env', title: '环境', width: 64, render: (r) => (stagedPids.has(r.projectId) ? html`<${Tag} size="sm" tone=${r.env === 'test' ? 'info' : 'outline'}>${r.env === 'test' ? '测试' : '生产'}<//>` : html`<span className="muted text-xs">生产</span>`) },
        { key: 'kind', title: '类型', width: 116, render: (r) => html`<span className="row-4">${r.kind === 'debug' ? '调试日志' : '运行日志'}${r.retryBy && html`<${Tooltip} content=${`${personName(r.retryBy)} ${logsReplayLabel(r)}生成`}><${Tag} size="sm" icon="RotateCcw">重跑<//><//>`}</span>` },
        { key: 'ver', title: '发布版本', width: 76, render: (r) => (r.kind === 'debug' ? html`<span className="muted">草稿</span>` : `v${r.version}`) },
        { key: 'status', title: '运行状态', width: 104, render: (r) => html`<${RunStatusDot} status=${r.status} />` },
        { key: 'dur', title: '运行时长', width: 88, align: 'right', render: (r) => (r.duration == null ? html`<span className="muted">-</span>` : fmt.duration(r.duration)) },
        { key: 'err', title: '错误数', width: 64, align: 'right', render: (r) => (r.errors ? html`<a className="link" onClick=${(e) => { e.stopPropagation(); openRun(r.id); }}>${r.errors}</a>` : 0) },
        { key: 'op', title: '操作', width: 118, render: (r) => {
          const failed = ['failed', 'timeout'].includes(r.status) && r.kind === 'run';
          const block = failed ? logsReplayBlock(r, state) : null;
          return html`<span className="row" onClick=${(e) => e.stopPropagation()}>
            <a className="link" onClick=${() => openRun(r.id)}>日志详情</a>
            ${failed && (block
              ? html`<${Tooltip} content=${block}><span className="logs-link-disabled" aria-disabled="true">重跑</span><//>`
              : html`<a className="link" onClick=${() => setReplay({ ids: [r.id], mode: 'node' })}>重跑</a>`)}
          </span>`;
        } },
      ]}
      data=${pageRuns}
      onRowClick=${(r) => openRun(r.id)}
      empty=${html`<${Empty} icon="ScrollText" title="暂无符合条件的日志" description="试试放宽时间范围，或清除部分筛选条件。" />`}
    />
    <${Pagination}
      page=${curPage}
      pageSize=${pageSize}
      total=${runs.length}
      onChange=${(n) => turnPage(Math.min(pages, Math.max(1, n)))}
      onPageSizeChange=${(n) => { setPageSize(n); turnPage(1); }}
      extra=${html`<${Fragment}>
        <span className="muted text-xs">跳至</span>
        <${Input} size="sm" style=${{ width: 56 }} value=${jump} onChange=${(v) => setJump(v.replace(/\D/g, '').slice(0, 4))} onKeyDown=${(e) => { if (e.key === 'Enter') goJump(); }} />
        <span className="muted text-xs">页</span>
      <//>`}
    />
    <${LogsRunDrawer} run=${drawerRun} open=${Boolean(detailRun)} onClose=${closeRun} onReplay=${(r, mode) => setReplay({ ids: [r.id], mode })} onOpenRun=${openRun} />
    <${ReplayModal}
      open=${Boolean(replay)}
      runIds=${replay ? replay.ids : []}
      mode=${replay ? replay.mode : 'node'}
      state=${state}
      onClose=${() => setReplay(null)}
      onDone=${(made, opts) => { setSelected([]); if (opts && opts.jump && made[0]) openRun(made[0].id); }}
    />
  </div></div>`;
}

function LogsDedupeNotice({ run, wf, state, onOpenRun }) {
  const d = wf && wf.trigger && wf.trigger.runSettings && wf.trigger.runSettings.dedupe;
  const orig = state.runs.find((r) => r.id === run.dedupeOf);
  const edit = wf && canEditProject(state, wf.projectId);
  const settings = wf ? `/integration/${wf.projectId}/wf/${wf.id}?${new URLSearchParams({ ...(edit ? { mode: 'edit' } : {}), node: wf.trigger.id, tab: 'run' }).toString()}` : null;
  return html`<${Alert}
    tone="info"
    icon="CopyX"
    title="这次触发被去重，没有执行"
    action=${html`<div className="row">
      ${orig && html`<${Button} size="sm" onClick=${() => onOpenRun(orig.id)}>查看首次处理的运行<//>`}
      ${settings && html`<${Button} size="sm" variant="ghost" iconRight="ArrowUpRight" onClick=${() => navigate(settings)}>去重设置<//>`}
    </div>`}
  >
    去重键 <code className="logs-code">${d ? d.key : '去重键'}</code> 的值 <b>${run.dedupeKey || '-'}</b> 和${orig ? html`<a className="link" onClick=${() => onOpenRun(orig.id)}>${fmt.dateTime(orig.startedAt)} 的运行</a>` : `${run.dedupeOf || '更早的运行'}`}相同。${d ? `${LOGS_WINDOW_LABEL[d.window] || d.window}内` : '去重窗口内'}同一个键只处理一次，所以这次没有执行任何节点，也不会产生重复数据。
  <//>`;
}

function LogsRunDrawer({ run, open, onClose, onReplay, onOpenRun }) {
  const state = useStore();
  const [sel, setSel] = useState(null);
  const [view, setView] = useState('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kw, setKw] = useState('');
  const [ioTab, setIoTab] = useState('Input');
  const [stopOpen, setStopOpen] = useState(false);
  const [stopSub, setStopSub] = useState(true);
  const [collapsed, setCollapsed] = useState([]);
  const [focus, setFocus] = useState({ id: null, tick: 0 });
  const [zoom, setZoom] = useState(false);
  const [revealed, setRevealed] = useState([]);
  const [revealAsk, setRevealAsk] = useState(false);
  const canvasApi = useRef(null);
  const skipFit = useRef(false);
  const runId = run ? run.id : null;
  const wf = run ? state.workflows.find((w) => w.id === run.workflowId) || null : null;
  const g = useMemo(() => {
    if (!run) return null;
    const graph = logsRunGraph(run, wf, state);
    return graph ? { ...(wf || { id: run.workflowId, projectId: run.projectId, name: '已删除的工作流', status: 'disabled' }), ...graph } : null;
  }, [run, wf, state.versions]);
  const trace = useMemo(() => (run && g ? buildRunTrace(run, g) : []), [run, g]);
  const refs = useMemo(() => (g ? nodeRefs(g) : {}), [g]);
  const issue = useMemo(() => (run && run.failure ? issuesCollect(state).find((i) => i.sig === issueSignature(run)) || null : null), [run, state.runs, state.issueStates, state.connections, state.workflows, state.privacy]);
  const errorsList = trace.filter((t) => ['failed', 'timeout'].includes(t.status));
  const current = trace.find((t) => t.node.id === sel) || errorsList[0] || trace.find((t) => ['running', 'waiting', 'stopped', 'deduped'].includes(t.status)) || (run && run.pendingApproval ? trace.find((t) => t.node.id === run.pendingApproval.nodeId) : null) || trace[0] || null;
  const currentId = current ? current.node.id : null;
  useEffect(() => { setSel(null); setView('list'); setKw(''); setStatusFilter('all'); setCollapsed([]); setStopOpen(false); setZoom(false); setRevealed([]); setRevealAsk(false); }, [runId]);
  useEffect(() => { setIoTab(current && ['failed', 'timeout'].includes(current.status) ? 'Error' : current && current.status === 'reused' ? 'Output' : 'Input'); }, [runId, currentId]);
  useEffect(() => {
    if (view !== 'canvas') return;
    if (skipFit.current) { skipFit.current = false; return; }
    if (canvasApi.current) canvasApi.current.fit();
  }, [view, runId]);
  if (!run) return html`<${Drawer} open=${false} onClose=${onClose} />`;
  const project = state.projects.find((p) => p.id === run.projectId);
  const failedRun = ['failed', 'timeout'].includes(run.status) && run.kind === 'run';
  const replayBlock = failedRun ? logsReplayBlock(run, state) : null;
  const canReplay = failedRun && !replayBlock;
  const nodeBlock = replayBlock || (run.failedNodeId ? null : '这条日志没有记录失败节点，只能整体重跑');
  const retries = state.runs.filter((r) => r.retryOf === run.id).sort((a, b) => b.startedAt - a.startedAt);
  const canEdit = canEditProject(state, run.projectId);
  const staged = isStagedProject(state, run.projectId);
  const runState = Object.fromEntries(trace.map((t) => [t.node.id, t.status]));
  const presentStatuses = LOGS_NODE_STATUSES.filter((s) => trace.some((t) => t.status === s));
  const kws = kw.split(/[,，]/).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const items = trace.filter((t) => (statusFilter === 'all' || t.status === statusFilter) && (!kws.length || kws.some((k) => `${t.node.name}${refs[t.node.id] || ''}`.toLowerCase().includes(k))));
  const errIdx = errorsList.findIndex((t) => t.node.id === currentId);
  const privacy = state.privacy || {};
  const level = privacy.payloadLevel || 'full';
  const canReveal = logsCanReveal(state);
  const isRevealed = Boolean(current && revealed.includes(current.node.id));
  const notRun = current && ['pending', 'skipped', 'deduped'].includes(current.status) && !(current.status === 'deduped' && ioTab === 'Output');
  const erasure = (privacy.erasureRequests || []).find((e) => e.status === 'done' && (e.runIds || []).includes(run.id));
  const unrecorded = (level !== 'full' || Boolean(erasure)) && ioTab !== 'Error';
  const rawIo = current && (ioTab === 'Input' ? current.input || {} : ioTab === 'Output' ? current.output : current.error);
  const masked = current && rawIo && ioTab !== 'Error' ? maskDeep(rawIo, privacy, { all: Boolean(current.node.sensitive) && ioTab === 'Output' }) : { value: rawIo, count: 0 };
  const io = isRevealed ? rawIo : masked.value;
  const maskAll = (v) => (v == null || isRevealed ? v : maskDeep(v, privacy, { all: Boolean(current && current.node.sensitive) }).value);
  const nodes = g ? allNodes(g) : [];
  const collapsibleIds = nodes.filter((n) => countDescendants(n) > 0).map((n) => n.id);
  const callsSubflow = nodes.some((n) => n.connector === 'subflows' && n.op === 'call');
  const snapshot = run.kind === 'run' && state.versions.some((v) => v.workflowId === run.workflowId && v.version === run.version);
  const err = current && current.error;
  const errConnId = err && String(err.code || '').startsWith('CONNECTION_') ? (err.connectionId || logsNodeConnectionId(current.node)) : null;
  const errConn = errConnId ? state.connections.find((c) => c.id === errConnId) : null;
  const startNode = run.startNodeId && g ? findInWorkflow(g, run.startNodeId) : null;
  const agentSteps = current && current.node.kind === 'agent' ? logsAgentSteps(current.node, current.output, run) : [];
  const approvalNode = run.pendingApproval && g ? findInWorkflow(g, run.pendingApproval.nodeId) : null;
  const locate = (id) => {
    if (view !== 'canvas') skipFit.current = true;
    setSel(id);
    setView('canvas');
    setFocus((f) => ({ id, tick: f.tick + 1 }));
  };
  const share = () => {
    if (copyText(`https://${state.tenant.domain}/logs?run=${run.id}`)) toast.success('日志链接已复制');
    else toast.error('复制失败，请手动复制地址栏中的链接');
  };
  const copyIo = () => {
    if (copyText(JSON.stringify(io ?? null, null, 2))) toast.success(isRevealed ? '已复制原文到剪贴板' : '已复制到剪贴板（脱敏后）');
    else toast.error('复制失败，请手动选中复制');
  };
  const stopRun = () => {
    const idx = trace.findIndex((t) => ['running', 'waiting'].includes(t.status));
    patchList('runs', run.id, { status: 'stopped', duration: Math.max(0, Date.now() - run.startedAt), stoppedBy: state.me, ...(idx > 0 ? { stopIndex: idx } : {}) });
    Store.set((s) => ({ ...s, notifications: s.notifications.map((n) => (n.to === `/logs?run=${run.id}` ? { ...n, read: true } : n)) }));
    addAudit(callsSubflow && stopSub ? '终止运行（含子流程）' : '终止运行', run.id, run.projectId);
    setStopOpen(false);
    toast.success('已终止运行');
  };
  const reveal = (reason) => {
    if (!current || !canReveal) return;
    const node = current.node;
    setRevealed((ids) => [...ids, node.id]);
    setRevealAsk(false);
    addAudit('查看日志原文', run.id, run.projectId);
    Store.set((s) => ({ ...s, auditLogs: s.auditLogs.map((a, i) => (i === 0 && a.action === '查看日志原文' && a.resource === run.id ? { ...a, detail: `节点「${node.name}」${reason ? `，原因：${reason}` : ''}` } : a)) }));
    toast.success('已显示这个节点的原文，本次查看已写入审计日志');
  };
  const askReveal = () => {
    if (!canReveal) return;
    if (privacy.requireReason) setRevealAsk(true);
    else reveal('');
  };
  const title = html`<span className="row logs-drawer-title">
    <span className="nowrap">${fmt.dateTime(run.startedAt).slice(0, 16)}</span>
    <span className="muted">|</span>
    <span className=${cx('logs-wf-cell', !wf && 'is-deleted')}>${wf ? wf.name : '已删除的工作流'}</span>
    <${Tag} size="sm" tone="primary">${run.kind === 'debug' ? '调试' : '工作流'}<//>
    ${staged && run.kind === 'run' && html`<${Tag} size="sm" tone=${run.env === 'test' ? 'info' : 'outline'}>${LOGS_ENVS[run.env || 'prod']}<//>`}
  </span>`;
  const ioEmpty = () => {
    if (current.status === 'deduped') return '被去重的触发没有执行节点';
    if (['pending', 'skipped'].includes(current.status)) return '该节点未执行';
    if (ioTab === 'Output' && ['running', 'waiting'].includes(current.status)) return current.status === 'waiting' ? '节点等待中，尚未输出' : '节点运行中，尚未输出';
    if (ioTab === 'Error') return '没有错误';
    if (ioTab === 'Output') return '该节点没有输出';
    return null;
  };
  const emptyText = current ? ioEmpty() : null;
  const showJson = Boolean(current && io && !notRun && !unrecorded);
  const maskChip = current && !unrecorded && ioTab !== 'Error' && io && !notRun && (masked.count > 0 || isRevealed);
  return html`<${Drawer}
    open=${open}
    onClose=${onClose}
    width=${Math.min(1240, Math.round(window.innerWidth * 0.82))}
    title=${title}
    className="logs-drawer"
    subtitle=${html`<span className="row logs-drawer-sub">
      <${RunStatusDot} status=${run.status} />
      <span>耗时：${run.duration == null ? RUN_STATUS[run.status].label : fmt.duration(run.duration)}</span>
      ${run.bizKey && html`<span className="row-4"><span className="muted">${run.bizKey.label}</span><span className="mono">${run.bizKey.value}</span>${run.bizKey.name && html`<span>${run.bizKey.name}</span>`}<a className="link" onClick=${() => { onClose(); navigate(`/logs?biz=${encodeURIComponent(run.bizKey.value)}`); }}>这条记录的全部日志</a></span>`}
      ${run.retryBy && html`<span>${personName(run.retryBy)} ${logsReplayLabel(run)}生成</span>`}
      ${run.retryOf && html`<a className="link" onClick=${() => onOpenRun(run.retryOf)}>查看原日志</a>`}
      ${retries.length > 0 && html`<a className="link" onClick=${() => onOpenRun(retries[0].id)}>已重跑 ${retries.length} 次，查看最近一次</a>`}
      ${issue && html`<a className="link" onClick=${() => navigate(`/issues/${encodeURIComponent(issue.sig)}`)}>所属问题（累计 ${issue.count} 次）</a>`}
      <${Popover} placement="bottom-start" width=${340} trigger=${html`<button type="button" className="link text-xs">运行信息</button>`}>
        <div className="debug-info logs-run-info">
          <div><span className="muted">运行 ID：</span><span className="mono">${run.id}</span></div>
          <div><span className="muted">开始时间：</span>${fmt.dateTime(run.startedAt)}</div>
          <div><span className="muted">结束时间：</span>${run.duration == null ? '-' : fmt.dateTime(run.startedAt + run.duration)}</div>
          <div><span className="muted">触发方式：</span>${run.triggerType}${run.retryBy ? `（${personName(run.retryBy)} ${logsReplayLabel(run)}生成）` : ''}</div>
          <div><span className="muted">所属项目：</span>${project ? project.name : '-'}</div>
          ${run.kind === 'run' && html`<div><span className="muted">运行环境：</span>${LOGS_ENVS[run.env || 'prod']}</div>`}
          <div><span className="muted">发布版本：</span>${run.kind === 'debug' ? '草稿（调试）' : `v${run.version}`}${wf && snapshot && html`<a className="link logs-inline-link" onClick=${() => navigate(`/integration/${wf.projectId}/wf/${wf.id}/v/${run.version}`)}>查看版本快照</a>`}</div>
          ${run.status === 'deduped' && html`<div><span className="muted">去重键：</span><span className="mono">${run.dedupeKey || '-'}</span></div>`}
          ${run.kind === 'debug' && html`<div><span className="muted">配置组：</span>${run.group || '默认值'}</div>`}
          ${run.kind === 'debug' && run.by && html`<div><span className="muted">调试人：</span>${personName(run.by)}</div>`}
          ${run.status === 'stopped' && run.stoppedBy && html`<div><span className="muted">终止人：</span>${personName(run.stoppedBy)}</div>`}
        </div>
      <//>
    </span>`}
    extra=${html`<div className="row">
      ${failedRun && html`<${Fragment}>
        <${Tooltip} content=${nodeBlock || '前面成功的节点沿用原结果，不会重复执行'}><${Button} size="sm" variant=${nodeBlock ? 'outline' : 'primary'} icon="SkipForward" disabled=${Boolean(nodeBlock)} onClick=${() => onReplay(run, 'node')}>从失败节点重跑<//><//>
        <${Tooltip} content=${replayBlock || '从触发器开始重新执行整个工作流'}><${Button} size="sm" icon="RotateCcw" disabled=${!canReplay} onClick=${() => onReplay(run, 'full')}>整体重跑<//><//>
      <//>`}
      ${['running', 'waiting'].includes(run.status) && html`<${Tooltip} content=${canEdit ? '' : '你在所属项目中只有查看权限'}><${Button} size="sm" variant="danger-outline" icon="CircleStop" disabled=${!canEdit} onClick=${() => setStopOpen(true)}>终止运行<//><//>`}
      <${Button} size="sm" icon="Share2" onClick=${share}>分享<//>
      ${wf && html`<${Button} size="sm" icon="SquarePen" onClick=${() => navigate(`/integration/${wf.projectId}/wf/${wf.id}`)}>打开工作流<//>`}
    </div>`}
    bodyClassName="run-detail-body"
  >
    ${(run.pendingApproval || run.status === 'deduped') && html`<div className="logs-banners">
      ${run.pendingApproval && html`<${LogsApprovalCard} run=${run} state=${state} nodeName=${approvalNode ? approvalNode.name : 'AI 智能体'} />`}
      ${run.status === 'deduped' && html`<${LogsDedupeNotice} run=${run} wf=${wf} state=${state} onOpenRun=${onOpenRun} />`}
    </div>`}
    ${!g
      ? html`<${Empty} icon="FileX" title="无法还原节点详情" description="工作流已删除，且这条日志没有保存运行时的流程快照。" />`
      : html`<${Fragment}>
        <div className="run-detail-bar">
          <${Segmented} size="sm" value=${view} onChange=${setView} options=${[{ value: 'list', label: '节点列表', icon: 'List' }, { value: 'canvas', label: '流程画布', icon: 'Workflow' }]} />
          <span className="text-xs muted">${run.kind === 'debug' ? '展示调试时的草稿' : `展示本次运行的 v${run.version} 版本`}${startNode ? `，从「${startNode.name}」开始重跑` : ''}</span>
          <span className="spacer" />
          ${errorsList.length > 0 && html`<span className="row-4 text-xs">
            <span className="logs-error-count">存在 ${errorsList.length} 个错误节点</span>
            <${Button} size="xs" variant="ghost" icon="ChevronUp" disabled=${errIdx <= 0} onClick=${() => setSel(errorsList[Math.max(0, errIdx - 1)].node.id)}>上一个错误<//>
            <${Button} size="xs" variant="ghost" icon="ChevronDown" disabled=${errIdx >= errorsList.length - 1} onClick=${() => setSel(errorsList[Math.min(errorsList.length - 1, errIdx + 1)].node.id)}>下一个错误<//>
          </span>`}
          <${Select} size="sm" width=${150} value=${statusFilter} onChange=${setStatusFilter} options=${[{ value: 'all', label: '节点状态：全部' }, ...presentStatuses.map((s) => ({ value: s, label: `${RUN_STATUS[s].label}（${trace.filter((t) => t.status === s).length}）` }))]} />
          <${Input} size="sm" icon="Search" placeholder="搜索节点名称或 ID，逗号分隔" value=${kw} onChange=${setKw} allowClear style=${{ width: 220 }} />
        </div>
        <div className=${cx('run-detail-grid', view === 'canvas' && 'is-canvas')}>
          ${view === 'list'
            ? html`<div className="debug-list">
              ${items.map((t) => html`<button key=${t.node.id} type="button" className=${cx('debug-item', currentId === t.node.id && 'is-active', t.status === 'reused' && 'logs-item-reused')} onClick=${() => { setSel(t.node.id); setIoTab(['failed', 'timeout'].includes(t.status) ? 'Error' : t.status === 'reused' ? 'Output' : 'Input'); }}>
                <${NodeIcon} node=${t.node} size=${26} />
                <div className="debug-item-body"><div className="debug-item-name">${t.node.name}</div><div className="debug-item-ref">${refs[t.node.id] || ''}${t.status === 'reused' ? ' · 沿用原结果' : t.duration != null ? ` · ${fmt.duration(t.duration)}` : ''}</div></div>
                <span className=${cx('status-ic', `tone-${RUN_STATUS[t.status].tone}`)} title=${RUN_STATUS[t.status].label}><${Icon} name=${RUN_STATUS[t.status].icon} size=${15} className=${t.status === 'running' ? 'spin' : ''} /></span>
              </button>`)}
              ${items.length === 0 && html`<div className="text-xs muted logs-list-empty">没有符合条件的节点</div>`}
            </div>`
            : html`<div className="run-canvas"><${FlowCanvas}
              wf=${g}
              fitKey=${run.id}
              ctx=${{
                editing: false, state, selectedId: currentId, selectedBranch: null, runState, issuesByNode: {}, highlightId: null,
                linking: null, searchIds: null, collapsed, takenBranches: trace.flatMap((t) => t.meta.branchIds || []),
                focusId: focus.id, focusTick: focus.tick, leftInset: 0, rightInset: 0, canvasApi,
                onSelect: (id) => setSel(id),
                onCollapseAll: (all) => setCollapsed(all ? collapsibleIds : []),
                onToggleCollapse: (id) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])),
              }}
            /></div>`}
          ${current && html`<div className="debug-detail">
            <div className="debug-detail-head">
              <${NodeIcon} node=${current.node} size=${30} />
              <div className="grow"><div className="logs-node-name">${current.node.name}</div><div className="text-xs muted mono">${refs[current.node.id] || ''}</div></div>
              ${current.node.sensitive && html`<${Tooltip} content="节点被标记为敏感，出参在日志里全部脱敏"><${Tag} size="sm" tone="warning" icon="EyeOff">敏感节点<//><//>`}
              <${RunStatusTag} status=${current.status} size="sm" />
              <${IconButton} icon="LocateFixed" size="sm" title="在画布中定位" onClick=${() => locate(current.node.id)} />
            </div>
            <div className="debug-times">
              ${current.status === 'reused'
                ? html`<div>没有重新执行，耗时 0 ms</div>`
                : ['running', 'waiting'].includes(current.status)
                  ? html`<${Fragment}>
                    <div>开始时间：${fmt.dateTime(current.startedAt)}</div>
                    <div>结束时间：-</div>
                    <div>${current.status === 'waiting' ? '已等待' : '已运行'}：${fmt.duration(Math.max(0, Date.now() - current.startedAt))}</div>
                  <//>`
                  : html`<${Fragment}>
                    <div>开始时间：${['pending', 'skipped'].includes(current.status) ? '-' : fmt.dateTime(current.startedAt)}</div>
                    <div>结束时间：${current.duration != null ? fmt.dateTime(current.startedAt + current.duration) : '-'}</div>
                    <div>运行时长：${current.duration != null ? fmt.duration(current.duration) : '-'}</div>
                  <//>`}
              ${current.meta.branch && html`<div>命中分支：${current.meta.branch}</div>`}
              ${current.meta.iterations && html`<div>循环次数：${current.meta.iterations}</div>`}
            </div>
            ${current.status === 'reused' && html`<div className="logs-reused"><${Alert} tone="info" icon="History" title="沿用原结果">
              本次从「${startNode ? startNode.name : '失败节点'}」开始重跑，这个节点没有重新执行，输出沿用${run.retryOf ? html`<${Fragment}>自<a className="link" onClick=${() => onOpenRun(run.retryOf)}>原日志</a><//>` : '原日志的结果'}，不会重复调用下游系统。
            <//></div>`}
            ${err && html`<div className="logs-error"><${Alert} tone="danger" title=${`错误信息 · ${err.code}`}>
              <div>${err.message}</div>
              ${(err.http_status || err.attempts > 1) && html`<div className="logs-error-meta">${[err.http_status ? `HTTP ${err.http_status}` : '', err.attempts > 1 ? `共尝试 ${err.attempts} 次` : ''].filter(Boolean).join(' · ')}</div>`}
              <div className="logs-error-tip"><b>排查建议：</b>${logsErrorTip(err.code, canReplay)}</div>
              ${issue && html`<div className="logs-error-issue"><${Icon} name="Siren" size=${14} /><span>同一原因累计失败 ${issue.count} 次，已合并为一个问题${issue.assignee ? `，${personName(issue.assignee)} 负责` : ''}</span><a className="link" onClick=${() => navigate(`/issues/${encodeURIComponent(issue.sig)}`)}>查看问题</a></div>`}
              ${errConnId && html`<div className="logs-error-conn">
                ${!errConn
                  ? html`<span>该连接已被删除，需要在工作流中重新选择连接。</span>`
                  : errConn.status === 'active'
                    ? html`<span className="logs-ok">连接「${errConn.name}」当前已恢复${canReplay ? '，可以重跑' : ''}。</span>`
                    : html`<span>连接「${errConn.name}」当前状态：${CONN_STATUS[errConn.status].label}${errConn.error ? `（${errConn.error}）` : ''}</span>`}
                ${errConn && html`<a className="link" onClick=${() => navigate(`/connections?id=${errConn.id}`)}>前往连接</a>`}
              </div>`}
            <//></div>`}
            ${agentSteps.length > 0 && html`<${LogsAgentTimeline} steps=${agentSteps} unrecorded=${level !== 'full' || Boolean(erasure)} mask=${maskAll} />`}
            <div className="debug-io">
              <div className="debug-io-tabs" role="tablist">
                ${['Input', 'Output', 'Error'].map((t) => html`<button key=${t} type="button" role="tab" aria-selected=${ioTab === t} className=${cx('debug-io-tab', ioTab === t && 'is-active')} onClick=${() => setIoTab(t)}>${t}</button>`)}
                ${maskChip && (isRevealed
                  ? html`<span className="logs-mask-chip is-revealed"><${Icon} name="Eye" size=${12} />正在显示原文</span>`
                  : html`<span className="logs-mask-chip"><${Icon} name="EyeOff" size=${12} />${current.node.sensitive && ioTab === 'Output' ? `敏感节点，已脱敏 ${masked.count} 个字段` : `已脱敏 ${masked.count} 个字段`}</span>`)}
                <span className="spacer" />
                ${maskChip && (isRevealed
                  ? html`<${Button} size="xs" variant="ghost" icon="EyeOff" onClick=${() => setRevealed((ids) => ids.filter((x) => x !== current.node.id))}>恢复脱敏<//>`
                  : html`<${Tooltip} content=${canReveal ? `只显示这个节点的原文，并写入审计日志${privacy.requireReason ? '，需要填写原因' : ''}` : `只有${logsRevealRolesText(state)}可以查看原文，可以在「管理后台 · 数据与隐私」调整`}><${Button} size="xs" variant="ghost" icon="Eye" disabled=${!canReveal} onClick=${askReveal}>查看原文<//><//>`)}
                <${Button} size="xs" variant="ghost" icon="Copy" disabled=${!showJson} onClick=${copyIo}>复制<//>
                <${Button} size="xs" variant="ghost" icon="Maximize2" disabled=${!showJson} onClick=${() => setZoom(true)}>放大<//>
              </div>
              <div className="debug-io-body json">
                ${unrecorded && !notRun
                  ? html`<div className="logs-unrecorded">
                    <${Icon} name="FileLock" size=${18} />
                    <div><b>${erasure ? '已按个人数据删除请求清除' : '按平台设置未记录输入输出'}</b><div className="text-xs muted">${erasure ? `「${erasure.subject}」的删除请求在 ${fmt.dateTime(erasure.doneAt || erasure.requestedAt)} 处理完成，这次运行的输入输出已清除，只保留运行状态、耗时和错误码。` : level === 'meta' ? '只保留了运行状态、耗时和错误信息，节点的输入输出没有写入日志。' : '平台设置为不记录节点数据，只保留运行状态。'}</div>
                    ${logsCanReveal(state) && html`<${Link} className="link text-xs" to="/admin/privacy">数据与隐私设置<//>`}</div>
                  </div>`
                  : showJson ? html`<${JsonView} value=${io} />` : html`<div className="muted text-xs logs-io-empty">${emptyText || '{}'}</div>`}
              </div>
            </div>
            <${Modal} open=${zoom && showJson} onClose=${() => setZoom(false)} title=${`${current.node.name} · ${ioTab}${isRevealed ? '（原文）' : masked.count ? '（已脱敏）' : ''}`} width=${900}>
              <div className="json logs-zoom"><${JsonView} value=${io || {}} defaultExpandDepth=${4} /></div>
            <//>
            <${LogsRevealModal} open=${revealAsk} nodeName=${current.node.name} requireReason=${Boolean(privacy.requireReason)} onClose=${() => setRevealAsk(false)} onConfirm=${reveal} />
          </div>`}
        </div>
      <//>`}
    <${Modal} open=${stopOpen} onClose=${() => setStopOpen(false)} width=${440} className="confirm" footer=${html`<${Fragment}><${Button} onClick=${() => setStopOpen(false)}>取消<//><${Button} variant="danger" onClick=${stopRun}>终止<//><//>`}>
      <div className="confirm-body">
        <span className="confirm-icon is-danger"><${Icon} name="CircleStop" size=${20} /></span>
        <div>
          <div className="confirm-title">终止运行？</div>
          <div className="confirm-content">正在运行的节点会被中断，已执行的节点不会回滚。${run.pendingApproval && !run.approval ? '等待中的人工确认会一起失效。' : ''}</div>
          ${callsSubflow && html`<div className="logs-stop-sub"><${Checkbox} label="同时停止子流程" checked=${stopSub} onChange=${setStopSub} /></div>`}
        </div>
      </div>
    <//>
  <//>`;
}

function logsBizText(run) {
  const b = run.bizKey;
  return b ? `${b.value} ${b.name || ''}`.toLowerCase() : '';
}

function LogsBizCell({ run }) {
  const b = run.bizKey;
  if (!b) return html`<span className="muted">-</span>`;
  return html`<span className="logs-biz" title=${`${b.label} ${b.value}${b.name ? ` · ${b.name}` : ''}`}><span className="logs-biz-label">${b.label}</span><span className="mono">${b.value}</span>${b.name && html`<span className="logs-biz-name">${b.name}</span>`}</span>`;
}
