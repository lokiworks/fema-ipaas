function ProjectsPage() {
  const s = useStore();
  return html`<div className="page-inner">
    <${PageHeader}
      title="集成"
      description="一个项目就是一条集成：两端的连接、工作流、映射表和对账规则放在一起，按「两边是否一致」来看健康。"
      actions=${html`<${Button} variant="primary" icon="Plus" onClick=${() => navigate('/new')}>从方案新建<//>`}
    />
    <div className="pulse-grid">
      ${s.projects.map((p) => html`<${ProjectPulseCard} key=${p.id} s=${s} project=${p} />`)}
      <button type="button" className="new-card" onClick=${() => navigate('/new')}>
        <${Icon} name="Plus" size=${20} />
        <b>从方案新建集成</b>
        <span>北森 → 飞书、北森 → 企业微信……方案一次装好工作流、映射表、对账和告警</span>
      </button>
    </div>
  </div>`;
}

function ProjectPage({ params, query }) {
  const s = useStore();
  const project = getProject(s, params.id);
  if (!project) return html`<${NotFoundPage} />`;
  const tab = params.tab || 'overview';
  const pulse = projectPulse(s, project.id);
  const workflows = projectWorkflows(s, project.id);
  const table = mappingTableOf(s, project.id);
  const cov = mappingCoverage(s, table);
  const tabs = [
    { value: 'overview', label: '概览' },
    { value: 'workflows', label: '工作流', count: workflows.length },
    { value: 'recon', label: '对账', count: pulse.view.open.length || null, dot: pulse.view.byCategory.leftActive > 0 },
    { value: 'mappings', label: '映射表', dot: cov.uncovered.length > 0 },
    { value: 'runs', label: '运行记录' },
  ];
  return html`<div className="page-inner">
    <div className="proj-head">
      <${SysPair} source=${project.source} target=${project.target} size=${36} />
      <div className="grow">
        <h1 className="page-title">${project.name}</h1>
        <p className="page-desc">${project.desc}</p>
      </div>
      <div className="proj-head-meta">
        <span className="muted text-xs">负责人</span>
        <${AvatarGroup} names=${project.members} />
      </div>
    </div>
    <${Tabs} value=${tab} onChange=${(v) => navigate(v === 'overview' ? `/projects/${project.id}` : `/projects/${project.id}/${v}`)} items=${tabs} />
    <div className="proj-body">
      ${tab === 'overview' && html`<${ProjectOverview} s=${s} project=${project} pulse=${pulse} cov=${cov} table=${table} />`}
      ${tab === 'workflows' && html`<${ProjectWorkflows} s=${s} project=${project} />`}
      ${tab === 'recon' && html`<${ReconTab} project=${project} query=${query} />`}
      ${tab === 'mappings' && html`<${MappingTab} project=${project} />`}
      ${tab === 'runs' && html`<${RunsTab} project=${project} query=${query} />`}
    </div>
  </div>`;
}

function ProjectFlowMap({ s, project }) {
  const wf = syncWorkflow(s, project.id);
  const recon = getRecon(s, project.id);
  const steps = workflowSteps(wf);
  const writes = steps.filter((st) => st.effect !== 'read');
  return html`<div className="flowmap">
    <div className="flowmap-row">
      <div className="flowmap-node">
        <${SysLogo} system=${project.source} size=${32} />
        <div><b>${systemName(project.source)}</b><div className="muted text-xs">员工变动 · ${wf.trigger.mode}</div></div>
      </div>
      <div className="flowmap-edge"><span>业务键 ${wf.trigger.keyField}</span><${Icon} name="ArrowRight" size=${16} /></div>
      <${Link} to=${`/workflows/${wf.id}`} className="flowmap-node is-wf">
        <span className="flowmap-wf-icon"><${Icon} name="Workflow" size=${18} /></span>
        <div><b>${wf.name}</b><div className="muted text-xs">v${wf.version} · ${wf.status === 'on' ? '运行中' : '已停用'} · 按期望状态同步</div></div>
      <//>
      <div className="flowmap-edge"><span>${writes.length} 个写操作</span><${Icon} name="ArrowRight" size=${16} /></div>
      <div className="flowmap-node">
        <${SysLogo} system=${project.target} size=${32} />
        <div><b>${systemName(project.target)}</b><div className="muted text-xs">${writes.map((w) => w.title).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(' · ')}</div></div>
      </div>
    </div>
    <div className="flowmap-loop">
      <${Icon} name="GitCompareArrows" size=${15} />
      <span>每天 ${fmt.pad(recon.hour)}:${fmt.pad(recon.minute)} 对账：读取两边名单，按${wf.trigger.keyField}比对，差异进问题中心；补齐仍走「${wf.name}」</span>
      <${Link} to=${`/projects/${project.id}/recon`} className="link">查看对账<//>
    </div>
  </div>`;
}

function ProjectOverview({ s, project, pulse, cov, table }) {
  const recon = pulse.view.recon;
  const conns = project.connections.map((id) => getConnection(s, id));
  const trend = [...recon.history, { at: pulse.view.run.at, total: pulse.view.run.diffs.length }].slice(-14).map((h, i, arr) => ({
    label: fmt.date(h.at), short: fmt.date(h.at).slice(5), value: h.total, tone: i === arr.length - 1 ? 'accent' : 'muted', mark: i === arr.length - 1, tip: `${h.total} 处差异`,
  }));
  return html`<div className="proj-grid">
    <div className="col" style=${{ gap: 20, minWidth: 0 }}>
      ${project.firstRecon && html`<${Alert}
        tone=${project.firstRecon.high ? 'warning' : 'info'}
        icon="GitCompareArrows"
        title=${`首次对账发现 ${project.firstRecon.diffs} 处差异${project.firstRecon.high ? `，其中 ${project.firstRecon.high} 名离职员工的${systemName(project.target)}账号仍可登录` : ''}`}
        action=${html`<${Button} size="sm" variant="primary" onClick=${() => navigate(`/projects/${project.id}/recon`)}>去处理<//>`}
      >这些多是过去手工维护留下的，不是新集成造成的。建议先处理离职仍可登录的，其余逐步补齐或列为例外；之后每天对账只会看到新出现的差异。<//>`}
      <${ProjectFlowMap} s=${s} project=${project} />
      <div className="stat-row">
        <${Stat} label="还没同步好" value=${pulse.stuck} suffix="个人或账号" icon="UserRoundX" onClick=${() => navigate(`/projects/${project.id}/recon`)} />
        <${Stat} label="两边一致" value=${fmt.number(pulse.consistent)} suffix=${`/ ${fmt.number(pulse.total)} 人`} icon="UserRoundCheck" />
        <${Stat} label="过去 24 小时的变动" value=${pulse.runs24.total} suffix=${`次 · 成功 ${pulse.runs24.ok}`} icon="Activity" onClick=${() => navigate(`/projects/${project.id}/runs`)} />
      </div>
      <section>
        <div className="section-head"><h2 className="section-title">未解决的问题 <span className="muted">${pulse.issues.length}</span></h2></div>
        ${pulse.issues.length
          ? html`<div className="attn-list">${pulse.issues.map((i) => html`<${IssueRow} key=${i.id} s=${s} issue=${i} compact />`)}</div>`
          : html`<div className="card"><${Empty} size="sm" icon="CircleCheck" title="没有未解决的问题" /></div>`}
      </section>
    </div>
    <aside className="col" style=${{ gap: 16 }}>
      <div className="side-card">
        <div className="side-card-head"><span>对账</span><${Link} to=${`/projects/${project.id}/recon`} className="link text-xs">打开<//></div>
        <div className="mini-kv"><span>上次</span><b>${fmt.short(pulse.view.run.at)} · ${pulse.view.run.diffs.length} 处差异</b></div>
        <div className="mini-kv"><span>现在还剩</span><b>${pulse.view.open.length} 处</b></div>
        <div style=${{ marginTop: 10 }}><${ColumnChart} data=${trend} height=${60} ariaLabel="近 14 次对账的差异数" labelEvery=${13} /></div>
      </div>
      <div className="side-card">
        <div className="side-card-head"><span>映射表覆盖率</span><${Link} to=${`/projects/${project.id}/mappings`} className="link text-xs">打开<//></div>
        <div className="mini-kv"><span>${table.name}</span><b>${cov.covered} / ${cov.total}</b></div>
        <${Progress} value=${(cov.covered / cov.total) * 100} tone=${cov.uncovered.length ? 'warning' : 'success'} />
        ${cov.uncovered.map((v) => html`<div key=${v.value} className="cov-miss"><${Icon} name="TriangleAlert" size=${13} />${Date.now() - v.firstSeenAt < 30 * DAY ? `北森新部门「${v.value}」没有映射 · ${fmt.relative(v.firstSeenAt)}出现` : `北森部门「${v.value}」没有映射`}</div>`)}
      </div>
      <div className="side-card">
        <div className="side-card-head"><span>连接</span></div>
        ${conns.map((c) => {
          const health = connectionHealth(s, c);
          return html`<${Link} key=${c.id} to=${`/connections/${c.id}`} className="conn-row">
            <${SysLogo} system=${c.system} size=${28} />
            <div className="grow">
              <div className="conn-row-name">${c.name}</div>
              <div className="conn-row-sub">${health.ok ? html`<span className="tone-success-text">正常</span>` : health.problems.map((p) => html`<span key=${p.text} className=${`tone-${p.tone}-text`}>${p.text}</span>`)}</div>
            </div>
          <//>`;
        })}
      </div>
    </aside>
  </div>`;
}

function ProjectWorkflows({ s, project }) {
  const workflows = projectWorkflows(s, project.id);
  const [enableWf, setEnableWf] = useState(null);
  const toggle = async (wf) => {
    if (wf.status === 'off') { setEnableWf(wf.id); return; }
    const ok = await confirmDialog({
      title: `停用「${wf.name}」？`,
      content: '停用期间北森的变动不会处理。再次启用时，可以选择从停用时刻开始补处理。',
      okText: '停用',
      danger: true,
    });
    if (ok) { actDisableWorkflow(wf.id, '手动停用'); toast.success('已停用'); }
  };
  return html`<div className="col" style=${{ gap: 12 }}>
    ${workflows.map((wf) => {
      const runs = s.runs.filter((r) => r.workflowId === wf.id);
      const last = runs[0];
      const steps = workflowSteps(wf);
      const pending = pendingChanges(s, wf);
      return html`<div key=${wf.id} className="wf-card">
        <div className="wf-card-main">
          <div className="row">
            <${Link} to=${`/workflows/${wf.id}`} className="wf-card-name">${wf.name}<//>
            <${Tag} size="sm" tone=${wf.status === 'on' ? 'success' : 'warning'} dot>${wf.status === 'on' ? '运行中' : '已停用'}<//>
            <span className="muted text-xs">v${wf.version} · ${wf.updatedBy} 更新于 ${fmt.relative(wf.updatedAt)}</span>
          </div>
          <div className="wf-card-steps">
            ${steps.filter((st) => st.role !== 'branch').map((st, i) => html`<${Fragment} key=${st.id}>
              ${i > 0 && html`<${Icon} name="ChevronRight" size=${12} className="muted" />`}
              <span className="wf-chip"><${SysLogo} system=${st.system} size=${16} />${st.title}</span>
            <//>`)}
          </div>
          <div className="wf-card-meta">
            <span><${Icon} name="Zap" size=${12} />${wf.trigger.label}</span>
            ${wf.trigger.keyField && html`<span><${Icon} name="Fingerprint" size=${12} />业务键 ${wf.trigger.keyField}</span>`}
            ${last && html`<span><${Icon} name="Clock" size=${12} />最近运行 ${fmt.relative(last.at)}</span>`}
            ${wf.status === 'off' && html`<span className="tone-warning-text"><${Icon} name="CirclePause" size=${12} />停用 ${fmt.relative(wf.disabledAt)}，有 ${pending.length} 条变动等待处理</span>`}
          </div>
        </div>
        <div className="row">
          <${Button} size="sm" onClick=${() => navigate(`/workflows/${wf.id}`)}>打开<//>
          <${Switch} checked=${wf.status === 'on'} onChange=${() => toggle(wf)} />
        </div>
      </div>`;
    })}
    <${EnableDialog} open=${Boolean(enableWf)} wfId=${enableWf} onClose=${() => setEnableWf(null)} />
  </div>`;
}

function MappingTab({ project }) {
  const s = useStore();
  const table = mappingTableOf(s, project.id);
  const cov = mappingCoverage(s, table);
  const [q, setQ] = useState('');
  const rows = cov.values.filter((v) => !q || v.value.includes(q) || (v.mapped || '').includes(q));
  return html`<div className="col" style=${{ gap: 16 }}>
    <div className="map-head">
      <div>
        <div className="section-title">${table.name}</div>
        <div className="muted text-xs">映射表是项目资源，改动对下一次运行立即生效。查不到时：<b>报错</b>（不会把人开通到错误的部门）</div>
      </div>
      <div className="map-cov">
        <div className="map-cov-num">${cov.covered}<span>/ ${cov.total}</span></div>
        <div className="muted text-xs">北森${table.fromLabel.replace('北森', '')}已映射</div>
      </div>
    </div>
    ${cov.uncovered.length > 0 && html`<${Alert} tone="warning" title=${`北森出现了 ${cov.uncovered.length} 个还没有映射的${table.fromLabel.replace('北森', '')}`}>
      平台每天读取北森的组织架构，出现新值时在这里和工作流的设计期检查里提示，不用等到有人入职失败才发现。
    <//>`}
    ${cov.uncovered.map((v) => html`<div key=${v.value} className="card"><div className="card-body"><${MappingFixInline} tableId=${table.id} value=${v.value} /></div></div>`)}
    <div className="toolbar"><${SearchInput} value=${q} onChange=${setQ} placeholder="搜索部门" /></div>
    <${Table}
      dense
      columns=${[
        { key: 'value', title: table.fromLabel, render: (r) => html`<span className=${cx(!r.mapped && 'tone-warning-text')}>${r.value}</span>` },
        { key: 'arrow', title: '', width: 30, render: () => html`<${Icon} name="ArrowRight" size=${14} className="muted" />` },
        { key: 'mapped', title: table.toLabel, render: (r) => (r.mapped ? r.mapped : html`<${Tag} tone="warning" size="sm">没有映射<//>`) },
        { key: 'people', title: '在职人数', align: 'right', render: (r) => html`<span className="num">${r.people}</span>` },
        { key: 'seen', title: '北森出现于', render: (r) => html`<span className="muted">${fmt.relative(r.firstSeenAt)}</span>` },
        { key: 'by', title: '最近修改', render: (r) => { const row = table.rows.find((x) => x.from === r.value); return row ? html`<span className="muted">${row.addedBy} · ${fmt.relative(row.addedAt)}</span>` : '—'; } },
      ]}
      data=${rows}
      rowKey="value"
    />
  </div>`;
}

function RunsTab({ project, query }) {
  const s = useStore();
  const [q, setQ] = useState(query.q || '');
  const [status, setStatus] = useState(query.status || 'all');
  const [source, setSource] = useState('all');
  const [runId, setRunId] = useState(query.run || null);
  const [page, setPage] = useState(1);
  const all = s.runs.filter((r) => r.projectId === project.id);
  const rows = all.filter((r) => (status === 'all' || r.status === status)
    && (source === 'all' || r.source === source)
    && (!q || (r.key || '').toLowerCase().includes(q.toLowerCase()) || (r.name || '').includes(q)));
  const pageSize = 20;
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  return html`<div>
    <div className="toolbar">
      <${SearchInput} value=${q} onChange=${(v) => { setQ(v); setPage(1); }} placeholder="工号或姓名" width=${220} />
      <${Select} width=${150} value=${status} onChange=${(v) => { setStatus(v); setPage(1); }} options=${[{ value: 'all', label: '全部状态' }, ...Object.entries(RUN_STATUS).filter(([k]) => k !== 'running').map(([k, m]) => ({ value: k, label: m.label }))]} />
      <${Select} width=${150} value=${source} onChange=${(v) => { setSource(v); setPage(1); }} options=${[{ value: 'all', label: '全部来源' }, ...Object.entries(RUN_SOURCE).filter(([k]) => k !== 'dryrun').map(([k, label]) => ({ value: k, label }))]} />
      <span className="spacer" />
      <span className="muted text-xs">每次运行都标着业务键，按人查比按运行 ID 查快</span>
    </div>
    <${Table}
      dense
      onRowClick=${(r) => setRunId(r.id)}
      columns=${[
        { key: 'id', title: '运行', render: (r) => html`<span className="mono">${r.id}</span>` },
        { key: 'who', title: '人', render: (r) => html`<${KeyLink} k=${r.key} name=${r.name} />` },
        { key: 'wf', title: '工作流', render: (r) => getWorkflow(s, r.workflowId).name },
        { key: 'change', title: '变动', render: (r) => r.change },
        { key: 'source', title: '来源', render: (r) => html`<${SourceTag} source=${r.source} />` },
        { key: 'status', title: '状态', render: (r) => html`<span className="row"><${RunStatusTag} status=${r.status} />${r.replayedBy && html`<span className="muted text-xs">已重放</span>`}</span>` },
        { key: 'result', title: '结果', render: (r) => html`<span className="muted ellipsis" style=${{ maxWidth: 300, display: 'inline-block' }}>${runOneLine(s, r)}</span>` },
        { key: 'at', title: '时间', render: (r) => html`<span className="muted num">${fmt.short(r.at)}</span>` },
      ]}
      data=${pageRows}
    />
    <div style=${{ marginTop: 12 }}><${Pagination} page=${page} pageSize=${pageSize} total=${rows.length} onChange=${setPage} /></div>
    <${RunDrawer} runId=${runId} onClose=${() => setRunId(null)} />
  </div>`;
}
