const NAV_ITEMS = [
  { to: '/', icon: 'LayoutDashboard', label: '首页', match: (p) => p === '/' },
  { to: '/projects', icon: 'FolderKanban', label: '集成', match: (p) => p.startsWith('/projects') || p.startsWith('/workflows') || p === '/new' },
  { to: '/issues', icon: 'Siren', label: '问题', match: (p) => p.startsWith('/issues'), badge: true },
  { to: '/records', icon: 'UserSearch', label: '查人', match: (p) => p.startsWith('/records') },
  { to: '/connections', icon: 'Cable', label: '连接', match: (p) => p.startsWith('/connections') },
  { to: '/connectors', icon: 'Blocks', label: '连接器', match: (p) => p.startsWith('/connectors') },
];

const THEME_KEY = 'fema-v3-theme';

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

applyTheme(safeStorage.get(THEME_KEY));

function Rail({ onSearch }) {
  const route = useRoute();
  const s = useStore();
  const open = openIssues(s);
  const high = open.filter((i) => i.severity === 'high').length;
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    safeStorage.set(THEME_KEY, next);
    applyTheme(next);
    setDark(!dark);
  };
  const reset = async () => {
    const ok = await confirmDialog({ title: '重置演示数据？', content: '你在原型里做的修复、重放、补齐都会清掉，回到初始状态。', okText: '重置' });
    if (!ok) return;
    Store.reset(seedState);
    navigate('/');
    toast.success('已重置演示数据');
  };
  return html`<nav className="rail" aria-label="主导航">
    <${Link} to="/" className="rail-logo" title="集成平台"><img src="../assets/logo.svg" alt="" /><//>
    <div className="rail-nav">
      ${NAV_ITEMS.map((item) => html`<${Link}
        key=${item.to}
        to=${item.to}
        className=${cx('rail-item has-label', item.match(route.path) && 'is-active')}
        aria-current=${item.match(route.path) ? 'page' : undefined}
      >
        <${Icon} name=${item.icon} size=${18} />
        <span className="rail-label">${item.label}</span>
        ${item.badge && open.length > 0 && html`<span className=${cx('rail-badge', !high && 'is-muted')}>${open.length}</span>`}
      <//>`)}
    </div>
    <div className="rail-bottom">
      <${Tooltip} content="按工号、姓名、手机号查人（⌘K）" placement="right">
        <button type="button" className="rail-item" onClick=${onSearch} aria-label="搜索"><${Icon} name="Search" size=${18} /></button>
      <//>
      <${Link} to="/guide" className=${cx('rail-item has-label', route.path === '/guide' && 'is-active')}>
        <${Icon} name="BookOpen" size=${18} /><span className="rail-label">导览</span>
      <//>
      <${Dropdown}
        placement="right-end"
        width=${220}
        trigger=${html`<button type="button" className="rail-avatar" aria-label="个人菜单"><${Avatar} name=${s.me.name} size=${30} /></button>`}
        items=${[
          { group: `${s.me.name} · ${s.me.role} · 本周值班` },
          { label: dark ? '浅色模式' : '深色模式', icon: dark ? 'Sun' : 'Moon', onClick: toggleTheme },
          { label: '第二版原型（全部页面）', icon: 'ExternalLink', onClick: () => { window.location.href = '../index.html'; } },
          { divider: true },
          { label: '重置演示数据', icon: 'RotateCcw', onClick: reset, danger: true },
        ]}
      />
    </div>
  </nav>`;
}

function SearchPalette({ open, onClose }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  useEffect(() => { if (open) { setQ(''); setFocus(0); } }, [open]);
  const text = q.trim();
  const people = text ? searchPeople(s, text).slice(0, 6) : s.people.filter((p) => ['E10231', 'E10087', 'E10235', 'E09961'].includes(p.key));
  const issues = text ? s.issues.filter((i) => i.id.toLowerCase().includes(text.toLowerCase()) || issueTitle(s, i).includes(text)).slice(0, 4) : [];
  const workflows = text ? s.workflows.filter((w) => w.name.includes(text)).slice(0, 3) : [];
  const items = [
    ...people.map((p) => ({ key: `p-${p.key}`, icon: 'User', title: html`${p.name} <span className="mono muted">${p.key}</span>`, sub: `${getProject(s, p.projectId).name} · 北森${p.beisen.status} · ${p.beisen.dept}`, to: `/records/${p.key}` })),
    ...issues.map((i) => ({ key: `i-${i.id}`, icon: 'Siren', title: `${i.id} ${issueTitle(s, i)}`, sub: i.status === 'open' ? '未解决' : '已解决', to: `/issues/${i.id}` })),
    ...workflows.map((w) => ({ key: `w-${w.id}`, icon: 'Workflow', title: w.name, sub: getProject(s, w.projectId).name, to: `/workflows/${w.id}` })),
  ];
  const go = (item) => { onClose(); navigate(item.to); };
  return html`<${Modal} open=${open} onClose=${onClose} width=${560} className="palette">
    <div className="palette-input">
      <${Icon} name="Search" size=${18} className="muted" />
      <input
        autoFocus
        value=${q}
        placeholder="工号、姓名、手机号后四位，或问题编号"
        onChange=${(e) => { setQ(e.target.value); setFocus(0); }}
        onKeyDown=${(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(items.length - 1, f + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
          if (e.key === 'Enter' && items[focus]) go(items[focus]);
        }}
      />
      <${Kbd}>Esc<//>
    </div>
    <div className="palette-list">
      ${!text && html`<div className="palette-group">值班常查的人</div>`}
      ${items.length === 0 && html`<${Empty} size="sm" icon="SearchX" title="没有找到" description="试试工号（例如 E10231）或者姓名" />`}
      ${items.map((item, i) => html`<button key=${item.key} type="button" className=${cx('palette-item', i === focus && 'is-focus')} onMouseEnter=${() => setFocus(i)} onClick=${() => go(item)}>
        <${Icon} name=${item.icon} size=${16} />
        <span className="palette-item-body"><span className="palette-item-title">${item.title}</span><span className="palette-item-sub">${item.sub}</span></span>
        <${Icon} name="CornerDownLeft" size=${14} className="palette-enter" />
      </button>`)}
    </div>
  <//>`;
}

function Shell({ children, routeKey }) {
  const [search, setSearch] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`<div className="shell">
    <${Rail} onSearch=${() => setSearch(true)} />
    <main className="main"><div className="page" key=${routeKey}>${children}</div></main>
    <${SearchPalette} open=${search} onClose=${() => setSearch(false)} />
    <${ToastHost} />
    <${ConfirmHost} />
  </div>`;
}
