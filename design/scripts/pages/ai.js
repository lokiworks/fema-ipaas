const aiBus = { listener: null, open: (opts) => aiBus.listener && aiBus.listener(opts || {}) };

function AiGenerateHost() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    aiBus.listener = (opts) => setSession({ key: uid('aig'), projectId: opts.projectId || null, prompt: String(opts.prompt || '').slice(0, AIGEN_MAX) });
    return () => { aiBus.listener = null; };
  }, []);
  if (!session) return null;
  return html`<${AiGenFlow} key=${session.key} projectId=${session.projectId} prompt=${session.prompt} onClose=${() => setSession(null)} />`;
}

function AiGenFlow({ projectId, prompt, onClose }) {
  const state = useStore();
  const editable = aigenEditable(state);
  const [text, setText] = useState(prompt);
  const [pid, setPid] = useState(() => aigenInitialProject(Store.get(), projectId));
  const [phase, setPhase] = useState('idle');
  const [tick, setTick] = useState(0);
  const [planned, setPlanned] = useState('');
  const [answers, setAnswers] = useState({});
  const [removed, setRemoved] = useState([]);
  const [conns, setConns] = useState({});
  const [connFor, setConnFor] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);
  const project = state.projects.find((p) => p.id === pid) || null;
  const planners = pid ? usableConnections(state, { connectors: AI_CONNECTORS, projectId: pid }).filter((c) => c.status === 'active') : [];
  const planner = planners.find((c) => c.connector === 'claude') || planners[0] || null;
  const limit = pid ? aigenLimit(state, pid) : null;
  const start = (value) => {
    const v = String(value === undefined ? text : value).trim();
    if (!v || !pid || !planner) return;
    clearTimers();
    setPlanned(v);
    setPhase('thinking');
    setTick(0);
    setRemoved([]);
    AIGEN_THINK_TICKS.forEach((ms, i) => timers.current.push(setTimeout(() => setTick(i + 1), ms)));
    timers.current.push(setTimeout(() => {
      setPhase('ready');
      const s = Store.get();
      const draft = aigenSafePlan({ text: v, pid, answers: {}, removed: [], conns: {}, state: s });
      const usage = aigenPlanTokens(v, aigenCatalog(s, pid).length, draft);
      aigenRecordUsage({ model: aigenModelName(s, planner.id), ...usage, projectId: pid, workflowId: null });
    }, AIGEN_THINK_MS));
  };
  useEffect(() => { if (prompt.trim()) start(prompt); }, []);
  const plan = useMemo(() => (phase === 'ready' && pid ? aigenSafePlan({ text: planned, pid, answers, removed, conns, state }) : null), [phase, planned, pid, answers, removed, conns, state]);
  const unanswered = plan && !plan.vague ? plan.questions.filter((q) => !q.answered).length : 0;
  const stale = phase === 'ready' && text.trim() !== planned;
  const reason = !editable.length ? '你还没有可编辑的项目'
    : !pid ? '先选择项目'
      : limit || (phase === 'thinking' ? '正在规划'
        : !plan ? '先描述需求，完成规划'
          : plan.vague ? '描述还不够具体，补充后重新规划'
            : stale ? '描述有修改，先重新规划'
              : !plan.stats.steps ? '至少保留一个步骤'
                : unanswered ? `还有 ${unanswered} 个问题待确认` : null);
  const requested = projectId && projectId !== pid ? state.projects.find((p) => p.id === projectId) : null;
  const moved = requested ? (canEditProject(state, requested.id) ? `「${requested.name}」的工作流数量已达上限，草稿会放到你选的项目里` : `你在「${requested.name}」只有查看权限，草稿会放到你能编辑的项目里`) : null;
  const requestClose = async () => {
    if (busy) return;
    if (plan && !plan.vague) {
      const ok = await confirmDialog({ title: '放弃这次规划？', content: '关闭后规划结果不会保存，下次需要重新描述。', okText: '放弃', cancelText: '继续编辑' });
      if (!ok) return;
    }
    clearTimers();
    onClose();
  };
  const generate = () => {
    if (reason || busy) return;
    setBusy(true);
    timers.current.push(setTimeout(() => {
      const s = Store.get();
      const fail = !s.projects.some((p) => p.id === pid) ? '项目不存在或已被删除' : !canEditProject(s, pid) ? '你在这个项目里没有编辑权限' : aigenLimit(s, pid);
      const fresh = fail ? null : aigenSafePlan({ text: planned, pid, answers, removed, conns, state: s });
      if (fail || !fresh || fresh.vague || !fresh.stats.steps) {
        setBusy(false);
        if (fail) toast.error(fail);
        return;
      }
      const base = newWorkflow({ projectId: pid, name: aigenUniqueName(s, pid, fresh.title), description: fresh.summary, trigger: fresh.graph.trigger, steps: fresh.graph.steps });
      const wf = { ...base, aiGenerated: { prompt: planned, at: Date.now() } };
      prependToList('workflows', wf);
      addAudit('AI 生成工作流', wf.name, pid);
      if (planner) aigenRecordUsage({ model: aigenModelName(s, planner.id), input: 900 + fresh.stats.nodes * 160 + fresh.stats.mapped * 40, output: 700 + fresh.stats.nodes * 180, projectId: pid, workflowId: wf.id });
      onClose();
      toast.success(`已生成「${wf.name}」，AI 生成的节点标为「待确认」`);
      navigate(`/integration/${pid}/wf/${wf.id}?mode=edit`);
    }, 500));
  };
  const append = (word) => setText((t) => `${t.trim()}${t.trim() ? '，' : ''}${word}`.slice(0, AIGEN_MAX));
  const answer = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));
  const answerAll = () => plan && setAnswers((a) => ({ ...a, ...Object.fromEntries(plan.questions.filter((q) => !q.answered).map((q) => [q.id, q.recommended])) }));
  const onKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      start();
    }
  };
  const main = !editable.length
    ? html`<${Empty} icon="FolderLock" title="你还没有可编辑的项目" description="AI 生成的工作流要放进一个你能编辑的项目。先新建项目，或者请项目所有者把你设为「可编辑」。" />`
    : phase === 'thinking'
      ? html`<${AiGenThinking} tick=${tick} project=${project} count=${aigenCatalog(state, pid).length} />`
      : !plan
        ? html`<${AiGenIntro} />`
        : plan.vague
          ? html`<${AiGenVague} plan=${plan} onAppend=${append} />`
          : html`<${AiGenPlan}
            plan=${plan}
            onAnswer=${answer}
            onAnswerAll=${answerAll}
            onRemove=${(key) => setRemoved((r) => [...new Set([...r, key])])}
            onRestore=${(key) => setRemoved((r) => r.filter((k) => k !== key))}
            onPickConn=${(key, value) => setConns((c) => ({ ...c, [key]: value === AIGEN_NONE ? '' : value }))}
            onNewConn=${(req) => setConnFor({ key: req.key, connector: req.kind === 'model' ? req.icon : req.connector })}
            onFix=${(conn) => setFixing(conn)}
          />`;
  const info = plan && !plan.vague && project
    ? html`<span className="ai-foot-info">将在「${project.name}」创建草稿 · ${plan.stats.nodes} 个节点${plan.stats.mapped > 0 ? ` · 预填 ${plan.stats.mapped} 个字段` : ''}${plan.stats.todo > 0 && html`<span className="ai-foot-warn"> · 生成后还有 ${plan.stats.todo} 处待补全</span>`}${reason && html`<span className="ai-foot-warn"> · ${reason}</span>`}</span>`
    : html`<span className="ai-foot-info muted">${reason || ''}</span>`;
  return html`<${Fragment}>
    <${Modal}
      open=${true}
      onClose=${requestClose}
      width=${1120}
      className="ai-gen-modal"
      bodyClassName="ai-gen-body"
      maskClosable=${false}
      icon=${html`<span className="ai-gen-icon"><${Icon} name="Sparkles" size=${18} /></span>`}
      title="用 AI 新建工作流"
      description="说说你想自动化的事情。AI 列出步骤、需要的连接和拿不准的问题，你确认后生成可编辑的草稿。"
      footer=${html`<div className="ai-foot">
        ${info}
        <${Button} onClick=${requestClose} disabled=${busy}>取消<//>
        <${Tooltip} content=${reason}>
          <${Button} variant="primary" icon="WandSparkles" loading=${busy} disabled=${Boolean(reason)} onClick=${generate}>${busy ? '生成中' : '生成工作流草稿'}<//>
        <//>
      </div>`}
    >
      <aside className="ai-gen-side">
        <${Field} label="描述你想自动化的事情" extra=${html`<span className="text-xs muted">${text.length}/${AIGEN_MAX}</span>`}>
          <textarea
            className="textarea ai-gen-text"
            rows=${7}
            value=${text}
            maxLength=${AIGEN_MAX}
            autoFocus=${!prompt}
            aria-label="描述你想自动化的事情"
            placeholder="例如：员工在北森完成入职后，在飞书多维表格建档，按部门开通 GitHub 和 Jira 账号，并通知 HR 群"
            onChange=${(e) => setText(e.target.value.slice(0, AIGEN_MAX))}
            onKeyDown=${onKey}
          />
        <//>
        <div className="ai-gen-examples">
          <div className="text-xs muted">试试这些例子</div>
          <div className="ai-gen-chips">
            ${AIGEN_EXAMPLES.map((ex) => html`<button key=${ex.key} type="button" className="chip" disabled=${!planner || phase === 'thinking'} onClick=${() => { setText(ex.prompt); start(ex.prompt); }}>${ex.label}</button>`)}
          </div>
        </div>
        <${Field} label="放到哪个项目" required hint=${moved || '只列出你能编辑的项目'}>
          <${Select}
            value=${pid}
            onChange=${setPid}
            placeholder=${editable.length ? '选择项目' : '没有可编辑的项目'}
            disabled=${!editable.length}
            options=${editable.map((p) => ({ value: p.id, label: p.name, disabled: Boolean(aigenLimit(state, p.id)), desc: aigenLimit(state, p.id) ? '工作流数量已达上限' : '', iconNode: html`<${ProjectAvatar} project=${p} size=${18} />` }))}
          />
        <//>
        ${pid && (planner
          ? html`<div className="ai-gen-model"><${Icon} name="Cpu" size=${14} /><span>由「${planner.name}」规划，只用这个项目里能用的连接器和连接</span></div>`
          : html`<${Alert} tone="warning" title="需要一个大模型连接" action=${html`<${Button} size="sm" onClick=${() => setConnFor({ key: null, connector: 'claude' })}>新建连接<//>`}>AI 规划要调用大模型。这个项目里还没有可用的 Claude、OpenAI 或 DeepSeek 连接。<//>`)}
        <${Button} variant=${phase === 'ready' && !stale ? 'outline' : 'primary'} block icon=${phase === 'ready' ? 'RefreshCw' : 'Sparkles'} loading=${phase === 'thinking'} disabled=${!pid || !planner || !text.trim()} onClick=${() => start()}>${phase === 'thinking' ? '规划中' : phase === 'ready' ? '重新规划' : '开始规划'}<//>
        ${stale && html`<div className="ai-gen-stale"><${Icon} name="PenLine" size=${14} /><span>描述有修改，点「重新规划」更新步骤</span></div>`}
        <div className="text-xs muted ai-gen-tip">${shortcutLabel('mod+enter')} 开始规划。写清楚哪个系统、什么事件、要做什么、通知谁，规划会更准。</div>
      </aside>
      <section className="ai-gen-main" aria-live="polite">${main}</section>
    <//>
    <${NewConnectionModal}
      open=${Boolean(connFor)}
      onClose=${() => setConnFor(null)}
      presetConnector=${connFor ? connFor.connector : null}
      presetProject=${pid}
      onCreated=${(conn) => { if (connFor && connFor.key) setConns((c) => ({ ...c, [connFor.key]: conn.id })); }}
    />
    <${NewConnectionModal} open=${Boolean(fixing)} onClose=${() => setFixing(null)} existing=${fixing} reauth />
  <//>`;
}

function AiGenIntro() {
  return html`<div className="ai-intro">
    <div className="ai-intro-icon"><${Icon} name="Sparkles" size=${22} /></div>
    <div className="ai-intro-title">说说你想自动化什么</div>
    <p className="muted ai-intro-desc">在左边写下需求，或者点一个例子。生成的草稿里，AI 建的每个节点都标为「待确认」，你逐个检查后再调试和发布。</p>
    <div className="ai-intro-grid">
      ${AIGEN_INTRO.map((it) => html`<div key=${it.title} className="ai-intro-item">
        <span className="ai-intro-item-icon"><${Icon} name=${it.icon} size=${16} /></span>
        <div><div className="ai-intro-item-title">${it.title}</div><div className="text-xs muted">${it.desc}</div></div>
      </div>`)}
    </div>
  </div>`;
}

function AiGenThinking({ tick, project, count }) {
  const rows = [
    { key: 'read', label: '理解描述' },
    { key: 'match', label: `在 ${count} 个连接器和 MCP 服务器里匹配` },
    { key: 'conn', label: `检查「${project ? project.name : '项目'}」里能用的连接` },
    { key: 'plan', label: '整理步骤、字段映射和待确认的问题' },
  ];
  return html`<div className="ai-think" role="status">
    <div className="ai-think-title"><${Icon} name="Sparkles" size=${16} /><span>正在规划</span></div>
    <div className="ai-think-rows">
      ${rows.map((r, i) => html`<div key=${r.key} className=${cx('ai-think-row', i < tick && 'is-done', i === tick && 'is-current')}>
        ${i < tick ? html`<${Icon} name="CircleCheck" size=${16} />` : i === tick ? html`<${Icon} name="LoaderCircle" size=${16} className="spin" />` : html`<${Icon} name="Circle" size=${16} />`}
        <span>${r.label}</span>
      </div>`)}
    </div>
    <div className="ai-think-skeleton">
      ${[64, 52, 58, 44].map((w, i) => html`<div key=${i} className="ai-think-line">
        <div className="skeleton ai-think-tile" />
        <div className="grow"><div className="skeleton" style=${{ width: `${w}%`, height: 12 }} /><div className="skeleton ai-think-sub" style=${{ width: `${w - 18}%`, height: 10 }} /></div>
      </div>`)}
    </div>
  </div>`;
}

function AiGenVague({ plan, onAppend }) {
  return html`<div className="ai-vague">
    <div className="ai-vague-icon"><${Icon} name="MessageCircleQuestion" size=${22} /></div>
    <div className="ai-vague-title">${plan.title}</div>
    <p className="muted">${plan.reason} AI 不会凭空猜系统，补充下面这些信息后点「重新规划」。</p>
    <div className="ai-vague-asks">
      ${plan.asks.map((a) => html`<div key=${a} className="ai-vague-ask"><${Icon} name="CircleDot" size=${14} /><span>${a}</span></div>`)}
    </div>
    ${plan.notes.map((n, i) => html`<${Alert} key=${i} tone=${n.tone || 'warning'} className="ai-plan-note">${n.text}<//>`)}
    ${plan.suggest.length > 0 && html`<div className="ai-vague-block">
      <div className="text-xs muted">这个项目里已经能用的系统，点一下加进描述</div>
      <div className="ai-gen-chips">${plan.suggest.map((c) => html`<button key=${c.id} type="button" className="chip ai-sys-chip" onClick=${() => onAppend(c.name)}><${ConnectorIcon} connector=${c} size=${16} /><span>${c.name}</span></button>`)}</div>
    </div>`}
    <div className="ai-vague-block">
      <div className="text-xs muted">可以照这个句式写</div>
      <div className="ai-vague-pattern">当「哪个系统」发生「什么事件」时，在「哪个系统」里「做什么」，最后通知「谁」。</div>
    </div>
  </div>`;
}

function AiGenPlan({ plan, onAnswer, onAnswerAll, onRemove, onRestore, onPickConn, onNewConn, onFix }) {
  const unanswered = plan.questions.filter((q) => !q.answered).length;
  const firstMapped = aigenFirstMapped([plan.view.trigger, ...plan.view.steps]);
  const missing = plan.requirements.filter((r) => r.kind !== 'mcp' && !r.selected).length;
  const warn = plan.requirements.filter((r) => r.selected && r.problem).length;
  return html`<div className="ai-plan">
    <div className="ai-plan-summary">
      <div className="ai-plan-kicker">
        <${Icon} name="Sparkles" size=${14} />
        <span>AI 规划</span>
        <span className="spacer" />
        <span className="text-xs muted">${plan.systems.length} 个系统 · ${plan.stats.nodes} 个节点</span>
      </div>
      <div className="ai-plan-title">${plan.title}</div>
      <p className="ai-plan-text">${plan.summary}</p>
      ${plan.systems.length > 0 && html`<div className="ai-plan-systems">${plan.systems.map((c) => html`<span key=${c.id} className="ai-plan-system"><${ConnectorIcon} connector=${c} size=${16} /><span>${c.name}</span></span>`)}</div>`}
    </div>
    ${plan.notes.map((n, i) => html`<${Alert} key=${i} tone=${n.tone || 'warning'} className="ai-plan-note">${n.text}<//>`)}
    ${plan.questions.length > 0 && html`<section className="ai-plan-section">
      <div className="ai-plan-head">
        <span className="ai-plan-h">待确认问题</span>
        <${Tag} size="sm" tone=${unanswered ? 'warning' : 'success'}>${unanswered ? `${unanswered} 个待确认` : '已全部确认'}<//>
        <span className="spacer" />
        ${unanswered > 0 && html`<${Button} size="xs" variant="ghost" icon="CheckCheck" onClick=${onAnswerAll}>全部采用推荐答案<//>`}
      </div>
      <div className="ai-qs">${plan.questions.map((q, i) => html`<${AiGenQuestion} key=${q.id} q=${q} index=${i + 1} onAnswer=${onAnswer} />`)}</div>
    </section>`}
    <section className="ai-plan-section">
      <div className="ai-plan-head">
        <span className="ai-plan-h">步骤</span>
        <span className="text-xs muted">${plan.stats.steps} 个步骤${plan.removedCount ? ` · 已移除 ${plan.removedCount} 个` : ''}</span>
      </div>
      <div className="ai-steps">
        <${AiGenStep} s=${plan.view.trigger} firstMapped=${firstMapped} onRemove=${onRemove} onRestore=${onRestore} />
        ${plan.view.steps.map((s) => html`<${AiGenStep} key=${s.key} s=${s} firstMapped=${firstMapped} onRemove=${onRemove} onRestore=${onRestore} />`)}
      </div>
    </section>
    <section className="ai-plan-section">
      <div className="ai-plan-head">
        <span className="ai-plan-h">需要的连接</span>
        <span className="text-xs muted">${plan.requirements.length ? [missing ? `${missing} 个待选择或新建` : '都已选好', warn ? `${warn} 个连接异常` : ''].filter(Boolean).join(' · ') : ''}</span>
      </div>
      ${plan.requirements.length === 0
        ? html`<div className="ai-plan-empty">这些步骤都不需要连接。</div>`
        : html`<div className="ai-conns">${plan.requirements.map((r) => html`<${AiGenConnRow} key=${r.key} req=${r} onPick=${onPickConn} onNew=${onNewConn} onFix=${onFix} />`)}</div>`}
    </section>
    ${plan.assumptions.length > 0 && html`<section className="ai-plan-section">
      <div className="ai-plan-head"><span className="ai-plan-h">假设</span><span className="text-xs muted">描述里没说清、AI 先这样处理的地方，生成后都可以改</span></div>
      <ul className="ai-assume">${plan.assumptions.map((a) => html`<li key=${a}>${a}</li>`)}</ul>
    </section>`}
  </div>`;
}

function AiGenQuestion({ q, index, onAnswer }) {
  return html`<div className=${cx('ai-q', !q.answered && 'is-open')}>
    <div className="ai-q-head">
      <span className="ai-q-no">${index}</span>
      <span className="ai-q-title">${q.title}</span>
      ${q.answered ? html`<${Tag} size="sm" tone="success" icon="Check">已确认<//>` : html`<${Tag} size="sm" tone="warning">待确认<//>`}
    </div>
    ${q.desc && html`<div className="ai-q-desc">${q.desc}</div>`}
    <div className="ai-q-options" role="radiogroup" aria-label=${q.title}>
      ${q.options.map((o) => {
        const active = q.answered && q.value === o.value;
        const rec = o.value === q.recommended;
        return html`<button key=${o.value} type="button" role="radio" aria-checked=${active} className=${cx('ai-chip', active && 'is-active', !q.answered && rec && 'is-recommended')} onClick=${() => onAnswer(q.id, o.value)}>
          ${active && html`<${Icon} name="Check" size=${12} />`}
          <span>${o.label}</span>
          ${rec && html`<span className="ai-chip-rec">推荐</span>`}
        </button>`;
      })}
    </div>
  </div>`;
}

function AiGenStep({ s, firstMapped, onRemove, onRestore }) {
  const off = s.removed || s.inactive;
  return html`<div className=${cx('ai-step', off && 'is-removed', s.kind === 'trigger' && 'is-trigger')}>
    <div className="ai-step-row">
      <span className="ai-step-no">${s.kind === 'trigger' ? html`<${Icon} name="Zap" size=${12} />` : off ? html`<${Icon} name="Minus" size=${12} />` : s.no}</span>
      <${NodeIcon} node=${s.iconNode} size=${28} />
      <div className="ai-step-body">
        <div className="ai-step-title">
          <span className="ellipsis">${s.name}</span>
          ${s.removed && html`<${Tag} size="sm">已移除<//>`}
          ${s.inactive && html`<${Tag} size="sm">随上一级移除<//>`}
        </div>
        <div className="ai-step-sub ellipsis">${s.sub}</div>
        ${!off && s.why && html`<div className="ai-step-why">${s.why}</div>`}
        ${!off && s.deps.length > 0 && html`<div className="ai-step-tags">${s.deps.map((d) => html`<${Tag} key=${d} size="sm" tone="info" icon="MessageCircleQuestion">取决于：${d}<//>`)}</div>`}
        ${!off && s.issues.length > 0 && html`<div className="ai-step-todo"><${Icon} name="PencilLine" size=${13} /><span>生成后需要补全：${s.issues.join('；')}</span></div>`}
        ${!off && s.tools && s.tools.length > 0 && html`<div className="ai-tools">
          ${s.tools.map((t) => html`<div key=${t.key} className="ai-tool">
            <${ConnectorIcon} id=${t.connector} size=${18} />
            <span className="grow ellipsis">${t.label}</span>
            ${t.mcp && html`<${Tag} size="sm">MCP 工具<//>`}
            ${t.approval ? html`<${Tag} size="sm" tone="warning" icon="UserCheck">需要人工确认<//>` : html`<${Tag} size="sm" tone="outline">自动调用<//>`}
          </div>`)}
        </div>`}
        ${!off && s.mapping && html`<${AiGenMapping} m=${s.mapping} defaultOpen=${firstMapped === s.key} />`}
      </div>
      <div className="ai-step-act">
        ${s.kind === 'trigger'
          ? html`<${Tooltip} content="触发器不能移除，生成后可以在编辑器里更换"><span className="ai-step-lock" tabIndex=${0} aria-label="触发器不能移除"><${Icon} name="Lock" size=${14} /></span><//>`
          : s.removed
            ? html`<${Button} size="xs" variant="ghost" icon="RotateCcw" onClick=${() => onRestore(s.key)}>恢复<//>`
            : s.inactive ? null : html`<${IconButton} icon="Trash2" size="sm" title="移除这一步" onClick=${() => onRemove(s.key)} />`}
      </div>
    </div>
    ${s.paths && html`<div className="ai-branch">
      ${s.paths.map((p) => html`<div key=${p.key} className="ai-branch-path">
        <div className="ai-branch-label"><${Icon} name="CornerDownRight" size=${14} /><span>${p.label}</span></div>
        ${p.steps.length
          ? p.steps.map((c) => html`<${AiGenStep} key=${c.key} s=${c} firstMapped=${firstMapped} onRemove=${onRemove} onRestore=${onRestore} />`)
          : html`<div className="ai-branch-empty">不做处理，直接进入下一步</div>`}
      </div>`)}
    </div>`}
  </div>`;
}

function AiGenMapping({ m, defaultOpen }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return html`<div className="ai-map">
    <button type="button" className="ai-map-toggle" aria-expanded=${open} onClick=${() => setOpen(!open)}>
      <${Icon} name="ArrowLeftRight" size=${14} />
      <span>字段映射：已预填 ${m.rows.length}/${m.total} 个字段</span>
      ${m.missing.length > 0 && html`<${Tag} size="sm" tone="danger">${m.missing.length} 个必填字段没有来源<//>`}
      <span className="spacer" />
      <${Icon} name=${open ? 'ChevronUp' : 'ChevronDown'} size=${14} />
    </button>
    ${open && html`<div className="ai-map-body">
      ${m.rows.length > 0 && html`<table className="ai-map-table">
        <thead><tr><th>目标字段</th><th>来源</th><th>样例结果</th></tr></thead>
        <tbody>${m.rows.map((r) => html`<tr key=${r.target}>
          <td className="ai-map-target">${r.target}${r.required && html`<span className="ai-map-req">*</span>`}</td>
          <td>
            <div className="ai-map-source">${r.constant !== undefined ? `固定值「${r.constant}」` : r.sourceLabel}</div>
            ${(r.transforms.length > 0 || r.reason) && html`<div className="ai-map-why">${[r.reason, ...r.transforms.map(aigenTransformLabel)].filter(Boolean).join(' · ')}</div>`}
          </td>
          <td className=${cx('ai-map-value', r.error && 'is-error')}>${r.error || aigenValueText(r.value)}</td>
        </tr>`)}</tbody>
      </table>`}
      ${m.missing.length > 0 && html`<div className="ai-map-missing"><${Icon} name="CircleAlert" size=${13} /><span>必填字段${m.missing.map((f) => `「${f}」`).join('')}没有找到来源，生成后在编辑器里补上</span></div>`}
      ${m.low.length > 0 && html`<div className="ai-map-note">没有自动采用的低置信度建议：${m.low.map((l) => `${l.target} 可能对应 ${l.sourceLabel}（${Math.round(l.confidence * 100)}%）`).join('；')}</div>`}
      ${m.unmatched.length > 0 && html`<div className="ai-map-note">没有对上的选填字段：${m.unmatched.join('、')}</div>`}
    </div>`}
  </div>`;
}

function AiGenConnRow({ req, onPick, onNew, onFix }) {
  if (req.kind === 'mcp') {
    return html`<div className="ai-conn">
      <${ConnectorIcon} id=${req.connector} size=${28} />
      <div className="ai-conn-body">
        <div className="ai-conn-title"><span>${req.label}</span><${Tag} size="sm" tone="success" dot>已连接<//></div>
        <div className="text-xs muted ellipsis">外部 MCP 服务器，不需要单独的连接 · 用于：${req.usedBy.join('、')}</div>
      </div>
    </div>`;
  }
  const options = [
    ...req.options.map((c) => ({ value: c.id, label: c.name, desc: c.status === 'active' ? '已连接' : (CONN_STATUS[c.status] || CONN_STATUS.error).reason, iconNode: html`<${ConnectorIcon} id=${c.connector} size=${18} />` })),
    { value: AIGEN_NONE, label: '暂不选择', desc: '生成后在编辑器里再选' },
  ];
  return html`<div className=${cx('ai-conn', !req.selected && 'is-missing')}>
    <${ConnectorIcon} id=${req.icon} size=${28} />
    <div className="ai-conn-body">
      <div className="ai-conn-title">
        <span>${req.label}</span>
        ${req.model && html`<span className="text-xs muted">模型 ${req.model}</span>`}
      </div>
      <div className="text-xs muted ellipsis" title=${req.usedBy.join('、')}>用于：${req.usedBy.join('、')}</div>
      ${!req.options.length && html`<div className="ai-conn-warn"><${Icon} name="Link2Off" size=${13} /><span>这个项目里还没有能用的${req.label}连接，可以现在新建，也可以生成后再补</span></div>`}
      ${req.selected && req.problem && html`<div className="ai-conn-warn">
        <${Icon} name="TriangleAlert" size=${13} />
        <span>${req.problem}，调试前需要处理。${req.canFix ? '' : req.ownerName ? `只有所有者${req.ownerName}能重新授权，也可以换一个连接。` : ''}</span>
        ${req.canFix && html`<${Button} size="xs" variant="link" onClick=${() => onFix(req.conn)}>重新授权<//>`}
      </div>`}
      ${req.selected && req.envNote && html`<div className="text-xs muted">${req.envNote}</div>`}
    </div>
    <div className="ai-conn-pick">
      ${req.options.length
        ? html`<${Select}
          size="sm"
          width=${220}
          value=${req.selected || AIGEN_NONE}
          onChange=${(v) => onPick(req.key, v)}
          options=${options}
          footer=${html`<button type="button" className="menu-item" onClick=${() => onNew(req)}><${Icon} name="Plus" size=${16} /><span className="menu-item-body"><span className="menu-item-label">新建连接</span></span></button>`}
        />`
        : html`<${Button} size="sm" icon="Plus" onClick=${() => onNew(req)}>新建连接<//>`}
    </div>
  </div>`;
}

function aigenSafePlan(args) {
  try {
    return aigenPlan(args);
  } catch (e) {
    console.error(e);
    return { vague: true, title: '这次没能完成规划', reason: '规划时出了点问题，换个说法再试一次。', asks: [], suggest: [], notes: [] };
  }
}

function aigenRecordUsage({ model, input, output, projectId, workflowId }) {
  if (typeof recordAiUsage === 'function') recordAiUsage({ source: 'generate', model, input, output, projectId, workflowId });
}

function aigenPlanTokens(text, catalogCount, plan) {
  const input = 1800 + Math.round(String(text).length * 1.6) + catalogCount * 14;
  const output = plan.vague ? 260 : 420 + plan.stats.nodes * 90 + plan.questions.length * 60 + plan.assumptions.length * 30;
  return { input, output };
}

function aigenEditable(state) {
  return state.projects.filter((p) => canEditProject(state, p.id));
}

function aigenLimit(state, pid) {
  const p = state.projects.find((x) => x.id === pid);
  const cap = p && p.limits && p.limits.workflows;
  const count = state.workflows.filter((w) => w.projectId === pid).length;
  return cap && count >= cap ? `项目「${p.name}」的工作流数量已达上限（${cap} 个），请联系平台管理员调整` : null;
}

function aigenUniqueName(state, pid, base) {
  const taken = new Set(state.workflows.filter((w) => w.projectId === pid).map((w) => w.name));
  const stem = String(base || 'AI 生成的工作流').slice(0, 90);
  if (!taken.has(stem)) return stem;
  const n = Array.from({ length: taken.size + 1 }, (_, i) => i + 2).find((i) => !taken.has(`${stem} (${i})`));
  return `${stem} (${n})`;
}

function aigenInitialProject(state, requested) {
  const all = aigenEditable(state);
  const room = all.filter((p) => !aigenLimit(state, p.id));
  const hit = [requested, state.currentProjectId].find((id) => room.some((p) => p.id === id));
  return hit || (room[0] || all[0] || {}).id || null;
}

function aigenFirstMapped(steps) {
  const walk = (list) => list.reduce((found, s) => found || (!s.removed && !s.inactive && s.mapping ? s.key : (s.paths || []).reduce((f, p) => f || walk(p.steps), null)), null);
  return walk(steps);
}

function aigenTransformLabel(t) {
  const meta = MAP_TRANSFORMS[t.type];
  if (!meta) return t.type;
  if (t.type === 'lookup') return '查映射表';
  return t.arg ? `${meta.label} ${t.arg}` : meta.label;
}

function aigenValueText(v) {
  if (v === undefined || v === null || v === '') return '（空）';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function aigenNorm(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '');
}

function aigenIndexAll(tc, word) {
  const w = aigenNorm(word);
  if (!w) return [];
  const ascii = /[a-z0-9]/;
  const hits = [];
  let i = tc.indexOf(w);
  while (i >= 0) {
    const okBefore = !ascii.test(w[0]) || i === 0 || !ascii.test(tc[i - 1]);
    const okAfter = !ascii.test(w[w.length - 1]) || i + w.length >= tc.length || !ascii.test(tc[i + w.length]);
    if (okBefore && okAfter) hits.push({ index: i, length: w.length });
    i = tc.indexOf(w, i + 1);
  }
  return hits;
}

function aigenReHits(tc, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...tc.matchAll(g)].map((m) => ({ index: m.index, length: m[0].length }));
}

function aigenHit(tc, words, skips) {
  const spans = skips || [];
  return words
    .flatMap((w) => (w instanceof RegExp ? aigenReHits(tc, w) : aigenIndexAll(tc, w)))
    .filter((h) => !spans.some((x) => h.index < x.index + x.length && h.index + h.length > x.index))
    .reduce((best, h) => (!best || h.index < best.index ? h : best), null);
}

function aigenCatalog(state, pid) {
  return [...CONNECTORS.filter((c) => !c.builtin), ...publishedCustomConnectors(state), ...mcpConnectors(state, pid)];
}

function aigenAliases(c) {
  const name = String(c.name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  const parts = c.custom || c.mcp ? name.split(/[\s·]+/).filter((p) => !AIGEN_GENERIC_PARTS.includes(p.toLowerCase())) : [];
  return [...new Set([...(AIGEN_ALIASES[c.id] || []), name, ...parts].map(aigenNorm).filter((x) => x.length >= 2))];
}

function aigenMentions(tc, list, spans) {
  return list
    .map((c) => ({ id: c.id, hit: aigenHit(tc, aigenAliases(c), spans) }))
    .filter((m) => m.hit)
    .map((m) => ({ id: m.id, index: m.hit.index }))
    .sort((a, b) => a.index - b.index);
}

function aigenContext({ text, pid, answers, removed, state }) {
  const tc = aigenNorm(text);
  const catalog = aigenCatalog(state, pid);
  const ready = new Set(catalog.map((c) => c.id));
  const off = [
    ...state.customConnectors.filter((c) => c.status !== 'published').map((cc) => ({ kind: 'draft', c: customAsConnector(cc) })),
    ...(state.mcpClients || []).filter((mc) => !ready.has(mc.id)).map((mc) => ({ kind: 'mcp', c: mcpClientAsConnector(mc), mc })),
  ].map((o) => ({ ...o, hit: aigenHit(tc, aigenAliases(o.c)) })).filter((o) => o.hit);
  const unknown = AIGEN_UNKNOWN.map((u) => ({ u, hit: aigenHit(tc, u.words) })).filter((x) => x.hit);
  const mentions = aigenMentions(tc, catalog, [...off, ...unknown].map((x) => x.hit));
  const envs = projectEnvs(state, pid);
  const testTargets = new Set(envs.filter((e) => e.key === 'test').flatMap((e) => Object.values(e.connectionMap || {})));
  const removedSet = new Set(removed || []);
  return {
    text: String(text || '').trim(),
    tc,
    state,
    pid,
    catalog,
    mentions,
    envs,
    testTargets,
    removedSet,
    off,
    unknown,
    unavailable: [...off.map((o) => o.c.name), ...unknown.map((x) => x.u.name)],
    answers: answers || {},
    project: state.projects.find((p) => p.id === pid) || null,
    find: (words) => { const h = aigenHit(tc, words); return h ? h.index : -1; },
    mentioned: (id) => mentions.some((m) => m.id === id),
    has: (key) => !removedSet.has(key),
    usable: (connector) => usableConnections(state, { connector, projectId: pid }).filter((c) => !testTargets.has(c.id)),
    hasVar: (key) => state.variables.some((v) => v.projectId === pid && v.key === key),
    varValue: (key) => { const v = state.variables.find((x) => x.projectId === pid && x.key === key); return v ? (v.values || {}).default : undefined; },
    available: (id) => catalog.some((c) => c.id === id),
  };
}

function aigenAnswer(ctx, q) {
  if (!q) return null;
  const v = ctx.answers[q.id];
  return q.options.some((o) => o.value === v) ? v : q.recommended;
}

function aigenTrig(connector, op, extra) {
  return { key: 'trigger', kind: 'trigger', connector, op, deps: [], ...extra };
}

function aigenAct(key, connector, op, extra) {
  return { key, kind: 'action', connector, op, deps: [], ...extra };
}

function aigenImPick(ctx) {
  const said = ctx.mentions.map((m) => m.id).find((id) => AIGEN_IMS.includes(id));
  if (said) return { im: said, said: true };
  return { im: AIGEN_IMS.find((id) => ctx.usable(id).length) || 'feishu', said: false };
}

function aigenImLabel(im, target) {
  const group = { feishu: '飞书群', wecom: '企业微信群', dingtalk: '钉钉群', slack: 'Slack 频道', 'microsoft-teams': 'Teams 频道' };
  const person = { feishu: '飞书私信', wecom: '企业微信应用消息', dingtalk: '钉钉工作通知', slack: 'Slack 私信', 'microsoft-teams': 'Teams 消息' };
  return (target === 'group' ? group : person)[im] || im;
}

function aigenNotify(key, im, opts) {
  const { target, receiver, content, template } = opts;
  const extra = { name: opts.name, why: opts.why, phrase: opts.phrase, deps: opts.deps || [] };
  if (im === 'feishu') {
    if (target === 'group' && template) return aigenAct(key, 'feishu', 'send_card', { ...extra, config: { receiveType: '群聊', receiver, template } });
    return aigenAct(key, 'feishu', 'send_message', { ...extra, config: { receiveType: target === 'group' ? '群聊' : '用户', receiver, content } });
  }
  if (im === 'wecom') return target === 'group' ? aigenAct(key, 'wecom', 'robot_message', { ...extra, config: { content } }) : aigenAct(key, 'wecom', 'send_app_message', { ...extra, config: { receiver, content } });
  if (im === 'dingtalk') return target === 'group' ? aigenAct(key, 'dingtalk', 'robot_message', { ...extra, config: { content } }) : aigenAct(key, 'dingtalk', 'send_work_notice', { ...extra, config: { receiver, content } });
  if (im === 'slack') return aigenAct(key, 'slack', 'send_message', { ...extra, config: { receiver, content } });
  return aigenAct(key, 'microsoft-teams', 'send_message', { ...extra, config: { receiver, content } });
}

function aigenImQuestion(ctx, id, recommended) {
  const options = [...new Set(['feishu', 'wecom', 'dingtalk', recommended])].map((im) => ({ value: im, label: aigenImLabel(im, 'group') }));
  return { id, short: '发到哪里', title: '消息发到哪个 IM？', desc: '描述里没有说用哪个 IM，推荐的是这个项目里已经有连接的。', options, recommended };
}

function aigenModelName(state, connId) {
  const conn = connId ? state.connections.find((c) => c.id === connId) : null;
  return (conn && AIGEN_MODELS[conn.connector]) || AIGEN_MODELS.claude;
}

function aigenOnboard(ctx) {
  const sourceSaid = ctx.find(['北森', 'italent', '人事系统', 'hr系统']) >= 0 ? 'beisen' : ctx.find(['飞书通讯录', '通讯录']) >= 0 ? 'feishu' : null;
  const qSource = sourceSaid ? null : { id: 'source', short: '入职事件来源', title: '入职事件从哪里来？', desc: '描述里没有说是哪个系统通知入职，决定工作流由谁触发。', options: [{ value: 'beisen', label: '北森入职完成' }, { value: 'feishu', label: '飞书通讯录新增员工' }], recommended: ctx.usable('beisen').length ? 'beisen' : 'feishu' };
  const beisen = (sourceSaid || aigenAnswer(ctx, qSource)) === 'beisen';
  const ref = beisen
    ? { id: '{{trigger.employee_id}}', name: '{{trigger.name}}', dept: '{{trigger.department}}', position: '{{trigger.position}}', manager: '{{trigger.manager}}', email: '{{trigger.email}}' }
    : { id: '{{trigger.user.open_id}}', name: '{{trigger.user.name}}', dept: '', position: '', manager: '', email: '{{trigger.user.email}}' };
  const wantRecord = ctx.find(['建档', '档案', '登记', '台账', '多维表格', '花名册']) >= 0;
  const accountSaid = ctx.find(['开通', '账号', '账户']) >= 0;
  const namedGithub = ctx.mentioned('github');
  const namedJira = ctx.mentioned('jira');
  const feishuAccount = beisen && accountSaid && !namedGithub && !namedJira;
  const accounts = feishuAccount ? { github: false, jira: false } : { github: namedGithub || (accountSaid && !namedJira), jira: namedJira || (accountSaid && !namedGithub) };
  const byDept = ctx.find(['按部门', '部门', '研发']) >= 0;
  const deptMap = (ctx.state.mappingTables || []).find((t) => t.projectId === ctx.pid && t.keyLabel.includes('北森部门'));
  const welcomeSaid = ctx.find(['欢迎']) >= 0;
  const accountSteps = [
    accounts.github && aigenAct('github', 'github', 'create_issue', { name: '邀请加入 GitHub 组织', phrase: '邀请加入 GitHub 组织', why: '在 it-requests 仓库建一条开通请求，由组织管理员发出邀请', config: { repo: 'xinghe/it-requests', title: `开通 GitHub：${ref.name}` } }),
    accounts.jira && aigenAct('jira', 'jira', 'create_issue', { name: '创建 Jira 账号工单', phrase: '建 Jira 账号工单', why: '在 Jira 的 IT 项目建一张工单，由 IT 开通账号', config: { project: 'IT', issueType: '任务', summary: `开通 Jira：${ref.name}` } }),
  ].filter(Boolean);
  const accountNames = accountSteps.map((s) => (s.key === 'github' ? 'GitHub' : 'Jira')).join(' 和 ');
  const profile = !beisen && byDept && accountSteps.length > 0;
  const deptTable = (ctx.state.mappingTables || []).find((t) => t.projectId === ctx.pid && t.rows.some((r) => r.k === '研发中心'));
  const deptId = deptTable ? deptTable.rows.find((r) => r.k === '研发中心').v : '研发中心';
  const groupSaid = ctx.find(['群']) >= 0;
  const managerSaid = ctx.find(['上级', '经理', '主管', 'leader']) >= 0;
  const notifySaid = ctx.find(['通知', '提醒', '告知', '发到', '推送', '发消息', '欢迎']) >= 0 || groupSaid;
  const notifyClear = groupSaid !== managerSaid;
  const qNotify = notifySaid && !notifyClear ? { id: 'notify', short: '通知谁', title: '开通结果通知谁？', desc: '决定最后一步是发到 HR 群，还是私信新员工的直属上级。', options: [{ value: 'group', label: 'HR 群' }, { value: 'manager', label: '直属上级' }, { value: 'both', label: '都通知' }], recommended: groupSaid && managerSaid ? 'both' : managerSaid ? 'manager' : 'group' } : null;
  const qDedupe = { id: 'dedupe', short: '重复事件', title: '同一个员工的入职事件重复推送时怎么处理？', desc: `${beisen ? '北森' : '飞书'}偶尔会重复推送同一条记录，去重可以避免重复开通账号。`, options: [{ value: 'on', label: '去重（30 天内同一员工只处理一次）' }, { value: 'off', label: '不去重' }], recommended: 'on' };
  const notify = qNotify ? aigenAnswer(ctx, qNotify) : notifySaid ? (groupSaid ? 'group' : 'manager') : null;
  const dedupe = aigenAnswer(ctx, qDedupe) === 'on';
  const im = aigenImPick(ctx).im;
  const hrChat = im === 'feishu' && ctx.hasVar('hr_group_chat_id') ? '{{config.hr_group_chat_id}}' : 'HR 入职服务群';
  const trigger = beisen
    ? aigenTrig('beisen', 'onboarding_completed', { name: '员工入职完成', when: '北森里有员工完成入职', why: '北森里的入职流程办完后触发，每 5 分钟检查一次新记录', config: { interval: '5 分钟' }, deps: [qSource && 'source', 'dedupe'].filter(Boolean) })
    : aigenTrig('feishu', 'user_created', { name: '飞书新增员工', when: '飞书通讯录新增员工', why: '飞书通讯录里新增员工时立即触发', config: {}, deps: [qSource && 'source', 'dedupe'].filter(Boolean) });
  const steps = [
    wantRecord && aigenAct('record', 'feishu', 'bitable_create_record', { name: '登记入职档案', phrase: '在飞书「入职管理」登记档案', why: '在飞书多维表格「入职管理 · 待入职」里建一条员工档案，字段按入职信息自动映射', config: { app: '入职管理', table: '待入职' }, map: { field: 'fields', constants: { 状态: '已入职' } } }),
    profile && aigenAct('profile', 'feishu', 'get_user', { name: '查询员工部门', phrase: '查询员工所在部门', why: '飞书通讯录事件里没有部门，先按邮箱查出员工所在部门', config: { lookup: '邮箱', email: ref.email } }),
    feishuAccount && aigenAct('feishuUser', 'feishu', 'create_user', { name: '开通飞书账号', phrase: '在飞书按部门开通账号', why: `${deptMap ? `按映射表「${deptMap.name}」把北森部门换成飞书部门，` : ''}用手机号开通账号；同一工号已有账号时直接返回，不会重复开通`, config: {}, map: { field: 'employee', hints: { 工号: { source: ref.id, reason: '北森工号，用来查重' }, 姓名: { source: ref.name, reason: '按语义' }, 手机号: { source: '{{trigger.mobile}}', reason: '飞书用手机号发激活邀请' }, 部门: { source: ref.dept, transforms: deptMap ? [{ type: 'lookup', arg: deptMap.id }] : [], reason: deptMap ? `北森部门名称，用映射表「${deptMap.name}」换成飞书部门 ID` : '北森部门名称，需要换成飞书部门 ID' }, 直属上级: { source: ref.manager, reason: '按语义' }, 职务: { source: ref.position, reason: '按语义' }, 邮箱: { source: ref.email, reason: '按语义' } } } }),
    ...(byDept && accountSteps.length ? [{
      key: 'dept', kind: 'branch', name: '按部门开通账号', deps: [],
      why: `只有研发中心的新员工需要开通 ${accountNames} 账号，其他部门跳过`,
      branches: [
        { key: 'rd', name: '研发中心', label: '部门是研发中心', conditions: [beisen ? { left: ref.dept, op: '等于', right: '研发中心' } : { left: '{{@profile.user.department_ids}}', op: '包含', right: deptId }], steps: accountSteps },
        { key: 'other', name: '默认', label: '其他部门', isDefault: true, steps: [] },
      ],
    }] : accountSteps),
    ['group', 'both'].includes(notify) && aigenNotify('notifyGroup', im, { target: 'group', name: welcomeSaid ? '在 HR 群发欢迎消息' : '通知 HR 群', phrase: welcomeSaid ? '在 HR 群发欢迎消息' : '通知 HR 群', why: `${welcomeSaid ? '发一张欢迎卡片' : '把入职和开通结果发'}到${aigenImLabel(im, 'group')}「HR 入职服务群」`, receiver: hrChat, content: welcomeSaid ? `欢迎 ${ref.name} 加入 ${ref.dept || '公司'}！` : `${ref.name} 已完成入职，账号开通情况见入职档案`, template: welcomeSaid ? '入职欢迎卡片' : '入职开通结果卡片', deps: qNotify ? ['notify'] : [] }),
    ['manager', 'both'].includes(notify) && aigenNotify('notifyManager', im, { target: 'person', name: '通知直属上级', phrase: '私信直属上级', why: beisen ? '私信新员工的直属上级，提醒安排入职引导' : '飞书通讯录事件里没有直属上级，接收者需要在编辑器里补', receiver: ref.manager, content: `${ref.name} 今天入职，请安排入职引导`, deps: qNotify ? ['notify'] : [] }),
  ].filter(Boolean);
  return {
    title: feishuAccount ? '员工入职开通飞书账号' : wantRecord ? '新员工入职建档并开通账号' : accountSteps.length ? '新员工入职开通账号' : '新员工入职通知',
    trigger,
    steps,
    questions: [qSource, qNotify, qDedupe].filter(Boolean),
    dedupe: dedupe ? { key: ref.id, window: '30d' } : null,
    assumptions: [
      beisen && '北森每 5 分钟检查一次入职完成的记录，入职后最多 5 分钟开始处理',
      wantRecord && '档案写进「入职管理 · 待入职」表，状态记为「已入职」',
      feishuAccount && (deptMap ? `北森部门在映射表「${deptMap.name}」里找不到时，这次运行失败并进入问题中心，补上对照后可以重试` : '项目里还没有北森部门到飞书部门的映射表，开通账号的部门要在编辑器里补'),
      feishuAccount && '北森没有手机号的员工无法开通，会进入问题中心',
      byDept && accountSteps.length > 0 && '只有研发中心开通研发账号，其他部门只登记和通知',
      !byDept && accountSteps.length > 0 && '所有新员工都开通这些账号',
      accountSaid && !namedGithub && !namedJira && '描述里没有说开通哪些系统，按研发常用的 GitHub 和 Jira 处理',
      !beisen && byDept && deptTable && `研发中心的飞书部门 ID 取自映射表「${deptTable.name}」（${deptId}）`,
      hrChat.startsWith('{{config') && ['group', 'both'].includes(notify) && 'HR 群的 chat_id 读取项目配置 hr_group_chat_id，测试环境和生产环境各发各的群',
      im === 'wecom' && notify && '企业微信群机器人发到连接里配置好的那个群',
    ].filter(Boolean),
    covers: ['record', 'github', 'ticket', 'notify', 'lookup'],
  };
}

function aigenReimburse(ctx) {
  const kingdeeSaid = ctx.mentioned('kingdee');
  const postSaid = ctx.find(['入账', '记账', '凭证', '应付']) >= 0;
  const threshold = ctx.hasVar('large_amount_threshold') ? '{{config.large_amount_threshold}}' : '5000';
  const thresholdText = ctx.hasVar('large_amount_threshold') ? ctx.varValue('large_amount_threshold') || '阈值' : '5000';
  const models = AI_CONNECTORS.filter((id) => usableConnections(ctx.state, { connector: id, projectId: ctx.pid }).some((c) => c.status === 'active'));
  const modelSaid = AI_CONNECTORS.find((id) => ctx.mentioned(id));
  const qLarge = { id: 'large', short: '大额票据', title: '大额票据怎么处理？', desc: `金额超过 ${thresholdText} 元的票据可以先发起复核审批，其余直接入账。`, options: [{ value: 'review', label: '超过阈值发起复核' }, { value: 'direct', label: '全部直接入账' }], recommended: 'review' };
  const qTarget = kingdeeSaid || postSaid ? { id: 'target', short: '写到哪里', title: '识别结果写到哪里？', desc: '报销台账方便财务复核；金蝶应付单直接进账务系统，需要金蝶连接。', options: [{ value: 'ledger', label: '飞书报销台账' }, { value: 'kingdee', label: '金蝶应付单' }, { value: 'both', label: '都写' }], recommended: kingdeeSaid ? 'both' : 'ledger' } : null;
  const qModel = !modelSaid && models.length > 1 ? { id: 'model', short: '识别模型', title: '用哪个模型识别票据？', desc: '两个模型都能识别票据，结果按同样的 JSON 字段输出。', options: models.map((id) => ({ value: id, label: `${resolveConnector(id).name}（${AIGEN_MODELS[id]}）` })), recommended: models.includes('openai') ? 'openai' : models[0] } : null;
  const qDedupe = { id: 'dedupe', short: '重复推送', title: '同一张票据被重复推送时怎么处理？', desc: '报销系统超时重试时会再推一次，去重可以避免同一张发票入账两次。', options: [{ value: 'on', label: '去重（按图片地址，30 天内只处理一次）' }, { value: 'off', label: '不去重' }], recommended: 'on' };
  const review = aigenAnswer(ctx, qLarge) === 'review';
  const target = qTarget ? aigenAnswer(ctx, qTarget) : 'ledger';
  const extractLive = ctx.has('extract');
  const steps = [
    { key: 'extract', kind: 'ai', name: '识别发票字段', phrase: 'AI 识别发票字段', deps: qModel ? ['model'] : [], why: '用大模型从票据图片里抽取发票号码、开票日期、金额和销售方，按 JSON 输出', config: { prompt: '从票据图片 {{trigger.body.image_url}} 中抽取：发票号码、开票日期、价税合计金额、销售方名称，只输出 JSON。', format: 'JSON', temperature: 0, outputFields: [{ k: 'invoice_no', t: '字符串', d: '发票号码' }, { k: 'date', t: '字符串', d: '开票日期' }, { k: 'amount', t: '数值', d: '价税合计' }, { k: 'seller', t: '字符串', d: '销售方名称' }] } },
    review && {
      key: 'check', kind: 'branch', name: '金额校验', deps: ['large'], why: `金额大于 ${thresholdText} 元的票据先发起复核，其余直接往下走`,
      branches: [
        { key: 'big', name: '大额票据', label: `金额大于 ${thresholdText} 元`, conditions: [{ left: extractLive ? '{{@extract.amount}}' : '', op: '大于', right: threshold }], steps: [aigenAct('approval', 'feishu', 'create_approval', { name: '发起大额复核', phrase: '发起大额复核', why: '以提交人的身份发起「大额报销复核」审批', config: { approval: '大额报销复核', user: '{{trigger.body.submitter}}' } })] },
        { key: 'rest', name: '默认', label: '其他金额', isDefault: true, steps: [] },
      ],
    },
    ['ledger', 'both'].includes(target) && aigenAct('ledger', 'feishu', 'bitable_create_record', { name: '写入报销台账', phrase: '写入飞书报销台账', deps: qTarget ? ['target'] : [], why: '写进飞书多维表格「报销台账 · 票据」，字段按识别结果自动映射', config: { app: '报销台账', table: '票据' }, map: { field: 'fields', constants: { 状态: review ? '待复核' : '已入账' } } }),
    ['kingdee', 'both'].includes(target) && aigenAct('kingdee', 'kingdee', 'save_bill', { name: '生成金蝶应付单', phrase: '在金蝶生成应付单', deps: ['target'], why: '在金蝶云星空保存一张应付单，单据日期和供应商取识别结果', config: { formId: 'AP_Payable' }, map: { field: 'model', hints: { FDate: { source: '{{@extract.date}}', transforms: [{ type: 'date', arg: 'YYYY-MM-DD' }], reason: '按语义：开票日期作为单据日期' }, FSupplierId: { source: '{{@extract.seller}}', transforms: [], reason: '按语义：销售方作为供应商' } } } }),
    aigenAct('respond', 'webhook', 'respond', { name: '返回识别结果', phrase: '把结果返回给报销系统', why: '把发票号码同步返回给报销系统，报销单上直接显示识别结果', config: { status: '200', body: extractLive ? '{ "ok": true, "invoice": "{{@extract.invoice_no}}" }' : '{ "ok": true }' } }),
  ].filter(Boolean);
  return {
    title: '报销票据 AI 识别入账',
    trigger: aigenTrig('webhook', 'catch_sync', { name: '接收票据推送', when: '报销系统推送票据图片', why: '报销系统把票据图片推到这个地址，并同步等待识别结果', config: { auth: 'HMAC 签名', bodyType: 'JSON' }, deps: ['dedupe'] }),
    steps,
    questions: [qLarge, qTarget, qDedupe, qModel].filter(Boolean),
    dedupe: aigenAnswer(ctx, qDedupe) === 'on' ? { key: '{{trigger.body.image_url}}', window: '30d' } : null,
    modelPrefer: modelSaid || (qModel ? aigenAnswer(ctx, qModel) : null),
    assumptions: [
      '票据图片通过 Webhook 推送，报销系统同步等待识别结果，30 秒内要返回',
      review && (ctx.hasVar('large_amount_threshold') ? `大额阈值读取项目配置 large_amount_threshold（当前 ${thresholdText} 元），测试和生产可以设不同的值` : '大额阈值先按 5000 元，可以在分支条件里改'),
      '台账里的「提交人」取推送里的 submitter',
      ['kingdee', 'both'].includes(target) && '金蝶应付单的明细行（FEntity）没法从单张票据推出来，生成后需要在编辑器里补',
    ].filter(Boolean),
    covers: ['extract', 'approval', 'record', 'voucher', 'notify', 'query'],
  };
}

function aigenLead(ctx) {
  const fromWecom = ctx.mentioned('wecom') || ctx.find(['添加客户', '加客户', '外部联系人', '加好友']) >= 0;
  const fromWeb = !fromWecom && ctx.find(['官网', '表单', '落地页']) >= 0;
  const crmSaid = ['salesforce', 'xiaoshouyi', 'hubspot'].find((id) => ctx.mentioned(id));
  const qCrm = crmSaid ? null : { id: 'crm', short: '用哪个 CRM', title: '线索建到哪个 CRM？', desc: '描述里没有说是哪个 CRM，推荐的是这个项目里已经有连接的。', options: [{ value: 'salesforce', label: 'Salesforce' }, { value: 'xiaoshouyi', label: '销售易' }, { value: 'hubspot', label: 'HubSpot' }], recommended: ['salesforce', 'xiaoshouyi', 'hubspot'].find((id) => ctx.usable(id).length) || 'salesforce' };
  const crm = crmSaid || aigenAnswer(ctx, qCrm);
  const crmName = resolveConnector(crm).name;
  const groupSaid = ctx.find(['群']) >= 0;
  const ownerSaid = ctx.find(['本人', '负责人', '对应的销售', '添加人']) >= 0;
  const qNotify = { id: 'notify', short: '提醒谁', title: '提醒谁跟进？', desc: '决定最后一步发到销售群，还是只发给添加客户的销售本人。', options: [{ value: 'group', label: '销售群' }, { value: 'owner', label: '添加客户的销售' }, { value: 'both', label: '都提醒' }], recommended: groupSaid && ownerSaid ? 'both' : ownerSaid ? 'owner' : 'group' };
  const qDedupe = { id: 'dedupe', short: '重复添加', title: '同一个客户被多次添加时怎么处理？', desc: '多个销售添加同一个客户时，去重可以避免重复建线索。', options: [{ value: 'on', label: '去重（30 天内同一客户只建一次）' }, { value: 'off', label: '不去重' }], recommended: 'on' };
  const notify = aigenAnswer(ctx, qNotify);
  const imPick = aigenImPick(ctx);
  const im = fromWecom && !imPick.said ? 'wecom' : imPick.im;
  const who = fromWecom ? { name: '{{trigger.name}}', corp: '{{trigger.corp_name}}', owner: '{{trigger.sales}}' } : { name: '{{trigger.body.name}}', corp: '{{trigger.body.company}}', owner: '' };
  const crmStep = crm === 'salesforce'
    ? aigenAct('crm', 'salesforce', 'create_lead', { name: '创建线索', phrase: '在 Salesforce 创建线索', deps: qCrm ? ['crm'] : [], why: '在 Salesforce 建一条线索，客户姓名、公司和电话按事件字段自动映射', config: {}, map: { field: 'params', constants: fromWecom ? { LeadSource: 'WeCom' } : {} } })
    : crm === 'xiaoshouyi'
      ? aigenAct('crm', 'xiaoshouyi', 'create_account', { name: '创建客户', phrase: '在销售易创建客户', deps: qCrm ? ['crm'] : [], why: '销售易的连接器没有线索对象，直接建客户，字段在编辑器里确认', config: {} })
      : aigenAct('crm', 'hubspot', 'create_contact', { name: '创建联系人', phrase: '在 HubSpot 创建联系人', deps: qCrm ? ['crm'] : [], why: 'HubSpot 用联系人承接线索，字段在编辑器里确认', config: {} });
  const steps = [
    crmStep,
    ['group', 'both'].includes(notify) && aigenNotify('notifyGroup', im, { target: 'group', name: '提醒销售群跟进', phrase: '提醒销售群跟进', why: `发到${aigenImLabel(im, 'group')}，谁有空谁跟进`, receiver: '销售运营群', content: `新客户 ${who.name}（${who.corp}）已同步到 ${crmName}，请尽快跟进`, deps: ['notify'] }),
    ['owner', 'both'].includes(notify) && aigenNotify('notifyOwner', im, { target: 'person', name: '提醒添加客户的销售', phrase: '提醒添加客户的销售', why: fromWecom ? '私信添加这个客户的销售本人' : '官网表单里没有对应的销售，接收者需要在编辑器里补', receiver: who.owner, content: `你添加的客户 ${who.name} 已同步到 ${crmName}，记得 24 小时内跟进`, deps: ['notify'] }),
  ].filter(Boolean);
  const trigger = fromWecom
    ? aigenTrig('wecom', 'external_contact_added', { name: '添加外部联系人', when: '销售在企业微信添加客户', why: '销售在企业微信添加外部联系人时立即触发', config: {}, deps: ['dedupe'] })
    : aigenTrig('webhook', 'catch', { name: '接收官网表单', when: fromWeb ? '官网表单提交' : '有新的线索推送过来', why: '官网或其他系统把线索推到这个地址', config: { auth: '无鉴权', bodyType: 'JSON' }, deps: ['dedupe'] });
  return {
    title: fromWecom ? `企业微信新客户同步到 ${crmName}` : `新线索同步到 ${crmName}`,
    trigger,
    steps,
    questions: [qCrm, qNotify, qDedupe].filter(Boolean),
    dedupe: aigenAnswer(ctx, qDedupe) === 'on' ? { key: fromWecom ? '{{trigger.external_userid}}' : '{{trigger.body.email}}', window: '30d' } : null,
    assumptions: [
      fromWecom && crm === 'salesforce' && '线索来源统一记为 WeCom，方便在 Salesforce 里按来源统计',
      fromWecom && '企业微信的外部联系人里没有邮箱，线索的 Email 留空',
      im === 'wecom' && ['group', 'both'].includes(notify) && '企业微信群机器人发到连接里配置好的那个群',
    ].filter(Boolean),
    covers: ['lead', 'account', 'notify'],
  };
}

function aigenKbTools(ctx) {
  const kb = ctx.catalog.find((c) => c.mcp && /知识库|wiki|confluence/i.test(`${c.name}${c.desc || ''}`)) || ctx.catalog.find((c) => c.mcp && c.actions.some((a) => /search/.test(a.key)));
  if (!kb) return [];
  const search = kb.actions.find((a) => /search/.test(a.key)) || kb.actions[0];
  const read = kb.actions.find((a) => a !== search && /(get|read)_?(page|doc)/.test(a.key));
  return [search, read].filter(Boolean).map((a) => ({ key: `kb_${a.key}`, type: 'mcp', connector: kb.id, op: a.key, approval: false, label: a.name }));
}

function aigenHelpdesk(ctx) {
  const slack = ctx.mentioned('slack');
  const kbTools = aigenKbTools(ctx);
  const ticketConn = ['jira', 'zendesk', 'service-now'].find((id) => ctx.mentioned(id)) || 'jira';
  const ticketOp = { jira: 'create_issue', zendesk: 'create_ticket', 'service-now': 'create_incident' }[ticketConn];
  const ticketName = resolveConnector(ticketConn).name;
  const qApproval = { id: 'approval', short: '建单确认', title: '智能体建工单前要人工确认吗？', desc: '需要确认时运行会暂停，等 IT 值班在运行日志里批准后再建单。', options: [{ value: 'confirm', label: '需要确认' }, { value: 'auto', label: '直接创建' }], recommended: 'confirm' };
  const qBudget = { id: 'budget', short: '调用上限', title: '智能体一次最多调用几次工具？', desc: '步数越多越能处理复杂问题，也越耗 Token。', options: [{ value: '4', label: '4 次（约 12,000 Token）' }, { value: '6', label: '6 次（约 20,000 Token）' }, { value: '10', label: '10 次（约 32,000 Token）' }], recommended: '6' };
  const approval = aigenAnswer(ctx, qApproval) === 'confirm';
  const budget = aigenAnswer(ctx, qBudget);
  const tools = [...kbTools, { key: 'ticket', type: 'op', connector: ticketConn, op: ticketOp, approval, label: `${ticketName} · 建工单` }];
  const tenant = ctx.state.tenant.name;
  const kbName = kbTools.length ? resolveConnector(kbTools[0].connector).name : '';
  const agent = {
    key: 'agent', kind: 'agent', name: 'IT 助手智能体', phrase: `智能体先${kbTools.length ? '查知识库回答' : '尝试回答'}，解决不了就在 ${ticketName} 建工单`, deps: ['approval', 'budget'], tools,
    why: `${kbTools.length ? `用「${kbName}」的搜索工具找答案` : '没有可用的知识库工具，先直接回答'}；需要人工处理时在 ${ticketName} 建工单${approval ? '，建单前等人工确认' : ''}`,
    config: {
      input: '{{trigger.text}}',
      instructions: `你是${tenant}的 IT 服务台助手。${kbTools.length ? '先在知识库里找答案；' : ''}找不到答案或需要人工处理时，在 ${ticketName} 的 IT 项目创建工单，并把工单号告诉提问的同事。回答保持简短，不要编造知识库里没有的操作步骤。`,
      maxSteps: Number(budget),
      tokenBudget: AIGEN_BUDGETS[budget],
      onLimit: 'fail',
      outputFields: [{ k: 'answer', t: '字符串', d: '回复内容' }, { k: 'ticket', t: '字符串', d: '工单号，没有建单时为空' }],
    },
  };
  const reply = slack
    ? aigenAct('reply', 'slack', 'send_message', { name: '回复提问人', phrase: '把答复发回给提问人', why: '把智能体的回答发回提问的频道', config: { receiver: '{{trigger.channel}}', content: ctx.has('agent') ? '{{@agent.answer}}' : '' } })
    : aigenAct('reply', 'feishu', 'send_message', { name: '回复提问人', phrase: '把答复私信给提问人', why: '把智能体的回答（含工单号）私信给提问的同事', config: { receiveType: '用户', receiver: '{{trigger.sender}}', content: ctx.has('agent') ? '{{@agent.answer}}' : '' } });
  return {
    title: 'IT 服务台智能体',
    trigger: slack
      ? aigenTrig('slack', 'new_message', { name: '频道新消息', when: '员工在 Slack 频道里提问', why: '员工在 IT 支持频道里发消息时触发', config: {} })
      : aigenTrig('feishu', 'message_received', { name: '机器人收到消息', when: '员工在飞书里向 IT 助手提问', why: '员工单聊或在群里 @IT 助手 机器人时触发', config: { bot: 'IT 助手' } }),
    steps: [agent, reply],
    questions: [qApproval, qBudget],
    dedupe: null,
    notes: kbTools.length ? [] : [{ tone: 'warning', text: '这个项目里没有可用的知识库 MCP 服务器，智能体暂时只能建工单。可以在连接器市场「接入 MCP 服务器」后，再把它的工具加给智能体。' }],
    assumptions: [
      `智能体用 ${AIGEN_MODELS.claude} 这类通用模型即可，单次运行最多消耗约 ${fmt.number(AIGEN_BUDGETS[budget])} Token，超出就停止并记为失败`,
      kbTools.length > 0 && `知识库工具来自 MCP 服务器「${kbName}」，只读，不需要人工确认`,
      approval && '建单确认会通知项目里的 IT 值班，他们在运行日志里批准或拒绝',
      !slack && '只处理发给「IT 助手」机器人的消息',
    ].filter(Boolean),
    covers: ['kb', 'ticket', 'notify', 'classify', 'summarize', 'query'],
  };
}

function aigenReport(ctx) {
  const sales = ctx.find(['销售', '商机', '赢单', '签约']) >= 0;
  const clock = /(\d{1,2})(点|:|：|时)/.test(ctx.tc);
  const kindSaid = ctx.find(['工作日']) >= 0 ? 'workday' : ctx.find(['每周', '周报']) >= 0 ? 'weekly' : ctx.find(['每天', '每日']) >= 0 ? 'daily' : null;
  const sched0 = aigenSchedule(ctx, kindSaid || 'workday');
  const qTime = kindSaid && clock ? null : { id: 'time', short: '发送时间', title: '日报什么时候发？', desc: '按北京时间，节假日可以在触发器里设置跳过。', options: [{ value: 'workday', label: `工作日 ${sched0.at}` }, { value: 'daily', label: `每天 ${sched0.at}` }, { value: 'weekly', label: `每周一 ${sched0.at}` }], recommended: kindSaid || 'workday' };
  const sched = aigenSchedule(ctx, qTime ? aigenAnswer(ctx, qTime) : kindSaid);
  const sourceSaid = ['salesforce', 'mysql', 'postgres', 'hubspot', 'xiaoshouyi'].find((id) => ctx.mentioned(id));
  if (!sourceSaid && ctx.unavailable.length) return { vague: true, title: '数据来源暂时用不了', reason: `日报要用的「${ctx.unavailable.join('」「')}」现在还不能在工作流里使用，AI 不会拿别的系统代替。` };
  const qSource = sourceSaid ? null : { id: 'source', short: '数据来源', title: '日报的数据从哪里来？', desc: '描述里没有说数据在哪个系统。', options: [{ value: 'salesforce', label: 'Salesforce 商机' }, { value: 'mysql', label: 'MySQL 数据库' }], recommended: sales ? 'salesforce' : ctx.usable('mysql').length ? 'mysql' : 'salesforce' };
  const source = sourceSaid || aigenAnswer(ctx, qSource);
  const qScope = source === 'salesforce' ? { id: 'scope', short: '统计范围', title: '日报统计哪些商机？', desc: '决定查询条件，生成后也可以在查询语句里改。', options: [{ value: 'changed', label: '昨天新增和更新的' }, { value: 'won', label: '昨天赢单的' }, { value: 'open', label: '所有未关闭的' }], recommended: ctx.find(['赢单', '签约', '成交']) >= 0 ? 'won' : 'changed' } : null;
  const imPick = aigenImPick(ctx);
  const qIm = imPick.said ? null : aigenImQuestion(ctx, 'im', imPick.im);
  const aiSaid = ctx.find(['ai', '摘要', '总结', '写一段', '点评']) >= 0;
  const qAi = aiSaid ? null : { id: 'ai', short: 'AI 摘要', title: '要不要让 AI 写一段摘要？', desc: 'AI 会把明细整理成一段话，每次运行消耗少量 Token。', options: [{ value: 'yes', label: 'AI 写摘要' }, { value: 'no', label: '只发数据' }], recommended: 'yes' };
  const im = qIm ? aigenAnswer(ctx, qIm) : imPick.im;
  const withAi = aiSaid || aigenAnswer(ctx, qAi) === 'yes';
  const scope = qScope ? aigenAnswer(ctx, qScope) : null;
  const soqlWhere = { changed: 'LastModifiedDate = YESTERDAY', won: "StageName = 'Closed Won' AND CloseDate = YESTERDAY", open: 'IsClosed = false' }[scope || 'changed'];
  const sql = ctx.find(['考勤']) >= 0
    ? "SELECT dept, name, type, minutes\nFROM attendance_exception\nWHERE day = CURDATE() - INTERVAL 1 DAY;"
    : 'SELECT *\nFROM daily_report\nWHERE report_date = CURDATE() - INTERVAL 1 DAY;';
  const query = source === 'salesforce'
    ? aigenAct('query', 'salesforce', 'soql_query', { name: '查询商机', phrase: '查询 Salesforce 商机', deps: [qSource && 'source', 'scope'].filter(Boolean), why: `用 SOQL 查询${{ changed: '昨天新增和更新的', won: '昨天赢单的', open: '所有未关闭的' }[scope || 'changed']}商机`, config: { sql: `SELECT Name, Amount, StageName, Owner.Name\nFROM Opportunity\nWHERE ${soqlWhere}` } })
    : aigenAct('query', source === 'postgres' ? 'postgres' : 'mysql', 'execute_query', { name: '查询昨天的数据', phrase: '查询昨天的数据', deps: qSource ? ['source'] : [], why: '执行 SQL 查出昨天的明细', config: { sql } });
  const queryOut = source === 'salesforce' ? 'records' : 'rows';
  const summary = withAi ? { key: 'summary', kind: 'ai', name: '生成日报摘要', phrase: 'AI 写一段摘要', deps: qAi ? ['ai'] : [], why: '让大模型把明细整理成 150 字以内的日报', config: { prompt: `根据下面的数据写一段 150 字以内的${sales ? '销售' : ''}日报，先说总数和金额，再点出需要关注的条目：${ctx.has('query') ? `{{@query.${queryOut}}}` : ''}`, format: '文本', temperature: 0.3 } } : null;
  const content = withAi && ctx.has('summary') ? '{{@summary.result}}' : ctx.has('query') ? (source === 'salesforce' ? '昨日商机 {{@query.totalSize}} 个，明细见 Salesforce' : '昨日数据 {{@query.rowCount}} 条，明细见数据库') : '';
  const groupName = aigenGroupName(ctx.text) || (sales ? '销售运营群' : '');
  const send = aigenNotify('send', im, { target: 'group', name: `发到${groupName || aigenImLabel(im, 'group')}`, phrase: `发到${groupName || aigenImLabel(im, 'group')}`, why: `把日报发到${aigenImLabel(im, 'group')}${groupName ? `「${groupName}」` : ''}`, receiver: groupName, content, deps: qIm ? ['im'] : [] });
  return {
    title: sales ? (sched.kind === 'weekly' ? '每周销售周报' : '每日销售日报') : aigenTitleFrom(ctx.text),
    trigger: aigenTrig('schedule', 'every', { name: '定时任务', when: sched.when, why: `${sched.when}（北京时间）自动运行${sched.kind === 'workday' ? '，法定节假日跳过' : ''}`, config: sched.config, deps: qTime ? ['time'] : [] }),
    steps: [query, summary, send].filter(Boolean),
    questions: [qTime, qSource, qScope, qIm, qAi].filter(Boolean).slice(0, 3),
    overflow: [qTime, qSource, qScope, qIm, qAi].filter(Boolean).slice(3),
    dedupe: null,
    assumptions: [
      source !== 'salesforce' && '查询语句是示例，需要按实际的表结构修改',
      withAi && '摘要用 150 字以内的中文，不包含客户的联系方式',
      !groupName && '没看出要发到哪个群，生成后在编辑器里选择',
      im === 'wecom' && '企业微信群机器人发到连接里配置好的那个群',
    ].filter(Boolean),
    covers: ['query', 'summarize', 'notify', 'record'],
  };
}

function aigenSchedule(ctx, forced) {
  const m = /(凌晨|早上|上午|中午|下午|傍晚|晚上)?(\d{1,2})(?:点|:|：|时)(半|(\d{1,2})分?)?/.exec(ctx.tc);
  const rawHour = m ? Number(m[2]) : 9;
  const hour = Math.min(23, m && ['下午', '傍晚', '晚上'].includes(m[1]) && rawHour < 12 ? rawHour + 12 : rawHour);
  const minute = m ? Math.min(59, m[3] === '半' ? 30 : Number(m[4] || 0)) : 0;
  const at = `${fmt.pad(hour)}:${fmt.pad(minute)}`;
  const week = /每周([一二三四五六日天])/.exec(ctx.tc);
  const day = week ? `周${week[1] === '天' ? '日' : week[1]}` : '周一';
  const kind = forced || (ctx.find(['工作日']) >= 0 ? 'workday' : week || ctx.find(['每周', '周报']) >= 0 ? 'weekly' : ctx.find(['每月', '月报']) >= 0 ? 'monthly' : 'daily');
  const base = { at, timezone: 'Asia/Shanghai' };
  if (kind === 'workday') return { kind, at, when: `工作日 ${at}`, config: { ...base, mode: '按周触发', weekdays: ['周一', '周二', '周三', '周四', '周五'], skipHoliday: true } };
  if (kind === 'weekly') return { kind, at, when: `每${day} ${at}`, config: { ...base, mode: '按周触发', weekdays: [day] } };
  if (kind === 'monthly') return { kind, at, when: `每月第一天 ${at}`, config: { ...base, mode: '按月触发', monthDay: '每月第一天' } };
  return { kind, at, when: `每天 ${at}`, config: { ...base, mode: '每天触发' } };
}

function aigenGroupName(text) {
  const m = /(?:发到|推送到|通知|同步到|发给|提醒|发送到)\s*([^，。,.；;！!？?\n]{1,14}?群)/.exec(String(text || ''));
  if (m) return m[1].trim();
  const role = /(?:通知|提醒|告知|发给|发到)\s*(IT|HR|人力|行政|财务)/i.exec(String(text || ''));
  return role ? ({ it: 'IT 桌面支持', hr: 'HR 入职服务', 人力: 'HR 入职服务', 行政: '行政综合群', 财务: '财务共享群' })[role[1].toLowerCase()] || '' : '';
}

function aigenTitleFrom(text) {
  const head = String(text || '').split(/[，。,.;；！!？?\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 2).join('');
  if (!head) return 'AI 生成的工作流';
  return head.length > 24 ? `${head.slice(0, 24)}…` : head;
}

function aigenSpace(text) {
  return String(text).replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2').replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
}

function aigenSampleRef(sample, keys) {
  const list = mapCandidates(sample, 'trigger', '');
  const hit = keys.map((k) => list.find((c) => c.key === k && ['string', 'number'].includes(typeof c.sample))).find(Boolean);
  return hit ? `{{${hit.path}}}` : '';
}

function aigenIdRef(sample) {
  const hit = mapCandidates(sample, 'trigger', '').find((c) => /(^id$|_id$|userid$|_code$|^code$|_no$|number$)/i.test(c.key) && !AIGEN_NOT_EVENT_IDS.includes(c.key) && ['string', 'number'].includes(typeof c.sample));
  return hit ? `{{${hit.path}}}` : '';
}

function aigenDetectTrigger(ctx) {
  const hits = AIGEN_TRIGGERS
    .map((r) => ({ r, hit: aigenHit(ctx.tc, r.words) }))
    .filter((x) => x.hit && x.r.options.some(([cid]) => aigenTriggerReady(ctx, cid)))
    .sort((a, b) => a.hit.index - b.hit.index);
  if (!hits.length) return null;
  const { r, hit } = hits[0];
  const pick = r.options.find(([cid]) => ctx.mentioned(cid) && aigenTriggerReady(ctx, cid)) || r.options.find(([cid]) => aigenTriggerReady(ctx, cid));
  return { hit, step: aigenTriggerStep(ctx, pick[0], pick[1]) };
}

function aigenTriggerReady(ctx, cid) {
  const c = resolveConnector(cid);
  return Boolean(c && (c.builtin || ctx.available(cid)));
}

function aigenTriggerStep(ctx, connector, op) {
  if (connector === 'schedule') {
    const s = aigenSchedule(ctx, null);
    return aigenTrig('schedule', 'every', { name: '定时任务', when: s.when, why: `${s.when}（北京时间）自动运行`, config: s.config });
  }
  const c = resolveConnector(connector);
  const o = c.triggers.find((t) => t.key === op);
  if (connector === 'feishu' && ['approval_approved', 'approval_created'].includes(op)) {
    const def = AIGEN_APPROVALS.find(([w]) => ctx.find([w]) >= 0);
    return aigenTrig(connector, op, { name: o.name, when: `飞书「${def ? def[1] : '审批'}」${op === 'approval_created' ? '有人发起' : '审批通过'}`, why: def ? `「${def[1]}」${op === 'approval_created' ? '有人发起' : '审批最终通过'}时触发` : `${o.desc}，审批定义需要在编辑器里选择`, config: { approval: def ? def[1] : '' } });
  }
  const when = AIGEN_BUILTIN_WHEN[`${connector}.${op}`] || `${c.builtin ? '' : c.name}「${o ? o.name : op}」`;
  return aigenTrig(connector, op, { name: o ? o.name : c.name, when, why: o ? o.desc : '', config: AIGEN_TRIGGER_CONFIG[`${connector}.${op}`] || {} });
}

function aigenHeadline(sample, trigger) {
  const direct = aigenSampleRef(sample, ['title', 'summary', 'subject', 'text', 'approval_name', 'name', 'resource_name', 'event_name', 'error_message', 'content']);
  if (direct) return direct;
  const fields = mapCandidates(sample, 'trigger', '').filter((c) => typeof c.sample === 'string' && !/(^id$|_id$|url$|_at$|time$|token|status)/i.test(c.key)).slice(0, 2);
  return fields.length ? `${trigger.name}：${fields.map((c) => `{{${c.path}}}`).join(' · ')}` : '';
}

function aigenDetectCaps(ctx, skip) {
  const base = skip ? [skip] : [];
  const first = AIGEN_CAPS.map((c) => ({ id: c.id, words: c.words, hit: aigenHit(ctx.tc, c.words, base) }));
  const channels = first.filter((c) => ['email', 'sms'].includes(c.id) && c.hit).map((c) => ({ index: c.hit.index, length: c.hit.length + 3 }));
  return first
    .map((c) => (c.id === 'notify' && channels.length ? { ...c, hit: aigenHit(ctx.tc, c.words, [...base, ...channels]) } : c))
    .filter((c) => c.hit)
    .sort((a, b) => a.hit.index - b.hit.index)
    .map((c) => c.id);
}

function aigenCapStep(id, ctx, env) {
  const sample = env.sample;
  const headline = aigenHeadline(sample, env.trigger);
  const guess = !ctx.unavailable.length;
  const person = aigenSampleRef(sample, ['user_id', 'submitter', 'sender', 'host', 'manager', 'sales', 'owner', 'requester', 'organizer']);
  const prevAi = [...env.prior].reverse().find((s) => s.kind === 'ai' && ctx.has(s.key));
  const prevQuery = [...env.prior].reverse().find((s) => s.key === 'query' && ctx.has(s.key));
  const input = prevQuery ? `{{@query.${AIGEN_QUERY_OUT[prevQuery.connector] || 'result'}}}` : headline;
  if (id === 'feishuFreeze' || id === 'feishuUpdate') {
    if (!ctx.available('feishu')) return { notes: [{ tone: 'warning', text: '这个项目里不能用飞书连接器，没有加飞书账号的步骤。' }] };
    const empId = sample && sample.employee_id !== undefined ? '{{trigger.employee_id}}' : '';
    if (id === 'feishuFreeze') {
      return {
        steps: [aigenAct('feishuFreeze', 'feishu', 'freeze_user', { name: '暂停飞书账号', phrase: '暂停飞书账号', why: '按工号找到飞书账号并暂停，不能登录但数据保留，可以恢复', config: { employeeId: empId } })],
        assumptions: ['暂停而不是删除账号；需要删除时，在编辑器里换成删除操作并设置资源接收人', !empId && '触发数据里没有工号，暂停账号的工号要在编辑器里补'].filter(Boolean),
      };
    }
    const deptMap = (ctx.state.mappingTables || []).find((t) => t.projectId === ctx.pid && t.keyLabel.includes('北森部门'));
    return {
      steps: [aigenAct('feishuUpdate', 'feishu', 'update_user', { name: '更新飞书部门和上级', phrase: '更新飞书里的部门和直属上级', why: `${deptMap ? `部门用映射表「${deptMap.name}」换成飞书部门，` : ''}按工号更新部门、直属上级和职务`, config: {}, map: { field: 'employee', hints: { 工号: { source: empId, reason: '北森工号' }, 部门: { source: '{{trigger.department}}', transforms: deptMap ? [{ type: 'lookup', arg: deptMap.id }] : [], reason: deptMap ? `用映射表「${deptMap.name}」换成飞书部门 ID` : '需要换成飞书部门 ID' }, 直属上级: { source: '{{trigger.manager}}', reason: '按语义' }, 职务: { source: '{{trigger.position}}', reason: '按语义' } } } })],
      assumptions: [deptMap ? `新部门在映射表「${deptMap.name}」里找不到时，这次运行失败并进入问题中心，补上对照后可以重试` : '项目里还没有北森部门到飞书部门的映射表，部门要在编辑器里补'],
    };
  }
  if (id === 'record') {
    const rule = AIGEN_TABLES.find((t) => ctx.find(t.words) >= 0);
    return {
      steps: [aigenAct('record', 'feishu', 'bitable_create_record', { name: rule ? `写入${rule.table}表` : '写入多维表格', phrase: rule ? `写入飞书「${rule.app}」` : '写入飞书多维表格', why: rule ? `写进飞书多维表格「${rule.app} · ${rule.table}」，字段按上游数据自动映射` : '写进飞书多维表格', config: { app: rule ? rule.app : '', table: rule ? rule.table : '' }, map: { field: 'fields' } })],
      assumptions: rule ? [] : ['没看出要写到哪张表，生成后在编辑器里选择多维表格和数据表'],
    };
  }
  if (id === 'ticket') {
    const said = ['jira', 'zendesk', 'service-now'].find((x) => ctx.mentioned(x));
    if (!said && !guess) return {};
    const which = said || 'jira';
    const c = resolveConnector(which);
    const op = { jira: 'create_issue', zendesk: 'create_ticket', 'service-now': 'create_incident' }[which];
    const issueType = ctx.find(['缺陷', 'bug']) >= 0 ? '缺陷' : ctx.find(['报修', '硬件']) >= 0 ? '硬件报修' : ctx.find(['权限']) >= 0 ? '权限申请' : '任务';
    const project = ctx.find(['研发', '流水线', '缺陷', 'bug', '代码']) >= 0 ? 'PLAT' : 'IT';
    return {
      steps: [aigenAct('ticket', which, op, { name: which === 'jira' ? `创建 Jira ${issueType === '任务' ? '工单' : issueType}` : `创建 ${c.name} 工单`, phrase: `在 ${c.name} 建${issueType === '缺陷' ? '缺陷' : '工单'}`, why: which === 'jira' ? `在 Jira 的 ${project} 项目里建一张「${issueType}」` : `在 ${c.name} 里建一张工单`, config: which === 'jira' ? { project, issueType, summary: headline } : {} })],
      assumptions: said ? [] : ['描述里没说用哪个工单系统，按 Jira 处理'],
    };
  }
  if (id === 'approval') {
    if (ctx.mentioned('cc_oa') && ctx.available('cc_oa')) {
      return { steps: [aigenAct('approval', 'cc_oa', 'create_workflow', { name: '发起 OA 流程', phrase: '在 OA 发起流程', why: '以申请人的身份在 OA 里发起流程', config: { creator: person, formData: '' } })], assumptions: ['OA 流程的表单数据需要在编辑器里按流程字段填写'] };
    }
    const def = AIGEN_APPROVALS.find(([w]) => ctx.find([w]) >= 0);
    return {
      steps: [aigenAct('approval', 'feishu', 'create_approval', { name: '发起审批', phrase: def ? `发起「${def[1]}」审批` : '发起飞书审批', why: def ? `以申请人的身份发起「${def[1]}」审批` : '以申请人的身份发起飞书审批', config: { approval: def ? def[1] : '', user: person } })],
      assumptions: def ? [] : ['没看出要发起哪个审批，生成后在编辑器里选择审批定义'],
    };
  }
  if (id === 'lead') {
    const said = ['salesforce', 'xiaoshouyi', 'hubspot'].find((x) => ctx.mentioned(x));
    if (!said && !guess) return {};
    const q = said ? null : { id: 'crm', short: '用哪个 CRM', title: '线索建到哪个 CRM？', desc: '描述里没有说是哪个 CRM。', options: [{ value: 'salesforce', label: 'Salesforce' }, { value: 'xiaoshouyi', label: '销售易' }, { value: 'hubspot', label: 'HubSpot' }], recommended: ['salesforce', 'xiaoshouyi', 'hubspot'].find((x) => ctx.usable(x).length) || 'salesforce' };
    const crm = said || aigenAnswer(ctx, q);
    const deps = q ? ['crm'] : [];
    const step = crm === 'salesforce'
      ? aigenAct('lead', 'salesforce', 'create_lead', { name: '创建线索', phrase: '在 Salesforce 创建线索', deps, why: '在 Salesforce 建一条线索，字段按上游数据自动映射', config: {}, map: { field: 'params' } })
      : crm === 'xiaoshouyi'
        ? aigenAct('lead', 'xiaoshouyi', 'create_account', { name: '创建客户', phrase: '在销售易创建客户', deps, why: '销售易的连接器没有线索对象，直接建客户', config: {} })
        : aigenAct('lead', 'hubspot', 'create_contact', { name: '创建联系人', phrase: '在 HubSpot 创建联系人', deps, why: 'HubSpot 用联系人承接线索', config: {} });
    return { steps: [step], questions: q ? [q] : [] };
  }
  if (id === 'account') {
    const said = ['xiaoshouyi', 'hubspot', 'stripe'].find((x) => ctx.mentioned(x));
    if (!said && !guess) return {};
    const which = said || 'xiaoshouyi';
    const op = { xiaoshouyi: 'create_account', hubspot: 'create_contact', stripe: 'create_customer' }[which];
    const c = resolveConnector(which);
    const o = c.actions.find((a) => a.key === op);
    return { steps: [aigenAct('account', which, op, { name: o.name, phrase: `在${c.name}${o.name}`, why: `在${c.name}里${o.name}，字段在编辑器里确认`, config: {} })] };
  }
  if (id === 'voucher') {
    if (!ctx.mentioned('kingdee') && !guess) return {};
    return {
      steps: [aigenAct('voucher', 'kingdee', 'save_bill', { name: '保存金蝶单据', phrase: '在金蝶保存单据', why: '在金蝶云星空保存一张应付单，字段按上游数据映射', config: { formId: 'AP_Payable' }, map: { field: 'model' } })],
      assumptions: ctx.mentioned('kingdee') ? [] : ['描述里没说用哪个财务系统，按金蝶云星空处理'],
    };
  }
  if (id === 'query') {
    const q = AIGEN_QUERY.find((x) => ctx.mentioned(x.connector) && ctx.available(x.connector));
    if (!q) return { assumptions: ['没看出要从哪个系统查询数据，没有加查询步骤'] };
    const c = resolveConnector(q.connector);
    return { steps: [aigenAct('query', q.connector, q.op, { name: q.name, phrase: `查询${c.name}`, why: q.why, config: q.config })], assumptions: q.sample ? ['查询语句是示例，需要按实际的表结构修改'] : [] };
  }
  if (['extract', 'summarize', 'classify', 'translate'].includes(id)) {
    const meta = AIGEN_AI_TASKS[id];
    return { steps: [{ key: `ai_${id}`, kind: 'ai', name: meta.name, phrase: meta.phrase, deps: [], why: meta.why, config: { prompt: `${meta.prompt}${input}`, format: meta.format, temperature: meta.temperature, ...(meta.fields ? { outputFields: meta.fields } : {}) } }] };
  }
  if (id === 'calendar') return { steps: [aigenAct('calendar', 'feishu', 'create_calendar_event', { name: '创建日程', phrase: '创建飞书日程', why: '在飞书日历里建一个日程并邀请相关的人', config: { summary: headline, attendees: person } })] };
  if (id === 'chat') return { steps: [aigenAct('chat', 'feishu', 'create_chat', { name: '创建群组', phrase: '建一个飞书群', why: '建群并拉入相关的人', config: {} })] };
  if (id === 'doc') {
    const notion = ctx.mentioned('notion');
    return { steps: [aigenAct('doc', notion ? 'notion' : 'feishu', notion ? 'create_page' : 'create_doc', { name: notion ? '创建页面' : '创建云文档', phrase: notion ? '在 Notion 建页面' : '新建飞书云文档', why: notion ? '在 Notion 里新建一个页面' : '在指定文件夹下新建一篇飞书云文档', config: {} })] };
  }
  if (id === 'sms') {
    const sms = ctx.catalog.find((c) => c.custom && /短信/.test(c.name));
    if (!sms) return { notes: [{ tone: 'warning', text: '描述里提到了短信，但没有可用的短信连接器，没有加短信步骤。可以在「连接器开发」里对接公司的短信网关。' }] };
    const op = sms.actions[0];
    return { steps: [aigenAct('sms', sms.id, op.key, { name: op.name, phrase: '发短信', why: `通过「${sms.name}」发短信，模板在编辑器里选择`, config: { phone: aigenSampleRef(sample, ['mobile', 'phone', 'tel']), templateId: '' } })] };
  }
  if (id === 'email') {
    if (!ctx.mentioned('gmail') && !guess) return {};
    return {
      steps: [aigenAct('email', 'gmail', 'send_email', { name: '发送邮件', phrase: '发邮件', why: '通过 Gmail 连接发一封邮件', config: { receiver: aigenSampleRef(sample, ['email', 'mail', 'requester']), title: headline, content: '' } })],
      assumptions: ['邮件通过 Gmail 连接发送；平台自带的邮件服务只用来发系统通知'],
    };
  }
  if (id === 'kb') {
    const tools = aigenKbTools(ctx);
    if (!tools.length) return { notes: [{ tone: 'warning', text: '描述里提到了知识库，但这个项目里没有可用的知识库 MCP 服务器。可以在连接器市场「接入 MCP 服务器」。' }] };
    const t = tools[0];
    return { steps: [aigenAct('kb', t.connector, t.op, { name: t.label, phrase: '搜索知识库', why: `调用 MCP 服务器「${resolveConnector(t.connector).name}」的搜索工具`, config: { query: headline } })] };
  }
  if (id === 'notify') {
    const imPick = aigenImPick(ctx);
    const multi = AIGEN_IMS.filter((x) => ctx.usable(x).length).length > 1;
    const qIm = !imPick.said && multi ? aigenImQuestion(ctx, 'im', imPick.im) : null;
    const im = qIm ? aigenAnswer(ctx, qIm) : imPick.im;
    const groupAt = aigenGroupName(ctx.text) ? 0 : ctx.find(['群']);
    const personAt = ctx.find(['申请人', '提交人', '提问人', '发起人', '本人', '负责人', '上级', '对方']);
    const qTarget = groupAt < 0 && personAt < 0 ? { id: 'notifyTarget', short: '通知发给谁', title: '通知发到群里还是发给个人？', desc: '描述里没有说通知谁。', options: [{ value: 'group', label: '群聊' }, { value: 'person', label: '个人' }], recommended: 'group' } : null;
    const targets = qTarget ? [aigenAnswer(ctx, qTarget)] : [groupAt >= 0 && 'group', personAt >= 0 && 'person'].filter(Boolean);
    const prevTicket = env.prior.find((s) => s.key === 'ticket' && s.connector === 'jira' && ctx.has(s.key));
    const base = prevAi ? `{{@${prevAi.key}.result}}` : headline;
    const sampleName = env.sample && typeof env.sample === 'object' && env.sample.name !== undefined;
    const fallback = !base && sampleName ? `${env.trigger.name}：{{trigger.name}}${env.sample.employee_id !== undefined ? '（{{trigger.employee_id}}）' : ''}` : '';
    const content = base && prevTicket ? `${base}，工单 {{@ticket.key}}` : base || fallback;
    const groupName = aigenGroupName(ctx.text);
    const deps = [qIm && 'im', qTarget && 'notifyTarget'].filter(Boolean);
    const steps = targets.map((target) => aigenNotify(target === 'group' ? 'notify' : 'notifyPerson', im, {
      target, deps,
      name: target === 'group' ? `通知${groupName || aigenImLabel(im, 'group')}` : '通知相关的人',
      phrase: target === 'group' ? `通知${groupName || aigenImLabel(im, 'group')}` : `用${aigenImLabel(im, 'person')}通知相关的人`,
      why: target === 'group' ? `发到${aigenImLabel(im, 'group')}${groupName ? `「${groupName}」` : ''}` : `用${aigenImLabel(im, 'person')}发给${person ? '事件里的相关人员' : '指定的人'}`,
      receiver: target === 'group' ? groupName : person,
      content,
    }));
    return {
      steps,
      questions: [qIm, qTarget].filter(Boolean),
      assumptions: [!content && '通知内容需要在编辑器里填写，可以引用上游数据', targets.includes('group') && !groupName && '没看出要发到哪个群，生成后在编辑器里选择'].filter(Boolean),
    };
  }
  return {};
}

function aigenGeneric(ctx) {
  const trig = aigenDetectTrigger(ctx);
  const caps = aigenDetectCaps(ctx, trig ? trig.hit : null);
  if (!trig && !caps.length) return { vague: true, title: '还需要多一点信息', reason: '描述里没看出具体的系统、事件或要做的事。' };
  if (!caps.length) return { vague: true, title: '还不知道之后要做什么', reason: `看出了什么时候运行（${trig.step.when}），但没看出之后要在哪个系统里做什么。` };
  const qWhen = trig ? null : { id: 'when', short: '什么时候运行', title: '这个工作流什么时候运行？', desc: '描述里没有提到触发条件。', options: [{ value: 'webhook', label: '其他系统调用时' }, { value: 'schedule', label: '定时（工作日 9:00）' }, { value: 'manual', label: '手动运行' }], recommended: caps.some((c) => ['query', 'summarize'].includes(c)) ? 'schedule' : 'webhook' };
  const when = qWhen ? aigenAnswer(ctx, qWhen) : null;
  const trigger = trig ? trig.step
    : when === 'schedule' ? aigenTrig('schedule', 'every', { name: '定时任务', when: '工作日 09:00', why: '工作日 09:00（北京时间）自动运行', config: aigenSchedule(ctx, 'workday').config, deps: ['when'] })
      : when === 'manual' ? aigenTrig('manual-trigger', 'manual', { name: '手动触发', when: '手动运行', why: '点「运行」时触发，适合一次性任务', config: {}, deps: ['when'] })
        : aigenTrig('webhook', 'catch', { name: 'Webhook 触发器', when: '其他系统调用 Webhook', why: '其他系统把数据推到这个地址时触发', config: { auth: '无鉴权', bodyType: 'JSON' }, deps: ['when'] });
  const sample = nodeOutput({ kind: 'trigger', connector: trigger.connector, op: trigger.op, config: { ...defaultTriggerConfig(trigger.connector, trigger.op), ...(trigger.config || {}) } });
  const built = caps.reduce((acc, id) => {
    const r = aigenCapStep(id, ctx, { trigger, sample, prior: acc.steps });
    return {
      steps: [...acc.steps, ...(r.steps || [])],
      questions: [...acc.questions, ...(r.questions || []).filter((q) => !acc.questions.some((x) => x.id === q.id))],
      assumptions: [...acc.assumptions, ...(r.assumptions || [])],
      notes: [...acc.notes, ...(r.notes || [])],
    };
  }, { steps: [], questions: [], assumptions: [], notes: [] });
  if (!built.steps.length) return { vague: true, title: '找不到能完成这件事的连接器', reason: '看出了要做的事，但这个项目里没有能完成它的连接器。', notes: built.notes };
  if (ctx.unavailable.length && !built.steps.some((s) => !/^notify/.test(s.key))) {
    return { vague: true, title: '描述里的系统暂时用不了', reason: `要用的「${ctx.unavailable.join('」「')}」现在还不能在工作流里使用，AI 不会拿别的系统代替。`, notes: built.notes };
  }
  const changeEvent = trigger.connector === 'beisen' && trigger.op === 'employee_changed';
  const idRef = changeEvent ? '{{trigger.employee_id}}-{{trigger.effective_date}}' : !['schedule', 'manual-trigger', 'forms', 'subflows', 'alert'].includes(trigger.connector) ? aigenIdRef(sample) : '';
  const qDedupe = idRef ? { id: 'dedupe', short: '重复事件', title: '同一个事件被重复推送时怎么处理？', desc: changeEvent ? `同一个人可能多次变动，去重键用工号加生效日期（${idRef}），同一次变动只处理一次。` : `上游重试或轮询重叠时会重复推送，去重键用 ${idRef}。`, options: [{ value: 'on', label: '去重（30 天内只处理一次）' }, { value: 'off', label: '不去重' }], recommended: 'on' } : null;
  const all = [qWhen, ...built.questions, qDedupe].filter(Boolean);
  const leftover = ctx.mentions.map((m) => m.id).filter((id) => id !== trigger.connector && !built.steps.some((s) => s.connector === id) && !AI_CONNECTORS.includes(id));
  return {
    title: aigenTitleFrom(ctx.text),
    trigger: { ...trigger, deps: [...(trigger.deps || []), ...(qDedupe ? ['dedupe'] : [])] },
    steps: built.steps,
    questions: all.slice(0, 3),
    overflow: all.slice(3),
    dedupe: qDedupe && aigenAnswer(ctx, qDedupe) === 'on' ? { key: idRef, window: '30d' } : null,
    assumptions: [
      ...built.assumptions,
      leftover.length > 0 && `提到了「${leftover.map((id) => resolveConnector(id).name).join('」「')}」，但没看出要在里面做什么，没有为它加步骤`,
    ].filter(Boolean),
    notes: built.notes,
  };
}

function aigenExtras(ctx, draft, covers) {
  const ids = aigenDetectCaps(ctx, null).filter((id) => !covers.includes(id) && AIGEN_EXTRA_CAPS.includes(id));
  if (!ids.length) return null;
  const sample = nodeOutput({ kind: 'trigger', connector: draft.trigger.connector, op: draft.trigger.op, config: { ...defaultTriggerConfig(draft.trigger.connector, draft.trigger.op), ...(draft.trigger.config || {}) } });
  return ids.reduce((acc, id) => {
    const r = aigenCapStep(id, ctx, { trigger: draft.trigger, sample, prior: [...draft.steps, ...acc.steps] });
    return { steps: [...acc.steps, ...(r.steps || []).map((s) => ({ ...s, why: `${s.why}（描述里额外提到的）` }))], assumptions: [...acc.assumptions, ...(r.assumptions || [])], notes: [...acc.notes, ...(r.notes || [])] };
  }, { steps: [], assumptions: [], notes: [] });
}

function aigenNotes(ctx) {
  return [
    ...ctx.off.filter((o) => o.kind === 'draft').map((o) => ({ tone: 'warning', text: `「${o.c.name}」是还没发布的自定义连接器，发布后才能在工作流里使用，这次没有用它。` })),
    ...ctx.off.filter((o) => o.kind === 'mcp').map(({ mc }) => ({ tone: 'warning', text: mc.status !== 'connected' ? `MCP 服务器「${mc.name}」当前连接异常（${mc.error || '无法连接'}），这次没有用它的工具。` : `MCP 服务器「${mc.name}」不在项目「${ctx.project ? ctx.project.name : ''}」的可用范围里，这次没有用它。` })),
    ...ctx.unknown.map(({ u }) => ({ tone: 'info', text: `连接器市场里还没有「${u.name}」连接器。可以提交需求，或者用「HTTP 请求」节点对接它的接口。` })),
  ];
}

function aigenVagueResult(ctx, draft) {
  const suggest = [...new Set(ctx.state.connections.filter((c) => connAvailableIn(c, ctx.pid) && connectionPerm(ctx.state, c) && !AI_CONNECTORS.includes(c.connector)).map((c) => c.connector))]
    .map((id) => resolveConnector(id))
    .filter(Boolean)
    .slice(0, 8);
  return {
    vague: true,
    title: draft.title || '还需要多一点信息',
    reason: draft.reason,
    asks: ['从哪里开始：哪个系统发生什么事件时运行，或者什么时间运行', '要做什么：在哪个系统里建记录、发起审批、建工单或者写台账', '做完通知谁：哪个群，或者哪个人'],
    suggest,
    notes: draft.notes || [],
  };
}

function aigenLive(list, ctx) {
  return list.filter((s) => ctx.has(s.key)).flatMap((s) => [s, ...(s.branches || []).flatMap((b) => aigenLive(b.steps, ctx)), ...(s.kind === 'loop' ? aigenLive(s.steps || [], ctx) : [])]);
}

function aigenAll(list) {
  return list.flatMap((s) => [s, ...(s.branches || []).flatMap((b) => aigenAll(b.steps)), ...(s.kind === 'loop' ? aigenAll(s.steps || []) : [])]);
}

function aigenRefs(value, ids) {
  if (typeof value === 'string') return value.replace(/\{\{@([A-Za-z0-9_]+)([^}]*)\}\}/g, (m, key, rest) => (ids[key] ? `{{${ids[key]}${rest}}}` : ''));
  if (Array.isArray(value)) return value.map((v) => aigenRefs(v, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, aigenRefs(v, ids)]));
  return value;
}

function aigenConnRank(c, prefer) {
  return (c.status === 'active' ? 0 : 2) + (prefer && c.connector !== prefer ? 1 : 0);
}

function aigenRequirements(draft, ctx, conns) {
  const live = [draft.trigger, ...aigenLive(draft.steps, ctx)];
  const needs = live.flatMap((s) => [
    ...(['trigger', 'action'].includes(s.kind) ? [{ connector: s.connector, by: s.name }] : []),
    ...(s.kind === 'agent' ? (s.tools || []).map((t) => ({ connector: t.connector, by: `${s.name}的工具` })) : []),
    ...(['ai', 'agent'].includes(s.kind) ? [{ model: true, by: s.name }] : []),
  ]);
  const groups = needs.reduce((acc, n) => {
    const c = n.model ? null : resolveConnector(n.connector);
    if (!n.model && (!c || (c.auth === 'none' && !c.mcp))) return acc;
    const key = n.model ? 'model' : c.mcp ? `m:${c.id}` : `c:${c.id}`;
    const hit = acc.find((g) => g.key === key);
    if (hit) return acc.map((g) => (g.key === key ? { ...g, usedBy: [...new Set([...g.usedBy, n.by])] } : g));
    return [...acc, { key, kind: n.model ? 'model' : c.mcp ? 'mcp' : 'connector', connector: n.model ? null : c.id, usedBy: [n.by] }];
  }, []);
  const prefer = draft.modelPrefer || AI_CONNECTORS.find((id) => ctx.mentioned(id)) || 'claude';
  return groups.map((g) => {
    if (g.kind === 'mcp') return { ...g, label: resolveConnector(g.connector).name, options: [], selected: null };
    const options = g.kind === 'model'
      ? usableConnections(ctx.state, { connectors: AI_CONNECTORS, projectId: ctx.pid }).filter((c) => !ctx.testTargets.has(c.id))
      : ctx.usable(g.connector);
    const ranked = [...options].sort((a, b) => aigenConnRank(a, g.kind === 'model' ? prefer : null) - aigenConnRank(b, g.kind === 'model' ? prefer : null));
    const chosen = conns[g.key];
    const selected = chosen === '' ? null : chosen && options.some((c) => c.id === chosen) ? chosen : (ranked[0] || {}).id || null;
    const conn = selected ? ctx.state.connections.find((c) => c.id === selected) : null;
    const issue = conn ? connectionIssue(ctx.state, conn.id, ctx.pid) : null;
    const testEnv = ctx.envs.find((e) => e.key === 'test');
    const mappedTo = conn && testEnv && testEnv.connectionMap[conn.id] ? ctx.state.connections.find((c) => c.id === testEnv.connectionMap[conn.id]) : null;
    return {
      ...g,
      label: g.kind === 'model' ? '大模型' : resolveConnector(g.connector).name,
      icon: g.kind === 'model' ? (conn ? conn.connector : prefer) : g.connector,
      options,
      selected,
      conn,
      problem: issue ? issue.text : null,
      canFix: Boolean(conn && issue && ['owner', 'edit'].includes(connectionPerm(ctx.state, conn))),
      ownerName: conn ? personName(conn.owner) : '',
      model: g.kind === 'model' && conn ? aigenModelName(ctx.state, conn.id) : null,
      envNote: mappedTo ? `这是生产环境的连接，测试环境会自动换成「${mappedTo.name}」` : '',
    };
  });
}

function aigenNode(s, ids, pick, buildList, draft, state) {
  const cfg = aigenRefs(s.config || {}, ids);
  if (s.kind === 'trigger') {
    const base = triggerFromPick(s.connector, s.op);
    const c = resolveConnector(s.connector);
    return {
      ...base,
      name: s.name || base.name,
      config: { ...base.config, ...cfg },
      connectionId: c && c.auth !== 'none' ? pick(`c:${s.connector}`) : null,
      ...(draft.dedupe ? { runSettings: { dedupe: { enabled: true, key: draft.dedupe.key, window: draft.dedupe.window }, concurrency: { max: 5, orderKey: '' } } } : {}),
      aiDraft: true,
    };
  }
  if (s.kind === 'action') {
    const base = actionFromPick(s.connector, s.op);
    const c = resolveConnector(s.connector);
    return { ...base, id: ids[s.key], name: s.name || base.name, config: cfg, connectionId: c && c.auth !== 'none' && !c.mcp ? pick(`c:${s.connector}`) : null, aiDraft: true };
  }
  const settings = { strategy: 'retry-stop', rules: [], times: 3, interval: 10 };
  if (s.kind === 'ai') {
    const connId = pick('model');
    return { id: ids[s.key], kind: 'ai', name: s.name, config: { connectionId: connId, modelName: aigenModelName(state, connId), prompt: '', format: '文本', temperature: 0.2, ...cfg }, settings, aiDraft: true };
  }
  if (s.kind === 'agent') {
    const connId = pick('model');
    const tools = (s.tools || []).map((t) => {
      const c = resolveConnector(t.connector);
      return { id: uid('t'), type: t.type, connector: t.connector, op: t.op, approval: Boolean(t.approval), ...(c && c.auth !== 'none' && !c.mcp ? { connectionId: pick(`c:${t.connector}`) } : {}) };
    });
    return { id: ids[s.key], kind: 'agent', name: s.name, config: { connectionId: connId, modelName: aigenModelName(state, connId), instructions: '', input: '', maxSteps: 6, tokenBudget: 20000, onLimit: 'fail', outputFields: [], ...cfg, tools }, settings, aiDraft: true };
  }
  if (s.kind === 'branch') {
    return {
      id: ids[s.key],
      kind: 'branch',
      name: s.name,
      branches: s.branches.map((b) => (b.isDefault
        ? { id: uid('b'), name: b.name, isDefault: true, steps: buildList(b.steps) }
        : { id: uid('b'), name: b.name, conditions: aigenRefs(b.conditions, ids), logic: 'and', steps: buildList(b.steps) })),
      aiDraft: true,
    };
  }
  return { id: ids[s.key], kind: 'loop', name: s.name, config: { items: '', mode: '串行', max: 100, concurrency: 5, ...cfg }, steps: buildList(s.steps || []), aiDraft: true };
}

function aigenSourceLabel(source, nodesById) {
  const m = /^\{\{\s*([^.\s}]+)\.?([^}]*)\}\}$/.exec(String(source || '').trim());
  if (!m) return source || '';
  if (m[1] === 'config') return `项目配置 · ${m[2]}`;
  const node = nodesById[m[1]];
  return `${node ? node.name : m[1]} · ${m[2]}`;
}

function aigenLookupFix(row, schema, resolve, tables) {
  const f = schema.find((x) => x.key === row.target);
  if (!row.source || !f || f.type !== '单选' || !f.options) return row;
  const probe = evalMapping({ fields: [{ ...row, transforms: [] }] }, { resolve, tables, schema: [] });
  const value = probe.value[row.target];
  if (value === undefined || value === null || f.options.includes(String(value))) return row;
  const table = tables.find((t) => t.rows.some((x) => x.k === String(value) && f.options.includes(x.v)));
  return table ? { ...row, transforms: [...row.transforms, { type: 'lookup', arg: table.id }], reason: `${row.reason}，再用映射表「${table.name}」转换` } : row;
}

function aigenApplyMappings(graph, draft, ids, ctx) {
  const byKey = Object.fromEntries(aigenAll([draft.trigger, ...draft.steps]).map((s) => [s.key, s]));
  const keyById = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  const contexts = nodeContexts(graph);
  const nodesById = Object.fromEntries(allNodes(graph).map((n) => [n.id, n]));
  const tables = (ctx.state.mappingTables || []).filter((t) => t.projectId === ctx.pid);
  const configSample = Object.fromEntries(ctx.state.variables.filter((v) => v.projectId === ctx.pid).map((v) => [v.key, (v.values || {}).default]));
  const resolve = (head) => (head === 'config' ? configSample : nodesById[head] ? nodeOutput(nodesById[head]) : undefined);
  const plans = allNodes(graph).map((node) => {
    const step = byKey[keyById[node.id]];
    const schema = step && step.map ? mappingSchema(node, step.map.field) : null;
    if (!schema) return null;
    const ups = ((contexts[node.id] || {}).upstream || []).filter((u) => !['branch', 'parallel', 'loop', 'end', 'delay'].includes(u.kind));
    const candidates = ups.flatMap((u) => mapCandidates(nodeOutput(u), u.id, u.name));
    const suggestions = suggestMapping(schema, candidates, []);
    const hints = step.map.hints || {};
    const constants = step.map.constants || {};
    const rows = schema.flatMap((f) => {
      const h = hints[f.key];
      const hs = h ? aigenRefs(h.source, ids) : '';
      if (hs && (h.transforms || []).length) return [{ id: uid('m'), target: f.key, source: hs, transforms: h.transforms, ai: true, confidence: 0.8, reason: h.reason }];
      const s = suggestions.find((x) => x.target === f.key && x.confidence >= AIGEN_MIN_CONFIDENCE);
      if (s) return [{ id: uid('m'), target: f.key, source: s.source, transforms: s.transforms, ai: true, confidence: Math.round(s.confidence * 100) / 100, reason: s.reason }];
      if (hs) return [{ id: uid('m'), target: f.key, source: hs, transforms: h.transforms || [], ai: true, confidence: 0.8, reason: h.reason }];
      if (constants[f.key] !== undefined) return [{ id: uid('m'), target: f.key, source: '', constant: constants[f.key], transforms: [], ai: true, reason: '按描述设为固定值' }];
      return [];
    }).map((r) => aigenLookupFix(r, schema, resolve, tables));
    const $map = { mode: 'object', fields: rows.map(({ reason, ...r }) => r) };
    const evaluated = evalMapping($map, { resolve, tables, schema });
    return {
      nodeId: node.id,
      field: step.map.field,
      $map,
      view: {
        total: schema.length,
        rows: rows.map((r) => {
          const e = evaluated.rows.find((x) => x.id === r.id) || {};
          const f = schema.find((x) => x.key === r.target) || {};
          return { target: r.target, required: Boolean(f.required), sourceLabel: aigenSourceLabel(r.source, nodesById), constant: r.constant, transforms: r.transforms, reason: r.reason, value: e.value, error: e.error || null };
        }),
        low: suggestions.filter((s) => s.confidence < AIGEN_MIN_CONFIDENCE && !rows.some((r) => r.target === s.target)).map((s) => ({ target: s.target, sourceLabel: aigenSourceLabel(s.source, nodesById), confidence: s.confidence })),
        missing: evaluated.missing.map((f) => f.key),
        unmatched: schema.filter((f) => !f.required && !rows.some((r) => r.target === f.key)).map((f) => f.key),
      },
      key: step.key,
    };
  }).filter(Boolean);
  const next = mapGraph(graph, (node) => {
    const p = plans.find((x) => x.nodeId === node.id);
    return p ? { ...node, config: { ...node.config, [p.field]: { $map: p.$map } } } : node;
  });
  return { graph: next, mappings: Object.fromEntries(plans.map((p) => [p.key, p.view])) };
}

function aigenMaterialize(draft, ctx, conns) {
  const ids = Object.fromEntries([['trigger', 'trigger'], ...aigenLive(draft.steps, ctx).map((s) => [s.key, uid('n')])]);
  const requirements = aigenRequirements(draft, ctx, conns);
  const pick = (key) => { const r = requirements.find((x) => x.key === key); return r ? r.selected : null; };
  const buildList = (list) => list.filter((s) => ctx.has(s.key)).map((s) => aigenNode(s, ids, pick, buildList, draft, ctx.state));
  const graph = { trigger: aigenNode(draft.trigger, ids, pick, buildList, draft, ctx.state), steps: buildList(draft.steps) };
  const mapped = aigenApplyMappings(graph, draft, ids, ctx);
  return { ids, requirements, graph: mapped.graph, mappings: mapped.mappings };
}

function aigenSub(s) {
  if (s.kind === 'trigger' || s.kind === 'action') {
    const c = resolveConnector(s.connector);
    const list = c ? (s.kind === 'trigger' ? c.triggers : c.actions) : [];
    const o = list.find((x) => x.key === s.op);
    return `${s.kind === 'trigger' ? '触发器' : c && c.mcp ? 'MCP 工具' : '操作'} · ${c ? c.name : s.connector}${o ? ` · ${o.name}` : ''}`;
  }
  if (s.kind === 'ai') return `AI 助手 · ${(s.config || {}).format === 'JSON' ? '按 JSON 结构输出' : '输出文本'}`;
  if (s.kind === 'agent') return `AI 智能体 · ${(s.tools || []).length} 个工具 · 最多 ${(s.config || {}).maxSteps} 步`;
  if (s.kind === 'branch') return `分支 · ${s.branches.length} 条路径`;
  return '循环';
}

function aigenView(draft, ctx, built, issuesById, questions) {
  const nodesById = Object.fromEntries(allNodes(built.graph).map((n) => [n.id, n]));
  const short = Object.fromEntries(questions.map((q) => [q.id, q.short]));
  const counter = { n: 0 };
  const conv = (s, parentOff) => {
    const removed = !ctx.has(s.key);
    const off = parentOff || removed;
    const node = !off && built.ids[s.key] ? nodesById[built.ids[s.key]] : null;
    counter.n += !off && s.kind !== 'trigger' ? 1 : 0;
    return {
      key: s.key,
      kind: s.kind,
      name: s.name,
      why: s.why,
      removed,
      inactive: Boolean(parentOff && !removed),
      no: !off && s.kind !== 'trigger' ? counter.n : null,
      iconNode: node || { kind: s.kind, connector: s.connector, op: s.op, name: s.name, config: {} },
      sub: aigenSub(s),
      deps: (s.deps || []).map((id) => short[id]).filter(Boolean),
      issues: node ? issuesById[node.id] || [] : [],
      mapping: node ? built.mappings[s.key] || null : null,
      tools: s.kind === 'agent' ? (s.tools || []).map((t) => {
        const c = resolveConnector(t.connector);
        const o = c && c.actions.find((a) => a.key === t.op);
        return { key: t.key, connector: t.connector, label: `${c ? c.name : t.connector} · ${o ? o.name : t.op}`, mcp: Boolean(c && c.mcp), approval: t.approval };
      }) : null,
      paths: s.kind === 'branch'
        ? s.branches.map((b) => ({ key: b.key, label: b.label || b.name, steps: b.steps.map((c) => conv(c, off)) }))
        : s.kind === 'loop' ? [{ key: `${s.key}-body`, label: '对每一项执行', steps: (s.steps || []).map((c) => conv(c, off)) }] : null,
    };
  };
  const trigger = conv(draft.trigger, false);
  return { trigger, steps: draft.steps.map((s) => conv(s, false)) };
}

function aigenSummary(draft, ctx) {
  const phrase = (s) => {
    if (s.kind === 'branch') {
      return s.branches.filter((b) => !b.isDefault).map((b) => {
        const inner = b.steps.filter((c) => ctx.has(c.key)).map(phrase).filter(Boolean);
        return inner.length ? `${b.label}时${inner.join('、')}` : '';
      }).filter(Boolean).join('；');
    }
    return s.phrase || s.name;
  };
  const parts = draft.steps.filter((s) => ctx.has(s.key)).map(phrase).filter(Boolean);
  const when = aigenSpace(`当${draft.trigger.when}时`);
  return parts.length ? `${when}，${parts.join('，')}。` : `${when}运行，还没有要执行的步骤。`;
}

function aigenPlan({ text, pid, answers, removed, conns, state }) {
  const ctx = aigenContext({ text, pid, answers, removed, state });
  const notes = aigenNotes(ctx);
  if (ctx.tc.length < 4) return aigenVagueResult(ctx, { title: '再多说一点', reason: '描述太短了，还看不出要做什么。', notes });
  const scenario = AIGEN_SCENARIOS.map((s) => ({ s, score: s.match(ctx) })).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score)[0];
  const base = scenario ? scenario.s.build(ctx) : aigenGeneric(ctx);
  if (base.vague) return aigenVagueResult(ctx, { ...base, notes: [...(base.notes || []), ...notes] });
  const extra = scenario ? aigenExtras(ctx, base, base.covers || []) : null;
  const draft = extra ? { ...base, steps: [...base.steps, ...extra.steps], assumptions: [...base.assumptions, ...extra.assumptions], notes: [...(base.notes || []), ...extra.notes] } : base;
  const built = aigenMaterialize(draft, ctx, conns || {});
  const questions = draft.questions.slice(0, 3).map((q) => ({ ...q, answered: q.options.some((o) => o.value === ctx.answers[q.id]), value: aigenAnswer(ctx, q) }));
  const issues = workflowIssues({ id: 'aigen', projectId: pid, trigger: built.graph.trigger, steps: built.graph.steps }, state)
    .filter((i) => i.tab !== 'conn' && !/连接/.test(i.text) && i.text !== 'AI 生成的节点尚未确认');
  const issuesById = issues.reduce((acc, i) => ({ ...acc, [i.node.id]: [...new Set([...(acc[i.node.id] || []), i.text])] }), {});
  const nodes = allNodes(built.graph);
  const systemIds = [...new Set([
    ...nodes.filter((n) => n.connector).map((n) => n.connector),
    ...nodes.filter((n) => n.kind === 'agent').flatMap((n) => (n.config.tools || []).map((t) => t.connector)),
    ...built.requirements.filter((r) => r.kind === 'model' && r.conn).map((r) => r.conn.connector),
  ])];
  const envNote = ctx.envs.length > 1 && ctx.project ? [`项目「${ctx.project.name}」分测试和生产环境：生成的是草稿，先发布到测试环境验证，再申请推广到生产`] : [];
  const dedupeNote = draft.dedupe ? [`去重键是 ${draft.dedupe.key}，30 天内重复的事件只记一条「已去重」日志，不会再执行`] : [];
  const overflow = [...draft.questions.slice(3), ...(draft.overflow || [])].map((q) => `${q.title.replace(/？$/, '')}：先按「${(q.options.find((o) => o.value === aigenAnswer(ctx, q)) || {}).label}」处理`);
  return {
    vague: false,
    scenario: scenario ? scenario.s.id : 'generic',
    title: draft.title,
    summary: aigenSummary(draft, ctx),
    questions,
    assumptions: [...new Set([...draft.assumptions, ...overflow, ...dedupeNote, ...envNote])],
    notes: [...(draft.notes || []), ...notes],
    view: aigenView(draft, ctx, built, issuesById, questions),
    requirements: built.requirements,
    graph: built.graph,
    systems: systemIds.map((id) => resolveConnector(id)).filter((c) => c && !c.builtin),
    removedCount: aigenAll(draft.steps).filter((s) => !ctx.has(s.key)).length,
    stats: {
      nodes: nodes.length,
      steps: nodes.length - 1,
      mapped: Object.values(built.mappings).reduce((a, m) => a + m.rows.length, 0),
      todo: issues.filter((i) => i.level === 'error').length,
    },
  };
}

const AIGEN_MAX = 500;
const AIGEN_NONE = '__none';
const AIGEN_MIN_CONFIDENCE = 0.8;
const AIGEN_THINK_TICKS = [380, 760, 1140];
const AIGEN_THINK_MS = 1520;
const AIGEN_MODELS = { claude: 'claude-sonnet-5', openai: 'gpt-4.1', deepseek: 'deepseek-chat' };
const AIGEN_BUDGETS = { 4: 12000, 6: 20000, 10: 32000 };
const AIGEN_IMS = ['feishu', 'wecom', 'dingtalk', 'slack', 'microsoft-teams'];
const AIGEN_GENERIC_PARTS = ['mcp', '服务器', '系统', '平台', '内部', '官方', '助手', 'api', '试用'];
const AIGEN_NOT_EVENT_IDS = ['user_id', 'open_id', 'chat_id', 'app_token', 'table_id', 'sender'];

const AIGEN_EXAMPLES = [
  { key: 'onboard', label: '入职开通账号', prompt: '员工在北森完成入职后，在飞书多维表格建档，按部门开通 GitHub 和 Jira 账号，并通知 HR 群' },
  { key: 'reimburse', label: '报销票据识别入账', prompt: '报销系统推送票据图片后，用 AI 识别发票号码、金额和销售方，大额票据发起复核，识别结果写入飞书报销台账' },
  { key: 'lead', label: '企业微信线索进 CRM', prompt: '销售在企业微信添加客户后，自动在 CRM 创建线索，并提醒销售群跟进' },
  { key: 'helpdesk', label: 'IT 服务台智能体', prompt: '员工在飞书里向 IT 助手提问，智能体先查内部知识库回答，解决不了就建 Jira 工单，并把工单号回复给提问人' },
  { key: 'report', label: '每日销售日报', prompt: '每个工作日早上 9 点汇总 Salesforce 昨天的商机，用 AI 写一段日报摘要，发到销售运营群' },
];

const AIGEN_INTRO = [
  { icon: 'ListChecks', title: '列出步骤', desc: '触发器、操作、分支和智能体，每一步写明为什么' },
  { icon: 'Link2', title: '检查连接', desc: '只用这个项目里能用的连接，缺的可以当场新建' },
  { icon: 'MessageCircleQuestion', title: '先问再做', desc: '拿不准的地方列成问题，你确认后才生成' },
  { icon: 'ArrowLeftRight', title: '预填字段映射', desc: '按上游样例数据对应字段，低置信度的不会自动填' },
];

const AIGEN_ALIASES = {
  feishu: ['飞书', 'lark', '多维表格'],
  beisen: ['北森', 'italent'],
  jira: ['jira'],
  github: ['github'],
  gitlab: ['gitlab'],
  salesforce: ['salesforce'],
  hubspot: ['hubspot'],
  xiaoshouyi: ['销售易'],
  kingdee: ['金蝶', 'kingdee'],
  netsuite: ['netsuite'],
  'sap-ariba': ['ariba'],
  mysql: ['mysql'],
  postgres: ['postgres', 'postgresql'],
  redis: ['redis'],
  snowflake: ['snowflake'],
  'aliyun-oss': ['阿里云oss', 'oss'],
  'google-drive': ['googledrive', '谷歌云盘'],
  openai: ['openai', 'gpt', 'chatgpt'],
  claude: ['claude'],
  deepseek: ['deepseek'],
  shopify: ['shopify'],
  youzan: ['有赞'],
  stripe: ['stripe'],
  slack: ['slack'],
  'microsoft-teams': ['teams'],
  dingtalk: ['钉钉'],
  wecom: ['企业微信', '企微', 'wecom'],
  gmail: ['gmail'],
  zendesk: ['zendesk'],
  'service-now': ['servicenow'],
  notion: ['notion'],
};

const AIGEN_TRIGGERS = [
  { words: ['入职'], options: [['beisen', 'onboarding_completed'], ['feishu', 'user_created']] },
  { words: ['offer', '接受录用'], options: [['beisen', 'offer_accepted']] },
  { words: ['离职'], options: [['beisen', 'employee_left']] },
  { words: ['调岗', '调动', '转岗', '部门变动', '岗位变动', '异动'], options: [['beisen', 'employee_changed']] },
  { words: ['审批通过', '审批结束', '审批完成', '审批后', '审批通过后'], options: [['feishu', 'approval_approved'], ['dingtalk', 'approval_finished']] },
  { words: ['发起审批时', '提交审批时', '新的审批'], options: [['feishu', 'approval_created']] },
  { words: ['添加客户', '加客户', '外部联系人', '加好友'], options: [['wecom', 'external_contact_added']] },
  { words: ['提问', '@', '机器人收到', '收到消息', '咨询'], options: [['feishu', 'message_received'], ['slack', 'new_message'], ['microsoft-teams', 'channel_message']] },
  { words: ['pr合并', 'pullrequest合并', '合并请求', '代码合并'], options: [['github', 'pr_merged'], ['gitlab', 'mr_merged']] },
  { words: ['代码推送', 'push'], options: [['github', 'push']] },
  { words: ['流水线失败', '构建失败', 'ci失败'], options: [['gitlab', 'pipeline_failed']] },
  { words: ['问题创建', '新建问题', '新问题', 'issue创建'], options: [['jira', 'issue_created'], ['github', 'issue_opened']] },
  { words: ['发布release', 'release发布'], options: [['github', 'release_published']] },
  { words: ['新订单', '下单', '订单创建'], options: [['shopify', 'order_created'], ['youzan', 'trade_paid']] },
  { words: ['退款'], options: [['shopify', 'order_refunded']] },
  { words: ['支付成功', '付款成功'], options: [['stripe', 'payment_succeeded'], ['youzan', 'trade_paid']] },
  { words: ['新工单', '工单创建', '提交工单'], options: [['zendesk', 'ticket_created'], ['service-now', 'incident_created']] },
  { words: ['收到邮件', '新邮件'], options: [['gmail', 'new_email']] },
  { words: ['新线索'], options: [['salesforce', 'lead_created']] },
  { words: ['赢单', '成交'], options: [['salesforce', 'opportunity_won']] },
  { words: ['合同签订', '签约', '签合同'], options: [['xiaoshouyi', 'contract_signed']] },
  { words: ['交易阶段'], options: [['hubspot', 'deal_stage_changed']] },
  { words: ['多维表格新增', '新增记录', '记录变更'], options: [['feishu', 'bitable_record_changed']] },
  { words: ['新增行', '新数据'], options: [['mysql', 'new_row'], ['postgres', 'new_row']] },
  { words: ['上传文件', '新文件'], options: [['aliyun-oss', 'object_created'], ['google-drive', 'new_file']] },
  { words: ['凭证审核'], options: [['kingdee', 'voucher_audited']] },
  { words: ['采购订单审批'], options: [['sap-ariba', 'po_approved']] },
  { words: ['日程创建', '新日程', '会议创建'], options: [['feishu', 'calendar_event_created']] },
  { words: ['流程归档', 'oa流程结束'], options: [['cc_oa', 'workflow_done']] },
  { words: ['表单', '填写', '登记表'], options: [['forms', 'form_submitted']] },
  { words: ['推送', 'webhook', '回调', '调用接口', '接口收到'], options: [['webhook', 'catch']] },
  { words: ['每天', '每日', '每周', '每月', '工作日', '定时', '每小时', '早上', '晚上', '日报', '周报', '月报'], options: [['schedule', 'every']] },
  { words: ['手动'], options: [['manual-trigger', 'manual']] },
];

const AIGEN_BUILTIN_WHEN = {
  'webhook.catch': '其他系统调用 Webhook',
  'webhook.catch_sync': '其他系统同步调用 Webhook',
  'forms.form_submitted': '有人提交表单',
  'manual-trigger.manual': '手动运行',
  'subflows.called': '被其他工作流调用',
};

const AIGEN_TRIGGER_CONFIG = {
  'feishu.message_received': { bot: 'IT 助手' },
  'webhook.catch': { auth: '无鉴权', bodyType: 'JSON' },
  'beisen.onboarding_completed': { interval: '5 分钟' },
  'beisen.employee_left': { interval: '15 分钟' },
  'beisen.employee_changed': { interval: '5 分钟', changeType: '调岗' },
  'beisen.offer_accepted': { interval: '15 分钟' },
};

const AIGEN_CAPS = [
  { id: 'feishuFreeze', words: ['暂停账号', '暂停飞书账号', '暂停他的飞书账号', '停用账号', '冻结账号', '禁用账号', '停用飞书账号'] },
  { id: 'feishuUpdate', words: ['更新部门', '调整部门', '同步部门', '更新飞书里的部门', '直属上级', '更新上级', '飞书里的部门'] },
  { id: 'record', words: ['建档', '档案', '登记到', '台账', '记到表', '记录到', '写入多维表格', '写进多维表格', '写到多维表格', '多维表格'] },
  { id: 'ticket', words: ['工单', '建单', '报修', /(建|创建|提)(一个|个)?(问题|缺陷|issue)/] },
  { id: 'approval', words: ['发起审批', '走审批', '复核', '审批流程', '发起流程', 'oa流程'] },
  { id: 'lead', words: ['线索'] },
  { id: 'account', words: ['建客户', '创建客户', '新建客户', '录入客户'] },
  { id: 'voucher', words: ['入账', '凭证', '应付单', '付款单'] },
  { id: 'query', words: ['查询', '汇总', '统计', '拉取', '读取'] },
  { id: 'extract', words: ['识别', '抽取', '提取', 'ocr'] },
  { id: 'summarize', words: ['摘要', '总结', '日报', '周报', '概括'] },
  { id: 'classify', words: ['分类', '判断类别', '判断优先级', '打标签'] },
  { id: 'translate', words: ['翻译'] },
  { id: 'calendar', words: ['日程', '约会议', '会议邀请'] },
  { id: 'chat', words: [/(建|拉|创建)(一个|个)?(飞书|钉钉|企业微信)?群/] },
  { id: 'doc', words: ['文档'] },
  { id: 'sms', words: ['短信'] },
  { id: 'email', words: ['发邮件', '邮件通知', '发送邮件', '邮件提醒'] },
  { id: 'kb', words: ['知识库'] },
  { id: 'notify', words: ['通知', '提醒', '推送到', '发到', '告知', '回复', '发给', '发消息', '发送到'] },
];

const AIGEN_EXTRA_CAPS = ['sms', 'email', 'calendar', 'chat', 'doc', 'translate'];

const AIGEN_TABLES = [
  { words: ['资产'], app: 'IT 资产台账', table: '资产' },
  { words: ['入职', '待入职'], app: '入职管理', table: '待入职' },
  { words: ['生日'], app: '员工关怀', table: '生日' },
  { words: ['合同'], app: '合同台账', table: '合同' },
  { words: ['报销', '票据', '发票'], app: '报销台账', table: '票据' },
];

const AIGEN_APPROVALS = [['采购', '采购申请（新）'], ['报销', '大额报销复核'], ['复核', '大额报销复核'], ['请假', '请假'], ['用印', '用印申请']];

const AIGEN_QUERY = [
  { connector: 'salesforce', op: 'soql_query', name: '查询 Salesforce 数据', why: '用 SOQL 查询需要的记录', config: { sql: 'SELECT Name, Amount, StageName\nFROM Opportunity\nWHERE LastModifiedDate = YESTERDAY' } },
  { connector: 'mysql', op: 'execute_query', name: '查询数据库', why: '执行 SQL 查出需要的数据', config: { sql: 'SELECT *\nFROM your_table\nLIMIT 100;' }, sample: true },
  { connector: 'postgres', op: 'execute_query', name: '查询数据库', why: '执行 SQL 查出需要的数据', config: { sql: 'SELECT *\nFROM your_table\nLIMIT 100;' }, sample: true },
  { connector: 'feishu', op: 'bitable_search_record', name: '查询多维表格', why: '按条件查询飞书多维表格里的记录', config: { app: '', table: '', filter: '' } },
  { connector: 'jira', op: 'search_issues', name: '搜索 Jira 问题', why: '用 JQL 搜索 Jira 问题', config: {} },
  { connector: 'kingdee', op: 'query_bill', name: '查询金蝶单据', why: '按条件查询金蝶单据', config: {} },
  { connector: 'snowflake', op: 'run_query', name: '查询 Snowflake', why: '在 Snowflake 执行查询', config: {} },
  { connector: 'netsuite', op: 'suiteql', name: '执行 SuiteQL', why: '在 NetSuite 执行 SuiteQL 查询', config: {} },
];

const AIGEN_QUERY_OUT = { salesforce: 'records', mysql: 'rows', postgres: 'rows', feishu: 'items', jira: 'issues' };

const AIGEN_AI_TASKS = {
  extract: { name: 'AI 提取关键信息', phrase: 'AI 提取关键信息', why: '让大模型从内容里提取关键字段，按 JSON 输出', prompt: '从下面的内容中提取关键信息，按 JSON 输出：', format: 'JSON', temperature: 0, fields: [{ k: 'result', t: '字符串', d: '提取结果' }] },
  summarize: { name: 'AI 生成摘要', phrase: 'AI 写摘要', why: '让大模型把内容整理成一段简短的摘要', prompt: '把下面的内容总结成 100 字以内的中文摘要：', format: '文本', temperature: 0.3 },
  classify: { name: 'AI 分类', phrase: 'AI 判断类别', why: '让大模型判断内容属于哪个类别，只输出类别名称', prompt: '判断下面的内容属于哪个类别，只输出类别名称：', format: '文本', temperature: 0 },
  translate: { name: 'AI 翻译', phrase: 'AI 翻译', why: '让大模型把内容翻译成英文', prompt: '把下面的内容翻译成英文：', format: '文本', temperature: 0.2 },
};

const AIGEN_UNKNOWN = [
  { name: '用友', words: ['用友'] },
  { name: '致远 OA', words: ['致远'] },
  { name: '蓝凌', words: ['蓝凌'] },
  { name: '钉钉宜搭', words: ['宜搭'] },
  { name: 'Moka', words: ['moka'] },
  { name: 'Workday', words: ['workday'] },
  { name: '企查查', words: ['企查查'] },
  { name: '禅道', words: ['禅道'] },
  { name: 'TAPD', words: ['tapd'] },
  { name: '简道云', words: ['简道云'] },
  { name: '明道云', words: ['明道云'] },
  { name: '纷享销客', words: ['纷享销客'] },
  { name: '易快报', words: ['易快报'] },
  { name: '每刻报销', words: ['每刻'] },
  { name: '汇联易', words: ['汇联易'] },
  { name: '畅捷通', words: ['畅捷通'] },
];

const AIGEN_SCENARIOS = [
  { id: 'onboard', build: aigenOnboard, match: (ctx) => (ctx.find(['入职']) >= 0 && ctx.find(['离职']) < 0 ? 2 + (ctx.find(['开通', '账号', '建档', '档案']) >= 0 ? 1 : 0) : 0) },
  { id: 'reimburse', build: aigenReimburse, match: (ctx) => (ctx.find(['报销', '票据', '发票']) >= 0 ? 3 : 0) },
  { id: 'lead', build: aigenLead, match: (ctx) => { const lead = ctx.find(['线索', 'crm']) >= 0; const src = ctx.find(['企业微信', '企微', '添加客户', '加客户', '外部联系人', '官网']) >= 0; return lead && src ? 3 : lead ? 2 : 0; } },
  { id: 'helpdesk', build: aigenHelpdesk, match: (ctx) => (ctx.find(['智能体', 'agent']) >= 0 ? 3 : ctx.find(['服务台', 'it助手']) >= 0 && ctx.find(['提问', '问答', '回答', '知识库']) >= 0 ? 3 : 0) },
  { id: 'report', build: aigenReport, match: (ctx) => { const rep = ctx.find(['日报', '周报', '报表', '汇总']) >= 0; const when = ctx.find(['每天', '每日', '工作日', '每周', '早上', '定时']) >= 0; return rep && when ? 3 : ctx.find(['日报', '周报']) >= 0 ? 2 : 0; } },
];
