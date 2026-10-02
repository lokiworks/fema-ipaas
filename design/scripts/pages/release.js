const REL_STATUS = {
  pending: { label: '待审批', tone: 'warning', icon: 'Clock' },
  approved: { label: '已批准', tone: 'info', icon: 'CircleCheck' },
  deployed: { label: '已上线', tone: 'success', icon: 'CircleCheck' },
  rejected: { label: '已驳回', tone: 'danger', icon: 'CircleX' },
  cancelled: { label: '已撤回', tone: 'default', icon: 'Undo2' },
};

const REL_KIND = {
  modified: { label: '修改', tone: 'warning', token: '--warning' },
  added: { label: '新增', tone: 'success', token: '--success' },
  removed: { label: '删除', tone: 'danger', token: '--destructive' },
};

const REL_CHECK_META = {
  error: { icon: 'CircleX', cls: 'is-error', order: 0 },
  warning: { icon: 'TriangleAlert', cls: 'is-warning', order: 1 },
  info: { icon: 'Info', cls: 'is-info', order: 2 },
  ok: { icon: 'CircleCheck', cls: 'is-ok', order: 3 },
};

const REL_CONFIG_LABELS = {
  prompt: '提示词', modelName: '模型', format: '输出格式', outputFields: '输出字段', temperature: '温度', connectionId: '模型连接',
  instructions: '智能体指令', tools: '工具', maxSteps: '最大步数', tokenBudget: 'Token 预算', input: '输入', items: '循环列表',
  mode: '模式', max: '最大次数', concurrency: '并发数', code: '代码', inputs: '入参', language: '语言', conditions: '循环条件',
  vars: '变量', message: '说明', cron: 'Cron 表达式', timezone: '时区', at: '触发时间', weekdays: '触发日', interval: '间隔',
  auth: '鉴权方式', bodyType: '请求体格式', params: '参数', rule: '规则名称', event: '事件', scope: '监控范围', skipHoliday: '节假日跳过',
  source: '数据来源', unit: '单位', until: '截止时间', form: '表单', frequency: '频率', periods: '周期数', activeHours: '生效时段',
};

function relEnvName(state, pid, key) {
  const env = projectEnvs(state, pid).find((e) => e.key === key);
  return env ? env.name : key === 'test' ? '测试环境' : '生产环境';
}

function relShortEnv(key) {
  return key === 'test' ? '测试' : '生产';
}

function relLink(pid, rid) {
  return `/integration/${pid}/releases/${rid}`;
}

function relNames(ids) {
  return (ids || []).map((id) => personName(id)).join('、');
}

function relGraphOf(state, wf, version) {
  if (!wf) return null;
  if (version === 'draft') return { trigger: wf.trigger, steps: wf.steps };
  const v = state.versions.find((x) => x.workflowId === wf.id && x.version === version);
  return v && v.snapshot ? v.snapshot : null;
}

function relProdVersion(wf) {
  const d = wf ? deploymentOf(wf, 'prod') : null;
  return d ? d.version : 0;
}

function relTestedVersions(state, wf) {
  return state.versions.filter((v) => v.workflowId === wf.id && (v.envs || []).includes('test')).sort((a, b) => b.version - a.version);
}

function relBaseVersion(state, release, wf) {
  if (release.status === 'pending') return relProdVersion(wf);
  if (release.baseVersion !== undefined && release.baseVersion !== null) return release.baseVersion;
  const prior = state.versions
    .filter((v) => v.workflowId === release.workflowId && v.version < release.version && (v.envs || ['prod']).includes('prod'))
    .sort((a, b) => b.version - a.version)[0];
  return prior ? prior.version : 0;
}

function relDiff(baseGraph, targetGraph) {
  if (!targetGraph) return null;
  if (!baseGraph) return { added: allNodes(targetGraph), removed: [], modified: [], same: false, initial: true };
  return { ...diffGraphs(baseGraph, targetGraph), initial: false };
}

function relConnName(state, id) {
  if (!id) return '未选择连接';
  const c = state.connections.find((x) => x.id === id);
  return c ? c.name : '已删除的连接';
}

function relOpName(node, key) {
  if (!key) return null;
  const c = resolveConnector(node.connector);
  const list = c ? (node.kind === 'trigger' ? c.triggers : c.actions) : [];
  const op = list.find((x) => x.key === key);
  return op ? op.name : key;
}

function relSettingsText(settings) {
  const s = settings || {};
  const meta = STRATEGIES.find((x) => x.value === (s.strategy || 'stop'));
  const retry = String(s.strategy || '').startsWith('retry') ? ` · 重试 ${s.times || 0} 次，间隔 ${s.interval || 0} 秒` : '';
  const rules = (s.rules || []).length ? ` · ${s.rules.length} 条自定义策略` : '';
  return `${meta ? meta.label : s.strategy}${retry}${rules}`;
}

function relRunSettingsText(rs) {
  if (!rs) return '默认（不去重、并发不限）';
  const d = rs.dedupe && rs.dedupe.enabled ? `按 ${rs.dedupe.key} 去重（${rs.dedupe.window}）` : '不去重';
  const c = rs.concurrency && rs.concurrency.max ? `最多并发 ${rs.concurrency.max}${rs.concurrency.orderKey ? `，按 ${rs.concurrency.orderKey} 保序` : ''}` : '并发不限';
  return `${d} · ${c}`;
}

function relCondText(conds, logic) {
  const list = conds || [];
  if (!list.length) return '没有条件';
  return list.map((c) => (c.type === 'ai' ? `AI 判断：${c.prompt || ''}` : `${c.left || '（空）'} ${c.op}${UNARY_OPS.includes(c.op) ? '' : ` ${c.right ?? ''}`}`)).join(logic === 'or' ? ' 或 ' : ' 且 ');
}

function relBranchFields(before, after) {
  const prev = before.branches || [];
  const next = after.branches || [];
  const changed = next.flatMap((b) => {
    const old = prev.find((x) => x.id === b.id);
    if (!old) return [{ label: `新增分支「${b.name}」`, before: null, after: b.isDefault ? '默认分支' : relCondText(b.conditions, b.logic) }];
    const renamed = old.name !== b.name ? [{ label: '分支名称', before: old.name, after: b.name }] : [];
    const condChanged = !b.isDefault && JSON.stringify([old.conditions || [], old.logic || 'and']) !== JSON.stringify([b.conditions || [], b.logic || 'and']);
    return [...renamed, ...(condChanged ? [{ label: `分支「${b.name}」的条件`, before: relCondText(old.conditions, old.logic), after: relCondText(b.conditions, b.logic) }] : [])];
  });
  const gone = prev.filter((b) => !next.some((x) => x.id === b.id)).map((b) => ({ label: `删除分支「${b.name}」`, before: b.isDefault ? '默认分支' : relCondText(b.conditions, b.logic), after: null }));
  const reordered = !changed.length && !gone.length && prev.map((b) => b.id).join() !== next.map((b) => b.id).join() ? [{ label: '分支顺序', before: prev.map((b) => b.name).join('、'), after: next.map((b) => b.name).join('、') }] : [];
  return [...changed, ...gone, ...reordered];
}

function relTransformText(t, state) {
  const meta = MAP_TRANSFORMS[t.type];
  if (!meta) return t.type;
  if (t.type === 'lookup') {
    const table = (state.mappingTables || []).find((x) => x.id === t.arg);
    return `查映射表「${table ? table.name : '已删除的映射表'}」`;
  }
  return meta.arg && !isBlank(t.arg) ? `${meta.label}（${t.arg}）` : meta.label;
}

function relMapRowText(row, state) {
  const src = row.source ? row.source : !isBlank(row.constant) ? `常量「${row.constant}」` : '未设置来源';
  const chain = (row.transforms || []).map((t) => relTransformText(t, state));
  const each = row.each && row.each.length ? ` · 逐项映射 ${row.each.length} 个字段` : '';
  return `${src}${chain.length ? ` → ${chain.join(' → ')}` : ''}${each}`;
}

function relMappingFields(label, before, after, state) {
  const keyOf = (r) => r.target || r.id;
  const prev = before.$map.fields || [];
  const next = after.$map.fields || [];
  const targets = [...new Set([...prev.map(keyOf), ...next.map(keyOf)])];
  return targets.flatMap((t) => {
    const a = prev.find((r) => keyOf(r) === t);
    const b = next.find((r) => keyOf(r) === t);
    const ta = a ? relMapRowText(a, state) : null;
    const tb = b ? relMapRowText(b, state) : null;
    return ta === tb ? [] : [{ label: `${label} · ${t}`, before: ta, after: tb }];
  });
}

function relFieldLabel(node, key) {
  if (FIELD_DEFS[key]) return fieldDef(node, key).label;
  const custom = fieldDef(node, key);
  if (custom && custom.label && custom.label !== key) return custom.label;
  return REL_CONFIG_LABELS[key] || key;
}

function relFmtValue(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isMapping(v)) return `字段映射（${(v.$map.fields || []).length} 个字段）`;
  const text = JSON.stringify(v);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

function relChangeFields(mod, state) {
  const { node, before } = mod;
  const base = mod.fields.flatMap((f) => {
    if (f.label === '分支条件') return relBranchFields(before, node);
    if (f.label === '连接') return [{ label: '连接', before: relConnName(state, f.before), after: relConnName(state, f.after) }];
    if (f.label === '操作') return [{ label: '操作', before: relOpName(before, f.before), after: relOpName(node, f.after) }];
    if (f.label === '错误处理') return [{ label: '错误处理', before: relSettingsText(before.settings), after: relSettingsText(node.settings) }];
    if (f.label === '节点名称') return [f];
    const label = relFieldLabel(node, f.label);
    if (isMapping(f.before) && isMapping(f.after)) return relMappingFields(label, f.before, f.after, state);
    if (f.label === 'connectionId') return [{ label, before: relConnName(state, f.before), after: relConnName(state, f.after) }];
    return [{ label, before: f.before, after: f.after }];
  });
  const extra = [
    JSON.stringify(before.runSettings || null) !== JSON.stringify(node.runSettings || null) ? { label: '运行设置', before: relRunSettingsText(before.runSettings), after: relRunSettingsText(node.runSettings) } : null,
    Boolean(before.sensitive) !== Boolean(node.sensitive) ? { label: '出参标为敏感', before: before.sensitive ? '是' : '否', after: node.sensitive ? '是' : '否' } : null,
  ].filter(Boolean);
  const all = [...base, ...extra];
  return all.length ? all : [{ label: '其他设置', before: null, after: '有变化' }];
}

function relChecksFor(state, wf, version) {
  const raw = releaseChecks(state, wf, version, 'prod');
  const configMissing = raw.some((c) => c.level === 'error' && /项目配置「/.test(c.text));
  return raw
    .filter((c) => !(configMissing && c.level === 'ok' && /个项目配置在.+都有值$/.test(c.text)))
    .sort((a, b) => REL_CHECK_META[a.level].order - REL_CHECK_META[b.level].order);
}

function relTestEvidence(state, wfId, version) {
  const ver = state.versions.find((v) => v.workflowId === wfId && v.version === version);
  const snapshot = ver && ver.snapshot ? JSON.stringify(ver.snapshot) : null;
  const sameGraph = (r) => Boolean(snapshot && r.graph && JSON.stringify({ trigger: r.graph.trigger, steps: r.graph.steps }) === snapshot);
  const runs = state.runs
    .filter((r) => r.workflowId === wfId && r.env === 'test' && ((r.kind === 'run' && r.version === version) || (r.kind === 'debug' && sameGraph(r))))
    .sort((a, b) => b.startedAt - a.startedAt);
  return { runs, m: runMetrics(runs.map((r) => ({ ...r, kind: 'run' }))) };
}

function relProjectApprovers(state, pid, env) {
  const eligible = (id) => ['owner', 'editor'].includes(projectRole(state, pid, id));
  const owners = state.members.filter((m) => m.projectId === pid && m.role === 'owner').map((m) => m.userId);
  const configured = (env.approvers || []).filter(eligible);
  const list = configured.length ? configured : owners;
  const others = list.filter((u) => u !== state.me);
  return others.length ? others : list;
}

function relDeployState(s, { wfId, version, releaseId, comment, checks }) {
  const now = Date.now();
  const wf = s.workflows.find((w) => w.id === wfId);
  const base = relProdVersion(wf);
  return {
    ...s,
    workflows: s.workflows.map((w) => (w.id === wfId ? { ...w, version, published: true, status: 'enabled', updatedAt: now } : w)),
    versions: s.versions.map((v) => (v.workflowId === wfId && v.version === version ? { ...v, envs: [...new Set([...(v.envs || []), 'prod'])] } : v)),
    releases: (s.releases || []).map((r) => (r.id === releaseId ? { ...r, status: 'deployed', decidedBy: s.me, decidedAt: now, comment, baseVersion: base, checks } : r)),
  };
}

function relNotify(items) {
  if (!items.length) return;
  const now = Date.now();
  Store.set((s) => ({ ...s, notifications: [...items.map((n) => ({ id: uid('nt'), time: now, read: Boolean(n.userId && n.userId !== s.me), ...n })), ...s.notifications] }));
}

function relMarkRead(link) {
  Store.set((s) => ({ ...s, notifications: s.notifications.map((n) => (n.to === link && !n.read && (!n.userId || n.userId === s.me) ? { ...n, read: true } : n)) }));
}

function relApproveBlock(state, release, wf) {
  if (!wf) return '工作流已被删除，不能上线';
  if (!relGraphOf(state, wf, release.version)) return `v${release.version} 的版本快照不存在`;
  const prod = relProdVersion(wf);
  if (prod === release.version) return `v${release.version} 已经在生产环境运行`;
  if (prod > release.version) return `生产环境已经是更新的 v${prod}，这个申请已过时`;
  const err = relChecksFor(state, wf, release.version).find((c) => c.level === 'error');
  return err ? `检查未通过：${err.text}` : null;
}

function RelStatusTag({ status, size = 'sm' }) {
  const m = REL_STATUS[status] || REL_STATUS.pending;
  return html`<${Tag} tone=${m.tone} size=${size} icon=${m.icon}>${m.label}<//>`;
}

function RelPerson({ id, size = 20 }) {
  return html`<span className="row-4 nowrap"><${Avatar} name=${personName(id)} size=${size} />${personName(id)}</span>`;
}

function RelChecks({ checks }) {
  return html`<ul className="rel-checks">
    ${checks.map((c, i) => html`<li key=${`${c.level}-${i}`} className=${cx('rel-check', REL_CHECK_META[c.level].cls)}>
      <${Icon} name=${REL_CHECK_META[c.level].icon} size=${15} />
      <span>${c.text}</span>
    </li>`)}
  </ul>`;
}

function RelEvidence({ state, wfId, version, limit = 5 }) {
  const { runs, m } = relTestEvidence(state, wfId, version);
  if (!runs.length) {
    return html`<div className="rel-evidence-empty">
      <${Icon} name="TriangleAlert" size=${15} />
      <span>v${version} 在测试环境还没有运行记录，上线前最好先在测试环境跑通一次。在编辑器里选「测试环境」调试，内容没改过的调试记录会算作这个版本的验证。</span>
    </div>`;
  }
  return html`<div className="rel-evidence">
    <div className="rel-evidence-stats">
      <div><span className="rel-evidence-num">${m.total}</span><span className="text-xs muted">次运行</span></div>
      <div><span className=${cx('rel-evidence-num', m.rate !== null && m.rate < 1 && 'is-bad')}>${fmtRate(m.rate)}</span><span className="text-xs muted">成功率</span></div>
      <div><span className="rel-evidence-num">${m.failed}</span><span className="text-xs muted">次失败</span></div>
    </div>
    <div className="rel-evidence-list">
      ${runs.slice(0, limit).map((r) => html`<button key=${r.id} type="button" className="rel-evidence-run" onClick=${() => navigate(`/logs?run=${r.id}`)}>
        <${RunStatusDot} status=${r.status} />
        <span className="grow muted text-xs">${fmt.short(r.startedAt)}</span>
        <span className="text-xs muted">${fmt.duration(r.duration)}</span>
        <${Icon} name="ChevronRight" size=${14} className="muted" />
      </button>`)}
    </div>
    ${runs.length > limit && html`<div className="text-xs muted">还有 ${runs.length - limit} 次更早的运行</div>`}
  </div>`;
}

function RelFieldRow({ f }) {
  const before = relFmtValue(f.before);
  const after = relFmtValue(f.after);
  return html`<div className="rel-field">
    <div className="rel-field-label">${f.label}</div>
    <div className="rel-field-val is-before"><${Icon} name="Minus" size=${12} /><span className=${before === null ? 'muted' : ''}>${before === null ? '（无）' : before}</span></div>
    <div className="rel-field-val is-after"><${Icon} name="Plus" size=${12} /><span className=${after === null ? 'muted' : ''}>${after === null ? '（无）' : after}</span></div>
  </div>`;
}

function RelChangeList({ items, sel, onPick, listRef, initial }) {
  return html`<div className="rel-diff-list" ref=${listRef}>
    ${initial && html`<div className="rel-diff-note"><${Icon} name="Info" size=${14} /><span>生产环境还没有部署过这个工作流，下面的节点都会新增。</span></div>`}
    ${items.length === 0 && html`<${Empty} size="sm" icon="Equal" title="两个版本没有差异" description="流程结构、节点配置和错误处理都相同。" />`}
    ${items.map((it) => html`<div key=${`${it.kind}-${it.id}`} data-change=${it.id} className=${cx('rel-change', sel === it.id && 'is-active')}>
      <button type="button" className="rel-change-head" onClick=${() => onPick(it)}>
        <${NodeIcon} node=${it.node} size=${24} />
        <span className="grow"><span className="rel-change-name">${it.node.name}</span><span className="rel-change-type">${nodeTypeLabel(it.node)}</span></span>
        <${Tag} size="sm" tone=${REL_KIND[it.kind].tone}>${REL_KIND[it.kind].label}<//>
      </button>
      ${it.fields && html`<div className="rel-change-fields">${it.fields.map((f, i) => html`<${RelFieldRow} key=${`${f.label}-${i}`} f=${f} />`)}</div>`}
    </div>`)}
  </div>`;
}

function RelDiffView({ wf, baseGraph, targetGraph, baseLabel, targetLabel, className }) {
  const state = useStore();
  const [view, setView] = useState('target');
  const [sel, setSel] = useState(null);
  const [focus, setFocus] = useState({ id: null, tick: 0 });
  const canvasApi = useRef(null);
  const listRef = useRef(null);
  const scopeRef = useRef(null);
  if (!scopeRef.current) scopeRef.current = uid('rdv');
  const scope = scopeRef.current;
  const diff = relDiff(baseGraph, targetGraph);
  const showBase = view === 'base' && Boolean(baseGraph);
  const fitKey = `${showBase ? 'base' : 'target'}-${baseLabel}-${targetLabel}`;
  useEffect(() => { setSel(null); }, [baseLabel, targetLabel]);
  useEffect(() => {
    const t = setTimeout(() => { if (canvasApi.current) canvasApi.current.fit(); }, 60);
    return () => clearTimeout(t);
  }, [fitKey]);
  useEffect(() => {
    if (!sel || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-change="${CSS.escape(sel)}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  if (!diff) return html`<div className=${cx('rel-diff', className)}><${Empty} icon="FileX" title="版本快照不存在" description="这个版本的快照已经丢失，无法对比。" /></div>`;
  const items = [
    ...diff.modified.map((m) => ({ id: m.node.id, kind: 'modified', node: m.node, fields: relChangeFields(m, state) })),
    ...(diff.initial ? [] : diff.added.map((n) => ({ id: n.id, kind: 'added', node: n }))),
    ...diff.removed.map((n) => ({ id: n.id, kind: 'removed', node: n })),
  ];
  const listItems = diff.initial ? diff.added.map((n) => ({ id: n.id, kind: 'added', node: n })) : items;
  const marks = showBase
    ? [...diff.removed.map((n) => [n.id, 'removed']), ...diff.modified.map((m) => [m.node.id, 'modified'])]
    : [...diff.added.map((n) => [n.id, 'added']), ...diff.modified.map((m) => [m.node.id, 'modified'])];
  const css = marks.map(([id, kind]) => {
    const t = REL_KIND[kind].token;
    return `.${scope} .fnode[data-node="${CSS.escape(id)}"]{--rel-c:var(${t});--rel-s:var(${t}-soft);--rel-t:var(${t}-text);--rel-l:"${REL_KIND[kind].label}"}`;
  }).join('');
  const graph = showBase ? baseGraph : targetGraph;
  const pick = (it) => {
    const needBase = it.kind === 'removed';
    if (needBase && !showBase && baseGraph) setView('base');
    if (!needBase && showBase) setView('target');
    setSel(it.id);
    setFocus((f) => ({ id: it.id, tick: f.tick + 1 }));
  };
  const count = (k) => (diff.initial && k === 'added' ? diff.added.length : items.filter((i) => i.kind === k).length);
  return html`<div className=${cx('rel-diff', className)}>
    <div className="rel-diff-bar">
      <span className="rel-diff-sum">
        ${['modified', 'added', 'removed'].map((k) => html`<span key=${k} className=${cx('rel-diff-count', `is-${k}`)}><span className="rel-diff-dot" />${REL_KIND[k].label} ${count(k)}</span>`)}
      </span>
      <span className="spacer" />
      ${baseGraph && html`<${Segmented} size="sm" value=${showBase ? 'base' : 'target'} onChange=${setView} options=${[{ value: 'target', label: `看 ${targetLabel}` }, { value: 'base', label: `看 ${baseLabel}` }]} />`}
    </div>
    <div className="rel-diff-main">
      <div className=${cx('rel-canvas', scope)}>
        <style>${css}</style>
        <${FlowCanvas}
          wf=${{ ...wf, ...graph }}
          fitKey=${fitKey}
          ctx=${{
            editing: false, state, selectedId: sel, selectedBranch: null, runState: null, issuesByNode: {}, highlightId: null,
            linking: null, searchIds: null, collapsed: [], takenBranches: null, focusId: focus.id, focusTick: focus.tick,
            leftInset: 0, rightInset: 0, canvasApi,
            onSelect: (id) => setSel(id),
            onCanvasClick: () => setSel(null),
          }}
        />
        <div className="rel-canvas-caption">${showBase ? `${baseLabel}：标出了删除和修改的节点` : `${targetLabel}：标出了新增和修改的节点`}</div>
      </div>
      <${RelChangeList} items=${listItems} sel=${sel} onPick=${pick} listRef=${listRef} initial=${diff.initial} />
    </div>
  </div>`;
}

function RelWorkflowCell({ wf, note }) {
  return html`<div className="rel-wf-cell">
    <div className="cell-main"><${WorkflowGlyph} wf=${wf} size=${18} /><span className="cell-title" title=${wf ? wf.name : ''}>${wf ? wf.name : '已删除的工作流'}</span></div>
    ${note && html`<div className="rel-note-line" title=${note}>${note}</div>`}
  </div>`;
}

function RelPromotePicker({ candidates, onPick }) {
  const trigger = html`<${Button} variant="primary" icon="Rocket" iconRight="ChevronDown" disabled=${!candidates.length}>发起推广<//>`;
  if (!candidates.length) return html`<${Tooltip} content="没有测试环境领先生产环境、且没有待审批申请的工作流">${trigger}<//>`;
  return html`<${Dropdown}
    width=${300}
    trigger=${trigger}
    items=${[
      { group: '测试环境领先生产环境的工作流' },
      ...candidates.map((w) => ({ key: w.id, label: w.name, desc: `测试 v${w.test.version} · 生产 ${relProdVersion(w) ? `v${relProdVersion(w)}` : '未发布'}`, iconNode: html`<${WorkflowGlyph} wf=${w} size=${18} />`, onClick: () => onPick(w.id) })),
    ]}
  />`;
}

function ReleasesPage({ pid }) {
  const state = useStore();
  const [tab, setTab] = useState(null);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [promoteId, setPromoteId] = useState(null);
  const project = state.projects.find((p) => p.id === pid);
  if (!project) return html`<div className="page"><${Empty} icon="FolderX" title="项目不存在或已被删除" /></div>`;
  const staged = isStagedProject(state, pid);
  const canEdit = canEditProject(state, pid);
  const wfOf = (id) => state.workflows.find((w) => w.id === id) || null;
  const all = (state.releases || []).filter((r) => r.projectId === pid).sort((a, b) => b.requestedAt - a.requestedAt);
  const mine = all.filter((r) => r.status === 'pending' && r.approvers.includes(state.me));
  const current = tab || (mine.length ? 'mine' : 'all');
  const ql = q.trim().toLowerCase();
  const shown = (current === 'mine' ? mine : all)
    .filter((r) => current === 'mine' || status === 'all' || r.status === status)
    .filter((r) => { const w = wfOf(r.workflowId); return !ql || `${w ? w.name : ''}${r.note || ''}`.toLowerCase().includes(ql); });
  const pendingIds = new Set(all.filter((r) => r.status === 'pending').map((r) => r.workflowId));
  const candidates = staged && canEdit ? state.workflows.filter((w) => w.projectId === pid && w.test && w.test.version > relProdVersion(w) && !pendingIds.has(w.id)) : [];
  const promoteWf = promoteId ? wfOf(promoteId) : null;
  if (!staged && !all.length) {
    return html`<div className="page"><div className="page-inner">
      <${PageHeader} title="发布与审批" description="测试环境验证过的版本通过推广发布到生产环境，生产环境可以要求审批。" />
      <${Empty}
        icon="Layers"
        title="这个项目只有生产环境"
        description="发布后直接在生产环境运行，没有推广和审批。需要先在测试环境验证、再由负责人审批上线时，开启测试与生产环境。"
        action=${html`<${Button} variant="primary" icon="SlidersHorizontal" onClick=${() => navigate(`/integration/${pid}/config`)}>前往环境与配置<//>`}
      />
    </div></div>`;
  }
  return html`<div className="page"><div className="page-inner">
    <${PageHeader}
      title="发布与审批"
      description="工作流发布后先部署到测试环境，验证后推广到生产环境。生产环境要求审批时，审批人在这里查看差异和检查结果后批准或驳回。"
      actions=${staged && canEdit && html`<${RelPromotePicker} candidates=${candidates} onPick=${setPromoteId} />`}
    />
    ${!staged && html`<div className="integ-gap"><${Alert} tone="info">这个项目已经关闭了测试与生产环境，下面是之前的推广记录。<//></div>`}
    <div className="toolbar">
      <${Tabs} variant="pill" value=${current} onChange=${setTab} items=${[{ value: 'mine', label: '待我审批', count: mine.length }, { value: 'all', label: '全部', count: all.length }]} />
      <span className="spacer" />
      ${current === 'all' && html`<${Select} width=${130} value=${status} onChange=${setStatus} options=${[{ value: 'all', label: '全部状态' }, ...Object.entries(REL_STATUS).filter(([k]) => k !== 'approved').map(([k, v]) => ({ value: k, label: v.label }))]} />`}
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索工作流或推广说明" width=${220} />
    </div>
    <${Table}
      className="rel-table"
      onRowClick=${(r) => navigate(relLink(pid, r.id))}
      columns=${[
        { key: 'wf', title: '工作流', render: (r) => html`<${RelWorkflowCell} wf=${wfOf(r.workflowId)} note=${r.note} />` },
        { key: 'v', title: '版本', width: 64, render: (r) => html`<b>v${r.version}</b>` },
        { key: 'env', title: '推广', width: 110, render: (r) => html`<span className="row-4 nowrap">${relShortEnv(r.fromEnv)}<${Icon} name="ArrowRight" size=${12} className="muted" />${relShortEnv(r.toEnv)}</span>` },
        { key: 'by', title: '申请人', width: 104, render: (r) => html`<${RelPerson} id=${r.requestedBy} />` },
        { key: 'at', title: '申请时间', width: 100, render: (r) => html`<span className="muted" title=${fmt.dateTime(r.requestedAt)}>${fmt.relative(r.requestedAt)}</span>` },
        { key: 'status', title: '状态', width: 88, render: (r) => html`<${RelStatusTag} status=${r.status} />` },
        { key: 'appr', title: '审批人', width: 120, render: (r) => (r.approvers.length ? html`<span className="ellipsis rel-approver-cell" title=${relNames(r.approvers)}>${relNames(r.approvers)}</span>` : html`<span className="muted">无需审批</span>`) },
      ]}
      data=${shown}
      empty=${html`<${Empty}
        size="sm"
        icon=${ql ? 'SearchX' : current === 'mine' ? 'ClipboardCheck' : 'Rocket'}
        title=${ql ? '没有匹配的记录' : current === 'mine' ? '没有等待你审批的发布' : '还没有推广记录'}
        description=${ql ? '' : current === 'mine' ? '有人申请把工作流推广到生产环境、并指定你为审批人时，会出现在这里。' : '在项目概览或编辑器里，把测试环境验证过的版本推广到生产环境。'}
      />`}
    />
    ${promoteWf && html`<${PromoteModal} open=${true} onClose=${() => setPromoteId(null)} wf=${promoteWf} state=${state} />`}
  </div></div>`;
}

function ReleaseDetailPage({ pid, rid }) {
  const state = useStore();
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const release = (state.releases || []).find((r) => r.id === rid && r.projectId === pid);
  if (!release) {
    return html`<div className="page"><${Empty}
      icon="FileQuestion"
      title="发布记录不存在"
      description="链接可能已经失效，或者这条记录不属于当前项目。"
      action=${html`<${Button} onClick=${() => navigate(`/integration/${pid}/releases`)}>返回发布与审批<//>`}
    /></div>`;
  }
  const wf = state.workflows.find((w) => w.id === release.workflowId) || null;
  const link = relLink(pid, release.id);
  const pending = release.status === 'pending';
  const role = projectRole(state, pid);
  const isApprover = pending && release.approvers.includes(state.me) && ['owner', 'editor'].includes(role);
  const isRequester = release.requestedBy === state.me;
  const block = pending ? relApproveBlock(state, release, wf) : null;
  const checks = pending && wf ? relChecksFor(state, wf, release.version) : release.checks || null;
  const warnings = (checks || []).filter((c) => c.level === 'warning');
  const baseVersion = relBaseVersion(state, release, wf);
  const baseGraph = baseVersion ? relGraphOf(state, wf, baseVersion) : null;
  const targetGraph = relGraphOf(state, wf, release.version);
  const toName = relEnvName(state, pid, release.toEnv);
  const testAhead = pending && wf && wf.test && wf.test.version > release.version ? wf.test.version : null;

  const openDialog = (kind) => { setText(''); setTouched(false); setDialog(kind); };
  const fresh = () => {
    const s = Store.get();
    const r = (s.releases || []).find((x) => x.id === release.id);
    if (!r || r.status !== 'pending') { toast.error('这个申请已经处理过了'); setDialog(null); return null; }
    return { s, r, w: s.workflows.find((x) => x.id === r.workflowId) || null };
  };
  const approve = () => {
    const got = fresh();
    if (!got) return;
    const { s, r, w } = got;
    if (!r.approvers.includes(s.me)) { toast.error('你不是这个申请的审批人'); return; }
    const reason = relApproveBlock(s, r, w);
    if (reason) { toast.error(reason); return; }
    const comment = text.trim();
    const saved = relChecksFor(s, w, r.version);
    Store.set((st) => relDeployState(st, { wfId: w.id, version: r.version, releaseId: r.id, comment, checks: saved }));
    addAudit('批准发布', `${w.name} v${r.version} → ${toName}`, pid);
    relMarkRead(link);
    if (r.requestedBy !== s.me) {
      relNotify([{ type: 'release', userId: r.requestedBy, title: `「${w.name}」v${r.version} 已推广到${toName}`, desc: `${personName(s.me)} 批准了 ${personName(r.requestedBy)} 的申请${comment ? `：${comment}` : ''}`, to: link }]);
    }
    setDialog(null);
    toast.success(`已批准，v${r.version} 已在${toName}运行`);
  };
  const reject = () => {
    setTouched(true);
    const reason = text.trim();
    if (!reason) return;
    const got = fresh();
    if (!got) return;
    const { s, r, w } = got;
    const now = Date.now();
    Store.set((st) => ({ ...st, releases: st.releases.map((x) => (x.id === r.id ? { ...x, status: 'rejected', decidedBy: st.me, decidedAt: now, comment: reason, baseVersion: relProdVersion(w) } : x)) }));
    addAudit('驳回发布', `${w ? w.name : r.workflowId} v${r.version}`, pid);
    relMarkRead(link);
    if (r.requestedBy !== s.me) {
      relNotify([{ type: 'release', userId: r.requestedBy, title: `「${w ? w.name : '工作流'}」v${r.version} 的推广申请被驳回`, desc: `${personName(s.me)}：${reason}`, to: link }]);
    }
    setDialog(null);
    toast.success('已驳回，申请人会收到通知');
  };
  const withdraw = async () => {
    const ok = await confirmDialog({ title: '撤回推广申请？', content: `撤回后审批人不能再批准这个申请。需要上线时可以重新发起推广。`, okText: '撤回', danger: true });
    if (!ok) return;
    const got = fresh();
    if (!got) return;
    const { s, r, w } = got;
    const now = Date.now();
    Store.set((st) => ({ ...st, releases: st.releases.map((x) => (x.id === r.id ? { ...x, status: 'cancelled', decidedBy: st.me, decidedAt: now, baseVersion: relProdVersion(w) } : x)) }));
    addAudit('撤回发布申请', `${w ? w.name : r.workflowId} v${r.version}`, pid);
    relMarkRead(link);
    relNotify(r.approvers.filter((u) => u !== s.me).map((u) => ({ type: 'release', userId: u, title: `「${w ? w.name : '工作流'}」v${r.version} 的推广申请已撤回`, desc: `${personName(s.me)} 撤回了申请，不需要再审批`, to: link })));
    toast.success('已撤回');
  };

  const decidedAlert = () => {
    if (release.status === 'deployed') {
      const auto = !release.approvers.length;
      return html`<${Alert} tone="success" title=${`v${release.version} 已在${toName}运行`}>
        ${auto ? `${personName(release.decidedBy || release.requestedBy)} 于 ${fmt.dateTime(release.decidedAt || release.requestedAt)} 直接上线（${toName}不需要审批）。` : `${personName(release.decidedBy)} 于 ${fmt.dateTime(release.decidedAt)} 批准并上线。`}
        ${!auto && release.comment && html`<div className="rel-comment">审批意见：${release.comment}</div>`}
      <//>`;
    }
    if (release.status === 'rejected') {
      return html`<${Alert} tone="danger" title="申请被驳回">${personName(release.decidedBy)} 于 ${fmt.dateTime(release.decidedAt)} 驳回。<div className="rel-comment">理由：${release.comment || '未填写'}</div><//>`;
    }
    if (release.status === 'cancelled') {
      return html`<${Alert} tone="info" title="申请已撤回">${personName(release.decidedBy || release.requestedBy)} 于 ${fmt.dateTime(release.decidedAt || release.requestedAt)} 撤回了这个申请。<//>`;
    }
    if (isApprover) {
      return html`<${Alert} tone="warning" title="等待你审批">
        ${isRequester ? '你是这个申请的发起人，也是唯一的审批人。' : ''}查看差异、检查结果和测试环境的运行记录后批准或驳回。批准后 v${release.version} 立即替换${toName}${relProdVersion(wf) ? `正在运行的 v${relProdVersion(wf)}` : ''}。
      <//>`;
    }
    return html`<${Alert} tone="info" title=${`等待 ${relNames(release.approvers)} 审批`}>${isRequester ? '审批人批准后会自动上线，你会收到通知。需要修改时可以撤回申请。' : '只有审批人可以批准或驳回这个申请。'}<//>`;
  };

  const timeline = [
    { key: 'req', icon: 'Send', tone: 'primary', text: `${personName(release.requestedBy)} 申请把 v${release.version} 推广到${toName}`, at: release.requestedAt },
    ...(release.status === 'deployed' ? [{ key: 'dec', icon: 'Rocket', tone: 'success', text: release.approvers.length ? `${personName(release.decidedBy)} 批准并上线` : '不需要审批，直接上线', at: release.decidedAt || release.requestedAt }] : []),
    ...(release.status === 'rejected' ? [{ key: 'dec', icon: 'CircleX', tone: 'danger', text: `${personName(release.decidedBy)} 驳回`, at: release.decidedAt }] : []),
    ...(release.status === 'cancelled' ? [{ key: 'dec', icon: 'Undo2', tone: 'default', text: `${personName(release.decidedBy || release.requestedBy)} 撤回了申请`, at: release.decidedAt || release.requestedAt }] : []),
    ...(pending ? [{ key: 'wait', icon: 'Clock', tone: 'warning', text: `等待 ${relNames(release.approvers)} 审批`, at: null }] : []),
  ];

  const approveBtn = html`<${Button} variant="primary" icon="Check" disabled=${Boolean(block)} onClick=${() => openDialog('approve')}>批准并上线<//>`;
  const actions = html`<${Fragment}>
    ${wf && html`<${Button} icon="SquarePen" onClick=${() => navigate(`/integration/${pid}/wf/${wf.id}/v/${release.version}`)}>查看 v${release.version} 快照<//>`}
    ${pending && isRequester && html`<${Button} variant="danger-outline" icon="Undo2" onClick=${withdraw}>撤回申请<//>`}
    ${isApprover && html`<${Button} variant="danger-outline" icon="X" onClick=${() => openDialog('reject')}>驳回<//>`}
    ${isApprover && (block ? html`<${Tooltip} content=${block}>${approveBtn}<//>` : approveBtn)}
  <//>`;

  return html`<div className="page"><div className="page-inner">
    <div className="rel-crumb"><${Breadcrumb} items=${[{ label: '发布与审批', to: `/integration/${pid}/releases` }, { label: `${wf ? wf.name : '已删除的工作流'} v${release.version}` }]} /></div>
    <${PageHeader}
      title=${html`<span className="rel-title">「${wf ? wf.name : '已删除的工作流'}」v${release.version} 推广到${toName}<${RelStatusTag} status=${release.status} size="md" /></span>`}
      description=${`${personName(release.requestedBy)} 申请于 ${fmt.relative(release.requestedAt)} · ${release.approvers.length ? `审批人 ${relNames(release.approvers)}` : '不需要审批'}`}
      actions=${actions}
    />
    <div className="rel-status-alert">${decidedAlert()}</div>
    ${isApprover && block && html`<div className="integ-gap"><${Alert} tone="danger" title="暂时不能批准">${block}<//></div>`}
    ${testAhead && html`<div className="integ-gap"><${Alert} tone="info">测试环境已经部署了更新的 v${testAhead}。这个申请只会上线 v${release.version}，需要上线 v${testAhead} 时请申请人重新发起推广。<//></div>`}
    <div className="rel-cards">
      <${Card} title="推广说明" icon="MessageSquare">
        <div className="rel-note">${release.note || html`<span className="muted">申请人没有填写说明</span>`}</div>
        <ol className="rel-timeline">
          ${timeline.map((t) => html`<li key=${t.key} className=${`tone-${t.tone}`}>
            <span className="rel-timeline-icon"><${Icon} name=${t.icon} size=${12} /></span>
            <span className="grow"><span className="rel-timeline-text">${t.text}</span>${t.at && html`<span className="text-xs muted">${fmt.dateTime(t.at)}</span>`}</span>
          </li>`)}
        </ol>
      <//>
      <${Card} title=${pending ? '上线前检查' : ['rejected', 'cancelled'].includes(release.status) ? '提交时的检查' : '上线时的检查'} icon="ListChecks" subtitle=${pending ? `按${toName}当前的连接和配置检查` : ''}>
        ${checks ? html`<${RelChecks} checks=${checks} />` : html`<div className="text-xs muted">${['rejected', 'cancelled'].includes(release.status) ? '这条申请没有上线过，也没有保存提交时的检查结果。' : '这条记录没有保存上线时的检查结果。'}</div>`}
      <//>
      <${Card} title="测试环境验证" icon="FlaskConical" subtitle=${`v${release.version} 在测试环境的运行记录`}>
        ${wf ? html`<${RelEvidence} state=${state} wfId=${wf.id} version=${release.version} />` : html`<div className="text-xs muted">工作流已被删除。</div>`}
      <//>
    </div>
    <div className="section-head rel-section-head">
      <div>
        <div className="section-title">版本差异</div>
        <div className="text-xs muted">${baseVersion ? `${toName}的 v${baseVersion} → 申请上线的 v${release.version}` : `${toName}还没有部署过，v${release.version} 是首次上线`}</div>
      </div>
      ${wf && html`<${Button} size="sm" icon="Maximize2" onClick=${() => setDiffOpen(true)}>全屏对比<//>`}
    </div>
    ${wf
      ? html`<${RelDiffView} wf=${wf} baseGraph=${baseGraph} targetGraph=${targetGraph} baseLabel=${baseVersion ? `v${baseVersion}（${relShortEnv(release.toEnv)}）` : '生产环境'} targetLabel=${`v${release.version}（申请）`} className="rel-diff-page" />`
      : html`<${Empty} size="sm" icon="FileX" title="工作流已被删除" description="无法还原版本差异。" />`}
    ${wf && html`<${VersionDiffModal} open=${diffOpen} onClose=${() => setDiffOpen(false)} wf=${wf} baseVersion=${baseVersion || null} targetVersion=${release.version} state=${state} />`}
    <${Modal}
      open=${dialog === 'approve'}
      onClose=${() => setDialog(null)}
      title="批准并上线"
      description=${wf ? `「${wf.name}」v${release.version}` : ''}
      width=${520}
      footer=${html`<${Fragment}><${Button} onClick=${() => setDialog(null)}>取消<//><${Button} variant="primary" icon="Rocket" disabled=${Boolean(block)} onClick=${approve}>批准并上线<//><//>`}
    >
      <div className="rel-dialog-summary">
        <${Icon} name="Rocket" size=${16} />
        <span>v${release.version} 会立即替换${toName}${relProdVersion(wf) ? `正在运行的 v${relProdVersion(wf)}` : ''}${wf && wf.status !== 'enabled' ? '，并启动工作流' : ''}。之后需要回滚时，在编辑器的版本管理里重新发布旧版本。</span>
      </div>
      ${warnings.length > 0 && html`<div className="integ-gap"><${Alert} tone="warning" title=${`${warnings.length} 个提醒`}>${warnings.map((w, i) => html`<div key=${i}>${w.text}</div>`)}<//></div>`}
      <${Field} label="审批意见" hint="选填，会通知申请人">
        <${Textarea} value=${text} onChange=${(v) => setText(v.slice(0, 200))} rows=${3} placeholder="例：差异已确认，可以上线" />
      <//>
    <//>
    <${Modal}
      open=${dialog === 'reject'}
      onClose=${() => setDialog(null)}
      title="驳回推广申请"
      description=${wf ? `「${wf.name}」v${release.version}` : ''}
      width=${480}
      footer=${html`<${Fragment}><${Button} onClick=${() => setDialog(null)}>取消<//><${Button} variant="danger" disabled=${touched && !text.trim()} onClick=${reject}>驳回<//><//>`}
    >
      <${Field} label="驳回理由" required error=${touched && !text.trim() ? '请填写驳回理由，申请人需要知道要改什么' : null}>
        <${Textarea} value=${text} onChange=${(v) => { setText(v.slice(0, 200)); setTouched(true); }} rows=${4} invalid=${touched && !text.trim()} placeholder="例：测试环境只验证了小额票据，请补充大额票据的测试后再申请" />
      <//>
    <//>
  </div></div>`;
}

function PromoteModal({ open, onClose, wf, state, version }) {
  const live = useStore();
  const [ver, setVer] = useState(null);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const s = live || state;
  const cur = wf ? s.workflows.find((w) => w.id === wf.id) || null : null;
  useEffect(() => {
    if (!open) return;
    const tested = cur ? relTestedVersions(s, cur) : [];
    const testNow = cur && cur.test ? cur.test.version : null;
    const want = version != null && tested.some((v) => v.version === version) ? version : testNow && tested.some((v) => v.version === testNow) ? testNow : tested.length ? tested[0].version : null;
    setVer(want);
    setNote('');
    setTouched(false);
    setDone(null);
    setDiffOpen(false);
  }, [open]);
  if (!open) return null;
  const finish = () => onClose(done || undefined);
  const plain = (title, body, extra) => html`<${Modal} open=${true} onClose=${finish} title=${title} description=${cur ? cur.name : ''} width=${520} footer=${html`<${Fragment}><${Button} onClick=${finish}>关闭<//>${extra}<//>`}>${body}<//>`;
  if (!cur) return plain('推广到生产环境', html`<${Empty} size="sm" icon="FileX" title="工作流不存在或已被删除" />`);
  const pid = cur.projectId;
  if (!isStagedProject(s, pid)) {
    return plain('推广到生产环境', html`<${Alert} tone="info" title="这个项目只有生产环境">发布后直接在生产环境运行，不需要推广。需要先在测试环境验证、再审批上线时，在「环境与配置」里开启测试与生产环境。<//>`, html`<${Button} variant="primary" onClick=${() => { finish(); navigate(`/integration/${pid}/config`); }}>前往环境与配置<//>`);
  }
  if (!canEditProject(s, pid)) return plain('推广到生产环境', html`<${Alert} tone="info">你在此项目中是「可查看」权限，不能推广工作流。<//>`);
  const env = projectEnvs(s, pid).find((e) => e.key === 'prod');
  const tested = relTestedVersions(s, cur);
  const prodV = relProdVersion(cur);
  const testNow = cur.test ? cur.test.version : null;
  if (!tested.length) {
    return plain('推广到生产环境', html`<${Alert} tone="warning" title="测试环境还没有部署这个工作流">先在编辑器里发布，新版本会部署到测试环境；验证通过后再推广到${env.name}。<//>`, html`<${Button} variant="primary" onClick=${() => { finish(); navigate(`/integration/${pid}/wf/${cur.id}`); }}>打开工作流<//>`);
  }

  if (done) {
    const r = (s.releases || []).find((x) => x.id === done.releaseId);
    const deployed = done.status === 'deployed';
    return html`<${Modal} open=${true} onClose=${finish} title="推广到生产环境" description=${cur.name} width=${520} footer=${html`<${Fragment}>
      <${Button} onClick=${() => { finish(); navigate(relLink(pid, done.releaseId)); }}>${deployed ? '查看发布记录' : '查看申请'}<//>
      <${Button} variant="primary" onClick=${finish}>完成<//>
    <//>`}>
      <${Empty}
        icon=${deployed ? 'Rocket' : 'Send'}
        title=${deployed ? `v${done.version} 已在${env.name}运行` : '已提交审批'}
        description=${deployed
          ? `${env.name}不需要审批，已直接上线。推广记录保存在「发布与审批」里，需要回滚时在编辑器的版本管理里重新发布旧版本。`
          : `等待 ${r ? relNames(r.approvers) : ''} 审批。批准后 v${done.version} 会自动替换${env.name}${prodV ? `的 v${prodV}` : ''}，你会收到通知。`}
      />
    <//>`;
  }

  const pendingRel = (s.releases || []).find((r) => r.workflowId === cur.id && r.status === 'pending');
  const selected = tested.find((v) => v.version === ver) || null;
  const versionIssue = !selected ? '选择要推广的版本' : selected.version === prodV ? `${env.name}正在运行 v${prodV}` : selected.version < prodV ? `v${selected.version} 比${env.name}的 v${prodV} 旧。回滚请在编辑器的版本管理里重新发布旧版本` : null;
  const checks = selected ? relChecksFor(s, cur, selected.version) : [];
  const checkError = checks.find((c) => c.level === 'error');
  const nothingAhead = tested.every((v) => v.version <= prodV);
  const approvers = env.requireApproval ? relProjectApprovers(s, pid, env) : [];
  const noteError = touched && !note.trim() ? '请填写推广说明，审批人需要知道这次改了什么' : null;
  const blockReason = pendingRel ? `已有一个待审批的推广申请（v${pendingRel.version}），先等审批完成或撤回后再发起` : versionIssue || (checkError ? `检查未通过：${checkError.text}` : null);
  const baseGraph = prodV ? relGraphOf(s, cur, prodV) : null;
  const diff = selected ? relDiff(baseGraph, selected.snapshot) : null;
  const diffItems = diff ? [
    ...diff.modified.map((m) => ({ id: m.node.id, kind: 'modified', node: m.node, fields: relChangeFields(m, s) })),
    ...diff.added.map((n) => ({ id: n.id, kind: 'added', node: n })),
    ...diff.removed.map((n) => ({ id: n.id, kind: 'removed', node: n })),
  ] : [];

  const submit = () => {
    setTouched(true);
    if (blockReason || !note.trim()) return;
    const st = Store.get();
    const w = st.workflows.find((x) => x.id === cur.id);
    if (!w) { toast.error('工作流已被删除'); return; }
    if ((st.releases || []).some((r) => r.workflowId === w.id && r.status === 'pending')) { toast.error('已有一个待审批的推广申请'); return; }
    const envNow = projectEnvs(st, pid).find((e) => e.key === 'prod');
    const errNow = relChecksFor(st, w, ver).find((c) => c.level === 'error');
    if (errNow) { toast.error(`检查未通过：${errNow.text}`); return; }
    const now = Date.now();
    const needApproval = Boolean(envNow && envNow.requireApproval);
    const list = needApproval ? relProjectApprovers(st, pid, envNow) : [];
    const rel = {
      id: uid('rel'), workflowId: w.id, projectId: pid, version: ver, fromEnv: 'test', toEnv: 'prod', status: 'pending',
      requestedBy: st.me, requestedAt: now, approvers: list, note: note.trim(), decidedBy: null, decidedAt: null, comment: '', baseVersion: relProdVersion(w),
    };
    const link = relLink(pid, rel.id);
    if (needApproval) {
      Store.set((x) => ({ ...x, releases: [rel, ...(x.releases || [])] }));
      addAudit('申请推广到生产环境', `${w.name} v${ver}`, pid);
      relNotify(list.map((u) => (u === st.me
        ? { type: 'release', userId: u, title: `${personName(st.me)} 申请把「${w.name}」v${ver} 推广到${envNow.name}`, desc: `需要你审批：${rel.note}`, to: link }
        : { type: 'release', userId: u, title: `「${w.name}」v${ver} 申请推广到${envNow.name}`, desc: `${personName(st.me)} 发起，等待 ${personName(u)} 审批：${rel.note}`, to: link })));
      setDone({ status: 'pending', releaseId: rel.id, version: ver });
      toast.success('已提交审批');
      return;
    }
    const saved = relChecksFor(st, w, ver);
    Store.set((x) => relDeployState({ ...x, releases: [rel, ...(x.releases || [])] }, { wfId: w.id, version: ver, releaseId: rel.id, comment: '', checks: saved }));
    addAudit('推广到生产环境', `${w.name} v${ver}`, pid);
    setDone({ status: 'deployed', releaseId: rel.id, version: ver });
    toast.success(`v${ver} 已在${envNow.name}运行`);
  };

  const submitLabel = env.requireApproval ? '提交审批' : `推广到${env.name}`;
  const submitBtn = html`<${Button} variant="primary" icon=${env.requireApproval ? 'Send' : 'Rocket'} disabled=${Boolean(blockReason) || Boolean(noteError)} onClick=${submit}>${submitLabel}<//>`;
  return html`<${Fragment}>
    <${Modal}
      open=${!diffOpen}
      onClose=${finish}
      title=${`推广到${env.name}`}
      description=${cur.name}
      width=${640}
      footer=${html`<${Fragment}>
        <${Button} onClick=${finish}>取消<//>
        ${blockReason ? html`<${Tooltip} content=${blockReason}>${submitBtn}<//>` : submitBtn}
      <//>`}
    >
      ${pendingRel && html`<div className="integ-gap"><${Alert} tone="warning" title="已有待审批的申请" action=${html`<${Button} size="sm" onClick=${() => { finish(); navigate(relLink(pid, pendingRel.id)); }}>查看申请<//>`}>
        ${personName(pendingRel.requestedBy)} 在 ${fmt.relative(pendingRel.requestedAt)} 申请推广 v${pendingRel.version}，等待 ${relNames(pendingRel.approvers)} 审批。
      <//></div>`}
      ${!pendingRel && nothingAhead && html`<div className="integ-gap"><${Alert} tone="info">${env.name}已经在运行 v${prodV}，测试环境没有更新的版本。先在编辑器里发布新版本到测试环境。<//></div>`}
      ${version != null && !tested.some((v) => v.version === version) && html`<div className="integ-gap"><${Alert} tone="info">v${version} 没有部署过测试环境，只能推广在测试环境验证过的版本。<//></div>`}
      <${Field} label="推广的版本" required error=${selected && versionIssue ? versionIssue : null} hint=${`测试环境当前运行 ${testNow ? `v${testNow}` : '无'}，${env.name}当前运行 ${prodV ? `v${prodV}` : '无'}`}>
        <${Select}
          value=${ver}
          onChange=${setVer}
          options=${tested.map((v) => ({
            value: v.version,
            label: `v${v.version}${v.version === testNow ? '（测试环境当前版本）' : ''}`,
            desc: `${fmt.short(v.publishedAt)} · ${personName(v.publisher)}${v.note ? ` · ${v.note}` : ''}`,
            disabled: v.version <= prodV,
          }))}
        />
      <//>
      ${selected && !versionIssue && html`<div className="rel-promote-section">
        <div className="rel-promote-head">
          <span className="rel-promote-title">与${env.name}${prodV ? ` v${prodV}` : ''}的差异</span>
          <span className="text-xs muted">${diff && diff.initial ? '首次上线，全部节点都是新增' : `修改 ${diff.modified.length} · 新增 ${diff.added.length} · 删除 ${diff.removed.length}`}</span>
          <span className="spacer" />
          <${Button} size="xs" variant="ghost" icon="GitCompareArrows" onClick=${() => setDiffOpen(true)}>查看完整差异<//>
        </div>
        ${diffItems.length === 0
          ? html`<div className="text-xs muted">两个版本没有差异。</div>`
          : html`<ul className="rel-promote-changes">
            ${diffItems.slice(0, 5).map((it) => html`<li key=${`${it.kind}-${it.id}`}>
              <${NodeIcon} node=${it.node} size=${20} />
              <span className="grow ellipsis">${it.node.name}${it.fields ? html`<span className="muted">：${it.fields.map((f) => f.label).join('、')}</span>` : ''}</span>
              <${Tag} size="sm" tone=${REL_KIND[it.kind].tone}>${REL_KIND[it.kind].label}<//>
            </li>`)}
            ${diffItems.length > 5 && html`<li className="muted text-xs">还有 ${diffItems.length - 5} 处变化，在完整差异里查看</li>`}
          </ul>`}
      </div>`}
      ${selected && !versionIssue && html`<div className="rel-promote-section">
        <div className="rel-promote-head"><span className="rel-promote-title">上线前检查</span></div>
        <${RelChecks} checks=${checks} />
      </div>`}
      ${selected && !versionIssue && html`<div className="rel-promote-section">
        <div className="rel-promote-head"><span className="rel-promote-title">测试环境验证</span></div>
        <${RelEvidence} state=${s} wfId=${cur.id} version=${selected.version} limit=${3} />
      </div>`}
      <${Field} label="推广说明" required error=${noteError} hint="说明这次改了什么、在测试环境验证了什么，会显示给审批人">
        <div className="char-textarea">
          <${Textarea} value=${note} onChange=${(v) => { setNote(v.slice(0, 300)); setTouched(true); }} rows=${3} invalid=${Boolean(noteError)} placeholder="例：金额阈值改为读取项目配置，测试环境已验证 12 笔票据" />
          <span className="char-count">${note.length}/300</span>
        </div>
      <//>
      ${env.requireApproval
        ? html`<${Alert} tone="info" icon="UserCheck">${env.name}需要审批，提交后由 ${relNames(approvers)} 审批${approvers.includes(s.me) ? '（你是唯一的审批人，需要你本人确认上线）' : ''}，批准后自动上线。<//>`
        : html`<${Alert} tone="warning">${env.name}不需要审批，确认后 v${ver || ''} 立即替换${prodV ? `正在运行的 v${prodV}` : env.name}。<//>`}
    <//>
    ${selected && html`<${VersionDiffModal} open=${diffOpen} onClose=${() => setDiffOpen(false)} wf=${cur} baseVersion=${prodV || null} targetVersion=${selected.version} state=${s} />`}
  <//>`;
}

function relDiffDefaults(state, wf, baseVersion, targetVersion) {
  const versions = state.versions.filter((v) => v.workflowId === wf.id).map((v) => v.version).sort((a, b) => b - a);
  const prod = relProdVersion(wf) || null;
  const test = wf.test ? wf.test.version : null;
  const target = targetVersion != null ? targetVersion : test && (!prod || test > prod) ? test : wf.draftChanged || !versions.length ? 'draft' : versions[0];
  const fallbackBase = versions.find((v) => v !== target && (target === 'draft' || v < target));
  const base = baseVersion != null ? baseVersion : prod && prod !== target ? prod : fallbackBase ?? null;
  return { base, target };
}

function VersionDiffModal({ open, onClose, wf, baseVersion, targetVersion, state }) {
  const live = useStore();
  const [base, setBase] = useState(null);
  const [target, setTarget] = useState(null);
  const s = live || state;
  const cur = wf ? s.workflows.find((w) => w.id === wf.id) || wf : null;
  useEffect(() => {
    if (!open || !cur) return;
    const d = relDiffDefaults(s, cur, baseVersion, targetVersion);
    setBase(d.base);
    setTarget(d.target);
  }, [open]);
  if (!open || !cur) return null;
  const versions = s.versions.filter((v) => v.workflowId === cur.id).sort((a, b) => b.version - a.version);
  const prod = relProdVersion(cur);
  const test = cur.test ? cur.test.version : null;
  const envText = (n) => [n === test ? '测试环境' : null, n === prod ? '生产环境' : null].filter(Boolean).join('、');
  const options = [
    { value: 'draft', label: '当前草稿', desc: cur.draftChanged ? '编辑器里还没有发布的修改' : '和最新发布的版本相同' },
    ...versions.map((v) => ({ value: v.version, label: `v${v.version}${envText(v.version) ? `（${envText(v.version)}）` : ''}`, desc: `${fmt.short(v.publishedAt)} · ${personName(v.publisher)}${v.note ? ` · ${v.note}` : ''}` })),
  ];
  const label = (v) => (v === 'draft' ? '草稿' : `v${v}`);
  const baseGraph = base != null ? relGraphOf(s, cur, base) : null;
  const targetGraph = target != null ? relGraphOf(s, cur, target) : null;
  const same = base != null && base === target;
  return html`<${Modal}
    open=${true}
    onClose=${onClose}
    title="版本对比"
    description=${cur.name}
    width="calc(100vw - 48px)"
    className="rel-diff-modal"
    bodyClassName="rel-diff-modal-body"
  >
    <div className="rel-diff-toolbar">
      <span className="text-xs muted">基准</span>
      <${Select} width=${220} value=${base} onChange=${setBase} placeholder="选择基准版本" options=${options} />
      <${IconButton} icon="ArrowLeftRight" size="sm" variant="outline" title="交换基准和对比版本" disabled=${base == null || target == null} onClick=${() => { setBase(target); setTarget(base); }} />
      <span className="text-xs muted">对比</span>
      <${Select} width=${220} value=${target} onChange=${setTarget} placeholder="选择对比版本" options=${options} />
      <span className="spacer" />
      <span className="text-xs muted">画布上标出了对比版本相对基准版本的变化，回滚请在版本管理里操作</span>
    </div>
    ${versions.length === 0
      ? html`<${Empty} icon="History" title="还没有发布过版本" description="发布后，每个版本都可以在这里互相对比。" />`
      : same
        ? html`<${Empty} icon="Equal" title="选择两个不同的版本" description="基准版本和对比版本相同，没有可以对比的内容。" />`
        : !targetGraph || !baseGraph
          ? html`<${Empty} icon="GitCompareArrows" title="选择基准版本和对比版本" description="左边选旧的版本作为基准，右边选要检查的版本。" />`
          : html`<${RelDiffView} wf=${cur} baseGraph=${baseGraph} targetGraph=${targetGraph} baseLabel=${label(base)} targetLabel=${label(target)} className="rel-diff-full" />`}
  <//>`;
}
