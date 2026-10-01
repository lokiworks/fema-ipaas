function SysLogo({ system, size = 28, className }) {
  const sys = SYSTEMS[system] || { name: system, mark: String(system || '?').slice(0, 1), color: 'var(--n-500)' };
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.26) };
  if (sys.logo) {
    return html`<span className=${cx('sys-logo', className)} style=${style} title=${sys.name}>
      <img src=${sys.logo} alt="" style=${{ width: Math.round(size * 0.64), height: Math.round(size * 0.64) }} />
    </span>`;
  }
  if (sys.icon) {
    return html`<span className=${cx('sys-logo is-icon', className)} style=${style} title=${sys.name}><${Icon} name=${sys.icon} size=${Math.round(size * 0.55)} /></span>`;
  }
  return html`<span className=${cx('sys-logo is-mark', className)} style=${{ ...style, background: sys.color, fontSize: Math.round(size * 0.46) }} title=${sys.name}>${sys.mark}</span>`;
}

function SysPair({ source, target, size = 28 }) {
  return html`<span className="sys-pair">
    <${SysLogo} system=${source} size=${size} />
    <${Icon} name="ArrowRight" size=${14} className="sys-pair-arrow" />
    <${SysLogo} system=${target} size=${size} />
  </span>`;
}

function EffectTag({ effect, size = 'sm' }) {
  const meta = EFFECTS[effect] || EFFECTS.unknown;
  return html`<${Tooltip} content=${meta.desc}><${Tag} tone=${meta.tone} icon=${meta.icon} size=${size}>${meta.label}<//><//>`;
}

function RunStatusTag({ status, size = 'sm' }) {
  const meta = RUN_STATUS[status] || RUN_STATUS.success;
  return html`<${Tag} tone=${meta.tone} icon=${meta.icon} size=${size}>${meta.label}<//>`;
}

function SeverityTag({ severity, size = 'sm' }) {
  const meta = SEVERITY[severity];
  return html`<${Tag} tone=${meta.tone} size=${size} dot>${meta.label}<//>`;
}

function SourceTag({ source }) {
  const tone = { replay: 'info', remediation: 'primary', catchup: 'primary', manual: 'info', dryrun: 'outline' }[source] || 'default';
  return html`<${Tag} tone=${tone} size="sm">${RUN_SOURCE[source]}<//>`;
}

function KeyLink({ k, name, sub }) {
  if (!k) return html`<span className="muted">${name || '—'}</span>`;
  return html`<${Link} to=${`/records/${k}`} className="key-link" onClick=${(e) => e.stopPropagation()}>
    <span className="key-link-name">${name}</span><span className="key-link-key">${k}</span>${sub && html`<span className="key-link-sub">${sub}</span>`}
  <//>`;
}

function PeopleSummary({ s, keys, max = 3 }) {
  const names = keys.map((k) => {
    const p = getPerson(s, k);
    if (p) return p.name;
    const a = getTargetAccount(s, k);
    return a ? a.name : k;
  });
  if (!names.length) return null;
  const shown = names.slice(0, max).join('、');
  return html`<span>${shown}${names.length > max ? ` 等 ${names.length} 人` : ''}</span>`;
}

function ColumnChart({ data, height = 112, format = (v) => fmt.number(v), ariaLabel, labelEvery = 1 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const marked = data.reduce((best, d, i) => (d.mark && (best === -1 || d.value > data[best].value) ? i : best), -1);
  return html`<div className="colchart" role="img" aria-label=${ariaLabel}>
    <div className="colchart-plot" style=${{ height }}>
      ${data.map((d, i) => html`<div
        key=${i}
        className=${cx('colchart-band', hover === i && 'is-hover')}
        onMouseEnter=${() => setHover(i)}
        onMouseLeave=${() => setHover(null)}
      >
        ${(i === marked) && d.value > 0 && html`<span className="colchart-value" style=${{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}>${format(d.value)}</span>`}
        <div className=${cx('colchart-bar', `tone-${d.tone || 'muted'}`, d.value === 0 && 'is-zero')} style=${{ height: d.value === 0 ? 0 : `max(3px, ${(d.value / max) * 100}%)` }} />
        ${hover === i && html`<div className="colchart-tip"><b>${d.label}</b><span>${d.tip || format(d.value)}</span></div>`}
      </div>`)}
    </div>
    <div className="colchart-axis">
      ${data.map((d, i) => html`<span key=${i}>${i % labelEvery === 0 || i === data.length - 1 ? d.short || d.label : ''}</span>`)}
    </div>
  </div>`;
}

function Timeline({ events, onRun, compact }) {
  if (!events.length) return html`<${Empty} size="sm" title="还没有记录" />`;
  return html`<ol className=${cx('timeline', compact && 'is-compact')}>
    ${events.map((e, i) => html`<li key=${i} className=${cx('tl-item', `tone-${e.tone || 'default'}`)}>
      <span className="tl-icon"><${Icon} name=${e.icon || 'Dot'} size=${13} /></span>
      <div className="tl-body">
        <div className="tl-head">
          <span className="tl-title">${e.title}</span>
          <span className="tl-time" title=${fmt.dateTime(e.at)}>${fmt.short(e.at)}</span>
        </div>
        ${e.detail && html`<div className="tl-detail">${e.detail}</div>`}
        ${(e.run || e.issue) && html`<div className="tl-links">
          ${e.run && onRun && html`<button type="button" className="link" onClick=${() => onRun(e.run.id)}>查看运行 ${e.run.id}</button>`}
          ${e.issue && html`<${Link} className="link" to=${`/issues/${e.issue.id}`}>打开问题 ${e.issue.id}<//>`}
        </div>`}
      </div>
    </li>`)}
  </ol>`;
}

function StepStateIcon({ token }) {
  const p = parseStep(token);
  const map = {
    ok: ['CircleCheck', 'success', '成功'],
    fail: ['CircleX', 'danger', '失败'],
    unknown: ['CircleHelp', 'warning', '结果未知'],
    skip: ['CircleMinus', 'muted', '条件不满足，没有执行'],
    reuse: ['CornerDownRight', 'info', '沿用原运行的结果'],
    none: ['Circle', 'muted', '没有走到这一步'],
  };
  const [icon, tone, label] = map[p.state] || map.none;
  return html`<${Tooltip} content=${label}><span className=${cx('step-state', `tone-${tone}`)}><${Icon} name=${icon} size=${16} /></span><//>`;
}

function stepIO(s, run, step) {
  const person = run.key ? getPerson(s, run.key) : null;
  const project = getProject(s, run.projectId);
  const table = mappingTableOf(s, run.projectId);
  const token = parseStep(run.steps[step.id]);
  const target = systemName(project.target);
  const dept = person ? person.beisen.dept : '';
  if (token.state === 'none' && step.role !== 'trigger') return null;
  switch (step.role) {
    case 'trigger':
      return { output: { 工号: run.key, 姓名: run.name, 变动类型: run.change, 发现时间: fmt.dateTime(run.at) } };
    case 'schedule':
      return { output: { 计划时间: fmt.dateTime(run.at) } };
    case 'readSource':
      return { input: { 工号: run.key }, output: { 工号: run.key, 姓名: person.name, 手机号: person.mobile, 部门: dept, 在职状态: person.beisen.status, 入职日期: fmt.date(person.beisen.hireDate) } };
    case 'branch':
      return { output: { 走向: person.beisen.status === '离职' ? '离职' : '在职（含待入职）' } };
    case 'mapDept':
      if (token.state === 'fail') return { input: { [table.fromLabel]: dept }, error: `映射表「${table.name}」里没有「${dept}」，缺失处理设为「报错」，所以停在这一步。` };
      return { input: { [table.fromLabel]: dept }, output: { [table.toLabel]: mapValue(table, dept) || person.target.dept } };
    case 'ensure':
      if (token.state === 'fail') return { input: { 工号: run.key, 姓名: person.name, 部门: mapValue(table, dept) }, error: `${target}返回 HTTP 400：应用的通讯录权限范围不包含部门「${(mapValue(table, dept) || '').split('/')[0]}」。` };
      return { input: { 工号: run.key, 姓名: person.name, 手机号: person.mobile, 部门: mapValue(table, dept) || person.target.dept }, output: { 结果: token.result, user_id: person.target.userId || '—' } };
    case 'notifyNew':
      if (token.state === 'unknown') return { input: { 群: step.detail.replace(/群「|」/g, ''), 内容: `欢迎 ${person.name} 加入，账号已开通` }, error: `请求已经发出，30 秒内没有收到${target}的响应。这一步不幂等，平台没有自动重试。` };
      if (token.state === 'skip') return { note: `${step.when}才执行，这次不满足条件，没有发送。` };
      return { input: { 群: step.detail.replace(/群「|」/g, ''), 内容: `欢迎 ${person.name} 加入${(person.target.dept || '').replace('/', ' ')}，${target}账号已开通` }, output: { 结果: token.result === '人工确认' ? `已发出（${run.confirmedBy || ''}人工确认）` : '已发送' } };
    case 'disable':
      return { input: { 工号: run.key }, output: { 结果: token.result === '无变化' ? '本来就是停用状态' : token.result } };
    case 'notifyLeft':
      if (token.state === 'skip') return { note: `${step.when}才执行，这次不满足条件，没有发送。` };
      return { input: { 群: step.detail.replace(/群「|」/g, ''), 内容: `${person.name} 已离职，请回收设备` }, output: { 结果: '已发送' } };
    case 'remindQuery':
      return { output: { 明天入职: run.name.replace(/\D/g, '') + ' 人' } };
    case 'remindSend':
      return { output: { 结果: '已发送' } };
    default:
      return null;
  }
}

function RunDrawer({ runId, onClose }) {
  const s = useStore();
  const run = runId ? getRun(s, runId) : null;
  const [open, setOpen] = useState({});
  if (!run) return html`<${Drawer} open=${false} onClose=${onClose} />`;
  const wf = getWorkflow(s, run.workflowId);
  const steps = workflowSteps(wf);
  const p4 = parseStep(run.steps.s4);
  return html`<${Drawer}
    open=${Boolean(runId)}
    onClose=${onClose}
    width=${640}
    title=${html`<span className="row">运行 <span className="mono">${run.id}</span><${RunStatusTag} status=${run.status} /></span>`}
    subtitle=${`${wf.name} · v${run.version} · ${fmt.dateTime(run.at)}`}
  >
    <div className="run-head">
      <div className="run-head-item"><span className="muted">人</span><${KeyLink} k=${run.key} name=${run.name} /></div>
      <div className="run-head-item"><span className="muted">来源</span><${SourceTag} source=${run.source} /></div>
      <div className="run-head-item"><span className="muted">变动</span><span>${run.change}</span></div>
      <div className="run-head-item"><span className="muted">耗时</span><span>${fmt.duration(run.durationMs)}</span></div>
    </div>
    <div className="run-oneline">${runOneLine(s, run)}</div>
    ${run.queueWaitMs > 10000 && html`<${Alert} tone="info" icon="Gauge" title=${`在连接上排队 ${fmt.duration(run.queueWaitMs)}`}>
      当时飞书请求超过连接上限（每秒 50 次），这次运行排队等待后执行，没有因为限流失败。
    <//>`}
    ${p4.retried && html`<${Alert} tone="info" icon="ShieldCheck" title="超时后自动重试 1 次">
      第一次调用「确保账号」超时。这个操作声明了幂等，平台自动重试，结果相同，不会多开账号。
    <//>`}
    ${run.replayOf && html`<div className="run-rel"><${Icon} name="CornerDownRight" size=${14} />这是对运行 <span className="mono">${run.replayOf}</span> 的${RUN_SOURCE[run.source]}</div>`}
    ${run.replayedBy && html`<div className="run-rel"><${Icon} name="RotateCcw" size=${14} />已被运行 <span className="mono">${run.replayedBy}</span> 重放</div>`}
    ${run.dedupeOf && html`<div className="run-rel"><${Icon} name="CircleSlash" size=${14} />和运行 <span className="mono">${run.dedupeOf}</span> 是同一次变动（工号 + 变动时间相同），没有重复处理</div>`}
    ${run.status !== 'deduped' && html`<div className="run-steps">
      ${steps.map((st) => {
        const token = run.steps[st.id] || (st.role === 'trigger' || st.role === 'schedule' || st.role === 'branch' ? 'ok' : null);
        const io = token ? stepIO(s, { ...run, steps: { ...run.steps, [st.id]: token } }, st) : null;
        const expanded = open[st.id] ?? (token && token.startsWith('fail')) ?? false;
        const unknown = token === 'unknown';
        return html`<div key=${st.id} className=${cx('run-step', !token && 'is-idle', st.lane && `lane-${st.lane}`)}>
          <button type="button" className="run-step-head" onClick=${() => io && setOpen({ ...open, [st.id]: !(expanded || unknown) })}>
            <${StepStateIcon} token=${token} />
            <${SysLogo} system=${st.system} size=${22} />
            <span className="run-step-title">${st.title}</span>
            ${st.lane && html`<span className="run-step-lane">${st.lane === 'active' ? '在职分支' : '离职分支'}</span>`}
            <span className="spacer" />
            ${st.effect !== 'read' && html`<${EffectTag} effect=${st.effect} />`}
            ${io && html`<${Icon} name=${expanded || unknown ? 'ChevronDown' : 'ChevronRight'} size=${14} className="muted" />`}
          </button>
          ${io && (expanded || unknown) && html`<div className="run-step-body">
            ${io.note && html`<div className="muted">${io.note}</div>`}
            ${io.input && html`<div className="io-block"><div className="io-label">入参</div><${JsonView} value=${io.input} defaultExpandDepth=${1} /></div>`}
            ${io.output && html`<div className="io-block"><div className="io-label">出参</div><${JsonView} value=${io.output} defaultExpandDepth=${1} /></div>`}
            ${io.error && html`<div className="io-error"><${Icon} name="CircleAlert" size=${14} />${io.error}</div>`}
          </div>`}
        </div>`;
      })}
    </div>`}
  <//>`;
}

function ReplayDialog({ issueId, open, onClose }) {
  const s = useStore();
  const issue = issueId ? getIssue(s, issueId) : null;
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setMode(null); setBusy(false); } }, [open]);
  if (!issue || issue.kind !== 'failure') return null;
  const plan = replayPlan(s, issue, mode);
  const wf = getWorkflow(s, issue.workflowId);
  const step = workflowStep(wf, issue.stepId);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const res = actReplay(issue.id, plan.mode);
      setBusy(false);
      onClose();
      if (res.failed) toast.warning(`重放 ${res.ok + res.failed} 次：${res.ok} 次成功，${res.failed} 次仍然失败`);
      else toast.success(`重放 ${res.ok} 次，全部成功${res.skipped ? `；${res.skipped} 人先没有重放` : ''}`);
    }, 1100);
  };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    width=${640}
    title=${`重放 ${plan.items.length} 次运行`}
    description=${`${wf.name} · 失败在「${step.title}」`}
    footer=${html`<${Fragment}>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" icon="RotateCcw" loading=${busy} disabled=${!plan.runnable.length} onClick=${run}>
        ${plan.runnable.length ? `重放 ${plan.runnable.length} 次` : '暂时没有可以重放的'}
      <//>
    <//>`}
  >
    <div className="col" style=${{ gap: 16 }}>
      <${Field} label="重跑方式">
        <${RadioCards}
          value=${plan.mode}
          onChange=${setMode}
          options=${[
            { value: 'full', label: '整体重跑', desc: plan.safe ? '推荐。重新读取北森最新状态再执行，前面的步骤都是只读或幂等，没有副作用。' : '前面有不幂等的步骤，整体重跑会重复执行它们。' },
            { value: 'fromFailed', label: '从失败步骤重跑', desc: '沿用原运行读到的数据，只执行失败的步骤和它后面的步骤。' },
          ]}
        />
      <//>
      <div>
        <div className="section-label">逐人检查</div>
        <div className="plan-list">
          ${plan.items.map((item) => html`<div key=${item.key} className=${cx('plan-item', item.block && 'is-blocked')}>
            <${Icon} name=${item.block ? 'CircleSlash' : 'CircleCheck'} size=${16} className=${item.block ? 'tone-warning-text' : 'tone-success-text'} />
            <${KeyLink} k=${item.key} name=${item.person.name} />
            <span className="plan-item-text">${item.block ? item.block.text : `将在「${item.to}」开通账号，并通知 HR 入职群`}</span>
            ${item.block && item.block.issueId && html`<${Link} to=${`/issues/${item.block.issueId}`} className="link nowrap" onClick=${onClose}>先处理 ${item.block.issueId}<//>`}
          </div>`)}
        </div>
      </div>
      <div>
        <div className="section-label">重放前检查</div>
        <ul className="check-list">
          ${plan.checks.map((c, i) => html`<li key=${i} className=${`is-${c.level}`}>
            <${Icon} name=${c.level === 'ok' ? 'Check' : c.level === 'warn' ? 'TriangleAlert' : 'Ban'} size=${14} />
            <span>${c.text}</span>
          </li>`)}
        </ul>
      </div>
    </div>
  <//>`;
}

function RemediateDialog({ projectId, keys, open, onClose, title }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setBusy(false); }, [open]);
  if (!open || !keys || !keys.length) return null;
  const view = reconView(s, projectId);
  const diffs = view.diffs.filter((d) => keys.includes(d.key || d.accountId));
  const plan = remediationPlan(s, projectId, diffs);
  const runnable = plan.filter((p) => p.action && p.action !== 'blocked' && p.action !== 'none');
  const wf = getWorkflow(s, getRecon(s, projectId).remediation);
  const go = () => {
    setBusy(true);
    setTimeout(() => {
      const res = actRemediate(projectId, runnable.map((p) => p.diff.key));
      setBusy(false);
      onClose();
      if (res.failed) toast.warning(`补齐 ${res.ok + res.failed} 人：${res.ok} 人成功，${res.failed} 人失败，已进入问题中心`);
      else toast.success(`已补齐 ${res.ok} 人，下次对账会再核对一次`);
    }, 1000);
  };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    width=${620}
    title=${title || `补齐 ${diffs.length} 处差异`}
    description=${`用工作流「${wf.name}」对这些工号再跑一次，让${systemName(getProject(s, projectId).target)}和北森当前的状态一致`}
    footer=${html`<${Fragment}>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" icon="Wrench" loading=${busy} disabled=${!runnable.length} onClick=${go}>${runnable.length ? `补齐 ${runnable.length} 人` : '没有可以自动补齐的'}<//>
    <//>`}
  >
    <div className="col" style=${{ gap: 14 }}>
      <div className="plan-list">
        ${plan.map((p) => html`<div key=${p.diff.id} className=${cx('plan-item', (!p.action || p.action === 'blocked') && 'is-blocked')}>
          <${Icon} name=${p.action === 'disable' ? 'UserX' : p.action === 'create' ? 'UserPlus' : p.action === 'update' ? 'Shuffle' : 'CircleSlash'} size=${16} className=${p.action && p.action !== 'blocked' ? 'tone-primary-text' : 'tone-warning-text'} />
          <${KeyLink} k=${p.diff.key} name=${p.diff.name} />
          <span className="plan-item-text">${p.text}</span>
        </div>`)}
      </div>
      <${Alert} tone="info" icon="ShieldCheck">
        对账本身只读，不写任何数据。补齐走的是平时同一条工作流，同样经过映射、幂等声明和审计；通知只在账号状态真正变化时发送。
      <//>
    </div>
  <//>`;
}

function ExceptionDialog({ projectId, diff, open, onClose }) {
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('7');
  useEffect(() => { if (open) { setReason(''); setExpiry(diff && diff.category === 'extra' ? 'never' : '7'); } }, [open]);
  if (!open || !diff) return null;
  const save = () => {
    const expiresAt = expiry === 'never' ? null : Date.now() + Number(expiry) * DAY;
    actAddException(projectId, { kind: 'record', key: diff.key || null, accountId: diff.accountId || null, name: diff.name, reason: reason.trim(), expiresAt });
    onClose();
    toast.success(`已把「${diff.name}」列为对账例外`);
  };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    width=${480}
    title=${`把「${diff.name}」列为例外`}
    description="列为例外后，对账不再把它算作差异；到期后自动失效，重新参与对账。"
    footer=${html`<${Fragment}>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" disabled=${!reason.trim()} onClick=${save}>列为例外<//>
    <//>`}
  >
    <div className="col" style=${{ gap: 14 }}>
      <${Field} label="原因" required hint="会写进审计记录，也会显示在这个人的记录里">
        <${Textarea} value=${reason} onChange=${setReason} rows=${2} placeholder=${diff.category === 'leftActive' ? '例如：交接还没完成，IT 需要保留账号导出邮件' : '例如：前台共用设备账号，不对应具体员工'} />
      <//>
      <${Field} label="有效期">
        <${Segmented}
          value=${expiry}
          onChange=${setExpiry}
          options=${[{ value: '7', label: '7 天' }, { value: '30', label: '30 天' }, { value: 'never', label: '长期' }]}
        />
      <//>
      ${diff.category === 'leftActive' && expiry === 'never' && html`<${Alert} tone="warning">离职员工的账号长期例外，意味着它会一直能登录。建议设一个到期时间。<//>`}
    </div>
  <//>`;
}

function EnableDialog({ wfId, open, onClose }) {
  const s = useStore();
  const wf = wfId ? getWorkflow(s, wfId) : null;
  const [start, setStart] = useState('gap');
  const [busy, setBusy] = useState(false);
  const [fromAt, setFromAt] = useState(0);
  useEffect(() => {
    if (open && wf) { setStart('gap'); setBusy(false); setFromAt(wf.disabledAt ? wf.disabledAt + Math.round((Date.now() - wf.disabledAt) / 2) : Date.now()); }
  }, [open]);
  if (!wf || !open) return null;
  const pending = pendingChanges(s, wf);
  const offFor = wf.disabledAt ? Date.now() - wf.disabledAt : 0;
  const customCount = pending.filter((p) => p.change.at >= fromAt).length;
  const go = () => {
    setBusy(true);
    setTimeout(() => {
      const res = actEnableWorkflow(wf.id, start, fromAt);
      setBusy(false);
      onClose();
      toast.success(start === 'now' ? `已启用，跳过了 ${res.skipped} 条变动` : `已启用，补处理了 ${res.processed} 条变动${res.failed ? `，${res.failed} 条失败` : ''}`);
    }, 1000);
  };
  const hours = Math.max(1, Math.round(offFor / HOUR));
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    width=${600}
    title=${`启用「${wf.name}」`}
    description=${wf.disabledAt ? `停用了 ${hours >= 48 ? `${Math.round(hours / 24)} 天` : `${hours} 小时`}（${fmt.short(wf.disabledAt)} 起，${wf.disabledBy}：${wf.disabledNote || '停用'}）` : '首次启用'}
    footer=${html`<${Fragment}>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" icon="Play" loading=${busy} onClick=${go}>启用<//>
    <//>`}
  >
    <div className="col" style=${{ gap: 14 }}>
      <div className="enable-gap">
        <${Icon} name="History" size=${18} />
        <div>
          <b>停用期间，北森有 ${pending.length} 条员工变动</b>
          <div className="muted">${pending.length ? pending.slice(0, 4).map((p) => `${p.person.name}（${p.change.type}）`).join('、') + (pending.length > 4 ? ' 等' : '') : '没有需要补处理的变动'}</div>
        </div>
      </div>
      <${Field} label="从哪里开始处理">
        <${RadioCards}
          columns=${1}
          value=${start}
          onChange=${setStart}
          options=${[
            { value: 'gap', label: '从停用时刻开始（推荐）', desc: `先补处理这 ${pending.length} 条变动，再继续正常轮询。同步是幂等的，补处理不会重复开通。` },
            { value: 'now', label: '从现在开始', desc: `这 ${pending.length} 条变动不会处理，下次对账会把相关的人列为差异。` },
            { value: 'custom', label: '从指定时间开始', desc: '只补处理指定时间之后的变动。' },
          ]}
        />
      <//>
      ${start === 'custom' && html`<${Field} label="开始时间" hint=${`这个时间之后有 ${customCount} 条变动会被补处理`}>
        <input
          type="range"
          className="range"
          min=${wf.disabledAt}
          max=${Date.now()}
          step=${HOUR}
          value=${fromAt}
          onChange=${(e) => setFromAt(Number(e.target.value))}
        />
        <div className="muted text-xs">${fmt.dateTime(fromAt)}</div>
      <//>`}
    </div>
  <//>`;
}

function ScopeFixCard({ connId, compact }) {
  const s = useStore();
  const conn = getConnection(s, connId);
  const [checking, setChecking] = useState(false);
  if (!conn || !conn.scope) return null;
  if (!conn.scope.missing.length) {
    return html`<${Alert} tone="success" title=${`${conn.scope.label}已包含所需部门`}>上次检查：刚刚。可以重放受影响的运行了。<//>`;
  }
  const path = '飞书管理后台 › 工作台 › 应用管理 › 星河人事助手 › 权限管理 › 通讯录权限范围';
  const recheck = () => {
    setChecking(true);
    setTimeout(() => {
      const added = actRecheckScope(connId);
      setChecking(false);
      toast.success(`检查通过：${conn.scope.label}已包含「${added.join('、')}」`);
    }, 1200);
  };
  return html`<div className=${cx('fix-steps', compact && 'is-compact')}>
    <ol>
      <li>
        <div>打开飞书管理后台，进入应用的通讯录权限范围</div>
        <div className="fix-path"><span className="mono">${path}</span><${CopyButton} text=${path} /></div>
      </li>
      <li><div>把「${conn.scope.missing.join('、')}」加进权限范围，保存</div><div className="muted text-xs">需要飞书管理员操作，通常是 IT 管理员周文</div></li>
      <li><div>回到这里重新检查连接</div></li>
    </ol>
    <div className="row">
      <${Button} variant="primary" icon="RefreshCw" loading=${checking} onClick=${recheck}>重新检查连接<//>
      <span className="muted text-xs">原型里检查总会通过</span>
    </div>
  </div>`;
}

function MappingFixInline({ tableId, value, onDone }) {
  const s = useStore();
  const table = s.mappingTables.find((t) => t.id === tableId);
  const existing = mapValue(table, value);
  const suggestion = table.targetValues.find((t) => t.startsWith(value.split('-')[0]) && t.endsWith(value.split('-')[1].replace(/组$/, ''))) || null;
  const [to, setTo] = useState(suggestion);
  if (existing) {
    return html`<${Alert} tone="success" title="映射已补上">「${value}」→「${existing}」。可以重放受影响的运行了。<//>`;
  }
  return html`<div className="mapfix">
    <div className="mapfix-row">
      <div className="mapfix-from"><span className="muted text-xs">${table.fromLabel}</span><b>${value}</b></div>
      <${Icon} name="ArrowRight" size=${16} className="muted" />
      <div className="mapfix-to">
        <span className="muted text-xs">${table.toLabel}</span>
        <${Select}
          value=${to}
          onChange=${setTo}
          searchable
          width=${260}
          options=${table.targetValues.map((v) => ({ value: v, label: v }))}
        />
      </div>
      <${Button} variant="primary" disabled=${!to} onClick=${() => { actAddMapping(tableId, value, to); toast.success('已补上映射'); onDone && onDone(); }}>保存<//>
    </div>
    ${suggestion && html`<div className="mapfix-hint"><${Icon} name="Sparkles" size=${13} />按名称推荐「${suggestion}」：飞书里 1 天前由周文新建，北森部门同名</div>`}
  </div>`;
}

function SectionLabel({ children, extra }) {
  return html`<div className="section-label-row"><div className="section-label">${children}</div>${extra}</div>`;
}
