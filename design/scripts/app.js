function RouteRedirect({ to }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

const ROUTES = [
  { path: '/', title: '首页', render: () => html`<${HomePage} />` },
  { path: '/integration', title: '业务集成', render: () => { const p = currentProject(Store.get()); return html`<${RouteRedirect} to=${p ? `/integration/${p.id}` : '/projects'} />`; } },
  { path: '/integration/:pid', title: '项目概览', render: ({ pid }) => html`<${IntegrationLayout} pid=${pid}><${ProjectPage} pid=${pid} /><//>` },
  { path: '/integration/:pid/config', title: '项目配置', render: ({ pid }) => html`<${IntegrationLayout} pid=${pid}><${ProjectConfigPage} pid=${pid} /><//>` },
  { path: '/integration/:pid/storage', title: '数据存储', render: ({ pid }) => html`<${IntegrationLayout} pid=${pid}><${DataStoragePage} pid=${pid} /><//>` },
  { path: '/integration/:pid/mappings', title: '映射表', render: ({ pid }) => html`<${IntegrationLayout} pid=${pid}><${MappingTablesPage} pid=${pid} /><//>` },
  { path: '/integration/:pid/releases', title: '发布与审批', render: ({ pid }) => html`<${IntegrationLayout} pid=${pid}><${ReleasesPage} pid=${pid} /><//>` },
  { path: '/integration/:pid/releases/:rid', title: '发布详情', render: ({ pid, rid }) => html`<${IntegrationLayout} pid=${pid}><${ReleaseDetailPage} key=${rid} pid=${pid} rid=${rid} /><//>` },
  { path: '/integration/:pid/wf/:wid', title: '工作流', render: ({ pid, wid }, q) => html`<${IntegrationLayout} pid=${pid}><${WorkflowPage} pid=${pid} wid=${wid} mode=${q.mode} action=${q.action} node=${q.node} tab=${q.tab} /><//>` },
  { path: '/integration/:pid/wf/:wid/v/:ver', title: '版本快照', render: ({ pid, wid, ver }) => html`<${IntegrationLayout} pid=${pid}><${WorkflowPage} pid=${pid} wid=${wid} snapshot=${ver} /><//>` },
  { path: '/projects', title: '全部项目', render: () => html`<${AllProjectsPage} />` },
  { path: '/logs', title: '运行日志', render: () => html`<${LogsPage} />` },
  { path: '/issues', title: '问题中心', render: () => html`<${IssuesPage} />` },
  { path: '/issues/alerts', title: '告警策略', render: () => html`<${AlertPoliciesPage} />` },
  { path: '/issues/:sig', title: '问题详情', render: ({ sig }) => html`<${IssueDetailPage} key=${sig} sig=${sig} />` },
  { path: '/connections', title: '连接', render: () => html`<${ConnectionsPage} />` },
  { path: '/monitor', title: '运行监控', render: () => html`<${MonitorPage} />` },
  { path: '/templates', title: '模板中心', render: () => html`<${TemplatesPage} />` },
  { path: '/solutions', title: '方案', render: (_, q) => html`<${SolutionsPage} query=${q} />` },
  { path: '/solutions/:id', title: '方案详情', render: ({ id }) => html`<${SolutionDetailPage} key=${id} id=${id} />` },
  { path: '/solutions/:id/install', title: '安装方案', render: ({ id }, q) => html`<${SolutionInstallPage} key=${id} id=${id} query=${q} />` },
  { path: '/connectors', title: '连接器市场', render: () => html`<${ConnectorsPage} />` },
  { path: '/connectors/:id', title: '连接器', render: ({ id }) => html`<${ConnectorDetailPage} key=${id} id=${id} />` },
  { path: '/devkit', title: '连接器开发', render: () => html`<${DevkitListPage} />` },
  { path: '/devkit/:id/:section', title: '连接器开发', render: ({ id, section }) => html`<${DevkitLayout} key=${id} id=${id} section=${section} />` },
  { path: '/devkit/:id/:section/:sub', title: '连接器开发', render: ({ id, section, sub }) => html`<${DevkitLayout} key=${id} id=${id} section=${section} sub=${sub} />` },
  { path: '/mcp', title: 'MCP 服务', render: () => html`<${McpListPage} />` },
  { path: '/mcp/:id', title: 'MCP 服务', render: ({ id }) => html`<${McpDetailPage} key=${id} id=${id} />` },
  { path: '/admin', title: '管理后台', render: () => html`<${AdminLayout} section="users" />` },
  { path: '/admin/:section', title: '管理后台', render: ({ section }) => html`<${AdminLayout} section=${section} />` },
  { path: '/account', title: '个人设置', render: () => html`<${AccountPage} />` },
  { path: '/login', title: '登录', render: () => html`<${LoginPage} />` },
  { path: '/setup', title: '安装向导', render: () => html`<${SetupWizard} />` },
];

function resolveRoute(path) {
  for (const r of ROUTES) {
    const params = matchRoute(r.path, path);
    if (params) return { route: r, params };
  }
  return null;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) {
      if (this.props.silent) return null;
      return html`<${Empty} icon="Bug" title="这个页面出错了" description=${String(this.state.error.message || this.state.error)} action=${html`<${Button} onClick=${() => { this.setState({ error: null }); navigate('/'); }}>回到首页<//>`} />`;
    }
    return this.props.children;
  }
}

function brandParse(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function brandLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function brandContrast(a, b) {
  const [hi, lo] = [brandLuminance(a), brandLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function brandTowards(rgb, target, ratio, background) {
  const steps = Array.from({ length: 21 }, (_, i) => i / 20);
  return steps.map((t) => rgb.map((v, i) => v + (target[i] - v) * t)).find((c) => brandContrast(c, background) >= ratio) || target;
}

function brandHex(rgb) {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function brandTokens(hex, dark) {
  const rgb = brandParse(hex);
  if (!rgb) return null;
  const surface = dark ? [23, 23, 23] : [255, 255, 255];
  const edge = dark ? [255, 255, 255] : [0, 0, 0];
  const base = brandTowards(rgb, edge, 3, surface);
  const text = brandTowards(rgb, edge, 4.5, surface);
  return { '--primary': brandHex(base), '--primary-text': brandHex(text), '--primary-foreground': brandContrast(base, [255, 255, 255]) >= 3 ? '#ffffff' : '#171717' };
}

const brandColor = { parse: brandParse, contrast: brandContrast, tokens: brandTokens };

const BRAND_VARS = ['--primary', '--primary-text', '--primary-foreground'];

function App() {
  const state = useStore();
  const route = useRoute();
  const color = state.tenant.appearance.primaryColor;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);
  useEffect(() => {
    const root = document.documentElement.style;
    const tokens = color ? brandColor.tokens(color, state.theme === 'dark') : null;
    BRAND_VARS.forEach((k) => root.removeProperty(k));
    if (tokens) Object.entries(tokens).forEach(([k, v]) => root.setProperty(k, v));
  }, [color, state.theme]);
  const logo = state.tenant.appearance.logo;
  useEffect(() => {
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = logo || 'assets/logo.svg';
  }, [logo]);
  const hit = resolveRoute(route.path);
  useEffect(() => {
    document.title = `${hit ? hit.route.title : '页面不存在'} · ${state.tenant.appearance.productName}`;
  }, [route.path, state.tenant.appearance.productName]);
  if (route.path === '/login' || route.path === '/setup') {
    return html`<${Fragment}>
      <${ErrorBoundary} resetKey=${route.path}>${route.path === '/login' ? html`<${LoginPage} />` : html`<${SetupWizard} />`}<//>
      <${ToastHost} />
      <${ConfirmHost} />
    <//>`;
  }
  const full = route.path.startsWith('/devkit/') && route.path.endsWith('/publish');
  return html`<div className="shell">
    ${!full && html`<${ErrorBoundary} silent resetKey=${route.path}><${Rail} path=${route.path} /><//>`}
    <main className=${cx('main', full && 'is-full')}>
      <${ErrorBoundary} resetKey=${route.path}>
        ${hit ? hit.route.render(hit.params, route.query) : html`<${Empty} icon="MapPinOff" title="页面不存在" description="链接可能已经失效。" action=${html`<${Button} onClick=${() => navigate('/')}>回到首页<//>`} />`}
      <//>
    </main>
    <${ErrorBoundary} silent><${GlobalSearch} /><//>
    <${ToastHost} />
    <${ConfirmHost} />
    <${ErrorBoundary} silent resetKey=${route.path}><${TourHost} /><//>
    <${ErrorBoundary} silent><${HelpCenter} /><//>
    <${ErrorBoundary} silent><${AiGenerateHost} /><//>
  </div>`;
}

Store.init(seedState);
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
