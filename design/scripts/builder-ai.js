const COPILOT_SESSIONS = new Map();

const ID_FIELD_RE = /(^id$|_id$|userid$|_code$|_no$|number$)/i;

function recordAiUsage({ source, model, input, output, projectId, workflowId }) {
  Store.set((s) => ({ ...s, aiUsage: [{ id: uid('au'), at: Date.now(), source, model, input, output, projectId, workflowId, by: s.me }, ...(s.aiUsage || [])].slice(0, 500) }));
}

function isWriteOp(op) {
  return /^(create|update|delete|remove|send|submit|save|put|insert|execute|call|approve|reply|post|add|set|robot|freeze|disable|bitable_(create|update|delete))/i.test(String(op || ''));
}

function modelLabel(value) {
  const m = Object.values(MODEL_OPTIONS).flat().find((x) => x.value === value);
  return m ? m.label : value || '未选择模型';
}

function ModelFields({ cfg, onConfig, ctx, state, readOnly }) {
  const conns = usableConnections(state, { connectors: AI_CONNECTORS, projectId: ctx.wf.projectId });
  const current = cfg.connectionId ? state.connections.find((c) => c.id === cfg.connectionId) : null;
  const problem = cfg.connectionId ? connectionIssue(state, cfg.connectionId, ctx.wf.projectId) : null;
  const models = MODEL_OPTIONS[current ? current.connector : 'claude'] || [];
  const pickConn = (id) => {
    const c = state.connections.find((x) => x.id === id);
    const list = MODEL_OPTIONS[c.connector] || [];
    onConfig({ connectionId: id, modelName: list.some((m) => m.value === cfg.modelName) ? cfg.modelName : (list[0] || {}).value });
  };
  const connError = readOnly ? null : !cfg.connectionId ? '请选择模型连接' : problem && problem.level === 'error' ? problem.text : null;
  return html`<div className="form-grid">
    <${Field} label="模型连接" required error=${connError}>
      <${Select} disabled=${readOnly} value=${cfg.connectionId} onChange=${pickConn} placeholder=${conns.length ? '选择模型连接' : '暂无可用的模型连接'} invalid=${Boolean(connError)} options=${[
        ...conns.map((c) => ({ value: c.id, label: c.name, iconNode: html`<${ConnectorIcon} id=${c.connector} size=${18} />` })),
        ...(current && !conns.includes(current) ? [{ value: current.id, label: current.name, desc: '当前不可用', disabled: true }] : []),
      ]} />
    <//>
    <${Field} label="模型"><${Select} disabled=${readOnly || !current} value=${cfg.modelName} onChange=${(v) => onConfig({ modelName: v })} options=${models} placeholder="先选择模型连接" /><//>
  </div>`;
}

function OutputFieldsEditor({ fields, onChange, readOnly }) {
  const setField = (i, p) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return html`<div className="col" style=${{ gap: 6 }}>
    ${fields.map((f, i) => html`<div key=${i} className="form-field-row">
      <${Input} size="sm" mono readOnly=${readOnly} value=${f.k} onChange=${(v) => setField(i, { k: v.replace(/\s/g, '') })} placeholder="字段名" style=${{ width: 120 }} invalid=${!readOnly && !f.k} />
      <${Select} size="sm" width=${84} disabled=${readOnly} value=${f.t} onChange=${(v) => setField(i, { t: v })} options=${['字符串', '数值', '布尔', '数组', '对象'].map((x) => ({ value: x, label: x }))} />
      <${Input} size="sm" readOnly=${readOnly} value=${f.d} onChange=${(v) => setField(i, { d: v })} placeholder="说明" style=${{ flex: 1 }} />
      ${!readOnly && html`<${IconButton} icon="Trash2" size="xs" title="删除字段" onClick=${() => onChange(fields.filter((_, j) => j !== i))} />`}
    </div>`)}
    ${!fields.length && html`<div className="text-xs muted">还没有输出字段</div>`}
    ${!readOnly && html`<${Button} size="sm" variant="dashed" icon="Plus" onClick=${() => onChange([...fields, { k: `field${fields.length + 1}`, t: '字符串', d: '' }])}>添加字段<//>`}
  </div>`;
}

function AgentConfig({ node, onConfig, ctx, state, readOnly }) {
  const cfg = node.config;
  return html`<${Fragment}>
    <div className="agent-intro"><${Icon} name="Bot" size=${16} /><span>智能体按指令自己决定调用哪些工具、调用几次，直到完成任务或碰到护栏。每一步调用都会记在运行日志里。</span></div>
    <${ModelFields} cfg=${cfg} onConfig=${onConfig} ctx=${ctx} state=${state} readOnly=${readOnly} />
    <${Param} name="智能体指令" required help="说明角色、目标、可以做和不可以做的事，越具体越可控" error=${!readOnly && isBlank(cfg.instructions) ? '智能体指令是必填项' : null}>
      <${VarInput} readOnly=${readOnly} value=${cfg.instructions} onChange=${(v) => onConfig({ instructions: v })} multiline ctx=${ctx} placeholder="例如：你是 IT 服务台助手。先查知识库；需要人工处理时在 Jira 建工单，并把工单号告诉提问人。" invalid=${!readOnly && isBlank(cfg.instructions)} />
    <//>
    <${Param} name="任务输入" linkable linked=${(cfg.input || '').includes('{{')} readOnly=${readOnly} onLink=${(e) => ctx.startLink(e, (p) => onConfig({ input: `{{${p}}}` }))} help="每次运行交给智能体处理的内容，通常引用触发器里的提问或表单">
      <${VarInput} readOnly=${readOnly} value=${cfg.input} onChange=${(v) => onConfig({ input: v })} ctx=${ctx} placeholder="插入变量，例如员工的提问" />
    <//>
    <${Field} label="输出字段" hint="智能体按这些字段返回结果，下游节点可以直接引用。调用步骤和 Token 用量会自动附在出参里">
      <${OutputFieldsEditor} fields=${cfg.outputFields || []} onChange=${(v) => onConfig({ outputFields: v })} readOnly=${readOnly} />
    <//>
  <//>`;
}

function AgentTools({ node, onConfig, ctx, state, readOnly }) {
  const tools = node.config.tools || [];
  const [picking, setPicking] = useState(false);
  const anchor = useRef(null);
  const setTool = (id, patch) => onConfig({ tools: tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const addTool = (tool) => {
    const c = resolveConnector(tool.connector);
    const conns = tool.type !== 'workflow' && c && c.auth !== 'none' ? usableConnections(state, { connector: c.id, projectId: ctx.wf.projectId }) : [];
    onConfig({ tools: [...tools, { id: uid('t'), ...tool, ...(conns.length === 1 ? { connectionId: conns[0].id } : {}), approval: tool.type === 'workflow' || isWriteOp(tool.op) }] });
    setPicking(false);
  };
  const approvals = tools.filter((t) => t.approval).length;
  return html`<${Fragment}>
    <div className="text-xs muted" style=${{ marginBottom: 10 }}>
      智能体只能调用这里列出的工具。写入类工具添加时默认需要人工确认${tools.length ? `，当前 ${tools.length} 个工具中 ${approvals} 个需要确认` : ''}。
    </div>
    <div className="col" style=${{ gap: 8 }}>
      ${tools.map((t) => html`<${AgentToolRow} key=${t.id} tool=${t} state=${state} ctx=${ctx} readOnly=${readOnly} onChange=${(p) => setTool(t.id, p)} onRemove=${() => onConfig({ tools: tools.filter((x) => x.id !== t.id) })} />`)}
    </div>
    ${!tools.length && html`<${Empty} size="sm" icon="Wrench" title="还没有工具" description="添加连接器操作、MCP 工具或子流程，智能体才能做事。" />`}
    ${!readOnly && html`<div ref=${anchor} style=${{ marginTop: 10 }}><${Button} variant="dashed" block icon="Plus" onClick=${() => setPicking(!picking)}>添加工具<//></div>`}
    <${Floating} anchorRef=${anchor} open=${picking} onClose=${() => setPicking(false)} placement="bottom-start" className="popover">
      <${AgentToolPicker} state=${state} pid=${ctx.wf.projectId} existing=${tools} onPick=${addTool} />
    <//>
  <//>`;
}

function AgentToolRow({ tool, state, ctx, readOnly, onChange, onRemove }) {
  const isWf = tool.type === 'workflow';
  const c = resolveConnector(tool.connector);
  const op = c && c.actions.find((a) => a.key === tool.op);
  const sub = isWf ? state.workflows.find((w) => w.id === tool.workflowId) : null;
  const mc = c && c.mcp ? (state.mcpClients || []).find((x) => x.id === c.id) : null;
  const name = isWf ? (sub ? sub.name : '已删除的子流程') : op ? op.name : tool.op;
  const owner = isWf ? '子流程' : c ? `${c.name} · ${c.mcp ? 'MCP 工具' : '连接器操作'}` : '连接器不存在';
  const needsConn = !isWf && c && c.auth !== 'none';
  const conns = needsConn ? usableConnections(state, { connector: c.id, projectId: ctx.wf.projectId }) : [];
  const current = tool.connectionId ? state.connections.find((x) => x.id === tool.connectionId) : null;
  const connProblem = tool.connectionId ? connectionIssue(state, tool.connectionId, ctx.wf.projectId) : null;
  const problem = !c || (!isWf && !op) ? '工具不存在或已下架'
    : isWf && !(sub && sub.published) ? '子流程不存在或尚未发布'
      : mc && mc.status !== 'connected' ? `MCP 服务器连接异常：${mc.error || '无法连接'}`
        : needsConn && !tool.connectionId && !readOnly ? '请选择这个工具使用的连接'
          : connProblem ? connProblem.text : null;
  const write = isWf || isWriteOp(tool.op);
  return html`<div className=${cx('agent-tool', problem && 'has-error')}>
    <div className="agent-tool-head">
      ${isWf ? html`<${KindTile} icon="Workflow" size=${28} />` : html`<${NodeIcon} node=${{ kind: 'action', connector: tool.connector, op: tool.op }} size=${28} />`}
      <div className="grow" style=${{ minWidth: 0 }}>
        <div className="agent-tool-name ellipsis" title=${name}>${name}</div>
        <div className="text-xs muted ellipsis">${owner}</div>
      </div>
      ${mc && html`<${Link} to=${`/connectors/${mc.id}`} className="link text-xs">服务器详情<//>`}
      ${!readOnly && html`<${IconButton} icon="Trash2" size="xs" title="移除工具" onClick=${onRemove} />`}
    </div>
    ${(isWf ? sub && sub.description : op && op.desc) && html`<div className="text-xs muted">${isWf ? sub.description : op.desc}</div>`}
    ${needsConn && html`<${Select}
      size="sm"
      disabled=${readOnly}
      value=${tool.connectionId}
      onChange=${(v) => onChange({ connectionId: v })}
      placeholder=${conns.length ? '选择连接' : '暂无可用连接'}
      invalid=${!readOnly && !tool.connectionId}
      options=${[
        ...conns.map((x) => ({ value: x.id, label: x.name, desc: `${x.account} · ${CONN_STATUS[x.status].label}`, iconNode: html`<${ConnectorIcon} id=${x.connector} size=${18} />` })),
        ...(current && !conns.includes(current) ? [{ value: current.id, label: current.name, desc: '当前不可用', disabled: true }] : []),
      ]}
    />`}
    ${problem && html`<div className="param-error">${problem}</div>`}
    <div className="agent-tool-approval">
      <${Switch} size="sm" checked=${Boolean(tool.approval)} disabled=${readOnly} onChange=${(v) => onChange({ approval: v })} />
      <span>调用前需要人工确认</span>
      ${write && !tool.approval && html`<${Tooltip} content="这个工具会写入或改变数据，建议开启人工确认"><${Icon} name="TriangleAlert" size=${13} className="agent-tool-warn" /><//>`}
    </div>
  </div>`;
}

function AgentToolPicker({ state, pid, existing, onPick }) {
  const [tab, setTab] = useState('app');
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const has = (t) => existing.some((x) => x.connector === t.connector && x.op === t.op && (x.workflowId || null) === (t.workflowId || null));
  const matches = (x) => !ql || `${x.name}${x.owner}${x.desc || ''}`.toLowerCase().includes(ql);
  const used = [...new Set(state.workflows.filter((w) => w.projectId === pid).flatMap((w) => allNodes(w).filter((n) => n.kind === 'action').map((n) => n.connector)))];
  const apps = [...CONNECTORS.filter((c) => !c.builtin && !AI_CONNECTORS.includes(c.id) && c.actions.length), ...publishedCustomConnectors(state).filter((c) => c.actions.length)];
  const appOps = apps.flatMap((c) => c.actions.map((o) => ({ type: 'op', connector: c.id, op: o.key, name: o.name, desc: o.desc, owner: c.name, rank: used.indexOf(c.id) })));
  const appList = ql ? appOps.filter(matches).slice(0, 40) : appOps.filter((x) => x.rank >= 0).sort((a, b) => a.rank - b.rank).slice(0, 24);
  const servers = (state.mcpClients || []).filter((mc) => mc.scope === 'tenant' || (mc.projectIds || []).includes(pid));
  const mcpList = servers.flatMap((mc) => (mc.tools || []).map((t) => ({ type: 'mcp', connector: mc.id, op: t.name, name: t.title || t.name, desc: t.description, owner: mc.name, disabled: mc.status !== 'connected', reason: mc.error }))).filter(matches);
  const subList = state.workflows.filter((w) => w.projectId === pid && w.trigger.connector === 'subflows').map((w) => ({ type: 'workflow', connector: 'subflows', op: 'call', workflowId: w.id, name: w.name, desc: w.description, owner: '子流程', disabled: !w.published, reason: '尚未发布' })).filter(matches);
  const list = tab === 'app' ? appList : tab === 'mcp' ? mcpList : subList;
  return html`<div className="agent-picker">
    <div className="agent-picker-head">
      <${Input} icon="Search" size="sm" placeholder="搜索工具" value=${q} onChange=${setQ} autoFocus allowClear />
      <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'app', label: '应用操作' }, { value: 'mcp', label: 'MCP 工具', count: mcpList.length }, { value: 'workflow', label: '子流程', count: subList.length }]} />
    </div>
    <div className="agent-picker-body">
      ${tab === 'app' && !ql && html`<div className="menu-group">本项目常用</div>`}
      ${list.map((x) => {
        const added = has(x);
        return html`<button key=${`${x.connector}.${x.op}.${x.workflowId || ''}`} type="button" className="op-hit" disabled=${x.disabled || added} onClick=${() => onPick({ type: x.type, connector: x.connector, op: x.op, ...(x.workflowId ? { workflowId: x.workflowId } : {}) })}>
          ${x.type === 'workflow' ? html`<${KindTile} icon="Workflow" size=${26} />` : html`<${NodeIcon} node=${{ kind: 'action', connector: x.connector, op: x.op }} size=${26} />`}
          <span className="op-hit-body">
            <span className="op-hit-name">${x.name}${added ? '（已添加）' : ''}</span>
            <span className="op-hit-desc">${x.disabled ? `${x.owner} · ${x.reason || '不可用'}` : `${x.owner}${x.desc ? ` · ${x.desc}` : ''}`}</span>
          </span>
        </button>`;
      })}
      ${!list.length && tab === 'mcp' && !ql && html`<${Empty} size="sm" icon="Server" title="还没有接入 MCP 服务器" description="企业内部已有的 MCP 服务，可以在连接器市场接入后给智能体使用。" action=${html`<${Button} size="sm" onClick=${() => navigate('/connectors')}>去连接器市场<//>`} />`}
      ${!list.length && tab === 'workflow' && !ql && html`<${Empty} size="sm" icon="Workflow" title="项目里没有子流程" description="用「子流程触发器」创建的工作流可以作为智能体的工具。" />`}
      ${!list.length && (ql || tab === 'app') && html`<${Empty} size="sm" icon="SearchX" title=${ql ? '没有找到相关工具' : '输入关键词搜索全部连接器的操作'} />`}
    </div>
  </div>`;
}

function AgentGuard({ node, onConfig, state, readOnly, wf }) {
  const cfg = node.config;
  const editors = state.members.filter((m) => m.projectId === wf.projectId && ['owner', 'editor'].includes(m.role));
  const defaults = [...new Set([wf.owner, ...state.members.filter((m) => m.projectId === wf.projectId && m.role === 'owner').map((m) => m.userId)])];
  const approvalTools = (cfg.tools || []).filter((t) => t.approval);
  const toolName = (t) => {
    if (t.type === 'workflow') return agentToolWorkflowName(state, t);
    const c = resolveConnector(t.connector);
    const op = c && c.actions.find((a) => a.key === t.op);
    return op ? op.name : t.op;
  };
  const runs = state.runs.filter((r) => r.workflowId === wf.id && r.kind === 'run' && r.ai);
  const avg = runs.length ? Math.round(runs.reduce((a, r) => a + r.ai.input + r.ai.output, 0) / runs.length) : 0;
  const waiting = state.runs.filter((r) => r.workflowId === wf.id && r.status === 'waiting' && r.pendingApproval);
  const stepsError = !readOnly && !(Number(cfg.maxSteps) > 0 && Number(cfg.maxSteps) <= 20) ? '需在 1 ~ 20 之间' : null;
  const budgetError = !readOnly && !(Number(cfg.tokenBudget) > 0) ? '需大于 0' : null;
  return html`<${Fragment}>
    <div className="panel-section run-set">
      <div className="run-set-head"><${Icon} name="Gauge" size=${16} className="muted" /><b className="grow">执行限制</b></div>
      <div className="run-set-desc">限制智能体单次运行最多做多少步、花多少 Token，防止陷入循环或成本失控。</div>
      <div className="form-grid">
        <${Field} label="最大步数" required error=${stepsError} hint="每调用一次工具算一步">
          <${Input} type="number" readOnly=${readOnly} value=${cfg.maxSteps ?? 6} onChange=${(v) => onConfig({ maxSteps: v })} invalid=${Boolean(stepsError)} />
        <//>
        <${Field} label="Token 预算" required error=${budgetError} hint="单次运行输入加输出的上限">
          <${Input} type="number" readOnly=${readOnly} value=${cfg.tokenBudget ?? 20000} onChange=${(v) => onConfig({ tokenBudget: v })} invalid=${Boolean(budgetError)} />
        <//>
      </div>
      <${Field} label="超出限制时">
        <${RadioCards} columns=${2} disabled=${readOnly} value=${cfg.onLimit || 'fail'} onChange=${(v) => onConfig({ onLimit: v })} options=${[
          { value: 'fail', label: '终止并标记失败', desc: '会进入问题中心，适合关键流程' },
          { value: 'partial', label: '返回已有结果', desc: '下游节点照常运行' },
        ]} />
      <//>
      ${runs.length > 0 && html`<div className="run-set-stat">
        <${Icon} name="Coins" size=${14} className="muted" />
        <span className="grow">最近 ${runs.length} 次运行平均消耗 ${fmt.number(avg)} Token，约为预算的 ${Math.round((avg / (Number(cfg.tokenBudget) || 1)) * 100)}%</span>
      </div>`}
    </div>
    <div className="panel-section run-set">
      <div className="run-set-head"><${Icon} name="UserCheck" size=${16} className="muted" /><b className="grow">人工确认</b></div>
      <div className="run-set-desc">
        ${approvalTools.length ? `${approvalTools.map(toolName).join('、')} 调用前需要人工确认。` : '当前没有需要人工确认的工具，可以在「工具」里为写入类工具开启。'}
        需要确认时运行进入「等待中」，审批人在通知或运行日志里批准后继续；拒绝时这一步不执行，智能体会收到拒绝原因。
      </div>
      <${Field} label="审批人" hint=${`不设置时由工作流所有者和项目所有者审批：${defaults.map((u) => personName(u)).join('、')}`}>
        <${Select} multiple disabled=${readOnly} value=${cfg.approvers || []} onChange=${(v) => onConfig({ approvers: v })} placeholder="使用默认审批人" options=${editors.map((m) => ({ value: m.userId, label: personName(m.userId), iconNode: html`<${Avatar} name=${personName(m.userId)} size=${18} />` }))} />
      <//>
      <${Field} label="等待超时" hint="超时没人处理时自动拒绝，运行按拒绝继续">
        <${Segmented} size="sm" disabled=${readOnly} value=${cfg.approvalTimeout || '4h'} onChange=${(v) => onConfig({ approvalTimeout: v })} options=${[{ value: '1h', label: '1 小时' }, { value: '4h', label: '4 小时' }, { value: '24h', label: '24 小时' }]} />
      <//>
      ${waiting.length > 0 && html`<div className="run-set-stat">
        <${Icon} name="Hourglass" size=${14} className="muted" />
        <span className="grow">${waiting.length} 次运行正在等待确认</span>
        <${Link} to=${waiting.length === 1 ? `/logs?run=${waiting[0].id}` : `/logs?workflow=${wf.id}&status=waiting`} className="link text-xs">去处理<//>
      </div>`}
    </div>
  <//>`;
}

function describeTrigger(t) {
  if (!t.connector) return '还没有选择触发器';
  const cfg = t.config || {};
  if (t.connector === 'schedule') {
    if (t.op === 'cron') return `按 Cron 表达式 ${cfg.cron} 定时运行`;
    const mode = cfg.mode || '每天触发';
    if (mode === '按周触发') return `每${(cfg.weekdays || []).join('、')} ${cfg.at || ''} 定时运行`;
    if (mode === '间隔触发') return `每 ${cfg.interval} ${cfg.intervalUnit || '分钟'}运行一次`;
    if (mode === '仅触发一次') return `在 ${cfg.once || '指定时间'} 运行一次`;
    if (mode === '按月触发') return `${cfg.monthDay || '每月第一天'} ${cfg.at || ''} 定时运行`;
    return `每天 ${cfg.at || ''} 定时运行`;
  }
  if (t.connector === 'webhook') return '收到 Webhook 请求时运行';
  if (t.connector === 'forms') return '有人提交表单时运行';
  if (t.connector === 'subflows') return '被其他工作流调用时运行';
  if (t.connector === 'alert') return '平台告警事件发生时运行';
  if (t.connector === 'manual-trigger') return '手动触发时运行';
  const c = resolveConnector(t.connector);
  const o = c && c.triggers.find((x) => x.key === t.op);
  return `${c ? c.name : '应用'}「${o ? o.name : t.op}」时运行`;
}

function describeNode(n, state) {
  const c = n.connector && resolveConnector(n.connector);
  if (n.kind === 'action') {
    const o = c && c.actions.find((x) => x.key === n.op);
    const conn = n.connectionId && state.connections.find((x) => x.id === n.connectionId);
    const maps = Object.values(n.config || {}).filter(isMapping).reduce((a, v) => a + (v.$map.fields || []).length, 0);
    const s = n.settings || {};
    return [
      `${c ? c.name : '应用'} · ${o ? o.name : n.op}`,
      conn ? `使用连接「${conn.name}」` : c && c.auth !== 'none' ? '还没有选择连接' : '',
      maps ? `映射 ${maps} 个字段` : '',
      String(s.strategy || '').startsWith('retry') ? `失败时重试 ${s.times || 3} 次` : '',
    ].filter(Boolean).join('，');
  }
  if (n.kind === 'branch') return `按条件分成 ${n.branches.length} 个分支（${n.branches.map((b) => b.name).join('、')}），只走第一个满足条件的分支`;
  if (n.kind === 'parallel') return `同时运行 ${n.branches.length} 个分支（${n.branches.map((b) => b.name).join('、')}）`;
  if (n.kind === 'loop') return n.variant === 'while' ? `条件满足时重复运行，最多 ${n.config.max} 次` : `对列表里的每一项运行一次循环体（${n.config.mode || '串行'}，最多 ${n.config.max} 次）`;
  if (n.kind === 'ai') return `用 ${modelLabel(n.config.modelName)} 处理文本${n.config.format === 'JSON' ? `，按 ${(n.config.outputFields || []).length} 个字段输出` : ''}`;
  if (n.kind === 'agent') {
    const tools = n.config.tools || [];
    return `AI 智能体可以调用 ${tools.length} 个工具，其中 ${tools.filter((t) => t.approval).length} 个调用前需要人工确认，最多 ${n.config.maxSteps} 步`;
  }
  if (n.kind === 'code') return `运行一段 ${n.config.language === 'python' ? 'Python' : 'JavaScript'} 脚本整理数据`;
  if (n.kind === 'delay') return n.config.mode === '至指定时间' ? '等到指定时间后继续' : `等待 ${n.config.value} ${n.config.unit || '分钟'}`;
  if (n.kind === 'end') return `结束本次运行，标记为${n.config.status || '成功'}`;
  if (n.kind === 'variable') return `设置 ${(n.config.vars || []).length} 个变量`;
  if (n.kind === 'json') return n.config.mode === '序列化' ? '把对象转成 JSON 字符串' : '把 JSON 字符串解析成对象';
  return kindMeta(n).name;
}

function copilotExplain(wf, state) {
  const steps = [];
  walkNodes(wf.steps, (n, depth) => steps.push({ id: n.id, name: n.name, depth, text: describeNode(n, state) }));
  const rs = wf.trigger.runSettings || {};
  const issues = workflowIssues(wf, state);
  const errors = issues.filter((i) => i.level === 'error').length;
  const connWarn = issues.filter((i) => i.tab === 'conn' && i.level === 'warning').length;
  const sensitive = allNodes(wf).filter((n) => n.sensitive).map((n) => `「${n.name}」`);
  const notes = [
    rs.dedupe && rs.dedupe.enabled && `触发器开启了去重：同一个 ${String(rs.dedupe.key).replace(/\{\{\s*trigger\.|\s*\}\}/g, '')} 在 ${(DEDUPE_WINDOWS.find((x) => x.value === rs.dedupe.window) || { label: rs.dedupe.window }).label}内只处理一次。`,
    rs.concurrency && Number(rs.concurrency.max) > 0 && `最多同时运行 ${rs.concurrency.max} 个${rs.concurrency.orderKey ? '，相同保序键的事件按顺序处理' : ''}。`,
    sensitive.length > 0 && `${sensitive.join('、')}的出参标记为敏感，运行日志里会脱敏显示。`,
    connWarn > 0 && `有 ${connWarn} 个节点的连接需要处理，运行到这些节点会失败。`,
    errors > 0 && `还有 ${errors} 个校验错误，修复后才能调试和发布。`,
  ].filter(Boolean);
  return { kind: 'explain', summary: `「${wf.name}」${describeTrigger(wf.trigger)}，一共 ${steps.length} 个步骤：`, steps, notes };
}

function copilotDiagnose(wf, state) {
  const failed = state.runs.filter((r) => r.workflowId === wf.id && r.kind === 'run' && ['failed', 'timeout'].includes(r.status)).sort((a, b) => b.startedAt - a.startedAt);
  if (!failed.length) return { kind: 'text', text: '最近没有失败的运行。', links: [{ label: '查看运行日志', to: `/logs?workflow=${wf.id}` }] };
  const run = failed[0];
  const recent = failed.filter((r) => r.startedAt >= Date.now() - 7 * DAY).length;
  const issue = collectIssues(state).find((i) => i.runIds.includes(run.id));
  const node = run.failedNodeId ? findInWorkflow(wf, run.failedNodeId) : null;
  return {
    kind: 'diagnose', runId: run.id, at: run.startedAt, total: recent,
    node: node ? { id: node.id, name: node.name } : null, message: run.failure ? run.failure.message : '运行失败',
    issue: issue ? { sig: issue.sig, count: issue.count } : null, insight: issue ? issueInsight(issue, state) : null,
  };
}

function proposeRetry(wf) {
  const targets = allNodes(wf).filter((n) => n.kind === 'action' && isWriteOp(n.op) && !String((n.settings || {}).strategy || 'stop').startsWith('retry'));
  if (!targets.length) return { kind: 'text', text: '写入数据的节点都已经配置了失败重试，不需要修改。' };
  const next = (s) => ({ ignore: 'retry-ignore', branch: 'retry-branch' }[s] || 'retry-stop');
  const label = (s) => (STRATEGIES.find((x) => x.value === (s || 'stop')) || STRATEGIES[0]).label;
  return {
    kind: 'proposal',
    intro: `找到 ${targets.length} 个写入数据、但失败时不重试的节点。下游系统偶发超时或限流时，重试能避免整次运行失败。`,
    changes: targets.map((n) => ({ nodeId: n.id, name: n.name, text: `出错时「${label((n.settings || {}).strategy)}」改为重试 3 次、间隔 30 秒后「${label(next((n.settings || {}).strategy)).replace('重试后', '')}」` })),
    patch: (w) => ({ steps: targets.reduce((steps, n) => updateInSteps(steps, n.id, (x) => ({ settings: { rules: [], ...(x.settings || {}), strategy: next((x.settings || {}).strategy), times: 3, interval: 30 } })), w.steps) }),
  };
}

function proposeDedupe(wf) {
  const t = wf.trigger;
  if (!t.connector || ['schedule', 'subflows', 'manual-trigger', 'alert'].includes(t.connector)) return { kind: 'text', text: '当前触发器不会收到重复事件，不需要去重。' };
  const d = (t.runSettings || {}).dedupe;
  if (d && d.enabled) return { kind: 'text', text: `触发器已经开启了去重，去重键是 ${d.key}。`, action: { label: '查看运行设置', nodeId: t.id, tab: 'run' } };
  const hint = mapCandidates(nodeOutput(t), t.id, t.name).find((c) => ID_FIELD_RE.test(c.key) && ['string', 'number'].includes(typeof c.sample));
  if (!hint) return { kind: 'text', text: '触发器的出参里没有找到能唯一标识事件的字段。可以打开触发器的「运行设置」手动选择去重键。', action: { label: '打开运行设置', nodeId: t.id, tab: 'run' } };
  return {
    kind: 'proposal',
    intro: '上游重复推送同一个事件时（网络重试、轮询窗口重叠），去重能保证只处理一次，避免重复建单、重复通知。',
    changes: [{ nodeId: t.id, name: t.name, text: `开启去重：去重键 ${hint.path.split('.').slice(1).join('.')}，时间窗口 7 天` }],
    patch: (w) => ({ trigger: { ...w.trigger, runSettings: { ...(w.trigger.runSettings || {}), dedupe: { enabled: true, key: `{{${hint.path}}}`, window: '7d' } } } }),
    focus: { id: t.id, tab: 'run' },
  };
}

function proposeNotify(wf, state, text) {
  const im = /企业微信|企微/.test(text) ? { connector: 'wecom', op: 'robot_message', label: '企业微信群机器人' }
    : /钉钉/.test(text) ? { connector: 'dingtalk', op: 'robot_message', label: '钉钉群机器人' }
      : /slack/i.test(text) ? { connector: 'slack', op: 'send_message', label: 'Slack' }
        : { connector: 'feishu', op: 'send_message', label: '飞书' };
  const conns = usableConnections(state, { connector: im.connector, projectId: wf.projectId });
  const title = mapCandidates(nodeOutput(wf.trigger), wf.trigger.id, '').find((c) => /(name|title|summary|subject)$/i.test(c.key) && typeof c.sample === 'string');
  const content = `「${wf.name}」运行完成${title ? `：{{${title.path}}}` : ''}`;
  const base = actionFromPick(im.connector, im.op);
  const node = {
    ...base,
    name: '发送运行结果通知',
    connectionId: conns.length === 1 ? conns[0].id : null,
    aiDraft: true,
    config: im.connector === 'feishu' ? { receiveType: '群聊', receiver: '', content } : im.connector === 'slack' ? { receiver: '', content } : { content },
  };
  return {
    kind: 'proposal',
    intro: `在工作流末尾加一个${im.label}通知节点，把运行结果发到群里。新节点标记为「待确认」，接收的群需要你补充。`,
    changes: [{ nodeId: null, name: node.name, text: `新增节点：${im.label}发送消息，${conns.length === 1 ? `使用连接「${conns[0].name}」` : conns.length ? '需要选择连接' : '项目里还没有可用的连接，需要先新建'}` }],
    patch: (w) => ({ steps: [...w.steps, node] }),
    focus: { id: node.id },
  };
}

function copilotReply(text, wf, state) {
  if (/重试/.test(text)) return proposeRetry(wf);
  if (/去重|幂等|重复/.test(text)) return proposeDedupe(wf);
  if (/通知|提醒|告知|推送|发到.*群/.test(text)) return proposeNotify(wf, state, text);
  if (/诊断|失败|报错|出错|排查|为什么/.test(text)) return copilotDiagnose(wf, state);
  if (/解释|说明|讲讲|介绍|做什么|干什么|是什么|怎么运行|流程/.test(text)) return copilotExplain(wf, state);
  return { kind: 'fallback', text: '这个修改我还不能直接完成。目前我能：解释工作流、诊断最近一次失败、给写入数据的节点加失败重试、开启触发器去重、在末尾加一条群通知。更复杂的修改请直接在画布上编辑。' };
}

function copilotSuggestions(wf, state) {
  const failed = state.runs.some((r) => r.workflowId === wf.id && r.kind === 'run' && ['failed', 'timeout'].includes(r.status));
  const retryTargets = allNodes(wf).some((n) => n.kind === 'action' && isWriteOp(n.op) && !String((n.settings || {}).strategy || 'stop').startsWith('retry'));
  const t = wf.trigger;
  const dedupe = t.connector && !['schedule', 'subflows', 'manual-trigger', 'alert'].includes(t.connector) && !((t.runSettings || {}).dedupe || {}).enabled;
  return ['解释这个工作流', failed && '诊断最近一次失败', retryTargets && '给写入数据的节点加失败重试', dedupe && '开启触发器去重', '在末尾加一条群通知'].filter(Boolean).slice(0, 4);
}

function CopilotPanel({ wf, state, editing, flush, onClose, onLocate, onApply, onPreview, onEnterEdit }) {
  const aiConns = usableConnections(state, { connectors: AI_CONNECTORS, projectId: wf.projectId });
  const conn = aiConns.find((c) => c.connector === 'claude') || aiConns[0];
  const [messages, setMessages] = useState(() => COPILOT_SESSIONS.get(wf.id) || []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => { COPILOT_SESSIONS.set(wf.id, messages); }, [messages]);
  useEffect(() => { setMessages(COPILOT_SESSIONS.get(wf.id) || []); }, [wf.id]);
  useEffect(() => () => { clearTimeout(timer.current); onPreview(null); }, []);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages.length, busy]);
  const setMsg = (id, patch) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const send = (q) => {
    const content = String(q ?? text).trim();
    if (!content || busy || !conn) return;
    setText('');
    onPreview(null);
    setMessages((list) => [...list, { id: uid('cm'), role: 'user', text: content }]);
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const latest = Store.get();
      const current = latest.workflows.find((x) => x.id === wf.id) || wf;
      const reply = copilotReply(content, current, latest);
      const input = 420 + content.length * 10 + allNodes(current).length * 80;
      const output = 100 + content.length * 4 + allNodes(current).length * 16;
      recordAiUsage({ source: 'copilot', model: (MODEL_OPTIONS[conn.connector] || [{}])[0].value, input, output, projectId: current.projectId, workflowId: current.id });
      setMessages((list) => [...list, { id: uid('cm'), role: 'assistant', tokens: input + output, status: 'open', ...reply }]);
      setBusy(false);
    }, 800);
  };
  const apply = (m) => {
    onApply(m.patch, m.focus);
    setMsg(m.id, { status: 'applied' });
    onPreview(null);
  };
  const suggestions = copilotSuggestions(wf, state);
  const chip = (id, label) => html`<button type="button" className="var-chip is-clickable cp-node" onClick=${() => onLocate(id)}><${Icon} name="LocateFixed" size=${12} />${label}</button>`;
  const renderReply = (m) => {
    if (m.kind === 'explain') {
      return html`<${Fragment}>
        <p>${m.summary}</p>
        <ol className="cp-steps">${m.steps.map((s) => html`<li key=${s.id} style=${{ marginLeft: s.depth * 14 }}>${chip(s.id, s.name)}<span>${s.text}</span></li>`)}</ol>
        ${m.notes.length > 0 && html`<ul className="cp-notes">${m.notes.map((n, i) => html`<li key=${i}>${n}</li>`)}</ul>`}
      <//>`;
    }
    if (m.kind === 'diagnose') {
      const fixAction = (f) => {
        if (f.kind === 'reauth') return () => navigate(`/connections?id=${f.target}`);
        if (f.kind === 'openNode') return () => (f.target.workflowId === wf.id ? onLocate(f.target.nodeId, f.target.tab) : navigate(`/integration/${wf.projectId}/wf/${f.target.workflowId}?mode=edit&node=${f.target.nodeId}&tab=${f.target.tab}`));
        return () => navigate(`/issues/${encodeURIComponent(m.issue.sig)}`);
      };
      return html`<${Fragment}>
        <p>最近一次失败在 ${fmt.relative(m.at)}${m.node ? '，出错的节点是' : ''} ${m.node && chip(m.node.id, m.node.name)}${m.total > 1 ? `。最近 7 天失败 ${m.total} 次` : ''}。</p>
        <div className="cp-error mono">${m.message}</div>
        ${m.insight && html`<div className="cp-card">
          <div className="cp-card-title"><${Icon} name="Stethoscope" size=${14} />根因分析<${Tag} size="sm" tone="outline">置信度 ${Math.round(m.insight.confidence * 100)}%<//></div>
          <p>${m.insight.cause}</p>
          <p className="muted">${m.insight.impact}</p>
          <div className="cp-actions">
            ${m.insight.fixes.map((f, i) => (f.kind === 'done'
              ? html`<${Tag} key=${i} tone="success" icon="Check">${f.label}<//>`
              : f.kind === 'ignore'
                ? null
                : html`<${Button} key=${i} size="xs" variant=${i === 0 ? 'primary' : 'outline'} disabled=${f.disabled} title=${f.reason} onClick=${fixAction(f)}>${f.kind === 'replay' ? '去问题详情批量重跑' : f.label}<//>`))}
          </div>
        </div>`}
        <div className="cp-links">
          <${Link} to=${`/logs?run=${m.runId}`} className="link text-xs">查看运行日志<//>
          ${m.issue && html`<${Link} to=${`/issues/${encodeURIComponent(m.issue.sig)}`} className="link text-xs">打开问题（${m.issue.count} 次）<//>`}
        </div>
      <//>`;
    }
    if (m.kind === 'proposal') {
      return html`<${Fragment}>
        <p>${m.intro}</p>
        <div className="cp-card">
          <div className="cp-card-title"><${Icon} name="ListChecks" size=${14} />建议的修改 · ${m.changes.length} 项</div>
          <ul className="cp-changes">${m.changes.map((c, i) => html`<li key=${i}>
            <b>${c.name}</b><span>${c.text}</span>
          </li>`)}</ul>
          ${m.status === 'open' && html`<div className="cp-actions">
            ${editing
              ? html`<${Button} size="xs" variant="primary" icon="Check" onClick=${() => apply(m)}>应用修改<//>`
              : html`<${Button} size="xs" variant="primary" icon="PenLine" onClick=${onEnterEdit}>进入编辑后应用<//>`}
            ${m.changes.some((c) => c.nodeId) && html`<${Button} size="xs" icon="ScanEye" onClick=${() => onPreview(m.changes.map((c) => c.nodeId).filter(Boolean))}>在画布中标出<//>`}
            <${Button} size="xs" variant="ghost" onClick=${() => { setMsg(m.id, { status: 'discarded' }); onPreview(null); }}>不用了<//>
          </div>`}
          ${m.status === 'applied' && html`<div className="cp-state is-ok"><${Icon} name="CircleCheck" size=${14} />已应用，可以按 ${shortcutLabel('mod+z')} 撤销</div>`}
          ${m.status === 'discarded' && html`<div className="cp-state"><${Icon} name="CircleSlash" size=${14} />已放弃这组修改</div>`}
        </div>
      <//>`;
    }
    return html`<${Fragment}>
      <p>${m.text}</p>
      ${m.action && html`<div className="cp-actions"><${Button} size="xs" onClick=${() => onLocate(m.action.nodeId, m.action.tab)}>${m.action.label}<//></div>`}
      ${m.links && html`<div className="cp-links">${m.links.map((l) => html`<${Link} key=${l.to} to=${l.to} className="link text-xs">${l.label}<//>`)}</div>`}
    <//>`;
  };
  return html`<div className=${cx('side-panel', 'is-copilot', flush && 'is-flush')} onMouseDown=${(e) => e.stopPropagation()} aria-label="AI 助手">
    <div className="side-panel-head">
      <span className="side-panel-title row-4"><${Icon} name="Sparkles" size=${16} className="cp-spark" />AI 助手</span>
      ${conn && html`<${Tooltip} content=${`使用连接「${conn.name}」，调用计入 AI 用量`}><${Tag} size="sm" tone="outline">${modelLabel((MODEL_OPTIONS[conn.connector] || [])[0] && MODEL_OPTIONS[conn.connector][0].value)}<//><//>`}
      ${messages.length > 0 && html`<${IconButton} icon="Eraser" size="sm" title="清空对话" onClick=${() => { setMessages([]); onPreview(null); }} />`}
      <${IconButton} icon="X" size="sm" title="关闭" onClick=${onClose} />
    </div>
    ${!conn
      ? html`<div className="side-panel-body"><${Empty} size="sm" icon="Unplug" title="没有可用的模型连接" description="AI 助手需要一个本项目可用的 Claude、OpenAI 或 DeepSeek 连接。添加后即可使用，调用会计入 AI 用量。" action=${html`<${Button} size="sm" onClick=${() => navigate('/connections')}>去添加连接<//>`} /></div>`
      : html`<${Fragment}>
        <div className="side-panel-body cp-body" ref=${bodyRef}>
          ${messages.length === 0 && html`<div className="cp-intro">
            <p>我可以帮你解释这个工作流、诊断最近一次失败，或者按你的描述修改工作流。</p>
            <p className="muted">修改会先列成变更清单，你确认后才会应用到画布上，可以撤销。</p>
          </div>`}
          ${messages.map((m) => (m.role === 'user'
            ? html`<div key=${m.id} className="cp-msg is-user"><div className="cp-bubble">${m.text}</div></div>`
            : html`<div key=${m.id} className="cp-msg">
              <span className="cp-avatar"><${Icon} name="Sparkles" size=${13} /></span>
              <div className="cp-content">
                ${renderReply(m)}
                <div className="cp-meta">约 ${fmt.number(m.tokens)} Token</div>
              </div>
            </div>`))}
          ${busy && html`<div className="cp-msg"><span className="cp-avatar"><${Icon} name="Sparkles" size=${13} /></span><div className="cp-content cp-thinking"><${Icon} name="LoaderCircle" size=${14} className="spin" />正在分析工作流…</div></div>`}
        </div>
        <div className="cp-foot">
          <div className="cp-chips">${suggestions.map((s) => html`<button key=${s} type="button" className="cp-chip" disabled=${busy} onClick=${() => send(s)}>${s}</button>`)}</div>
          <div className="cp-input">
            <textarea
              className="textarea"
              rows=${2}
              value=${text}
              aria-label="向 AI 助手提问"
              placeholder="描述你想了解或修改的内容"
              onChange=${(e) => setText(e.target.value)}
              onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            />
            <${IconButton} icon="ArrowUp" variant="primary" title="发送" disabled=${busy || !text.trim()} onClick=${() => send()} />
          </div>
        </div>
      <//>`}
  </div>`;
}
