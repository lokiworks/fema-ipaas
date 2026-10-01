function IssueRow({ s, issue, compact }) {
  const project = getProject(s, issue.projectId);
  const kind = ISSUE_KIND[issue.kind];
  return html`<${Link} to=${`/issues/${issue.id}`} className=${cx('attn-item is-link', `sev-${issue.status === 'open' ? issue.severity : 'done'}`)}>
    <div className="attn-main">
      <div className="attn-head">
        ${issue.status === 'open' ? html`<${SeverityTag} severity=${issue.severity} />` : html`<${Tag} size="sm" tone="success" icon="Check">已解决<//>`}
        <span className="attn-kind"><${Icon} name=${kind.icon} size=${13} />${kind.label}</span>
        <span className="attn-title">${issueTitle(s, issue)}</span>
        ${issue.reopened && html`<${Tag} size="sm" tone="danger">复发<//>`}
      </div>
      <div className="attn-meta">
        <span className="mono">${issue.id}</span>
        ${!compact && html`<span>${project.name}</span>`}
        ${issue.keys.length > 0 && html`<span><${PeopleSummary} s=${s} keys=${issue.keys} /></span>`}
        <span>${issue.status === 'open' ? `最近 ${fmt.relative(issue.lastSeenAt)}` : `解决于 ${fmt.relative(issue.resolvedAt)}`}</span>
        <span>${issue.assignee ? `负责人 ${issue.assignee}` : '还没有负责人'}</span>
      </div>
    </div>
    <${Icon} name="ChevronRight" size=${16} className="muted" />
  <//>`;
}

function IssuesPage({ query }) {
  const s = useStore();
  const [tab, setTab] = useState('open');
  const [project, setProject] = useState(query.project || 'all');
  const [kind, setKind] = useState('all');
  const list = sortIssues(s.issues.filter((i) => (tab === 'open' ? i.status === 'open' : i.status !== 'open')
    && (project === 'all' || i.projectId === project)
    && (kind === 'all' || i.kind === kind)));
  const resolved = s.issues.filter((i) => i.status !== 'open').sort((a, b) => b.resolvedAt - a.resolvedAt);
  const rows = tab === 'open' ? list : resolved.filter((i) => list.includes(i));
  return html`<div className="page-inner">
    <${PageHeader}
      title="问题"
      description="出事后的唯一入口。运行失败按原因聚合，同一原因只告警一次；对账差异、连接到期、工作流停用也在这里，按对业务的影响排序。"
    />
    <div className="toolbar">
      <${Segmented} value=${tab} onChange=${setTab} options=${[{ value: 'open', label: `未解决 ${s.issues.filter((i) => i.status === 'open').length}` }, { value: 'done', label: '已解决' }]} />
      <${Select} width=${170} value=${project} onChange=${setProject} options=${[{ value: 'all', label: '全部集成' }, ...s.projects.map((p) => ({ value: p.id, label: p.name }))]} />
      <${Select} width=${150} value=${kind} onChange=${setKind} options=${[{ value: 'all', label: '全部类型' }, ...Object.entries(ISSUE_KIND).map(([k, m]) => ({ value: k, label: m.label }))]} />
    </div>
    ${rows.length
      ? html`<div className="attn-list">${rows.map((i) => html`<${IssueRow} key=${i.id} s=${s} issue=${i} />`)}</div>`
      : html`<div className="card"><${Empty} icon="CircleCheck" title=${tab === 'open' ? '没有未解决的问题' : '还没有已解决的问题'} /></div>`}
  </div>`;
}

function issueDiagnosis(s, issue) {
  const project = getProject(s, issue.projectId);
  const target = systemName(project.target);
  if (issue.cause === 'scope') {
    return {
      text: `${target}应用「星河人事助手」的通讯录权限范围是「部分部门」，不包含新建的「深圳研发中心」，所以开通到这个部门下会被拒绝。`,
      evidence: ['失败都在「确保账号」，目标部门都在深圳研发中心下', `${target}返回 HTTP 400，错误信息指向部门权限`, '同一连接开通到其他部门的运行都成功'],
      confidence: '高',
    };
  }
  if (issue.cause === 'mapping') {
    return {
      text: `北森新建了「${issue.mappingValue}」，映射表里没有它，缺失处理设为「报错」，所以停在「部门映射」。`,
      evidence: ['失败都在「部门映射」，查找值相同', '设计期检查在这个部门出现当天就提示过', '同一批的「深圳研发中心-测试组」已经由李航补了映射'],
      confidence: '高',
    };
  }
  if (issue.kind === 'unknown') {
    return {
      text: `${target}在 30 秒内没有响应。同一时段对${target}的其他调用延迟正常，更像是这一次请求的网络问题，消息可能已经发出。`,
      evidence: ['账号已经开通成功，只有通知这一步没有结果', '同一分钟内其他调用都成功', '「发送群消息」不幂等，所以没有自动重试'],
      confidence: '中',
    };
  }
  if (issue.kind === 'recon' && issue.category === 'leftActive') {
    return {
      text: '两个人原因不同：一个账号是 IT 管理员在后台手工恢复的，另一个离职在北森里没有产生变动记录。这两种情况，靠事件触发都发现不了，只有对账能发现。',
      evidence: ['陈立：员工同步 4 天前已停用账号，之后飞书后台有手工恢复记录', '孙悦：北森是离职状态，但没有找到对应的变动记录', '同期其他离职员工都已停用'],
      confidence: '高',
    };
  }
  if (issue.kind === 'recon') {
    return {
      text: '部门不一致是有人在飞书后台手工改了部门；多出的账号都是 IT 手工创建的测试、设备和驻场账号，不对应北森里的员工。',
      evidence: ['赵磊的部门 3 天前在飞书后台被改过', '多出的 3 个账号都没有工号，创建人都是周文'],
      confidence: '中',
    };
  }
  if (issue.kind === 'credential') {
    const conn = getConnection(s, issue.connectionId);
    return { text: `应用密钥 ${conn.expiresAt ? fmt.date(conn.expiresAt) : ''} 到期。到期后员工变动、读取员工、对账都会返回 401，所有依赖北森的集成同时停下。`, evidence: ['连接设置了到期时间', '2 个集成、2 份对账依赖这个连接'], confidence: '高' };
  }
  if (issue.kind === 'paused') {
    const wf = getWorkflow(s, issue.workflowId);
    return { text: `「${wf.name}」停用后，检查点停在停用那一刻，之后北森的变动都还在。启用时选「从停用时刻开始」就能全部补上，同步是幂等的，不会重复开通。`, evidence: ['停用期间的变动都能从北森重新读到', '对账发现的差异都和这次停用有关'], confidence: '高' };
  }
  return null;
}

function IssueAffected({ s, issue, onRun }) {
  if (!issue.keys.length) return null;
  const rows = issue.keys.map((k) => {
    const person = getPerson(s, k);
    if (!person) {
      const account = getTargetAccount(s, k);
      return { id: k, account, person: null };
    }
    const run = issue.workflowId ? latestRunOfKey(s, issue.workflowId, k) : null;
    return { id: k, person, run };
  });
  return html`<${Card} title=${`受影响的人 ${rows.length}`} subtitle="点名字看这个人从北森变动到现在的全部记录">
    <${Table}
      dense
      columns=${[
        { key: 'who', title: '人或账号', render: (r) => (r.person ? html`<${KeyLink} k=${r.id} name=${r.person.name} />` : html`<span>${r.account ? r.account.name : r.id}</span>`) },
        { key: 'dept', title: '北森部门', render: (r) => (r.person ? r.person.beisen.dept : html`<span className="muted">北森里没有</span>`) },
        { key: 'status', title: '北森状态', render: (r) => (r.person ? html`${r.person.beisen.status}${r.person.beisen.status === '离职' ? html` <span className="muted">${fmt.date(r.person.beisen.leaveDate).slice(5)}</span>` : r.person.beisen.hireDate > Date.now() - 2 * DAY ? html` <span className="muted">入职 ${fmt.date(r.person.beisen.hireDate).slice(5)}</span>` : ''}` : '—') },
        issue.workflowId && { key: 'run', title: '相关运行', render: (r) => (r.run ? html`<button type="button" className="link mono" onClick=${() => onRun(r.run.id)}>${r.run.id}</button>` : html`<span className="muted">—</span>`) },
      ].filter(Boolean)}
      data=${rows}
    />
  <//>`;
}

function IssueFix({ s, issue, onReplay, onRemediate, onException, onEnable }) {
  const project = getProject(s, issue.projectId);
  const target = systemName(project.target);
  if (issue.status !== 'open') {
    return html`<${Alert} tone="success" title=${`已解决 · ${fmt.dateTime(issue.resolvedAt)}`}>${issue.resolvedNote}<//>`;
  }
  if (issue.kind === 'failure') {
    const plan = replayPlan(s, issue);
    return html`<${Card} title="怎么修" subtitle="先修原因，再重放受影响的运行">
      <div className="col" style=${{ gap: 16 }}>
        <div className="fix-stage">
          <span className="fix-stage-num">1</span>
          <div className="grow">
            <div className="fix-stage-title">${issue.cause === 'mapping' ? '补上映射' : `把部门加进${target}应用的通讯录权限范围`}</div>
            ${issue.cause === 'mapping'
              ? html`<${MappingFixInline} tableId=${issue.tableId} value=${issue.mappingValue} />`
              : html`<${ScopeFixCard} connId=${projectConnection(s, project, project.target).id} />`}
          </div>
        </div>
        <div className="fix-stage">
          <span className="fix-stage-num">2</span>
          <div className="grow">
            <div className="fix-stage-title">重放受影响的 ${issue.keys.length} 次运行</div>
            <div className="muted text-xs">重放前会逐人检查，还会失败的人先不重放；全部成功后问题自动关闭。</div>
            <div className="row" style=${{ marginTop: 10 }}>
              <${Button} variant=${plan.runnable.length ? 'primary' : 'outline'} icon="RotateCcw" onClick=${onReplay}>重放…<//>
              <span className="muted text-xs">${plan.runnable.length === issue.keys.length ? '检查都通过了' : plan.runnable.length ? `${plan.runnable.length} 人可以重放，${issue.keys.length - plan.runnable.length} 人还会失败` : '现在重放还会失败'}</span>
            </div>
          </div>
        </div>
      </div>
    <//>`;
  }
  if (issue.kind === 'unknown') {
    return html`<${Card} title="确认消息有没有发出">
      <div className="col" style=${{ gap: 12 }}>
        <div className="muted">去飞书群「HR 入职服务」看看有没有给黄若彤的欢迎消息，再选一个：</div>
        <div className="confirm-choices">
          <button type="button" className="confirm-choice" onClick=${() => { actConfirmUnknown(issue.id, 'sent'); toast.success('已标为已发出，没有重发'); }}>
            <${Icon} name="CheckCheck" size=${18} />
            <div><b>群里看到了，标为已发出</b><span>运行标为成功，不重发</span></div>
          </button>
          <button type="button" className="confirm-choice" onClick=${() => { actConfirmUnknown(issue.id, 'not-sent'); toast.success('已重发这一步，前面的步骤沿用原结果'); }}>
            <${Icon} name="Send" size=${18} />
            <div><b>确认没发出，只重发这一步</b><span>账号不会重新开通，只发一条消息</span></div>
          </button>
        </div>
        <div className="muted text-xs">如果这一步是幂等的（比如「确保账号」），平台会自动重试，不需要人确认。</div>
      </div>
    <//>`;
  }
  if (issue.kind === 'recon') {
    const view = reconView(s, issue.projectId);
    const diffs = view.diffs.filter((d) => issue.keys.includes(d.key || d.accountId));
    return html`<${Card}
      title=${issue.category === 'leftActive' ? '逐个处理' : '逐条确认'}
      subtitle=${issue.category === 'leftActive' ? '补齐会停用账号并通知 IT 资产群；交接还没完成的，可以列为临时例外' : '能补齐的补齐，不对应员工的账号列为例外'}
      extra=${diffs.some((d) => d.category !== 'extra' && d.live === 'open') && html`<${Button} size="sm" variant="primary" icon="Wrench" onClick=${() => onRemediate(diffs.filter((d) => d.category !== 'extra' && d.live === 'open').map((d) => d.key))}>全部补齐<//>`}
    >
      <div className="col" style=${{ gap: 10 }}>
        ${diffs.map((d) => {
          const person = d.key ? getPerson(s, d.key) : null;
          const manual = person && person.target.manual;
          const missingRecord = person && person.changes.some((c) => c.missing);
          return html`<div key=${d.id} className="diff-card">
            <div className="grow">
              <div className="row">
                ${d.key ? html`<${KeyLink} k=${d.key} name=${d.name} />` : html`<b>${d.name}</b>`}
                <${Tag} size="sm" tone=${DIFF_CATEGORY[d.category].tone}>${d.category === 'extra' ? `${target}多出` : DIFF_CATEGORY[d.category].label}<//>
              </div>
              <div className="muted text-xs" style=${{ marginTop: 4 }}>${diffOneLine(s, project, d)}</div>
              ${manual && html`<div className="tone-warning-text text-xs" style=${{ marginTop: 2 }}>${manual.by} ${fmt.relative(manual.at)}${manual.text}</div>`}
              ${missingRecord && html`<div className="tone-warning-text text-xs" style=${{ marginTop: 2 }}>北森没有这条离职的变动记录，工作流没有被触发</div>`}
            </div>
            <div className="row">
              ${d.live === 'open'
                ? html`<${Fragment}>
                  ${d.category !== 'extra' && html`<${Button} size="sm" variant="soft" onClick=${() => onRemediate([d.key])}>补齐<//>`}
                  <${Button} size="sm" variant="ghost" onClick=${() => onException(d)}>例外<//>
                <//>`
                : html`<${Tag} size="sm" tone=${d.live === 'fixed' ? 'success' : 'default'}>${d.live === 'fixed' ? '已一致' : '已例外'}<//>`}
            </div>
          </div>`;
        })}
      </div>
    <//>`;
  }
  if (issue.kind === 'credential') return html`<${CredentialFix} s=${s} issue=${issue} />`;
  if (issue.kind === 'paused') {
    const wf = getWorkflow(s, issue.workflowId);
    const pending = pendingChanges(s, wf);
    return html`<${Card} title="启用工作流，补处理停用期间的变动" extra=${html`<${Button} variant="primary" size="sm" icon="Play" onClick=${() => onEnable(wf.id)}>启用…<//>`}>
      <div className="plan-list">
        ${pending.map(({ person, change }) => html`<div key=${person.key} className="plan-item">
          <${Icon} name="History" size=${15} className="muted" />
          <${KeyLink} k=${person.key} name=${person.name} />
          <span className="plan-item-text">${change.type} · ${person.beisen.dept}</span>
          <span className="muted text-xs">${fmt.relative(change.at)}</span>
        </div>`)}
      </div>
    <//>`;
  }
  return null;
}

function CredentialFix({ s, issue }) {
  const conn = getConnection(s, issue.connectionId);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    setTimeout(() => { actUpdateCredential(conn.id); setBusy(false); toast.success('新密钥验证通过，已保存'); }, 1000);
  };
  return html`<${Card} title="更新应用密钥" subtitle="在北森开放平台重新生成密钥，粘贴到这里，保存前会先验证">
    <div className="col" style=${{ gap: 12 }}>
      <div className="fix-path"><span className="mono">北森开放平台 › 应用管理 › 星河集成 › 密钥管理 › 重新生成</span><${CopyButton} text="北森开放平台 › 应用管理 › 星河集成 › 密钥管理 › 重新生成" /></div>
      <${Field} label="新的 App Secret">
        <${Input} type="password" value=${secret} onChange=${setSecret} placeholder="粘贴新的密钥" />
      <//>
      <div className="row">
        <${Button} variant="primary" icon="ShieldCheck" loading=${busy} disabled=${!secret.trim()} onClick=${save}>验证并保存<//>
        <span className="muted text-xs">旧密钥在保存成功前继续使用，不会中断运行</span>
      </div>
    </div>
  <//>`;
}

function IssuePage({ params }) {
  const s = useStore();
  const issue = getIssue(s, params.id);
  const [runId, setRunId] = useState(null);
  const [replay, setReplay] = useState(false);
  const [remediate, setRemediate] = useState(null);
  const [exceptionDiff, setExceptionDiff] = useState(null);
  const [enableWf, setEnableWf] = useState(null);
  if (!issue) return html`<${NotFoundPage} />`;
  const project = getProject(s, issue.projectId);
  const wf = issue.workflowId ? getWorkflow(s, issue.workflowId) : null;
  const step = wf && issue.stepId ? workflowStep(wf, issue.stepId) : null;
  const diag = issueDiagnosis(s, issue);
  const firstRun = issue.workflowId && issue.keys[0] ? latestRunOfKey(s, issue.workflowId, issue.keys[0]) : null;
  const evidence = firstRun && step ? stepIO(s, firstRun, step) : null;
  return html`<div className="page-inner">
    <${Breadcrumb} items=${[{ label: '问题', to: '/issues' }, { label: issue.id }]} />
    <div className="issue-head">
      <div className="row">
        ${issue.status === 'open' ? html`<${SeverityTag} severity=${issue.severity} size="md" />` : html`<${Tag} tone="success" icon="Check">已解决<//>`}
        <span className="attn-kind"><${Icon} name=${ISSUE_KIND[issue.kind].icon} size=${14} />${ISSUE_KIND[issue.kind].label}</span>
        ${issue.reopened && html`<${Tag} tone="danger">复发<//>`}
      </div>
      <h1 className="page-title">${issueTitle(s, issue)}</h1>
      <div className="issue-meta">
        <${Link} to=${`/projects/${project.id}`} className="link">${project.name}<//>
        ${wf && html`<${Link} to=${`/workflows/${wf.id}`} className="link">${wf.name}${step ? ` · ${step.title}` : ''}<//>`}
        <span>首次 ${fmt.short(issue.firstSeenAt)}</span>
        <span>最近 ${fmt.relative(issue.lastSeenAt)}</span>
        ${issue.code && html`<span className="mono">${issue.code}</span>`}
        <span className="row-4">负责人
          <${Select}
            size="sm"
            width=${120}
            value=${issue.assignee}
            placeholder="指派"
            onChange=${(v) => { actAssign(issue.id, v); toast.success(`已指派给${v}`); }}
            options=${s.users.map((u) => ({ value: u.name, label: u.name, desc: u.role }))}
            dropdownWidth=${220}
          />
        </span>
      </div>
    </div>
    <div className="issue-grid">
      <div className="col" style=${{ gap: 16, minWidth: 0 }}>
        <${Card} title="发生了什么">
          <div className="col" style=${{ gap: 10 }}>
            <div>${issueSummary(s, issue)}</div>
            ${evidence && evidence.error && html`<div className="io-error"><${Icon} name="CircleAlert" size=${14} />${evidence.error}</div>`}
          </div>
        <//>
        <${IssueFix}
          s=${s}
          issue=${issue}
          onReplay=${() => setReplay(true)}
          onRemediate=${(keys) => setRemediate(keys)}
          onException=${setExceptionDiff}
          onEnable=${setEnableWf}
        />
        <${IssueAffected} s=${s} issue=${issue} onRun=${setRunId} />
      </div>
      <aside className="col" style=${{ gap: 16 }}>
        ${diag && html`<div className="diag-card">
          <div className="diag-head"><${Icon} name="Sparkles" size=${15} />AI 诊断<span className="spacer" /><span className="muted text-xs">置信度 ${diag.confidence}</span></div>
          <div className="diag-text">${diag.text}</div>
          <div className="diag-evidence">
            <div className="muted text-xs">依据</div>
            <ul>${diag.evidence.map((e) => html`<li key=${e}>${e}</li>`)}</ul>
          </div>
          <div className="muted text-xs">诊断只给建议；修复和重放由人决定。</div>
        </div>`}
        <div className="side-card">
          <div className="side-card-head"><span>时间线</span></div>
          <${Timeline} compact events=${[...issue.timeline].reverse().map((t) => ({ at: t.at, title: t.text, icon: 'Dot', tone: 'default' }))} />
        </div>
        <div className="side-card">
          <div className="side-card-head"><span>告警</span></div>
          <div className="muted text-xs">${issue.severity === 'high'
            ? '高危：立即通知飞书群「集成值班」，并短信通知值班人。'
            : issue.severity === 'low'
              ? '低优先级：不在夜间告警，汇总进每天上午的值班摘要。'
              : '同一原因只通知一次，之后的失败只累加到这个问题上；已解决后再出现会自动重新打开。'}</div>
        </div>
      </aside>
    </div>
    <${RunDrawer} runId=${runId} onClose=${() => setRunId(null)} />
    <${ReplayDialog} issueId=${issue.id} open=${replay} onClose=${() => setReplay(false)} />
    <${RemediateDialog} open=${Boolean(remediate)} projectId=${issue.projectId} keys=${remediate} onClose=${() => setRemediate(null)} />
    <${ExceptionDialog} open=${Boolean(exceptionDiff)} projectId=${issue.projectId} diff=${exceptionDiff} onClose=${() => setExceptionDiff(null)} />
    <${EnableDialog} open=${Boolean(enableWf)} wfId=${enableWf} onClose=${() => setEnableWf(null)} />
  </div>`;
}
