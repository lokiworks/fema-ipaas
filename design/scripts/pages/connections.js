function connectionUsage(state, connId) {
  return state.workflows.filter((w) => allNodes(w).some((n) => n.connectionId === connId || (n.kind === 'ai' && n.config && n.config.connectionId === connId)));
}

function connsConnectorName(id) {
  const c = resolveConnector(id);
  return c ? c.name : '已下架的连接器';
}

function connsReferences(state, connId) {
  return {
    workflows: connectionUsage(state, connId),
    mcp: (state.mcpServices || []).filter((s) => Object.values(s.fixedConnections || {}).includes(connId)),
    variables: (state.variables || []).filter((v) => v.type === 'connection' && Object.values(v.values || {}).includes(connId)),
  };
}

function connsIsAdmin(state) {
  const me = state.users.find((u) => u.id === state.me);
  return Boolean(me && ['owner', 'admin'].includes(me.role));
}

function connsCanManage(state, conn) {
  const perm = connectionPerm(state, conn);
  return perm === 'owner' || perm === 'edit';
}

function connsDefaultName(state, c) {
  return connsUniqueName(state, `${c.name}${/[）)]$/.test(c.name) ? '' : ' '}连接`);
}

function connsUniqueName(state, base, exceptId) {
  const taken = new Set(state.connections.filter((c) => c.id !== exceptId && connectionPerm(state, c)).map((c) => c.name));
  const root = base.slice(0, 26);
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root} ${i}`)) i += 1;
  return `${root} ${i}`;
}

function connsTrim(value) {
  return String(value ?? '').trim();
}

function connsMask(secret) {
  const s = connsTrim(secret);
  const m = /^([A-Za-z]{2,8}[-_](?:[A-Za-z]{2,8}[-_])?)/.exec(s);
  return `${m ? m[1] : ''}…${s.slice(-4)}`;
}

function connsHost(url) {
  try { return new URL(url).host; } catch (e) { return ''; }
}

function connsIsUrl(value) {
  try {
    const u = new URL(connsTrim(value));
    return ['http:', 'https:'].includes(u.protocol) && Boolean(u.host);
  } catch (e) {
    return false;
  }
}

function connsDirectOauth(conn) {
  return conn.authType === 'oauth2' && Boolean(resolveConnector(conn.connector)) && (conn.connector !== 'feishu' || /用户授权/.test(conn.account || ''));
}

function connsInitialFields(c, existing) {
  if (!c) return {};
  if (CONNS_DB_PORT[c.id]) return { port: CONNS_DB_PORT[c.id], ssl: true };
  if (c.id === 'feishu' && existing) {
    const app = CONNS_FEISHU_APPS.find((a) => (existing.account || '').includes(a.value) || (existing.account || '').includes(a.label));
    return app ? { app: app.value } : {};
  }
  return {};
}

function connsFormSpec(c) {
  if (!c) return { fields: [], account: () => '' };
  const cc = c.custom ? (Store.get().customConnectors || []).find((x) => x.id === c.id) : null;
  const auth = (cc && cc.auth) || {};
  if (c.auth === 'apikey') {
    const keyName = auth.keyName;
    const extra = {
      beisen: [{ key: 'tenant', label: '租户 ID', required: true, mono: true, placeholder: 'tenant-80321' }],
      'aliyun-oss': [{ key: 'endpoint', label: 'Endpoint', required: true, mono: true, placeholder: 'oss-cn-hangzhou.aliyuncs.com' }],
      gitlab: [{ key: 'site', label: '实例地址', format: 'url', placeholder: 'https://gitlab.com', hint: '自建实例填写实例地址，留空则连接 gitlab.com' }],
    }[c.id] || [];
    const help = keyName ? `调用时放在${auth.location === 'query' ? '查询参数' : '请求头'} ${keyName} 中` : `在 ${c.name} 的开发者设置中生成`;
    return {
      fields: [...extra.map((f) => ({ ...f, wide: true })), { key: 'apiKey', label: keyName || 'API Key', required: true, secret: true, wide: true, min: 8, placeholder: `粘贴 ${keyName || 'API Key'}`, help }],
      account: (v) => {
        const tail = connsMask(v.apiKey);
        if (c.id === 'beisen') return connsTrim(v.tenant);
        if (c.id === 'aliyun-oss') return `${connsTrim(v.endpoint)} · ${tail}`;
        if (c.id === 'gitlab') return `${connsHost(connsTrim(v.site)) || 'gitlab.com'} · ${tail}`;
        return keyName ? `${keyName} · ${tail}` : tail;
      },
    };
  }
  if (c.auth === 'basic') {
    const site = c.custom ? [] : [{ key: 'site', label: '站点地址', required: true, format: 'url', wide: true, placeholder: c.id === 'jira' ? 'https://your-domain.atlassian.net' : 'https://' }];
    return {
      fields: [...site, { key: 'username', label: '用户名 / 邮箱', required: true }, { key: 'password', label: c.id === 'jira' ? 'API Token' : '密码', required: true, secret: true }],
      account: (v) => connsTrim(v.username),
    };
  }
  if (c.auth === 'client') {
    return {
      fields: [{ key: 'clientId', label: 'Client ID', required: true, mono: true }, { key: 'clientSecret', label: 'Client Secret', required: true, secret: true }],
      account: (v) => connsTrim(v.clientId),
    };
  }
  if (['mysql', 'postgres', 'snowflake'].includes(c.id)) {
    return {
      fields: [
        { key: 'host', label: '主机', required: true, mono: true, format: 'host', placeholder: '10.2.3.14' },
        { key: 'port', label: '端口', required: true, mono: true, format: 'port' },
        { key: 'db', label: '数据库', required: true, mono: true },
        { key: 'username', label: '用户名', required: true, mono: true },
        { key: 'password', label: '密码', required: true, secret: true, wide: true },
        { key: 'ssl', label: '使用 SSL 连接', type: 'switch', wide: true },
      ],
      account: (v) => `${connsTrim(v.username)}@${connsTrim(v.host)}:${connsTrim(v.port)}/${connsTrim(v.db)}`,
      note: '请确认数据库允许平台工作节点所在的网络访问。',
    };
  }
  if (c.id === 'redis') {
    return {
      fields: [
        { key: 'host', label: '主机', required: true, mono: true, format: 'host', placeholder: '10.2.3.20' },
        { key: 'port', label: '端口', required: true, mono: true, format: 'port' },
        { key: 'password', label: '密码', required: true, secret: true },
        { key: 'db', label: '数据库编号', mono: true, format: 'dbindex', placeholder: '0' },
        { key: 'ssl', label: '使用 TLS 连接', type: 'switch', wide: true },
      ],
      account: (v) => `${connsTrim(v.host)}:${connsTrim(v.port)}/${connsTrim(v.db) || 0}`,
      note: '请确认 Redis 允许平台工作节点所在的网络访问。',
    };
  }
  if (c.id === 'netsuite') {
    return {
      fields: [
        { key: 'accountId', label: 'Account ID', required: true, mono: true, wide: true, placeholder: '1234567_SB1' },
        { key: 'consumerKey', label: 'Consumer Key', required: true, mono: true },
        { key: 'consumerSecret', label: 'Consumer Secret', required: true, secret: true },
        { key: 'tokenId', label: 'Token ID', required: true, mono: true },
        { key: 'tokenSecret', label: 'Token Secret', required: true, secret: true },
      ],
      account: (v) => `Account ${connsTrim(v.accountId)}`,
    };
  }
  return {
    fields: [
      { key: 'site', label: '服务器地址', required: true, format: 'url', wide: true, placeholder: 'https://' },
      { key: 'acct', label: '账套 ID', required: true, mono: true },
      { key: 'username', label: '用户名', required: true },
      { key: 'appId', label: '应用 ID', required: true, mono: true },
      { key: 'appSecret', label: '应用密钥', required: true, secret: true },
    ],
    account: (v) => `账套 ${connsTrim(v.acct)} · ${connsTrim(v.username)}`,
  };
}

function connsValidate(f, value) {
  if (f.type === 'switch') return null;
  const v = connsTrim(value);
  const label = /^[A-Za-z]/.test(f.label) ? ` ${f.label}` : f.label;
  if (!v) return f.required ? `请填写${label}` : null;
  if (f.format === 'url' && !connsIsUrl(v)) return '请输入以 http:// 或 https:// 开头的地址';
  if (f.format === 'port' && !(/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535)) return '端口需为 1-65535 之间的整数';
  if (f.format === 'host' && /[\s/:]/.test(v)) return '只填写主机名或 IP，不要包含协议、端口或路径';
  if (f.format === 'dbindex' && !(/^\d+$/.test(v) && Number(v) <= 15)) return '数据库编号需为 0-15 之间的整数';
  if (f.min && v.length < f.min) return `${f.label} 长度不足，请检查是否复制完整`;
  return null;
}

function ConnsPermTag({ perm }) {
  const meta = CONNS_PERM[perm];
  if (!meta) return html`<span className="muted">-</span>`;
  return html`<${Tag} size="sm" tone=${meta.tone}>${meta.label}<//>`;
}

function ConnsScopeCell({ conn }) {
  const state = useStore();
  if (conn.scope === 'tenant') return html`<${Tag} size="sm" tone="primary" icon="Globe">全部项目<//>`;
  const list = (conn.projectIds || []).map((pid) => state.projects.find((p) => p.id === pid)).filter(Boolean);
  if (!list.length) return html`<span className="muted">无可用项目</span>`;
  const [first, ...rest] = list;
  return html`<span className="row-4 conns-scope">
    <${Tag} size="sm">${first.name}<//>
    ${rest.length > 0 && html`<${Tooltip} content=${rest.map((p) => p.name).join('、')}><${Tag} size="sm" tone="outline">+${rest.length}<//><//>`}
  </span>`;
}

function ConnsUsageCell({ conn }) {
  const state = useStore();
  const used = connectionUsage(state, conn.id);
  if (!used.length) return html`<span className="muted">未引用</span>`;
  return html`<span className="conns-usage" onClick=${(e) => e.stopPropagation()}>
    <${Popover} width=${300} trigger=${html`<button type="button" className="link conns-usage-link">${used.length} 个工作流</button>`}>
      ${({ close }) => html`<div className="conns-usage-pop">
        <div className="conns-usage-head">使用「${conn.name}」的工作流</div>
        ${used.map((w) => {
          const allowed = Boolean(projectRole(state, w.projectId));
          const p = state.projects.find((x) => x.id === w.projectId);
          return html`<button key=${w.id} type="button" className=${cx('menu-item', !allowed && 'is-disabled')} disabled=${!allowed} onClick=${() => { close(); navigate(`/integration/${w.projectId}/wf/${w.id}`); }}>
            <${WorkflowGlyph} wf=${w} size=${16} />
            <span className="menu-item-body">
              <span className="menu-item-label">${w.name}</span>
              <span className="menu-item-desc">${allowed ? (p ? p.name : '') : '你不是该项目的成员'}</span>
            </span>
          </button>`;
        })}
      </div>`}
    <//>
  </span>`;
}

function ConnectionsPage() {
  const state = useStore();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [app, setApp] = useState(null);
  const [status, setStatus] = useState(null);
  const [project, setProject] = useState(null);
  const [owned, setOwned] = useState('all');
  const [modal, setModal] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [missing, setMissing] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const linkId = route.query.id;
  useEffect(() => {
    if (!linkId) return;
    const s = Store.get();
    const conn = s.connections.find((x) => x.id === linkId);
    if (!conn || !connectionPerm(s, conn)) {
      setMissing(true);
      setDetailId(null);
      return;
    }
    setMissing(false);
    setQ('');
    setApp(null);
    setStatus(null);
    setProject(null);
    setOwned('all');
    setDetailId(linkId);
    setFocusTick((t) => t + 1);
  }, [linkId]);
  useEffect(() => {
    if (!focusTick) return undefined;
    const raf = requestAnimationFrame(() => {
      const row = document.querySelector('.conns-row-focus');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusTick]);
  const closeDetail = () => {
    setDetailId(null);
    if (route.query.id) navigate('/connections', { replace: true });
  };
  const visible = state.connections.filter((c) => connectionPerm(state, c));
  const myProjects = state.projects.filter((p) => projectRole(state, p.id));
  const needle = q.trim().toLowerCase();
  const list = visible.filter((c) => {
    const perm = connectionPerm(state, c);
    if (needle && !`${c.name} ${c.account || ''} ${connsConnectorName(c.connector)}`.toLowerCase().includes(needle)) return false;
    if (app && c.connector !== app) return false;
    if (status && (status === 'active') !== (c.status === 'active')) return false;
    if (project && !connAvailableIn(c, project)) return false;
    if (owned === 'mine' && perm !== 'owner') return false;
    if (owned === 'shared' && perm === 'owner') return false;
    return true;
  });
  const filtering = Boolean(needle || app || status || project || owned !== 'all');
  const clearFilters = () => { setQ(''); setApp(null); setStatus(null); setProject(null); setOwned('all'); };
  const appOptions = [...new Set(visible.map((c) => c.connector))].map((id) => ({ value: id, label: connsConnectorName(id), iconNode: html`<${ConnectorIcon} id=${id} size=${16} />` }));
  const testConn = (c) => {
    toast.loading(`正在测试「${c.name}」…`, 900);
    setTimeout(() => {
      const s = Store.get();
      const live = s.connections.find((x) => x.id === c.id);
      if (!live) return;
      if (live.status === 'active') { toast.success(`「${live.name}」连接正常`); return; }
      if (live.pending && connsCanManage(s, live)) {
        patchList('connections', live.id, { status: 'active', error: null, pending: false, updatedAt: Date.now() });
        toast.success('测试通过，连接已可用');
        return;
      }
      toast.error(live.error || CONN_STATUS[live.status].reason);
    }, 950);
  };
  const removeConn = async (c) => {
    const s = Store.get();
    if (connectionPerm(s, c) !== 'owner') { toast.error('只有所有者可以删除连接'); return; }
    const refs = connsReferences(s, c.id);
    const names = refs.workflows.slice(0, 3).map((w) => `「${w.name}」`).join('');
    const ok = await confirmDialog({
      title: `删除连接「${c.name}」？`,
      content: html`<div>
        <div>删除后不可恢复：</div>
        <ul className="conns-consequences">
          ${refs.workflows.length
            ? html`<li className="is-danger"><b>${refs.workflows.length}</b> 个工作流正在使用这个连接（${names}${refs.workflows.length > 3 ? ' 等' : ''}），运行到相关节点会失败，需要重新选择连接</li>`
            : html`<li>目前没有工作流使用这个连接</li>`}
          ${refs.mcp.length > 0 && html`<li className="is-danger">${refs.mcp.length} 个 MCP 服务把它设为固定连接，相关工具将无法调用</li>`}
          ${refs.variables.length > 0 && html`<li className="is-danger">${refs.variables.length} 个项目配置项引用了这个连接</li>`}
          ${(c.shares || []).length > 0 && html`<li>已分享的 ${c.shares.length} 位成员将无法再使用</li>`}
        </ul>
      </div>`,
      danger: true,
      okText: '删除',
      confirmText: c.name,
    });
    if (!ok) return;
    if (detailId === c.id) closeDetail();
    removeFromList('connections', c.id);
    addAudit('删除连接', c.name, null);
    toast.success('连接已删除');
  };
  const onAction = (type, c) => {
    if (type === 'test') testConn(c);
    else if (type === 'delete') removeConn(c);
    else setModal({ type, id: c.id });
  };
  const target = modal && modal.id ? state.connections.find((x) => x.id === modal.id) || null : null;
  const formOpen = Boolean(modal && (modal.type === 'new' || (['edit', 'reauth'].includes(modal.type) && target)));
  const columns = [
    {
      key: 'name',
      title: '名称',
      render: (c) => html`<div className="cell-main">
        <${ConnectorIcon} id=${c.connector} size=${30} />
        <div className="conns-name-cell">
          <button type="button" className="cell-title conns-name-btn" onClick=${(e) => { e.stopPropagation(); setDetailId(c.id); }}>${c.name}</button>
          <div className="cell-sub">${connsConnectorName(c.connector)} · ${c.account || '-'}</div>
        </div>
      </div>`,
    },
    { key: 'status', title: '状态', width: 96, render: (c) => html`<${Tooltip} content=${c.status !== 'active' ? c.error || CONN_STATUS[c.status].reason : ''}><span className="row-4"><${Dot} tone=${CONN_STATUS[c.status].tone} />${CONN_STATUS[c.status].label}</span><//>` },
    { key: 'scope', title: '可用项目', width: 140, render: (c) => html`<${ConnsScopeCell} conn=${c} />` },
    { key: 'used', title: '被引用', width: 104, render: (c) => html`<${ConnsUsageCell} conn=${c} />` },
    { key: 'owner', title: '所有者', width: 116, render: (c) => html`<span className="owner-pill"><${Avatar} name=${personName(c.owner)} size=${18} /><span className="ellipsis">${personName(c.owner)}</span></span>` },
    { key: 'perm', title: '我的权限', width: 92, render: (c) => html`<${ConnsPermTag} perm=${connectionPerm(state, c)} />` },
    { key: 'time', title: '最后更新时间', width: 150, render: (c) => html`<span className="conns-time">${fmt.dateTime(c.updatedAt).slice(0, 16)}</span>` },
    {
      key: 'op',
      title: '操作',
      width: 156,
      render: (c) => {
        const perm = connectionPerm(state, c);
        const manage = perm === 'owner' || perm === 'edit';
        const fixable = c.status !== 'active' && Boolean(resolveConnector(c.connector));
        const primary = manage ? (fixable ? (c.pending ? 'test' : 'reauth') : 'edit') : 'view';
        const label = { test: '测试连接', reauth: '重新授权', edit: '编辑连接', view: '查看' }[primary];
        return html`<span className="row conns-ops" onClick=${(e) => e.stopPropagation()}>
          <button type="button" className="link" onClick=${() => (primary === 'view' ? setDetailId(c.id) : onAction(primary, c))}>${label}</button>
          ${manage && html`<button type="button" className="link" onClick=${() => onAction('share', c)}>分享</button>`}
          <${MoreMenu} items=${[
            { key: 'view', label: '查看详情', icon: 'PanelRight', onClick: () => setDetailId(c.id) },
            manage && { key: 'edit', label: '编辑连接', icon: 'PenLine', onClick: () => onAction('edit', c) },
            manage && resolveConnector(c.connector) && { key: 'reauth', label: '重新授权', icon: 'RefreshCw', onClick: () => onAction('reauth', c) },
            { key: 'test', label: '测试连接', icon: 'PlugZap', onClick: () => testConn(c) },
            { divider: true },
            { key: 'delete', label: '删除', icon: 'Trash2', danger: true, disabled: perm !== 'owner', desc: perm !== 'owner' ? '只有所有者可以删除' : undefined, onClick: () => removeConn(c) },
          ]} />
        </span>`;
      },
    },
  ];
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="连接"
      description="连接保存了访问第三方应用所需的账号和密钥。连接归创建人所有，可以分享给同事使用或共同编辑。"
      actions=${html`<${Button} variant="primary" icon="Plus" onClick=${() => setModal({ type: 'new' })}>新建连接<//>`}
    />
    ${missing && html`<div className="conns-banner"><${Alert} tone="warning" onClose=${() => { setMissing(false); navigate('/connections', { replace: true }); }}>链接指向的连接不存在，或者没有分享给你。<//></div>`}
    <div className="toolbar">
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索名称、账号或连接器" />
      <${Select} width=${160} clearable value=${app} onChange=${setApp} placeholder="连接的应用" options=${appOptions} />
      <${Select} width=${120} clearable value=${status} onChange=${setStatus} placeholder="状态" options=${[{ value: 'active', label: '已连接' }, { value: 'broken', label: '未连接' }]} />
      <${Select} width=${140} clearable value=${project} onChange=${setProject} placeholder="可用项目" options=${myProjects.map((p) => ({ value: p.id, label: p.name }))} />
      <span className="spacer" />
      <${Segmented} value=${owned} onChange=${setOwned} options=${[{ value: 'all', label: '全部' }, { value: 'mine', label: '我创建的' }, { value: 'shared', label: '共享给我的' }]} />
    </div>
    <${Table}
      className="conns-table"
      columns=${columns}
      data=${list}
      onRowClick=${(c) => setDetailId(c.id)}
      rowClassName=${(c) => (c.id === detailId ? 'conns-row-focus' : '')}
      empty=${html`<${Empty}
        icon="Link2"
        title=${filtering ? '没有符合条件的连接' : '暂无连接'}
        description=${filtering ? '换个关键词，或者清除筛选条件再试试。' : '新建连接后，工作流里的节点就能以这个账号调用应用。'}
        action=${filtering ? html`<${Button} onClick=${clearFilters}>清除筛选<//>` : html`<${Button} variant="primary" icon="Plus" onClick=${() => setModal({ type: 'new' })}>新建连接<//>`}
      />`}
    />
    <${ConnectionDetailDrawer} connId=${detailId} onClose=${closeDetail} onAction=${onAction} />
    <${NewConnectionModal} open=${formOpen} onClose=${() => setModal(null)} existing=${modal && modal.type !== 'new' ? target : null} reauth=${Boolean(modal && modal.type === 'reauth')} />
    ${modal && modal.type === 'share' && target && html`<${ShareConnectionModal} connId=${target.id} onClose=${() => setModal(null)} />`}
  </div></div>`;
}

function ConnectionDetailDrawer({ connId, onClose, onAction }) {
  const state = useStore();
  const lastRef = useRef(null);
  const live = connId ? state.connections.find((x) => x.id === connId) || null : null;
  if (live) lastRef.current = live;
  const conn = live || lastRef.current;
  if (!conn) return null;
  const c = resolveConnector(conn.connector);
  const perm = connectionPerm(state, conn);
  const manage = perm === 'owner' || perm === 'edit';
  const refs = connsReferences(state, conn.id);
  const broken = conn.status !== 'active';
  const owner = state.users.find((u) => u.id === conn.owner);
  const linkable = Boolean(c) && !(c.custom && c.status !== 'published');
  const projects = (conn.projectIds || []).map((pid) => state.projects.find((p) => p.id === pid)).filter(Boolean);
  const shares = conn.shares || [];
  const extraRefs = [refs.mcp.length && `${refs.mcp.length} 个 MCP 服务把它设为固定连接`, refs.variables.length && `${refs.variables.length} 个项目配置项引用了它`].filter(Boolean);
  return html`<${Drawer}
    open=${Boolean(live)}
    onClose=${onClose}
    width=${520}
    title=${conn.name}
    subtitle=${`${c ? c.name : '已下架的连接器'} · ${AUTH_LABEL[conn.authType] || conn.authType || '-'}`}
    icon=${html`<${ConnectorIcon} id=${conn.connector} size=${32} />`}
    footer=${html`<${Fragment}>
      <${Button} icon="PlugZap" onClick=${() => onAction('test', conn)}>测试连接<//>
      <span className="spacer" />
      ${perm === 'owner' && html`<${Button} variant="danger-outline" icon="Trash2" onClick=${() => onAction('delete', conn)}>删除<//>`}
      ${manage && html`<${Button} variant="primary" icon="PenLine" onClick=${() => onAction('edit', conn)}>编辑连接<//>`}
    <//>`}
  >
    ${broken && html`<div className="conns-section">
      <${Alert}
        tone=${conn.status === 'error' ? 'danger' : 'warning'}
        title=${conn.pending ? '尚未测试连接' : CONN_STATUS[conn.status].reason}
        action=${manage && c ? html`<${Button} size="xs" variant="primary" onClick=${() => onAction(conn.pending ? 'test' : 'reauth', conn)}>${conn.pending ? '测试连接' : '重新授权'}<//>` : null}
      >
        ${conn.error || '连接当前不可用'}
        ${!manage && html`<div className="conns-alert-note">你只能使用这个连接，需要所有者${personName(conn.owner)}或有编辑权限的成员重新授权。</div>`}
        ${manage && !c && html`<div className="conns-alert-note">连接器已下架，无法重新授权。</div>`}
      <//>
    </div>`}
    <div className="conns-section">
      <div className="conns-section-title">基本信息</div>
      <div className="kv conns-kv">
        <div><span>连接器</span><span className="row-4">
          <${ConnectorIcon} id=${conn.connector} size=${16} />
          ${linkable ? html`<${Link} to=${`/connectors/${c.id}`} className="link">${c.name}<//>` : html`<span>${c ? c.name : '已下架的连接器'}</span>`}
        </span></div>
        <div><span>状态</span><span className="row-4"><${Dot} tone=${CONN_STATUS[conn.status].tone} />${conn.pending ? '尚未测试' : CONN_STATUS[conn.status].label}</span></div>
        <div><span>认证方式</span><span>${AUTH_LABEL[conn.authType] || conn.authType || '-'}</span></div>
        <div><span>账号</span><span className="mono conns-break">${conn.account || '-'}</span></div>
        <div><span>可用范围</span><span className="conns-tags">
          ${conn.scope === 'tenant'
            ? html`<${Tag} size="sm" tone="primary" icon="Globe">全部项目<//>`
            : projects.length
              ? projects.map((p) => html`<${Tag} key=${p.id} size="sm">${p.name}<//>`)
              : html`<span className="muted">无可用项目</span>`}
        </span></div>
        <div><span>所有者</span><span className="row-4"><${Avatar} name=${personName(conn.owner)} size=${18} /><span>${personName(conn.owner)}</span>${owner && html`<span className="muted conns-email">${owner.email}</span>`}</span></div>
        <div><span>我的权限</span><span><${ConnsPermTag} perm=${perm} /></span></div>
        <div><span>创建时间</span><span>${fmt.dateTime(conn.createdAt)}</span></div>
        <div><span>最后更新时间</span><span>${fmt.dateTime(conn.updatedAt)}</span></div>
      </div>
      ${perm === 'use' && html`<div className="conns-note">你对这个连接只有使用权限。编辑、分享和重新授权需要所有者授予「可编辑」权限。</div>`}
    </div>
    <div className="conns-section">
      <div className="conns-section-title">被引用<span className="conns-count-badge">${refs.workflows.length}</span></div>
      ${refs.workflows.length === 0
        ? html`<div className="conns-empty-line">还没有工作流使用这个连接</div>`
        : html`<div className="conns-ref-list">${refs.workflows.map((w) => {
          const allowed = Boolean(projectRole(state, w.projectId));
          const p = state.projects.find((x) => x.id === w.projectId);
          return html`<button key=${w.id} type="button" className=${cx('attention-row', !allowed && 'is-disabled')} disabled=${!allowed} onClick=${() => navigate(`/integration/${w.projectId}/wf/${w.id}`)}>
            <${WorkflowGlyph} wf=${w} size=${16} />
            <span className="grow ellipsis">${w.name}</span>
            <span className="text-xs muted">${allowed ? (p ? p.name : '') : '你不是该项目的成员'}</span>
            <${Icon} name="ChevronRight" size=${14} className="muted" />
          </button>`;
        })}</div>`}
      ${extraRefs.length > 0 && html`<div className="conns-note">另外，${extraRefs.join('；')}。</div>`}
    </div>
    <div className="conns-section">
      <div className="conns-section-head">
        <span className="conns-section-title">分享<span className="conns-count-badge">${shares.length}</span></span>
        ${manage && html`<${Button} size="xs" icon="UserPlus" onClick=${() => onAction('share', conn)}>管理分享<//>`}
      </div>
      <div className="member-list">
        <div className="member-row">
          <${Avatar} name=${personName(conn.owner)} size=${26} />
          <div className="grow"><div>${personName(conn.owner)}${conn.owner === state.me && html`<span className="conns-self">（我）</span>`}</div></div>
          <span className="muted conns-member-perm">所有者</span>
        </div>
        ${shares.map((s) => html`<div key=${s.userId} className="member-row">
          <${Avatar} name=${personName(s.userId)} size=${26} />
          <div className="grow"><div>${personName(s.userId)}${s.userId === state.me && html`<span className="conns-self">（我）</span>`}</div></div>
          <span className="muted conns-member-perm">${CONNS_PERM[s.perm] ? CONNS_PERM[s.perm].label : s.perm}</span>
        </div>`)}
      </div>
    </div>
  <//>`;
}

function SecretInput({ value, onChange, placeholder, invalid, readOnly }) {
  const [show, setShow] = useState(false);
  return html`<${Input}
    type=${show ? 'text' : 'password'}
    value=${value}
    onChange=${onChange}
    placeholder=${placeholder}
    invalid=${invalid}
    readOnly=${readOnly}
    mono
    suffix=${html`<button type="button" className="input-clear" onClick=${() => setShow(!show)} aria-label=${show ? '隐藏' : '显示'}><${Icon} name=${show ? 'EyeOff' : 'Eye'} size=${14} /></button>`}
  />`;
}

function NewConnectionModal({ open, onClose, presetConnector, presetProject, onCreated, existing, reauth }) {
  const state = useStore();
  const [connector, setConnector] = useState(null);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [fields, setFields] = useState({});
  const [authKind, setAuthKind] = useState('tenant');
  const [credMode, setCredMode] = useState('pick');
  const [scope, setScope] = useState('project');
  const [projects, setProjects] = useState([]);
  const [updateCreds, setUpdateCreds] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauth, setOauth] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    clearTimeout(timer.current);
    setLoading(false);
    if (!open) {
      setOauth(false);
      return;
    }
    const s = Store.get();
    const id = existing ? existing.connector : presetConnector || null;
    const first = resolveConnector(id);
    setConnector(id);
    setName(existing ? existing.name : first ? connsDefaultName(s, first) : '');
    setNameEdited(Boolean(existing));
    setFields(connsInitialFields(first, existing));
    setAuthKind(existing && existing.connector === 'feishu' && /用户授权/.test(existing.account || '') ? 'user' : 'tenant');
    setCredMode('pick');
    setScope(existing ? existing.scope : 'project');
    setProjects(existing ? existing.projectIds || [] : presetProject ? [presetProject] : projectRole(s, s.currentProjectId) ? [s.currentProjectId] : []);
    setUpdateCreds(false);
    setError(null);
    setTouched(false);
    setOauth(Boolean(reauth && existing && connsDirectOauth(existing)));
  }, [open]);
  const c = connector ? resolveConnector(connector) : null;
  const cc = c && c.custom ? state.customConnectors.find((x) => x.id === c.id) : null;
  const me = state.users.find((u) => u.id === state.me) || { name: personName(state.me), email: '' };
  const kind = !c ? null : c.id === 'feishu' ? 'feishu' : c.auth === 'oauth2' ? 'oauth' : c.auth === 'none' ? 'none' : 'form';
  const spec = kind === 'form' ? connsFormSpec(c) : null;
  const usesOauth = kind === 'oauth' || (kind === 'feishu' && authKind === 'user');
  const directOauth = Boolean(reauth && existing && connsDirectOauth(existing));
  const blocked = existing
    ? (!c ? '这个连接使用的连接器已下架，只能修改名称和可用范围' : null)
    : !c
      ? null
      : cc && cc.status !== 'published'
        ? '该连接器尚未发布，发布后才能新建连接'
        : kind === 'none'
          ? (c.custom ? '该连接器没有启用认证，工作流可以直接使用，不需要新建连接' : '该连接器无需认证，可以直接在工作流中使用')
          : null;
  const credsNeeded = Boolean(c) && kind !== 'none' && (!existing || reauth || updateCreds);
  const admin = connsIsAdmin(state);
  const redirect = `https://${state.tenant.domain}/oauth/callback`;
  const myProjects = state.projects.filter((p) => projectRole(state, p.id));
  const presetName = presetProject ? (state.projects.find((p) => p.id === presetProject) || {}).name : '';
  const set = (k) => (v) => { setFields((f) => ({ ...f, [k]: v })); setError(null); };
  const errors = {};
  if (!reauth) {
    const n = name.trim();
    if (!n) errors.name = '请输入连接名称';
    else if (state.connections.some((x) => x.id !== (existing && existing.id) && x.name === n && connectionPerm(state, x))) errors.name = '已有同名的连接，请换一个名称';
    if (scope === 'project' && !projects.length) errors.projects = '至少选择一个项目';
  }
  if (credsNeeded && spec) spec.fields.forEach((f) => { const m = connsValidate(f, fields[f.key]); if (m) errors[f.key] = m; });
  if (credsNeeded && kind === 'feishu') {
    if (credMode === 'pick' && !fields.app) errors.app = '请选择飞书应用';
    if (credMode === 'input') {
      const appId = connsTrim(fields.appId);
      if (!appId) errors.appId = '请填写 App ID';
      else if (!/^cli_[a-z0-9]{6,}$/i.test(appId)) errors.appId = 'App ID 以 cli_ 开头，请检查是否填写正确';
      if (!connsTrim(fields.appSecret)) errors.appSecret = '请填写 App Secret';
    }
    if (authKind === 'user' && !fields.redirectDone) errors.redirectDone = '请先把重定向 URL 添加到应用的安全设置';
  }
  if (credsNeeded && kind === 'oauth' && Boolean(connsTrim(fields.clientId)) !== Boolean(connsTrim(fields.clientSecret))) {
    errors[connsTrim(fields.clientId) ? 'clientSecret' : 'clientId'] = 'Client ID 和 Client Secret 需要同时填写';
  }
  const invalid = Object.keys(errors).length > 0;
  const err = (k) => (touched ? errors[k] || null : null);
  const lost = existing && !reauth && scope === 'project' ? connectionUsage(state, existing.id).filter((w) => !projects.includes(w.projectId)) : [];
  const draftAccount = () => {
    if (kind === 'oauth') return me.email || me.name;
    if (kind === 'feishu') {
      const picked = CONNS_FEISHU_APPS.find((a) => a.value === fields.app);
      const appName = credMode === 'pick' ? (picked ? picked.label : '') : connsTrim(fields.appId);
      if (!appName) return '';
      if (authKind === 'user') return `${me.name}（用户授权 · ${appName}）`;
      return credMode === 'pick' && picked ? `${picked.value}（${picked.label}）` : appName;
    }
    return spec ? spec.account(fields) : '';
  };
  const draftAuthType = () => (kind === 'feishu' ? (authKind === 'user' ? 'oauth2' : 'client') : c.auth);
  const close = () => {
    clearTimeout(timer.current);
    setLoading(false);
    setOauth(false);
    onClose();
  };
  const finish = (connected) => {
    const now = Date.now();
    const scopePatch = { scope, projectIds: scope === 'tenant' ? [] : projects };
    if (existing) {
      const live = Store.get().connections.find((x) => x.id === existing.id);
      if (!live) {
        toast.error('这个连接已被删除');
        close();
        return;
      }
      const credPatch = connected ? { status: 'active', error: null, pending: false, account: draftAccount() || live.account, authType: draftAuthType() } : {};
      patchList('connections', existing.id, { ...(reauth ? {} : { name: name.trim(), ...scopePatch }), ...credPatch, updatedAt: now });
      addAudit(reauth ? '重新授权连接' : '更新连接', reauth ? live.name : name.trim(), null);
      toast.success(reauth ? '重新授权成功，连接已恢复' : connected ? '已保存，连接正常' : '已保存');
      close();
      return;
    }
    const conn = {
      id: uid('c'),
      name: name.trim(),
      connector: c.id,
      authType: draftAuthType(),
      ...scopePatch,
      status: connected ? 'active' : 'error',
      owner: state.me,
      shares: [],
      account: draftAccount(),
      createdAt: now,
      updatedAt: now,
      error: connected ? null : usesOauth ? '尚未完成授权，请点击「重新授权」完成连接' : '尚未测试连接，点击「测试连接」验证后即可使用',
      pending: !connected && !usesOauth,
    };
    prependToList('connections', conn);
    addAudit('创建连接', conn.name, presetProject || null);
    toast.success(connected ? '连接成功' : '已创建，尚未连接');
    if (onCreated) onCreated(conn);
    close();
  };
  const submit = (connect) => {
    setTouched(true);
    setError(null);
    if (loading) return;
    if (!existing && (!c || blocked)) return;
    if (invalid) return;
    if (existing && !reauth && !updateCreds) {
      finish(false);
      return;
    }
    if (!connect) {
      finish(false);
      return;
    }
    if (usesOauth) {
      setOauth(true);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      setLoading(false);
      const secrets = [fields.apiKey, fields.password, fields.appSecret, fields.clientSecret, fields.consumerSecret, fields.tokenSecret];
      if (secrets.some((x) => /wrong/i.test(connsTrim(x)))) {
        setError(kind === 'feishu' ? '{"code":99991663,"msg":"app secret invalid","log_id":"20260925104522A1B2C3"}' : '{"status":401,"error":"invalid_credentials","message":"认证信息无效"}');
        return;
      }
      finish(true);
    }, 1000);
  };
  const startOauth = () => {
    setTouched(true);
    if (invalid) return;
    setOauth(true);
  };
  const pickConnector = (v) => {
    if (v === connector) return;
    const next = resolveConnector(v);
    setConnector(v);
    setFields(connsInitialFields(next));
    setAuthKind('tenant');
    setCredMode('pick');
    setError(null);
    setTouched(false);
    if (!nameEdited || !name.trim()) {
      setName(next ? connsDefaultName(state, next) : '');
      setNameEdited(false);
    }
  };
  const catalogOpts = CONNECTORS.filter((x) => x.auth !== 'none').map((x) => ({ value: x.id, label: x.name, desc: AUTH_LABEL[x.auth], iconNode: html`<${ConnectorIcon} connector=${x} size=${18} />` }));
  const customOpts = publishedCustomConnectors(state).filter((x) => x.auth !== 'none').map((x) => ({ value: x.id, label: x.name, desc: `自定义 · ${AUTH_LABEL[x.auth]}`, iconNode: html`<${ConnectorIcon} connector=${x} size=${18} />` }));
  const listed = [...catalogOpts, ...customOpts].some((o) => o.value === connector);
  const connectorOptions = [
    ...(connector && !listed ? [{ value: connector, label: c ? c.name : '已下架的连接器', desc: blocked ? '不能新建连接' : AUTH_LABEL[c.auth], iconNode: html`<${ConnectorIcon} id=${connector} size=${18} />` }] : []),
    { group: '平台连接器' },
    ...catalogOpts,
    ...(customOpts.length ? [{ group: '自定义连接器' }, ...customOpts] : []),
  ];
  const projectOptions = [
    ...myProjects.map((p) => ({ value: p.id, label: p.name, desc: `我的角色：${roleLabel(projectRole(state, p.id))}${p.id === presetProject ? ' · 当前工作流所在项目' : ''}` })),
    ...projects.filter((pid) => !myProjects.some((p) => p.id === pid)).map((pid) => {
      const p = state.projects.find((x) => x.id === pid);
      return { value: pid, label: p ? p.name : '已删除的项目', desc: '你不是该项目的成员' };
    }),
  ];
  const formField = (f) => html`<${Field} key=${f.key} label=${f.label} required=${f.required} help=${f.help} hint=${f.hint} error=${err(f.key)} className=${f.wide ? 'conns-wide' : ''}>
    ${f.type === 'switch'
      ? html`<${Switch} checked=${fields[f.key] !== false} onChange=${set(f.key)} />`
      : f.secret
        ? html`<${SecretInput} value=${fields[f.key]} onChange=${set(f.key)} placeholder=${f.placeholder || (existing ? '输入新的值' : '')} invalid=${Boolean(err(f.key))} />`
        : html`<${Input} value=${fields[f.key]} onChange=${set(f.key)} placeholder=${f.placeholder} mono=${f.mono} invalid=${Boolean(err(f.key))} />`}
  <//>`;
  const feishuBody = () => html`<${Fragment}>
    <${Field} label="认证类型" required>
      <${RadioCards} columns=${2} value=${authKind} onChange=${(v) => { setAuthKind(v); setError(null); }} options=${[
        { value: 'tenant', label: '应用授权', desc: '以应用身份调用，适合机器人通知、读写多维表格' },
        { value: 'user', label: '用户授权', desc: '以你的身份调用，需要登录飞书同意授权' },
      ]} />
    <//>
    <${Field} label="飞书应用" required error=${credMode === 'pick' ? err('app') : null}>
      <${RadioGroup} value=${credMode} onChange=${(v) => { setCredMode(v); setError(null); }} options=${[{ value: 'pick', label: '选择已有应用' }, { value: 'input', label: '输入 App ID 和 App Secret' }]} />
      <div className="conns-sub">
        ${credMode === 'pick'
          ? html`<${Fragment}>
            <${Select} value=${fields.app} onChange=${set('app')} placeholder="选择飞书应用" invalid=${Boolean(err('app'))} options=${CONNS_FEISHU_APPS.map((a) => ({ value: a.value, label: a.label, desc: a.value }))} />
            <div className="conns-note">没有合适的应用？先在<a className="link" href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer">飞书开放平台</a>创建企业自建应用。</div>
          <//>`
          : html`<div className="conns-form-grid">
            <${Field} label="App ID" required error=${err('appId')}><${Input} mono value=${fields.appId} onChange=${set('appId')} placeholder="cli_xxxxxxxx" invalid=${Boolean(err('appId'))} /><//>
            <${Field} label="App Secret" required error=${err('appSecret')}><${SecretInput} value=${fields.appSecret} onChange=${set('appSecret')} invalid=${Boolean(err('appSecret'))} /><//>
          </div>`}
      </div>
    <//>
    ${authKind === 'user' && html`<${Field} label="重定向 URL" required help="用户授权完成后，飞书会跳回这个地址" error=${err('redirectDone')}>
      <div className="webhook-url"><span className="url">${redirect}</span><${CopyButton} text=${redirect} /></div>
      <div className="conns-sub"><${Checkbox} checked=${Boolean(fields.redirectDone)} onChange=${set('redirectDone')} label="我已把这个地址添加到应用的「安全设置 · 重定向 URL」" /></div>
    <//>`}
  <//>`;
  const oauthBody = () => html`<${Fragment}>
    <${Alert} tone="info">点击「创建并连接」后会打开 ${c.name} 的授权页，登录并同意授权即可完成连接。<//>
    <div className="conns-gap" />
    <${Field} label="重定向 URL" help="使用自己的 OAuth 应用时，需要把这个地址填到应用的回调地址中">
      <div className="webhook-url"><span className="url">${redirect}</span><${CopyButton} text=${redirect} /></div>
    <//>
    <${Collapse} title="使用自己的 OAuth 应用（可选）" defaultOpen=${Boolean(fields.clientId || fields.clientSecret)}>
      <div className="conns-form-grid">
        <${Field} label="Client ID" error=${err('clientId')}><${Input} mono value=${fields.clientId} onChange=${set('clientId')} invalid=${Boolean(err('clientId'))} /><//>
        <${Field} label="Client Secret" error=${err('clientSecret')}><${SecretInput} value=${fields.clientSecret} onChange=${set('clientSecret')} invalid=${Boolean(err('clientSecret'))} /><//>
      </div>
    <//>
  <//>`;
  const formBody = () => html`<${Fragment}>
    <div className="conns-form-grid">${spec.fields.map(formField)}</div>
    ${spec.note && html`<div className="conns-note conns-form-note">${spec.note}</div>`}
  <//>`;
  const credentialBody = () => (kind === 'feishu' ? feishuBody() : kind === 'oauth' ? oauthBody() : kind === 'form' ? formBody() : null);
  const credentialSection = () => {
    if (!existing || reauth) return credentialBody();
    if (!c || kind === 'none') return null;
    const oauthOnly = kind === 'oauth' || (kind === 'feishu' && connsDirectOauth(existing));
    return html`<div className="conns-cred">
      <div className="conns-cred-head">
        <div className="grow">
          <div className="conns-cred-label">当前账号</div>
          <div className="mono ellipsis">${existing.account || '-'}</div>
        </div>
        ${oauthOnly
          ? html`<${Button} size="sm" icon="RefreshCw" onClick=${startOauth}>重新授权<//>`
          : html`<${Button} size="sm" onClick=${() => { setUpdateCreds(!updateCreds); setError(null); setTouched(false); }}>${updateCreds ? '暂不更新' : kind === 'feishu' ? '更换应用' : '更新密钥'}<//>`}
      </div>
      ${updateCreds && !oauthOnly && html`<div className="conns-cred-body">${credentialBody()}</div>`}
    </div>`;
  };
  const primaryLabel = reauth ? '重新连接' : existing ? (updateCreds ? '保存并连接' : '保存') : '创建并连接';
  const disabled = loading || (!existing && (!c || Boolean(blocked))) || (reauth && !c) || (touched && invalid);
  const title = reauth && existing ? `重新授权「${existing.name}」` : existing ? '编辑连接' : '新建连接';
  return html`<${Fragment}>
    <${Modal}
      open=${open && !oauth}
      onClose=${close}
      title=${title}
      width=${600}
      footer=${html`<${Fragment}>
        <${Button} onClick=${close}>取消<//>
        ${!existing && kind !== 'none' && html`<${Button} disabled=${disabled} onClick=${() => submit(false)}>仅创建<//>`}
        <${Button} variant="primary" loading=${loading} disabled=${disabled} onClick=${() => submit(true)}>${primaryLabel}<//>
      <//>`}
    >
      ${reauth && existing && existing.error && html`<div className="conns-block"><${Alert} tone="warning" title="当前连接不可用">${existing.error}<//></div>`}
      ${blocked && html`<div className="conns-block"><${Alert} tone="info">${blocked}<//></div>`}
      <${Field} label="要连接的应用" required error=${touched && !c && !existing ? '请选择要连接的应用' : null}>
        <${Select}
          value=${connector}
          disabled=${Boolean(presetConnector || existing)}
          onChange=${pickConnector}
          searchable
          placeholder="搜索应用"
          invalid=${Boolean(touched && !c && !existing)}
          options=${connectorOptions}
        />
      <//>
      ${(c || existing) && !(blocked && !existing) && html`<${Fragment}>
        ${!reauth && html`<${Field} label="连接名称" required error=${err('name')}>
          <${Input}
            value=${name}
            onChange=${(v) => { setName(v.slice(0, 30)); setNameEdited(true); }}
            invalid=${Boolean(err('name'))}
            placeholder="例如：飞书 · 人事机器人"
            suffix=${html`<span className="conns-count">${name.length}/30</span>`}
          />
        <//>`}
        ${credentialSection()}
        ${!reauth && html`<${Field} label="可用范围" required error=${err('projects')}>
          <${RadioGroup} value=${scope} onChange=${setScope} options=${[{ value: 'project', label: '指定项目' }, { value: 'tenant', label: '全部项目', disabled: !admin && !(existing && existing.scope === 'tenant') }]} />
          <div className="conns-sub">
            ${scope !== 'project'
              ? html`<div className="conns-note">所有项目（包括以后新建的项目）的工作流都可以选择这个连接，前提是连接已经分享给了对应的成员。</div>`
              : presetProject
                ? html`<div className="conns-scope-row">
                  <${Tag} icon="Lock" className="conns-locked">${presetName}<//>
                  <div className="grow"><${Select} multiple value=${projects.filter((pid) => pid !== presetProject)} onChange=${(v) => setProjects([presetProject, ...v])} placeholder="可以再添加其他项目" options=${projectOptions.filter((o) => o.value !== presetProject)} /></div>
                </div>`
                : html`<${Select} multiple value=${projects} onChange=${setProjects} placeholder="选择可以使用这个连接的项目" invalid=${Boolean(err('projects'))} options=${projectOptions} />`}
            ${!admin && html`<div className="conns-note">只有企业管理员可以把连接设为全部项目可用。</div>`}
            ${presetProject && scope === 'project' && html`<div className="conns-note">当前工作流所在的项目「${presetName}」必须在可用范围内。</div>`}
          </div>
          ${lost.length > 0 && html`<div className="conns-sub"><${Alert} tone="warning">调整后，${lost.length} 个工作流所在的项目不在可用范围内，这些工作流将无法使用这个连接。<//></div>`}
        <//>`}
      <//>`}
      ${error && html`<div className="conns-block"><${Alert}
        tone="danger"
        title="连接发生错误，请检查填写的信息后重试"
        action=${html`<${Button} size="xs" icon="Copy" onClick=${() => { if (copyText(error)) toast.success('已复制'); else toast.error('复制失败，请手动选中复制'); }}>复制信息<//>`}
      ><span className="mono conns-error-detail">${error}</span><//></div>`}
    <//>
    <${OAuthPopup}
      open=${Boolean(open && oauth)}
      connector=${c}
      onCancel=${() => { setOauth(false); if (directOauth) close(); }}
      onApprove=${() => { setOauth(false); finish(true); }}
    />
  <//>`;
}

function OAuthPopup({ open, connector, onCancel, onApprove }) {
  const state = useStore();
  const [phase, setPhase] = useState('consent');
  const timer = useRef(null);
  useEffect(() => {
    if (open) setPhase('consent');
    return () => clearTimeout(timer.current);
  }, [open]);
  if (!connector) return null;
  const me = state.users.find((u) => u.id === state.me);
  const cc = connector.custom ? state.customConnectors.find((x) => x.id === connector.id) : null;
  const host = (cc && connsHost(cc.baseUrl)) || `auth.${connector.id}.com`;
  const spaced = (text) => `${/^[A-Za-z0-9]/.test(text) ? ' ' : ''}${text}${/[A-Za-z0-9]$/.test(text) ? ' ' : ''}`;
  const approve = () => {
    setPhase('loading');
    timer.current = setTimeout(onApprove, 900);
  };
  return html`<${Modal} open=${open} onClose=${onCancel} width=${440} className="oauth-popup" maskClosable=${false}>
    <div className="oauth-bar"><${Icon} name="Lock" size=${12} /><span className="mono">https://${host}/oauth/authorize?client_id=…</span></div>
    ${phase === 'consent'
      ? html`<div className="oauth-body">
        <div className="oauth-logos">
          <${ConnectorIcon} connector=${connector} size=${48} />
          <${Icon} name="ArrowLeftRight" size=${18} className="muted" />
          <span className="oauth-app"><img src=${state.tenant.appearance.logo || 'assets/logo.svg'} alt="" /></span>
        </div>
        <div className="oauth-title">${`${spaced(state.tenant.appearance.productName)}请求访问你的${spaced(connector.name)}账号`.trim()}</div>
        ${me && me.email && html`<div className="conns-oauth-who">将以 ${me.email} 的身份授权</div>`}
        <ul className="oauth-scopes">
          <li><${Icon} name="Check" size=${14} />读取你的基本信息</li>
          <li><${Icon} name="Check" size=${14} />读取和写入${spaced(connector.name)}数据</li>
          <li><${Icon} name="Check" size=${14} />在你离线时保持访问（refresh token）</li>
        </ul>
        <div className="row"><${Button} block onClick=${onCancel}>拒绝<//><${Button} block variant="primary" onClick=${approve}>授权<//></div>
      </div>`
      : html`<div className="oauth-body conns-oauth-wait"><${Icon} name="LoaderCircle" size=${28} className="spin" /><div className="muted">正在完成授权…</div></div>`}
  <//>`;
}

function ShareConnectionModal({ connId, onClose }) {
  const state = useStore();
  const conn = state.connections.find((x) => x.id === connId) || null;
  const [adding, setAdding] = useState([]);
  const [perm, setPerm] = useState('use');
  const gone = !conn;
  useEffect(() => { if (gone) onClose(); }, [gone]);
  if (!conn) return null;
  const myPerm = connectionPerm(state, conn);
  const manage = myPerm === 'owner' || myPerm === 'edit';
  const shares = conn.shares || [];
  const userOf = (id) => state.users.find((u) => u.id === id);
  const candidates = state.users.filter((u) => u.id !== conn.owner && !shares.some((s) => s.userId === u.id) && u.status !== 'disabled');
  const add = () => {
    const ids = adding.filter((id) => id !== conn.owner);
    if (!ids.length) return;
    patchList('connections', conn.id, (cur) => {
      const have = new Set([cur.owner, ...(cur.shares || []).map((s) => s.userId)]);
      return { shares: [...(cur.shares || []), ...ids.filter((id) => !have.has(id)).map((id) => ({ userId: id, perm }))] };
    });
    const names = ids.map((id) => personName(id)).join('、');
    addAudit('分享连接', `${conn.name} · ${names}（${CONNS_PERM[perm].label}）`, null);
    setAdding([]);
    toast.success(`已分享给 ${names}`);
  };
  const changePerm = (userId, next) => {
    const cur = shares.find((s) => s.userId === userId);
    if (!cur || cur.perm === next) return;
    patchList('connections', conn.id, (x) => ({ shares: (x.shares || []).map((s) => (s.userId === userId ? { ...s, perm: next } : s)) }));
    addAudit('修改连接分享', `${conn.name} · ${personName(userId)}（${CONNS_PERM[next].label}）`, null);
    toast.success(`已将 ${personName(userId)} 的权限改为「${CONNS_PERM[next].label}」`);
  };
  const removeShare = (userId) => {
    patchList('connections', conn.id, (x) => ({ shares: (x.shares || []).filter((s) => s.userId !== userId) }));
    addAudit('移除连接分享', `${conn.name} · ${personName(userId)}`, null);
    toast.success(`已移除 ${personName(userId)}`);
  };
  const owner = userOf(conn.owner);
  return html`<${Modal}
    open=${true}
    onClose=${onClose}
    title=${`分享「${conn.name}」`}
    description="被分享的成员可以在可用范围内的项目中使用这个连接，看不到密钥明文"
    width=${580}
    footer=${html`<${Button} variant="primary" onClick=${onClose}>完成<//>`}
  >
    ${manage
      ? html`<div className="conns-share-add">
        <div className="grow">
          <${Select}
            multiple
            searchable
            value=${adding}
            onChange=${setAdding}
            disabled=${!candidates.length}
            placeholder=${candidates.length ? '搜索并选择成员' : '没有可以添加的成员'}
            options=${candidates.map((u) => ({ value: u.id, label: u.name, desc: [u.email, u.external ? '外部成员' : '', u.status === 'invited' ? '待激活' : ''].filter(Boolean).join(' · '), iconNode: html`<${Avatar} name=${u.name} size=${20} />` }))}
          />
        </div>
        <${Select} width=${110} value=${perm} onChange=${setPerm} options=${CONNS_SHARE_OPTIONS} />
        <${Button} variant="primary" disabled=${!adding.length} onClick=${add}>添加<//>
      </div>`
      : html`<${Alert} tone="info">只有所有者和可编辑的成员可以管理分享。<//>`}
    <div className="member-list conns-members">
      <div className="member-row">
        <${Avatar} name=${personName(conn.owner)} size=${30} />
        <div className="grow">
          <div>${personName(conn.owner)}${conn.owner === state.me && html`<span className="conns-self">（我）</span>`}</div>
          <div className="text-xs muted">${owner ? owner.email : '该用户已被移除'}</div>
        </div>
        <span className="muted conns-member-perm">所有者</span>
      </div>
      ${shares.map((s) => {
        const u = userOf(s.userId);
        const self = s.userId === state.me;
        return html`<div key=${s.userId} className="member-row">
          <${Avatar} name=${personName(s.userId)} size=${30} />
          <div className="grow">
            <div className="row-4">${personName(s.userId)}${self && html`<span className="conns-self">（我）</span>`}${u && u.status === 'disabled' && html`<${Tag} size="sm">已停用<//>`}</div>
            <div className="text-xs muted">${u ? u.email : '该用户已被移除'}</div>
          </div>
          ${manage && !self
            ? html`<div className="row-4">
              <${Select} size="sm" width=${104} value=${s.perm} onChange=${(v) => changePerm(s.userId, v)} options=${CONNS_SHARE_OPTIONS} />
              <${IconButton} icon="X" size="sm" title=${`移除 ${personName(s.userId)}`} onClick=${() => removeShare(s.userId)} />
            </div>`
            : html`<span className="muted conns-member-perm">${CONNS_PERM[s.perm] ? CONNS_PERM[s.perm].label : s.perm}</span>`}
        </div>`;
      })}
      ${shares.length === 0 && html`<div className="conns-empty-line">还没有分享给任何人</div>`}
    </div>
  <//>`;
}

const CONNS_PERM = {
  owner: { label: '所有者', tone: 'primary' },
  edit: { label: '可编辑', tone: 'info' },
  use: { label: '可使用', tone: 'default' },
};

const CONNS_SHARE_OPTIONS = [
  { value: 'use', label: '可使用', desc: '查看连接信息，并在工作流中使用' },
  { value: 'edit', label: '可编辑', desc: '还可以修改、重新授权和分享' },
];

const CONNS_FEISHU_APPS = [
  { value: 'cli_a5f3e8b2c1', label: '星河集成助手' },
  { value: 'cli_a4d19f0077', label: 'HR 小助手' },
];

const CONNS_DB_PORT = { mysql: '3306', postgres: '5432', redis: '6379', snowflake: '443' };
