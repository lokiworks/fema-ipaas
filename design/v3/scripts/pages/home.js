function homeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function homeImpact(s, issue) {
  const project = getProject(s, issue.projectId);
  const target = systemName(project.target);
  if (issue.kind === 'recon' && issue.category === 'leftActive') return `离职员工仍能登录${target}，看得到通讯录和群消息`;
  if (issue.kind === 'recon') return '不影响安全，白天处理即可，夜间不告警';
  if (issue.kind === 'failure') {
    const today = issue.keys.filter((k) => { const p = getPerson(s, k); return p && p.beisen.hireDate && dayStart(p.beisen.hireDate, 0) === dayStart(Date.now(), 0); }).length;
    return today ? `${issue.keys.length} 人还没有${target}账号，其中 ${today} 人今天入职` : `${issue.keys.length} 人还没有${target}账号`;
  }
  if (issue.kind === 'unknown') return '入职欢迎消息可能漏发，也可能已经发出，需要人确认';
  if (issue.kind === 'credential') return '到期后北森的调用全部失败，触发器和对账都会停';
  if (issue.kind === 'paused') {
    const wf = getWorkflow(s, issue.workflowId);
    return `${pendingChanges(s, wf).length} 名门店员工的${target}账号和北森不一致`;
  }
  return '';
}

function HomeAttentionItem({ s, issue, onRemediate, onEnable }) {
  const project = getProject(s, issue.projectId);
  const kind = ISSUE_KIND[issue.kind];
  let actions;
  if (issue.kind === 'recon' && issue.category === 'leftActive') {
    actions = html`<${Button} variant="primary" size="sm" icon="UserX" onClick=${() => onRemediate(issue)}>补齐<//>`;
  } else if (issue.kind === 'recon') {
    actions = html`<${Button} size="sm" onClick=${() => navigate(`/projects/${issue.projectId}/recon`)}>去对账<//>`;
  } else if (issue.kind === 'paused') {
    actions = html`<${Button} variant="primary" size="sm" icon="Play" onClick=${() => onEnable(issue.workflowId)}>启用<//>`;
  } else if (issue.kind === 'credential') {
    actions = html`<${Button} size="sm" icon="KeyRound" onClick=${() => navigate(`/connections/${issue.connectionId}`)}>更新密钥<//>`;
  } else if (issue.kind === 'unknown') {
    actions = html`<${Button} size="sm" onClick=${() => navigate(`/issues/${issue.id}`)}>确认结果<//>`;
  } else {
    actions = html`<${Button} size="sm" onClick=${() => navigate(`/issues/${issue.id}`)}>${issue.cause === 'mapping' ? '补映射' : '查看并修复'}<//>`;
  }
  return html`<div className=${cx('attn-item', `sev-${issue.severity}`)}>
    <div className="attn-main">
      <div className="attn-head">
        <${SeverityTag} severity=${issue.severity} />
        <span className="attn-kind"><${Icon} name=${kind.icon} size=${13} />${kind.label}</span>
        <${Link} to=${`/issues/${issue.id}`} className="attn-title">${issueTitle(s, issue)}<//>
      </div>
      <div className="attn-impact">${homeImpact(s, issue)}</div>
      <div className="attn-meta">
        <span>${project.name}</span>
        ${issue.keys.length > 0 && html`<span><${PeopleSummary} s=${s} keys=${issue.keys} /></span>`}
        <span>${fmt.relative(issue.lastSeenAt)}</span>
        <span>${issue.assignee ? `负责人 ${issue.assignee}` : '还没有负责人'}</span>
      </div>
    </div>
    <div className="attn-actions">
      ${actions}
      <${IconButton} icon="ChevronRight" title="打开问题" onClick=${() => navigate(`/issues/${issue.id}`)} />
    </div>
  </div>`;
}

function ProjectPulseCard({ s, project }) {
  const pulse = projectPulse(s, project.id);
  const recon = pulse.view.recon;
  const issueKeys = new Set(pulse.issues.filter((i) => i.kind === 'failure' || i.kind === 'unknown').flatMap((i) => i.keys));
  const paused = projectWorkflows(s, project.id).find((w) => w.status === 'off');
  const pausedCount = paused ? pendingChanges(s, paused).length : 0;
  const leftActive = pulse.view.open.filter((d) => d.category === 'leftActive' && !d.linked).length;
  const other = Math.max(0, pulse.stuck - issueKeys.size - leftActive - pausedCount);
  const chips = [
    issueKeys.size && { icon: 'CircleX', tone: 'warning', label: '卡在运行问题', n: issueKeys.size, to: `/issues?project=${project.id}` },
    leftActive && { icon: 'UserX', tone: 'danger', label: '离职仍可登录', n: leftActive, to: `/projects/${project.id}/recon?cat=leftActive` },
    pausedCount && { icon: 'CirclePause', tone: 'warning', label: '停用期间未处理', n: pausedCount, to: `/workflows/${paused.id}` },
    other && { icon: 'GitCompareArrows', tone: 'default', label: '其他差异', n: other, to: `/projects/${project.id}/recon` },
  ].filter(Boolean);
  const trend = [...recon.history, { at: pulse.view.run.at, total: pulse.view.run.diffs.length }].slice(-14).map((h, i, arr) => ({
    label: fmt.date(h.at).slice(5), short: fmt.date(h.at).slice(5), value: h.total,
    tone: i === arr.length - 1 ? 'accent' : 'muted', mark: i === arr.length - 1, tip: `${h.total} 处差异`,
  }));
  return html`<section className="pulse-card">
    <header className="pulse-head">
      <${SysPair} source=${project.source} target=${project.target} size=${26} />
      <div className="grow">
        <${Link} to=${`/projects/${project.id}`} className="pulse-name">${project.name}<//>
        <div className="muted text-xs">${systemName(project.source)} → ${systemName(project.target)} · 负责人 ${project.owner}</div>
      </div>
      <${IconButton} icon="ChevronRight" title="打开集成" onClick=${() => navigate(`/projects/${project.id}`)} />
    </header>
    <div className="pulse-hero">
      ${pulse.stuck
        ? html`<div><span className="pulse-num">${pulse.stuck}</span><span className="pulse-unit">个人或账号还没同步好</span></div>`
        : html`<div className="pulse-allgood"><${Icon} name="CircleCheck" size=${22} />两边完全一致</div>`}
      <div className="muted text-xs">${fmt.number(pulse.consistent)} / ${fmt.number(pulse.total)} 人一致 · 对账 ${fmt.relative(pulse.view.run.at)}</div>
    </div>
    ${chips.length > 0 && html`<div className="pulse-chips">
      ${chips.map((c) => html`<${Link} key=${c.label} to=${c.to} className=${cx('pulse-chip', `tone-${c.tone}`)}><${Icon} name=${c.icon} size=${13} />${c.label}<b>${c.n}</b><//>`)}
    </div>`}
    ${paused
      ? html`<div className="pulse-note is-warning"><${Icon} name="CirclePause" size=${14} />「${paused.name}」已停用，${paused.disabledBy}：${paused.disabledNote}</div>`
      : html`<div className="pulse-note"><${Icon} name="Activity" size=${14} />过去 24 小时 · 变动 ${pulse.runs24.total} · 成功 ${pulse.runs24.ok}${pulse.runs24.failed ? ` · 失败 ${pulse.runs24.failed}` : ''}${pulse.runs24.unknown ? ` · 结果未知 ${pulse.runs24.unknown}` : ''}</div>`}
    <div className="pulse-trend">
      <div className="pulse-trend-title">对账差异 · 近 14 次</div>
      <${ColumnChart} data=${trend} height=${56} ariaLabel=${`${project.name}近 14 次对账的差异数`} labelEvery=${13} />
    </div>
  </section>`;
}

function HomeConnections({ s }) {
  return html`<div className="side-card">
    <div className="side-card-head"><span>连接</span><${Link} to="/connections" className="link text-xs">全部<//></div>
    ${s.connections.map((c) => {
      const health = connectionHealth(s, c);
      return html`<${Link} key=${c.id} to=${`/connections/${c.id}`} className="conn-row">
        <${SysLogo} system=${c.system} size=${28} />
        <div className="grow">
          <div className="conn-row-name">${c.name}</div>
          <div className="conn-row-sub">${health.ok ? html`<span className="tone-success-text">正常</span>` : health.problems.map((p) => html`<span key=${p.text} className=${`tone-${p.tone}-text`}>${p.text}</span>`)}<span>每秒 ${c.rate.limit} 次</span></div>
        </div>
        <${Icon} name="ChevronRight" size=${14} className="muted" />
      <//>`;
    })}
  </div>`;
}

function HomeAutoHandled({ s }) {
  const items = autoHandledStats(s);
  const icons = { queue: 'Gauge', catchup: 'History', dedupe: 'CircleSlash', retry: 'ShieldCheck' };
  return html`<div className="side-card">
    <div className="side-card-head"><span>平台替你处理的 · 过去 7 天</span></div>
    <div className="muted text-xs side-card-desc">这些事没有变成问题，因为平台按幂等声明、连接限速和检查点处理掉了。</div>
    <div className="auto-list">
      ${items.map((j) => html`<div key=${j.id} className="auto-item">
        <span className="auto-icon"><${Icon} name=${icons[j.kind]} size=${16} /></span>
        <div className="grow">
          <div className="auto-value"><b>${fmt.number(j.value)}</b> ${j.unit}</div>
          <div className="auto-title">${j.title} · ${fmt.relative(j.at)}</div>
          <div className="auto-detail">${j.detail}</div>
        </div>
      </div>`)}
    </div>
  </div>`;
}

function HomePage() {
  const s = useStore();
  const issues = openIssues(s);
  const [remediate, setRemediate] = useState(null);
  const [enableWf, setEnableWf] = useState(null);
  const high = issues.filter((i) => i.severity === 'high').length;
  const onCall = s.me.onCall;
  return html`<div className="page-inner">
    <div className="home-head">
      <div>
        <h1 className="page-title">${homeGreeting()}，${s.me.name}</h1>
        <p className="page-desc">
          本周你值班（${fmt.date(onCall.from).slice(5)} ~ ${fmt.date(onCall.to).slice(5)}）·
          上次对账 ${fmt.relative(s.lastRecon)} ·
          ${high ? html`<span className="tone-danger-text">有 ${high} 个高危问题</span>` : '没有高危问题'}
        </p>
      </div>
      <button type="button" className="home-search" onClick=${() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
        <${Icon} name="UserSearch" size=${16} />
        <span>HR 问「张三怎么没账号」？按工号、姓名查</span>
        <${Kbd}>${shortcutLabel('mod+k')}<//>
      </button>
    </div>
    <div className="home-grid">
      <div className="col" style=${{ gap: 28, minWidth: 0 }}>
        <section>
          <div className="section-head">
            <h2 className="section-title">需要你处理 <span className="muted">${issues.length}</span></h2>
            <${Link} to="/issues" className="link text-xs">全部问题<//>
          </div>
          ${issues.length
            ? html`<div className="attn-list">${issues.map((i) => html`<${HomeAttentionItem} key=${i.id} s=${s} issue=${i} onRemediate=${setRemediate} onEnable=${setEnableWf} />`)}</div>`
            : html`<div className="card"><${Empty} icon="CircleCheck" title="没有要处理的问题" description="所有集成都和源系统一致。下次对账在明天凌晨。" /></div>`}
        </section>
        <section>
          <div className="section-head">
            <h2 className="section-title">各集成的完整度</h2>
            <${Link} to="/new" className="link text-xs">从方案新建集成<//>
          </div>
          <div className="pulse-grid">
            ${s.projects.map((p) => html`<${ProjectPulseCard} key=${p.id} s=${s} project=${p} />`)}
          </div>
        </section>
      </div>
      <aside className="col" style=${{ gap: 16 }}>
        <${HomeConnections} s=${s} />
        <${HomeAutoHandled} s=${s} />
      </aside>
    </div>
    <${RemediateDialog}
      open=${Boolean(remediate)}
      projectId=${remediate && remediate.projectId}
      keys=${remediate && remediate.keys}
      title=${remediate && `补齐：${issueTitle(s, remediate)}`}
      onClose=${() => setRemediate(null)}
    />
    <${EnableDialog} open=${Boolean(enableWf)} wfId=${enableWf} onClose=${() => setEnableWf(null)} />
  </div>`;
}
