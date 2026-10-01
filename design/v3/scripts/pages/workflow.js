function WorkflowPage({ params }) {
  const s = useStore();
  const wf = getWorkflow(s, params.id);
  const [selected, setSelected] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [enable, setEnable] = useState(false);
  if (!wf) return html`<${NotFoundPage} />`;
  const project = getProject(s, wf.projectId);
  const steps = workflowSteps(wf);
  const step = selected ? steps.find((st) => st.id === selected) : null;
  const toggle = async () => {
    if (wf.status === 'off') { setEnable(true); return; }
    const ok = await confirmDialog({ title: `停用「${wf.name}」？`, content: '停用期间北森的变动不会处理。再次启用时，可以选择从停用时刻开始补处理。', okText: '停用', danger: true });
    if (ok) { actDisableWorkflow(wf.id, '手动停用'); toast.success('已停用'); }
  };
  const isSync = wf.template.startsWith('sync-');
  return html`<div className="page-inner is-wide">
    <${Breadcrumb} items=${[{ label: '集成', to: '/projects' }, { label: project.name, to: `/projects/${project.id}/workflows` }, { label: wf.name }]} />
    <div className="wf-head">
      <div className="grow">
        <div className="row">
          <h1 className="page-title">${wf.name}</h1>
          <${Tag} tone=${wf.status === 'on' ? 'success' : 'warning'} dot>${wf.status === 'on' ? '运行中' : '已停用'}<//>
          <span className="muted">v${wf.version}</span>
        </div>
        <p className="page-desc">${isSync
          ? `${systemName(project.source)}员工变动后，按${wf.trigger.keyField}重新读取最新状态，确保${systemName(project.target)}和它一致：没有就开通、有就更新、离职就停用。`
          : '每个工作日 17:00 查询明天入职的员工，提醒 IT 准备设备。'}</p>
      </div>
      <div className="row">
        ${isSync && html`<${Button} icon="FlaskConical" onClick=${() => setDryRun(true)}>试运行<//>`}
        <${Button} icon="ListTree" onClick=${() => navigate(`/projects/${project.id}/runs`)}>运行记录<//>
        <span className="wf-switch"><span className="muted text-xs">${wf.status === 'on' ? '启用中' : '已停用'}</span><${Switch} checked=${wf.status === 'on'} onChange=${toggle} /></span>
      </div>
    </div>
    ${wf.status === 'off' && html`<${Alert}
      tone="warning"
      title=${`${fmt.relative(wf.disabledAt)}由${wf.disabledBy}停用：${wf.disabledNote}`}
      action=${html`<${Button} size="sm" variant="primary" icon="Play" onClick=${() => setEnable(true)}>启用<//>`}
    >停用期间北森有 ${pendingChanges(s, wf).length} 条变动没有处理。启用时可以选择从停用时刻开始补处理。<//>`}
    <div className="wf-layout">
      <div className="wf-canvas">
        <${WfFlow} s=${s} wf=${wf} project=${project} selected=${selected} onSelect=${setSelected} />
      </div>
      <aside className="wf-side">
        ${step
          ? html`<${WfStepPanel} s=${s} wf=${wf} project=${project} step=${step} onClose=${() => setSelected(null)} />`
          : html`<${WfChecksPanel} s=${s} wf=${wf} />`}
      </aside>
    </div>
    <section className="section">
      <div className="section-head"><h2 className="section-title">启用与停用记录</h2><span className="muted text-xs">每次启用都记下从哪里开始处理、补了多少条</span></div>
      <div className="card"><div className="card-body">
        <${Timeline} compact events=${[...wf.history].reverse().map((h) => ({
          at: h.at,
          icon: { enable: 'Play', disable: 'Pause', publish: 'Upload' }[h.type],
          tone: { enable: 'success', disable: 'warning', publish: 'primary' }[h.type],
          title: `${h.by}${{ enable: '启用', disable: '停用', publish: `发布 v${h.version}` }[h.type]}`,
          detail: h.note,
        }))} />
      </div></div>
    </section>
    ${isSync && html`<${WfDryRunDrawer} open=${dryRun} onClose=${() => setDryRun(false)} wf=${wf} />`}
    <${EnableDialog} open=${enable} wfId=${wf.id} onClose=${() => setEnable(false)} />
  </div>`;
}

function WfNode({ s, wf, project, step, selected, onSelect }) {
  const conn = step.effect !== 'read' ? stepConnection(s, project, step) : null;
  const sub = step.role === 'trigger' ? wf.trigger.mode : step.role === 'mapDept' || step.role === 'branch' ? step.detail : step.action ? `${systemName(step.system)} · ${step.action}` : systemName(step.system);
  return html`<button type="button" className=${cx('flow-node', selected && 'is-selected', `role-${step.role}`)} onClick=${() => onSelect(selected ? null : step.id)}>
    <${SysLogo} system=${step.system} size=${30} />
    <div className="flow-node-body">
      <div className="flow-node-title">${step.title}</div>
      <div className="flow-node-sub">${sub}</div>
      ${step.role === 'trigger' && wf.trigger.keyField && html`<div className="flow-node-chips">
        <${Tag} size="sm" tone="primary" icon="Fingerprint">业务键 ${wf.trigger.keyField}<//>
        <${Tag} size="sm" icon="CircleSlash">去重 ${wf.trigger.dedupe}<//>
      </div>`}
      ${(step.when || conn) && html`<div className="flow-node-chips">
        ${step.when && html`<${Tag} size="sm" tone="outline" icon="Filter">${step.when}<//>`}
        ${conn && html`<${Tag} size="sm" tone="outline" icon="Gauge">每秒 ${conn.rate.limit} 次<//>`}
      </div>`}
    </div>
    <div className="flow-node-effect">${step.role !== 'trigger' && step.role !== 'branch' && step.role !== 'schedule' && html`<${EffectTag} effect=${step.effect} />`}</div>
  </button>`;
}

function WfFlow({ s, wf, project, selected, onSelect }) {
  const steps = workflowSteps(wf);
  const main = steps.filter((st) => !st.lane);
  const lanes = [
    { key: 'active', label: '在职（含待入职）', steps: steps.filter((st) => st.lane === 'active') },
    { key: 'left', label: '离职', steps: steps.filter((st) => st.lane === 'left') },
  ].filter((l) => l.steps.length);
  const node = (st) => html`<${WfNode} key=${st.id} s=${s} wf=${wf} project=${project} step=${st} selected=${selected === st.id} onSelect=${onSelect} />`;
  return html`<div className="flow">
    ${main.map((st, i) => html`<${Fragment} key=${st.id}>
      ${i > 0 && html`<div className="flow-edge" />`}
      ${node(st)}
    <//>`)}
    ${lanes.length > 0 && html`<${Fragment}>
      <div className="flow-edge" />
      <div className="flow-lanes">
        ${lanes.map((lane) => html`<div key=${lane.key} className="flow-lane">
          <div className="flow-lane-label">${lane.label}</div>
          ${lane.steps.map((st, i) => html`<${Fragment} key=${st.id}>
            ${i > 0 && html`<div className="flow-edge" />`}
            ${node(st)}
          <//>`)}
        </div>`)}
      </div>
    <//>`}
  </div>`;
}

function WfChecksPanel({ s, wf }) {
  const checks = wfChecks(s, wf);
  const icon = { warn: 'TriangleAlert', ok: 'CircleCheck', info: 'Info', error: 'CircleX' };
  const warns = checks.filter((c) => c.level === 'warn').length;
  return html`<div className="side-panel">
    <div className="side-panel-head">
      <div>
        <div className="side-panel-title">设计期检查</div>
        <div className="muted text-xs">能在发布前和运行前发现的问题，不留到运行时</div>
      </div>
      <${Tag} tone=${warns ? 'warning' : 'success'}>${warns ? `${warns} 个提醒` : '全部通过'}<//>
    </div>
    <div className="check-cards">
      ${checks.map((c, i) => html`<div key=${i} className=${cx('check-card', `is-${c.level}`)}>
        <${Icon} name=${icon[c.level]} size=${16} />
        <div className="grow">
          <div className="check-card-title">${c.title}</div>
          ${c.detail && html`<div className="check-card-detail">${c.detail}</div>`}
          ${c.to && html`<${Link} to=${c.to} className="link text-xs">${c.action}<//>`}
        </div>
      </div>`)}
    </div>
    <div className="muted text-xs" style=${{ marginTop: 12 }}>点画布上的节点查看它的配置、幂等声明和所需权限。</div>
  </div>`;
}

function WfStepPanel({ s, wf, project, step, onClose }) {
  const conn = stepConnection(s, project, step);
  const connector = getConnector(step.system);
  const action = connector && connector.actions.find((a) => a.name === step.action);
  const perms = (action && action.perms) || [];
  const runs = s.runs.filter((r) => r.workflowId === wf.id && r.at > Date.now() - 7 * DAY);
  const tokens = runs.map((r) => parseStep(r.steps[step.id])).filter((t) => t.state !== 'none');
  const table = mappingTableOf(s, project.id);
  const effect = EFFECTS[step.effect];
  return html`<div className="side-panel">
    <div className="side-panel-head">
      <div className="row grow">
        <${SysLogo} system=${step.system} size=${28} />
        <div className="grow">
          <div className="side-panel-title">${step.title}</div>
          <div className="muted text-xs">${step.action ? `${systemName(step.system)} · ${step.action}` : step.detail}</div>
        </div>
      </div>
      <${IconButton} icon="X" size="sm" title="关闭" onClick=${onClose} />
    </div>
    ${step.role !== 'trigger' && step.role !== 'branch' && step.role !== 'schedule' && html`<div className=${cx('effect-box', `tone-${effect.tone}`)}>
      <div className="row"><${EffectTag} effect=${step.effect} /><b>${step.effect === 'idempotent' ? `按${step.idemKey}幂等` : step.effect === 'read' ? '只读' : '不幂等'}</b></div>
      <div className="text-xs">${effect.desc}</div>
      ${step.effect === 'non-idempotent' && step.when && html`<div className="text-xs">这个节点设置了「${step.when}」，状态没有变化时不会执行，重放和补处理都不会重复发送。</div>`}
    </div>`}
    <div className="panel-section">
      <div className="section-label">配置</div>
      ${step.role === 'trigger' && html`<div className="kv-list">
        <div><span>方式</span><b>${wf.trigger.mode}</b></div>
        <div><span>业务键</span><b>${wf.trigger.keyField}（${wf.trigger.keyPath}）</b></div>
        <div><span>显示名</span><b>${wf.trigger.displayField}</b></div>
        <div><span>去重</span><b>${wf.trigger.dedupe}，拦下的记一条「已去重」</b></div>
        <div><span>检查点</span><b>${fmt.relative(wf.trigger.checkpointAt)}（停机或停用后从这里继续）</b></div>
      </div>`}
      ${step.role === 'schedule' && html`<div className="kv-list">
        <div><span>时间</span><b>每个工作日 17:00</b></div>
        <div><span>节假日</span><b>跳过法定节假日</b></div>
        <div><span>错过的执行</span><b>${wf.trigger.missedPolicy}</b></div>
      </div>`}
      ${step.role === 'readSource' && html`<div className="kv-list">
        <div><span>按</span><b>触发器.工号</b></div>
        <div><span>为什么</span><b>不用变动事件里的内容，免得事件过时或乱序时按旧数据执行</b></div>
      </div>`}
      ${step.role === 'branch' && html`<div className="kv-list">
        <div><span>在职</span><b>在职状态 ∈ 在职、待入职</b></div>
        <div><span>离职</span><b>在职状态 = 离职</b></div>
      </div>`}
      ${step.role === 'mapDept' && html`<div className="kv-list">
        <div><span>映射表</span><b><${Link} className="link" to=${`/projects/${project.id}/mappings`}>${table.name}<//></b></div>
        <div><span>查找值</span><b>读取员工.部门</b></div>
        <div><span>查不到时</span><b>报错（不会开通到错误的部门）</b></div>
      </div>`}
      ${step.role === 'ensure' && html`<div className="map-fields">
        ${[['工号', '读取员工.工号', true], ['姓名', '读取员工.姓名', true], ['手机号', '读取员工.手机号', true], ['部门', `部门映射.${table.toLabel}`, true], ['邮箱', '读取员工.邮箱', false]].map(([to, from, req]) => html`<div key=${to} className="map-field">
          <span className="map-field-to">${to}${req && html`<span className="field-required">*</span>`}</span>
          <${Icon} name="ArrowLeft" size=${12} className="muted" />
          <span className="map-field-from">${from}</span>
        </div>`)}
      </div>`}
      ${(step.role === 'notifyNew' || step.role === 'notifyLeft' || step.role === 'remindSend') && html`<div className="kv-list">
        <div><span>发到</span><b>${step.detail}</b></div>
        ${step.when && html`<div><span>条件</span><b>${step.when}</b></div>`}
        <div><span>内容</span><b>${step.role === 'notifyLeft' ? '{姓名} 已离职，请回收设备' : step.role === 'remindSend' ? '明天入职 {人数} 人：{名单}' : '欢迎 {姓名} 加入 {部门}，账号已开通'}</b></div>
      </div>`}
      ${step.role === 'disable' && html`<div className="kv-list">
        <div><span>按</span><b>读取员工.工号</b></div>
        <div><span>已经停用时</span><b>直接返回「无变化」，不报错</b></div>
      </div>`}
      ${step.role === 'remindQuery' && html`<div className="kv-list"><div><span>入职日期</span><b>明天</b></div></div>`}
    </div>
    ${conn && html`<div className="panel-section">
      <div className="section-label">连接</div>
      <${Link} to=${`/connections/${conn.id}`} className="conn-row">
        <${SysLogo} system=${conn.system} size=${26} />
        <div className="grow"><div className="conn-row-name">${conn.name}</div><div className="conn-row-sub"><span>每秒 ${conn.rate.limit} 次，超出的排队</span></div></div>
        <${Icon} name="ChevronRight" size=${14} className="muted" />
      <//>
    </div>`}
    ${perms.length > 0 && html`<div className="panel-section">
      <div className="section-label">需要的权限</div>
      ${perms.map((name) => {
        const p = conn && conn.permissions.find((x) => x.name === name);
        return html`<div key=${name} className="perm-line">
          <${Icon} name=${p && p.state === 'verified' ? 'CircleCheck' : 'CircleHelp'} size=${14} className=${p && p.state === 'verified' ? 'tone-success-text' : 'muted'} />
          <span className="grow">${name}</span>
          <span className="muted text-xs">${p && p.state === 'verified' ? `${fmt.relative(p.at)}调用成功` : '还没用到'}</span>
        </div>`;
      })}
      ${step.role === 'ensure' && conn.scope && html`<div className="perm-line">
        <${Icon} name=${conn.scope.missing.length ? 'TriangleAlert' : 'CircleCheck'} size=${14} className=${conn.scope.missing.length ? 'tone-warning-text' : 'tone-success-text'} />
        <span className="grow">${conn.scope.label}</span>
        <span className=${cx('text-xs', conn.scope.missing.length ? 'tone-warning-text' : 'muted')}>${conn.scope.missing.length ? `不含「${conn.scope.missing.join('、')}」` : conn.scope.mode}</span>
      </div>`}
      <div className="muted text-xs" style=${{ marginTop: 6 }}>飞书只在调用时才告诉你缺哪项权限，所以保存连接时不做全量探测；缺权限时，出错的步骤会写明权限名。</div>
    </div>`}
    ${tokens.length > 0 && html`<div className="panel-section">
      <div className="section-label">过去 7 天</div>
      <div className="mini-stats">
        <div><b>${tokens.filter((t) => t.state === 'ok').length}</b><span>成功</span></div>
        <div><b>${tokens.filter((t) => t.state === 'fail').length}</b><span>失败</span></div>
        <div><b>${tokens.filter((t) => t.state === 'skip').length}</b><span>条件不满足</span></div>
        <div><b>${tokens.filter((t) => t.retried).length}</b><span>安全重试</span></div>
      </div>
    </div>`}
  </div>`;
}

function WfDryRunDrawer({ open, onClose, wf }) {
  const s = useStore();
  const candidates = useMemo(() => {
    const seen = new Set();
    return s.people
      .filter((p) => p.projectId === wf.projectId && p.changes.length)
      .map((p) => ({ person: p, change: p.changes[p.changes.length - 1] }))
      .sort((a, b) => b.change.at - a.change.at)
      .filter(({ person }) => (seen.has(person.key) ? false : seen.add(person.key)))
      .slice(0, 10);
  }, [open]);
  const [picked, setPicked] = useState([]);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPicked(candidates.slice(0, 6).map((c) => c.person.key)); setResults(null); } }, [open]);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      setResults(picked.map((key) => ({ key, outcome: simulateSync(s, { projectId: wf.projectId, workflowId: wf.id, key, source: 'dryrun' }) })));
      setBusy(false);
    }, 900);
  };
  const project = getProject(s, wf.projectId);
  const target = systemName(project.target);
  const describe = ({ outcome }) => {
    const st = outcome.run.steps;
    if (outcome.failure) {
      return { tone: 'danger', icon: 'CircleX', text: outcome.failure.cause === 'mapping' ? `会失败：映射表里没有「${outcome.failure.value}」` : `会失败：部门「${outcome.failure.value}」不在${target}应用的通讯录权限范围内` };
    }
    const s4 = parseStep(st.s4);
    const s6 = parseStep(st.s6);
    if (s6.state === 'ok') return s6.result === '已停用' ? { tone: 'warning', icon: 'UserX', text: `会停用${target}账号，并通知 IT 资产群` } : { tone: 'default', icon: 'Equal', text: '账号已经是停用状态，不会有任何写入' };
    if (s4.result === '已开通') return { tone: 'primary', icon: 'UserPlus', text: `会在「${outcome.patch.dept}」开通账号，并通知 HR 入职群` };
    if (s4.result === '已更新') return { tone: 'primary', icon: 'Shuffle', text: `会把部门更新为「${outcome.patch.dept}」，不发通知` };
    return { tone: 'default', icon: 'Equal', text: '已经一致，不会有任何写入' };
  };
  return html`<${Drawer}
    open=${open}
    onClose=${onClose}
    width=${640}
    title="试运行"
    subtitle="用北森最近的真实变动演练：读操作真实执行，写操作只生成请求、不发送"
    footer=${html`<${Fragment}>
      <span className="muted text-xs grow">已选 ${picked.length} 人</span>
      <${Button} onClick=${onClose}>关闭<//>
      <${Button} variant="primary" icon="FlaskConical" loading=${busy} disabled=${!picked.length} onClick=${run}>演练 ${picked.length} 人<//>
    <//>`}
  >
    <div className="col" style=${{ gap: 16 }}>
      <${Alert} tone="info" icon="FlaskConical">不用造测试数据，也不用切测试环境。演练不会写入${target}、不会发消息，结果只显示在这里，不进运行记录。<//>
      <div>
        <div className="section-label">选择北森最近的变动</div>
        <div className="plan-list">
          ${candidates.map(({ person, change }) => html`<label key=${person.key} className="plan-item is-pickable">
            <${Checkbox} checked=${picked.includes(person.key)} onChange=${(v) => setPicked(v ? [...picked, person.key] : picked.filter((k) => k !== person.key))} />
            <span className="key-link"><span className="key-link-name">${person.name}</span><span className="key-link-key">${person.key}</span></span>
            <span className="plan-item-text">${change.type} · ${person.beisen.dept}</span>
            <span className="muted text-xs nowrap">${fmt.relative(change.at)}</span>
          </label>`)}
        </div>
      </div>
      ${results && html`<div>
        <div className="section-label-row"><div className="section-label">演练结果</div><${Tag} size="sm" tone="outline" icon="ShieldCheck">没有写入${target}<//></div>
        <div className="plan-list">
          ${results.map((r) => {
            const d = describe(r);
            const person = getPerson(s, r.key);
            return html`<div key=${r.key} className="plan-item">
              <${Icon} name=${d.icon} size=${16} className=${`tone-${d.tone}-text`} />
              <span className="key-link"><span className="key-link-name">${person.name}</span><span className="key-link-key">${person.key}</span></span>
              <span className="plan-item-text">${d.text}</span>
            </div>`;
          })}
        </div>
        ${results.some((r) => r.outcome.failure) && html`<div className="muted text-xs" style=${{ marginTop: 8 }}>演练发现的失败和正式运行一样，能在问题中心找到对应的原因和修复办法。</div>`}
      </div>`}
    </div>
  <//>`;
}
