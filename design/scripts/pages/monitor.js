const MONITOR_RANGES = [
  { value: '15m', label: '最近 15 分钟', unit: 'minute', step: 1, count: 15, logs: '15m' },
  { value: '1h', label: '最近 1 小时', unit: 'minute', step: 5, count: 12, logs: '24h' },
  { value: '24h', label: '最近 24 小时', unit: 'hour', step: 1, count: 24, logs: '24h' },
  { value: '7d', label: '最近 7 天', unit: 'day', step: 1, count: 7, logs: '7d' },
  { value: '30d', label: '最近 30 天', unit: 'day', step: 1, count: 30, logs: '30d' },
];

const MONITOR_SERIES = [
  { key: 'success', name: '成功', color: 'var(--success)', statuses: ['success'] },
  { key: 'failed', name: '失败', color: 'var(--destructive)', statuses: ['failed', 'timeout'] },
  { key: 'stopped', name: '终止', color: 'var(--n-400)', statuses: ['stopped'] },
  { key: 'running', name: '运行中', color: 'var(--info)', statuses: ['running', 'waiting'] },
];

const MONITOR_STACK = ['failed', 'stopped', 'running', 'success'];

const MONITOR_METRICS = ['all', 'success', 'failed', 'stopped'];

const MONITOR_DEFAULT_VIEW = { id: 'default', name: '默认视图', range: '7d', projects: [], workflows: [], metric: 'all', system: true };

const MONITOR_VIEW_NAME_MAX = 20;

const monitorNodeCountCache = new WeakMap();

function monitorRange(value) {
  return MONITOR_RANGES.find((r) => r.value === value) || MONITOR_RANGES[3];
}

function monitorShift(ts, opt, k) {
  const d = new Date(ts);
  if (opt.unit === 'day') d.setDate(d.getDate() + k * opt.step);
  else if (opt.unit === 'hour') d.setHours(d.getHours() + k * opt.step);
  else d.setMinutes(d.getMinutes() + k * opt.step);
  return d.getTime();
}

function monitorBuckets(range, now) {
  const opt = monitorRange(range);
  const d = new Date(now);
  if (opt.unit === 'day') d.setHours(0, 0, 0, 0);
  else if (opt.unit === 'hour') d.setMinutes(0, 0, 0);
  else d.setMinutes(Math.floor(d.getMinutes() / opt.step) * opt.step, 0, 0);
  const starts = Array.from({ length: opt.count }, (_, i) => monitorShift(d.getTime(), opt, i - opt.count + 1));
  const hm = (x) => `${fmt.pad(x.getHours())}:${fmt.pad(x.getMinutes())}`;
  const today = new Date(now).toDateString();
  const list = starts.map((start, i) => {
    const isLast = i === starts.length - 1;
    const end = isLast ? now : starts[i + 1];
    const s = new Date(start);
    const md = `${s.getMonth() + 1}月${s.getDate()}日`;
    return {
      start,
      end,
      label: opt.unit === 'day' ? `${s.getMonth() + 1}/${s.getDate()}` : hm(s),
      title: opt.unit === 'day'
        ? `${md}${s.toDateString() === today ? '（今天）' : ''}`
        : `${opt.unit === 'hour' ? `${md} ` : ''}${hm(s)} - ${isLast ? '现在' : hm(new Date(end))}`,
    };
  });
  return { opt, list, from: starts[0] };
}

function monitorBucketIndex(list, t) {
  if (!list.length || t < list[0].start) return -1;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function monitorTicks(max) {
  if (!(max > 0)) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw && Number.isInteger(s)) || Math.ceil(raw));
  return Array.from({ length: Math.max(1, Math.ceil(max / step)) + 1 }, (_, i) => i * step);
}

function monitorRoundTop(x, y0, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y0 + h}V${y0 + rr}Q${x},${y0} ${x + rr},${y0}H${x + w - rr}Q${x + w},${y0} ${x + w},${y0 + rr}V${y0 + h}Z`;
}

function monitorNodeCount(run, state) {
  if (monitorNodeCountCache.has(run)) return monitorNodeCountCache.get(run);
  const wf = state.workflows.find((w) => w.id === run.workflowId) || null;
  const graph = logsRunGraph(run, wf, state);
  const count = graph
    ? buildRunTrace(run, { ...(wf || { id: run.workflowId, projectId: run.projectId }), ...graph }).filter((t) => !['pending', 'skipped'].includes(t.status)).length
    : 0;
  monitorNodeCountCache.set(run, count);
  return count;
}

function monitorPeak(runs, now) {
  return runs
    .flatMap((r) => [[r.startedAt, 1], [r.duration == null ? now : r.startedAt + r.duration, -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .reduce((acc, [t, delta]) => {
      const cur = acc.cur + delta;
      return cur > acc.max ? { cur, max: cur, at: t } : { ...acc, cur };
    }, { cur: 0, max: 0, at: null });
}

function monitorViewConfig(view) {
  return {
    range: MONITOR_RANGES.some((r) => r.value === view.range) ? view.range : '7d',
    projects: Array.isArray(view.projects) ? view.projects : [],
    workflows: Array.isArray(view.workflows) ? view.workflows : [],
    metric: MONITOR_METRICS.includes(view.metric) ? view.metric : 'all',
  };
}

function monitorUniqueName(names) {
  const n = Array.from({ length: names.length + 1 }, (_, i) => i + 1).find((i) => !names.includes(`我的视图 ${i}`));
  return `我的视图 ${n}`;
}

function monitorCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return `﻿${rows.map((cols) => cols.map(esc).join(',')).join('\r\n')}`;
}

function MonitorTrendChart({ buckets, series, height = 240 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = buckets.length;
  const pad = { l: 44, r: 8, t: 12, b: 28 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;
  const stack = MONITOR_STACK.map((k) => series.find((s) => s.key === k)).filter(Boolean);
  const totals = buckets.map((_, i) => series.reduce((a, s) => a + s.data[i], 0));
  const ticks = monitorTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1];
  const y = (v) => pad.t + plotH * (1 - v / top);
  const band = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 56))));
  const hv = hover != null && hover < n ? hover : null;
  const empty = totals.every((t) => t === 0);
  const move = (dx) => setHover((h) => (h == null || h >= n ? n - 1 : Math.min(n - 1, Math.max(0, h + dx))));
  const onKeyDown = (e) => {
    if (!n) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setHover(0); }
    else if (e.key === 'End') { e.preventDefault(); setHover(n - 1); }
    else if (e.key === 'Escape') setHover(null);
  };
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = band ? Math.floor((e.clientX - rect.left) / band) : -1;
    setHover(i >= 0 && i < n ? i : null);
  };
  const bars = (i) => {
    const x = pad.l + (i + 0.5) * band - barW / 2;
    const segs = stack.filter((s) => s.data[i] > 0);
    return segs.reduce((acc, s, j) => {
      const v = s.data[i];
      const bottom = y(acc.sum) - (acc.sum > 0 ? 2 : 0);
      const h = Math.max(1, bottom - y(acc.sum + v));
      const mark = j === segs.length - 1
        ? html`<path key=${s.key} d=${monitorRoundTop(x, bottom - h, barW, h, 4)} fill=${s.color} />`
        : html`<rect key=${s.key} x=${x} y=${bottom - h} width=${barW} height=${h} fill=${s.color} />`;
      return { sum: acc.sum + v, marks: [...acc.marks, mark] };
    }, { sum: 0, marks: [] }).marks;
  };
  const tipX = hv != null ? pad.l + (hv + 0.5) * band : 0;
  const tipStyle = tipX > width / 2 ? { right: width - tipX + 12 } : { left: tipX + 12 };
  return html`<div
    ref=${wrapRef}
    className="monitor-chart"
    style=${{ height }}
    tabIndex=${0}
    role="group"
    aria-label="运行趋势图，可用左右方向键查看各时间段"
    onKeyDown=${onKeyDown}
    onFocus=${() => setHover((h) => (h == null ? n - 1 : h))}
    onBlur=${() => setHover(null)}
  >
    ${width > 0 && html`<svg width=${width} height=${height} aria-hidden="true">
      ${hv != null && html`<rect x=${pad.l + hv * band} y=${pad.t} width=${band} height=${plotH} className="monitor-hover-band" />`}
      ${ticks.map((t) => {
        const ty = Math.round(y(t)) + 0.5;
        return html`<g key=${`t${t}`}>
          <line x1=${pad.l} x2=${width - pad.r} y1=${ty} y2=${ty} className="monitor-grid-line" />
          <text x=${pad.l - 8} y=${ty + 4} textAnchor="end" className="monitor-axis">${fmt.number(t)}</text>
        </g>`;
      })}
      ${buckets.map((b, i) => html`<g key=${b.start}>${bars(i)}</g>`)}
      ${buckets.map((b, i) => ((n - 1 - i) % every === 0
        ? html`<text key=${`l${b.start}`} x=${pad.l + (i + 0.5) * band} y=${height - 8} textAnchor="middle" className="monitor-axis">${b.label}</text>`
        : null))}
      <rect x=${pad.l} y=${pad.t} width=${plotW} height=${plotH} fill="transparent" onMouseMove=${onMove} onMouseLeave=${() => setHover(null)} />
    </svg>`}
    ${width > 0 && empty && html`<div className="monitor-empty" style=${{ top: pad.t, bottom: pad.b, left: pad.l, right: pad.r }}><span>所选范围内没有运行记录</span></div>`}
    ${hv != null && html`<div className="monitor-tip" style=${{ ...tipStyle, top: pad.t }} role="status">
      <div className="monitor-tip-title">${buckets[hv].title}</div>
      ${series.map((s) => html`<div key=${s.key} className="monitor-tip-row"><span className="monitor-tip-key" style=${{ background: s.color }} /><b>${fmt.number(s.data[hv])}</b><span>${s.name}</span></div>`)}
      ${series.length > 1 && html`<div className="monitor-tip-row is-total"><span className="monitor-tip-key" /><b>${fmt.number(totals[hv])}</b><span>合计</span></div>`}
    </div>`}
  </div>`;
}

function MonitorDonutChart({ data, size = 168, value, caption }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const stroke = 16;
  const r = size / 2 - stroke / 2 - 2;
  const c = 2 * Math.PI * r;
  const shown = data.filter((d) => d.value > 0);
  const gap = shown.length > 1 ? 2 : 0;
  const segs = shown.reduce((acc, d) => {
    const len = (d.value / total) * c;
    return { offset: acc.offset + len, list: [...acc.list, { ...d, len, offset: acc.offset }] };
  }, { offset: 0, list: [] }).list;
  return html`<div className="monitor-donut" style=${{ width: size, height: size }}>
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--muted)" strokeWidth=${stroke} />
      ${segs.map((d) => html`<circle
        key=${d.key}
        cx=${size / 2}
        cy=${size / 2}
        r=${r}
        fill="none"
        stroke=${d.color}
        strokeWidth=${stroke}
        strokeDasharray=${`${Math.max(0.5, d.len - gap)} ${c}`}
        strokeDashoffset=${-d.offset}
        transform=${`rotate(-90 ${size / 2} ${size / 2})`}
      />`)}
    </svg>
    <div className="monitor-donut-center"><div className="monitor-donut-value">${value}</div><div className="text-xs muted">${caption}</div></div>
  </div>`;
}

function Sparkline({ data, color = 'var(--primary)', width = 90, height = 26 }) {
  const values = Array.isArray(data) && data.length ? data : [0];
  const list = values.length > 1 ? values : [values[0], values[0]];
  const max = Math.max(1, ...list);
  const pts = list.map((v, i) => `${((i / (list.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ');
  return html`<svg width=${width} height=${height} aria-hidden="true"><polyline points=${pts} fill="none" stroke=${color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>`;
}

function MonitorViewNameModal({ open, mode, initial, taken, summary, onClose, onSubmit }) {
  const [name, setName] = useState(initial || '');
  useEffect(() => { if (open) setName(initial || ''); }, [open, initial]);
  const v = name.trim();
  const error = !v ? '请输入视图名称' : v.length > MONITOR_VIEW_NAME_MAX ? `视图名称不能超过 ${MONITOR_VIEW_NAME_MAX} 个字` : taken.includes(v) ? '已有同名视图，换一个名称' : '';
  const submit = () => { if (!error) onSubmit(v); };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    title=${mode === 'rename' ? '重命名视图' : '另存为视图'}
    width=${440}
    footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${Boolean(error)} onClick=${submit}>保存<//><//>`}
  >
    <${Field} label="视图名称" required error=${error} extra=${html`<span className=${cx('text-xs', v.length > MONITOR_VIEW_NAME_MAX ? 'monitor-over' : 'muted')}>${v.length}/${MONITOR_VIEW_NAME_MAX}</span>`}>
      <${Input} value=${name} onChange=${setName} autoFocus invalid=${Boolean(error)} placeholder="例如：人事行政 · 近 7 天" onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }} />
    <//>
    ${summary && html`<div className="monitor-view-summary">${summary}</div>`}
  <//>`;
}

function monitorAiRecords({ runs, state, eff, from, now, memberPids }) {
  const fromRuns = runs.filter((r) => r.ai && r.status !== 'deduped').map((r) => ({ id: r.id, source: 'run', model: r.ai.model, input: r.ai.input || 0, output: r.ai.output || 0, projectId: r.projectId, workflowId: r.workflowId, at: r.startedAt }));
  const fromEditor = (state.aiUsage || [])
    .filter((u) => u.at >= from && u.at <= now && memberPids.has(u.projectId) && (!eff.projects.length || eff.projects.includes(u.projectId)) && (!eff.workflows.length || eff.workflows.includes(u.workflowId)))
    .map((u) => ({ id: u.id, source: u.source, model: u.model || '未知模型', input: u.input || 0, output: u.output || 0, projectId: u.projectId, workflowId: u.workflowId || null, at: u.at }));
  return [...fromRuns, ...fromEditor];
}

function monitorAiGroup(records, keyOf) {
  return records.reduce((acc, r) => {
    const k = keyOf(r);
    const cur = acc[k] || { key: k, calls: 0, input: 0, output: 0, models: [] };
    return { ...acc, [k]: { ...cur, calls: cur.calls + 1, input: cur.input + r.input, output: cur.output + r.output, models: cur.models.includes(r.model) ? cur.models : [...cur.models, r.model] } };
  }, {});
}

function monitorAiPrice(prices, model) {
  const p = prices[model] || MONITOR_AI_PRICE;
  const toNum = (v) => (/^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : null);
  return { input: toNum(p.input), output: toNum(p.output) };
}

function monitorAiCost(price, input, output) {
  return price.input === null || price.output === null ? null : (input / 1e6) * price.input + (output / 1e6) * price.output;
}

function monitorAiYuan(v) {
  if (v === null) return '-';
  if (v > 0 && v < 0.01) return '< 0.01 元';
  return `${v.toFixed(2)} 元`;
}

function monitorAiCompact(n) {
  return n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万` : fmt.number(n);
}

function MonitorAiBar({ input, output, max }) {
  const total = input + output;
  const width = max ? Math.max(total ? 2 : 0, (total / max) * 100) : 0;
  const inPct = total ? (input / total) * 100 : 0;
  return html`<${Tooltip} content=${`输入 ${fmt.number(input)} · 输出 ${fmt.number(output)}`}>
    <div className="mon-ai-bar" tabIndex=${0} aria-label=${`输入 ${fmt.number(input)} Token，输出 ${fmt.number(output)} Token`}>
      <div className="mon-ai-bar-fill" style=${{ width: `${width}%` }}>
        ${input > 0 && html`<span className=${cx('mon-ai-seg', 'is-in', output === 0 && 'is-end')} style=${{ flexGrow: inPct }} />`}
        ${output > 0 && html`<span className="mon-ai-seg is-out is-end" style=${{ flexGrow: 100 - inPct }} />`}
      </div>
    </div>
  <//>`;
}

function MonitorAiUsage({ runs, state, eff, from, now, memberPids, rangeLabel, logsTime }) {
  const [prices, setPrices] = useState({});
  const records = monitorAiRecords({ runs, state, eff, from, now, memberPids });
  const realRuns = runs.filter((r) => r.status !== 'deduped');
  const aiRuns = realRuns.filter((r) => r.ai).length;
  const input = records.reduce((a, r) => a + r.input, 0);
  const output = records.reduce((a, r) => a + r.output, 0);
  const bySource = monitorAiGroup(records, (r) => r.source);
  const others = Object.values(bySource).filter((x) => !MONITOR_AI_SOURCES.some((k) => k.key === x.key));
  const sources = [
    ...MONITOR_AI_SOURCES.map((x) => ({ ...x, ...(bySource[x.key] || { calls: 0, input: 0, output: 0 }) })),
    ...(others.length ? [{ key: 'other', label: '其他', icon: 'Sparkles', calls: others.reduce((a, x) => a + x.calls, 0), input: others.reduce((a, x) => a + x.input, 0), output: others.reduce((a, x) => a + x.output, 0) }] : []),
  ];
  const models = Object.values(monitorAiGroup(records, (r) => r.model)).sort((a, b) => (b.input + b.output) - (a.input + a.output)).map((m) => {
    const price = monitorAiPrice(prices, m.key);
    return { ...m, id: m.key, price, cost: monitorAiCost(price, m.input, m.output) };
  });
  const flows = Object.values(monitorAiGroup(records.filter((r) => r.workflowId), (r) => r.workflowId)).map((w) => {
    const wf = state.workflows.find((x) => x.id === w.key) || null;
    const projectId = wf ? wf.projectId : (records.find((r) => r.workflowId === w.key) || {}).projectId;
    return { ...w, id: w.key, wf, projectId, runs: records.filter((r) => r.workflowId === w.key && r.source === 'run').length };
  }).sort((a, b) => (b.input + b.output) - (a.input + a.output));
  const costs = models.map((m) => m.cost);
  const totalCost = costs.some((c) => c === null) ? null : costs.reduce((a, c) => a + c, 0);
  const maxModel = Math.max(0, ...models.map((m) => m.input + m.output));
  const maxFlow = Math.max(0, ...flows.map((w) => w.input + w.output));
  const maxSource = Math.max(0, ...sources.map((x) => x.input + x.output));
  const projectName = (pid) => (state.projects.find((p) => p.id === pid) || {}).name || '-';
  const setPrice = (model, key, v) => setPrices((p) => ({ ...p, [model]: { ...(p[model] || MONITOR_AI_PRICE), [key]: v.replace(/[^\d.]/g, '').slice(0, 8) } }));
  const edited = Object.keys(prices).length > 0;
  return html`<div className="section mon-ai">
    <div className="section-head">
      <div className="mon-ai-title">
        <span className="section-title">AI 用量</span>
        <span className="text-xs muted">${rangeLabel} · 工作流里的 AI 助手和 AI 智能体，加上编辑器 AI 助手、AI 自动映射和 AI 生成工作流消耗的 Token</span>
      </div>
      <div className="monitor-legend">
        <span className="row-4 text-xs"><span className="legend-dot mon-ai-key is-in" />输入</span>
        <span className="row-4 text-xs"><span className="legend-dot mon-ai-key is-out" />输出</span>
      </div>
    </div>
    ${records.length === 0
      ? html`<div className="card"><${Empty} size="sm" icon="Sparkles" title="所选范围内没有 AI 调用" description="用到 AI 助手、AI 智能体的工作流运行，以及编辑器里的 AI 功能，会计入这里。" /></div>`
      : html`<${Fragment}>
        <div className="stat-grid">
          <${Stat} label="Token 总量" value=${fmt.number(input + output)} delta=${`输入 ${fmt.number(input)} · 输出 ${fmt.number(output)}`} help="输入 Token 是发给模型的提示词和上下文，输出 Token 是模型生成的内容" />
          <${Stat} label="用了 AI 的运行" value=${realRuns.length ? `${((aiRuns / realRuns.length) * 100).toFixed(1)}%` : '-'} delta=${`${fmt.number(aiRuns)} / ${fmt.number(realRuns.length)} 次运行`} help="包含 AI 助手或 AI 智能体节点、并且实际调用了模型的运行，占所选范围全部运行的比例（不含已去重的事件）" />
          <${Stat} label="平均每次调用" value=${fmt.number(Math.round((input + output) / records.length))} suffix="Token" delta=${`共 ${fmt.number(records.length)} 次模型调用`} />
          <${Stat} label="按单价估算" value=${monitorAiYuan(totalCost)} delta=${edited ? '按你填写的单价估算，不是账单' : '按示例单价估算，请改成实际单价'} help="只是用下面表格里的单价粗略换算，单价只保存在当前页面；实际费用以模型服务商的账单为准" />
        </div>
        <div className="monitor-grid mon-ai-grid">
          <${Card} title="按模型" subtitle="单价单位：元 / 百万 Token，只用于估算" extra=${edited ? html`<${Button} size="xs" variant="ghost" icon="RotateCcw" onClick=${() => setPrices({})}>恢复示例单价<//>` : null}>
            <${Table}
              className="mon-ai-table"
              dense
              columns=${[
                { key: 'model', title: '模型', render: (m) => html`<span className="mono ellipsis">${m.key}</span>` },
                { key: 'calls', title: '调用', width: 64, align: 'right', render: (m) => fmt.number(m.calls) },
                { key: 'tokens', title: 'Token', width: 150, render: (m) => html`<div className="mon-ai-cell"><${MonitorAiBar} input=${m.input} output=${m.output} max=${maxModel} /><span className="mon-ai-num" title=${fmt.number(m.input + m.output)}>${monitorAiCompact(m.input + m.output)}</span></div>` },
                { key: 'pin', title: '输入单价', width: 88, render: (m) => html`<${Input} size="sm" value=${(prices[m.key] || MONITOR_AI_PRICE).input} onChange=${(v) => setPrice(m.key, 'input', v)} invalid=${m.price.input === null} mono />` },
                { key: 'pout', title: '输出单价', width: 88, render: (m) => html`<${Input} size="sm" value=${(prices[m.key] || MONITOR_AI_PRICE).output} onChange=${(v) => setPrice(m.key, 'output', v)} invalid=${m.price.output === null} mono />` },
                { key: 'cost', title: '估算', width: 96, align: 'right', render: (m) => html`<span className="mon-ai-num">${monitorAiYuan(m.cost)}</span>` },
              ]}
              data=${models}
            />
          <//>
          <${Card} title="按来源" subtitle=${`共 ${fmt.number(records.length)} 次模型调用`}>
            <div className="mon-ai-sources">
              ${sources.map((x) => html`<div key=${x.key} className="mon-ai-source">
                <div className="mon-ai-source-head">
                  <${Icon} name=${x.icon} size=${14} className="muted" />
                  <span className="grow">${x.label}</span>
                  <span className="text-xs muted">${fmt.number(x.calls)} 次</span>
                  <span className="mon-ai-num" title=${fmt.number(x.input + x.output)}>${monitorAiCompact(x.input + x.output)}</span>
                </div>
                ${x.calls ? html`<${MonitorAiBar} input=${x.input} output=${x.output} max=${maxSource} />` : html`<div className="text-xs muted">所选范围内没有调用</div>`}
              </div>`)}
            </div>
          <//>
        </div>
        <div className="mon-ai-flows">
          <${Card} title="按工作流" subtitle="点一行查看这个工作流在所选范围内的运行日志">
            <${Table}
              className="mon-ai-table"
              dense
              onRowClick=${(w) => navigate(`/logs?workflow=${encodeURIComponent(w.id)}&time=${logsTime}`)}
              columns=${[
                { key: 'wf', title: '工作流', render: (w) => html`<div className="cell-main"><${WorkflowGlyph} wf=${w.wf} size=${18} /><span className=${cx('cell-title', !w.wf && 'monitor-deleted')}>${w.wf ? w.wf.name : '已删除的工作流'}</span></div>` },
                { key: 'p', title: '所属项目', width: 100, render: (w) => projectName(w.projectId) },
                { key: 'm', title: '模型', width: 150, render: (w) => html`<span className="mono ellipsis" title=${w.models.join('、')}>${w.models.join('、')}</span>` },
                { key: 'runs', title: '运行', width: 64, align: 'right', render: (w) => fmt.number(w.runs), help: '调用了模型的工作流运行次数' },
                { key: 'calls', title: '调用', width: 64, align: 'right', render: (w) => fmt.number(w.calls), help: '包含运行里的调用，以及编辑这个工作流时的 AI 助手和自动映射' },
                { key: 'tokens', title: 'Token', width: 200, render: (w) => html`<div className="mon-ai-cell"><${MonitorAiBar} input=${w.input} output=${w.output} max=${maxFlow} /><span className="mon-ai-num" title=${fmt.number(w.input + w.output)}>${monitorAiCompact(w.input + w.output)}</span></div>` },
                { key: 'avg', title: '平均每次', width: 96, align: 'right', render: (w) => fmt.number(Math.round((w.input + w.output) / w.calls)) },
              ]}
              data=${flows}
              empty=${html`<${Empty} size="sm" icon="Workflow" title="所选范围内没有工作流调用 AI" />`}
            />
          <//>
        </div>
      <//>`}
  </div>`;
}

function MonitorPage() {
  const state = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [viewId, setViewId] = useState(MONITOR_DEFAULT_VIEW.id);
  const [cfg, setCfg] = useState(() => monitorViewConfig(MONITOR_DEFAULT_VIEW));
  const [sort, setSort] = useState('count');
  const [chartMode, setChartMode] = useState('chart');
  const [nameModal, setNameModal] = useState(null);
  const views = (state.monitorViews || []).filter((v) => !v.owner || v.owner === state.me);
  const view = views.find((v) => v.id === viewId) || MONITOR_DEFAULT_VIEW;
  const memberPids = logsMemberProjectIds(state);
  const projectName = (pid) => (state.projects.find((p) => p.id === pid) || {}).name || '-';
  const prune = (c) => {
    const projects = c.projects.filter((id) => memberPids.has(id) && state.projects.some((p) => p.id === id));
    const workflows = c.workflows.filter((id) => state.workflows.some((w) => w.id === id && memberPids.has(w.projectId) && (!projects.length || projects.includes(w.projectId))));
    return { range: c.range, projects, workflows, metric: c.metric };
  };
  const sig = (c) => JSON.stringify({ ...c, projects: [...c.projects].sort(), workflows: [...c.workflows].sort() });
  const eff = prune(cfg);
  const dirty = sig(eff) !== sig(prune(monitorViewConfig(view)));
  const { opt, list: buckets, from } = useMemo(() => monitorBuckets(eff.range, now), [eff.range, now]);
  const scoped = state.runs.filter((r) => r.kind === 'run' && memberPids.has(r.projectId) && (!eff.projects.length || eff.projects.includes(r.projectId)) && (!eff.workflows.length || eff.workflows.includes(r.workflowId)));
  const runs = scoped.filter((r) => r.startedAt >= from && r.startedAt <= now);
  const prevCount = scoped.filter((r) => r.startedAt >= from - (now - from) && r.startedAt < from).length;
  const m = runMetrics(runs);
  const stopped = runs.filter((r) => r.status === 'stopped').length;
  const share = (x) => (m.total ? `${((x / m.total) * 100).toFixed(1)}%` : '-');
  const idx = runs.map((r) => monitorBucketIndex(buckets, r.startedAt));
  const allSeries = MONITOR_SERIES.map((s) => {
    const data = buckets.map(() => 0);
    runs.forEach((r, k) => { if (idx[k] >= 0 && s.statuses.includes(r.status)) data[idx[k]] += 1; });
    return { ...s, data };
  });
  const series = allSeries.filter((s) => eff.metric === 'all' || s.key === eff.metric);
  const wfPool = state.workflows.filter((w) => memberPids.has(w.projectId) && (!eff.projects.length || eff.projects.includes(w.projectId)));
  const wfScope = eff.workflows.length ? wfPool.filter((w) => eff.workflows.includes(w.id)) : wfPool;
  const nodeTotal = runs.reduce((a, r) => a + monitorNodeCount(r, state), 0);
  const peak = monitorPeak(runs, now);
  const capacity = (state.workers || []).filter((w) => w.status === 'online').reduce((a, w) => a + (w.concurrency || 0), 0);
  const change = prevCount ? ((m.total - prevCount) / prevCount) * 100 : null;
  const rows = [...new Set(runs.map((r) => r.workflowId))].map((id) => {
    const mine = runs.filter((r) => r.workflowId === id);
    const mm = runMetrics(mine);
    const durs = mine.filter((r) => r.duration != null && !['running', 'waiting'].includes(r.status)).map((r) => r.duration).sort((a, b) => a - b);
    const spark = buckets.map(() => 0);
    runs.forEach((r, k) => { if (r.workflowId === id && idx[k] >= 0) spark[idx[k]] += 1; });
    return {
      id,
      wf: state.workflows.find((w) => w.id === id) || null,
      projectId: mine[0].projectId,
      count: mm.total,
      ok: mm.success,
      bad: mm.failed,
      rate: mm.rate,
      avg: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      p95: durs.length ? durs[Math.max(0, Math.ceil(durs.length * 0.95) - 1)] : null,
      last: Math.max(...mine.map((r) => r.startedAt)),
      spark,
    };
  }).sort((a, b) => {
    if (sort === 'bad') return b.bad - a.bad || b.count - a.count;
    if (sort === 'rate') return (a.rate ?? 2) - (b.rate ?? 2) || b.count - a.count;
    return b.count - a.count;
  });
  const names = [MONITOR_DEFAULT_VIEW.name, ...views.map((v) => v.name)];
  const metricName = eff.metric === 'all' ? '全部状态' : MONITOR_SERIES.find((s) => s.key === eff.metric).name;
  const summary = [
    opt.label,
    eff.projects.length ? eff.projects.map(projectName).join('、') : '全部项目',
    eff.workflows.length ? `${eff.workflows.length} 个工作流` : '全部工作流',
    metricName,
  ].join(' · ');
  const applyView = (v) => { setViewId(v.id); setCfg(monitorViewConfig(v)); setNow(Date.now()); };
  const switchView = async (id) => {
    if (id === view.id) return;
    if (dirty && !view.system && !(await confirmDialog({ title: '放弃未保存的修改？', content: `视图「${view.name}」的筛选有修改还没保存，切换后将丢失。`, okText: '切换' }))) return;
    applyView(views.find((v) => v.id === id) || MONITOR_DEFAULT_VIEW);
  };
  const saveAs = (name) => {
    const next = { id: uid('view'), name, owner: state.me, ...eff };
    Store.set((s) => ({ ...s, monitorViews: [...(s.monitorViews || []), next] }));
    setViewId(next.id);
    setCfg(monitorViewConfig(next));
    setNameModal(null);
    toast.success(`已另存为视图「${name}」`);
  };
  const saveChanges = () => {
    Store.set((s) => ({ ...s, monitorViews: (s.monitorViews || []).map((v) => (v.id === view.id ? { ...v, ...eff } : v)) }));
    setCfg(eff);
    toast.success('已保存视图');
  };
  const rename = (name) => {
    Store.set((s) => ({ ...s, monitorViews: (s.monitorViews || []).map((v) => (v.id === view.id ? { ...v, name } : v)) }));
    setNameModal(null);
    toast.success('已重命名视图');
  };
  const removeView = async () => {
    if (view.system) return;
    const ok = await confirmDialog({ title: `删除视图「${view.name}」？`, content: '删除后无法恢复，不影响任何运行数据。', danger: true, okText: '删除' });
    if (!ok) return;
    Store.set((s) => ({ ...s, monitorViews: (s.monitorViews || []).filter((v) => v.id !== view.id) }));
    applyView(MONITOR_DEFAULT_VIEW);
    toast.success('已删除视图');
  };
  const setMetric = (key) => setCfg((c) => ({ ...c, metric: c.metric === key && key !== 'all' ? 'all' : key }));
  const onProjects = (v) => setCfg((c) => ({
    ...c,
    projects: v,
    workflows: c.workflows.filter((id) => { const w = state.workflows.find((x) => x.id === id); return Boolean(w) && (!v.length || v.includes(w.projectId)); }),
  }));
  const exportCsv = () => {
    const csv = monitorCsv([
      ['工作流', '所属项目', '运行次数', '成功次数', '失败次数', '成功率', '平均耗时（毫秒）', 'P95 耗时（毫秒）', '最近运行'],
      ...rows.map((r) => [r.wf ? r.wf.name : `已删除的工作流（${r.id}）`, projectName(r.projectId), r.count, r.ok, r.bad, fmtRate(r.rate), r.avg ?? '', r.p95 ?? '', fmt.dateTime(r.last)]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `运行监控-${opt.label}-${fmt.date(now)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`已导出 ${rows.length} 个工作流的数据`);
  };
  const alertWf = state.workflows.find((w) => w.trigger && w.trigger.connector === 'alert' && memberPids.has(w.projectId));
  const donut = [
    { key: 'success', name: '成功', value: m.success },
    { key: 'failed', name: '失败', value: m.failed },
    { key: 'stopped', name: '终止', value: stopped },
    { key: 'running', name: '运行中', value: m.running },
  ].map((d) => ({ ...d, color: MONITOR_SERIES.find((s) => s.key === d.key).color }));
  const bucketRows = buckets.map((b, i) => ({
    id: String(b.start),
    title: b.title,
    ...Object.fromEntries(series.map((s) => [s.key, s.data[i]])),
    total: series.reduce((a, s) => a + s.data[i], 0),
  })).reverse();
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="运行监控"
      description="按项目和工作流观察运行次数、成功率、耗时和 AI 用量。什么时候通知谁，在「问题 · 告警策略」里设置。"
      actions=${html`<${Fragment}>
        ${dirty && !view.system && html`<span className="monitor-dirty">有未保存的修改</span>`}
        <${Select}
          width=${200}
          value=${view.id}
          onChange=${switchView}
          options=${[
            { group: '系统预置' },
            { value: MONITOR_DEFAULT_VIEW.id, label: MONITOR_DEFAULT_VIEW.name, icon: 'LayoutDashboard' },
            ...(views.length ? [{ group: '我的视图' }, ...views.map((v) => ({ value: v.id, label: v.name, icon: 'Bookmark' }))] : []),
          ]}
        />
        <${Dropdown}
          width=${168}
          trigger=${html`<${Button} icon="Bookmark" iconRight="ChevronDown">视图<//>`}
          items=${[
            { key: 'saveas', label: '另存为视图', icon: 'BookmarkPlus', onClick: () => setNameModal({ mode: 'create', initial: monitorUniqueName(names) }) },
            { key: 'save', label: '保存变更', icon: 'Save', disabled: Boolean(view.system) || !dirty, onClick: saveChanges },
            { key: 'rename', label: '重命名视图', icon: 'PenLine', disabled: Boolean(view.system), onClick: () => setNameModal({ mode: 'rename', initial: view.name }) },
            { key: 'reset', label: '重置视图', icon: 'RotateCcw', disabled: !dirty, onClick: () => { setCfg(monitorViewConfig(view)); setNow(Date.now()); } },
            { divider: true },
            { key: 'delete', label: '删除视图', icon: 'Trash2', danger: true, disabled: Boolean(view.system), onClick: removeView },
          ]}
        />
      <//>`}
    />
    <div className="toolbar">
      <${Select}
        width=${160}
        value=${eff.range}
        onChange=${(v) => { setCfg((c) => ({ ...c, range: v })); setNow(Date.now()); }}
        options=${MONITOR_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        renderValue=${(sel) => sel[0] && html`<span className="select-value"><${Icon} name="Calendar" size=${14} />${sel[0].label}</span>`}
      />
      <${Select} width=${220} multiple clearable value=${eff.projects} onChange=${onProjects} placeholder="全部项目" options=${state.projects.filter((p) => memberPids.has(p.id)).map((p) => ({ value: p.id, label: p.name }))} />
      <${Select} width=${260} multiple clearable searchable value=${eff.workflows} onChange=${(v) => setCfg((c) => ({ ...c, workflows: v }))} placeholder="全部工作流" options=${wfPool.map((w) => ({ value: w.id, label: w.name, desc: projectName(w.projectId) }))} />
      <span className="spacer" />
      <span className="text-xs muted">数据更新于 ${fmt.dateTime(now).slice(11)}</span>
      <${IconButton} icon="RefreshCw" variant="outline" title="刷新" onClick=${() => { setNow(Date.now()); toast.success('已刷新'); }} />
    </div>
    <div className="stat-grid is-7">
      <${Stat} label="运行次数" value=${fmt.number(m.total)} delta=${change == null ? '上一周期没有运行' : `较上一周期 ${change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(1)}%`} onClick=${() => setMetric('all')} active=${eff.metric === 'all'} />
      <${Stat} label="成功次数" value=${fmt.number(m.success)} delta=${`成功率 ${fmtRate(m.rate)}`} onClick=${() => setMetric('success')} active=${eff.metric === 'success'} />
      <${Stat} label="失败次数" value=${fmt.number(m.failed)} delta=${`占比 ${share(m.failed)}`} tone=${m.failed ? 'danger' : undefined} help="包含运行失败和运行超时" onClick=${() => setMetric('failed')} active=${eff.metric === 'failed'} />
      <${Stat} label="终止次数" value=${fmt.number(stopped)} delta=${`占比 ${share(stopped)}`} onClick=${() => setMetric('stopped')} active=${eff.metric === 'stopped'} />
      <${Stat} label="运行中工作流" value=${fmt.number(wfScope.filter((w) => w.status === 'enabled').length)} delta=${`共 ${wfScope.length} 个工作流`} help="已启动运行的工作流数量" />
      <${Stat} label="运行节点数" value=${fmt.number(nodeTotal)} delta=${m.total ? `平均每次 ${(nodeTotal / m.total).toFixed(1)} 个` : '所选范围内没有运行'} help="所选范围内实际执行的节点次数之和，未执行的节点不计入" />
      <${Stat} label="峰值并发" value=${fmt.number(peak.max)} suffix=${capacity ? `/ ${capacity}` : undefined} delta=${peak.max ? `出现在 ${fmt.short(peak.at)}` : '所选范围内没有运行'} help=${capacity ? '同一时刻正在运行的工作流数量的最大值；上限为在线执行节点的并发数之和' : '同一时刻正在运行的工作流数量的最大值'} />
    </div>
    <div className="monitor-grid">
      <${Card}
        title="运行趋势图"
        subtitle=${`${opt.label} · ${opt.unit === 'day' ? '按天' : opt.unit === 'hour' ? '按小时' : `每 ${opt.step} 分钟`}`}
        extra=${html`<div className="row-12">
          <div className="monitor-legend">${series.map((s) => html`<span key=${s.key} className="row-4 text-xs"><span className="legend-dot" style=${{ background: s.color }} />${s.name}</span>`)}</div>
          <${Segmented} size="sm" value=${chartMode} onChange=${setChartMode} options=${[{ value: 'chart', label: '图表' }, { value: 'table', label: '表格' }]} />
        </div>`}
      >
        ${chartMode === 'chart'
          ? html`<${MonitorTrendChart} buckets=${buckets} series=${series} />`
          : html`<${Table}
            className="monitor-bucket-table"
            dense
            columns=${[
              { key: 'title', title: '时间段', render: (r) => r.title },
              ...series.map((s) => ({ key: s.key, title: s.name, width: 76, align: 'right', render: (r) => fmt.number(r[s.key]) })),
              ...(series.length > 1 ? [{ key: 'total', title: '合计', width: 76, align: 'right', render: (r) => fmt.number(r.total) }] : []),
            ]}
            data=${bucketRows}
          />`}
      <//>
      <${Card} title="运行状态分布" subtitle=${`共 ${fmt.number(m.total)} 次运行`}>
        <div className="donut-wrap monitor-donut-wrap">
          <${MonitorDonutChart} data=${donut} size=${152} value=${fmtRate(m.rate)} caption="成功率" />
          <div className="donut-legend">
            ${donut.map((d) => html`<div key=${d.key} className="row"><span className="legend-dot" style=${{ background: d.color }} /><span className="grow nowrap">${d.name}</span><b className="monitor-num">${fmt.number(d.value)}</b><span className="muted text-xs monitor-share">${share(d.value)}</span></div>`)}
          </div>
        </div>
      <//>
    </div>
    <div className="section">
      <div className="section-head">
        <span className="section-title">数据明细</span>
        <div className="row">
          <${Select} width=${170} value=${sort} onChange=${setSort} options=${[{ value: 'count', label: '按运行次数' }, { value: 'bad', label: '按失败次数' }, { value: 'rate', label: '按成功率（低到高）' }]} />
          <${Button} icon="Download" disabled=${!rows.length} onClick=${exportCsv}>导出<//>
        </div>
      </div>
      <${Table}
        className="monitor-table"
        onRowClick=${(r) => navigate(`/logs?workflow=${encodeURIComponent(r.id)}&time=${opt.logs}`)}
        columns=${[
          { key: 'wf', title: '工作流', render: (r) => html`<div className="cell-main"><${WorkflowGlyph} wf=${r.wf} size=${18} /><span className=${cx('cell-title', !r.wf && 'monitor-deleted')} title=${r.wf ? r.wf.name : r.id}>${r.wf ? r.wf.name : '已删除的工作流'}</span></div>` },
          { key: 'p', title: '所属项目', width: 110, render: (r) => projectName(r.projectId) },
          { key: 'trend', title: '趋势', width: 116, render: (r) => html`<${Sparkline} data=${r.spark} color=${r.rate != null && r.rate < 0.9 ? 'var(--destructive)' : 'var(--primary)'} />` },
          { key: 'count', title: '运行次数', width: 90, align: 'right', render: (r) => fmt.number(r.count) },
          { key: 'bad', title: '失败', width: 70, align: 'right', render: (r) => (r.bad ? html`<span className="monitor-bad">${fmt.number(r.bad)}</span>` : 0) },
          { key: 'rate', title: '成功率', width: 136, render: (r) => (r.rate == null
            ? html`<span className="muted">-</span>`
            : html`<div className="row"><div className="monitor-rate-bar"><${Progress} value=${r.rate * 100} tone=${r.rate < 0.9 ? 'danger' : 'success'} height=${5} /></div><span>${fmtRate(r.rate)}</span></div>`) },
          { key: 'avg', title: '平均耗时', width: 100, align: 'right', render: (r) => (r.avg == null ? '-' : fmt.duration(r.avg)) },
          { key: 'p95', title: 'P95 耗时', width: 100, align: 'right', render: (r) => (r.p95 == null ? '-' : fmt.duration(r.p95)) },
          { key: 'last', title: '最近运行', width: 110, render: (r) => html`<span className="muted" title=${fmt.dateTime(r.last)}>${fmt.relative(r.last)}</span>` },
        ]}
        data=${rows}
        empty=${html`<${Empty} icon="Activity" title="所选范围内没有运行记录" description="换一个时间范围，或清除项目、工作流筛选。" size="sm" />`}
      />
    </div>
    <${MonitorAiUsage} runs=${runs} state=${state} eff=${eff} from=${from} now=${now} memberPids=${memberPids} rangeLabel=${opt.label} logsTime=${opt.logs} />
    <div className="section">
      <${Alert} tone="primary" title="配置告警" action=${html`<div className="row">
        <${Button} size="sm" onClick=${() => navigate('/issues/alerts')}>告警策略<//>
        ${alertWf && html`<${Button} size="sm" variant="ghost" onClick=${() => navigate(`/integration/${alertWf.projectId}/wf/${alertWf.id}`)}>告警工作流示例<//>`}
      </div>`}>
        平台内置问题聚合和告警策略：同一原因的失败合并成一个问题，按聚合窗口、静默时段和升级规则通知到飞书、企业微信、钉钉、Webhook 等渠道。需要更复杂的告警逻辑时，仍然可以用「告警触发器」开头的工作流。
      <//>
    </div>
    <${MonitorViewNameModal}
      open=${Boolean(nameModal)}
      mode=${nameModal ? nameModal.mode : 'create'}
      initial=${nameModal ? nameModal.initial : ''}
      taken=${nameModal && nameModal.mode === 'rename' ? names.filter((x) => x !== view.name) : names}
      summary=${nameModal && nameModal.mode === 'create' ? `将保存当前筛选：${summary}` : ''}
      onClose=${() => setNameModal(null)}
      onSubmit=${(name) => (nameModal.mode === 'rename' ? rename(name) : saveAs(name))}
    />
  </div></div>`;
}

const MONITOR_AI_SOURCES = [
  { key: 'run', label: '工作流运行', icon: 'Workflow' },
  { key: 'copilot', label: '编辑器 AI 助手', icon: 'MessageSquareText' },
  { key: 'mapping', label: 'AI 自动映射', icon: 'ArrowLeftRight' },
  { key: 'generate', label: 'AI 生成工作流', icon: 'WandSparkles' },
];

const MONITOR_AI_PRICE = { input: '10', output: '30' };
