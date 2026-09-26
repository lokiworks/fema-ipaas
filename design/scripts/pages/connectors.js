function connectorsCatalog(state) {
  return [...CONNECTORS, ...publishedCustomConnectors(state)];
}

function connectorsSearchText(c) {
  return [c.name, c.id, c.key, c.desc, ...c.actions.map((o) => o.name), ...c.triggers.map((o) => o.name)].filter(Boolean).join(' ').toLowerCase();
}

function connectorsUsage(n) {
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : fmt.number(n);
}

function ConnectorSourceTag({ c, size }) {
  if (c.builtin) return html`<${Tag} size=${size} tone="outline" icon="Wrench">内置<//>`;
  if (c.official) return html`<${Tag} size=${size} tone="outline" icon="BadgeCheck">官方<//>`;
  if (c.custom) return html`<${Tag} size=${size} tone="primary">自定义<//>`;
  return html`<${Tag} size=${size}>社区<//>`;
}

function ConnectorsPage() {
  const state = useStore();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(() => connectorsCatFrom(route.query.cat));
  const [sort, setSort] = useState('hot');
  const [kind, setKind] = useState('all');
  const [requesting, setRequesting] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (route.query.cat) setCat(connectorsCatFrom(route.query.cat)); }, [route.query.cat]);
  const me = state.users.find((u) => u.id === state.me);
  const canDevelop = Boolean(me && (me.modules || []).includes('connector'));
  const addTip = mcpcAddTip(state);
  const servers = (state.mcpClients || []).filter((mc) => mcpcVisible(state, mc));
  const catalog = connectorsCatalog(state);
  const needle = q.trim().toLowerCase();
  const dated = Object.fromEntries(state.customConnectors.map((x) => [x.id, x.updatedAt || 0]));
  const list = catalog
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (cat === 'all' || c.category === cat) && (!needle || connectorsSearchText(c).includes(needle)))
    .filter(({ c }) => kind === 'all' || (kind === 'trigger' ? c.triggers.length > 0 : kind === 'official' ? c.official : !c.official))
    .sort((a, b) => (sort === 'hot' ? (b.c.usage || 0) - (a.c.usage || 0) : (dated[b.c.id] || 0) - (dated[a.c.id] || 0)) || a.i - b.i)
    .map(({ c }) => c);
  const counts = CONNECTOR_CATEGORIES.reduce((acc, x) => ({ ...acc, [x.value]: x.value === 'all' ? catalog.length : catalog.filter((c) => c.category === x.value).length }), {});
  const shownServers = servers.filter((mc) => !needle || mcpcSearchText(mc).includes(needle));
  const serversInAll = cat === 'all' && ['all', 'community'].includes(kind) ? shownServers : [];
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="连接器市场"
      description="连接器把第三方应用的接口封装成工作流里可用的操作和触发器，其中的操作还可以开放为 MCP 工具"
      actions=${html`<${Fragment}>
        <${Button} icon="MessageSquarePlus" onClick=${() => setRequesting(true)}>提交需求<//>
        ${cat !== 'mcp' && html`<${IntegDisabledTip} tip=${addTip}><${Button} icon="Server" disabled=${Boolean(addTip)} onClick=${() => setAdding(true)}>接入 MCP 服务器<//><//>`}
        ${canDevelop && html`<${Button} variant="primary" icon="SquareCode" onClick=${() => navigate('/devkit')}>开发连接器<//>`}
      <//>`}
    />
    <div className="market">
      <nav className="market-cats" aria-label="连接器分类">
        ${CONNECTOR_CATEGORIES.map((c) => html`<button key=${c.value} type="button" className=${cx('market-cat', cat === c.value && 'is-active')} aria-pressed=${cat === c.value} onClick=${() => setCat(c.value)}>
          <${Icon} name=${c.icon} size=${16} /><span className="grow">${c.label}</span><span className="text-xs muted">${counts[c.value]}</span>
        </button>`)}
        <div className="mcpc-cat-sep" />
        <button type="button" className=${cx('market-cat', cat === 'mcp' && 'is-active')} aria-pressed=${cat === 'mcp'} onClick=${() => setCat('mcp')}>
          <${Icon} name="Server" size=${16} /><span className="grow">MCP 服务器</span><span className="text-xs muted">${servers.length}</span>
        </button>
      </nav>
      ${cat === 'mcp' ? html`<${ConnectorsMcpList} servers=${shownServers} total=${servers.length} q=${q} setQ=${setQ} addTip=${addTip} onAdd=${() => setAdding(true)} />` : html`<div className="market-main">
        <div className="toolbar">
          <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索连接器、操作或触发器" width=${280} />
          <${Segmented} value=${kind} onChange=${setKind} options=${[{ value: 'all', label: '全部' }, { value: 'official', label: '官方' }, { value: 'community', label: '社区与自定义' }, { value: 'trigger', label: '支持触发器' }]} />
          <span className="spacer" />
          <span className="text-xs muted">共 ${list.length} 个连接器</span>
          <${Select} width=${100} value=${sort} onChange=${setSort} options=${[{ value: 'hot', label: '最热' }, { value: 'new', label: '最新' }]} />
        </div>
        ${list.length > 0 && html`<div className="conn-grid">
          ${list.map((c) => html`<button key=${c.id} type="button" className="conn-card" onClick=${() => navigate(`/connectors/${c.id}`)}>
            <div className="row">
              <${ConnectorIcon} connector=${c} size=${40} />
              <div className="grow">
                <div className="conn-name">${c.name}</div>
                <div className="row-4"><${ConnectorSourceTag} c=${c} size="sm" />${!c.builtin && html`<span className="text-xs muted">${versionLabel(c)}</span>`}</div>
              </div>
            </div>
            <div className="conn-desc">${c.desc || '暂无描述'}</div>
            <div className="conn-foot">
              ${c.actions.length > 0 && html`<span>${c.actions.length} 个操作</span>`}
              ${c.triggers.length > 0 && html`<span>${c.triggers.length} 个触发器</span>`}
              <span className="spacer" />
              ${c.usage > 0 && html`<span className="row-4" title="使用热度"><${Icon} name="Flame" size=${12} />${connectorsUsage(c.usage)}</span>`}
            </div>
          </button>`)}
        </div>`}
        ${list.length === 0 && serversInAll.length === 0 && html`<${Empty}
          icon="SearchX"
          title="没有找到相关连接器"
          description=${canDevelop ? '可以向平台管理员提交需求，或者自己开发一个连接器。' : '可以向平台管理员提交需求。'}
          action=${html`<${Fragment}>
            <${Button} onClick=${() => setRequesting(true)}>提交需求<//>
            ${canDevelop && html`<${Button} variant="primary" onClick=${() => navigate('/devkit')}>开发连接器<//>`}
          <//>`}
        />`}
        ${serversInAll.length > 0 && html`<div className="mcpc-all">
          <div className="section-head">
            <span className="section-title">MCP 服务器</span>
            <button type="button" className="link text-xs" onClick=${() => setCat('mcp')}>查看全部</button>
          </div>
          <div className="conn-grid">${serversInAll.map((mc) => html`<${ConnectorsMcpCard} key=${mc.id} mc=${mc} state=${state} />`)}</div>
        </div>`}
      </div>`}
    </div>
    <${ConnectorRequestModal} open=${requesting} onClose=${() => setRequesting(false)} preset=${q.trim()} />
    ${adding && html`<${McpcAddModal} onClose=${() => setAdding(false)} />`}
  </div></div>`;
}

function connectorsCatFrom(value) {
  return value === 'mcp' || CONNECTOR_CATEGORIES.some((c) => c.value === value) ? value : 'all';
}

function ConnectorsMcpList({ servers, total, q, setQ, addTip, onAdd }) {
  const state = useStore();
  return html`<div className="market-main">
    <div className="toolbar">
      <${SearchInput} value=${q} onChange=${setQ} placeholder="搜索 MCP 服务器、地址或工具" width=${280} />
      <span className="spacer" />
      <span className="text-xs muted">共 ${total} 个 MCP 服务器</span>
      <${IntegDisabledTip} tip=${addTip}><${Button} variant="primary" icon="Plus" disabled=${Boolean(addTip)} onClick=${onAdd}>接入 MCP 服务器<//><//>
    </div>
    <div className="mcpc-intro">
      <${Icon} name="Server" size=${16} />
      <span>把企业已有的 MCP 服务器接进来，不用再写一遍连接器：它的工具可以在工作流里当操作用，也可以交给「AI 智能体」调用。连接测试和工具调用都由工作节点发起。</span>
    </div>
    ${servers.length > 0
      ? html`<div className="conn-grid">
        ${servers.map((mc) => html`<${ConnectorsMcpCard} key=${mc.id} mc=${mc} state=${state} />`)}
        ${!addTip && html`<button type="button" className="conn-card mcpc-new" onClick=${onAdd}><${Icon} name="Plus" size=${18} /><span>接入 MCP 服务器</span><span className="text-xs muted">支持 Streamable HTTP 和 SSE</span></button>`}
      </div>`
      : html`<${Empty}
        icon=${q.trim() ? 'SearchX' : 'Server'}
        title=${q.trim() ? '没有找到相关的 MCP 服务器' : '还没有接入 MCP 服务器'}
        description=${q.trim() ? '换个关键词试试。' : '填好服务器地址和认证方式，连接测试通过后就能在工作流和智能体里使用它的工具。'}
        action=${!q.trim() && !addTip ? html`<${Button} variant="primary" icon="Plus" onClick=${onAdd}>接入 MCP 服务器<//>` : null}
      />`}
  </div>`;
}

function ConnectorsMcpCard({ mc, state }) {
  const ok = mc.status === 'connected';
  return html`<button type="button" className="conn-card mcpc-card" onClick=${() => navigate(`/connectors/${mc.id}`)}>
    <div className="row">
      <${KindTile} icon="Server" size=${40} />
      <div className="grow">
        <div className="conn-name">${mc.name}</div>
        <div className="row-4">
          <${Tag} size="sm" tone="outline" icon="Server">MCP<//>
          <${Tag} size="sm" tone=${ok ? 'success' : 'danger'} dot>${ok ? '已连接' : '连接异常'}<//>
        </div>
      </div>
    </div>
    <div className="conn-desc">${mc.description || '暂无描述'}</div>
    <div className="mcpc-url mono ellipsis" title=${mc.url}>${mc.url}</div>
    <div className="conn-foot">
      <span>${(mc.tools || []).length} 个工具</span>
      <span>所有者 ${personName(mc.owner)}</span>
      <span className="spacer" />
      <span>${mcpcScopeText(state, mc)}</span>
    </div>
  </button>`;
}

function ConnectorRequestModal({ open, onClose, preset }) {
  const [name, setName] = useState('');
  const [need, setNeed] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName((preset || '').slice(0, 30));
    setNeed('');
    setTouched(false);
  }, [open]);
  const errors = { name: name.trim() ? null : '请输入应用名称', need: need.trim() ? null : '请描述需要的操作或触发器' };
  const invalid = Boolean(errors.name || errors.need);
  const submit = () => {
    setTouched(true);
    if (invalid) return;
    addAudit('提交连接器需求', `${name.trim()}：${need.trim().slice(0, 60)}`, null);
    toast.success('需求已提交给平台管理员');
    onClose();
  };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    title="提交连接器需求"
    description="平台管理员会评估需求，决定开发新的连接器，或者补充现有连接器的能力"
    width=${480}
    footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${touched && invalid} onClick=${submit}>提交<//><//>`}
  >
    <${Field} label="应用名称" required error=${touched ? errors.name : null}>
      <${Input} value=${name} onChange=${(v) => setName(v.slice(0, 30))} placeholder="例如：钉钉宜搭" invalid=${Boolean(touched && errors.name)} autoFocus suffix=${html`<span className="conns-count">${name.length}/30</span>`} />
    <//>
    <${Field} label="需要的能力" required error=${touched ? errors.need : null}>
      <${Textarea} rows=${4} value=${need} onChange=${(v) => setNeed(v.slice(0, 300))} placeholder="例如：表单提交时触发工作流；按条件查询表单实例" invalid=${Boolean(touched && errors.need)} />
    <//>
  <//>`;
}

function ConnectorSchemaTable({ rows, expandAll, showRequired }) {
  return html`<table className="schema-table">
    <thead>
      <tr>
        <th>字段</th>
        <th className="schema-col-type">类型</th>
        ${showRequired && html`<th className="schema-col-req">必填</th>`}
        <th>说明</th>
      </tr>
    </thead>
    <tbody>${rows.map((r) => html`<${ConnectorSchemaRow} key=${r.name} row=${r} depth=${0} expandAll=${expandAll} showRequired=${showRequired} />`)}</tbody>
  </table>`;
}

function ConnectorSchemaRow({ row, depth, expandAll, showRequired }) {
  const [open, setOpen] = useState(expandAll);
  useEffect(() => { setOpen(expandAll); }, [expandAll]);
  const kids = row.children || [];
  return html`<${Fragment}>
    <tr>
      <td>
        <span className="schema-name" style=${{ paddingLeft: depth * 18 }}>
          ${kids.length > 0
            ? html`<button type="button" className="schema-toggle" aria-expanded=${open} aria-label=${open ? `收起 ${row.name} 的子字段` : `展开 ${row.name} 的子字段`} onClick=${() => setOpen(!open)}><${Icon} name="ChevronRight" size=${12} className=${cx('schema-caret', open && 'is-open')} /></button>`
            : html`<span className="schema-toggle-space" />`}
          <span className="mono">${row.name}</span>
        </span>
      </td>
      <td><span className="schema-type">${row.type}</span></td>
      ${showRequired && html`<td>${row.required ? html`<span className="schema-req">是</span>` : '否'}</td>`}
      <td className="muted schema-desc">${row.desc || '-'}</td>
    </tr>
    ${open && kids.map((ch) => html`<${ConnectorSchemaRow} key=${ch.name} row=${ch} depth=${depth + 1} expandAll=${expandAll} showRequired=${showRequired} />`)}
  <//>`;
}

function connectorsValueType(v) {
  if (Array.isArray(v)) return v.length ? `array<${connectorsValueType(v[0])}>` : 'array';
  if (v === null) return 'null';
  return typeof v;
}

function connectorsOutputRows(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([k, v]) => {
    const inner = Array.isArray(v) ? v[0] : v;
    const kids = inner && typeof inner === 'object' && !Array.isArray(inner) ? connectorsOutputRows(inner) : [];
    return { name: k, type: connectorsValueType(v), desc: OUTPUT_DESC[k] || '', children: kids.length ? kids : null };
  });
}

function connectorsFieldType(d) {
  if (d.type === 'switch') return 'boolean';
  if (d.mode === 'object') return 'object';
  if (d.mode === 'array') return 'array';
  if (d.mode === 'number') return 'number';
  return 'string';
}

function connectorsOpSchema(c, op, mode) {
  const node = { id: `preview-${op.key}`, kind: mode, connector: c.id, op: op.key, config: {} };
  const inputs = c.custom
    ? (op.params || []).map((p) => ({
      name: p.key,
      type: p.type || 'string',
      required: Boolean(p.required),
      desc: [p.label, p.options && p.options.length ? `可选值：${p.options.join(' / ')}` : '', p.source === 'HTTP 接口' ? '选项从接口动态获取' : ''].filter(Boolean).join('；'),
    }))
    : fieldsFor(node).map((k) => {
      const d = fieldDef(node, k);
      return { name: k, type: connectorsFieldType(d), required: Boolean(d.required), desc: [d.label, d.help, d.options && d.options.length ? `可选值：${d.options.join(' / ')}` : ''].filter(Boolean).join('；') };
    });
  return { inputs, outputs: connectorsOutputRows(nodeOutput(node)) };
}

function ConnectorOpBlock({ connector, op, mode, expandAll }) {
  const schema = connectorsOpSchema(connector, op, mode);
  return html`<div className="connectors-op">
    ${op.desc && html`<p className="muted connectors-op-desc">${op.desc}</p>`}
    ${(mode === 'action' || schema.inputs.length > 0) && html`<${Fragment}>
      <div className="op-sub">${mode === 'trigger' ? '配置项' : '入参'}</div>
      ${schema.inputs.length
        ? html`<${ConnectorSchemaTable} rows=${schema.inputs} expandAll=${expandAll} showRequired />`
        : html`<div className="connectors-none">暂无入参定义</div>`}
    <//>`}
    <div className="op-sub">出参</div>
    ${schema.outputs.length
      ? html`<${ConnectorSchemaTable} rows=${schema.outputs} expandAll=${expandAll} />`
      : html`<div className="connectors-none">没有出参</div>`}
  </div>`;
}

function connectorsVersionRows(c, cc) {
  const list = connectorVersions(c);
  if (!cc) return list.map((v, i) => ({ ...v, current: i === 0 }));
  return list.map((v) => {
    const full = (cc.versions || []).find((x) => x.version === v.version) || {};
    return { ...v, publishedAt: full.publishedAt, publisher: full.publisher, note: full.note, current: v.version === cc.version };
  });
}

function connectorsVersionMeta(c, v) {
  if (c.builtin) return '内置连接器随平台一起升级，不需要单独更新';
  if (c.custom) return [v.publishedAt && fmt.date(v.publishedAt), v.publisher && `${personName(v.publisher)} 发布`, v.note].filter(Boolean).join(' · ') || '-';
  if (v.status === 'deprecated') return '已停止支持，使用这个版本的节点会提示升级';
  if (v.status === 'gray') return '灰度发布中，部分工作流可以选用';
  return '可以在工作流节点中选用';
}

function ConnectorVersionList({ c, versions }) {
  if (!versions.length) return html`<${Empty} size="sm" icon="History" title="还没有发布过版本" />`;
  return html`<div className="timeline">
    ${versions.map((v, i) => {
      const meta = VERSION_STATUS[v.status] || VERSION_STATUS.released;
      return html`<div key=${`${v.version}#${i}`} className="timeline-item">
        <span className=${cx('timeline-dot', v.current && 'is-active')} />
        <div className="grow">
          <div className="row">
            <b>${c.builtin ? '内置' : `v${v.version}`}</b>
            <${Tag} size="sm" tone=${meta.tone}>${meta.label}<//>
            ${v.current && html`<${Tag} size="sm" tone="primary">当前版本<//>`}
          </div>
          <div className="text-xs muted">${connectorsVersionMeta(c, v)}</div>
        </div>
      </div>`;
    })}
  </div>`;
}

function ConnectorUnavailable({ id }) {
  const state = useStore();
  const cc = state.customConnectors.find((x) => x.id === id);
  const mine = Boolean(cc && (cc.owner === state.me || (cc.developers || []).includes(state.me)));
  const title = !cc ? '连接器不存在' : cc.status === 'draft' ? '该连接器尚未发布' : '该连接器已下架';
  const description = !cc
    ? '链接可能已经失效，或者连接器已被删除。'
    : cc.status === 'draft'
      ? '草稿状态的自定义连接器不会出现在连接器市场，发布后才能在工作流中使用和新建连接。'
      : '已下架的连接器不能再添加到工作流，已有工作流中的相关节点会报错。';
  return html`<div className="page"><div className="page-inner">
    <${Breadcrumb} items=${[{ label: '连接器市场', to: '/connectors' }, { label: mine ? cc.name : '连接器' }]} />
    <${Empty}
      icon="PackageX"
      title=${title}
      description=${description}
      action=${html`<${Fragment}>
        <${Button} onClick=${() => navigate('/connectors')}>返回连接器市场<//>
        ${mine && html`<${Button} variant="primary" onClick=${() => navigate(`/devkit/${cc.id}/basic`)}>前往连接器开发<//>`}
      <//>`}
    />
  </div></div>`;
}

function ConnectorDetailPage({ id }) {
  return String(id || '').startsWith('mcpc_') ? html`<${ConnectorsMcpDetail} id=${id} />` : html`<${ConnectorsCatalogDetail} id=${id} />`;
}

function ConnectorsCatalogDetail({ id }) {
  const state = useStore();
  const c = connectorsCatalog(state).find((x) => x.id === id) || null;
  const [tab, setTab] = useState(() => (c && !c.actions.length && c.triggers.length ? 'triggers' : 'actions'));
  const [expandAll, setExpandAll] = useState(false);
  const [q, setQ] = useState('');
  const [connOpen, setConnOpen] = useState(false);
  if (!c) return html`<${ConnectorUnavailable} id=${id} />`;
  const me = state.users.find((u) => u.id === state.me);
  const modules = (me && me.modules) || [];
  const cc = c.custom ? state.customConnectors.find((x) => x.id === c.id) : null;
  const mine = new Set(state.projects.filter((p) => projectRole(state, p.id)).map((p) => p.id));
  const connOf = (cid) => state.connections.find((x) => x.id === cid);
  const usesIt = (w) => workflowConnectors(w).includes(c.id) || allNodes(w).some((n) => (['ai', 'agent'].includes(n.kind) && n.config && connOf(n.config.connectionId) && connOf(n.config.connectionId).connector === c.id)
    || (n.kind === 'agent' && ((n.config || {}).tools || []).some((t) => t.connector === c.id)));
  const usedIn = state.workflows.filter((w) => mine.has(w.projectId) && usesIt(w));
  const conns = state.connections.filter((x) => x.connector === c.id && connectionPerm(state, x));
  const templates = state.templates.filter((t) => t.trigger && templateConnectors(t).includes(c.id));
  const related = connectorsCatalog(state).filter((x) => x.id !== c.id && x.category === c.category).slice(0, 4);
  const versions = connectorsVersionRows(c, cc);
  const canMcp = modules.includes('mcp') && c.actions.length > 0;
  const mode = tab === 'triggers' ? 'trigger' : 'action';
  const ops = tab === 'triggers' ? c.triggers : c.actions;
  const needle = q.trim().toLowerCase();
  const shown = ops.filter((o) => !needle || `${o.name} ${o.key} ${o.desc || ''}`.toLowerCase().includes(needle));
  const groups = shown.reduce((acc, o) => {
    const name = o.group || (tab === 'triggers' ? '触发器' : '操作');
    return acc.some((g) => g.name === name) ? acc.map((g) => (g.name === name ? { ...g, ops: [...g.ops, o] } : g)) : [...acc, { name, ops: [o] }];
  }, []);
  const counts = [c.actions.length > 0 && `${c.actions.length} 个操作`, c.triggers.length > 0 && `${c.triggers.length} 个触发器`].filter(Boolean).join(' · ');
  const mcpLink = (opKey) => `/mcp?newTool=connector&connector=${encodeURIComponent(c.id)}${opKey ? `&op=${encodeURIComponent(opKey)}` : ''}`;
  const kindLabel = tab === 'triggers' ? '触发器' : '操作';
  return html`<div className="page"><div className="page-inner">
    <${Breadcrumb} items=${[{ label: '连接器市场', to: '/connectors' }, { label: c.name }]} />
    <div className="conn-hero">
      <${ConnectorIcon} connector=${c} size=${64} />
      <div className="grow">
        <div className="row"><h1 className="page-title">${c.name}</h1><${ConnectorSourceTag} c=${c} /></div>
        <p className="muted connectors-desc">${c.desc || '暂无描述'}</p>
        <div className="connectors-meta">
          <span>${c.builtin ? '内置连接器，随平台升级' : `当前版本 ${versionLabel(c)}`}</span>
          <span>认证方式：${AUTH_LABEL[c.auth] || '-'}</span>
          ${counts && html`<span>${counts}</span>`}
          <span>你的项目中有 ${usedIn.length} 个工作流在使用</span>
          ${cc && html`<span>开发者：${personName(cc.owner)}</span>`}
          ${cc && cc.helpUrl && html`<a className="link" href=${cc.helpUrl} target="_blank" rel="noopener noreferrer">帮助文档</a>`}
        </div>
      </div>
      <div className="connectors-hero-actions">
        ${c.auth !== 'none' && html`<${Button} variant="primary" icon="Link2" onClick=${() => setConnOpen(true)}>新建连接<//>`}
        ${canMcp && html`<${Button} icon="Server" onClick=${() => navigate(mcpLink())}>开放为 MCP 工具<//>`}
      </div>
    </div>
    <div className="conn-detail">
      <div>
        <${Tabs}
          value=${tab}
          onChange=${(v) => { setTab(v); setQ(''); }}
          items=${[
            { value: 'actions', label: '操作参数', count: c.actions.length },
            { value: 'triggers', label: '触发器参数', count: c.triggers.length },
            { value: 'versions', label: '版本记录', count: versions.length },
          ]}
          extra=${tab !== 'versions' && ops.length > 0 && html`<${Fragment}>
            <${Input} size="sm" icon="Search" placeholder=${`搜索${kindLabel}`} value=${q} onChange=${setQ} allowClear style=${{ width: 200 }} />
            <${Button} size="sm" variant="ghost" icon=${expandAll ? 'ChevronsDownUp' : 'ChevronsUpDown'} onClick=${() => setExpandAll(!expandAll)}>${expandAll ? '收起全部' : '展开全部'}<//>
          <//>`}
        />
        ${tab === 'versions'
          ? html`<${ConnectorVersionList} c=${c} versions=${versions} />`
          : ops.length === 0
            ? html`<${Empty} size="sm" icon="Inbox" title=${tab === 'triggers' ? '该连接器不提供触发器' : '该连接器没有操作'} description=${tab === 'triggers' ? '可以用定时任务或网址触发器启动工作流，再在后续节点中调用这个连接器。' : '这个连接器只提供触发器，用来启动工作流。'} />`
            : shown.length === 0
              ? html`<${Empty} size="sm" icon="SearchX" title=${`没有找到与「${q.trim()}」匹配的${kindLabel}`} action=${html`<${Button} size="sm" onClick=${() => setQ('')}>清除搜索<//>`} />`
              : groups.map((g) => html`<div key=${g.name} className="op-group">
                <div className="op-group-title">${g.name}</div>
                ${g.ops.map((o) => html`<${Collapse}
                  key=${`${o.key}-${expandAll ? 'open' : 'closed'}`}
                  defaultOpen=${expandAll}
                  className="op-item"
                  title=${html`<span className="row">
                    <span>${o.name}</span>
                    <span className="muted text-xs mono">${o.key}</span>
                    ${o.type && html`<${Tag} size="sm">${CONNECTOR_TRIGGER_KIND[o.type] || o.type}<//>`}
                  </span>`}
                  extra=${mode === 'action' && canMcp ? html`<${Button} size="xs" variant="ghost" icon="Server" onClick=${() => navigate(mcpLink(o.key))}>开放为 MCP 工具<//>` : null}
                >
                  <${ConnectorOpBlock} connector=${c} op=${o} mode=${mode} expandAll=${expandAll} />
                <//>`)}
              </div>`)}
      </div>
      <aside className="col connectors-side">
        <${Card} title="我的连接" extra=${c.auth !== 'none' && html`<${Button} size="xs" icon="Plus" onClick=${() => setConnOpen(true)}>新建<//>`}>
          ${c.auth === 'none'
            ? html`<div className="text-xs muted">无需认证，可以直接在工作流中使用。</div>`
            : conns.length === 0
              ? html`<div className="text-xs muted">还没有可用的 ${c.name} 连接。</div>`
              : html`<div className="connectors-list">${conns.map((x) => html`<button key=${x.id} type="button" className="attention-row" onClick=${() => navigate(`/connections?id=${x.id}`)}>
                <${Dot} tone=${CONN_STATUS[x.status].tone} />
                <span className="grow ellipsis">${x.name}</span>
                <span className="text-xs muted">${CONN_STATUS[x.status].label}</span>
              </button>`)}</div>`}
        <//>
        <${Card} title="在这些工作流中使用">
          ${usedIn.length === 0
            ? html`<div className="text-xs muted">你的项目里还没有工作流使用它。</div>`
            : html`<div className="connectors-list">
              ${usedIn.slice(0, 6).map((w) => html`<button key=${w.id} type="button" className="attention-row" onClick=${() => navigate(`/integration/${w.projectId}/wf/${w.id}`)}><${WorkflowGlyph} wf=${w} size=${16} /><span className="grow ellipsis">${w.name}</span></button>`)}
              ${usedIn.length > 6 && html`<div className="text-xs muted connectors-more">等 ${usedIn.length} 个工作流</div>`}
            </div>`}
        <//>
        <${Card} title="相关模板">
          ${templates.length === 0
            ? html`<div className="text-xs muted">暂无使用它的模板。</div>`
            : html`<div className="connectors-list">${templates.slice(0, 3).map((t) => html`<button key=${t.id} type="button" className="attention-row" onClick=${() => navigate('/templates')}><${Icon} name="LayoutTemplate" size=${16} className="muted" /><span className="grow ellipsis">${t.name}</span></button>`)}</div>`}
        <//>
        ${related.length > 0 && html`<${Card} title="同类连接器">
          <div className="connectors-list">${related.map((x) => html`<${Link} key=${x.id} to=${`/connectors/${x.id}`} className="attention-row">
            <${ConnectorIcon} connector=${x} size=${20} />
            <span className="grow ellipsis">${x.name}</span>
            <${Icon} name="ChevronRight" size=${14} className="muted" />
          <//>`)}</div>
        <//>`}
      </aside>
    </div>
    <${NewConnectionModal} open=${connOpen} onClose=${() => setConnOpen(false)} presetConnector=${c.id} />
  </div></div>`;
}

function mcpcIsAdmin(state) {
  const me = state.users.find((u) => u.id === state.me);
  return Boolean(me && ['owner', 'admin'].includes(me.role));
}

function mcpcAddTip(state) {
  if (mcpcIsAdmin(state)) return null;
  return state.projects.some((p) => canEditProject(state, p.id)) ? null : '需要是平台管理员，或者至少能编辑一个项目';
}

function mcpcVisible(state, mc) {
  if (mc.scope === 'tenant' || mc.owner === state.me || mcpcIsAdmin(state)) return true;
  return (mc.projectIds || []).some((pid) => projectRole(state, pid));
}

function mcpcCanManage(state, mc) {
  return mc.owner === state.me || mcpcIsAdmin(state);
}

function mcpcSearchText(mc) {
  return [mc.name, mc.description, mc.url, ...(mc.tools || []).flatMap((t) => [t.name, t.title, t.description])].filter(Boolean).join(' ').toLowerCase();
}

function mcpcScopeText(state, mc) {
  if (mc.scope === 'tenant') return '全部项目';
  const names = (mc.projectIds || []).map((pid) => (state.projects.find((p) => p.id === pid) || {}).name).filter(Boolean);
  return names.length === 1 ? names[0] : `${names.length} 个项目`;
}

function mcpcUrlError(url) {
  const v = String(url || '').trim();
  if (!v) return '请填写服务器地址';
  if (!/^https?:\/\//i.test(v)) return '地址要以 http:// 或 https:// 开头';
  if (/\s/.test(v)) return '地址里不能有空格';
  try {
    const u = new URL(v);
    if (!u.hostname) return '地址格式不正确';
    if (u.username || u.password) return '不要把账号密码写在地址里，请在「认证」里配置';
    if (u.hash) return '地址里不能带 #';
  } catch (e) {
    return '地址格式不正确，请检查域名和端口（端口在 1–65535 之间）';
  }
  return null;
}

function mcpcDiscover(u, hint, known) {
  const text = `${u.hostname}${u.pathname} ${hint || ''}`.toLowerCase();
  const set = MCPC_TOOLSETS.find((x) => x.words.length && x.words.some((w) => text.includes(w)));
  const own = (known || []).map((t) => ({ ...t, params: (t.params || []).map((p) => ({ ...p })) }));
  if (!set) return own.length ? own : MCPC_TOOLSETS[MCPC_TOOLSETS.length - 1].tools.map((t) => ({ ...t, params: t.params.map((p) => ({ ...p })) }));
  return [...own, ...set.tools.filter((t) => !own.some((x) => x.name === t.name)).map((t) => ({ ...t, params: t.params.map((p) => ({ ...p })) }))];
}

function mcpcCheck(cfg, state) {
  let u;
  try { u = new URL(String(cfg.url || '').trim()); } catch (e) { return { ok: false, error: '服务器地址格式不正确' }; }
  const host = u.hostname.toLowerCase();
  const where = `${host}${u.port ? `:${u.port}` : ''}`;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '0.0.0.0' || (ip && ip[1] === '127')) {
    return { ok: false, error: `连接失败：${where} 指向工作节点自己。连接测试和工具调用都由工作节点发起，localhost 只在你自己的电脑上有效。请填写工作节点能访问的内网地址或域名。` };
  }
  if (ip && ip[1] === '169' && ip[2] === '254') {
    return { ok: false, error: `连接被拒绝：${host} 是链路本地地址（云厂商的元数据服务通常在这里），出于安全考虑，工作节点不会访问这类地址。` };
  }
  const internal = Boolean(ip && (ip[1] === '10' || (ip[1] === '192' && ip[2] === '168') || (ip[1] === '172' && Number(ip[2]) >= 16 && Number(ip[2]) <= 31)));
  if (internal) {
    const intranet = (state.workers || []).filter((w) => (w.labels || []).includes('intranet'));
    if (!intranet.some((w) => w.status === 'online')) {
      const who = intranet.length ? `带 intranet 标签的工作节点 ${intranet.map((w) => w.host).join('、')} 目前离线` : '现在没有带 intranet 标签的工作节点';
      return { ok: false, error: `连接超时：${where} 在 10 秒内没有响应。这是内网地址，要由能访问内网的工作节点去连接，${who}。请让运维恢复这个节点，并确认这个网段已加入 FEMA_SSRF_ALLOW_LIST；或者换成默认工作节点能访问的域名。` };
    }
  }
  const tld = host.split('.').pop();
  if (!ip && (!host.includes('.') || ['example', 'invalid', 'test', 'local', 'localdomain', 'internal'].includes(tld) || /(^|\.)example\.(com|org|net)$/.test(host))) {
    return { ok: false, error: `无法解析域名 ${host}：工作节点所在网络的 DNS 查不到这个地址。请确认地址拼写正确，并且工作节点能解析这个域名。` };
  }
  if (cfg.transport === 'streamable-http' && /\/sse\/?$/.test(u.pathname)) {
    return { ok: false, error: '服务器返回 405 Method Not Allowed：这个地址只接受 SSE 连接。请把传输方式改成 SSE，或者换成服务器的 Streamable HTTP 地址（通常以 /mcp 结尾）。' };
  }
  if (cfg.authType === 'bearer' && /wrong|invalid|expired/i.test(cfg.token || '')) return { ok: false, error: '服务器返回 401 Unauthorized：Token 无效或已过期，请换一个 Token。' };
  if (cfg.authType === 'oauth' && !cfg.authorized) return { ok: false, error: '还没有完成 OAuth 授权，先点「去授权」。' };
  const tools = mcpcDiscover(u, cfg.hint, cfg.known);
  return {
    ok: true,
    tools,
    latency: 60 + (Math.abs([...host].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)) % 180),
    warning: u.protocol === 'http:' && !internal ? '地址使用 HTTP 明文传输，Token 和工具返回的内容可能被截获，建议改用 HTTPS。' : null,
  };
}

function mcpcUsages(state, id) {
  const mc = (state.mcpClients || []).find((x) => x.id === id);
  const title = (op) => { const t = mc && (mc.tools || []).find((x) => x.name === op); return t ? t.title || t.name : op; };
  return state.workflows.map((w) => {
    const snaps = (state.versions || []).filter((v) => v.workflowId === w.id && v.snapshot && (v.version === w.version || (w.test && v.version === w.test.version))).map((v) => v.snapshot);
    const items = [{ trigger: w.trigger, steps: w.steps }, ...snaps].flatMap((g) => allNodes(g).flatMap((n) => [
      ...(n.connector === id ? [{ key: `node-${n.id}`, kind: 'node', op: n.op, label: n.name }] : []),
      ...(n.kind === 'agent' ? ((n.config || {}).tools || []).filter((t) => t.connector === id).map((t) => ({ key: `agent-${n.id}-${t.op}`, kind: 'agent', op: t.op, label: `${n.name} · ${title(t.op)}` })) : []),
    ]));
    const unique = items.filter((it, i) => items.findIndex((x) => x.key === it.key) === i);
    return unique.length ? { wf: w, items: unique } : null;
  }).filter(Boolean);
}

function mcpcSample(mc, tool, params) {
  const known = SAMPLE_OUTPUT[`${mc.id}.${tool.name}`] || MCPC_SAMPLES[tool.name];
  if (known) return known;
  return { content: [{ type: 'text', text: `「${tool.title || tool.name}」执行成功` }], isError: false, echo: params };
}

function McpcAddModal({ existing, onClose }) {
  const state = useStore();
  const admin = mcpcIsAdmin(state);
  const editable = state.projects.filter((p) => canEditProject(state, p.id));
  const [f, setF] = useState(() => (existing
    ? { name: existing.name, description: existing.description || '', url: existing.url, transport: existing.transport, authType: existing.auth.type, token: '', oauth: { authUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scope: '' }, authorized: existing.auth.type === 'oauth' && existing.auth.configured, scope: existing.scope, projectIds: existing.projectIds || [] }
    : { name: '', description: '', url: '', transport: 'streamable-http', authType: 'bearer', token: '', oauth: { authUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scope: '' }, authorized: false, scope: admin ? 'tenant' : 'project', projectIds: admin ? [] : editable.slice(0, 1).map((p) => p.id) }));
  const [touched, setTouched] = useState(false);
  const [test, setTest] = useState({ status: 'idle', sig: '', result: null });
  const [authing, setAuthing] = useState(false);
  const timer = useRef(null);
  const resultRef = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (['ok', 'fail'].includes(test.status) && resultRef.current) resultRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [test.status]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setOauth = (k) => (v) => setF((x) => ({ ...x, oauth: { ...x.oauth, [k]: v }, authorized: false }));
  const sig = JSON.stringify({ url: f.url.trim(), transport: f.transport, authType: f.authType, token: f.token, oauth: f.oauth, authorized: f.authorized });
  const [baseSig] = useState(sig);
  const keepAuth = Boolean(existing && existing.auth.type === f.authType && existing.auth.configured);
  const usages = existing ? mcpcUsages(state, existing.id) : [];
  const outside = existing && f.scope === 'project' ? usages.filter((u) => !f.projectIds.includes(u.wf.projectId)) : [];
  const n = f.name.trim();
  const errors = {
    name: !n ? '请填写名称' : n.length > 30 ? '名称不能超过 30 个字' : (state.mcpClients || []).some((x) => x.name === n && (!existing || x.id !== existing.id)) ? '已有同名的 MCP 服务器' : null,
    url: mcpcUrlError(f.url),
    token: f.authType === 'bearer' && !f.token.trim() && !keepAuth ? '请填写 Token' : null,
    authUrl: f.authType === 'oauth' && !keepAuth ? (f.oauth.authUrl.trim() ? mcpcUrlError(f.oauth.authUrl) : '请填写授权地址') : null,
    tokenUrl: f.authType === 'oauth' && !keepAuth ? (f.oauth.tokenUrl.trim() ? mcpcUrlError(f.oauth.tokenUrl) : '请填写 Token 地址') : null,
    clientId: f.authType === 'oauth' && !keepAuth && !f.oauth.clientId.trim() ? '请填写 Client ID' : null,
    clientSecret: f.authType === 'oauth' && !keepAuth && !f.oauth.clientSecret.trim() ? '请填写 Client Secret' : null,
    projectIds: f.scope === 'project' && !f.projectIds.length ? '至少选择一个项目' : outside.length ? `「${outside.map((u) => u.wf.name).join('」「')}」所在的项目不在新的范围里，先移除这些引用或者保留原来的范围` : null,
  };
  const connErrors = ['url', 'token', 'authUrl', 'tokenUrl', 'clientId', 'clientSecret'].filter((k) => errors[k]);
  const invalid = Object.values(errors).some(Boolean);
  const err = (k) => (touched || (k === 'projectIds' && outside.length) ? errors[k] : null);
  const tested = test.sig === sig && ['ok', 'fail'].includes(test.status);
  const passed = tested && test.status === 'ok';
  const unchanged = Boolean(existing) && sig === baseSig;
  const canSave = !invalid && (passed || unchanged);
  const saveDisabled = outside.length > 0 || (touched && !canSave);
  const redirect = `https://${state.tenant.domain}/oauth/mcp/callback`;
  const runTest = () => {
    setTouched(true);
    if (connErrors.length) return;
    clearTimeout(timer.current);
    const at = sig;
    setTest({ status: 'running', sig: at, result: null });
    timer.current = setTimeout(() => {
      const result = mcpcCheck({ url: f.url, transport: f.transport, authType: f.authType, token: f.token, authorized: f.authType !== 'oauth' || f.authorized, hint: `${f.name} ${f.description}`, known: existing && existing.url === f.url.trim() ? existing.tools : [] }, Store.get());
      setTest({ status: result.ok ? 'ok' : 'fail', sig: at, result });
    }, 1200);
  };
  const authorize = () => {
    setTouched(true);
    if (['authUrl', 'tokenUrl', 'clientId', 'clientSecret'].some((k) => errors[k])) return;
    setAuthing(true);
    timer.current = setTimeout(() => { setAuthing(false); set({ authorized: true }); toast.success('授权完成'); }, 1000);
  };
  const save = (force) => {
    setTouched(true);
    if (invalid) return;
    if (!canSave && !(force && tested)) return;
    const s = Store.get();
    const now = Date.now();
    const conn = { url: f.url.trim(), transport: f.transport, auth: { type: f.authType, configured: true } };
    const scope = { scope: f.scope, projectIds: f.scope === 'tenant' ? [] : f.projectIds };
    const result = tested ? test.result : null;
    if (existing) {
      if (!(s.mcpClients || []).some((x) => x.id === existing.id)) { toast.error('这个 MCP 服务器已被删除'); onClose(); return; }
      const outcome = result ? (result.ok ? { status: 'connected', error: null, tools: result.tools, lastSyncAt: now } : { status: 'error', error: result.error }) : {};
      patchList('mcpClients', existing.id, { name: n, description: f.description.trim(), ...conn, ...scope, ...outcome });
      addAudit('修改 MCP 服务器', n, null);
      toast.success(result && !result.ok ? '已保存，连接仍然异常' : '已保存');
      onClose();
      return;
    }
    const item = {
      id: uid('mcpc'), name: n, description: f.description.trim(), ...conn,
      status: result && result.ok ? 'connected' : 'error', error: result && result.ok ? null : (result ? result.error : '尚未测试连接'),
      owner: s.me, ...scope, createdAt: now, lastSyncAt: now, tools: result && result.ok ? result.tools : [],
    };
    Store.set((x) => ({ ...x, mcpClients: [item, ...(x.mcpClients || [])] }));
    addAudit('接入 MCP 服务器', item.name, f.scope === 'project' && f.projectIds.length === 1 ? f.projectIds[0] : null);
    toast.success(item.status === 'connected' ? `已接入，发现 ${item.tools.length} 个工具` : '已保存，连接恢复后在详情页点「重试连接」');
    onClose();
    navigate(`/connectors/${item.id}`);
  };
  const footer = html`<${Fragment}>
    <${Button} onClick=${onClose}>取消<//>
    ${tested && test.status === 'fail' && html`<${Button} disabled=${invalid} onClick=${() => save(true)}>先保存，稍后重试<//>`}
    <${Tooltip} content=${!invalid && !canSave ? (existing ? '修改了连接设置，连接测试通过后才能保存' : '连接测试通过后才能保存') : null}>
      <${Button} variant="primary" disabled=${saveDisabled} onClick=${() => save(false)}>${existing ? '保存' : '保存并接入'}<//>
    <//>
  <//>`;
  return html`<${Modal}
    open=${true}
    onClose=${onClose}
    width=${640}
    title=${existing ? '编辑连接设置' : '接入 MCP 服务器'}
    description=${existing ? `修改「${existing.name}」的地址、认证或可用范围，改了地址或认证需要重新测试` : '把企业已有的 MCP 服务器接进来，它的工具可以在工作流和 AI 智能体里使用'}
    footer=${footer}
  >
    <div className="mcpc-form">
      <${Field} label="名称" required error=${err('name')} extra=${html`<span className="text-xs muted">${n.length}/30</span>`}>
        <${Input} value=${f.name} onChange=${(v) => set({ name: v.slice(0, 40) })} placeholder="例如：内部知识库" invalid=${Boolean(err('name'))} autoFocus=${!existing} />
      <//>
      <${Field} label="描述">
        <${Textarea} rows=${2} value=${f.description} onChange=${(v) => set({ description: v.slice(0, 200) })} placeholder="这个服务器提供哪些能力，方便同事判断要不要用" />
      <//>
      <${Field} label="服务器地址" required error=${err('url')} hint="工作节点会从它所在的网络访问这个地址，localhost 只在你自己的电脑上有效">
        <${Input} mono value=${f.url} onChange=${(v) => set({ url: v })} placeholder="https://mcp.your-company.com/mcp" invalid=${Boolean(err('url'))} />
      <//>
      <${Field} label="传输方式" required>
        <${RadioCards} columns=${2} value=${f.transport} onChange=${(v) => set({ transport: v })} options=${MCPC_TRANSPORTS} />
      <//>
      <${Field} label="认证" required>
        <${Segmented} value=${f.authType} onChange=${(v) => set({ authType: v })} options=${MCPC_AUTH} />
      <//>
      ${f.authType === 'none' && html`<${Alert} tone="warning">不需要认证时，任何能访问这个地址的人都能调用它的工具。只在服务器位于内网、并且有其他访问控制时使用。<//>`}
      ${f.authType === 'bearer' && html`<${Field} label="Token" required=${!keepAuth} error=${err('token')} hint="每次调用放在请求头 Authorization: Bearer 里，保存后加密存储">
        <${Input} type="password" mono value=${f.token} onChange=${(v) => set({ token: v })} placeholder=${keepAuth ? '已配置，留空表示不修改' : '粘贴服务器签发的 Token'} invalid=${Boolean(err('token'))} />
      <//>`}
      ${f.authType === 'oauth' && html`<div className="mcpc-oauth">
        <div className="form-grid">
          <${Field} label="授权地址" required=${!keepAuth} error=${err('authUrl')}><${Input} mono value=${f.oauth.authUrl} onChange=${setOauth('authUrl')} placeholder=${keepAuth ? '已配置，留空表示不修改' : 'https://sso.your-company.com/oauth/authorize'} invalid=${Boolean(err('authUrl'))} /><//>
          <${Field} label="Token 地址" required=${!keepAuth} error=${err('tokenUrl')}><${Input} mono value=${f.oauth.tokenUrl} onChange=${setOauth('tokenUrl')} placeholder=${keepAuth ? '已配置，留空表示不修改' : 'https://sso.your-company.com/oauth/token'} invalid=${Boolean(err('tokenUrl'))} /><//>
          <${Field} label="Client ID" required=${!keepAuth} error=${err('clientId')}><${Input} mono value=${f.oauth.clientId} onChange=${setOauth('clientId')} invalid=${Boolean(err('clientId'))} /><//>
          <${Field} label="Client Secret" required=${!keepAuth} error=${err('clientSecret')}><${Input} type="password" mono value=${f.oauth.clientSecret} onChange=${setOauth('clientSecret')} placeholder=${keepAuth ? '已配置，留空表示不修改' : ''} invalid=${Boolean(err('clientSecret'))} /><//>
        </div>
        <${Field} label="Scope" hint="可选，多个用空格分隔"><${Input} mono value=${f.oauth.scope} onChange=${setOauth('scope')} placeholder="read tools" /><//>
        <${Field} label="回调地址" hint="在授权服务器里登记这个地址">
          <div className="webhook-url"><span className="url">${redirect}</span><${CopyButton} text=${redirect} /></div>
        <//>
        <div className="row">
          <${Button} icon="LogIn" loading=${authing} onClick=${authorize}>${f.authorized ? '重新授权' : '去授权'}<//>
          ${f.authorized && html`<span className="mcpc-authed"><${Icon} name="CircleCheck" size=${14} />已授权</span>`}
        </div>
      </div>`}
      <${Field} label="可用范围" required error=${err('projectIds')}>
        <${RadioGroup} value=${f.scope} onChange=${(v) => set({ scope: v })} options=${[{ value: 'tenant', label: '全部项目', disabled: !admin }, { value: 'project', label: '指定项目' }]} />
        ${!admin && html`<div className="field-hint">只有平台管理员可以开放给全部项目</div>`}
        ${f.scope === 'project' && html`<div className="mcpc-projects"><${Select} multiple value=${f.projectIds} onChange=${(v) => set({ projectIds: v })} placeholder="选择项目" invalid=${Boolean(err('projectIds'))} options=${editable.map((p) => ({ value: p.id, label: p.name, iconNode: html`<${ProjectAvatar} project=${p} size=${18} />` }))} /></div>`}
      <//>
      <div className="mcpc-test" ref=${resultRef}>
        <div className="row">
          <${Button} icon="PlugZap" loading=${test.status === 'running'} onClick=${runTest}>连接测试<//>
          <span className="text-xs muted">${unchanged && test.status === 'idle' ? '连接设置没有修改，可以直接保存' : '由工作节点实际连接服务器，并读取工具列表'}</span>
        </div>
        ${test.status === 'running' && html`<div className="mcpc-result is-running"><${Icon} name="LoaderCircle" size=${14} className="spin" /><span>正在由工作节点连接 ${(() => { try { return new URL(f.url.trim()).host; } catch (e) { return f.url; } })()}…</span></div>`}
        ${test.status !== 'running' && test.status !== 'idle' && test.sig !== sig && html`<div className="mcpc-result"><${Icon} name="Info" size=${14} /><span>连接设置改过了，需要重新测试</span></div>`}
        ${tested && !passed && html`<div className="mcpc-result is-fail"><${Icon} name="CircleX" size=${14} /><span>${test.result.error}</span></div>`}
        ${passed && html`<div className="mcpc-result is-ok">
          <div className="row-4"><${Icon} name="CircleCheck" size=${14} /><span>连接成功，发现 ${test.result.tools.length} 个工具 · 延迟 ${test.result.latency} ms</span></div>
          ${test.result.warning && html`<div className="mcpc-warn"><${Icon} name="TriangleAlert" size=${13} /><span>${test.result.warning}</span></div>`}
          <div className="mcpc-found">${test.result.tools.map((t) => html`<div key=${t.name} className="mcpc-found-row">
            <${Icon} name="Wrench" size=${13} />
            <span className="mcpc-found-title">${t.title}</span>
            <span className="mono text-xs muted">${t.name}</span>
            <span className="spacer" />
            <span className="text-xs muted">${t.params.length} 个参数</span>
          </div>`)}</div>
        </div>`}
      </div>
    </div>
  <//>`;
}

function McpcTryDrawer({ mc, tool, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries((tool.params || []).map((p) => [p.key, ''])));
  const [touched, setTouched] = useState(false);
  const [run, setRun] = useState({ status: 'idle', result: null, at: 0 });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const errors = Object.fromEntries((tool.params || []).map((p) => {
    const v = String(values[p.key] || '').trim();
    if (!v) return [p.key, p.required ? `请填写${p.label}` : null];
    if (p.type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) return [p.key, `${p.label}需要是数字`];
    return [p.key, null];
  }));
  const invalid = Object.values(errors).some(Boolean);
  const params = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v).trim()).map(([k, v]) => [k, (tool.params.find((p) => p.key === k) || {}).type === 'number' ? Number(v) : String(v).trim()]));
  const go = () => {
    setTouched(true);
    if (invalid || mc.status !== 'connected') return;
    setRun({ status: 'running', result: null, at: 0 });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRun({ status: 'done', result: mcpcSample(mc, tool, params), at: Date.now() });
      addAudit('试用 MCP 工具', `${mc.name} · ${tool.name}`, null);
    }, 800);
  };
  const writes = /^(create|update|delete|remove|send|submit|post|add|set|save)/i.test(tool.name);
  return html`<${Drawer}
    open=${true}
    onClose=${onClose}
    width=${560}
    title=${`试用工具：${tool.title || tool.name}`}
    subtitle=${`${mc.name} · ${tool.name}`}
    footer=${html`<${Fragment}><${Button} onClick=${onClose}>关闭<//><${Button} variant="primary" icon="Play" loading=${run.status === 'running'} disabled=${mc.status !== 'connected'} onClick=${go}>调用<//><//>`}
  >
    <p className="muted mcpc-try-desc">${tool.description}</p>
    ${mc.status !== 'connected' && html`<${Alert} tone="danger" title="服务器连接异常">${mc.error || '连接不上服务器'}，先在详情页重试连接。<//>`}
    ${writes && html`<div className="mcpc-gap"><${Alert} tone="warning" title="会真实执行">这个工具会在服务器上创建或修改数据，试用和正式调用一样生效。先确认参数再调用。<//></div>`}
    ${(tool.params || []).length === 0 && html`<div className="text-xs muted">这个工具没有参数。</div>`}
    ${(tool.params || []).map((p) => html`<${Field} key=${p.key} label=${p.label} required=${p.required} error=${touched ? errors[p.key] : null} hint=${`${p.key} · ${p.type}`}>
      <${Input} value=${values[p.key]} onChange=${(v) => setValues((x) => ({ ...x, [p.key]: v }))} mono=${p.type === 'number'} invalid=${Boolean(touched && errors[p.key])} placeholder=${p.type === 'number' ? '例如：5' : ''} />
    <//>`)}
    ${run.status === 'done' && html`<div className="mcpc-try-result">
      <div className="op-sub">返回结果 · ${fmt.dateTime(run.at).slice(11)}</div>
      <div className="mcpc-json"><${JsonView} value=${run.result} defaultExpandDepth=${3} /></div>
      <div className="text-xs muted">试用调用会记在审计日志里，不会产生运行记录。</div>
    </div>`}
  <//>`;
}

function ConnectorsMcpDetail({ id }) {
  const state = useStore();
  const [tab, setTab] = useState('tools');
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(false);
  const [trying, setTrying] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mc = (state.mcpClients || []).find((x) => x.id === id) || null;
  if (!mc || !mcpcVisible(state, mc)) {
    return html`<div className="page"><div className="page-inner">
      <${Breadcrumb} items=${[{ label: '连接器市场', to: '/connectors' }, { label: 'MCP 服务器', to: '/connectors?cat=mcp' }]} />
      <${Empty} icon="ServerOff" title=${mc ? '你没有权限查看这个 MCP 服务器' : 'MCP 服务器不存在'} description=${mc ? '它只开放给指定的项目，你不在这些项目里。' : '链接可能已经失效，或者它已被删除。'} action=${html`<${Button} onClick=${() => navigate('/connectors?cat=mcp')}>返回 MCP 服务器列表<//>`} />
    </div></div>`;
  }
  const manage = mcpcCanManage(state, mc);
  const manageTip = manage ? null : `只有所有者${personName(mc.owner)}和平台管理员可以修改`;
  const ok = mc.status === 'connected';
  const usages = mcpcUsages(state, mc.id);
  const member = new Set(state.members.filter((m) => m.userId === state.me).map((m) => m.projectId));
  const shown = usages.filter((u) => member.has(u.wf.projectId));
  const hidden = usages.length - shown.length;
  const rows = shown.flatMap((u) => u.items.map((it) => ({ id: `${u.wf.id}-${it.key}`, wf: u.wf, item: it })));
  const tools = mc.tools || [];
  const reconnect = (mode) => {
    setBusy(mode);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const s = Store.get();
      const live = (s.mcpClients || []).find((x) => x.id === id);
      setBusy(null);
      if (!live) return;
      const r = mcpcCheck({ url: live.url, transport: live.transport, authType: live.auth.type, token: '', authorized: live.auth.configured, hint: `${live.name} ${live.description || ''}`, known: live.tools }, s);
      if (!r.ok) {
        patchList('mcpClients', id, { status: 'error', error: r.error });
        addAudit(mode === 'sync' ? '同步 MCP 工具' : '重试连接 MCP 服务器', `${live.name}（失败）`, null);
        toast.error(mode === 'sync' ? '同步失败，连接不上服务器' : '还是连接不上，原因见页面上的说明');
        return;
      }
      const before = new Set((live.tools || []).map((t) => t.name));
      const after = new Set(r.tools.map((t) => t.name));
      const added = r.tools.filter((t) => !before.has(t.name));
      const gone = (live.tools || []).filter((t) => !after.has(t.name));
      patchList('mcpClients', id, { status: 'connected', error: null, tools: r.tools, lastSyncAt: Date.now() });
      addAudit(mode === 'sync' ? '同步 MCP 工具' : '重试连接 MCP 服务器', `${live.name}：${r.tools.length} 个工具${added.length ? `，新增 ${added.length} 个` : ''}${gone.length ? `，移除 ${gone.length} 个` : ''}`, null);
      if (mode === 'retry') toast.success(`连接已恢复，发现 ${r.tools.length} 个工具`);
      else if (added.length || gone.length) toast.success(`同步完成：${added.length ? `新增「${added.map((t) => t.title).join('」「')}」` : ''}${gone.length ? `${added.length ? '，' : ''}移除「${gone.map((t) => t.title).join('」「')}」` : ''}`);
      else toast.success('工具列表已是最新');
      const inUse = gone.filter((t) => usages.some((u) => u.items.some((it) => it.op === t.name)));
      if (inUse.length) toast.warning(`「${inUse.map((t) => t.title).join('」「')}」已被服务器移除，还有工作流在用`);
    }, 1200);
  };
  const remove = async () => {
    if (usages.length) { setBlocked(true); return; }
    const confirmed = await confirmDialog({ title: `删除 MCP 服务器「${mc.name}」？`, content: '没有工作流在用它。删除后，它的工具会从编辑器的节点面板和智能体的工具列表里消失。', danger: true, okText: '删除', confirmText: mc.name });
    if (!confirmed) return;
    removeFromList('mcpClients', [mc.id]);
    addAudit('删除 MCP 服务器', mc.name, null);
    toast.success('已删除');
    navigate('/connectors?cat=mcp');
  };
  const meta = [
    ['传输方式', mc.transport === 'sse' ? 'SSE' : 'Streamable HTTP'],
    ['认证', MCPC_AUTH_LABEL[mc.auth.type] || mc.auth.type],
    ['可用范围', mcpcScopeText(state, mc)],
    ['所有者', personName(mc.owner)],
    ['接入于', fmt.date(mc.createdAt)],
    ['最近同步', mc.lastSyncAt ? fmt.relative(mc.lastSyncAt) : '-'],
  ];
  return html`<div className="page"><div className="page-inner">
    <${Breadcrumb} items=${[{ label: '连接器市场', to: '/connectors' }, { label: 'MCP 服务器', to: '/connectors?cat=mcp' }, { label: mc.name }]} />
    <div className="conn-hero">
      <${KindTile} icon="Server" size=${64} />
      <div className="grow">
        <div className="row"><h1 className="page-title">${mc.name}</h1><${Tag} tone="outline" icon="Server">MCP 服务器<//><${Tag} tone=${ok ? 'success' : 'danger'} dot>${ok ? '已连接' : '连接异常'}<//></div>
        <p className="muted connectors-desc">${mc.description || '暂无描述'}</p>
        <div className="mcpc-address"><span className="mono ellipsis" title=${mc.url}>${mc.url}</span><${CopyButton} text=${mc.url} /></div>
        <div className="connectors-meta">${meta.map(([k, v]) => html`<span key=${k}>${k}：${v}</span>`)}</div>
      </div>
      <div className="connectors-hero-actions">
        <${Tooltip} content=${manageTip}><${Button} variant="primary" icon="RefreshCw" block loading=${busy === 'sync'} disabled=${!manage || Boolean(busy)} onClick=${() => reconnect('sync')}>同步工具<//><//>
        <${Tooltip} content=${manageTip}><${Button} icon="Settings2" block disabled=${!manage} onClick=${() => setEditing(true)}>编辑连接设置<//><//>
        <${Tooltip} content=${manageTip}><${Button} variant="danger-outline" icon="Trash2" block disabled=${!manage} onClick=${remove}>删除<//><//>
      </div>
    </div>
    ${!ok && html`<div className="mcpc-gap"><${Alert} tone="danger" title="连接异常" action=${manage ? html`<${Button} size="sm" icon="RotateCw" loading=${busy === 'retry'} disabled=${Boolean(busy)} onClick=${() => reconnect('retry')}>重试连接<//>` : null}>
      ${mc.error || '连接不上服务器'}${!manage ? `。请联系所有者${personName(mc.owner)}处理。` : ''}
      ${usages.length > 0 && html`<div className="mcpc-impact">影响 ${usages.length} 个工作流：用到它的节点和智能体工具在连接恢复前会失败。</div>`}
    <//></div>`}
    <div className="mcpc-gap"><${Alert} tone="info" title="在哪里用这些工具">
      连接正常时，编辑器节点面板的「应用」里能找到这个服务器，它的工具可以当操作加进工作流；在「AI 智能体」节点的「工具」里添加后，由智能体在护栏内自己决定何时调用。
    <//></div>
    <${Tabs}
      value=${tab}
      onChange=${setTab}
      items=${[
        { value: 'tools', label: '工具', count: tools.length },
        { value: 'usage', label: '使用情况', count: usages.length },
        { value: 'settings', label: '连接设置' },
      ]}
    />
    ${tab === 'tools' && (tools.length === 0
      ? html`<${Empty} size="sm" icon="Wrench" title="还没有发现工具" description=${ok ? '点「同步工具」重新读取服务器的工具列表。' : '连接恢复后，点「同步工具」读取服务器的工具列表。'} />`
      : html`<div className="op-group">${tools.map((t) => html`<${Collapse}
        key=${t.name}
        className="op-item"
        defaultOpen=${false}
        title=${html`<span className="row"><span>${t.title || t.name}</span><span className="muted text-xs mono">${t.name}</span><${Tag} size="sm">${(t.params || []).length} 个参数<//></span>`}
        extra=${html`<${Tooltip} content=${ok ? null : '服务器连接异常，恢复后才能试用'}><${Button} size="xs" variant="ghost" icon="Play" disabled=${!ok} onClick=${() => setTrying(t)}>试用<//><//>`}
      >
        <div className="connectors-op">
          ${t.description && html`<p className="muted connectors-op-desc">${t.description}</p>`}
          <div className="op-sub">参数</div>
          ${(t.params || []).length
            ? html`<${ConnectorSchemaTable} rows=${t.params.map((p) => ({ name: p.key, type: p.type, required: Boolean(p.required), desc: p.label }))} expandAll=${false} showRequired />`
            : html`<div className="connectors-none">没有参数</div>`}
        </div>
      <//>`)}</div>`)}
    ${tab === 'usage' && html`<div className="mcpc-usage">
      <${Table}
        rowKey="id"
        columns=${[
          { key: 'wf', title: '工作流', render: (r) => html`<div className="cell-main"><${WorkflowGlyph} wf=${r.wf} size=${18} /><span className="cell-title ellipsis">${r.wf.name}</span></div>` },
          { key: 'p', title: '所属项目', width: 120, render: (r) => (state.projects.find((p) => p.id === r.wf.projectId) || {}).name || '-' },
          { key: 'kind', title: '用法', width: 120, render: (r) => html`<${Tag} size="sm" tone=${r.item.kind === 'agent' ? 'primary' : 'default'} icon=${r.item.kind === 'agent' ? 'Bot' : 'Workflow'}>${r.item.kind === 'agent' ? '智能体工具' : '工作流节点'}<//>` },
          { key: 'node', title: '节点', render: (r) => html`<span className="ellipsis">${r.item.label}</span>` },
        ]}
        data=${rows}
        onRowClick=${(r) => navigate(`/integration/${r.wf.projectId}/wf/${r.wf.id}`)}
        empty=${html`<${Empty} size="sm" icon="Workflow" title="还没有工作流在用它" description="在编辑器里把它的工具拖进工作流，或者加到 AI 智能体的工具里。" />`}
      />
      ${hidden > 0 && html`<div className="text-xs muted mcpc-hidden">另有 ${hidden} 个工作流在你没有权限查看的项目里。</div>`}
    </div>`}
    ${tab === 'settings' && html`<div className="card mcpc-settings"><div className="card-body">
      <dl className="mcpc-dl">
        <dt>名称</dt><dd>${mc.name}</dd>
        <dt>描述</dt><dd>${mc.description || '-'}</dd>
        <dt>服务器地址</dt><dd className="mono">${mc.url}</dd>
        <dt>传输方式</dt><dd>${mc.transport === 'sse' ? 'SSE（旧版协议）' : 'Streamable HTTP'}</dd>
        <dt>认证</dt><dd>${MCPC_AUTH_LABEL[mc.auth.type] || mc.auth.type}${mc.auth.type !== 'none' ? (mc.auth.configured ? ' · 已配置，密钥加密存储，不在页面上显示' : ' · 未配置') : ''}</dd>
        <dt>可用范围</dt><dd>${mc.scope === 'tenant' ? '全部项目' : (mc.projectIds || []).map((pid) => (state.projects.find((p) => p.id === pid) || {}).name).filter(Boolean).join('、')}</dd>
        <dt>所有者</dt><dd>${personName(mc.owner)}</dd>
      </dl>
      ${manage && html`<${Button} icon="Settings2" onClick=${() => setEditing(true)}>编辑连接设置<//>`}
    </div></div>`}
    ${editing && html`<${McpcAddModal} existing=${mc} onClose=${() => setEditing(false)} />`}
    ${trying && html`<${McpcTryDrawer} mc=${mc} tool=${trying} onClose=${() => setTrying(null)} />`}
    <${Modal}
      open=${blocked}
      onClose=${() => setBlocked(false)}
      width=${520}
      title=${`不能删除「${mc.name}」`}
      description="还有工作流在用它的工具，删除后这些工作流会运行失败"
      footer=${html`<${Button} variant="primary" onClick=${() => setBlocked(false)}>知道了<//>`}
    >
      <div className="mcpc-block-list">
        ${shown.map((u) => html`<button key=${u.wf.id} type="button" className="attention-row" onClick=${() => { setBlocked(false); navigate(`/integration/${u.wf.projectId}/wf/${u.wf.id}`); }}>
          <${WorkflowGlyph} wf=${u.wf} size=${18} />
          <span className="grow">
            <span className="home-block ellipsis">${u.wf.name}</span>
            <span className="text-xs muted">${u.items.map((it) => `${it.kind === 'agent' ? '智能体工具' : '节点'}「${it.label}」`).join('、')}</span>
          </span>
          <${Icon} name="ChevronRight" size=${14} className="muted" />
        </button>`)}
        ${hidden > 0 && html`<div className="text-xs muted">另有 ${hidden} 个工作流在你没有权限查看的项目里，需要联系对应项目的所有者处理。</div>`}
      </div>
      <div className="text-xs muted mcpc-block-tip">先在这些工作流里移除相关节点或智能体工具，重新发布后再删除。</div>
    <//>
  </div></div>`;
}

const CONNECTOR_TRIGGER_KIND = { webhook: '即时', polling: '轮询', schedule: '定时', manual: '手动', alert: '告警' };

const MCPC_TRANSPORTS = [
  { value: 'streamable-http', label: 'Streamable HTTP', desc: 'MCP 的新协议，推荐' },
  { value: 'sse', label: 'SSE', desc: '旧版协议，部分服务器只支持这种' },
];

const MCPC_AUTH = [
  { value: 'none', label: '无' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'oauth', label: 'OAuth 2.0' },
];

const MCPC_AUTH_LABEL = { none: '无需认证', bearer: 'Bearer Token', oauth: 'OAuth 2.0' };

const MCPC_TOOLSETS = [
  { words: ['kb', 'wiki', 'confluence', 'docs', 'knowledge', '知识库', '文档'], tools: [
    { name: 'search_pages', title: '搜索知识库', description: '按关键词搜索知识库页面，返回标题、摘要和链接', params: [{ key: 'query', label: '关键词', type: 'string', required: true }, { key: 'limit', label: '返回条数', type: 'number', required: false }] },
    { name: 'get_page', title: '读取页面', description: '按页面 ID 读取正文', params: [{ key: 'pageId', label: '页面 ID', type: 'string', required: true }] },
    { name: 'list_recent_updates', title: '最近更新', description: '列出最近 7 天更新过的页面', params: [{ key: 'space', label: '空间', type: 'string', required: false }] },
  ] },
  { words: ['jira', 'issue', 'ticket', 'itsm', 'servicedesk', 'helpdesk', '工单', '服务台'], tools: [
    { name: 'search_issues', title: '搜索工单', description: '按关键词或状态搜索工单', params: [{ key: 'query', label: '关键词', type: 'string', required: true }] },
    { name: 'get_issue', title: '查看工单', description: '按工单号读取详情和处理记录', params: [{ key: 'key', label: '工单号', type: 'string', required: true }] },
    { name: 'create_issue', title: '创建工单', description: '新建一张工单', params: [{ key: 'summary', label: '标题', type: 'string', required: true }, { key: 'description', label: '描述', type: 'string', required: false }] },
  ] },
  { words: ['erp', 'kingdee', 'finance', 'fin.', '金蝶', '财务', '凭证'], tools: [
    { name: 'query_voucher', title: '查询凭证', description: '按期间查询会计凭证', params: [{ key: 'period', label: '会计期间', type: 'string', required: true }] },
    { name: 'get_balance', title: '查询科目余额', description: '按科目编码查询期末余额', params: [{ key: 'account', label: '科目编码', type: 'string', required: true }, { key: 'period', label: '会计期间', type: 'string', required: true }] },
  ] },
  { words: ['crm', 'sales', '客户', '销售'], tools: [
    { name: 'search_accounts', title: '搜索客户', description: '按名称搜索客户', params: [{ key: 'name', label: '客户名称', type: 'string', required: true }] },
    { name: 'create_followup', title: '记录跟进', description: '给客户添加一条跟进记录', params: [{ key: 'accountId', label: '客户 ID', type: 'string', required: true }, { key: 'content', label: '跟进内容', type: 'string', required: true }] },
  ] },
  { words: ['hr.', 'people', 'ehr', 'staff', '人事', '员工'], tools: [
    { name: 'get_employee', title: '查询员工', description: '按工号查询员工档案', params: [{ key: 'employeeId', label: '工号', type: 'string', required: true }] },
    { name: 'list_departments', title: '查询组织架构', description: '返回部门列表和上下级关系', params: [] },
  ] },
  { words: ['db.', 'data', 'sql', 'warehouse', 'bi.', '数据库', '数仓'], tools: [
    { name: 'list_tables', title: '列出数据表', description: '列出可以查询的数据表', params: [] },
    { name: 'run_query', title: '执行只读查询', description: '执行一条只读 SQL，最多返回 500 行', params: [{ key: 'sql', label: 'SQL', type: 'string', required: true }] },
  ] },
  { words: [], tools: [
    { name: 'search', title: '搜索', description: '按关键词搜索服务器提供的内容', params: [{ key: 'query', label: '关键词', type: 'string', required: true }] },
    { name: 'fetch', title: '读取详情', description: '按 ID 读取一条内容的详情', params: [{ key: 'id', label: 'ID', type: 'string', required: true }] },
  ] },
];

const MCPC_SAMPLES = {
  search_pages: { total: 2, items: [{ title: '会议室投屏常见问题', url: 'https://kb.xinghe.tech/pages/2231', snippet: '无法投屏时先检查投屏器是否连到 Xinghe-Meeting 网络……' }, { title: '会议室设备报修流程', url: 'https://kb.xinghe.tech/pages/1874', snippet: '硬件故障请在 IT 服务台建工单，类型选择硬件报修……' }] },
  list_recent_updates: { total: 2, items: [{ title: 'VPN 客户端升级说明', updatedAt: '2026-09-24 16:20', updatedBy: '李航' }, { title: '新员工 IT 设备领取指南', updatedAt: '2026-09-23 10:05', updatedBy: '王磊' }] },
  search_issues: { total: 1, items: [{ key: 'IT-3317', summary: '3 楼 301 会议室投影仪无法投屏', status: '处理中' }] },
  get_issue: { key: 'IT-3317', summary: '3 楼 301 会议室投影仪无法投屏', status: '处理中', assignee: '李航' },
  create_issue: { key: 'IT-3322', url: 'https://xinghe.atlassian.net/browse/IT-3322' },
  query_voucher: { total: 1, items: [{ number: '记-0912', date: '2026-09-20', amount: 6280, summary: '报销差旅费' }] },
  get_balance: { account: '6602', name: '管理费用', balance: 128600.5 },
  search_accounts: { total: 1, items: [{ id: 'acc_8812', name: '云帆物流', owner: '孙悦' }] },
  create_followup: { id: 'fu_2031', ok: true },
  get_employee: { employee_id: 'XH20210311', name: '许诺', department: '销售运营部', status: '在职' },
  list_departments: { items: [{ id: 'od-rd-001', name: '研发中心' }, { id: 'od-sales-002', name: '销售运营部' }] },
  list_tables: { items: ['sales_order', 'daily_report', 'attendance_exception'] },
  run_query: { rowCount: 2, rows: [{ day: '2026-09-25', orders: 128 }, { day: '2026-09-24', orders: 117 }] },
};

