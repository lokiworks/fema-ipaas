const ADMIN_NAV = [
  { group: '成员与权限', items: [['users', 'Users', '用户管理'], ['requests', 'Inbox', '权限申请审核'], ['perm', 'ShieldQuestion', '权限高级设置']] },
  { group: '资源', items: [['resources', 'Boxes', '集成资源管理'], ['projects', 'FolderKanban', '项目与上限']] },
  { group: '用量', items: [['usage', 'Gauge', '用量与上限']] },
  { group: '安全', items: [['sso', 'LogIn', '登录与安全'], ['privacy', 'ShieldCheck', '数据与隐私'], ['audit', 'FileClock', '审计日志'], ['encryption', 'LockKeyhole', '数据加密']] },
  { group: '平台', items: [['system', 'CircleArrowUp', '系统与升级'], ['backup', 'DatabaseBackup', '备份与恢复'], ['workers', 'Cpu', '工作节点'], ['health', 'HeartPulse', '健康状态'], ['branding', 'Palette', '品牌外观']] },
];

const ADMIN_LIMITS = { runsPerMonth: 10000000, projectWorkflows: 1000, concurrentRuns: 100 };

const ADMIN_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

const ADMIN_RESOURCE_TYPES = [
  { key: 'workflows', label: '工作流' },
  { key: 'connections', label: '连接' },
  { key: 'mcpServices', label: 'MCP 服务' },
  { key: 'customConnectors', label: '自定义连接器' },
  { key: 'projects', label: '项目' },
  { key: 'storages', label: '数据存储' },
];

const ADMIN_SSO_KEYS = ['password', 'oidc', 'saml', 'feishu', 'wecom', 'dingtalk'];

const ADMIN_SSO_META = {
  password: { name: '邮箱和密码', desc: '适合没有统一身份源的小团队', icon: 'Mail' },
  oidc: { name: 'OIDC', desc: '对接 Okta、Azure AD、Keycloak 等身份源', icon: 'KeySquare' },
  saml: { name: 'SAML 2.0', desc: '对接支持 SAML 的企业身份源', icon: 'ShieldCheck' },
  feishu: { name: '飞书登录', desc: '成员用飞书扫码或在飞书客户端内免登', connector: 'feishu' },
  wecom: { name: '企业微信登录', desc: '成员用企业微信扫码或在企业微信内免登', connector: 'wecom' },
  dingtalk: { name: '钉钉登录', desc: '成员用钉钉扫码或在钉钉内免登', connector: 'dingtalk' },
};

const ADMIN_LOGIN_LABELS = { oidc: '使用企业 SSO 登录（OIDC）', saml: '使用企业 SSO 登录（SAML）', feishu: '使用飞书登录', wecom: '使用企业微信登录', dingtalk: '使用钉钉登录' };

const ADMIN_IM = [['feishu', '飞书'], ['wecom', '企业微信'], ['dingtalk', '钉钉']];

function adminSecret(prefix, length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = window.crypto && window.crypto.getRandomValues
    ? Array.from(window.crypto.getRandomValues(new Uint8Array(length)))
    : Array.from({ length }, () => Math.floor(Math.random() * 256));
  return `${prefix}${bytes.map((b) => chars[b % chars.length]).join('')}`;
}

function adminDomains(text) {
  return String(text || '').split(/[\s,，、;；]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function adminCjk(...parts) {
  return parts.reduce((acc, part) => {
    const text = String(part);
    const gap = (/[A-Za-z0-9]$/.test(acc) && /^[\u4e00-\u9fa5]/.test(text)) || (/[\u4e00-\u9fa5]$/.test(acc) && /^[A-Za-z0-9]/.test(text));
    return `${acc}${gap ? ' ' : ''}${text}`;
  }, '');
}

function adminImEnabled(sso) {
  return ADMIN_IM.filter(([k]) => sso[k] && sso[k].enabled && sso[k].configured).map(([key, label]) => ({ key, label }));
}

function adminJoin(list) {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join('、')}和${list[list.length - 1]}`;
}

function adminRelative(ts, fallback = '从未') {
  return ts ? fmt.relative(ts) : fallback;
}

function adminModuleLabel(key) {
  const m = MODULE_PERMS.find((x) => x.value === key);
  return m ? m.label : key;
}

function adminAdmins(state) {
  return state.users.filter((u) => ['owner', 'admin'].includes(u.role) && u.status === 'active').sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
}

function adminMonthRange(now) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { start, days, month: d.getMonth() + 1, elapsed: Math.max(1, Math.ceil((now - start) / DAY)) };
}

function adminMonthRuns(state) {
  const { start } = adminMonthRange(Date.now());
  return state.runs.filter((r) => r.startedAt >= start && r.kind !== 'debug');
}

function adminShares(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 1000);
  const floors = raw.map((v) => Math.floor(v));
  const left = 1000 - floors.reduce((a, b) => a + b, 0);
  const bonus = new Set(raw.map((v, i) => [v - floors[i], i]).sort((x, y) => y[0] - x[0]).slice(0, left).map(([, i]) => i));
  return floors.map((v, i) => (v + (bonus.has(i) ? 1 : 0)) / 10);
}

function adminVersionCmp(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function adminLatestVersion(workers) {
  return workers.reduce((best, w) => (!best || adminVersionCmp(w.version, best) > 0 ? w.version : best), null) || '1.0.0';
}

function adminContrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (l + 0.05);
}

function adminColorError(value) {
  if (value === null) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return '请输入 #RRGGBB 格式的颜色，例如 #2563EB';
  const ratio = adminContrast(value);
  if (ratio < 3) return `颜色太浅，在白色背景上看不清（对比度 ${ratio.toFixed(2)}:1，至少需要 3:1）`;
  return null;
}

function adminOwned(state, userId) {
  return ADMIN_RESOURCE_TYPES.map((t) => ({ ...t, items: (state[t.key] || []).filter((x) => x.owner === userId) })).filter((g) => g.items.length);
}

function adminTransfer(s, refs, to) {
  const idsOf = (key) => new Set(refs.filter((r) => r.key === key).map((r) => r.id));
  const move = (key, fn) => {
    const pick = idsOf(key);
    return pick.size ? s[key].map((x) => (pick.has(x.id) ? fn(x) : x)) : s[key];
  };
  const projIds = idsOf('projects');
  const prevOwner = Object.fromEntries(s.projects.filter((p) => projIds.has(p.id)).map((p) => [p.id, p.owner]));
  const kept = s.members.map((m) => {
    if (!projIds.has(m.projectId)) return m;
    if (m.userId === to) return { ...m, role: 'owner' };
    if (m.userId === prevOwner[m.projectId]) return { ...m, role: 'editor' };
    return m;
  });
  const added = [...projIds].filter((pid) => !s.members.some((m) => m.projectId === pid && m.userId === to)).map((pid) => ({ projectId: pid, userId: to, role: 'owner', joinedAt: Date.now() }));
  return {
    ...s,
    workflows: move('workflows', (x) => ({ ...x, owner: to })),
    connections: move('connections', (x) => ({ ...x, owner: to, shares: (x.shares || []).filter((sh) => sh.userId !== to) })),
    mcpServices: move('mcpServices', (x) => ({ ...x, owner: to })),
    customConnectors: move('customConnectors', (x) => ({ ...x, owner: to, developers: [...new Set([to, ...(x.developers || [])])] })),
    storages: move('storages', (x) => ({ ...x, owner: to })),
    projects: move('projects', (x) => ({ ...x, owner: to })),
    members: [...kept, ...added],
  };
}

function adminRemoveUser(s, userId, to) {
  const refs = adminOwned(s, userId).flatMap((g) => g.items.map((x) => ({ key: g.key, id: x.id })));
  const moved = to && refs.length ? adminTransfer(s, refs, to) : s;
  const ps = moved.permSettings || {};
  const alert = moved.usageAlert || {};
  return {
    ...moved,
    users: moved.users.filter((u) => u.id !== userId),
    members: moved.members.filter((m) => m.userId !== userId),
    connections: moved.connections.map((c) => ((c.shares || []).some((x) => x.userId === userId) ? { ...c, shares: c.shares.filter((x) => x.userId !== userId) } : c)),
    customConnectors: moved.customConnectors.map((c) => ((c.developers || []).includes(userId) ? { ...c, developers: c.developers.filter((d) => d !== userId) } : c)),
    permissionRequests: moved.permissionRequests.filter((r) => !(r.userId === userId && r.status === 'pending')),
    permSettings: ps.person === userId ? { ...ps, person: null, tip: ps.tip === 'person' ? 'admins' : ps.tip } : moved.permSettings,
    usageAlert: (alert.receivers || []).includes(userId) ? { ...alert, receivers: alert.receivers.filter((x) => x !== userId) } : moved.usageAlert,
  };
}

function AdminSaveBar({ dirty, valid = true, onCancel, onSave, saveText = '保存' }) {
  return html`<div className="admin-save-bar">
    ${dirty && html`<span className="text-xs muted">有未保存的修改</span>`}
    <span className="spacer" />
    <${Button} disabled=${!dirty} onClick=${onCancel}>取消<//>
    <${Button} variant="primary" disabled=${!dirty || !valid} onClick=${onSave}>${saveText}<//>
  </div>`;
}

function AdminLayout({ section }) {
  const state = useStore();
  const pending = state.permissionRequests.filter((r) => r.status === 'pending').length;
  const sys = sysOf(state);
  const newest = [...sys.backups].sort((a, b) => b.at - a.at)[0];
  const badges = {
    requests: pending > 0 ? ['is-danger', pending] : null,
    system: sysUpdateView(sys).release ? ['is-update', '新版本'] : null,
    backup: newest && newest.status === 'failed' ? ['is-danger', '失败'] : null,
  };
  const pages = {
    users: AdminUsers, requests: AdminRequests, perm: AdminPermSettings, resources: AdminResources, projects: AdminProjects,
    usage: AdminUsage, sso: AdminSso, privacy: AdminPrivacy, audit: AdminAudit, encryption: AdminEncryption, system: AdminSystem, backup: AdminBackup,
    branding: AdminBranding, workers: AdminWorkers, health: AdminHealth,
  };
  const current = section || 'users';
  const Page = pages[current] || null;
  return html`<div className="split">
    <aside className="psidebar">
      <div className="psidebar-top">
        <div className="psidebar-caption"><span>管理后台</span></div>
        <div className="pswitch admin-tenant"><span className="avatar is-square admin-tenant-icon"><${Icon} name="Building2" size=${16} /></span><span className="pswitch-name">${state.tenant.name}</span></div>
      </div>
      <nav className="psidebar-res admin-nav">
        ${ADMIN_NAV.map((g) => html`<div key=${g.group}>
          <div className="menu-group admin-nav-group">${g.group}</div>
          ${g.items.map(([k, ic, label]) => html`<${Link} key=${k} to=${`/admin/${k}`} className=${cx('psidebar-link', 'is-inset', current === k && 'is-active')}><${Icon} name=${ic} size=${16} /><span className="grow">${label}</span>${badges[k] && html`<span className=${cx('side-badge', badges[k][0])}>${badges[k][1]}</span>`}<//>`)}
        </div>`)}
      </nav>
    </aside>
    <div className="split-main">${Page ? html`<${Page} />` : html`<div className="page"><${Empty} icon="MapPinOff" title="页面不存在" description="管理后台里没有这个页面，链接可能已经失效。" action=${html`<${Button} onClick=${() => navigate('/admin/users')}>回到用户管理<//>`} /></div>`}</div>
  </div>`;
}

function AdminUsers() {
  const state = useStore();
  const [q, setQ] = useState('');
  const [ext, setExt] = useState('all');
  const [status, setStatus] = useState(null);
  const [modal, setModal] = useState(null);
  const ql = q.trim().toLowerCase();
  const list = state.users.filter((u) => (ext === 'all' || u.external) && (!status || u.status === status) && (!ql || `${u.name}${u.email}${u.dept}`.toLowerCase().includes(ql)));
  const toggle = async (u) => {
    const dis = u.status !== 'disabled';
    const owned = adminOwned(state, u.id).reduce((a, g) => a + g.items.length, 0);
    const ok = await confirmDialog({
      title: dis ? `禁用 ${u.name}？` : `启用 ${u.name}？`,
      content: dis ? `禁用后该用户无法登录。${owned ? `名下 ${owned} 个资源会继续运行，可以在「集成资源管理」中转移给其他人。` : ''}` : '启用后该用户可以重新登录。',
      okText: dis ? '禁用' : '启用',
      danger: dis,
    });
    if (!ok) return;
    patchList('users', u.id, { status: dis ? 'disabled' : (u.lastActiveAt ? 'active' : 'invited') });
    if (dis) Store.set((s) => ({ ...s, editLocks: Object.fromEntries(Object.entries(s.editLocks || {}).filter(([, l]) => l.userId !== u.id)) }));
    addAudit(dis ? '禁用用户' : '启用用户', u.name);
    toast.success(dis ? '已禁用' : '已启用');
  };
  const moduleCell = (u) => {
    const extra = (u.modules || []).filter((m) => m !== 'integration');
    if (!extra.length) return html`<span className="muted">仅业务集成</span>`;
    const more = extra.slice(2);
    return html`<span className="admin-tags">${extra.slice(0, 2).map((m) => html`<${Tag} key=${m} size="sm">${adminModuleLabel(m)}<//>`)}${more.length > 0 && html`<${Tooltip} content=${extra.map(adminModuleLabel).join('、')}><${Tag} size="sm" tone="outline">+${more.length}<//><//>`}</span>`;
  };
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="用户管理" description="为成员分配功能模块权限。业务集成是默认权限，不能取消。" actions=${html`<${Button} variant="primary" icon="UserPlus" onClick=${() => setModal({ type: 'add' })}>添加用户<//>`} />
    <div className="toolbar">
      <${Segmented} value=${ext} onChange=${setExt} options=${[{ value: 'all', label: '全部用户' }, { value: 'ext', label: '仅外部用户' }]} />
      <${Select} width=${130} clearable value=${status} onChange=${setStatus} placeholder="用户状态" options=${[{ value: 'active', label: '正常' }, { value: 'invited', label: '待激活' }, { value: 'disabled', label: '已禁用' }]} />
      <span className="spacer" />
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索姓名、邮箱或部门" />
    </div>
    <${Table}
      columns=${[
        { key: 'u', title: '用户', render: (u) => html`<div className="cell-main"><${Avatar} name=${u.name} size=${30} /><div className="admin-cell-text is-user"><div className="cell-title row-4">${u.name}${u.id === state.me && html`<${Tag} size="sm" tone="primary">我<//>`}${u.external && html`<${Tag} size="sm" tone="warning">外部<//>`}</div><div className="cell-sub">${u.email} · ${u.dept || '未分配部门'}</div></div></div>` },
        { key: 's', title: '用户状态', width: 88, render: (u) => html`<span className="row-4"><${Dot} tone=${u.status === 'active' ? 'success' : u.status === 'invited' ? 'warning' : 'default'} />${u.status === 'active' ? '正常' : u.status === 'invited' ? '待激活' : '已禁用'}</span>` },
        { key: 'r', title: '平台角色', width: 84, render: (u) => (u.role === 'owner' ? html`<${Tag} size="sm" tone="primary">所有者<//>` : u.role === 'admin' ? html`<${Tag} size="sm" tone="info">管理员<//>` : html`<span className="muted">成员</span>`) },
        { key: 'm', title: '模块权限', width: 200, render: moduleCell },
        { key: 'a', title: '最近活跃', width: 92, render: (u) => html`<span className="muted">${adminRelative(u.lastActiveAt, '从未登录')}</span>` },
        { key: 'o', title: '操作', width: 132, render: (u) => (u.role === 'owner' || u.id === state.me
          ? html`<${Tooltip} content="所有者和你自己的账号不能在这里修改"><span className="muted">-</span><//>`
          : html`<span className="row admin-actions">
            <a className="link" onClick=${() => setModal({ type: 'edit', user: u })}>编辑</a>
            <a className="link" onClick=${() => toggle(u)}>${u.status === 'disabled' ? '启用' : '禁用'}</a>
            <${MoreMenu} width=${150} items=${[
              { label: '重置密码', icon: 'KeyRound', disabled: !state.sso.password.enabled || u.status !== 'active', desc: !state.sso.password.enabled ? '未启用邮箱和密码登录' : u.status !== 'active' ? '只能重置正常用户' : '', onClick: () => setModal({ type: 'password', user: u }) },
              { divider: true },
              { label: '移除此用户', icon: 'UserMinus', danger: true, onClick: () => setModal({ type: 'remove', user: u }) },
            ]} />
          </span>`) },
      ]}
      data=${list}
      empty=${html`<${Empty} size="sm" icon="SearchX" title="没有符合条件的用户" description=${ql || status || ext !== 'all' ? '换个关键词或清除筛选条件试试。' : null} />`}
    />
    ${modal && modal.type === 'add' && html`<${AdminUserAddModal} onClose=${() => setModal(null)} />`}
    ${modal && modal.type === 'edit' && html`<${AdminUserEditModal} key=${modal.user.id} user=${modal.user} onClose=${() => setModal(null)} />`}
    ${modal && modal.type === 'remove' && html`<${AdminUserRemoveModal} key=${modal.user.id} user=${modal.user} onClose=${() => setModal(null)} />`}
    ${modal && modal.type === 'password' && html`<${AdminResetPasswordModal} key=${modal.user.id} user=${modal.user} onClose=${() => setModal(null)} />`}
  </div></div>`;
}

function AdminModuleChecks({ value, onChange }) {
  return html`<div className="col admin-module-checks">${MODULE_PERMS.map((m) => html`<${Checkbox}
    key=${m.value}
    label=${html`<span>${m.label}${m.fixed && html`<span className="muted text-xs">（默认拥有）</span>`}</span>`}
    checked=${m.fixed || value.includes(m.value)}
    disabled=${m.fixed}
    onChange=${(v) => onChange(v ? [...value, m.value] : value.filter((x) => x !== m.value))}
  />`)}</div>`;
}

function AdminUserAddModal({ onClose }) {
  const state = useStore();
  const [rows, setRows] = useState(() => [{ id: uid('r'), name: '', email: '', dept: '' }]);
  const [touched, setTouched] = useState({});
  const [mods, setMods] = useState(['integration']);
  const [notify, setNotify] = useState(true);
  const domains = adminDomains(state.sso.policy && state.sso.policy.domains);
  const me = state.users.find((u) => u.id === state.me);
  const home = domains[0] || (me ? me.email.split('@')[1] : '');
  const ims = adminImEnabled(state.sso);
  const channel = sysSmtpReady(state) ? '邮件' : ims.length ? ims[0].label : null;
  const rowErrors = rows.map((r) => {
    const email = r.email.trim().toLowerCase();
    const name = r.name.trim();
    return {
      name: !name ? '请输入姓名' : name.length > 20 ? '不能超过 20 个字' : null,
      email: !email ? '请输入邮箱'
        : !ADMIN_EMAIL_RE.test(email) ? '邮箱格式不正确'
          : state.users.some((u) => u.email.toLowerCase() === email) ? '这个邮箱已经是平台用户'
            : rows.some((x) => x.id !== r.id && x.email.trim().toLowerCase() === email) ? '和上面的邮箱重复'
              : domains.length && !domains.includes(email.split('@')[1]) ? '邮箱域名不在「登录与安全」允许的域名中'
                : null,
    };
  });
  const valid = rowErrors.every((e) => !e.name && !e.email);
  const setRow = (id, k, v) => { setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r))); setTouched((t) => ({ ...t, [`${id}.${k}`]: true })); };
  const blur = (id, k) => setTouched((t) => ({ ...t, [`${id}.${k}`]: true }));
  const save = () => {
    const now = Date.now();
    const created = rows.map((r, i) => {
      const email = r.email.trim().toLowerCase();
      return { id: uid('u'), name: r.name.trim(), email, dept: r.dept.trim(), title: '', role: 'member', status: 'invited', external: email.split('@')[1] !== home, modules: [...new Set(['integration', ...mods])], lastActiveAt: null, createdAt: now + i };
    });
    Store.set((s) => ({ ...s, users: [...s.users, ...created] }));
    addAudit('添加用户', created.map((u) => u.name).join('、'));
    onClose();
    toast.success(`已添加 ${created.length} 位用户${channel && notify ? `，已通过${channel}发送邀请` : ''}`);
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="添加用户" description="一次最多添加 10 人，对方激活账号后即可登录" width=${680} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>添加 ${rows.length} 位用户<//><//>`}>
    <div className="admin-add-grid admin-add-head"><span>姓名<span className="field-required">*</span></span><span>邮箱<span className="field-required">*</span></span><span>部门</span><span /></div>
    ${rows.map((r, i) => {
      const e = rowErrors[i];
      const show = (k) => (touched[`${r.id}.${k}`] ? e[k] : null);
      return html`<div key=${r.id} className="admin-add-grid">
        <div><${Input} value=${r.name} onChange=${(v) => setRow(r.id, 'name', v)} onBlur=${() => blur(r.id, 'name')} placeholder="姓名" invalid=${Boolean(show('name'))} autoFocus=${i === 0} />${show('name') && html`<div className="field-error">${show('name')}</div>`}</div>
        <div><${Input} value=${r.email} onChange=${(v) => setRow(r.id, 'email', v.trim())} onBlur=${() => blur(r.id, 'email')} placeholder=${home ? `name@${home}` : 'name@example.com'} invalid=${Boolean(show('email'))} />${show('email') && html`<div className="field-error">${show('email')}</div>`}</div>
        <div><${Input} value=${r.dept} onChange=${(v) => setRow(r.id, 'dept', v.slice(0, 20))} placeholder="可选" /></div>
        <${IconButton} icon="X" size="sm" title="移除这一行" disabled=${rows.length === 1} onClick=${() => setRows(rows.filter((x) => x.id !== r.id))} />
      </div>`;
    })}
    <div className="admin-add-more"><${Button} size="sm" variant="dashed" icon="Plus" disabled=${rows.length >= 10} onClick=${() => setRows([...rows, { id: uid('r'), name: '', email: '', dept: '' }])}>${rows.length >= 10 ? '一次最多添加 10 人' : '再添加一位'}<//></div>
    <${Field} label="分配功能模块权限"><${AdminModuleChecks} value=${mods} onChange=${setMods} /><//>
    ${channel
      ? html`<${Checkbox} label=${`通过${channel}发送邀请通知`} checked=${notify} onChange=${setNotify} />`
      : html`<div className="text-xs muted">没有可用的通知渠道（邮件服务未配置，飞书、企业微信和钉钉登录也都未启用），添加后请把登录地址 https://${state.tenant.domain} 发给对方。</div>`}
  <//>`;
}

function AdminUserEditModal({ user, onClose }) {
  const [mods, setMods] = useState(() => [...new Set(['integration', ...(user.modules || [])])]);
  const dirty = JSON.stringify([...mods].sort()) !== JSON.stringify([...new Set(['integration', ...(user.modules || [])])].sort());
  const save = () => {
    patchList('users', user.id, { modules: mods });
    addAudit('修改用户模块权限', `${user.name}：${mods.map(adminModuleLabel).join('、')}`);
    toast.success('已保存，权限立即生效');
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${`编辑 ${user.name}`} description=${user.email} width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!dirty} onClick=${save}>保存<//><//>`}>
    <${Field} label="功能模块权限"><${AdminModuleChecks} value=${mods} onChange=${setMods} /><//>
  <//>`;
}

function AdminUserRemoveModal({ user, onClose }) {
  const state = useStore();
  const [to, setTo] = useState(null);
  const owned = adminOwned(state, user.id);
  const total = owned.reduce((a, g) => a + g.items.length, 0);
  const memberships = state.members.filter((m) => m.userId === user.id).length;
  const candidates = state.users.filter((u) => u.id !== user.id && u.status === 'active');
  const remove = () => {
    Store.set((s) => adminRemoveUser(s, user.id, to));
    addAudit('移除用户', total ? `${user.name}（${total} 个资源转移给 ${personName(to)}）` : user.name);
    toast.success(total ? `已移除 ${user.name}，${total} 个资源已转移给 ${personName(to)}` : `已移除 ${user.name}`);
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${`移除 ${user.name}？`} description=${user.email} width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="danger" disabled=${total > 0 && !to} onClick=${remove}>移除<//><//>`}>
    ${total > 0
      ? html`<${Fragment}>
        <div className="admin-notice"><${Alert} tone="warning" title=${`${user.name} 名下还有 ${total} 个资源`}>移除前需要把它们转移给其他成员，转移后工作流和连接会继续正常运行。<//></div>
        <div className="admin-owned">
          ${owned.map((g) => html`<div key=${g.key} className="admin-owned-row"><span className="admin-owned-type">${g.label}</span><span className="grow admin-owned-names">${g.items.slice(0, 3).map((x) => x.name).join('、')}${g.items.length > 3 ? ` 等 ${g.items.length} 个` : ''}</span><b>${g.items.length}</b></div>`)}
        </div>
        <${Field} label="把以上资源转移给" required>
          <${Select} searchable value=${to} onChange=${setTo} placeholder="选择接收人" options=${candidates.map((u) => ({ value: u.id, label: u.name, desc: u.email, iconNode: html`<${Avatar} name=${u.name} size=${20} />` }))} />
        <//>
      <//>`
      : html`<div className="text-xs muted admin-remove-tip">${user.name} 名下没有工作流、连接、MCP 服务、自定义连接器、项目或数据存储，可以直接移除。</div>`}
    <div className="text-xs muted">${memberships ? `移除后，${user.name} 会从 ${memberships} 个项目中移出，分享给他的连接也会取消分享。` : '移除后该用户无法再登录。'}</div>
  <//>`;
}

function AdminResetPasswordModal({ user, onClose }) {
  const [temp, setTemp] = useState(null);
  const reset = () => {
    const pwd = adminSecret('', 12);
    patchList('users', user.id, { passwordResetAt: Date.now() });
    addAudit('重置密码', user.name);
    setTemp(pwd);
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${`重置 ${user.name} 的密码`} width=${480} footer=${temp ? html`<${Button} variant="primary" onClick=${onClose}>完成<//>` : html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" onClick=${reset}>生成临时密码<//><//>`}>
    ${temp
      ? html`<${Fragment}>
        <div className="admin-notice"><${Alert} tone="success" title="临时密码只显示这一次">请通过安全的渠道发给 ${user.name}，对方用它登录后需要立即设置新密码。<//></div>
        <div className="webhook-url"><span className="url">${temp}</span><${CopyButton} text=${temp} /></div>
      <//>`
      : html`<div className="text-xs muted">重置后，${user.name} 的旧密码立即失效，已登录的会话也会退出。平台会生成一个临时密码，由你转交给对方。</div>`}
  <//>`;
}

function AdminRequests() {
  const state = useStore();
  const [filter, setFilter] = useState('pending');
  const ps = state.permSettings || {};
  const inFeishu = ps.review === 'feishu';
  const list = state.permissionRequests.filter((r) => filter === 'all' || r.status === 'pending').sort((a, b) => b.time - a.time);
  const pendingCount = state.permissionRequests.filter((r) => r.status === 'pending').length;
  const decide = async (r, status) => {
    const who = personName(r.userId);
    const label = adminModuleLabel(r.module);
    if (status === 'rejected' && !(await confirmDialog({ title: `拒绝 ${who} 的申请？`, content: `${who} 将不能访问「${label}」，之后可以重新提交申请。`, okText: '拒绝', danger: true }))) return;
    Store.set((s) => ({
      ...s,
      permissionRequests: s.permissionRequests.map((x) => (x.id === r.id ? { ...x, status, decidedBy: s.me, decidedAt: Date.now() } : x)),
      users: status === 'approved' ? s.users.map((u) => (u.id === r.userId ? { ...u, modules: [...new Set([...(u.modules || []), r.module])] } : u)) : s.users,
      notifications: [{ id: uid('nt'), type: 'member', title: status === 'approved' ? `你申请的「${label}」已通过` : `你申请的「${label}」被拒绝了`, desc: status === 'approved' ? `${personName(s.me)} 已同意，现在可以使用` : `${personName(s.me)} 拒绝了申请，可以补充理由后重新提交`, time: Date.now(), read: false, to: '/', userId: r.userId }, ...(s.notifications || [])],
    }));
    addAudit(status === 'approved' ? '同意权限申请' : '拒绝权限申请', `${who} · ${label}`);
    toast.success(status === 'approved' ? `已同意，${who} 现在可以使用「${label}」` : '已拒绝');
  };
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="权限申请审核" description="成员访问没有权限的模块时可以提交申请，审核方式在「权限高级设置」中配置" />
    ${!ps.allowRequest && html`<div className="admin-notice"><${Alert} tone="info">已关闭平台功能权限申请，成员不能提交新的申请。可以在「权限高级设置」中重新开启。<//></div>`}
    ${inFeishu && html`<div className="admin-notice"><${Alert} tone="info">审核方式是「在飞书审批中审核」，请在飞书审批里处理申请，这里只展示记录。<//></div>`}
    <div className="toolbar">
      <${Segmented} value=${filter} onChange=${setFilter} options=${[{ value: 'pending', label: `待审核（${pendingCount}）` }, { value: 'all', label: '全部申请' }]} />
    </div>
    <${Table}
      columns=${[
        { key: 'u', title: '申请人', width: 180, render: (r) => { const u = state.users.find((x) => x.id === r.userId); return html`<div className="cell-main"><${Avatar} name=${personName(r.userId)} size=${28} /><div className="admin-cell-text"><div className="cell-title">${personName(r.userId)}</div><div className="cell-sub">${u ? u.dept : '账号已移除'}</div></div></div>`; } },
        { key: 'm', title: '申请模块', width: 110, render: (r) => html`<${Tag}>${adminModuleLabel(r.module)}<//>` },
        { key: 'why', title: '申请理由', wrap: true, render: (r) => html`<span className="muted">${r.reason || '未填写'}</span>` },
        { key: 't', title: '申请时间', width: 140, render: (r) => fmt.dateTime(r.time).slice(0, 16) },
        { key: 's', title: '状态', width: 150, render: (r) => html`<div><${Tag} size="sm" tone=${r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'default'}>${r.status === 'pending' ? '待审核' : r.status === 'approved' ? '已同意' : '已拒绝'}<//>${r.decidedBy && html`<div className="cell-sub">${personName(r.decidedBy)} · ${fmt.short(r.decidedAt)}</div>`}</div>` },
        { key: 'o', title: '操作', width: 110, render: (r) => {
          if (r.status !== 'pending') return html`<span className="muted">-</span>`;
          if (!state.users.some((u) => u.id === r.userId)) return html`<span className="muted">用户已移除</span>`;
          if (inFeishu) return html`<span className="muted">在飞书中审核</span>`;
          return html`<span className="row admin-actions"><a className="link" onClick=${() => decide(r, 'approved')}>同意</a><a className="link is-danger" onClick=${() => decide(r, 'rejected')}>拒绝</a></span>`;
        } },
      ]}
      data=${list}
      empty=${html`<${Empty} size="sm" icon="Inbox" title=${filter === 'pending' ? '没有待审核的申请' : '还没有权限申请'} />`}
    />
  </div></div>`;
}

function PermDeniedPreview({ settings }) {
  const state = useStore();
  const admins = adminAdmins(state).slice(0, 2).map((u) => u.name);
  return html`<div className="perm-preview">
    <${Icon} name="Lock" size=${28} className="muted" />
    <b>你没有「连接器开发」的访问权限</b>
    ${settings.tip === 'admins' && html`<div className="text-xs muted">请联系管理员：${admins.join('、') || '暂无管理员'}</div>`}
    ${settings.tip === 'person' && html`<div className="text-xs muted">请联系：${settings.person ? personName(settings.person) : '未选择'}</div>`}
    ${settings.tip === 'url' && (settings.url ? html`<a className="link text-xs" href=${settings.url} target="_blank" rel="noopener noreferrer">查看权限说明</a>` : html`<span className="text-xs muted">未填写网址</span>`)}
    ${settings.tip === 'apply' && html`<${Fragment}>
      <span className="admin-mock-btn">申请权限</span>
      ${settings.notice && html`<div className="text-xs muted admin-preview-notice">${settings.notice}</div>`}
    <//>`}
  </div>`;
}

function AdminPermSettings() {
  const state = useStore();
  const saved = { tip: 'admins', person: null, url: '', allowRequest: true, review: 'platform', notice: '', rulesUrl: '', ...(state.permSettings || {}) };
  const [d, setD] = useState(saved);
  const set = (patch) => setD({ ...d, ...patch });
  const urlOk = (v) => /^https?:\/\/\S+\.\S+/.test(String(v || '').trim());
  const errors = {
    person: d.tip === 'person' && !d.person ? '请选择要显示的人员' : null,
    url: d.tip === 'url' && !urlOk(d.url) ? '请输入以 http:// 或 https:// 开头的网址' : null,
    tip: d.tip === 'apply' && !d.allowRequest ? '已关闭权限申请，不能显示申请入口' : null,
    rulesUrl: d.rulesUrl && !urlOk(d.rulesUrl) ? '请输入以 http:// 或 https:// 开头的网址' : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const feishuReady = state.sso.feishu.configured;
  const admins = adminAdmins(state).slice(0, 2).map((u) => u.name).join('、');
  const save = () => {
    const next = { ...d, url: String(d.url || '').trim(), rulesUrl: String(d.rulesUrl || '').trim() };
    Store.set((s) => ({ ...s, permSettings: next }));
    setD(next);
    addAudit('修改权限设置', '权限高级设置');
    toast.success('已保存');
  };
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="权限高级设置" description="成员访问没有权限的模块时看到的提示，以及权限申请的审核方式" />
    <div className="perm-layout">
      <div>
        <${Card} title="无权限提示设置" subtitle="成员访问没有权限的模块时看到什么">
          <${RadioGroup} direction="column" value=${d.tip} onChange=${(v) => set({ tip: v })} options=${[
            { value: 'admins', label: `显示最近活跃的 2 位管理员（${admins || '暂无'}）` },
            { value: 'person', label: '显示指定人员' },
            { value: 'url', label: '显示网址' },
            { value: 'apply', label: '显示权限申请入口' },
          ]} />
          ${d.tip === 'person' && html`<div className="admin-sub-field"><${Field} label="指定人员" required error=${errors.person}><${Select} searchable value=${d.person} onChange=${(v) => set({ person: v })} placeholder="选择成员" options=${state.users.filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name, desc: u.email }))} /><//></div>`}
          ${d.tip === 'url' && html`<div className="admin-sub-field"><${Field} label="网址" required error=${errors.url}><${Input} value=${d.url} onChange=${(v) => set({ url: v })} placeholder="https://" invalid=${Boolean(errors.url)} /><//></div>`}
          ${errors.tip && html`<div className="field-error">${errors.tip}</div>`}
        <//>
        <div className="admin-gap" />
        <${Card} title="平台功能权限申请" subtitle="允许成员在平台内申请连接器开发、MCP 服务等模块权限" extra=${html`<${Switch} checked=${d.allowRequest} onChange=${(v) => set({ allowRequest: v })} />`}>
          ${d.allowRequest ? html`<${Fragment}>
            <${Field} label="审核方式">
              <${RadioGroup} value=${d.review} onChange=${(v) => set({ review: v })} options=${[{ value: 'platform', label: '在平台中审核' }, { value: 'feishu', label: '在飞书审批中审核', disabled: !feishuReady }]} />
              ${!feishuReady && html`<div className="field-hint">飞书登录还没有配置，暂时不能在飞书审批中审核。</div>`}
            <//>
            <${Field} label="审核公告" hint="显示在成员提交申请的弹窗里"><${CharTextarea} rows=${3} max=${200} value=${d.notice} onChange=${(v) => set({ notice: v })} placeholder="例如：申请需要部门负责人同意，通常 1 个工作日内处理" /><//>
            <${Field} label="审核规则地址" error=${errors.rulesUrl}><${Input} value=${d.rulesUrl} onChange=${(v) => set({ rulesUrl: v })} placeholder="https://" invalid=${Boolean(errors.rulesUrl)} /><//>
          <//>` : html`<div className="text-xs muted">关闭后，成员不能在平台内申请权限，只能联系管理员分配。</div>`}
        <//>
        <${AdminSaveBar} dirty=${dirty} valid=${valid} onCancel=${() => setD(saved)} onSave=${save} />
      </div>
      <div>
        <div className="text-xs muted admin-preview-label">页面示意</div>
        <${PermDeniedPreview} settings=${d} />
      </div>
    </div>
  </div></div>`;
}

function AdminResources() {
  const state = useStore();
  const [type, setType] = useState(null);
  const [owner, setOwner] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [transfer, setTransfer] = useState(null);
  const projName = (pid) => (state.projects.find((p) => p.id === pid) || {}).name || '已删除的项目';
  const all = [
    ...state.workflows.map((w) => ({ id: w.id, name: w.name, type: 'workflows', where: projName(w.projectId), owner: w.owner, updatedAt: w.updatedAt })),
    ...state.connections.map((c) => ({ id: c.id, name: c.name, type: 'connections', where: c.scope === 'tenant' ? '全部项目' : (c.projectIds || []).map(projName).join('、') || '-', owner: c.owner, updatedAt: c.updatedAt })),
    ...state.customConnectors.map((c) => ({ id: c.id, name: c.name, type: 'customConnectors', where: '企业内', owner: c.owner, updatedAt: c.updatedAt })),
    ...state.mcpServices.filter((s) => s.owner).map((s) => ({ id: s.id, name: s.name, type: 'mcpServices', where: '企业内', owner: s.owner, updatedAt: s.updatedAt })),
    ...state.projects.map((p) => ({ id: p.id, name: p.name, type: 'projects', where: '-', owner: p.owner, updatedAt: p.createdAt })),
    ...state.storages.map((s) => ({ id: s.id, name: s.name, type: 'storages', where: projName(s.projectId), owner: s.owner, updatedAt: s.createdAt })),
  ].map((r) => ({ ...r, rid: `${r.type}:${r.id}`, key: r.type }));
  const ql = q.trim().toLowerCase();
  const rows = all.filter((r) => (!type || r.type === type) && (!owner || r.owner === owner) && (!ql || r.name.toLowerCase().includes(ql)));
  const visiblePicked = picked.filter((id) => rows.some((r) => r.rid === id));
  const ownerOptions = [
    ...state.users.map((u) => ({ value: u.id, label: u.name, desc: u.status === 'disabled' ? '已禁用' : u.status === 'invited' ? '待激活' : '' })),
    ...[...new Set(all.map((r) => r.owner))].filter((id) => !state.users.some((u) => u.id === id)).map((id) => ({ value: id, label: '已移除的用户', desc: id })),
  ];
  const typeLabel = (k) => ADMIN_RESOURCE_TYPES.find((t) => t.key === k).label;
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="集成资源管理" description="查看企业内全部集成资源。成员离职或调岗时，在这里把资源转移给接手人。" />
    <div className="toolbar">
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索资源名称" />
      <${Select} width=${150} clearable value=${type} onChange=${setType} placeholder="资源类型" options=${ADMIN_RESOURCE_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
      <${Select} width=${160} clearable searchable value=${owner} onChange=${setOwner} placeholder="所有者" options=${ownerOptions} />
      <span className="spacer" />
      ${visiblePicked.length > 0 && html`<${Button} variant="primary" icon="ArrowRightLeft" onClick=${() => setTransfer(rows.filter((r) => visiblePicked.includes(r.rid)))}>批量转移所有权（${visiblePicked.length}）<//>`}
    </div>
    <${Table}
      selectable
      rowKey="rid"
      selected=${visiblePicked}
      onSelect=${setPicked}
      columns=${[
        { key: 'n', title: '资源名称', render: (r) => html`<span className="cell-title admin-clip is-name" title=${r.name}>${r.name}</span>` },
        { key: 't', title: '类型', width: 110, render: (r) => html`<${Tag} size="sm">${typeLabel(r.type)}<//>` },
        { key: 'p', title: '所属范围', width: 120, render: (r) => html`<span className="muted admin-clip is-where" title=${r.where}>${r.where}</span>` },
        { key: 'o', title: '所有者', width: 130, render: (r) => { const u = state.users.find((x) => x.id === r.owner); return html`<span className="row-4"><${Avatar} name=${personName(r.owner)} size=${20} /><span>${personName(r.owner)}</span>${u && u.status === 'disabled' && html`<${Tag} size="sm" tone="danger">已禁用<//>`}</span>`; } },
        { key: 'u', title: '更新时间', width: 136, render: (r) => html`<span className="muted">${fmt.dateTime(r.updatedAt).slice(0, 16)}</span>` },
        { key: 'op', title: '操作', width: 96, render: (r) => html`<a className="link" onClick=${(e) => { e.stopPropagation(); setTransfer([r]); }}>转移所有权</a>` },
      ]}
      data=${rows}
      empty=${html`<${Empty} size="sm" icon="SearchX" title="没有符合条件的资源" description="换个关键词或清除筛选条件试试。" />`}
    />
    ${transfer && html`<${AdminTransferModal} rows=${transfer} onClose=${() => setTransfer(null)} onDone=${() => { setTransfer(null); setPicked([]); }} />`}
  </div></div>`;
}

function AdminTransferModal({ rows, onClose, onDone }) {
  const state = useStore();
  const [to, setTo] = useState(null);
  const owners = [...new Set(rows.map((r) => r.owner))];
  const candidates = state.users.filter((u) => u.status === 'active' && !(owners.length === 1 && owners[0] === u.id));
  const moving = rows.filter((r) => r.owner !== to);
  const skipped = to ? rows.length - moving.length : 0;
  const confirm = () => {
    Store.set((s) => adminTransfer(s, moving.map((r) => ({ key: r.type, id: r.id })), to));
    addAudit('转移资源所有权', `${moving.length === 1 ? moving[0].name : `${moving.length} 个资源`} → ${personName(to)}`);
    toast.success(`已把 ${moving.length} 个资源转移给 ${personName(to)}`);
    onDone();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="转移所有权" width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!to || !moving.length} onClick=${confirm}>转移<//><//>`}>
    <div className="text-xs muted admin-transfer-summary">${rows.length === 1 ? `将转移「${rows[0].name}」，当前所有者 ${personName(rows[0].owner)}。` : `将转移选中的 ${rows.length} 个资源。`}运行中的工作流不受影响；转移项目时，原所有者会保留可编辑权限。</div>
    <${Field} label="转移给" required hint=${skipped ? `其中 ${skipped} 个资源已经属于 ${personName(to)}，会保持不变` : null}>
      <${Select} searchable value=${to} onChange=${setTo} placeholder="选择接收人" options=${candidates.map((u) => ({ value: u.id, label: u.name, desc: u.email, iconNode: html`<${Avatar} name=${u.name} size=${20} />` }))} />
    <//>
  <//>`;
}

function AdminProjects() {
  const state = useStore();
  const [edit, setEdit] = useState(null);
  const monthRuns = adminMonthRuns(state);
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="项目与上限" description="每个项目的工作流数量和每月运行次数上限，达到上限后新运行会被拒绝并记录在运行日志中" />
    <${Table}
      columns=${[
        { key: 'n', title: '项目', render: (p) => html`<div className="cell-main"><${ProjectAvatar} project=${p} size=${26} /><span className="cell-title">${p.name}</span></div>` },
        { key: 'o', title: '所有者', width: 110, render: (p) => personName(p.owner) },
        { key: 'm', title: '成员', width: 70, align: 'right', render: (p) => state.members.filter((m) => m.projectId === p.id).length },
        { key: 'w', title: '工作流', width: 170, render: (p) => { const n = state.workflows.filter((w) => w.projectId === p.id).length; return html`<div className="row"><div className="admin-bar"><${Progress} value=${(n / p.limits.workflows) * 100} height=${5} tone=${n >= p.limits.workflows ? 'danger' : 'primary'} /></div><span className="text-xs">${fmt.number(n)} / ${fmt.number(p.limits.workflows)}</span></div>`; } },
        { key: 'r', title: '本月运行', width: 210, render: (p) => { const n = monthRuns.filter((r) => r.projectId === p.id).length; return html`<div className="row"><div className="admin-bar"><${Progress} value=${(n / p.limits.runsPerMonth) * 100} tone=${n >= p.limits.runsPerMonth * 0.9 ? 'danger' : 'success'} height=${5} /></div><span className="text-xs">${fmt.number(n)} / ${fmt.number(p.limits.runsPerMonth)}</span></div>`; } },
        { key: 'op', title: '操作', width: 90, render: (p) => html`<a className="link" onClick=${() => setEdit(p.id)}>调整上限</a>` },
      ]}
      data=${state.projects}
      empty=${html`<${Empty} size="sm" icon="FolderKanban" title="还没有项目" />`}
    />
    ${edit && html`<${AdminLimitModal} key=${edit} projectId=${edit} onClose=${() => setEdit(null)} />`}
  </div></div>`;
}

function AdminLimitModal({ projectId, onClose }) {
  const state = useStore();
  const p = state.projects.find((x) => x.id === projectId);
  const [wf, setWf] = useState(p ? String(p.limits.workflows) : '');
  const [runs, setRuns] = useState(p ? String(p.limits.runsPerMonth) : '');
  if (!p) return null;
  const count = state.workflows.filter((w) => w.projectId === p.id).length;
  const used = adminMonthRuns(state).filter((r) => r.projectId === p.id).length;
  const num = (v) => (/^\d+$/.test(String(v).replace(/,/g, '').trim()) ? Number(String(v).replace(/,/g, '').trim()) : NaN);
  const w = num(wf);
  const r = num(runs);
  const wfError = !Number.isInteger(w) || w < 1 ? '请输入正整数' : w > ADMIN_LIMITS.projectWorkflows ? `不能超过 ${fmt.number(ADMIN_LIMITS.projectWorkflows)}` : w < count ? `不能小于项目当前的工作流数量 ${count}` : null;
  const runsError = !Number.isInteger(r) || r < 1 ? '请输入正整数' : r > ADMIN_LIMITS.runsPerMonth ? `不能超过实例级上限 ${fmt.number(ADMIN_LIMITS.runsPerMonth)}` : null;
  const runsWarn = !runsError && r < used ? `本月已运行 ${fmt.number(used)} 次，调低后本月剩余的运行会被拒绝` : null;
  const dirty = w !== p.limits.workflows || r !== p.limits.runsPerMonth;
  const save = () => {
    patchList('projects', p.id, { limits: { workflows: w, runsPerMonth: r } });
    addAudit('调整项目上限', `${p.name}：工作流 ${w}，每月运行 ${fmt.number(r)}`, p.id);
    toast.success('已保存');
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${`调整「${p.name}」的上限`} width=${460} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${Boolean(wfError || runsError) || !dirty} onClick=${save}>保存<//><//>`}>
    <${Field} label="工作流数量上限" required hint=${`当前 ${count} 个，最多 ${fmt.number(ADMIN_LIMITS.projectWorkflows)}`} error=${wfError}><${Input} value=${wf} onChange=${setWf} invalid=${Boolean(wfError)} suffix="个" /><//>
    <${Field} label="每月运行次数上限" required hint=${runsWarn || `本月已运行 ${fmt.number(used)} 次，最多 ${fmt.number(ADMIN_LIMITS.runsPerMonth)}`} error=${runsError}><${Input} value=${runs} onChange=${setRuns} invalid=${Boolean(runsError)} suffix="次" /><//>
  <//>`;
}

function AdminUsage() {
  const state = useStore();
  const now = Date.now();
  const range = adminMonthRange(now);
  const month = adminMonthRuns(state);
  const total = month.length;
  const projected = Math.round((total / range.elapsed) * range.days);
  const running = runMetrics(state.runs).running;
  const perProject = state.projects.map((p) => {
    const runs = month.filter((r) => r.projectId === p.id);
    const m = runMetrics(runs);
    return { ...p, runs: runs.length, rate: m.rate, usage: runs.length / p.limits.runsPerMonth };
  });
  const orphan = total - perProject.reduce((a, p) => a + p.runs, 0);
  const rows = [...perProject, ...(orphan > 0 ? [{ id: 'deleted', name: '已删除的项目', runs: orphan, rate: runMetrics(month.filter((r) => !state.projects.some((p) => p.id === r.projectId))).rate, deleted: true }] : [])].sort((a, b) => b.runs - a.runs);
  const shares = adminShares(rows.map((r) => r.runs));
  const limits = [
    ['同时运行的工作流（实例上限，还受在线节点容量限制）', `${running} / ${ADMIN_LIMITS.concurrentRuns}`, (running / ADMIN_LIMITS.concurrentRuns) * 100, 'FEMA_MAX_CONCURRENT_RUNS'],
    ['每月运行次数', `最多 ${fmt.number(ADMIN_LIMITS.runsPerMonth)} 次`, null, 'FEMA_MAX_RUNS_PER_MONTH'],
    ['每个项目的工作流', `最多 ${fmt.number(ADMIN_LIMITS.projectWorkflows)} 个`, null, 'FEMA_PROJECT_MAX_WORKFLOWS'],
    ['单次运行节点数', '最多 40,000', null, 'FEMA_MAX_NODES_PER_RUN'],
    ['单次运行时长', '最长 4 小时', null, 'FEMA_RUN_TIMEOUT'],
    ['单节点运行时长', '最长 600 秒', null, 'FEMA_STEP_TIMEOUT'],
    ['单节点出入参合计', '最大 4 MB', null, 'FEMA_MAX_STEP_PAYLOAD'],
    ['运行日志保留', '30 天', null, 'FEMA_LOG_RETENTION_DAYS'],
  ];
  const pct = (total / ADMIN_LIMITS.runsPerMonth) * 100;
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="用量与上限" description="实例级上限由部署配置决定，项目级上限在「项目与上限」中调整。运行次数不含调试运行。" />
    <div className="usage-hero card">
      <div className="grow">
        <div className="text-xs muted">本月运行次数（${range.month} 月 1 日 – ${range.month} 月 ${range.days} 日）</div>
        <div className="stat-value admin-hero-value">${fmt.number(total)}<span className="stat-suffix">/ ${fmt.number(ADMIN_LIMITS.runsPerMonth)}</span></div>
        <${Progress} value=${pct} height=${8} />
        <div className="text-xs muted admin-hero-sub">已用 ${pct < 0.01 && total > 0 ? '不到 0.01' : pct.toFixed(2)}%，本月已过 ${range.elapsed} 天，按当前速度预计全月 ${fmt.number(projected)} 次</div>
      </div>
      <${AdminUsageAlert} rows=${perProject} />
    </div>
    <div className="section-head section"><span className="section-title">实例级上限</span></div>
    <div className="limit-grid admin-limit-grid">
      ${limits.map(([l, v, p, env]) => html`<div key=${env} className="card limit-card"><div className="text-xs muted">${l}</div><div className="admin-limit-value">${v}</div>${p != null && html`<${Progress} value=${p} height=${5} />`}<div className="text-xs muted mono admin-limit-env">${env}</div></div>`)}
    </div>
    <div className="section-head section"><span className="section-title">按项目明细</span><span className="text-xs muted">占比按本月运行次数计算</span></div>
    <${Table}
      columns=${[
        { key: 'n', title: '项目', render: (p) => (p.deleted ? html`<span className="muted">已删除的项目</span>` : html`<div className="cell-main"><${ProjectAvatar} project=${p} size=${24} /><span className="cell-title">${p.name}</span></div>`) },
        { key: 'r', title: '本月运行次数', width: 130, align: 'right', render: (p) => fmt.number(p.runs) },
        { key: 'rate', title: '运行成功率', width: 110, align: 'right', render: (p) => fmtRate(p.rate) },
        { key: 'share', title: '占比', width: 180, render: (p, i) => html`<div className="row"><div className="admin-bar is-wide"><${Progress} value=${shares[i]} height=${5} /></div><span className="text-xs">${shares[i].toFixed(1)}%</span></div>` },
        { key: 'lim', title: '项目上限使用', width: 190, render: (p) => (p.deleted ? html`<span className="muted">-</span>` : html`<div className="row"><div className="admin-bar"><${Progress} value=${p.usage * 100} height=${5} tone=${p.usage >= 0.9 ? 'danger' : p.usage >= 0.7 ? 'warning' : 'success'} /></div><span className="text-xs">${(p.usage * 100).toFixed(1)}% · ${fmt.number(p.limits.runsPerMonth)}</span></div>`) },
      ]}
      data=${rows}
    />
  </div></div>`;
}

function AdminUsageAlert({ rows }) {
  const state = useStore();
  const saved = { enabled: true, threshold: 80, receivers: [], ...(state.usageAlert || {}) };
  const [d, setD] = useState(saved);
  const admins = adminAdmins(state);
  const smtp = sysSmtpReady(state);
  const channels = ['站内通知', ...adminImEnabled(state.sso).map((x) => `${x.label}消息`), ...(smtp ? ['邮件'] : [])];
  const error = d.enabled && !d.receivers.length ? '请至少选择一位接收人' : null;
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const over = rows.filter((p) => p.usage * 100 >= d.threshold);
  const monthKey = new Date().toISOString().slice(0, 7);
  useEffect(() => {
    if (!saved.enabled || !over.length || !(saved.receivers || []).length) return;
    const have = new Set((Store.get().notifications || []).map((n) => n.id));
    const fresh = over.filter((p) => !p.deleted && p.id).flatMap((p) => saved.receivers.map((uidv) => ({ id: `cap_${p.id}_${monthKey}_${uidv}`, type: 'alert', title: `项目「${p.name}」本月运行次数已达上限的 ${(p.usage * 100).toFixed(0)}%`, desc: `上限 ${fmt.number(p.limits.runsPerMonth)} 次，每个项目每月只通知一次`, time: Date.now(), read: false, to: '/admin/usage', userId: uidv }))).filter((n) => !have.has(n.id));
    if (fresh.length) Store.set((s) => ({ ...s, notifications: [...fresh, ...(s.notifications || [])] }));
  }, [saved.enabled, saved.threshold, JSON.stringify(saved.receivers), over.map((p) => p.id).join()]);
  const save = () => {
    Store.set((s) => ({ ...s, usageAlert: d }));
    addAudit('修改容量告警', d.enabled ? `阈值 ${d.threshold}%` : '已关闭');
    toast.success('已保存容量告警设置');
  };
  return html`<div className="usage-alert">
    <div className="row"><b className="grow">容量告警通知</b><${Switch} checked=${d.enabled} onChange=${(v) => setD({ ...d, enabled: v })} /></div>
    <div className="text-xs muted admin-alert-desc">任一项目的本月运行次数达到项目上限的阈值时，通过${adminJoin(channels)}提醒接收人，每个项目每月一次。${smtp ? '' : '邮件服务未配置，不会发送邮件。'}</div>
    ${d.enabled && html`<${Fragment}>
      <div className="row admin-alert-row">
        <${Select} size="sm" width=${96} value=${d.threshold} onChange=${(v) => setD({ ...d, threshold: v })} options=${[50, 70, 80, 90].map((x) => ({ value: x, label: `${x}%` }))} />
        <div className="grow"><${Select} size="sm" multiple value=${d.receivers} onChange=${(v) => setD({ ...d, receivers: v })} placeholder="选择接收人" invalid=${Boolean(error)} options=${admins.map((u) => ({ value: u.id, label: u.name, desc: u.role === 'owner' ? '所有者' : '管理员' }))} /></div>
      </div>
      ${error && html`<div className="field-error">${error}</div>`}
      <div className="text-xs muted admin-alert-desc">${over.length ? `当前已达到阈值：${over.map((p) => `${p.name} ${(p.usage * 100).toFixed(1)}%`).join('、')}` : '当前没有项目达到阈值'}</div>
    <//>`}
    ${dirty && html`<div className="row admin-alert-actions"><span className="spacer" /><${Button} size="sm" onClick=${() => setD(saved)}>取消<//><${Button} size="sm" variant="primary" disabled=${Boolean(error)} onClick=${save}>保存<//></div>`}
  </div>`;
}

function AdminSso() {
  const state = useStore();
  const [drawer, setDrawer] = useState(null);
  const sso = state.sso;
  const keys = ADMIN_SSO_KEYS.filter((k) => sso[k]);
  const enabledCount = keys.filter((k) => sso[k].enabled).length;
  const toggle = async (k, v) => {
    const meta = ADMIN_SSO_META[k];
    if (!v && !(await confirmDialog({ title: adminCjk('停用', meta.name, '？'), content: adminCjk('停用后，成员不能再用', meta.name, '登录，需要改用其他已启用的方式。'), okText: '停用', danger: true }))) return;
    Store.set((s) => ({ ...s, sso: { ...s.sso, [k]: { ...s.sso[k], enabled: v } } }));
    addAudit('修改登录方式', adminCjk(meta.name, v ? '已启用' : '已停用'));
    toast.success(adminCjk(v ? '已启用' : '已停用', meta.name));
  };
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="登录与安全" description="配置成员登录平台的方式。登录方式需要先完成配置才能启用，至少保留一种已启用的方式。" />
    <div className="col admin-sso-list">
      ${keys.map((k) => {
        const m = sso[k];
        const meta = ADMIN_SSO_META[k];
        const last = m.enabled && enabledCount === 1;
        const tip = !m.configured ? '先完成配置才能启用' : last ? '至少保留一种已启用的登录方式' : null;
        return html`<div key=${k} className="card sso-row">
          ${meta.connector ? html`<${ConnectorIcon} id=${meta.connector} size=${36} />` : html`<${KindTile} icon=${meta.icon} size=${36} />`}
          <div className="grow"><div className="row"><b>${meta.name}</b>${m.enabled ? html`<${Tag} size="sm" tone="success">已启用<//>` : m.configured ? html`<${Tag} size="sm">未启用<//>` : html`<${Tag} size="sm" tone="outline">未配置<//>`}</div><div className="text-xs muted">${meta.desc}</div></div>
          <${Button} size="sm" variant=${m.configured ? 'outline' : 'primary'} onClick=${() => setDrawer(k)}>${m.configured ? '修改配置' : '去配置'}<//>
          <${Tooltip} content=${tip}><${Switch} checked=${m.enabled} disabled=${Boolean(tip)} onChange=${(v) => toggle(k, v)} /><//>
        </div>`;
      })}
    </div>
    <div className="section"><${AdminSsoPolicy} /></div>
    ${drawer && html`<${AdminSsoDrawer} key=${drawer} method=${drawer} onClose=${() => setDrawer(null)} />`}
  </div></div>`;
}

function AdminSsoPolicy() {
  const state = useStore();
  const saved = { autoProvision: true, domains: '', session: '7d', ...(state.sso.policy || {}) };
  const [d, setD] = useState(saved);
  const list = adminDomains(d.domains);
  const bad = list.find((x) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(x));
  const error = bad ? `「${bad}」不是有效的域名` : null;
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const save = () => {
    const policy = { ...d, domains: list.join(', ') };
    Store.set((s) => ({ ...s, sso: { ...s.sso, policy } }));
    setD(policy);
    addAudit('修改账号策略', '登录与安全');
    toast.success('已保存账号策略');
  };
  return html`<${Card} title="账号策略">
    <${Field} label="首次登录自动创建账号" layout="horizontal" hint="关闭后，只有在「用户管理」中添加过的成员可以登录"><${Switch} checked=${d.autoProvision} onChange=${(v) => setD({ ...d, autoProvision: v })} /><//>
    <${Field} label="允许的邮箱域名" layout="horizontal" hint="只有这些域名的邮箱可以登录，多个域名用逗号分隔；留空表示不限制" error=${error}><${Input} value=${d.domains} onChange=${(v) => setD({ ...d, domains: v })} placeholder="example.com, partner.com" invalid=${Boolean(error)} /><//>
    <${Field} label="会话有效期" layout="horizontal" hint="超过有效期后需要重新登录"><${Select} width=${160} value=${d.session} onChange=${(v) => setD({ ...d, session: v })} options=${[{ value: '1d', label: '1 天' }, { value: '7d', label: '7 天' }, { value: '30d', label: '30 天' }]} /><//>
    <${AdminSaveBar} dirty=${dirty} valid=${!error} onCancel=${() => setD(saved)} onSave=${save} />
  <//>`;
}

function AdminSsoDrawer({ method, onClose }) {
  const state = useStore();
  const cur = state.sso[method];
  const meta = ADMIN_SSO_META[method];
  const base = `https://${state.tenant.domain}`;
  const [d, setD] = useState(() => ({
    appId: cur.appId || '', issuer: cur.issuer || '', clientId: cur.clientId || '', scopes: cur.scopes || 'openid profile email',
    corpId: cur.corpId || '', agentId: cur.agentId || '', appKey: cur.appKey || '',
    metadataUrl: cur.metadataUrl || '', minLength: String(cur.minLength || 10), requireMix: cur.requireMix !== false, secret: '',
  }));
  const [touched, setTouched] = useState({});
  const set = (k, v) => { setD({ ...d, [k]: v }); setTouched({ ...touched, [k]: true }); };
  const httpsOk = (v) => /^https:\/\/[^\s/]+\.[^\s]+$/.test(String(v).trim());
  const needSecret = !cur.hasSecret && !cur.configured;
  const errors = {
    feishu: {
      appId: !d.appId.trim() ? '请输入 App ID' : !/^cli_[a-z0-9]{8,}$/i.test(d.appId.trim()) ? 'App ID 以 cli_ 开头，例如 cli_a5f3e8b2c1' : null,
      secret: needSecret && !d.secret.trim() ? '请输入 App Secret' : null,
    },
    oidc: {
      issuer: !d.issuer.trim() ? '请输入 Issuer URL' : !httpsOk(d.issuer) ? '请输入 https:// 开头的地址' : null,
      clientId: !d.clientId.trim() ? '请输入 Client ID' : null,
      secret: needSecret && !d.secret.trim() ? '请输入 Client Secret' : null,
      scopes: !d.scopes.split(/\s+/).includes('openid') ? 'Scopes 必须包含 openid' : null,
    },
    saml: { metadataUrl: !d.metadataUrl.trim() ? '请输入 IdP 元数据 URL' : !httpsOk(d.metadataUrl) ? '请输入 https:// 开头的地址' : null },
    wecom: {
      corpId: !d.corpId.trim() ? '请输入企业 ID' : !/^ww[0-9a-f]{16}$/i.test(d.corpId.trim()) ? '企业 ID 以 ww 开头，共 18 位，例如 ww8a2c4e6f1b3d5a7c' : null,
      agentId: !d.agentId.trim() ? '请输入 AgentId' : !/^\d{7}$/.test(d.agentId.trim()) ? 'AgentId 是 7 位数字，例如 1000012' : null,
      secret: needSecret && !d.secret.trim() ? '请输入应用 Secret' : null,
    },
    dingtalk: {
      appKey: !d.appKey.trim() ? '请输入 AppKey' : !/^ding[a-z0-9]{10,}$/i.test(d.appKey.trim()) ? 'AppKey 以 ding 开头，例如 dingxk2n8vq3m7zp1c' : null,
      secret: needSecret && !d.secret.trim() ? '请输入 AppSecret' : null,
    },
    password: { minLength: !/^\d+$/.test(d.minLength) || Number(d.minLength) < 8 || Number(d.minLength) > 64 ? '请输入 8 到 64 之间的整数' : null },
  }[method];
  const valid = !Object.values(errors).some(Boolean);
  const show = (k) => (touched[k] || cur.configured ? errors[k] : null);
  const save = () => {
    const fields = {
      feishu: { appId: d.appId.trim() },
      oidc: { issuer: d.issuer.trim(), clientId: d.clientId.trim(), scopes: d.scopes.trim() },
      saml: { metadataUrl: d.metadataUrl.trim() },
      password: { minLength: Number(d.minLength), requireMix: d.requireMix },
      wecom: { corpId: d.corpId.trim(), agentId: d.agentId.trim() },
      dingtalk: { appKey: d.appKey.trim() },
    }[method];
    const hasSecret = ['feishu', 'oidc', 'wecom', 'dingtalk'].includes(method) ? cur.hasSecret || cur.configured || Boolean(d.secret.trim()) : undefined;
    Store.set((s) => ({ ...s, sso: { ...s.sso, [method]: { ...s.sso[method], ...fields, ...(hasSecret !== undefined ? { hasSecret } : {}), configured: true } } }));
    addAudit('配置登录方式', meta.name);
    toast.success(cur.enabled ? '已保存，新的配置立即生效' : '已保存配置，打开开关即可启用');
    onClose();
  };
  const copyRow = (label, value) => html`<${Field} label=${label}><div className="webhook-url"><span className="url">${value}</span><${CopyButton} text=${value} /></div><//>`;
  const secretHint = cur.configured || cur.hasSecret ? '已保存，留空表示不修改' : null;
  return html`<${Drawer} open=${true} onClose=${onClose} title=${adminCjk('配置', meta.name)} width=${540} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>保存<//><//>`}>
    ${method === 'feishu' && html`<${Fragment}>
      <div className="admin-notice"><${Alert} tone="info">在飞书开放平台创建企业自建应用，开启「网页应用」并把下面的回调地址加入重定向 URL 白名单。<//></div>
      <${Field} label="App ID" required error=${show('appId')}><${Input} mono value=${d.appId} onChange=${(v) => set('appId', v)} placeholder="cli_xxxxxxxx" invalid=${Boolean(show('appId'))} /><//>
      <${Field} label="App Secret" required=${needSecret} hint=${secretHint} error=${show('secret')}><${SecretInput} value=${d.secret} onChange=${(v) => set('secret', v)} placeholder=${secretHint ? '••••••••' : '请输入'} /><//>
      ${copyRow('回调地址', `${base}/auth/feishu/callback`)}
    <//>`}
    ${method === 'oidc' && html`<${Fragment}>
      <${Field} label="Issuer URL" required error=${show('issuer')}><${Input} value=${d.issuer} onChange=${(v) => set('issuer', v)} placeholder="https://login.example.com" invalid=${Boolean(show('issuer'))} /><//>
      <${Field} label="Client ID" required error=${show('clientId')}><${Input} mono value=${d.clientId} onChange=${(v) => set('clientId', v)} invalid=${Boolean(show('clientId'))} /><//>
      <${Field} label="Client Secret" required=${needSecret} hint=${secretHint} error=${show('secret')}><${SecretInput} value=${d.secret} onChange=${(v) => set('secret', v)} placeholder=${secretHint ? '••••••••' : '请输入'} /><//>
      <${Field} label="Scopes" required error=${show('scopes')}><${Input} mono value=${d.scopes} onChange=${(v) => set('scopes', v)} invalid=${Boolean(show('scopes'))} /><//>
      ${copyRow('回调地址', `${base}/auth/oidc/callback`)}
    <//>`}
    ${method === 'saml' && html`<${Fragment}>
      <${Field} label="IdP 元数据 URL" required error=${show('metadataUrl')}><${Input} value=${d.metadataUrl} onChange=${(v) => set('metadataUrl', v)} placeholder="https://idp.example.com/metadata" invalid=${Boolean(show('metadataUrl'))} /><//>
      ${copyRow('SP 元数据', `${base}/auth/saml/metadata`)}
      ${copyRow('断言消费地址（ACS）', `${base}/auth/saml/acs`)}
    <//>`}
    ${method === 'wecom' && html`<${Fragment}>
      <div className="admin-notice"><${Alert} tone="info">在企业微信管理后台创建自建应用，在「企业微信授权登录」里把下面的域名设为授权回调域，并在「网页授权及 JS-SDK」里设为可信域名。<//></div>
      <${Field} label="企业 ID（CorpID）" required hint="在管理后台「我的企业」页面底部" error=${show('corpId')}><${Input} mono value=${d.corpId} onChange=${(v) => set('corpId', v.trim())} placeholder="ww8a2c4e6f1b3d5a7c" invalid=${Boolean(show('corpId'))} /><//>
      <${Field} label="应用 AgentId" required error=${show('agentId')}><${Input} mono value=${d.agentId} onChange=${(v) => set('agentId', v.trim())} placeholder="1000012" invalid=${Boolean(show('agentId'))} /><//>
      <${Field} label="应用 Secret" required=${needSecret} hint=${secretHint} error=${show('secret')}><${SecretInput} value=${d.secret} onChange=${(v) => set('secret', v)} placeholder=${secretHint ? '••••••••' : '请输入'} /><//>
      ${copyRow('可信域名', state.tenant.domain)}
      ${copyRow('回调地址', `${base}/auth/wecom/callback`)}
    <//>`}
    ${method === 'dingtalk' && html`<${Fragment}>
      <div className="admin-notice"><${Alert} tone="info">在钉钉开放平台创建企业内部应用，开启「登录」能力，并把下面的回调地址加入重定向 URL。<//></div>
      <${Field} label="AppKey（Client ID）" required error=${show('appKey')}><${Input} mono value=${d.appKey} onChange=${(v) => set('appKey', v.trim())} placeholder="dingxk2n8vq3m7zp1c" invalid=${Boolean(show('appKey'))} /><//>
      <${Field} label="AppSecret（Client Secret）" required=${needSecret} hint=${secretHint} error=${show('secret')}><${SecretInput} value=${d.secret} onChange=${(v) => set('secret', v)} placeholder=${secretHint ? '••••••••' : '请输入'} /><//>
      ${copyRow('回调地址', `${base}/auth/dingtalk/callback`)}
    <//>`}
    ${method === 'password' && html`<${Fragment}>
      <${Field} label="密码最小长度" required error=${show('minLength')}><${Input} value=${d.minLength} onChange=${(v) => set('minLength', v.trim())} suffix="位" invalid=${Boolean(show('minLength'))} style=${{ width: 160 }} /><//>
      <${Field} label="要求同时包含数字和字母" layout="horizontal"><${Switch} checked=${d.requireMix} onChange=${(v) => set('requireMix', v)} /><//>
      <${Alert} tone="info">${sysSmtpReady(state) ? '成员可以用邮件找回密码，管理员也可以在「用户管理」中为成员重置密码。' : '未配置邮件服务（SMTP）时，找回密码邮件不会发送，管理员可以在「用户管理」中为成员重置密码。'}<//>
    <//>`}
  <//>`;
}

function AdminAudit() {
  const state = useStore();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [user, setUser] = useState(null);
  const [action, setAction] = useState(route.query.action || null);
  const [project, setProject] = useState(null);
  const [range, setRange] = useState('30d');
  const [page, setPage] = useState(1);
  const ranges = { '1h': HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY };
  const since = Date.now() - (ranges[range] || 30 * DAY);
  const actions = [...new Set([...state.auditLogs.map((a) => a.action), ...(action ? [action] : [])])];
  const people = [...new Set(state.auditLogs.map((a) => a.user))];
  const ql = q.trim().toLowerCase();
  const list = state.auditLogs
    .filter((a) => a.time >= since && (!user || a.user === user) && (!action || a.action === action) && (!project || (project === 'platform' ? !a.project : a.project === project)))
    .filter((a) => !ql || `${a.resource}${a.action}${personName(a.user)}${a.ip}`.toLowerCase().includes(ql))
    .sort((a, b) => b.time - a.time);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * pageSize, cur * pageSize);
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  const projLabel = (pid) => (pid ? (state.projects.find((p) => p.id === pid) || {}).name || '已删除的项目' : '平台');
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['时间', '操作人', '操作', '操作对象', '项目', 'IP'].map(esc).join(','), ...list.map((a) => [fmt.dateTime(a.time), personName(a.user), a.action, a.resource, projLabel(a.project), a.ip].map(esc).join(','))];
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `audit-logs-${fmt.date(Date.now())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast.success(`已导出 ${list.length} 条记录`);
  };
  const filtered = Boolean(ql || user || action || project);
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="审计日志" description="记录成员在平台上的关键操作，保留 90 天" actions=${html`<${Button} icon="Download" disabled=${!list.length} onClick=${exportCsv}>导出 CSV<//>`} />
    <div className="toolbar">
      <${TimeRange} value=${range} onChange=${reset(setRange)} />
      <${Select} width=${140} clearable searchable value=${user} onChange=${reset(setUser)} placeholder="操作人" options=${people.map((id) => ({ value: id, label: personName(id) }))} />
      <${Select} width=${150} clearable searchable value=${action} onChange=${reset(setAction)} placeholder="操作类型" options=${actions.map((a) => ({ value: a, label: a }))} />
      <${Select} width=${130} clearable value=${project} onChange=${reset(setProject)} placeholder="项目" options=${[{ value: 'platform', label: '平台' }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]} />
      <span className="spacer" />
      <${SearchInput} value=${q} onChange=${reset(setQ)} placeholder="搜索操作对象、操作人或 IP" />
    </div>
    <${Table}
      dense
      columns=${[
        { key: 't', title: '时间', width: 160, render: (a) => fmt.dateTime(a.time) },
        { key: 'u', title: '操作人', width: 120, render: (a) => html`<span className="row-4"><${Avatar} name=${personName(a.user)} size=${20} /><span>${personName(a.user)}</span></span>` },
        { key: 'a', title: '操作', width: 136, render: (a) => html`<${Tag} size="sm">${a.action}<//>` },
        { key: 'r', title: '操作对象', render: (a) => html`<span className="admin-clip is-name" title=${a.resource}>${a.resource}</span>` },
        { key: 'p', title: '项目', width: 100, render: (a) => (a.project ? projLabel(a.project) : html`<span className="muted">平台</span>`) },
        { key: 'ip', title: 'IP', width: 110, render: (a) => html`<span className="mono muted">${a.ip}</span>` },
      ]}
      data=${shown}
      empty=${html`<${Empty} size="sm" icon="FileSearch" title=${action && !state.auditLogs.some((a) => a.action === action) ? `还没有「${action}」的记录` : '没有符合条件的记录'} description=${filtered ? '换个关键词或清除筛选条件试试。' : '可以把时间范围调大一些。'} />`}
    />
    ${list.length > pageSize && html`<${Pagination} page=${cur} pageSize=${pageSize} total=${list.length} onChange=${setPage} />`}
  </div></div>`;
}

function AdminEncryption() {
  const state = useStore();
  const [rotating, setRotating] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enc = state.encryption || {};
  const createdAt = Math.min(...state.users.map((u) => u.createdAt), ...state.projects.map((p) => p.createdAt));
  const since = enc.rotatedAt || createdAt;
  const age = Math.floor((Date.now() - since) / DAY);
  const webhookSecrets = state.workflows.filter((w) => w.trigger.connector === 'webhook' && w.trigger.config && w.trigger.config.auth && w.trigger.config.auth !== '无鉴权').length;
  const ssoSecrets = ['feishu', 'oidc', 'wecom', 'dingtalk'].filter((k) => state.sso[k] && (state.sso[k].hasSecret || state.sso[k].configured)).length;
  const sys = sysOf(state);
  const svcSecrets = [sys.services.smtp.configured && sys.services.smtp.hasPassword, sys.services.storage.configured && sys.services.storage.hasSecret, sys.backupPolicy.s3.configured && sys.backupPolicy.s3.hasSecret].filter(Boolean).length;
  const rotate = async () => {
    const ok = await confirmDialog({ title: '轮换加密密钥？', content: `平台会用新密钥重新加密 ${state.connections.length} 个连接和其他敏感配置，期间运行不受影响。旧密钥保留 7 天以便回滚。`, okText: '开始轮换' });
    if (!ok) return;
    setRotating(true);
    timer.current = setTimeout(() => {
      Store.set((s) => ({ ...s, encryption: { ...(s.encryption || {}), rotatedAt: Date.now() } }));
      addAudit('轮换加密密钥', 'AES-256-GCM');
      setRotating(false);
      toast.success('密钥轮换完成');
    }, 1500);
  };
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="数据加密" description="连接里的凭据、登录方式的客户端密钥和 Webhook 签名密钥都会加密后存储" />
    ${age > 90 && html`<div className="admin-notice"><${Alert} tone="warning">密钥已经使用 ${age} 天，建议每 90 天轮换一次。<//></div>`}
    <${Card} title="加密密钥">
      <div className="kv">
        <div><span>算法</span><span>AES-256-GCM</span></div>
        <div><span>密钥来源</span><span>首次启动时自动生成，保存在数据目录 <span className="mono">/data/keys</span></span></div>
        <div><span>覆盖方式</span><span>设置环境变量 <span className="mono">FEMA_ENCRYPTION_KEY</span> 可以改用你自己的密钥</span></div>
        <div><span>生成时间</span><span>${fmt.date(createdAt)}</span></div>
        <div><span>上次轮换</span><span>${enc.rotatedAt ? `${fmt.dateTime(enc.rotatedAt)}（${fmt.relative(enc.rotatedAt)}）` : '从未轮换'}</span></div>
        <div><span>加密对象</span><span>${state.connections.length} 个连接 · ${ssoSecrets} 个登录方式密钥 · ${webhookSecrets} 个 Webhook 签名密钥${svcSecrets ? ` · ${svcSecrets} 个服务密码（邮件、对象存储、备份存储）` : ''}</span></div>
        <div><span>备份</span><span>密钥不在数据库备份里，需要单独保存 · <${Link} to="/admin/backup" className="link">备份与恢复<//></span></div>
      </div>
      <div className="row admin-card-actions">
        <${Button} icon="RefreshCw" loading=${rotating} onClick=${rotate}>${rotating ? '正在轮换' : '轮换密钥'}<//>
      </div>
    <//>
  </div></div>`;
}

function AdminBranding() {
  const state = useStore();
  const saved = { productName: '', primaryColor: null, welcome: '', logo: null, ...state.tenant.appearance };
  const [d, setD] = useState(saved);
  const [hex, setHex] = useState(saved.primaryColor || '');
  const presets = ['#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626', '#171717'];
  const setColor = (v) => { setD({ ...d, primaryColor: v }); setHex(v || ''); };
  const onHex = (v) => {
    const t = v.trim();
    setHex(t);
    setD({ ...d, primaryColor: t ? (t.startsWith('#') ? t : `#${t}`).toUpperCase() : null });
  };
  const errors = {
    productName: !d.productName.trim() ? '请输入产品名称' : null,
    primaryColor: adminColorError(d.primaryColor),
  };
  const valid = !Object.values(errors).some(Boolean);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const cancel = () => { setD(saved); setHex(saved.primaryColor || ''); };
  const save = () => {
    const appearance = { ...d, productName: d.productName.trim(), welcome: String(d.welcome || '').trim() };
    Store.set((s) => ({ ...s, tenant: { ...s.tenant, appearance } }));
    setD(appearance);
    setHex(appearance.primaryColor || '');
    addAudit('修改品牌外观', appearance.productName);
    toast.success('已保存，登录页和控制台已更新');
  };
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="品牌外观" description="登录页、邮件和控制台里的产品名称、Logo 和主题色都来自这里" actions=${html`<${Fragment}><${Button} disabled=${!dirty} onClick=${cancel}>取消<//><${Button} variant="primary" disabled=${!dirty || !valid} onClick=${save}>保存<//><//>`} />
    <div className="brand-layout">
      <div>
        <${Field} label="产品名称" required error=${errors.productName}><${CharInput} value=${d.productName} onChange=${(v) => setD({ ...d, productName: v })} max=${20} invalid=${Boolean(errors.productName)} /><//>
        <${Field} label="主题色" hint=${errors.primaryColor ? null : d.primaryColor ? `对比度 ${adminContrast(d.primaryColor).toFixed(2)}:1（白色背景）` : '使用默认主题色'} error=${errors.primaryColor}>
          <div className="row admin-swatches">
            <${Tooltip} content="默认主题色"><button type="button" aria-label="默认主题色" className=${cx('brand-swatch', 'is-default', d.primaryColor === null && 'is-active')} onClick=${() => setColor(null)} /><//>
            ${presets.map((c) => html`<${Tooltip} key=${c} content=${c}><button type="button" aria-label=${c} className=${cx('brand-swatch', d.primaryColor === c && 'is-active')} style=${{ background: c }} onClick=${() => setColor(c)} /><//>`)}
            <label className="brand-picker" title="自定义颜色"><input type="color" value=${!errors.primaryColor && d.primaryColor ? d.primaryColor.toLowerCase() : '#6e40e2'} onChange=${(e) => setColor(e.target.value.toUpperCase())} /><${Icon} name="Pipette" size=${14} /></label>
            <${Input} mono value=${hex} onChange=${onHex} placeholder="默认" invalid=${Boolean(errors.primaryColor)} style=${{ width: 120 }} />
            ${d.primaryColor !== null && html`<${Button} size="sm" variant="ghost" icon="RotateCcw" onClick=${() => setColor(null)}>恢复默认<//>`}
          </div>
        <//>
        <${Field} label="Logo" hint="PNG、SVG 或 JPG，建议 64×64 的正方形图片，不超过 256 KB">
          <div className="row"><span className="brand-logo"><img src=${d.logo || 'assets/logo.svg'} alt="" /></span><${ImageUploadButton} onPick=${(url) => setD({ ...d, logo: url })} label=${d.logo ? '更换' : '上传'} />${d.logo && html`<${Button} size="sm" variant="ghost" icon="RotateCcw" onClick=${() => setD({ ...d, logo: null })}>恢复默认<//>`}</div>
        <//>
        <${Field} label="登录页欢迎语" hint="显示在登录页左侧，留空则不显示"><${CharInput} value=${d.welcome} onChange=${(v) => setD({ ...d, welcome: v })} max=${30} /><//>
        <${Alert} tone="info">默认主题是中性的，素材都放在本地，不依赖任何外部 CDN。<//>
      </div>
      <div>
        <div className="text-xs muted admin-preview-label">登录页预览</div>
        <${AdminLoginPreview} appearance=${d} valid=${!errors.primaryColor} />
      </div>
    </div>
  </div></div>`;
}

function adminLoginMethods(sso) {
  return ADMIN_SSO_KEYS.filter((k) => k !== 'password' && sso[k] && sso[k].enabled && sso[k].configured);
}

function AdminLoginPreview({ appearance, valid }) {
  const state = useStore();
  const color = valid && appearance.primaryColor ? appearance.primaryColor : 'var(--brand-default)';
  const methods = adminLoginMethods(state.sso);
  const pwd = state.sso.password.enabled;
  const solo = !pwd && methods.length === 1;
  return html`<div className="brand-preview admin-brand-preview" style=${{ '--pv': color }}>
    <div className="brand-preview-left">
      <div className="row admin-pv-brand"><span className="admin-pv-logo"><img src=${appearance.logo || 'assets/logo.svg'} alt="" /></span><b>${appearance.productName || '产品名称'}</b></div>
      ${appearance.welcome && html`<div className="admin-pv-welcome">${appearance.welcome}</div>`}
    </div>
    <div className="brand-preview-right">
      <b>登录到 ${appearance.productName || '产品名称'}</b>
      ${pwd && html`<${Fragment}><div className="brand-input" /><div className="brand-input" /><div className="brand-btn">登录</div><//>`}
      ${pwd && methods.length > 0 && html`<div className="admin-pv-or">或</div>`}
      ${methods.map((k) => html`<div key=${k} className=${cx('brand-btn', !solo && 'is-outline')}>${ADMIN_LOGIN_LABELS[k]}</div>`)}
      ${!pwd && !methods.length && html`<div className="admin-pv-or">没有启用的登录方式</div>`}
    </div>
  </div>`;
}

function AdminWorkers() {
  const state = useStore();
  const [wizard, setWizard] = useState(null);
  const [detail, setDetail] = useState(null);
  const workers = state.workers;
  const latest = adminLatestVersion(workers);
  const online = workers.filter((w) => w.status === 'online');
  const capacity = online.reduce((a, w) => a + w.concurrency, 0);
  const jobs = workers.filter((w) => w.status !== 'offline').reduce((a, w) => a + w.jobs, 0);
  const runningRuns = runMetrics(state.runs).running;
  const backlog = Math.max(0, runningRuns - capacity);
  const outdated = workers.filter((w) => adminVersionCmp(w.version, latest) < 0);
  const statusMeta = { online: ['success', '在线'], draining: ['warning', '排空中'], offline: ['default', '离线'] };
  const drain = async (w) => {
    if (!(await confirmDialog({ title: `排空 ${w.host}？`, content: `节点不再接收新任务，当前 ${w.jobs} 个任务完成后下线。`, okText: '排空' }))) return;
    patchList('workers', w.id, { status: 'draining' });
    addAudit('排空工作节点', w.host);
    toast.success('节点已停止接收新任务');
  };
  const resume = (w) => { patchList('workers', w.id, { status: 'online' }); addAudit('恢复工作节点', w.host); toast.success('节点已恢复接收任务'); };
  const remove = async (w) => {
    if (!(await confirmDialog({ title: `移除 ${w.host}？`, content: '移除后节点的令牌立即失效；如果节点重新上线，需要用新的令牌重新安装。', okText: '移除', danger: true }))) return;
    removeFromList('workers', w.id);
    addAudit('移除工作节点', w.host);
    toast.success('已移除');
  };
  const bar = (w, v) => (w.status === 'offline' ? html`<span className="muted">-</span>` : html`<div className="row"><div className="admin-bar is-sm"><${Progress} value=${v} height=${5} tone=${v > 80 ? 'danger' : 'primary'} /></div><span className="text-xs">${v}%</span></div>`);
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader} title="工作节点" description="工作节点负责实际运行工作流。可以部署在内网，让工作流访问内网数据库和系统。" actions=${html`<${Button} variant="primary" icon="Plus" onClick=${() => setWizard(uid('wz'))}>添加工作节点<//>`} />
    <div className="stat-grid">
      <${Stat} label="在线节点" value=${online.length} suffix=${`/ ${workers.length}`} delta=${workers.length - online.length ? `${workers.length - online.length} 个节点不在线` : '全部节点在线'} tone=${workers.length - online.length ? 'danger' : 'success'} />
      <${Stat} label="运行中任务" value=${jobs} suffix=${`/ ${capacity}`} delta=${capacity ? `已用 ${Math.round((jobs / capacity) * 100)}% 的并发` : '没有在线节点'} />
      <${Stat} label="队列积压" value=${backlog} delta=${backlog ? `${backlog} 个任务在等待空闲节点` : '所有任务都已分配到节点'} tone=${backlog ? 'danger' : 'success'} />
      <${Stat} label="最新节点版本" value=${latest} delta=${outdated.length ? `${outdated.length} 个节点版本落后` : '全部节点已是最新版本'} tone=${outdated.length ? 'danger' : 'success'} />
    </div>
    <${Table}
      onRowClick=${(w) => setDetail(w.id)}
      columns=${[
        { key: 'h', title: '节点', render: (w) => html`<div className="cell-main"><${KindTile} icon="Cpu" size=${28} /><div className="admin-cell-text"><div className="cell-title mono">${w.host}</div><div className="cell-sub">心跳 ${adminRelative(w.heartbeatAt)} · 启动于 ${adminRelative(w.startedAt)}</div></div></div>` },
        { key: 's', title: '状态', width: 86, render: (w) => { const m = statusMeta[w.status] || statusMeta.offline; return html`<span className="row-4"><${Dot} tone=${m[0]} pulse=${w.status === 'online'} />${m[1]}</span>`; } },
        { key: 'v', title: '版本', width: 84, render: (w) => html`<span className="row-4">${w.version}${adminVersionCmp(w.version, latest) < 0 && html`<${Tooltip} content=${`落后于最新版本 ${latest}，建议升级`}><${Icon} name="CircleAlert" size=${13} className="admin-warn-icon" /><//>`}</span>` },
        { key: 'l', title: '标签', width: 100, render: (w) => html`<span className="admin-tags">${(w.labels || []).map((l) => html`<${Tag} key=${l} size="sm">${l}<//>`)}</span>` },
        { key: 'c', title: 'CPU', width: 104, render: (w) => bar(w, w.cpu) },
        { key: 'm', title: '内存', width: 104, render: (w) => bar(w, w.mem) },
        { key: 'j', title: '任务 / 并发', width: 92, render: (w) => (w.status === 'offline' ? html`<span className="muted">- / ${w.concurrency}</span>` : `${w.jobs} / ${w.concurrency}`) },
        { key: 'o', title: '', width: 48, render: (w) => html`<${MoreMenu} items=${[
          { label: '查看详情', icon: 'Info', onClick: () => setDetail(w.id) },
          w.status === 'draining'
            ? { label: '恢复接收任务', icon: 'CirclePlay', onClick: () => resume(w) }
            : { label: '排空后下线', icon: 'CirclePause', disabled: w.status !== 'online', onClick: () => drain(w) },
          { divider: true },
          { label: '移除', icon: 'Trash2', danger: true, disabled: w.status !== 'offline', desc: w.status !== 'offline' ? '先下线才能移除' : '', onClick: () => remove(w) },
        ]} />` },
      ]}
      data=${workers}
      empty=${html`<${Empty} size="sm" icon="Cpu" title="还没有工作节点" description="添加至少一个工作节点，工作流才能运行。" />`}
    />
    ${wizard && html`<${AdminWorkerWizard} key=${wizard} latest=${latest} onClose=${() => setWizard(null)} />`}
    ${detail && html`<${AdminWorkerDrawer} key=${detail} id=${detail} latest=${latest} onClose=${() => setDetail(null)} />`}
  </div></div>`;
}

function AdminWorkerDrawer({ id, latest, onClose }) {
  const state = useStore();
  const w = state.workers.find((x) => x.id === id);
  if (!w) return null;
  const metrics = `http://${w.host}:9464/metrics`;
  return html`<${Drawer} open=${true} onClose=${onClose} title=${w.host} subtitle="工作节点详情" width=${520}>
    <div className="kv">
      <div><span>状态</span><span>${{ online: '在线', draining: '排空中', offline: '离线' }[w.status] || w.status}</span></div>
      <div><span>版本</span><span>${w.version}${adminVersionCmp(w.version, latest) < 0 ? `（最新 ${latest}）` : ''}</span></div>
      <div><span>标签</span><span>${(w.labels || []).join('、') || '无'}</span></div>
      <div><span>最大并发</span><span>${w.concurrency}</span></div>
      <div><span>运行中任务</span><span>${w.status === 'offline' ? '-' : w.jobs}</span></div>
      <div><span>CPU / 内存</span><span>${w.status === 'offline' ? '-' : `${w.cpu}% / ${w.mem}%`}</span></div>
      <div><span>启动时间</span><span>${fmt.dateTime(w.startedAt)}</span></div>
      <div><span>最近心跳</span><span>${fmt.dateTime(w.heartbeatAt)}（${fmt.relative(w.heartbeatAt)}）</span></div>
    </div>
    <div className="admin-drawer-section">
      <${Field} label="指标地址" hint="OpenMetrics 格式，可以接入 Prometheus；只在节点所在网络内可访问"><div className="webhook-url"><span className="url">${metrics}</span><${CopyButton} text=${metrics} /></div><//>
    </div>
  <//>`;
}

function AdminWorkerWizard({ latest, onClose }) {
  const state = useStore();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', mode: 'docker', concurrency: '10', labels: '' });
  const [touched, setTouched] = useState({});
  const [token] = useState(() => adminSecret('wkr_', 24));
  const [connected, setConnected] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (k, v) => { setF({ ...f, [k]: v }); setTouched({ ...touched, [k]: true }); };
  const name = f.name.trim();
  const labels = adminDomains(f.labels.replace(/[，、]/g, ','));
  const errors = {
    name: !name ? '请输入节点名称' : !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name) ? '只能包含小写字母、数字和中划线，以字母或数字开头和结尾' : state.workers.some((w) => w.host.toLowerCase() === name) ? '已经有同名的工作节点' : null,
    concurrency: !/^\d+$/.test(f.concurrency) || Number(f.concurrency) < 1 || Number(f.concurrency) > 100 ? '请输入 1 到 100 之间的整数' : null,
    labels: labels.length > 5 ? '最多 5 个标签' : labels.find((l) => !/^[a-z0-9][a-z0-9-]*$/.test(l)) ? '标签只能包含小写字母、数字和中划线' : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (k) => (touched[k] ? errors[k] : null);
  const api = `https://${state.tenant.domain}`;
  const labelText = labels.join(',') || 'default';
  const cmd = {
    docker: `docker run -d --name ${name} \\\n  -e FEMA_API_URL=${api} \\\n  -e FEMA_WORKER_TOKEN=${token} \\\n  -e FEMA_WORKER_CONCURRENCY=${f.concurrency} \\\n  -e FEMA_WORKER_LABELS=${labelText} \\\n  fema/worker:${latest}`,
    k8s: `helm install ${name} fema/worker \\\n  --set apiUrl=${api} \\\n  --set token=${token} \\\n  --set concurrency=${f.concurrency} \\\n  --set labels=${labelText}`,
    bin: `curl -fsSL ${api}/install-worker.sh | \\\n  FEMA_WORKER_TOKEN=${token} FEMA_WORKER_NAME=${name} \\\n  FEMA_WORKER_CONCURRENCY=${f.concurrency} FEMA_WORKER_LABELS=${labelText} bash`,
  }[f.mode];
  const next = () => {
    if (step === 1) {
      setConnected(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConnected(true), 2200);
    }
    setStep(step + 1);
  };
  const back = () => { clearTimeout(timer.current); setConnected(false); setStep(step - 1); };
  const finish = () => {
    const now = Date.now();
    Store.set((s) => ({ ...s, workers: [...s.workers, { id: uid('w'), host: name, status: 'online', version: latest, cpu: 3, mem: 12, jobs: 0, concurrency: Number(f.concurrency), labels: labels.length ? labels : ['default'], startedAt: now, heartbeatAt: now }] }));
    addAudit('添加工作节点', name);
    toast.success(`${name} 已上线`);
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="添加工作节点" width=${700} footer=${html`<${Fragment}>
    <${Button} onClick=${step === 0 ? onClose : back}>${step === 0 ? '取消' : '上一步'}<//>
    ${step < 2 ? html`<${Button} variant="primary" disabled=${step === 0 && !valid} onClick=${next}>下一步<//>` : html`<${Button} variant="primary" disabled=${!connected} onClick=${finish}>完成<//>`}
  <//>`}>
    <${Steps} current=${step} items=${[{ title: '基础配置' }, { title: '安装节点' }, { title: '连接测试' }]} />
    <div className="admin-wizard-body">
      ${step === 0 && html`<${Fragment}>
        <${Field} label="节点名称" required hint="作为容器名和节点标识，例如 worker-intranet-01" error=${show('name')}><${Input} mono value=${f.name} onChange=${(v) => set('name', v.trim().toLowerCase())} placeholder="worker-intranet-01" invalid=${Boolean(show('name'))} autoFocus /><//>
        <${Field} label="部署方式"><${RadioCards} columns=${3} value=${f.mode} onChange=${(v) => setF({ ...f, mode: v })} options=${[{ value: 'docker', label: 'Docker', icon: 'Container' }, { value: 'k8s', label: 'Kubernetes', icon: 'Boxes' }, { value: 'bin', label: '安装脚本', icon: 'Terminal' }]} /><//>
        <${Field} label="最大并发" required hint="同时运行的任务数，按机器配置调整" error=${show('concurrency')}><${Input} value=${f.concurrency} onChange=${(v) => set('concurrency', v.trim())} suffix="个" invalid=${Boolean(show('concurrency'))} style=${{ width: 140 }} /><//>
        <${Field} label="节点标签" hint="用逗号分隔。工作流可以指定只在带某个标签的节点上运行，比如需要访问内网数据库时；留空则为 default" error=${show('labels')}><${Input} value=${f.labels} onChange=${(v) => set('labels', v)} placeholder="intranet" invalid=${Boolean(show('labels'))} /><//>
      <//>`}
      ${step === 1 && html`<${Fragment}>
        <div className="admin-notice"><${Alert} tone="warning">安装命令包含一次性令牌，有效期 2 小时，请勿外传。<//></div>
        <div className="admin-cmd"><${CodeBlock} code=${cmd} /><div className="admin-cmd-copy"><${CopyButton} text=${cmd} label="复制" /></div></div>
        <div className="text-xs muted admin-cmd-tip">节点只需要能访问 ${api} 的 443 端口，不需要开放任何入站端口。</div>
      <//>`}
      ${step === 2 && html`<div className="col admin-connect">
        ${connected
          ? html`<${Fragment}><${Icon} name="CircleCheck" size=${36} className="admin-ok-icon" /><b>${name} 已连接</b><span className="text-xs muted">版本 ${latest} · 最大并发 ${f.concurrency} · 标签 ${labelText}</span><//>`
          : html`<${Fragment}><${Icon} name="LoaderCircle" size=${32} className="spin admin-wait-icon" /><b>等待节点连接…</b><span className="text-xs muted">执行安装命令后，节点会在几秒内出现在这里</span><//>`}
      </div>`}
    </div>
  <//>`;
}

function AdminHealth() {
  const state = useStore();
  const [checkedAt, setCheckedAt] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    const iv = setInterval(() => setCheckedAt(Date.now()), 30000);
    return () => { clearInterval(iv); clearTimeout(timer.current); };
  }, []);
  const refresh = () => {
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCheckedAt(Date.now()); setLoading(false); toast.success('已重新检查'); }, 600);
  };
  const live = state.workflows.filter((w) => w.status === 'enabled' && w.published);
  const schedules = live.filter((w) => w.trigger.connector === 'schedule').length;
  const polling = live.filter((w) => { const c = resolveConnector(w.trigger.connector); const t = c && c.triggers.find((x) => x.key === w.trigger.op); return t && t.type === 'polling'; }).length;
  const hooks = live.filter((w) => w.trigger.connector === 'webhook').length;
  const received = state.runs.filter((r) => r.startedAt > checkedAt - DAY && r.triggerType === 'Webhook' && r.kind !== 'debug').length;
  const workers = state.workers;
  const online = workers.filter((w) => w.status === 'online');
  const offline = workers.filter((w) => w.status === 'offline');
  const latest = adminLatestVersion(workers);
  const outdated = workers.filter((w) => adminVersionCmp(w.version, latest) < 0);
  const capacity = online.reduce((a, w) => a + w.concurrency, 0);
  const backlog = Math.max(0, runMetrics(state.runs).running - capacity);
  const catalog = CONNECTORS.filter((c) => !c.builtin).length;
  const customCount = state.customConnectors.filter((c) => c.status === 'published').length;
  const sys = sysOf(state);
  const smtp = sys.services.smtp;
  const storage = sys.services.storage;
  const registry = sysServiceStatus('registry', state);
  const lastOk = sysLatestBackup(sys);
  const newest = [...sys.backups].sort((a, b) => b.at - a.at)[0];
  const backupAge = lastOk ? checkedAt - lastOk.at : Infinity;
  const update = sysUpdateView(sys);
  const ims = adminImEnabled(state.sso).map((x) => x.label);
  const workerText = [
    online.length ? `${online.length} 个节点在线` : '没有在线节点',
    ...offline.map((w) => `${w.host} 离线（最后心跳 ${fmt.relative(w.heartbeatAt)}）`),
    ...(outdated.length ? [`${outdated.length} 个节点版本落后于 ${latest}`] : []),
  ].join(' · ');
  const checks = [
    { name: '数据库', icon: 'Database', st: 'ok', desc: 'PostgreSQL · 连接正常' },
    { name: '缓存与队列', icon: 'Layers', st: backlog ? 'warn' : 'ok', desc: `Redis · 队列积压 ${backlog}` },
    { name: '触发器调度', icon: 'AlarmClock', st: 'ok', desc: `${schedules} 个定时触发器 · ${polling} 个轮询触发器在运行` },
    { name: 'Webhook 接收', icon: 'Globe', st: 'ok', desc: `${hooks} 个 Webhook 触发器 · 过去 24 小时接收 ${fmt.number(received)} 次` },
    { name: '文件存储', icon: 'HardDrive', st: 'ok', desc: storage.configured ? `对象存储 · ${storage.bucket}` : `本地磁盘 · 数据目录 /data · 剩余 ${sysGb(sysDisk(state).free)} GB。部署多个应用实例时需要配置对象存储`, to: '/admin/system?tab=services', action: storage.configured ? '查看' : '配置' },
    { name: '连接器仓库', icon: 'Store', st: registry === 'ok' ? 'ok' : registry === 'error' ? 'warn' : 'off', desc: registry === 'ok' ? `${sys.services.registry.mode === 'mirror' ? '自建镜像' : '官方仓库'}已连接 · ${catalog} 个官方连接器可用，另有 ${customCount} 个已发布的自定义连接器` : registry === 'error' ? `无法连接官方仓库，服务器不能访问外网，只能使用内置的 ${catalog} 个连接器` : `未配置，只能使用镜像内置的 ${catalog} 个连接器，不能在线安装和更新`, to: '/admin/system?tab=services', action: registry === 'ok' ? '查看' : '配置' },
    { name: '邮件（SMTP）', icon: 'Mail', st: smtp.configured ? 'ok' : 'off', desc: smtp.configured ? `${smtp.host}:${smtp.port} · 发件人 ${smtp.from}` : `未配置，邮件通知和邀请邮件不可用，通知会通过${adminJoin(['站内通知', ...ims])}发送`, to: '/admin/system?tab=services', action: smtp.configured ? '查看' : '去配置' },
    { name: '备份', icon: 'DatabaseBackup', st: !lastOk ? 'error' : (newest && newest.status === 'failed') || backupAge > 26 * HOUR ? 'warn' : !sys.backupPolicy.enabled ? 'warn' : 'ok', desc: !lastOk ? '还没有成功的备份' : `最近一次成功备份在 ${fmt.relative(lastOk.at)}${newest && newest.status === 'failed' ? ` · 最近一次备份失败：${newest.error || '原因未知'}` : ''} · ${sys.backupPolicy.enabled ? `${sysScheduleText(sys.backupPolicy)} 自动备份` : '自动备份已关闭'}`, to: '/admin/backup', action: '查看' },
    { name: '版本', icon: 'CircleArrowUp', st: update.failed ? 'warn' : update.release ? 'info' : 'ok', desc: update.failed ? `当前 ${sys.version} · 无法连接更新服务器` : update.release ? `当前 ${sys.version} · 有新版本 ${update.release.version}${update.release.breaking.length ? `，包含 ${update.release.breaking.length} 项破坏性变更` : ''}` : `当前 ${sys.version} · 已是最新版本`, to: '/admin/system', action: update.release ? '升级步骤' : '查看' },
    { name: '工作节点', icon: 'Cpu', st: !online.length ? 'error' : offline.length || outdated.length ? 'warn' : 'ok', desc: workerText, to: '/admin/workers', action: '查看' },
  ];
  const tone = { ok: ['success', 'CircleCheck', '正常'], warn: ['warning', 'TriangleAlert', '需关注'], error: ['danger', 'CircleX', '异常'], off: ['default', 'CircleMinus', '未配置'], info: ['info', 'CircleArrowUp', '有更新'] };
  const attention = checks.filter((c) => ['warn', 'error'].includes(c.st)).length;
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="健康状态" description="平台组件的运行状况，每 30 秒自动检查一次" actions=${html`<${Button} icon="RefreshCw" loading=${loading} onClick=${refresh}>重新检查<//>`} />
    <div className="card admin-health-banner">
      <div className="row"><${Icon} name=${attention ? 'TriangleAlert' : 'HeartPulse'} size=${20} className=${attention ? 'admin-warn-icon' : 'admin-ok-icon'} /><b>${attention ? `有 ${attention} 项需要关注` : '平台运行正常'}</b><span className="spacer" /><span className="text-xs muted">节点版本 ${latest} · 上次检查 ${fmt.dateTime(checkedAt).slice(11)}</span></div>
    </div>
    <div className="col admin-health-list">
      ${checks.map((c) => html`<div key=${c.name} className="card sso-row">
        <${KindTile} icon=${c.icon} size=${34} />
        <div className="grow"><b>${c.name}</b><div className="text-xs muted">${c.desc}</div></div>
        <${Tag} tone=${tone[c.st][0]} icon=${tone[c.st][1]}>${tone[c.st][2]}<//>
        <div className="admin-health-act">${c.to && html`<${Button} size="sm" variant=${['warn', 'error', 'off'].includes(c.st) ? 'outline' : 'ghost'} onClick=${() => navigate(c.to)}>${c.action}<//>`}</div>
      </div>`)}
    </div>
  </div></div>`;
}

function AccountPage() {
  const state = useStore();
  const me = state.users.find((u) => u.id === state.me);
  const [name, setName] = useState(me ? me.name : '');
  const [creating, setCreating] = useState(false);
  if (!me) return html`<div className="page"><${Empty} icon="UserX" title="找不到当前用户" description="账号可能已被移除，请重新登录。" action=${html`<${Button} onClick=${() => navigate('/login')}>去登录<//>`} /></div>`;
  const nameError = !name.trim() ? '请输入姓名' : null;
  const nameDirty = name.trim() !== me.name;
  const saveName = () => {
    patchList('users', me.id, { name: name.trim() });
    addAudit('修改个人信息', name.trim());
    toast.success('已保存');
  };
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
  const offset = -new Date().getTimezoneOffset() / 60;
  const ims = adminImEnabled(state.sso);
  const smtp = sysSmtpReady(state);
  const events = [['runFailed', '我的工作流运行失败', true], ['connExpired', '我的连接授权失效', true], ['shared', '被加入项目或分享资源', true], ['weekly', '每周运行摘要', false]];
  const prefs = me.notify || {};
  const prefOf = (k, ch, def) => (prefs[k] && typeof prefs[k][ch] === 'boolean' ? prefs[k][ch] : def);
  const setPref = (k, ch, v) => patchList('users', me.id, (u) => ({ notify: { ...(u.notify || {}), [k]: { ...((u.notify || {})[k] || {}), [ch]: v } } }));
  const tokens = state.tokens || [];
  const revoke = async (t) => {
    if (!(await confirmDialog({ title: `吊销令牌「${t.name}」？`, content: '吊销后，使用这个令牌的脚本和 CLI 会立即无法调用平台。', okText: '吊销', danger: true }))) return;
    removeFromList('tokens', t.id);
    addAudit('吊销访问令牌', t.name);
    toast.success('已吊销');
  };
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="个人设置" />
    <div className="account-grid">
      <${Card} title="个人信息">
        <div className="row admin-profile"><${Avatar} name=${me.name} size=${56} /><div className="grow"><div className="admin-profile-name">${me.name}</div><div className="text-xs muted">${me.email}</div></div></div>
        <${Field} label="姓名" required error=${nameError}>
          <div className="row"><div className="grow"><${CharInput} value=${name} onChange=${setName} max=${20} invalid=${Boolean(nameError)} /></div>${nameDirty && html`<${Fragment}><${Button} onClick=${() => setName(me.name)}>取消<//><${Button} variant="primary" disabled=${Boolean(nameError)} onClick=${saveName}>保存<//><//>`}</div>
        <//>
        <div className="kv">
          <div><span>邮箱</span><span>${me.email}</span></div>
          <div><span>部门</span><span>${me.dept || '未分配'}</span></div>
          <div><span>平台角色</span><span>${me.role === 'owner' ? '所有者' : me.role === 'admin' ? '管理员' : '成员'}</span></div>
          <div><span>模块权限</span><span>${(me.modules || []).map(adminModuleLabel).join('、')}</span></div>
          <div><span>界面语言</span><span>简体中文</span></div>
          <div><span>时区</span><span>跟随浏览器${tz ? `（${tz}，GMT${offset >= 0 ? '+' : ''}${offset}）` : ''}</span></div>
        </div>
      <//>
      <div className="col admin-account-side">
        <${Card} title="外观">
          <${Field} label="主题"><${Segmented} value=${state.theme} onChange=${(v) => Store.set((s) => ({ ...s, theme: v }))} options=${[{ value: 'light', label: '浅色', icon: 'Sun' }, { value: 'dark', label: '深色', icon: 'Moon' }]} /><//>
        <//>
        <${Card} title="通知偏好" subtitle="站内通知始终开启">
          ${events.map(([k, label, def]) => html`<div key=${k} className="row admin-pref-row">
            <span className="grow">${label}</span>
            ${ims.length ? ims.map((im) => html`<${Checkbox} key=${im.key} label=${im.label} checked=${prefOf(k, im.key, def)} onChange=${(v) => setPref(k, im.key, v)} />`) : html`<${Tooltip} content="没有启用飞书、企业微信或钉钉登录"><${Checkbox} label="即时通讯" checked=${false} disabled /><//>`}
            ${smtp ? html`<${Checkbox} label="邮件" checked=${prefOf(k, 'email', false)} onChange=${(v) => setPref(k, 'email', v)} />` : html`<${Tooltip} content="管理员还没有配置邮件服务（SMTP）"><${Checkbox} label="邮件" checked=${false} disabled /><//>`}
          </div>`)}
        <//>
      </div>
      <${Card} title="个人访问令牌" subtitle="用于通过 API 或 CLI 调用平台，令牌拥有你的全部权限" extra=${html`<${Button} size="sm" icon="Plus" onClick=${() => setCreating(true)}>新建令牌<//>`}>
        <${Table} dense columns=${[
          { key: 'n', title: '名称', render: (t) => html`<span className="cell-title">${t.name}</span>` },
          { key: 'c', title: '创建时间', width: 120, render: (t) => fmt.date(t.createdAt) },
          { key: 'e', title: '过期时间', width: 120, render: (t) => (t.expiresAt ? html`<span className=${t.expiresAt < Date.now() ? 'admin-expired' : ''}>${fmt.date(t.expiresAt)}</span>` : '永不过期') },
          { key: 'u', title: '最近使用', width: 120, render: (t) => html`<span className="muted">${adminRelative(t.lastUsedAt, '从未使用')}</span>` },
          { key: 'o', title: '', width: 70, render: (t) => html`<a className="link is-danger" onClick=${() => revoke(t)}>吊销</a>` },
        ]} data=${tokens} empty=${html`<${Empty} size="sm" icon="KeyRound" title="还没有访问令牌" />`} />
      <//>
    </div>
    ${creating && html`<${AdminTokenModal} onClose=${() => setCreating(false)} />`}
  </div></div>`;
}

function AdminTokenModal({ onClose }) {
  const state = useStore();
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('90');
  const [touched, setTouched] = useState(false);
  const [secret, setSecret] = useState(null);
  const tokens = state.tokens || [];
  const error = !name.trim() ? '请输入令牌名称' : tokens.some((t) => t.name === name.trim()) ? '已经有同名的令牌' : null;
  const create = () => {
    const now = Date.now();
    const t = { id: uid('tk'), name: name.trim(), createdAt: now, lastUsedAt: null, expiresAt: expiry === 'never' ? null : now + Number(expiry) * DAY };
    Store.set((s) => ({ ...s, tokens: [t, ...(s.tokens || [])] }));
    addAudit('创建访问令牌', t.name);
    setSecret(adminSecret('pat_', 32));
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${secret ? '令牌已创建' : '新建访问令牌'} width=${500} footer=${secret ? html`<${Button} variant="primary" onClick=${onClose}>我已保存<//>` : html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${Boolean(error)} onClick=${create}>创建<//><//>`}>
    ${secret
      ? html`<${Fragment}>
        <div className="admin-notice"><${Alert} tone="warning" title="令牌只会显示这一次">关闭后无法再次查看，请立即复制并保存到安全的地方。<//></div>
        <div className="webhook-url"><span className="url">${secret}</span><${CopyButton} text=${secret} /></div>
      <//>`
      : html`<${Fragment}>
        <${Field} label="令牌名称" required hint="写明用途，方便以后识别，例如 CI 发布脚本" error=${touched ? error : null}><${CharInput} value=${name} onChange=${(v) => { setName(v); setTouched(true); }} max=${30} autoFocus invalid=${Boolean(touched && error)} /><//>
        <${Field} label="有效期"><${Select} value=${expiry} onChange=${setExpiry} options=${[{ value: '30', label: '30 天' }, { value: '90', label: '90 天' }, { value: '365', label: '1 年' }, { value: 'never', label: '永不过期' }]} /><//>
      <//>`}
  <//>`;
}

function LoginPage() {
  const state = useStore();
  const a = state.tenant.appearance;
  const sso = state.sso;
  const methods = adminLoginMethods(sso);
  const pwd = Boolean(sso.password && sso.password.enabled);
  const me = state.users.find((u) => u.id === state.me);
  const [email, setEmail] = useState(me ? me.email : '');
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const signIn = (how) => {
    setLoading(how);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setLoading(null); navigate('/'); toast.success(`欢迎回来，${personName(state.me)}`); }, 800);
  };
  const emailError = !email.trim() ? '请输入邮箱' : !ADMIN_EMAIL_RE.test(email.trim()) ? '邮箱格式不正确' : null;
  const pwdError = !password ? '请输入密码' : null;
  const submit = () => {
    setTried(true);
    setError(null);
    if (emailError || pwdError) return;
    const u = state.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) { setError('邮箱或密码不正确'); return; }
    if (u.status === 'disabled') { setError('账号已被禁用，请联系管理员'); return; }
    if (u.status === 'invited') { setError('账号还没有激活，请先按邀请通知设置密码'); return; }
    if (u.id !== state.me) { setError(`演示环境只能以当前用户（${personName(state.me)}）登录`); return; }
    signIn('password');
  };
  const forgot = () => {
    if (!sysSmtpReady(state)) { toast.info('没有配置邮件服务，请联系管理员在「用户管理」中重置密码'); return; }
    if (emailError) { setTried(true); return; }
    toast.info(`演示环境不会真的发送邮件。真实环境会向 ${email.trim()} 发送重置密码的链接`);
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); };
  const icons = { oidc: 'KeySquare', saml: 'ShieldCheck' };
  const solo = !pwd && methods.length === 1;
  return html`<div className="login">
    <div className="login-brand">
      <div className="row"><span className="login-logo"><img src=${a.logo || 'assets/logo.svg'} alt="" /></span><b className="admin-login-name">${a.productName}</b></div>
      <div className="admin-login-hero">
        ${a.welcome && html`<div className="login-slogan admin-login-slogan">${a.welcome}</div>`}
        <div className="login-flow admin-login-flow">
          ${['Users', 'Landmark', 'Handshake', 'MessagesSquare'].map((ic, i) => html`<${Fragment} key=${ic}>${i > 0 && html`<span className="login-flow-line" />`}<${KindTile} icon=${ic} size=${40} /><//>`)}
        </div>
      </div>
      <div className="login-foot">${state.tenant.name}</div>
    </div>
    <div className="login-main">
      <div className="login-card">
        <h1 className="page-title">登录到 ${a.productName}</h1>
        <div className="muted admin-login-domain">${state.tenant.domain}</div>
        ${pwd && html`<div className="admin-login-form">
          <${Field} label="邮箱" error=${tried ? emailError : null}><${Input} size="lg" value=${email} onChange=${(v) => { setEmail(v); setError(null); }} onKeyDown=${onKey} invalid=${Boolean(tried && emailError)} /><//>
          <${Field} label="密码" error=${tried ? pwdError : null} extra=${html`<a className="link text-xs" onClick=${forgot}>忘记密码</a>`}><${Input} size="lg" type="password" value=${password} onChange=${(v) => { setPassword(v); setError(null); }} onKeyDown=${onKey} invalid=${Boolean(tried && pwdError)} autoFocus /><//>
          ${error && html`<div className="admin-login-error"><${Alert} tone="danger">${error}<//></div>`}
          <${Button} variant="primary" size="lg" block loading=${loading === 'password'} disabled=${Boolean(loading) && loading !== 'password'} onClick=${submit}>登录<//>
        </div>`}
        ${pwd && methods.length > 0 && html`<div className="login-or"><span>或</span></div>`}
        ${methods.length > 0 && html`<div className="col admin-login-methods">
          ${methods.map((k) => html`<${Button} key=${k} variant=${solo ? 'primary' : 'outline'} size="lg" block icon=${icons[k]} loading=${loading === k} disabled=${Boolean(loading) && loading !== k} onClick=${() => signIn(k)}>${ADMIN_SSO_META[k].connector ? html`<span className="row admin-login-btn"><span className="row" aria-hidden="true"><${ConnectorIcon} id=${ADMIN_SSO_META[k].connector} size=${18} /></span><span>${ADMIN_LOGIN_LABELS[k]}</span></span>` : ADMIN_LOGIN_LABELS[k]}<//>`)}
        </div>`}
        ${!pwd && !methods.length && html`<${Empty} size="sm" icon="LockKeyhole" title="还没有可用的登录方式" description="请联系管理员在「登录与安全」中启用至少一种登录方式。" />`}
      </div>
    </div>
  </div>`;
}
