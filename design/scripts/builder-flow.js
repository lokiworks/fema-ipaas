const RUN_TONE = { success: 'success', failed: 'danger', timeout: 'danger', running: 'info', waiting: 'warning', stopped: 'default', skipped: 'default', pending: 'default', deduped: 'default', reused: 'default' };

const DRAG_MIME = 'application/x-fema-node';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;

const PANEL_SELECTOR = '.canvas-float, .npanel, .side-panel, .debug-panel';

function FlowNodeCard({ node, ctx }) {
  const selected = ctx.selectedId === node.id;
  const run = ctx.runState && ctx.runState[node.id];
  const issues = ctx.issuesByNode[node.id] || [];
  const hasError = ctx.editing && issues.some((i) => i.level === 'error');
  const isTrigger = node.kind === 'trigger';
  const empty = isTrigger && !node.connector;
  const linkable = ctx.linking && ctx.linking.upstreamIds.includes(node.id);
  const dimmed = ctx.linking && !linkable;
  const matched = ctx.searchIds && ctx.searchIds.includes(node.id);
  return html`<div
    className=${cx('fnode', selected && 'is-selected', hasError && 'has-error', run && `run-${run}`, ctx.highlightId === node.id && 'is-highlight', linkable && 'is-linkable', dimmed && 'is-dimmed', matched && 'is-matched', empty && 'is-empty')}
    data-node=${node.id}
    onClick=${(e) => { e.stopPropagation(); ctx.onSelect(node.id); }}
    onContextMenu=${(e) => { e.preventDefault(); e.stopPropagation(); if (ctx.editing && !empty) ctx.onContextMenu(node.id, e); }}
  >
    <div className="fnode-tile">
      ${empty ? html`<${KindTile} icon="Plus" size=${30} />` : html`<${NodeIcon} node=${node} size=${30} />`}
      ${run && html`<span className=${cx('fnode-status', `tone-${RUN_TONE[run]}`)}>
        <${Icon} name=${run === 'success' ? 'Check' : run === 'reused' ? 'History' : run === 'running' ? 'LoaderCircle' : ['failed', 'timeout'].includes(run) ? 'X' : run === 'waiting' ? 'Pause' : 'Minus'} size=${11} strokeWidth=${3} className=${run === 'running' ? 'spin' : ''} />
      </span>`}
      ${!run && hasError && html`<span className="fnode-status tone-danger"><${Icon} name="X" size=${11} strokeWidth=${3} /></span>`}
    </div>
    <div className="fnode-text">
      <div className="fnode-name">${empty ? '选择触发器' : node.name}</div>
      <div className="fnode-ref">${empty ? '点击选择工作流从哪里开始' : ctx.refs[node.id]}${node.aiDraft && html`<span className="fnode-draft" title="AI 生成的节点，打开检查后确认"><${Icon} name="Sparkles" size=${10} />待确认</span>`}</div>
    </div>
    ${ctx.editing && !empty && html`<div className="fnode-actions" onClick=${(e) => e.stopPropagation()}>
      ${isTrigger
        ? html`<${Button} size="xs" variant="outline" icon="Replace" onClick=${() => ctx.onReplaceTrigger()}>替换<//>`
        : html`<${Fragment}>
          <${IconButton} icon="Copy" size="xs" variant="outline" title="复制" onClick=${() => ctx.onCopy(node.id)} />
          <${IconButton} icon="Trash2" size="xs" variant="outline" title="删除" onClick=${() => ctx.onDelete(node.id)} />
        <//>`}
    </div>`}
  </div>`;
}

function AddButton({ target, ctx, last }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const active = ctx.insertTarget && ctx.insertTarget.key === target.key;
  return html`<div className=${cx('flow-gap', last && 'is-last')}>
    ${ctx.editing
      ? html`<button
        ref=${ref}
        type="button"
        className=${cx('flow-add', active && 'is-active', over && 'is-drop')}
        aria-label="添加节点"
        onClick=${(e) => { e.stopPropagation(); ctx.onOpenInsert(target, ref); }}
        onDragOver=${(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setOver(true); } }}
        onDragLeave=${() => setOver(false)}
        onDrop=${(e) => { e.preventDefault(); setOver(false); const raw = e.dataTransfer.getData(DRAG_MIME); if (raw) ctx.onDropItem(target, JSON.parse(raw), ref); }}
      ><${Icon} name="Plus" size=${10} strokeWidth=${3} /></button>`
      : html`<span className="flow-dot" />`}
    ${!last && html`<span className="flow-arrow" />`}
  </div>`;
}

function FlowSteps({ steps, parent, owner, ctx }) {
  return html`<${Fragment}>
    ${steps.map((node, i) => html`<${Fragment} key=${node.id}>
      <${AddButton} target=${{ parent, owner, index: i, key: `${parent}:${i}` }} ctx=${ctx} />
      <${FlowNode} node=${node} ctx=${ctx} />
    <//>`)}
    <${AddButton} target=${{ parent, owner, index: steps.length, key: `${parent}:${steps.length}` }} ctx=${ctx} last=${true} />
  <//>`;
}

function collapsedSummary(node) {
  if (node.branches) return `${node.branches.length} 个分支`;
  if (node.kind === 'loop') return '循环体';
  return '异常处理分支';
}

function ErrorSplit({ node, ctx }) {
  return html`<${Fragment}>
    <div className="flow-gap is-short"><span className="flow-dot" /></div>
    <div className="flow-branches is-error-split">
      <div className="branch-col is-first">
        <span className="branch-top" />
        <span className="branch-bottom" />
        <div className="flow-line" />
        <span className="branch-label is-static">运行成功</span>
        <div className="flow-col"><div className="flow-gap is-last"><span className="flow-dot" /></div></div>
      </div>
      <div className="branch-col is-last is-error">
        <div className="flow-line" />
        <button type="button" className="branch-label is-error" onClick=${(e) => { e.stopPropagation(); ctx.onSelect(node.id, { tab: 'error' }); }}>
          <${Icon} name="TriangleAlert" size=${11} />异常处理
        </button>
        <div className="flow-col">
          <${FlowSteps} steps=${node.errorSteps} parent=${errorListKey(node.id)} owner=${node.id} ctx=${ctx} />
        </div>
      </div>
    </div>
    <div className="flow-gap is-merge"><span className="flow-dot" /></div>
  <//>`;
}

function FlowNode({ node, ctx }) {
  if (ctx.collapsed.includes(node.id) && hasChildren(node)) {
    return html`<div className="flow-block">
      <${FlowNodeCard} node=${node} ctx=${ctx} />
      <button type="button" className="flow-collapsed" onClick=${(e) => { e.stopPropagation(); if (ctx.onToggleCollapse) ctx.onToggleCollapse(node.id); }}>
        <${Icon} name="ChevronsUpDown" size=${12} />已折叠${collapsedSummary(node)}，点击展开
      </button>
    </div>`;
  }
  if (node.kind === 'branch' || node.kind === 'parallel') {
    return html`<div className="flow-block">
      <${FlowNodeCard} node=${node} ctx=${ctx} />
      <div className="flow-gap is-short"><span className="flow-dot" /></div>
      <div className="flow-branches">
        ${node.branches.map((b, bi) => html`<div key=${b.id} className=${cx('branch-col', bi === 0 && 'is-first', bi === node.branches.length - 1 && 'is-last')}>
          <span className="branch-top" />
          <span className="branch-bottom" />
          <div className="flow-line" />
          <button
            type="button"
            className=${cx('branch-label', b.isDefault && 'is-default', ctx.selectedBranch === b.id && 'is-selected', ctx.takenBranches && ctx.takenBranches.includes(b.id) && 'is-taken')}
            onClick=${(e) => { e.stopPropagation(); ctx.onSelect(node.id, { branch: b.id }); }}
          >${b.name}</button>
          <div className="flow-col">
            <${FlowSteps} steps=${b.steps} parent=${b.id} owner=${node.id} ctx=${ctx} />
          </div>
        </div>`)}
        ${ctx.editing && html`<div className="branch-add">
          <${Tooltip} content=${node.kind === 'parallel' ? '添加并行分支' : '添加分支'}>
            <button type="button" className="flow-add is-branch" aria-label=${node.kind === 'parallel' ? '添加并行分支' : '添加分支'} onClick=${(e) => { e.stopPropagation(); ctx.onAddBranch(node.id); }}><${Icon} name="Plus" size=${12} strokeWidth=${3} /></button>
          <//>
        </div>`}
      </div>
      <div className="flow-gap is-merge"><span className="flow-dot" /></div>
    </div>`;
  }
  if (node.kind === 'loop') {
    const isWhile = node.variant === 'while';
    return html`<div className="flow-block">
      <${FlowNodeCard} node=${node} ctx=${ctx} />
      <div className="flow-gap is-short"><span className="flow-dot" /></div>
      <div className="loop-box">
        <span className="loop-box-label"><${Icon} name=${isWhile ? 'RefreshCcw' : 'Repeat'} size=${11} />${isWhile ? `条件循环体 · 最多 ${node.config.max || 100} 次` : `循环体 · ${node.config.mode === '并行' ? '并行' : '串行'}`}</span>
        <div className="flow-col">
          <div className="flow-line" />
          <${FlowSteps} steps=${node.steps} parent=${node.id} owner=${node.id} ctx=${ctx} />
        </div>
      </div>
    </div>`;
  }
  if (node.errorSteps) {
    return html`<div className="flow-block">
      <${FlowNodeCard} node=${node} ctx=${ctx} />
      <${ErrorSplit} node=${node} ctx=${ctx} />
    </div>`;
  }
  return html`<${FlowNodeCard} node=${node} ctx=${ctx} />`;
}

function FlowCanvas({ wf, ctx, fitKey, overlay, bottomLeft }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [view, setViewState] = useState({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);
  const [animated, setAnimated] = useState(false);
  const [panning, setPanning] = useState(false);
  const [minimap, setMinimap] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const lastLimitToast = useRef(0);
  const insetsRef = useRef({ left: 0, right: 0 });
  insetsRef.current = { left: ctx.leftInset || 0, right: ctx.rightInset || 0 };
  const refs = useMemo(() => nodeRefs(wf), [wf]);
  const fullCtx = { ...ctx, refs };

  const setView = (next) => {
    viewRef.current = typeof next === 'function' ? next(viewRef.current) : next;
    setViewState(viewRef.current);
  };

  const limitToast = (z) => {
    if (Date.now() - lastLimitToast.current < 1500) return;
    lastLimitToast.current = Date.now();
    toast.info(z >= ZOOM_MAX ? '无法继续放大' : '无法继续缩小');
  };

  const zoomAt = (nextZ, px, py) => {
    const v = viewRef.current;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZ));
    if (z === v.z) { limitToast(z); return; }
    setView({ z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z });
  };

  const center = (z = 1, animate = true) => {
    const c = canvasRef.current;
    if (!c) return;
    const { left, right } = insetsRef.current;
    setAnimated(animate);
    setView({ z, x: c.clientWidth / 2 + (left - right) / 2 - 106 * z, y: 0 });
  };

  const fit = () => {
    const c = canvasRef.current;
    const s = stageRef.current;
    if (!c || !s) return;
    const { left, right } = insetsRef.current;
    const visibleW = Math.max(200, c.clientWidth - left - right);
    const z = Math.max(0.3, Math.min(1, Math.min((visibleW - 40) / s.offsetWidth, (c.clientHeight + 160) / s.offsetHeight)));
    setAnimated(true);
    setView({ z, x: left + (visibleW - s.offsetWidth * z) / 2, y: 0 });
  };

  useLayoutEffect(() => { center(1, false); }, [fitKey]);

  useEffect(() => {
    const s = stageRef.current;
    if (!s) return undefined;
    const ro = new ResizeObserver(() => setStageSize({ w: s.offsetWidth, h: s.offsetHeight }));
    ro.observe(s);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const onWheel = (e) => {
      if (e.target.closest(PANEL_SELECTOR)) return;
      e.preventDefault();
      setAnimated(false);
      if (e.ctrlKey || e.metaKey) {
        const rect = c.getBoundingClientRect();
        zoomAt(viewRef.current.z * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    const onDragStart = (e) => { if (e.dataTransfer && e.dataTransfer.types.includes(DRAG_MIME)) setDragging(true); };
    const onDragEnd = () => setDragging(false);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    return () => {
      c.removeEventListener('wheel', onWheel);
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
    };
  }, []);

  useEffect(() => {
    if (!ctx.focusId) return;
    const c = canvasRef.current;
    const el = c && c.querySelector(`[data-node="${ctx.focusId}"] .fnode-tile`);
    if (!el) return;
    const cr = c.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const left = cr.left + (ctx.leftInset || 0);
    const right = cr.right - (ctx.rightInset || 0);
    if (er.left < left + 40 || er.right > right - 220 || er.top < cr.top + 40 || er.bottom > cr.bottom - 60) {
      setAnimated(true);
      setView((v) => ({ ...v, x: v.x + ((left + right) / 2 - 90 - (er.left + er.width / 2)), y: v.y + (cr.top + cr.height / 3 - (er.top + er.height / 2)) }));
    }
  }, [ctx.focusId, ctx.focusTick]);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(`.fnode, .flow-add, .branch-label, .flow-collapsed, button, ${PANEL_SELECTOR}`)) return;
    const start = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    let moved = false;
    setAnimated(false);
    const move = (ev) => {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 3) { moved = true; setPanning(true); }
      setView((v) => ({ ...v, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setPanning(false);
      if (!moved && ctx.onCanvasClick) ctx.onCanvasClick();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const zoomTo = (z) => {
    const c = canvasRef.current;
    const { left, right } = insetsRef.current;
    setAnimated(true);
    zoomAt(z, left + (c.clientWidth - left - right) / 2, c.clientHeight / 2);
  };

  useEffect(() => {
    if (ctx.canvasApi) ctx.canvasApi.current = { fit, center: () => center(viewRef.current.z), zoomTo };
  });

  const canvasW = canvasRef.current ? canvasRef.current.clientWidth : 800;
  const canvasH = canvasRef.current ? canvasRef.current.clientHeight : 600;
  const roomForControls = canvasW - (ctx.leftInset || 0) - (ctx.rightInset || 0) > 250;
  const mmScale = stageSize.w ? Math.min(170 / stageSize.w, 110 / stageSize.h) : 0.1;
  const mmOffset = { x: (180 - stageSize.w * mmScale) / 2, y: (120 - stageSize.h * mmScale) / 2 };

  const onMinimapDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const c = canvasRef.current;
    const { left, right } = insetsRef.current;
    const moveTo = (clientX, clientY) => {
      const sx = (clientX - rect.left - mmOffset.x) / mmScale;
      const sy = (clientY - rect.top - mmOffset.y) / mmScale;
      setView((v) => ({ ...v, x: left + (c.clientWidth - left - right) / 2 - sx * v.z, y: c.clientHeight / 2 - sy * v.z }));
    };
    setAnimated(false);
    moveTo(e.clientX, e.clientY);
    const move = (ev) => moveTo(ev.clientX, ev.clientY);
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return html`<div ref=${canvasRef} className=${cx('canvas', panning && 'is-panning', !ctx.editing && 'is-readonly', dragging && 'is-dragging', ctx.linking && 'is-linking')} onMouseDown=${onMouseDown}>
    <div ref=${stageRef} className=${cx('canvas-stage', animated && 'is-animated')} style=${{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
      <div className="flow-col is-root">
        <div className="flow-line" />
        <${FlowNodeCard} node=${wf.trigger} ctx=${fullCtx} />
        ${wf.trigger.connector
          ? html`<${FlowSteps} steps=${wf.steps} parent="root" owner="root" ctx=${fullCtx} />`
          : html`<div className="flow-gap is-last"><span className="flow-dot" /></div>`}
      </div>
    </div>
    ${overlay}
    ${bottomLeft && html`<div className="canvas-float canvas-undo">${bottomLeft}</div>`}
    ${roomForControls && html`<div className="canvas-float canvas-zoom-ctl" style=${{ right: 12 + (ctx.rightInset || 0) }}>
      <${IconButton} icon="Plus" size="sm" title="放大" onClick=${() => zoomTo(+(view.z + 0.1).toFixed(2))} />
      <${Dropdown}
        placement="top-end"
        width=${160}
        trigger=${html`<button type="button" className="canvas-zoom" aria-label="缩放比例">${Math.round(view.z * 100)}%</button>`}
        items=${[
          { label: '缩放到 150%', onClick: () => zoomTo(1.5) },
          { label: '缩放到 100%', onClick: () => zoomTo(1) },
          { label: '缩放到 50%', onClick: () => zoomTo(0.5) },
          { divider: true },
          { label: '适应画布', icon: 'Maximize', onClick: fit },
          { label: '重置视图', icon: 'LocateFixed', onClick: () => center(1) },
          ...(ctx.onCollapseAll ? [
            { divider: true },
            { label: '展开全部节点', icon: 'ChevronsUpDown', onClick: () => ctx.onCollapseAll(false) },
            { label: '折叠全部节点', icon: 'ChevronsDownUp', onClick: () => ctx.onCollapseAll(true) },
          ] : []),
        ]}
      />
      <${IconButton} icon="Minus" size="sm" title="缩小" onClick=${() => zoomTo(+(view.z - 0.1).toFixed(2))} />
      <span className="vdivider" style=${{ margin: '4px 2px' }} />
      <${IconButton} icon="Map" size="sm" title=${minimap ? '隐藏缩略图' : '显示缩略图'} active=${minimap} onClick=${() => setMinimap(!minimap)} />
      ${ctx.onToggleFullscreen && html`<${IconButton} icon=${ctx.fullscreen ? 'Minimize2' : 'Maximize2'} size="sm" title=${ctx.fullscreen ? '退出全屏' : '全屏'} active=${ctx.fullscreen} onClick=${ctx.onToggleFullscreen} />`}
    </div>`}
    ${roomForControls && minimap && stageSize.w > 0 && html`<div className="canvas-float canvas-minimap" style=${{ right: 12 + (ctx.rightInset || 0) }} onMouseDown=${onMinimapDown}>
      <${Minimap} stageRef=${stageRef} scale=${mmScale} offset=${mmOffset} size=${stageSize} wf=${wf} selectedId=${ctx.selectedId} />
      <div className="canvas-minimap-view" style=${{
        left: mmOffset.x + (-view.x / view.z) * mmScale,
        top: mmOffset.y + (-view.y / view.z) * mmScale,
        width: (canvasW / view.z) * mmScale,
        height: (canvasH / view.z) * mmScale,
      }} />
    </div>`}
  </div>`;
}

function Minimap({ stageRef, scale, offset, size, wf, selectedId }) {
  const [rects, setRects] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = stageRef.current;
      if (!s) return;
      const sr = s.getBoundingClientRect();
      const z = sr.width / s.offsetWidth;
      setRects([...s.querySelectorAll('.fnode')].map((el) => {
        const r = el.querySelector('.fnode-tile').getBoundingClientRect();
        return { id: el.getAttribute('data-node'), x: (r.left - sr.left) / z, y: (r.top - sr.top) / z, w: r.width / z, h: r.height / z };
      }));
    }, 60);
    return () => clearTimeout(t);
  }, [wf, size.w, size.h]);
  return html`<svg width="180" height="120" style=${{ position: 'absolute', inset: 0 }} aria-hidden="true">
    ${rects.map((r) => html`<rect key=${r.id} x=${offset.x + r.x * scale} y=${offset.y + r.y * scale} width=${Math.max(3, r.w * scale)} height=${Math.max(3, r.h * scale)} rx="1.5" fill=${r.id === selectedId ? 'var(--primary)' : 'var(--n-400)'} />`)}
  </svg>`;
}

const AI_CONNECTORS = ['openai', 'claude', 'deepseek'];

function paletteGroups(state, projectId) {
  const apps = [...CONNECTORS.filter((c) => !c.builtin && !AI_CONNECTORS.includes(c.id) && c.actions.length), ...publishedCustomConnectors(state).filter((c) => c.actions.length)];
  return {
    logic: LOGIC_NODES,
    helper: HELPER_NODES,
    app: [
      ...apps.map((c) => ({ id: `c-${c.id}`, connector: c.id, name: c.name, custom: c.custom })),
      ...mcpConnectors(state, projectId).filter((c) => c.actions.length).map((c) => ({ id: `c-${c.id}`, connector: c.id, name: c.name, mcp: true, desc: c.desc })),
    ],
    ai: AI_NODES,
  };
}

function operationHits(state, ql, mode, projectId) {
  if (!ql) return [];
  const pool = mode === 'trigger'
    ? [...CONNECTORS.filter((c) => !c.builtin), ...publishedCustomConnectors(state)]
    : [...CONNECTORS, ...publishedCustomConnectors(state), ...mcpConnectors(state, projectId)];
  return pool.flatMap((c) => (mode === 'trigger' ? c.triggers : c.actions)
    .filter((o) => `${o.name}${o.desc || ''}`.toLowerCase().includes(ql))
    .map((o) => ({ id: `op-${c.id}-${o.key}`, connector: c.id, op: o.key, name: o.name, desc: o.desc, owner: c.name })))
    .slice(0, 30);
}

function OperationHit({ item, onPick, draggable }) {
  return html`<button
    type="button"
    className="op-hit"
    draggable=${draggable}
    onDragStart=${(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; }}
    onClick=${() => onPick(item)}
  >
    <${NodeIcon} node=${{ kind: 'action', connector: item.connector, op: item.op }} size=${26} />
    <span className="op-hit-body">
      <span className="op-hit-name">${item.name}</span>
      <span className="op-hit-desc">${item.owner}${item.desc ? ` · ${item.desc}` : ''}</span>
    </span>
  </button>`;
}

function PaletteTile({ item, onPick, draggable }) {
  const c = item.connector && resolveConnector(item.connector);
  const icon = item.icon && (!c || c.builtin || item.op) ? html`<${KindTile} icon=${item.icon} size=${40} />` : c ? html`<${ConnectorIcon} connector=${c} size=${40} />` : html`<${KindTile} icon=${item.icon} size=${40} />`;
  return html`<button
    type="button"
    className="ptile"
    title=${item.desc || (c && c.desc) || item.name}
    draggable=${draggable}
    onDragStart=${(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; }}
    onClick=${() => onPick(item)}
  >
    ${icon}
    <span className="ptile-name">${item.name}</span>
    ${item.custom && html`<span className="ptile-badge">自定义</span>`}
    ${item.mcp && html`<span className="ptile-badge">MCP</span>`}
  </button>`;
}

function OperationList({ connector, mode, onPick, selected, readOnly }) {
  const [q, setQ] = useState('');
  if (!connector) return html`<${Empty} size="sm" icon="Unplug" title="连接器不存在或已下架" description="可以删除该节点，或在连接器市场中重新获取。" />`;
  const ql = q.trim().toLowerCase();
  const list = (mode === 'trigger' ? connector.triggers : connector.actions).filter((o) => !ql || `${o.name}${o.desc || ''}`.toLowerCase().includes(ql));
  const groups = list.reduce((acc, o) => {
    const g = o.group || (mode === 'trigger' ? '触发事件' : '全部操作');
    return { ...acc, [g]: [...(acc[g] || []), o] };
  }, {});
  return html`<div className="oplist">
    <${Input} icon="Search" size="sm" placeholder="搜索操作" value=${q} onChange=${setQ} allowClear />
    ${Object.entries(groups).map(([g, ops]) => html`<${Collapse} key=${g} title=${html`<span className="text-xs muted">${g}</span>`} className="oplist-group">
      <div className="col" style=${{ gap: 6 }}>
        ${ops.map((o) => html`<button key=${o.key} type="button" disabled=${readOnly && selected !== o.key} className=${cx('opcard', selected === o.key && 'is-active')} onClick=${() => !readOnly && onPick(o)}>
          <span className="opcard-name">${o.name}</span>
          <span className="opcard-desc">${o.desc}${o.type === 'polling' ? ' · 轮询' : o.type === 'webhook' ? ' · 实时事件' : ''}</span>
        </button>`)}
      </div>
    <//>`)}
    ${list.length === 0 && html`<${Empty} size="sm" icon="SearchX" title="没有找到相关结果" />`}
  </div>`;
}

function NodePicker({ onPick, state, mode = 'action', initialConnector, projectId }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(mode === 'trigger' ? 'trigger' : 'logic');
  const [expanded, setExpanded] = useState(initialConnector || null);
  const groups = paletteGroups(state, projectId);
  const nodeKind = mode === 'trigger' ? 'trigger' : 'action';
  const pickItem = (item) => {
    if (item.kind) { onPick({ kind: item.kind, variant: item.variant, name: item.name }); return; }
    const c = resolveConnector(item.connector);
    if (!c) return;
    if (item.op) { const o = [...c.actions, ...c.triggers].find((x) => x.key === item.op); onPick({ kind: nodeKind, connector: c.id, op: item.op, name: o ? o.name : item.name }); return; }
    const list = mode === 'trigger' ? c.triggers : c.actions;
    if (list.length === 1) onPick({ kind: nodeKind, connector: c.id, op: list[0].key, name: list[0].name });
    else setExpanded(c.id);
  };

  if (expanded) {
    const c = resolveConnector(expanded);
    return html`<div className="picker">
      <div className="picker-back">
        <${IconButton} icon="ArrowLeft" size="sm" onClick=${() => setExpanded(null)} title="返回" />
        <${ConnectorIcon} connector=${c} size=${24} />
        <div className="grow">
          <div style=${{ fontWeight: 600 }}>${c ? c.name : '连接器不存在'}</div>
          <div className="text-xs muted">${mode === 'trigger' ? '选择触发事件' : '选择操作'}</div>
        </div>
      </div>
      <div className="picker-body">
        <${OperationList} connector=${c} mode=${mode} onPick=${(o) => onPick({ kind: nodeKind, connector: c.id, op: o.key, name: o.name })} />
      </div>
    </div>`;
  }

  const ql = q.trim().toLowerCase();
  let tiles;
  if (mode === 'trigger') {
    const appEvents = [...CONNECTORS, ...publishedCustomConnectors(state)]
      .filter((c) => !c.builtin && c.triggers.length).map((c) => ({ id: `t-${c.id}`, connector: c.id, name: c.name, custom: c.custom }));
    const base = TRIGGER_TYPES.map((t) => ({ id: `tt-${t.connector}`, connector: t.connector, op: t.op, name: t.name, icon: t.icon, desc: t.desc }));
    tiles = ql ? [...base, ...appEvents].filter((x) => x.name.toLowerCase().includes(ql)) : tab === 'trigger' ? base : appEvents;
  } else {
    tiles = ql ? [...groups.logic, ...groups.helper, ...groups.app, ...groups.ai].filter((x) => x.name.toLowerCase().includes(ql)) : groups[tab];
  }
  const hits = operationHits(state, ql, mode, projectId);
  const tabs = mode === 'trigger'
    ? [{ value: 'trigger', label: '触发器' }, { value: 'app', label: '应用事件' }]
    : [{ value: 'logic', label: '逻辑' }, { value: 'helper', label: '助手' }, { value: 'app', label: '应用' }, { value: 'ai', label: 'AI' }];
  return html`<div className="picker">
    <div className="picker-head">
      <${Input} icon="Search" placeholder=${mode === 'trigger' ? '搜索触发器或触发事件' : '搜索连接器或操作'} value=${q} onChange=${setQ} autoFocus allowClear />
      ${!ql && html`<${Tabs} value=${tab} onChange=${setTab} items=${tabs} />`}
    </div>
    <div className="picker-body">
      ${ql && tiles.length > 0 && html`<div className="menu-group">连接器</div>`}
      <div className="ptile-grid">${tiles.map((item) => html`<${PaletteTile} key=${item.id} item=${item} onPick=${pickItem} />`)}</div>
      ${hits.length > 0 && html`<div className="menu-group">${mode === 'trigger' ? '触发事件' : '操作'}</div>`}
      ${hits.map((item) => html`<${OperationHit} key=${item.id} item=${item} onPick=${pickItem} />`)}
      ${tiles.length === 0 && hits.length === 0 && html`<${Empty} size="sm" icon="SearchX" title="没有找到相关结果" description="可以换个关键词，或在连接器开发中自建连接器。" />`}
      ${!ql && tab === 'app' && html`<div className="picker-more"><${Link} to="/connectors" className="link">想发现更多连接器？前往连接器市场<//></div>`}
    </div>
  </div>`;
}

const CODE_TEMPLATES = {
  javascript: 'export default async function main(input) {\n  return { result: input };\n}',
  python: 'def main(input):\n    return {"result": input}\n',
};

function createNodeFromPick(pick) {
  const id = uid('n');
  const settings = { strategy: 'stop', rules: [], times: 3, interval: 10 };
  if (pick.kind === 'action') return { id, kind: 'action', connector: pick.connector, op: pick.op, name: pick.name, config: {}, connectionId: null, settings };
  if (pick.kind === 'branch') {
    return { id, kind: 'branch', name: '分支', branches: [
      { id: uid('b'), name: '分支 1', conditions: [{ left: '', op: '等于', right: '' }], logic: 'and', steps: [] },
      { id: uid('b'), name: '默认', isDefault: true, steps: [] },
    ] };
  }
  if (pick.kind === 'loop' && pick.variant === 'while') return { id, kind: 'loop', variant: 'while', name: 'While 循环', config: { conditions: [{ left: '', op: '小于', right: '' }], logic: 'and', max: 100 }, steps: [] };
  if (pick.kind === 'loop') return { id, kind: 'loop', name: '循环', config: { items: '', mode: '串行', max: 100, concurrency: 5 }, steps: [] };
  if (pick.kind === 'delay') return { id, kind: 'delay', name: '延迟', config: { mode: '等待时长', value: 10, unit: '分钟' } };
  if (pick.kind === 'end') return { id, kind: 'end', name: '终止', config: { status: '成功', message: '' } };
  if (pick.kind === 'code') return { id, kind: 'code', name: '动态脚本', config: { language: 'javascript', inputs: [{ name: 'input', value: '' }], code: CODE_TEMPLATES.javascript }, settings };
  if (pick.kind === 'ai') return { id, kind: 'ai', name: 'AI 助手', config: { connectionId: null, modelName: 'claude-sonnet-5', prompt: '', format: '文本', temperature: 0.2 }, settings: { ...settings, strategy: 'retry-stop' } };
  if (pick.kind === 'variable') return { id, kind: 'variable', name: '设置变量', config: { vars: [{ name: 'count', type: 'number', value: '0' }] } };
  if (pick.kind === 'json') return { id, kind: 'json', name: 'JSON 助手', config: { mode: '解析', source: '' }, settings };
  if (pick.kind === 'agent') return { id, kind: 'agent', name: 'AI 智能体', config: { connectionId: null, modelName: 'claude-sonnet-5', instructions: '', input: '', tools: [], maxSteps: 6, tokenBudget: 20000, onLimit: 'fail', outputFields: [{ k: 'answer', t: '字符串', d: '回复内容' }] }, settings: { ...settings, strategy: 'retry-stop' } };
  return { id, kind: pick.kind, name: pick.name, config: {} };
}
