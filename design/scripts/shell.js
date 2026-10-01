const MODULES = [
  {
    key: 'integration', label: '业务集成', icon: 'Workflow', color: 'var(--primary)', desc: '搭建和运行工作流',
    items: [
      { to: '/', label: '首页', icon: 'House', match: (p) => p === '/' },
      { to: '/integration', label: '集成', icon: 'Workflow', match: (p) => p.startsWith('/integration') || p.startsWith('/projects'), tour: 'rail-integration' },
      { to: '/logs', label: '日志', icon: 'ScrollText', match: (p) => p.startsWith('/logs') },
      { to: '/issues', label: '问题', icon: 'Siren', match: (p) => p.startsWith('/issues'), badge: 'issues' },
      { to: '/connections', label: '连接', icon: 'Link2', match: (p) => p.startsWith('/connections') },
      { to: '/monitor', label: '监控', icon: 'Activity', match: (p) => p.startsWith('/monitor') },
      { to: '/templates', label: '模板', icon: 'LayoutTemplate', match: (p) => p.startsWith('/templates') },
      { to: '/solutions', label: '方案', icon: 'Package', match: (p) => p.startsWith('/solutions') },
    ],
  },
  {
    key: 'connector', label: '连接器', icon: 'Plug', color: 'var(--success)', desc: '浏览连接器，开发自己的连接器',
    items: [
      { to: '/connectors', label: '市场', icon: 'Store', match: (p) => p.startsWith('/connectors') },
      { to: '/devkit', label: '开发', icon: 'SquareCode', match: (p) => p.startsWith('/devkit') },
    ],
  },
  {
    key: 'mcp', label: 'MCP 服务', icon: 'Server', color: 'var(--info)', desc: '把连接器和工作流开放给 AI 助手',
    items: [
      { to: '/mcp', label: 'MCP', icon: 'Server', match: (p) => p.startsWith('/mcp') },
    ],
  },
  {
    key: 'admin', label: '管理后台', icon: 'Settings', color: 'var(--n-600)', desc: '成员、权限、安全与平台设置',
    items: [
      { to: '/admin', label: '设置', icon: 'Settings', match: (p) => p.startsWith('/admin') },
    ],
  },
];

const USER_ROLE_LABEL = { owner: '所有者', admin: '管理员', member: '成员' };

const NOTIFICATION_ICON = { alert: ['CircleX', 'var(--destructive)'], connection: ['Link2Off', 'var(--warning)'], member: ['UserPlus', 'var(--info)'], publish: ['CloudUpload', 'var(--primary)'], release: ['Rocket', 'var(--primary)'], issue: ['Siren', 'var(--destructive)'], approval: ['UserCheck', 'var(--warning)'], system: ['Server', 'var(--info)'] };

function moduleOf(path) {
  if (path.startsWith('/connectors') || path.startsWith('/devkit')) return MODULES[1];
  if (path.startsWith('/mcp')) return MODULES[2];
  if (path.startsWith('/admin')) return MODULES[3];
  return MODULES[0];
}

function BrandLogo({ size = 20 }) {
  const state = useStore();
  const logo = state.tenant.appearance.logo;
  return html`<img src=${logo || 'assets/logo.svg'} alt="" style=${{ width: size, height: size, objectFit: 'contain' }} />`;
}

function Rail({ path }) {
  const state = useStore();
  const mod = moduleOf(path);
  const me = state.users.find((u) => u.id === state.me);
  const unread = myNotifications(state).filter((n) => !n.read).length;
  const openIssues = useMemo(() => issuesCollect(state).filter((i) => i.status === 'open' && !(i.mutedUntil && i.mutedUntil > Date.now())).length, [state.runs, state.issueStates, state.privacy, state.members]);
  const badges = { issues: openIssues };
  const tenant = state.tenant;
  return html`<aside className="rail" aria-label="主导航">
    <${Tooltip} content=${tenant.appearance.productName} placement="right">
      <button type="button" className="rail-logo" aria-label=${`${tenant.appearance.productName} 首页`} onClick=${() => navigate('/')}><${BrandLogo} /></button>
    <//>
    <${Tooltip} content=${`搜索 ${shortcutLabel('mod+k')}`} placement="right">
      <button type="button" className="rail-item" aria-label="搜索" onClick=${() => searchBus.open()}><${Icon} name="Search" size=${18} /></button>
    <//>
    <div className="rail-sep" />
    <nav className="rail-nav">
      ${mod.items.map((it) => html`<button key=${it.to} type="button" data-tour=${it.tour} aria-current=${it.match(path) ? 'page' : undefined} aria-label=${it.badge && badges[it.badge] ? `${it.label}，${badges[it.badge]} 个未处理` : it.label} className=${cx('rail-item', 'has-label', it.match(path) && 'is-active')} onClick=${() => navigate(it.to)}>
        <${Icon} name=${it.icon} size=${18} />
        <span className="rail-label">${it.label}</span>
        ${it.badge && badges[it.badge] > 0 && html`<span className="rail-badge">${badges[it.badge] > 99 ? '99+' : badges[it.badge]}</span>`}
      </button>`)}
    </nav>
    <div className="rail-bottom">
      <${TutorialMenu} />
      <${Tooltip} content="帮助文档" placement="right">
        <button type="button" className="rail-item has-label" onClick=${() => helpBus.open()}><${Icon} name="BookOpen" size=${18} /><span className="rail-label">文档</span></button>
      <//>
      <${NotificationCenter} unread=${unread} />
      ${mod.key !== 'admin' && html`<${Tooltip} content="管理后台" placement="right">
        <button type="button" className="rail-item has-label" onClick=${() => navigate('/admin')}><${Icon} name="Settings" size=${18} /><span className="rail-label">设置</span></button>
      <//>`}
      <div className="rail-sep" />
      <${ModuleSwitcher} current=${mod} />
      ${me && html`<${UserMenu} me=${me} />`}
    </div>
  </aside>`;
}

function ModuleSwitcher({ current }) {
  return html`<${Popover}
    placement="right-end"
    width=${340}
    offset=${10}
    trigger=${html`<${Tooltip} content=${`切换模块 · 当前：${current.label}`} placement="right"><button type="button" className="rail-item rail-grid" aria-label="切换功能模块" style=${{ color: current.color }}><${Icon} name="LayoutGrid" size=${18} /></button><//>`}
  >
    ${({ close }) => html`<div className="modswitch">
      <div className="modswitch-title">切换功能模块</div>
      <div className="modswitch-grid">
        ${MODULES.map((m) => html`<button key=${m.key} type="button" className=${cx('modswitch-item', current.key === m.key && 'is-active')} onClick=${() => { close(); navigate(m.items[0].to === '/' ? '/integration' : m.items[0].to); }}>
          <span className="modswitch-icon" style=${{ background: m.color }}><${Icon} name=${m.icon} size=${20} /></span>
          <span className="modswitch-name">${m.label}</span>
          <span className="modswitch-desc">${m.desc}</span>
        </button>`)}
      </div>
    </div>`}
  <//>`;
}

function myNotifications(state) {
  return state.notifications.filter((n) => !n.userId || n.userId === state.me);
}

function NotificationCenter({ unread }) {
  const state = useStore();
  const [tab, setTab] = useState('all');
  const items = myNotifications(state).filter((n) => tab === 'all' || !n.read).sort((a, b) => b.time - a.time);
  return html`<${Popover}
    placement="right-end"
    width=${380}
    offset=${10}
    trigger=${html`<${Tooltip} content="通知" placement="right"><button type="button" className="rail-item has-label" aria-label=${unread ? `通知，${unread} 条未读` : '通知'}><${Icon} name="Bell" size=${18} /><span className="rail-label">通知</span>${unread > 0 && html`<span className="rail-badge">${unread > 99 ? '99+' : unread}</span>`}</button><//>`}
  >
    ${({ close }) => html`<div className="notif">
      <div className="notif-head">
        <b>通知中心</b>
        <span className="spacer" />
        <${Button} size="xs" variant="ghost" disabled=${!unread} onClick=${() => Store.set((s) => ({ ...s, notifications: s.notifications.map((n) => (!n.userId || n.userId === s.me ? { ...n, read: true } : n)) }))}>全部已读<//>
      </div>
      <div style=${{ padding: '0 12px' }}><${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'all', label: '全部' }, { value: 'unread', label: '未读', count: unread || undefined }]} /></div>
      <div className="notif-list">
        ${items.length === 0 && html`<${Empty} size="sm" icon="BellOff" title=${tab === 'unread' ? '没有未读通知' : '暂无通知'} />`}
        ${items.map((n) => {
          const [icon, color] = NOTIFICATION_ICON[n.type] || ['Bell', 'var(--muted-foreground)'];
          return html`<button key=${n.id} type="button" className=${cx('notif-item', !n.read && 'is-unread')} onClick=${() => { patchList('notifications', n.id, { read: true }); close(); if (n.to) navigate(n.to); }}>
            <span className="notif-icon" style=${{ color }}><${Icon} name=${icon} size=${16} /></span>
            <span className="grow">
              <span className="notif-title">${n.title}</span>
              <span className="notif-desc">${n.desc}</span>
              <span className="notif-time">${fmt.relative(n.time)}</span>
            </span>
            ${!n.read && html`<span className="notif-dot" aria-label="未读" />`}
          </button>`;
        })}
      </div>
    </div>`}
  <//>`;
}

function UserMenu({ me }) {
  const state = useStore();
  const setTheme = (t) => { Store.set((s) => ({ ...s, theme: t })); };
  return html`<${Popover}
    placement="right-end"
    width=${260}
    offset=${10}
    trigger=${html`<button type="button" className="rail-avatar" aria-label=${`账号：${me.name}`}><${Avatar} name=${me.name} size=${30} /></button>`}
  >
    ${({ close }) => html`<div className="usermenu">
      <div className="usermenu-head">
        <${Avatar} name=${me.name} size=${36} />
        <div className="grow" style=${{ minWidth: 0 }}><div style=${{ fontWeight: 600 }}>${me.name}</div><div className="text-xs muted ellipsis">${me.email}</div></div>
      </div>
      <div className="usermenu-tenant"><${Icon} name="Building2" size=${14} /><span className="grow ellipsis">${state.tenant.name}</span><${Tag} size="sm" tone=${me.role === 'member' ? 'default' : 'primary'}>${USER_ROLE_LABEL[me.role] || '成员'}<//></div>
      <${Menu} close=${close} items=${[
        { label: '个人设置', icon: 'UserRound', onClick: () => navigate('/account') },
        { divider: true },
        { group: '外观' },
        { label: '浅色', icon: 'Sun', active: state.theme === 'light', onClick: () => setTheme('light') },
        { label: '深色', icon: 'Moon', active: state.theme === 'dark', onClick: () => setTheme('dark') },
        { divider: true },
        { label: '重置演示数据', icon: 'RotateCcw', onClick: async () => { const ok = await confirmDialog({ title: '重置演示数据？', content: '你在原型里做的所有修改都会被清除，恢复到初始数据。', okText: '重置' }); if (ok) { Store.reset(seedState); toast.success('已重置演示数据'); navigate('/'); } } },
        { label: '退出登录', icon: 'LogOut', onClick: () => navigate('/login') },
      ]} />
    </div>`}
  <//>`;
}

function TutorialMenu() {
  return html`<${Popover}
    placement="right-end"
    width=${300}
    offset=${10}
    trigger=${html`<${Tooltip} content="教程" placement="right"><button type="button" className="rail-item has-label"><${Icon} name="GraduationCap" size=${18} /><span className="rail-label">教程</span></button><//>`}
  >
    ${({ close }) => html`<div style=${{ padding: 6 }}>
      <div className="menu-group">交互式教程</div>
      <${Menu} close=${close} items=${[
        { key: 'tour-console', label: '认识控制台', desc: '3 步了解首页、项目和最近访问', icon: 'Compass', onClick: () => { navigate('/'); setTimeout(() => tourBus.start('console'), 300); } },
        { key: 'tour-editor', label: '认识工作流编辑器', desc: '5 步掌握节点、连线取值、调试和发布', icon: 'MousePointerClick', onClick: () => { const s = Store.get(); const p = s.projects.find((x) => canEditProject(s, x.id) && s.workflows.some((w) => w.projectId === x.id)); const w = p && s.workflows.find((x) => x.projectId === p.id); if (!w) { toast.info('先在可编辑的项目里新建一个工作流'); return; } navigate(`/integration/${p.id}/wf/${w.id}?mode=edit`); setTimeout(() => tourBus.start('editor'), 500); } },
      ]} />
      <div className="menu-divider" />
      <div className="menu-group">快速入门</div>
      <${Menu} close=${close} items=${HELP_ARTICLES.slice(0, 3).map((a) => ({ key: a.id, label: a.title, icon: 'BookOpen', onClick: () => helpBus.open(a.id) }))} />
    </div>`}
  <//>`;
}

const searchBus = { listener: null, open: () => searchBus.listener && searchBus.listener(true) };

const SEARCH_PAGES = [
  { label: '运行日志', to: '/logs', icon: 'ScrollText' }, { label: '连接', to: '/connections', icon: 'Link2' }, { label: '运行监控', to: '/monitor', icon: 'Activity' },
  { label: '模板中心', to: '/templates', icon: 'LayoutTemplate' }, { label: '方案', to: '/solutions', icon: 'Package' }, { label: '连接器市场', to: '/connectors', icon: 'Store' }, { label: '连接器开发', to: '/devkit', icon: 'SquareCode' },
  { label: 'MCP 服务', to: '/mcp', icon: 'Server' }, { label: '全部项目', to: '/projects', icon: 'FolderKanban' }, { label: '个人设置', to: '/account', icon: 'UserRound' },
  { label: '问题中心', to: '/issues', icon: 'Siren' }, { label: '告警策略', to: '/issues/alerts', icon: 'BellRing' },
  { label: '用户管理', to: '/admin/users', icon: 'Users' }, { label: '审计日志', to: '/admin/audit', icon: 'FileClock' }, { label: '品牌外观', to: '/admin/branding', icon: 'Palette' },
  { label: '数据与隐私', to: '/admin/privacy', icon: 'ShieldCheck' }, { label: '系统与升级', to: '/admin/system', icon: 'CircleArrowUp' }, { label: '备份与恢复', to: '/admin/backup', icon: 'DatabaseBackup' },
  { label: '登录方式', to: '/admin/sso', icon: 'KeyRound' }, { label: '工作节点', to: '/admin/workers', icon: 'Server' },
];

function GlobalSearch() {
  const state = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  useEffect(() => {
    searchBus.listener = (v) => { setOpen(v); setQ(''); setActive(0); };
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && !e.isComposing && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setActive(0); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); searchBus.listener = null; };
  }, []);
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.cmdk-item.is-active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active, q]);
  const ql = q.trim().toLowerCase();
  const results = useMemo(() => {
    const has = (...parts) => !ql || parts.filter(Boolean).join(' ').toLowerCase().includes(ql);
    const projectName = (pid) => (state.projects.find((p) => p.id === pid) || {}).name;
    const connectors = [...CONNECTORS, ...publishedCustomConnectors(state)];
    return [
      { group: '工作流', items: state.workflows.filter((w) => has(w.name, w.description)).slice(0, 6).map((w) => ({ key: `wf-${w.id}`, label: w.name, sub: projectName(w.projectId), to: `/integration/${w.projectId}/wf/${w.id}`, node: html`<${WorkflowGlyph} wf=${w} size=${18} />` })) },
      { group: '项目', items: state.projects.filter((p) => has(p.name, p.description)).slice(0, 4).map((p) => ({ key: `p-${p.id}`, label: p.name, sub: p.description, to: `/integration/${p.id}`, node: html`<${ProjectAvatar} project=${p} size=${18} />` })) },
      { group: '连接', items: state.connections.filter((c) => has(c.name, c.account)).slice(0, 4).map((c) => ({ key: `c-${c.id}`, label: c.name, sub: c.account, to: `/connections?id=${c.id}`, node: html`<${ConnectorIcon} id=${c.connector} size=${18} />` })) },
      { group: '连接器', items: ql ? connectors.filter((c) => has(c.name, c.desc)).slice(0, 5).map((c) => ({ key: `cn-${c.id}`, label: c.name, sub: c.desc, to: `/connectors/${c.id}`, node: html`<${ConnectorIcon} connector=${c} size=${18} />` })) : [] },
      { group: 'MCP 服务', items: ql ? state.mcpServices.filter((m) => has(m.name, m.description, m.key)).slice(0, 4).map((m) => ({ key: `m-${m.id}`, label: m.name, sub: m.description, to: `/mcp/${m.id}`, node: html`<${Icon} name="Server" size=${16} className="muted" />` })) : [] },
      { group: '模板', items: ql ? state.templates.filter((t) => has(t.name, t.desc)).slice(0, 4).map((t) => ({ key: `t-${t.id}`, label: t.name, sub: t.category, to: '/templates', node: html`<${Icon} name="LayoutTemplate" size=${16} className="muted" />` })) : [] },
      { group: '数据存储', items: ql ? state.storages.filter((s) => has(s.name, s.description)).slice(0, 4).map((s) => ({ key: `s-${s.id}`, label: s.name, sub: projectName(s.projectId), to: `/integration/${s.projectId}/storage?id=${s.id}`, node: html`<${Icon} name="Database" size=${16} className="muted" />` })) : [] },
      { group: '问题', items: ql ? collectIssues(state).filter((i) => has(i.title, i.workflowName, i.nodeName)).slice(0, 4).map((i) => ({ key: `i-${i.sig}`, label: i.title, sub: i.workflowName, to: `/issues/${encodeURIComponent(i.sig)}`, node: html`<${Icon} name="Siren" size=${16} className="muted" />` })) : [] },
      { group: '映射表', items: ql ? (state.mappingTables || []).filter((t) => has(t.name, t.description)).slice(0, 4).map((t) => ({ key: `mt-${t.id}`, label: t.name, sub: projectName(t.projectId), to: `/integration/${t.projectId}/mappings?id=${t.id}`, node: html`<${Icon} name="TableProperties" size=${16} className="muted" />` })) : [] },
      { group: 'MCP 服务器', items: ql ? (state.mcpClients || []).filter((m) => has(m.name, m.description, m.url)).slice(0, 4).map((m) => ({ key: `mc-${m.id}`, label: m.name, sub: m.url, to: `/connectors/${m.id}`, node: html`<${Icon} name="Server" size=${16} className="muted" />` })) : [] },
      { group: '页面', items: SEARCH_PAGES.filter((p) => has(p.label)).map((p) => ({ ...p, key: `pg-${p.to}`, node: html`<${Icon} name=${p.icon} size=${16} className="muted" />` })) },
    ].filter((g) => g.items.length);
  }, [ql, state]);
  const flat = results.flatMap((g) => g.items);
  const go = (it) => { setOpen(false); navigate(it.to); };
  let idx = -1;
  return html`<${Modal} open=${open} onClose=${() => setOpen(false)} width=${600} className="cmdk" bodyClassName="cmdk-body">
    <div className="cmdk-input">
      <${Icon} name="Search" size=${18} className="muted" />
      <input
        autoFocus
        aria-label="全局搜索"
        value=${q}
        placeholder="搜索工作流、项目、连接、连接器、MCP 服务或页面"
        onChange=${(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown=${(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && flat[active]) go(flat[active]);
        }}
      />
      <${Kbd}>Esc<//>
    </div>
    <div className="cmdk-list" ref=${listRef} role="listbox">
      ${ql && html`<div className="cmdk-count">共 ${flat.length} 个搜索结果</div>`}
      ${results.map((g) => html`<div key=${g.group}>
        <div className="menu-group">${g.group}</div>
        ${g.items.map((it) => { idx += 1; const i = idx; return html`<button key=${it.key} type="button" role="option" aria-selected=${i === active} className=${cx('cmdk-item', i === active && 'is-active')} onMouseEnter=${() => setActive(i)} onClick=${() => go(it)}>
          ${it.node}<span className="cmdk-label">${it.label}</span>${it.sub && html`<span className="cmdk-sub">${it.sub}</span>`}
          ${i === active && html`<${Icon} name="CornerDownLeft" size=${14} className="muted" />`}
        </button>`; })}
      </div>`)}
      ${flat.length === 0 && html`<${Empty} size="sm" icon="SearchX" title="没有找到相关结果" />`}
    </div>
  <//>`;
}

const TOURS = {
  console: [
    { sel: '[data-tour="rail-integration"]', title: '业务集成', desc: '所有工作流都放在项目里。项目之间权限和数据互相隔离，适合按业务线或团队划分。' },
    { sel: '[data-tour="home-start"]', title: '从这里开始', desc: '新建一个项目，再在项目里新建工作流；也可以直接从模板新建。' },
    { sel: '[data-tour="home-recent"]', title: '最近访问', desc: '最近打开过的工作流和数据存储会出现在这里，点击即可回到上次的位置。' },
  ],
  editor: [
    { sel: '[data-tour="toolbar"]', title: '左侧工具条', desc: '打开连接器面板拖入节点，查看调试记录、校验结果、项目配置和数据存储。' },
    { sel: '.flow-add', title: '添加节点', desc: '点击连线上的 + 选择逻辑、助手、应用或 AI 节点；也可以从连接器面板拖到这里。' },
    { sel: '.fnode', title: '配置节点', desc: '点击节点，在右侧面板里选择操作、连接，填写入参。入参左侧的圆圈可以拖到上游节点，直接取它的出参。' },
    { sel: '[data-tour="debug"]', title: '调试', desc: '填一段触发器出参后开始调试，每个节点的 Input、Output、Error 都会记录下来。' },
    { sel: '.wf-top-actions .btn-primary', title: '完成与发布', desc: '编辑内容会自动保存。点「完成」回到查看态，再点「发布」让新版本开始运行。' },
  ],
};

const tourBus = { listener: null, start: (name) => tourBus.listener && tourBus.listener(name) };

function tourSteps(name) {
  return (TOURS[name] || []).filter((s) => {
    const el = document.querySelector(s.sel);
    return el && el.getBoundingClientRect().width > 0;
  });
}

function TourHost() {
  const [tour, setTour] = useState(null);
  const [steps, setSteps] = useState([]);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);
  useEffect(() => {
    tourBus.listener = (name) => {
      const list = tourSteps(name);
      if (!list.length) { toast.info('当前页面没有可以演示的内容'); return; }
      setSteps(list);
      setStep(0);
      setTour(name);
    };
    return () => { tourBus.listener = null; };
  }, []);
  useLayoutEffect(() => {
    if (!tour) return undefined;
    const update = () => {
      const s = steps[step];
      const el = s && document.querySelector(s.sel);
      if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const t = setTimeout(update, 120);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [tour, step]);
  useLayer(Boolean(tour), () => setTour(null));
  if (!tour || !steps[step]) return null;
  const s = steps[step];
  const pad = 6;
  const cardW = 320;
  const cardH = cardRef.current ? cardRef.current.offsetHeight : 170;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : { left: vw / 2, top: vh / 2, width: 0, height: 0 };
  let cardLeft = vw / 2 - cardW / 2;
  let cardTop = vh / 2 - cardH / 2;
  if (rect) {
    if (rect.right + 16 + cardW < vw - 8) { cardLeft = rect.right + 16; cardTop = rect.top; }
    else if (rect.left - 16 - cardW > 8) { cardLeft = rect.left - 16 - cardW; cardTop = rect.top; }
    else if (rect.bottom + 16 + cardH < vh - 8) { cardLeft = rect.left; cardTop = rect.bottom + 16; }
    else { cardLeft = rect.left; cardTop = rect.top - 16 - cardH; }
    cardLeft = Math.max(8, Math.min(cardLeft, vw - cardW - 8));
    cardTop = Math.max(8, Math.min(cardTop, vh - cardH - 8));
  }
  return html`<${Portal}>
    <div className="tour-mask" onMouseDown=${(e) => e.stopPropagation()} />
    <div className="tour-hole" style=${hole} />
    <div ref=${cardRef} className="tour-card" role="dialog" aria-label=${s.title} style=${{ left: cardLeft, top: cardTop, width: cardW }}>
      <div className="tour-step">${step + 1} / ${steps.length}</div>
      <div className="tour-title">${s.title}</div>
      <div className="tour-desc">${s.desc}</div>
      <div className="row">
        <${Button} size="sm" variant="ghost" onClick=${() => setTour(null)}>退出教程<//>
        <span className="spacer" />
        ${step > 0 && html`<${Button} size="sm" onClick=${() => setStep(step - 1)}>上一步<//>`}
        ${step < steps.length - 1
          ? html`<${Button} size="sm" variant="primary" onClick=${() => setStep(step + 1)}>下一步<//>`
          : html`<${Button} size="sm" variant="primary" onClick=${() => { setTour(null); toast.success('教程完成'); }}>完成<//>`}
      </div>
    </div>
  <//>`;
}

const HELP_ARTICLES = [
  {
    id: 'quickstart', title: '5 分钟搭建第一个工作流', icon: 'Rocket',
    body: [
      '在左侧导航进入「集成」，选择一个你有编辑权限的项目，点击「新建」→「工作流」。',
      '选择触发器：定时任务、Webhook、表单、子流程，或者某个应用的触发事件（例如飞书审批通过）。',
      '点击连线上的 +，添加逻辑、助手、应用或 AI 节点。应用节点需要在「连接」页签选择一个可用连接。',
      '在「入参」页签填写参数，输入 $ 或点击右侧 {} 可以引用上游节点的出参和项目配置。',
      '点击右上角「调试」，填写一段触发器出参后运行一次，逐个检查节点的 Input、Output 和 Error。',
      '点击「完成」回到查看态，再点击「发布」。只有生产环境的项目发布即启用；开启了测试与生产环境的项目先发布到测试，验证后再推广到生产。',
    ],
  },
  {
    id: 'references', title: '在入参中引用上游数据', icon: 'Braces',
    body: [
      '入参里输入 $ 或 {{ 会弹出变量选择器，按节点展开出参结构，点击字段即可插入。',
      '也可以按住参数左侧的圆圈，拖到画布中高亮的上游节点，在弹出的出参树里选择字段。',
      '只能引用上游节点。分支之间不能互相取值；分支、循环结束后，后续节点只能引用分支或循环节点本身。',
      '循环体内的节点可以引用「循环变量」：item 表示当前项，index 表示当前下标。',
      '引用项目配置时使用 config.配置项，运行时按所在环境取值，测试环境和生产环境可以不同。',
      '引用失效（节点被删除、移出上游）时，胶囊会显示为「已失效的引用」，校验面板会给出错误。',
    ],
  },
  {
    id: 'errors', title: '错误处理与重试', icon: 'ShieldAlert',
    body: [
      '每个应用、脚本、AI 和 JSON 节点都可以在「错误处理」页签设置默认处理策略：终止、忽略、添加分支，或先重试再执行这三种之一。',
      '自定义策略按错误码匹配，从上往下命中第一条即停止，例如限流（429）时重试、参数错误（400）时终止。',
      '选择「添加分支」后，画布上该节点下方会出现「异常处理」分支。出错时运行分支里的节点，处理完后继续运行后面的节点。',
      '「一键应用」可以把当前策略复制给同一连接器同一操作的其他节点。',
      '失败的运行可以「从失败节点重跑」，前面成功的节点沿用原结果，不会重复开通账号或重复写入；也可以「整体重跑」。一批失败可以在问题中心里批量重跑。',
      '触发器的「运行设置」可以开启幂等去重：同一个事件在时间窗口内只处理一次，重复的记为「已去重」。',
    ],
  },
  {
    id: 'config', title: '项目配置与环境', icon: 'SlidersHorizontal',
    body: [
      '项目配置用来保存工作流共用的值，例如群 ID、阈值、回调地址，工作流里通过 config.配置项 引用。',
      '项目默认只有生产环境。需要严格管控的项目可以在「环境与配置」里开启测试与生产环境：配置项在两个环境里可以取不同的值，测试环境还可以用「连接替换」换成测试账号。',
      '开启后，发布先到测试环境，验证后申请「推广到生产」，生产环境可以要求审批；出问题时在「版本管理」里回滚到任意历史版本。调试时可以选择用哪个环境的值和连接。',
    ],
  },
  {
    id: 'mapping', title: '字段映射与映射表', icon: 'ArrowLeftRight',
    body: [
      '写入多维表格、CRM、ERP 这类有固定字段的系统时，入参可以切换到「映射」：按目标字段逐个选择来源，目标字段带类型和必填标记。',
      '转换按顺序执行，例如去空格、转数字、日期格式、默认值、查映射表，每一步的中间结果都能在预览里看到。',
      '来源是列表时打开「逐项映射」，用「当前项」的字段生成明细行，例如把采购明细写成金蝶单据的明细行。',
      '常用的对照关系（部门名称到部门编码）存成项目里的「映射表」，多个工作流共用；找不到对应值时可以报错、用默认值或原样输出。',
      '「AI 自动映射」按字段名和样例数据给出建议和置信度，需要逐条确认，低置信度的建议默认不勾选。',
    ],
  },
  {
    id: 'issues', title: '问题中心与告警', icon: 'Siren',
    body: [
      '同一个工作流、同一个节点、同一个错误码的失败合并成一个「问题」；连接认证失败按连接合并，不管影响了几个工作流。',
      '问题有状态和负责人。已解决的问题再次出现会自动重新打开，标记为「复发」。',
      '问题详情给出 AI 根因分析和可以直接执行的修复，修好后对受影响的运行「从失败节点批量重跑」。',
      '告警策略决定什么时候通知谁：聚合窗口内同一个问题只通知一次，可以设置静默时段和升级规则。通知渠道支持飞书、企业微信、钉钉、Slack、邮件和 Webhook。',
    ],
  },
  {
    id: 'ai', title: 'AI 助手与智能体', icon: 'Sparkles',
    body: [
      '在首页或项目里「用 AI 生成」：描述要自动化的事情，AI 给出步骤、需要的连接和待确认的问题，确认后生成草稿，生成的节点标记为「待确认」。',
      '编辑器右上角的「AI 助手」可以解释工作流、诊断最近一次失败、按描述修改工作流；修改先列成变更清单，确认后才应用。',
      '「AI 智能体」节点在护栏内自主调用工具：连接器操作、外部 MCP 工具和子流程都可以作为工具，写入类工具建议开启人工确认，并限制最大步数和 Token 预算。',
      '所有 AI 调用都计入 AI 用量，可以在「运行监控」里按模型、工作流和来源查看。',
    ],
  },
  {
    id: 'connections', title: '连接与权限', icon: 'Link2',
    body: [
      '连接保存访问某个应用的账号和授权信息，可以设置为全部项目可用，或只在指定项目可用。',
      '连接可以分享给其他成员，权限分为「可使用」（只能在节点里选用）和「可编辑」（可以修改和重新授权）。',
      '授权过期或异常时，使用该连接的节点会出现警告，运行会失败。到「连接」页面重新授权即可恢复。',
    ],
  },
  {
    id: 'shortcuts', title: '编辑器快捷键', icon: 'Keyboard',
    body: [
      `${shortcutLabel('mod+z')} 撤销，${shortcutLabel('mod+shift+z')} 重做。`,
      `${shortcutLabel('mod+c')} 复制节点，${shortcutLabel('mod+x')} 剪切节点，${shortcutLabel('mod+v')} 粘贴到选中节点下方（选中触发器时粘贴到第一个位置）。`,
      `${shortcutLabel('delete')} 删除选中的节点，Esc 取消选中或关闭面板。`,
      `${shortcutLabel('mod+k')} 打开全局搜索。按住 ${IS_MAC ? '⌘' : 'Ctrl'} 滚动鼠标滚轮可以缩放画布。`,
    ],
  },
];

const helpBus = { listener: null, open: (id) => helpBus.listener && helpBus.listener(id || 'home') };

function HelpCenter() {
  const [open, setOpen] = useState(false);
  const [article, setArticle] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    helpBus.listener = (id) => { setOpen(true); setQ(''); setArticle(HELP_ARTICLES.find((a) => a.id === id) || null); };
    return () => { helpBus.listener = null; };
  }, []);
  const ql = q.trim().toLowerCase();
  const list = HELP_ARTICLES.filter((a) => !ql || `${a.title}${a.body.join('')}`.toLowerCase().includes(ql));
  return html`<${Drawer} open=${open} onClose=${() => setOpen(false)} title=${article ? article.title : '帮助文档'} subtitle=${article ? '帮助文档' : ''} width=${480} icon=${article && html`<${IconButton} icon="ArrowLeft" size="sm" title="返回文档列表" onClick=${() => setArticle(null)} />`}>
    ${article
      ? html`<ol className="help-steps">${article.body.map((p, i) => html`<li key=${i}>${p}</li>`)}</ol>`
      : html`<${Fragment}>
        <${Input} icon="Search" placeholder="搜索文档" value=${q} onChange=${setQ} allowClear autoFocus />
        <div className="help-list">
          ${list.map((a) => html`<button key=${a.id} type="button" className="help-item" onClick=${() => setArticle(a)}>
            <span className="help-item-icon"><${Icon} name=${a.icon} size=${16} /></span>
            <span className="grow"><span className="help-item-title">${a.title}</span><span className="help-item-desc">${a.body[0]}</span></span>
            <${Icon} name="ChevronRight" size=${14} className="muted" />
          </button>`)}
          ${list.length === 0 && html`<${Empty} size="sm" icon="SearchX" title="没有找到相关文档" />`}
        </div>
      <//>`}
  <//>`;
}
