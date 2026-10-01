function ConnectionsPage() {
  const s = useStore();
  return html`<div className="page-inner">
    <${PageHeader}
      title="连接"
      description="凭证、权限、速率上限和使用方都在这里。同一个连接的请求共用一个速率上限，超出的排队等待，不算失败。"
    />
    <${Table}
      onRowClick=${(c) => navigate(`/connections/${c.id}`)}
      columns=${[
        { key: 'name', title: '连接', render: (c) => html`<div className="cell-main"><${SysLogo} system=${c.system} size=${28} /><div><div className="cell-title">${c.name}</div><div className="cell-sub">${c.authKind} · 负责人 ${c.owner}</div></div></div>` },
        { key: 'health', title: '健康', render: (c) => { const h = connectionHealth(s, c); return h.ok ? html`<${Tag} size="sm" tone="success" icon="CircleCheck">正常<//>` : html`<div className="col" style=${{ gap: 2 }}>${h.problems.map((p) => html`<span key=${p.text} className=${`text-xs tone-${p.tone}-text`}>${p.text}</span>`)}</div>`; } },
        { key: 'rate', title: '速率上限', render: (c) => html`<span className="num">每秒 ${c.rate.limit} 次</span>` },
        { key: 'exp', title: '凭证到期', render: (c) => (c.expiresAt ? html`<span className=${credentialDaysLeft(c) <= 7 ? 'tone-warning-text' : ''}>${credentialDaysLeft(c)} 天后</span>` : html`<span className="muted">自动续期</span>`) },
        { key: 'calls', title: '今天调用', align: 'right', render: (c) => html`<span className="num">${fmt.number(c.callsToday)}</span>` },
        { key: 'use', title: '使用方', render: (c) => { const u = connectionConsumers(s, c); return html`<span className="muted">${u.projects.map((p) => p.name).join('、')}</span>`; } },
      ]}
      data=${s.connections}
    />
  </div>`;
}

function ConnectionPage({ params }) {
  const s = useStore();
  const conn = getConnection(s, params.id);
  if (!conn) return html`<${NotFoundPage} />`;
  const health = connectionHealth(s, conn);
  const consumers = connectionConsumers(s, conn);
  const connector = getConnector(conn.system);
  const credIssue = s.issues.find((i) => i.status === 'open' && i.kind === 'credential' && i.connectionId === conn.id);
  const days = credentialDaysLeft(conn);
  const labels = Array.from({ length: 7 }, (_, i) => fmt.date(Date.now() - (6 - i) * DAY).slice(5));
  const queue = conn.queueDaily.map((v, i) => ({
    label: labels[i], short: labels[i], value: v, tone: v === Math.max(...conn.queueDaily) && v > 0 ? 'accent' : 'muted', mark: v === Math.max(...conn.queueDaily) && v > 0,
    tip: v ? `${fmt.number(v)} 次请求排队，最长等待 ${fmt.duration(conn.waitDaily[i])}` : '没有排队',
  }));
  return html`<div className="page-inner">
    <${Breadcrumb} items=${[{ label: '连接', to: '/connections' }, { label: conn.name }]} />
    <div className="record-head">
      <${SysLogo} system=${conn.system} size=${44} />
      <div className="grow">
        <h1 className="page-title">${conn.name}</h1>
        <div className="page-desc">${conn.authKind} · 负责人 ${conn.owner} · 创建于 ${fmt.date(conn.createdAt)}</div>
      </div>
      ${health.ok ? html`<${Tag} tone="success" icon="CircleCheck">正常<//>` : html`<${Tag} tone="warning" icon="TriangleAlert">${health.problems.length} 个提醒<//>`}
    </div>
    <div className="issue-grid">
      <div className="col" style=${{ gap: 16, minWidth: 0 }}>
        ${conn.scope && html`<${Card} title=${conn.scope.label} subtitle=${`${conn.scope.mode} · 不在范围内的部门，开通、更新和读取都会被拒绝`}>
          <div className="col" style=${{ gap: 12 }}>
            <div className="scope-chips">
              ${conn.scope.included.map((d) => html`<span key=${d} className="scope-chip">${d}</span>`)}
              ${conn.scope.missing.map((d) => html`<span key=${d} className="scope-chip is-missing"><${Icon} name="TriangleAlert" size=${12} />${d}（缺少）</span>`)}
            </div>
            ${conn.scope.missing.length > 0 && html`<${ScopeFixCard} connId=${conn.id} />`}
          </div>
        <//>`}
        <${Card} title="权限" subtitle="按用到的操作列出。飞书只在调用时才告诉你缺哪项，所以平台不在保存时做全量探测，而是记录每项权限最近一次调用成功的时间">
          <${Table}
            dense
            columns=${[
              { key: 'name', title: '权限', render: (p) => html`<b>${p.name}</b>` },
              { key: 'used', title: '用在', wrap: true, render: (p) => html`<span className="muted">${p.usedBy.join('、')}</span>` },
              { key: 'state', title: '状态', render: (p) => (p.state === 'verified' ? html`<${Tag} size="sm" tone="success" icon="CircleCheck">已验证<//>` : html`<${Tag} size="sm" tone="danger" icon="CircleX">缺少<//>`) },
              { key: 'at', title: '最近一次调用成功', render: (p) => html`<span className="muted">${fmt.relative(p.at)}</span>` },
            ]}
            data=${conn.permissions}
            rowKey="name"
          />
        <//>
        <${Card} title="速率与排队" subtitle="同一连接的请求共用一个上限；超出的在平台里排队，按对方返回的 Retry-After 退避，不会撞上限流再失败">
          <div className="rate-row">
            <div>
              <div className="muted text-xs">当前上限</div>
              <div className="row" style=${{ marginTop: 4 }}>
                <${Select}
                  width=${150}
                  value=${conn.rate.limit}
                  onChange=${(v) => { actSetRateLimit(conn.id, v); toast.success(`已改为每秒 ${v} 次`); }}
                  options=${[conn.rate.declared, ...[40, 30, 20, 10, 5].filter((n) => n < conn.rate.declared)].map((n) => ({ value: n, label: `每秒 ${n} 次`, desc: n === conn.rate.declared ? '连接器按对方文档声明的上限' : '给其他系统留出余量' }))}
                />
              </div>
              <div className="muted text-xs" style=${{ marginTop: 6 }}>连接器声明 每秒 ${conn.rate.declared} 次，只能调低</div>
            </div>
            <div className="grow">
              <div className="muted text-xs" style=${{ marginBottom: 8 }}>近 7 天每天排队的请求数</div>
              <${ColumnChart} data=${queue} height=${90} ariaLabel="近 7 天每天排队的请求数" />
            </div>
          </div>
          ${Math.max(...conn.queueDaily) > 0 && html`<div className="muted text-xs" style=${{ marginTop: 10 }}>
            高峰那天：校招集中入职，${fmt.number(Math.max(...conn.queueDaily))} 次请求排队，最长等待 ${fmt.duration(Math.max(...conn.waitDaily))}，没有一次运行因为限流失败。
          </div>`}
        <//>
      </div>
      <aside className="col" style=${{ gap: 16 }}>
        <div className="side-card">
          <div className="side-card-head"><span>凭证</span></div>
          <div className="kv-list">
            ${conn.fields.map((f) => html`<div key=${f.label}><span>${f.label}</span><b className=${f.secret ? '' : 'mono'}>${f.value}</b></div>`)}
            <div><span>到期</span><b className=${days != null && days <= 7 ? 'tone-warning-text' : ''}>${conn.expiresAt ? `${fmt.date(conn.expiresAt)}（${days} 天后）` : '不过期'}</b></div>
          </div>
          <div className="muted text-xs" style=${{ marginTop: 8 }}>${conn.credentialNote}</div>
          ${credIssue && html`<div style=${{ marginTop: 10 }}><${Button} size="sm" icon="KeyRound" onClick=${() => navigate(`/issues/${credIssue.id}`)}>更新密钥<//></div>`}
        </div>
        <div className="side-card">
          <div className="side-card-head"><span>使用方</span></div>
          <div className="col" style=${{ gap: 6 }}>
            ${consumers.workflows.map((w) => html`<${Link} key=${w.id} to=${`/workflows/${w.id}`} className="use-row"><${Icon} name="Workflow" size=${14} />${w.name}<span className="muted text-xs">${getProject(s, w.projectId).name}</span><//>`)}
            ${consumers.recons.map((r) => html`<${Link} key=${r.id} to=${`/projects/${r.projectId}/recon`} className="use-row"><${Icon} name="GitCompareArrows" size=${14} />${r.name}<//>`)}
          </div>
          <div className="muted text-xs" style=${{ marginTop: 8 }}>所有使用方共用上面的速率上限。</div>
        </div>
        <div className="side-card">
          <div className="side-card-head"><span>连接器</span><${Link} to=${`/connectors?id=${connector.id}`} className="link text-xs">查看<//></div>
          <div className="muted text-xs">${systemName(conn.system)} · ${Object.values(connector.checks).filter(Boolean).length} / ${DEPTH_CHECKS.length} 项深度检查通过</div>
        </div>
      </aside>
    </div>
  </div>`;
}

function ConnectorsPage({ query }) {
  const [openId, setOpenId] = useState(query.id || null);
  const ctr = openId ? CONNECTORS.find((c) => c.id === openId) : null;
  const stateTag = { ready: ['success', '可用'], building: ['warning', '开发中'], planned: ['default', '规划中'] };
  return html`<div className="page-inner">
    <${PageHeader}
      title="连接器"
      description="第一方连接器打进镜像，装好就有。深度比数量重要：每个第一方连接器都要过同一张清单。"
    />
    <div className="depth-legend">
      ${DEPTH_CHECKS.map((c, i) => html`<${Tooltip} key=${c.key} content=${c.desc}><span className="depth-legend-item"><span className="depth-legend-num">${i + 1}</span>${c.label}</span><//>`)}
    </div>
    <div className="ctr-grid">
      ${CONNECTORS.map((c) => {
        const passed = DEPTH_CHECKS.filter((d) => c.checks[d.key]).length;
        const [tone, label] = stateTag[c.state];
        return html`<button key=${c.id} type="button" className="ctr-card" onClick=${() => setOpenId(c.id)}>
          <div className="row">
            <${SysLogo} system=${c.system} size=${36} />
            <div className="grow">
              <div className="ctr-name">${systemName(c.system)}</div>
              <div className="muted text-xs">${c.category} · ${c.batch}</div>
            </div>
            <${Tag} size="sm" tone=${tone}>${label}<//>
          </div>
          <div className="ctr-desc">${c.desc}</div>
          ${c.generic
            ? html`<div className="muted text-xs">通用连接器不参与深度清单；是否幂等由节点声明</div>`
            : html`<div className="depth-bar" title=${`${passed} / ${DEPTH_CHECKS.length} 项通过`}>
              ${DEPTH_CHECKS.map((d) => html`<span key=${d.key} className=${cx('depth-seg', c.checks[d.key] && 'is-pass')} />`)}
              <span className="depth-num">${passed} / ${DEPTH_CHECKS.length}</span>
            </div>`}
        </button>`;
      })}
    </div>
    <${Drawer}
      open=${Boolean(ctr)}
      onClose=${() => setOpenId(null)}
      width=${600}
      title=${ctr ? systemName(ctr.system) : ''}
      subtitle=${ctr ? `${ctr.category} · ${ctr.batch}${ctr.rate ? ` · 声明速率每秒 ${ctr.rate} 次` : ''}` : ''}
      icon=${ctr && html`<${SysLogo} system=${ctr.system} size=${32} />`}
    >
      ${ctr && html`<div className="col" style=${{ gap: 18 }}>
        <div>${ctr.desc}</div>
        ${!ctr.generic && html`<div>
          <div className="section-label">深度清单</div>
          <div className="plan-list">
            ${DEPTH_CHECKS.map((d) => html`<div key=${d.key} className="plan-item">
              <${Icon} name=${ctr.checks[d.key] ? 'CircleCheck' : 'CircleDashed'} size=${16} className=${ctr.checks[d.key] ? 'tone-success-text' : 'muted'} />
              <div className="grow">
                <div><b>${d.label}</b></div>
                <div className="muted text-xs">${(ctr.gaps && ctr.gaps[d.key]) || d.desc}</div>
              </div>
            </div>`)}
          </div>
        </div>`}
        ${ctr.actions.length > 0 && html`<div>
          <div className="section-label">操作与触发器</div>
          <div className="plan-list">
            ${ctr.actions.map((a) => html`<div key=${a.name} className="plan-item">
              <${Icon} name=${a.kind === 'trigger' ? 'Zap' : 'SquareFunction'} size=${15} className="muted" />
              <div className="grow">
                <div className="row"><b>${a.name}</b>${a.recon && html`<${Tag} size="sm" tone="primary">对账用<//>`}${a.idemKey && html`<span className="muted text-xs">按${a.idemKey}幂等</span>`}</div>
                <div className="muted text-xs">${a.desc}${a.perms ? ` 需要权限：${a.perms.join('、')}` : ''}</div>
              </div>
              <${EffectTag} effect=${a.effect} />
            </div>`)}
          </div>
        </div>`}
        ${ctr.generic && html`<${Alert} tone="primary" icon="Sparkles" title="长尾系统怎么接">
          有 OpenAPI 文档的，直接导入成连接器草稿；只有接口文档的，可以让 AI 按文档生成草稿。草稿要补齐深度清单里的各项，特别是写操作的幂等声明，才能发布。
        <//>`}
      </div>`}
    <//>
  </div>`;
}
