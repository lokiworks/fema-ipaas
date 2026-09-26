function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '上午好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function HomePage() {
  const state = useStore();
  const [modal, setModal] = useState(null);
  const [shuffle, setShuffle] = useState(0);
  const [pickedTpl, setPickedTpl] = useState(null);
  const [aiText, setAiText] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const me = state.users.find((u) => u.id === state.me) || { name: personName(state.me), modules: [] };
  const myProjects = integMemberProjects(state);
  const myIds = new Set(myProjects.map((p) => p.id));
  const editable = integEditableProjects(state);
  const tpls = state.templates.filter((t) => integTplTab(t, state.me) === 'rec');
  const shown = Array.from({ length: Math.min(4, tpls.length) }, (_, i) => tpls[(shuffle * 4 + i) % tpls.length]);
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()];
  const recent = [...(state.recent || [])]
    .sort((a, b) => b.time - a.time)
    .map((r) => {
      if (r.type === 'workflow') {
        const w = state.workflows.find((x) => x.id === r.id);
        return w && myIds.has(w.projectId) && { key: `wf-${w.id}`, kind: '工作流', name: w.name, projectId: w.projectId, owner: w.owner, time: r.time, to: `/integration/${w.projectId}/wf/${w.id}`, node: html`<${WorkflowGlyph} wf=${w} size=${18} />` };
      }
      if (r.type === 'storage') {
        const s = state.storages.find((x) => x.id === r.id);
        return s && myIds.has(s.projectId) && { key: `ds-${s.id}`, kind: '数据存储', name: s.name, projectId: s.projectId, owner: s.owner, time: r.time, to: `/integration/${s.projectId}/storage?id=${s.id}`, node: html`<span className="home-res-icon"><${Icon} name="Database" size=${14} /></span>` };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 6);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const todayRuns = state.runs.filter((r) => r.kind === 'run' && r.startedAt >= midnight.getTime() && myIds.has(r.projectId));
  const today = runMetrics(todayRuns);
  const todayFailed = todayRuns.filter((r) => ['failed', 'timeout'].includes(r.status)).sort((a, b) => b.startedAt - a.startedAt);
  const hourNow = new Date().getHours();
  const hourly = Array.from({ length: Math.max(2, hourNow + 1) }, (_, h) => todayRuns.filter((r) => new Date(r.startedAt).getHours() === h).length);
  const brokenConns = state.connections.filter((c) => c.status !== 'active' && connectionPerm(state, c));
  const hasProject = myProjects.length > 0;
  const hasWorkflow = state.workflows.some((w) => w.owner === state.me && myIds.has(w.projectId));
  const newTip = editable.length ? '' : '你还没有可编辑的项目，请先新建项目';
  const tourProject = editable.find((p) => state.workflows.some((w) => w.projectId === p.id));
  const tourWf = tourProject && state.workflows.find((w) => w.projectId === tourProject.id);
  const pending = pendingApprovals(state);
  const setup = ['owner', 'admin'].includes(me.role) ? homeSetupItems(state) : [];
  const setupDone = setup.filter((it) => it.done && !it.warn);
  const setupTodo = setup.filter((it) => !it.done || it.warn);
  const openAi = (prompt) => aiBus.open({ projectId: state.currentProjectId, prompt: String(prompt || '').trim() });
  const submitAi = () => { openAi(aiText); setAiText(''); };
  const learn = [
    { key: 'tour-console', icon: 'Compass', label: '认识控制台', desc: '3 步了解首页、项目和最近访问', onClick: () => tourBus.start('console') },
    tourWf && { key: 'tour-editor', icon: 'MousePointerClick', label: '认识工作流编辑器', desc: '5 步掌握节点、连线取值、调试和发布', onClick: () => { navigate(`/integration/${tourWf.projectId}/wf/${tourWf.id}?mode=edit`); setTimeout(() => tourBus.start('editor'), 500); } },
    { key: 'quickstart', icon: 'Rocket', label: '5 分钟搭建第一个工作流', desc: '帮助文档', onClick: () => helpBus.open('quickstart') },
    { key: 'references', icon: 'Braces', label: '在入参中引用上游数据', desc: '帮助文档', onClick: () => helpBus.open('references') },
    { key: 'errors', icon: 'ShieldAlert', label: '错误处理与重试', desc: '帮助文档', onClick: () => helpBus.open('errors') },
    (me.modules || []).includes('mcp') && { key: 'mcp', icon: 'Server', label: '把工作流开放给 AI 助手（MCP）', desc: '前往 MCP 服务', onClick: () => navigate('/mcp') },
  ].filter(Boolean);
  return html`<div className="page"><div className="page-inner">
    <div className="home-hero">
      <div>
        <h1 className="home-title">${greeting()}，${me.name}</h1>
        <div className="muted">${state.tenant.name} · ${fmt.date(Date.now())} ${weekday}</div>
      </div>
      <div className="row">
        <${Button} icon="Search" onClick=${() => searchBus.open()}>搜索<${Kbd}>${shortcutLabel('mod+k')}<//><//>
        <${IntegDisabledTip} tip=${newTip}><${Button} variant="primary" icon="Plus" disabled=${!editable.length} onClick=${() => setModal('new')}>新建工作流<//><//>
      </div>
    </div>
    <section className="home-ai" aria-label="用 AI 新建工作流">
      <div className="home-ai-head"><${Icon} name="Sparkles" size=${16} /><span>用一句话描述你想自动化的事情，AI 列出步骤和要确认的问题，再帮你搭好草稿</span></div>
      <div className="home-ai-box">
        <textarea
          className="home-ai-input"
          rows=${2}
          maxLength=${500}
          value=${aiText}
          aria-label="描述你想自动化的事情"
          placeholder="描述你想自动化的事情，例如：员工入职后在飞书建档、按部门开通账号并通知 HR 群"
          onChange=${(e) => setAiText(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (editable.length) submitAi(); } }}
        />
        <${IntegDisabledTip} tip=${newTip}><${Button} variant="primary" icon="Sparkles" disabled=${!editable.length} onClick=${submitAi}>${aiText.trim() ? '开始规划' : '用 AI 新建'}<//><//>
      </div>
      <div className="home-ai-chips">
        <span className="text-xs muted">试试</span>
        ${AIGEN_EXAMPLES.map((ex) => html`<button key=${ex.key} type="button" className="chip" disabled=${!editable.length} onClick=${() => openAi(ex.prompt)}>${ex.label}</button>`)}
      </div>
    </section>
    ${!(state.onboarding || {}).dismissed && html`<div className="onboard" data-tour="home-start">
      <div className="onboard-text">
        <div className="onboard-title">欢迎使用 ${state.tenant.appearance.productName}</div>
        <div className="muted">两步完成第一个自动化：先建一个项目，再在项目里新建工作流。</div>
        <div className="row home-onboard-actions">
          <${Button} variant="primary" size="sm" icon="Compass" onClick=${() => tourBus.start('console')}>开始新手引导<//>
          <${Button} size="sm" variant="ghost" onClick=${() => Store.set((s) => ({ ...s, onboarding: { ...(s.onboarding || {}), dismissed: true } }))}>暂时跳过<//>
        </div>
      </div>
      <div className="onboard-steps">
        <button type="button" className=${cx('onboard-step', hasProject && 'is-done')} onClick=${() => setModal('project')}>
          <span className="onboard-no">${hasProject ? html`<${Icon} name="Check" size=${14} strokeWidth=${3} />` : 1}</span>
          <span className="grow"><b>创建集成项目</b><span className="text-xs muted">按业务线或团队划分，项目之间权限隔离</span></span>
          <${Icon} name="ChevronRight" size=${16} className="muted" />
        </button>
        <button type="button" className=${cx('onboard-step', hasWorkflow && 'is-done')} disabled=${!editable.length} title=${newTip} onClick=${() => setModal('new')}>
          <span className="onboard-no">${hasWorkflow ? html`<${Icon} name="Check" size=${14} strokeWidth=${3} />` : 2}</span>
          <span className="grow"><b>创建工作流</b><span className="text-xs muted">${editable.length ? '选择触发器，再添加要执行的节点' : '先完成第一步，新建一个项目'}</span></span>
          <${Icon} name="ChevronRight" size=${16} className="muted" />
        </button>
      </div>
    </div>`}
    <div className="home-grid">
      <div className="col home-main-col">
        <section data-tour="home-recent">
          <div className="section-head"><span className="section-title">最近访问</span><span className="text-xs muted">最近打开过的工作流和数据存储</span></div>
          ${recent.length === 0
            ? html`<div className="card"><${Empty} size="sm" icon="Clock" title="暂无最近访问的资源" description="打开过的工作流和数据存储会出现在这里。" /></div>`
            : html`<${Table}
              dense
              onRowClick=${(r) => navigate(r.to)}
              rowKey="key"
              columns=${[
                { key: 'name', title: '资源名', render: (r) => html`<div className="cell-main">${r.node}<span className="cell-title ellipsis">${r.name}</span><${Tag} size="sm">${r.kind}<//></div>` },
                { key: 'p', title: '所属项目', width: 130, render: (r) => { const p = state.projects.find((x) => x.id === r.projectId); return p ? html`<span className="row-4"><${ProjectAvatar} project=${p} size=${18} /><span className="ellipsis">${p.name}</span></span>` : '-'; } },
                { key: 'o', title: '所有者', width: 90, render: (r) => personName(r.owner) },
                { key: 't', title: '最近访问', width: 110, render: (r) => html`<span className="muted" title=${fmt.dateTime(r.time)}>${fmt.relative(r.time)}</span>` },
              ]}
              data=${recent}
            />`}
        </section>
        <section>
          <div className="section-head">
            <span className="section-title">我的项目</span>
            <${Link} to="/projects" className="link text-xs">全部项目<//>
          </div>
          <div className="project-grid">
            ${myProjects.map((p) => {
              const wfs = state.workflows.filter((w) => w.projectId === p.id);
              const mem = state.members.filter((m) => m.projectId === p.id);
              return html`<button key=${p.id} type="button" className="project-card" onClick=${() => navigate(`/integration/${p.id}`)}>
                <div className="row"><${ProjectAvatar} project=${p} size=${32} /><span className="grow"><span className="project-name ellipsis">${p.name}</span><span className="text-xs muted">${roleLabel(projectRole(state, p.id))}</span></span></div>
                <div className="project-desc">${p.description || '暂无描述'}</div>
                <div className="row text-xs muted nowrap"><span className="row-4">${wfs.length} 个工作流</span><span className="row-4"><${Dot} tone="success" />${wfs.filter((w) => w.status === 'enabled').length} 个运行中</span><span className="spacer" /><${AvatarGroup} names=${mem.map((m) => personName(m.userId))} size=${20} /></div>
              </button>`;
            })}
            <button type="button" className="project-card is-new" onClick=${() => setModal('project')}><${Icon} name="Plus" size=${18} />新建项目</button>
          </div>
        </section>
        <section>
          <div className="section-head">
            <div className="row"><span className="section-title">从模板新建工作流</span><${Button} size="xs" variant="ghost" icon="RefreshCw" disabled=${tpls.length <= 4} onClick=${() => setShuffle(shuffle + 1)}>换一批<//></div>
            <${Link} to="/templates" className="link text-xs">模板中心<//>
          </div>
          <div className="tpl-grid">${shown.map((t) => html`<${TemplateCard} key=${t.id} tpl=${t} onClick=${() => { setPickedTpl(t); setModal('tpl'); }} />`)}</div>
        </section>
      </div>
      <div className="col home-side-col">
        <${Card} title="待我处理" subtitle=${pending.length ? `${pending.length} 项需要你审批或确认` : '没有等你审批或确认的事项'}>
          ${pending.length === 0
            ? html`<div className="text-xs muted home-todo-empty">发布审批和智能体的人工确认会出现在这里。</div>`
            : html`<div className="col home-attention">
              ${pending.slice(0, 5).map((p) => html`<${HomeTodoRow} key=${p.type + p.id} item=${p} state=${state} />`)}
              ${pending.length > 5 && html`<div className="text-xs muted home-more">还有 ${pending.length - 5} 项，在通知中心查看</div>`}
            </div>`}
        <//>
        ${setup.length > 0 && html`<${Card} title="平台设置" subtitle=${`${setupDone.length}/${setup.length} 已完成 · 只有平台管理员能看到`}>
          <div className="home-setup">
            <${Progress} value=${(setupDone.length / setup.length) * 100} tone=${setupTodo.length ? 'primary' : 'success'} height=${4} />
            <div className="col home-attention">
              ${setupTodo.map((it) => html`<${HomeSetupRow} key=${it.key} item=${it} />`)}
              ${setupTodo.length === 0 && html`<div className="text-xs muted">平台的基础设置都已完成。</div>`}
              ${setupOpen && setupDone.map((it) => html`<${HomeSetupRow} key=${it.key} item=${it} />`)}
            </div>
            ${setupDone.length > 0 && html`<button type="button" className="link text-xs home-more" aria-expanded=${setupOpen} onClick=${() => setSetupOpen(!setupOpen)}>${setupOpen ? '收起已完成的设置' : `查看已完成的 ${setupDone.length} 项`}</button>`}
          </div>
        <//>`}
        <${Card} title="今日运行" subtitle="从今天 0 点开始，不含调试运行和已去重的重复事件" extra=${html`<${Link} to="/monitor" className="link text-xs">运行监控<//>`}>
          <div className="home-today">
            <button type="button" className="home-today-stat" title="查看今天的运行日志" onClick=${() => navigate('/logs?status=success,failed,timeout,running,waiting,stopped&time=today')}><div className="stat-value">${fmt.number(today.total)}</div><div className="text-xs muted">运行次数</div></button>
            <button type="button" className="home-today-stat" title="查看今天失败或超时的运行日志" onClick=${() => navigate('/logs?status=failed,timeout&time=today')}><div className=${cx('stat-value', today.failed > 0 && 'home-bad')}>${fmt.number(today.failed)}</div><div className="text-xs muted">失败或超时</div></button>
            <button type="button" className="home-today-stat" title="成功次数 ÷ 已结束的运行次数，点击查看今天的运行日志" onClick=${() => navigate('/logs?status=success,failed,timeout,running,waiting,stopped&time=today')}><div className="stat-value">${fmtRate(today.rate)}</div><div className="text-xs muted">成功率</div></button>
          </div>
          <div className="home-spark" title="今天每小时的运行次数"><${Sparkline} data=${hourly} width=${280} height=${40} /></div>
        <//>
        <${Card} title="需要关注" subtitle=${todayFailed.length + brokenConns.length ? '今天失败的运行和不可用的连接' : '一切正常'}>
          <div className="col home-attention">
            ${todayFailed.slice(0, 3).map((r) => { const wf = state.workflows.find((w) => w.id === r.workflowId); return html`<button key=${r.id} type="button" className="attention-row" onClick=${() => navigate(`/logs?run=${r.id}`)}>
              <${Icon} name="CircleX" size=${16} className="home-bad" />
              <span className="grow"><span className="ellipsis home-block">${wf ? wf.name : '已删除的工作流'} ${RUN_STATUS[r.status].label}</span><span className="text-xs muted">${fmt.relative(r.startedAt)}</span></span>
              <${Icon} name="ChevronRight" size=${14} className="muted" />
            </button>`; })}
            ${todayFailed.length > 3 && html`<button type="button" className="link text-xs home-more" onClick=${() => navigate('/logs?status=failed,timeout&time=today')}>查看今天全部 ${todayFailed.length} 次失败或超时</button>`}
            ${brokenConns.map((c) => html`<button key=${c.id} type="button" className="attention-row" onClick=${() => navigate(`/connections?id=${c.id}`)}>
              <${Icon} name="Link2Off" size=${16} className="home-warn" />
              <span className="grow"><span className="ellipsis home-block">${c.name}</span><span className="text-xs muted">${CONN_STATUS[c.status].reason}，${connectionUsage(state, c.id).length} 个工作流受影响</span></span>
              <${Icon} name="ChevronRight" size=${14} className="muted" />
            </button>`)}
            ${todayFailed.length + brokenConns.length === 0 && html`<${Empty} size="sm" icon="CircleCheck" title="没有需要处理的问题" />`}
          </div>
        <//>
        <${Card} title="快速上手">
          <div className="col home-learn">
            ${learn.map((it) => html`<button key=${it.key} type="button" className="attention-row" onClick=${it.onClick}>
              <${Icon} name=${it.icon} size=${16} className="muted" />
              <span className="grow"><span className="home-block">${it.label}</span><span className="text-xs muted">${it.desc}</span></span>
              <${Icon} name="ChevronRight" size=${14} className="muted" />
            </button>`)}
          </div>
        <//>
      </div>
    </div>
    ${modal === 'new' && html`<${NewWorkflowModal} open=${true} onClose=${() => setModal(null)} projectId=${state.currentProjectId} pickProject=${true} />`}
    ${modal === 'project' && html`<${ProjectModal} open=${true} onClose=${() => setModal(null)} />`}
    ${modal === 'tpl' && html`<${TemplatePickerModal} open=${true} onClose=${() => setModal(null)} projectId=${null} initial=${pickedTpl} />`}
  </div></div>`;
}

function HomeTodoRow({ item, state }) {
  if (item.type === 'release') {
    const r = item.item;
    const wf = state.workflows.find((w) => w.id === r.workflowId);
    return html`<button type="button" className="attention-row" onClick=${() => navigate(`/integration/${r.projectId}/releases/${r.id}`)}>
      <span className="home-todo-icon"><${Icon} name="Rocket" size=${14} /></span>
      <span className="grow">
        <span className="ellipsis home-block">${wf ? `「${wf.name}」v${r.version} 推广到生产` : `v${r.version} 推广到生产`}</span>
        <span className="text-xs muted">发布审批 · ${personName(r.requestedBy)} 申请 · ${fmt.relative(r.requestedAt)}</span>
      </span>
      <${Icon} name="ChevronRight" size=${14} className="muted" />
    </button>`;
  }
  const run = item.item;
  const pa = run.pendingApproval;
  const wf = state.workflows.find((w) => w.id === run.workflowId);
  const subject = pa.input && (pa.input.summary || pa.input.title);
  return html`<button type="button" className="attention-row" onClick=${() => navigate(`/logs?run=${run.id}`)}>
    <span className="home-todo-icon is-agent"><${Icon} name="Bot" size=${14} /></span>
    <span className="grow">
      <span className="ellipsis home-block">${wf ? wf.name : '已删除的工作流'}：${pa.toolName}${subject ? `「${subject}」` : ''}</span>
      <span className="text-xs muted">智能体等待人工确认 · ${fmt.relative(pa.requestedAt)}</span>
    </span>
    <${Icon} name="ChevronRight" size=${14} className="muted" />
  </button>`;
}

function HomeSetupRow({ item }) {
  const icon = item.warn ? 'TriangleAlert' : item.done ? 'CircleCheck' : 'Circle';
  return html`<button type="button" className="attention-row" onClick=${() => navigate(item.to)}>
    <${Icon} name=${icon} size=${16} className=${item.warn ? 'home-warn' : item.done ? 'home-ok' : 'muted'} />
    <span className="grow">
      <span className="home-block">${item.label}</span>
      <span className="text-xs muted">${item.desc}</span>
    </span>
    <${Icon} name="ChevronRight" size=${14} className="muted" />
  </button>`;
}

function homeSetupItems(state) {
  const others = state.users.filter((u) => u.id !== state.me && u.status !== 'disabled');
  const sso = state.sso || {};
  const ssoOn = HOME_SSO_NAMES.filter(([k]) => sso[k] && sso[k].enabled && sso[k].configured).map(([, name]) => name);
  const sys = state.system || {};
  const policy = sys.backupPolicy || {};
  const last = [...(sys.backups || [])].sort((a, b) => b.at - a.at)[0];
  const channels = (state.channels || []).filter((c) => c.status === 'active');
  const policies = (state.alertPolicies || []).filter((p) => p.enabled);
  const smtp = sysSmtpReady(state);
  const alertsDone = channels.length > 0 && policies.length > 0;
  return [
    { key: 'members', label: '邀请成员', to: '/admin/users', done: others.length > 0, desc: others.length ? `已有 ${others.length} 位成员` : '把同事加进来，一起搭建和维护工作流' },
    { key: 'sso', label: '配置登录方式', to: '/admin/sso', done: ssoOn.length > 0, desc: ssoOn.length ? `已启用${ssoOn.join('、')}` : '现在只有邮箱和密码，可以对接飞书、企业微信、钉钉或 OIDC、SAML' },
    { key: 'backup', label: '备份计划已开启', to: '/admin/backup', done: Boolean(policy.enabled), warn: Boolean(policy.enabled && last && last.status !== 'success'), desc: policy.enabled ? `${policy.schedule}，保留 ${policy.keep} 份${last ? ` · 最近一次${last.status === 'success' ? '成功' : '失败'}（${fmt.relative(last.at)}）` : ''}` : '还没有开启自动备份，出问题时没有可以恢复的数据' },
    { key: 'alerts', label: '告警渠道已配置', to: '/issues/alerts', done: alertsDone, desc: alertsDone ? `${channels.length} 个渠道可用，${policies.length} 条告警策略在生效` : '配置飞书、企业微信、钉钉或 Webhook 渠道，出了问题及时通知值班的人' },
    { key: 'smtp', label: '邮件服务', to: '/admin/system?tab=services', done: smtp, desc: smtp ? '邮件通知和邀请邮件可以正常发送' : '没有配置 SMTP：邮件通知和邀请邮件不可用，其他功能不受影响' },
  ];
}

function TemplatesPage() {
  const state = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('全部');
  const [tab, setTab] = useState('rec');
  const [sort, setSort] = useState('hot');
  const [previewId, setPreviewId] = useState(null);
  const flow = useTemplateFlow();
  const tabOf = (t) => integTplTab(t, state.me);
  const count = (k) => state.templates.filter((t) => tabOf(t) === k).length;
  const cats = ['全部', ...new Set(state.templates.filter((t) => tabOf(t) === 'rec').map((t) => t.category))];
  const ql = q.trim().toLowerCase();
  const list = state.templates
    .filter((t) => tabOf(t) === tab)
    .filter((t) => (tab !== 'rec' || cat === '全部' || t.category === cat) && (!ql || `${t.name}${t.desc || ''}`.toLowerCase().includes(ql)))
    .sort((a, b) => (sort === 'hot' ? (b.uses || 0) - (a.uses || 0) : (b.createdAt || 0) - (a.createdAt || 0)));
  const featured = state.templates.filter((t) => t.featured && tabOf(t) === 'rec');
  const preview = previewId ? state.templates.find((t) => t.id === previewId) : null;
  const use = (t) => { setPreviewId(null); flow.start(t); };
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="模板中心" description="从常见的集成场景出发，一键生成工作流，再按自己的系统调整" />
    ${tab === 'rec' && !ql && cat === '全部' && featured.length > 0 && html`<div className="featured-row">
      ${featured.map((t) => html`<button key=${t.id} type="button" className="featured-card" onClick=${() => setPreviewId(t.id)}>
        <${IntegTemplateChain} tpl=${t} size=${34} />
        <div className="tpl-name">${t.name}</div>
        <div className="tpl-desc">${t.desc}</div>
        <span className="featured-badge">精选</span>
      </button>`)}
    </div>`}
    <div className="toolbar">
      <${Tabs} value=${tab} onChange=${(v) => { setTab(v); setCat('全部'); }} items=${[{ value: 'rec', label: '推荐' }, { value: 'mine', label: '我的模板', count: count('mine') }, { value: 'shared', label: '与我共享', count: count('shared') }]} />
      <span className="spacer" />
      <${Select} width=${110} value=${sort} onChange=${setSort} options=${[{ value: 'hot', label: '最热' }, { value: 'new', label: '最新' }]} />
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索模板名称或描述" />
    </div>
    ${tab === 'rec' && html`<div className="chip-row">${cats.map((c) => html`<button key=${c} type="button" aria-pressed=${cat === c} className=${cx('chip', cat === c && 'is-active')} onClick=${() => setCat(c)}>${c}</button>`)}</div>`}
    <div className="tpl-grid">${list.map((t) => html`<${TemplateCard} key=${t.id} tpl=${t} onClick=${() => setPreviewId(t.id)} />`)}</div>
    ${list.length === 0 && html`<${Empty}
      icon=${ql ? 'SearchX' : 'LayoutTemplate'}
      title=${ql ? '没有找到相关模板' : tab === 'mine' ? '还没有生成过模板' : tab === 'shared' ? '暂无与你共享的模板' : '这个分类下暂无模板'}
      description=${ql ? '换个关键词试试。' : tab === 'mine' ? '在工作流「···」菜单中点「生成模板」，就能把它变成可复用、可分享的模板。' : tab === 'shared' ? '同事分享到组织内的模板会出现在这里。' : ''}
    />`}
    <${Drawer} open=${Boolean(preview)} onClose=${() => setPreviewId(null)} title="模板详情" width=${560} footer=${preview && html`<${IntegTemplateActions} tpl=${preview} onUse=${() => use(preview)} />`}>
      ${preview && html`<${TemplatePreview} tpl=${preview} />`}
    <//>
    ${flow.modal}
  </div></div>`;
}

const HOME_SSO_NAMES = [['feishu', '飞书登录'], ['wecom', '企业微信登录'], ['dingtalk', '钉钉登录'], ['oidc', 'OIDC'], ['saml', 'SAML 2.0']];
