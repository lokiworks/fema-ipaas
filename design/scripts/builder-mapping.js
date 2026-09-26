const MISSING_LABEL = { error: '报错', default: '使用默认值', passthrough: '原样输出' };

function mappingResolver(ctx) {
  const state = Store.get();
  const vars = Object.fromEntries(state.variables.filter((v) => v.projectId === ctx.wf.projectId).map((v) => [v.key, (v.values || {}).default]));
  const loop = ctx.loops[ctx.loops.length - 1];
  const loopOut = loop ? outputOf(loop, ctx.wf) : null;
  return (head) => {
    if (head === 'config') return vars;
    if (head === 'loop') return loopOut ? { item: loopOut.item, index: 0 } : undefined;
    if (head === 'item') return ctx.itemSample;
    const node = ctx.nodesById[head];
    return node && ctx.upstreamIds.has(head) ? outputOf(node, ctx.wf) : undefined;
  };
}

function mappingCandidates(ctx) {
  const loop = ctx.loops[ctx.loops.length - 1];
  const loopOut = loop ? outputOf(loop, ctx.wf) : null;
  return [
    ...(ctx.itemScope ? mapCandidates(ctx.itemSample, 'item', '当前项') : []),
    ...(loopOut ? mapCandidates({ item: loopOut.item }, 'loop', '循环变量') : []),
    ...[...ctx.upstream].reverse().flatMap((n) => mapCandidates(outputOf(n, ctx.wf), n.id, n.name)),
  ];
}

function mappingText(row) {
  if (!row) return '';
  if (row.source) return row.source;
  return row.constant === undefined || row.constant === null ? '' : String(row.constant);
}

function textToMappingPatch(text) {
  return text.includes('{{') ? { source: text, constant: undefined } : { source: '', constant: text };
}

function mappingRowEmpty(row) {
  return !row.source && isBlank(row.constant) && !(row.transforms || []).length && !(row.each || []).length && !row.eachOn;
}

function previewText(v) {
  if (v === undefined || v === null || v === '') return '空';
  if (Array.isArray(v)) return `列表 · ${v.length} 项`;
  if (typeof v === 'object') return '对象';
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (typeof v === 'number') return String(v);
  return `"${v}"`;
}

function transformLabel(t, tables) {
  const meta = MAP_TRANSFORMS[t.type] || { label: t.type };
  if (t.type === 'lookup') {
    const table = tables.find((x) => x.id === t.arg);
    return `${meta.label}：${table ? table.name : '已删除的映射表'}`;
  }
  return meta.arg && !isBlank(t.arg) ? `${meta.label}：${t.arg}` : meta.label;
}

function transformTrail(row, resolve, tables) {
  const start = row.source ? resolveMapSource(row.source, resolve) : row.constant;
  const first = { label: row.source ? '来源' : '固定值', value: start, error: null };
  return (row.transforms || []).reduce((acc, t) => {
    const last = acc[acc.length - 1];
    if (last.error) return acc;
    const out = applyTransform(last.value, t, tables);
    return [...acc, { label: transformLabel(t, tables), value: out.value, error: out.error || null }];
  }, [first]);
}

function jsonToMappingFields(text) {
  const raw = typeof text === 'string' ? text : '';
  const parsed = (() => {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  })();
  const pairs = parsed ? Object.entries(parsed) : [...raw.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]);
  return pairs.map(([k, v]) => ({ id: uid('m'), target: k, transforms: [], ...textToMappingPatch(typeof v === 'string' ? v : JSON.stringify(v)) }));
}

function mappingFieldsToJson(fields) {
  return JSON.stringify(Object.fromEntries((fields || []).filter((f) => f.target).map((f) => [f.target, mappingText(f)])), null, 2);
}

function defaultTransformArg(type) {
  if (type === 'date') return 'YYYY-MM-DD';
  if (type === 'round') return '2';
  if (type === 'split') return '，';
  return '';
}

function ObjectField({ fkey, node, onConfig, ctx, def }) {
  const value = node.config[fkey];
  const alts = node.config.__alt || {};
  const mapped = isMapping(value);
  const schema = mappingSchema(node, fkey);
  const [wide, setWide] = useState(false);
  const invalid = def.required && isBlank(value) && ctx.showErrors;
  const setValue = (v) => onConfig({ [fkey]: v });
  const switchTo = (target) => {
    if (target === 'map' && !mapped) {
      const restored = isMapping(alts[fkey]) ? alts[fkey] : { $map: { mode: 'object', fields: jsonToMappingFields(value) } };
      onConfig({ [fkey]: restored, __alt: { ...alts, [fkey]: value } });
    } else if (target === 'json' && mapped) {
      const restored = typeof alts[fkey] === 'string' && alts[fkey].trim() ? alts[fkey] : mappingFieldsToJson(value.$map.fields);
      if ((value.$map.fields || []).some((f) => (f.transforms || []).length || (f.each || []).length)) toast.info('JSON 模式不包含转换和逐项映射，切回「映射」可以恢复');
      onConfig({ [fkey]: restored, __alt: { ...alts, [fkey]: value } });
    }
  };
  const head = html`<${Segmented} size="sm" disabled=${ctx.readOnly} value=${mapped ? 'map' : 'json'} onChange=${switchTo} options=${[{ value: 'map', label: '映射', title: '逐个字段选择来源和转换' }, { value: 'json', label: 'JSON', title: '直接编写 JSON，可以插入变量' }]} />`;
  const editor = (isWide) => html`<${FieldMapping}
    mapping=${value.$map}
    schema=${schema}
    ctx=${ctx}
    wide=${isWide}
    onChange=${(m) => setValue({ $map: m })}
    onExpand=${isWide ? null : () => setWide(true)}
  />`;
  return html`<${Fragment}>
    <${Param}
      name=${def.label}
      required=${def.required}
      help=${def.help || (schema ? '「映射」按目标字段逐个选择来源，适合写入多维表格、CRM、ERP 等有固定字段的系统' : '')}
      error=${invalid ? `${def.label}是必填项` : null}
      headExtra=${head}
      linkable=${!mapped}
      linked=${typeof value === 'string' && value.includes('{{')}
      readOnly=${ctx.readOnly}
      onLink=${(e) => ctx.startLink(e, (path) => setValue(`{{${path}}}`))}
    >
      ${mapped
        ? editor(false)
        : html`<${VarInput} value=${value} onChange=${setValue} placeholder=${def.placeholder || '{ "字段名": "值" }'} multiline ctx=${ctx} invalid=${invalid} readOnly=${ctx.readOnly} />`}
    <//>
    ${mapped && html`<${Modal}
      open=${wide}
      onClose=${() => setWide(false)}
      title=${`字段映射 · ${def.label}`}
      description=${`${node.name} · 按上游节点的样例数据实时预览`}
      width=${1160}
      footer=${html`<${Button} variant="primary" onClick=${() => setWide(false)}>完成<//>`}
    >${editor(true)}<//>`}
  <//>`;
}

function FieldMapping({ mapping, schema, ctx, wide, onChange, onExpand, nested }) {
  const state = Store.get();
  const tables = (state.mappingTables || []).filter((t) => t.projectId === ctx.wf.projectId);
  const fields = mapping.fields || [];
  const resolve = mappingResolver(ctx);
  const result = evalMapping(mapping, { resolve, tables, schema });
  const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));
  const [showAll, setShowAll] = useState(Boolean(wide));
  const [suggestOpen, setSuggestOpen] = useState(false);
  const readOnly = ctx.readOnly;
  const schemaMode = Boolean(schema);
  const aiReady = usableConnections(state, { connectors: AI_CONNECTORS, projectId: ctx.wf.projectId }).length > 0;
  const entries = schemaMode
    ? [
      ...schema.map((f) => ({ key: f.key, field: f, row: fields.find((r) => r.target === f.key) || null })),
      ...fields.filter((r) => !schema.some((f) => f.key === r.target)).map((r) => ({ key: r.id, field: null, row: r, extra: true })),
    ]
    : fields.map((r) => ({ key: r.id, field: null, row: r, extra: true }));
  const visible = entries.filter((e) => showAll || e.extra || (e.row && !mappingRowEmpty(e.row)) || (e.field && e.field.required));
  const hidden = entries.length - visible.length;
  const mappedCount = entries.filter((e) => e.row && !mappingRowEmpty(e.row)).length;
  const problems = result.rows.filter((r) => r.error).length + result.missing.length + (schemaMode ? entries.filter((e) => e.extra).length : 0);
  const setFields = (next) => onChange({ ...mapping, mode: 'object', fields: next });
  const patchEntry = (entry, patch) => {
    const clean = { ...patch, ai: undefined };
    if (entry.row) {
      const next = { ...entry.row, ...clean };
      setFields(entry.extra || !mappingRowEmpty(next) ? fields.map((r) => (r.id === entry.row.id ? next : r)) : fields.filter((r) => r.id !== entry.row.id));
      return;
    }
    const created = { id: uid('m'), target: entry.field.key, source: '', transforms: [], ...clean };
    if (!mappingRowEmpty(created)) setFields([...fields, created]);
  };
  const removeEntry = (entry) => setFields(fields.filter((r) => r.id !== entry.row.id));
  const candidates = mappingCandidates(ctx);
  const applySuggestions = (accepted) => {
    const next = accepted.reduce((acc, s) => {
      const existing = acc.find((r) => r.target === s.target);
      const patch = { source: s.source, constant: undefined, transforms: s.transforms.length || !existing ? s.transforms : existing.transforms || [], ai: true };
      return existing ? acc.map((r) => (r.id === existing.id ? { ...r, ...patch } : r)) : [...acc, { id: uid('m'), target: s.target, ...patch }];
    }, fields);
    setFields(next);
    toast.success(`已应用 ${accepted.length} 条映射建议`);
  };
  const targetNames = fields.map((r) => (r.target || '').trim());
  const rows = visible.map((entry) => html`<${FieldMappingRow}
    key=${entry.key}
    entry=${entry}
    res=${entry.row ? byId[entry.row.id] : null}
    ctx=${ctx}
    tables=${tables}
    resolve=${resolve}
    wide=${wide}
    schemaMode=${schemaMode}
    duplicate=${!schemaMode && entry.row && entry.row.target && targetNames.filter((x) => x === entry.row.target.trim()).length > 1}
    onPatch=${(patch) => patchEntry(entry, patch)}
    onRemove=${() => removeEntry(entry)}
  />`);
  const bar = html`<div className="fmap-bar">
    <span className="fmap-count">
      ${schemaMode ? `已映射 ${mappedCount}/${entries.length - entries.filter((e) => e.extra).length} 个字段` : `${fields.length} 个字段`}
      ${problems > 0 && html`<span className="fmap-count-bad"> · ${problems} 个问题</span>`}
    </span>
    <span className="spacer" />
    ${!readOnly && schemaMode && (aiReady
      ? html`<${Button} size="xs" variant="ghost" icon="Sparkles" onClick=${() => setSuggestOpen(true)}>AI 自动映射<//>`
      : html`<${Tooltip} content="项目里没有可用的模型连接，添加 Claude、OpenAI 或 DeepSeek 连接后可用"><span><${Button} size="xs" variant="ghost" icon="Sparkles" disabled>AI 自动映射<//></span><//>`)}
    ${onExpand && html`<${Button} size="xs" variant="ghost" icon="Maximize2" onClick=${onExpand}>${readOnly ? '展开查看' : '展开编辑'}<//>`}
  </div>`;
  const footer = html`<${Fragment}>
    ${hidden > 0 && html`<button type="button" className="fmap-more" onClick=${() => setShowAll(true)}><${Icon} name="ChevronDown" size=${14} />显示 ${hidden} 个未映射的可选字段</button>`}
    ${showAll && !wide && schemaMode && entries.some((e) => e.field && !e.field.required && !(e.row && !mappingRowEmpty(e.row))) && html`<button type="button" className="fmap-more" onClick=${() => setShowAll(false)}><${Icon} name="ChevronUp" size=${14} />收起未映射的可选字段</button>`}
    ${!schemaMode && !readOnly && html`<${Button} size="xs" variant="ghost" icon="Plus" onClick=${() => setFields([...fields, { id: uid('m'), target: `field${fields.length + 1}`, source: '', transforms: [] }])}>添加字段<//>`}
    ${!schemaMode && !fields.length && html`<div className="text-xs muted">还没有字段。添加字段后，为每个字段选择来源。</div>`}
  <//>`;
  const suggest = html`<${MappingSuggestModal} open=${suggestOpen} onClose=${() => setSuggestOpen(false)} schema=${schema} candidates=${candidates} existing=${fields} ctx=${ctx} onApply=${applySuggestions} />`;
  if (wide && !nested) {
    const lookups = [...new Set(JSON.stringify(mapping).match(/"type":"lookup","arg":"[^"]*"/g) || [])].map((x) => x.replace(/.*"arg":"([^"]*)"/, '$1'));
    return html`<div className="fmap is-wide">
      <div className="fmap-main">
        ${bar}
        <div className="fmap-grid-head"><span>目标字段</span><span>来源</span><span>转换</span><span>预览</span><span /></div>
        <div className="fmap-rows">${rows}</div>
        <div className="fmap-foot">${footer}</div>
      </div>
      <aside className="fmap-side">
        <div className="fmap-side-title">预览结果<span className="text-xs muted">按上游样例数据计算</span></div>
        <div className="card fmap-json json"><${JsonView} value=${result.value} defaultExpandDepth=${3} /></div>
        ${result.missing.length > 0 && html`<${Alert} tone="warning" title="缺少必填字段">${result.missing.map((f) => f.key).join('、')} 没有映射来源，运行时会被目标系统拒绝。<//>`}
        ${lookups.length > 0 && html`<div className="fmap-side-block">
          <div className="text-xs muted">用到的映射表</div>
          ${lookups.map((id) => {
            const table = tables.find((t) => t.id === id);
            return html`<div key=${id} className="fmap-table-ref">
              <${Icon} name="Table2" size=${14} className="muted" />
              <span className="grow ellipsis">${table ? table.name : '已删除的映射表'}</span>
              ${table && html`<span className="text-xs muted">${table.rows.length} 条 · 找不到时${MISSING_LABEL[table.missing]}</span>`}
              ${table && html`<${Link} to=${`/integration/${ctx.wf.projectId}/mappings?id=${table.id}`} className="link text-xs">查看<//>`}
            </div>`;
          })}
        </div>`}
      </aside>
      ${suggest}
    </div>`;
  }
  return html`<div className=${cx('fmap', nested && 'is-nested', wide && 'is-wide-nested')}>
    ${bar}
    ${wide && html`<div className="fmap-grid-head"><span>目标字段</span><span>来源</span><span>转换</span><span>预览</span><span /></div>`}
    <div className="fmap-rows">${rows}</div>
    <div className="fmap-foot">${footer}</div>
    ${!nested && !wide && html`<${Collapse} title=${html`<span className="text-xs muted">预览结果</span>`} defaultOpen=${false} className="fmap-preview-all">
      <div className="card json" style=${{ padding: 6 }}><${JsonView} value=${result.value} defaultExpandDepth=${2} /></div>
    <//>`}
    ${suggest}
  </div>`;
}

function FieldMappingRow({ entry, res, ctx, tables, resolve, wide, schemaMode, duplicate, onPatch, onRemove }) {
  const { field, row } = entry;
  const readOnly = ctx.readOnly;
  const text = mappingText(row);
  const isArray = Boolean(field && field.type === '数组' && field.item);
  const eachOn = Boolean(row && (row.eachOn || (row.each || []).length));
  const empty = !row || mappingRowEmpty(row);
  const error = duplicate ? '字段名重复'
    : schemaMode && entry.extra ? '目标里没有这个字段，可能已改名或删除'
      : res && res.error ? res.error
        : empty && field && field.required ? '必填字段未映射' : null;
  const status = error && !(empty && readOnly) ? 'error' : empty ? 'empty' : 'ok';
  const trail = row && !eachOn && !empty ? transformTrail(row, resolve, tables) : [];
  const trailNode = trail.length > 1 && html`<div className="fmap-trail">
    ${trail.map((s, i) => html`<span key=${i} className=${cx('fmap-trail-step', s.error && 'is-error')}>
      <span className="muted">${s.label}</span>
      <span className="mono">${s.error ? s.error : previewText(s.value)}</span>
      ${i < trail.length - 1 && html`<${Icon} name="ChevronRight" size=${12} className="muted" />`}
    </span>`)}
  </div>`;
  const preview = html`<span className=${cx('fmap-preview', `is-${status}`)}>
    ${status === 'ok' && html`<${Icon} name="Check" size=${12} />`}
    ${status === 'error' && html`<${Icon} name="CircleAlert" size=${12} />`}
    <span className="ellipsis">${empty ? (field && field.required ? '未映射' : '不写入') : res && res.error ? '无法生成' : previewText(res ? res.value : undefined)}</span>
  </span>`;
  const target = entry.field
    ? html`<span className="fmap-target">
      <span className="fmap-target-name" title=${field.key}>${field.key}</span>
      ${field.required && html`<span className="param-req">*</span>`}
      <span className="fmap-type">${field.type}</span>
      ${row && row.ai && html`<${Tooltip} content="AI 建议的映射，已由你确认应用"><${Icon} name="Sparkles" size=${12} className="fmap-ai" /><//>`}
    </span>`
    : schemaMode
      ? html`<span className="fmap-target"><span className="fmap-target-name is-bad" title=${row.target}>${row.target || '未命名字段'}</span></span>`
      : readOnly
        ? html`<span className="fmap-target"><span className="fmap-target-name mono">${row.target || '未命名字段'}</span></span>`
        : html`<${Input} size="sm" mono value=${row.target} onChange=${(v) => onPatch({ target: v.replace(/\s/g, '') })} placeholder="字段名" invalid=${!row.target || duplicate} className="fmap-target-input" />`;
  const source = html`<div className="fmap-source">
    <${VarInput}
      value=${text}
      onChange=${(v) => onPatch(textToMappingPatch(v))}
      placeholder=${isArray ? '选择一个列表' : field && field.options ? '选择选项，或插入变量' : '插入变量，或输入固定值'}
      ctx=${ctx}
      readOnly=${readOnly}
      invalid=${ctx.showErrors && status === 'error' && empty}
    />
    ${field && field.options && !readOnly && html`<${Dropdown}
      placement="bottom-end"
      width=${180}
      trigger=${html`<button type="button" className="icon-btn icon-btn-sm icon-btn-ghost" aria-label="选择选项"><${Icon} name="ListChecks" size=${14} /></button>`}
      items=${[{ group: '选择选项' }, ...field.options.map((o) => ({ key: o, label: o, active: row && !row.source && row.constant === o, onClick: () => onPatch({ source: '', constant: o }) }))]}
    />`}
  </div>`;
  const chain = isArray && eachOn
    ? wide && html`<span className="text-xs muted">逐项映射，见下方</span>`
    : html`<${TransformChain} transforms=${row ? row.transforms : []} onChange=${(t) => onPatch({ transforms: t })} tables=${tables} readOnly=${readOnly} pid=${ctx.wf.projectId} />`;
  const remove = !readOnly && entry.extra && html`<${IconButton} icon="Trash2" size="xs" title="删除字段" onClick=${onRemove} />`;
  const each = isArray && html`<${Fragment}>
    <div className="fmap-each-toggle">
      <${Switch} size="sm" checked=${eachOn} disabled=${readOnly} onChange=${(on) => onPatch(on ? { eachOn: true, each: (row && row.each) || [], transforms: [] } : { eachOn: undefined, each: undefined })} />
      <span>逐项映射</span>
      <${Tooltip} content="来源是列表时，把列表里每一项的字段分别映射到明细行，适合采购明细、订单行这类数据"><${Icon} name="Info" size=${13} className="muted" /><//>
    </div>
    ${eachOn && html`<${FieldMappingEach} row=${row} field=${field} onPatch=${onPatch} ctx=${ctx} resolve=${resolve} wide=${wide} />`}
  <//>`;
  if (wide) {
    return html`<div className=${cx('fmap-row', 'is-grid', status === 'error' && 'has-error')}>
      <div className="fmap-cell">${target}</div>
      <div className="fmap-cell">${source}</div>
      <div className="fmap-cell">${chain}</div>
      <div className="fmap-cell">${preview}</div>
      <div className="fmap-cell">${remove}</div>
      ${(trailNode || (status === 'error' && error) || isArray) && html`<div className="fmap-row-extra">
        ${status === 'error' && error && html`<div className="fmap-error">${error}</div>`}
        ${trailNode}
        ${each}
      </div>`}
    </div>`;
  }
  return html`<div className=${cx('fmap-row', status === 'error' && 'has-error')}>
    <div className="fmap-row-head">
      ${target}
      <span className="spacer" />
      ${trail.length > 1 ? html`<${Tooltip} content=${trailNode}>${preview}<//>` : preview}
      ${remove}
    </div>
    ${source}
    ${chain && html`<div className="fmap-row-chain">${chain}</div>`}
    ${status === 'error' && error && html`<div className="fmap-error">${error}</div>`}
    ${each}
  </div>`;
}

function FieldMappingEach({ row, field, onPatch, ctx, resolve, wide }) {
  const list = row && row.source ? resolveMapSource(row.source, resolve) : undefined;
  const sample = Array.isArray(list) && list.length ? list[0] : undefined;
  const itemCtx = { ...ctx, itemScope: { label: '当前项' }, itemSample: sample };
  const note = Array.isArray(list) ? `来源共 ${list.length} 项，按第 1 项预览` : row && row.source ? '来源不是列表，无法逐项映射' : '先在上方选择来源列表';
  return html`<div className="fmap-each">
    <div className="fmap-each-head">
      <${Icon} name="ListTree" size=${14} />
      <span>每一项生成一行「${field.key}」</span>
      <span className=${cx('text-xs', Array.isArray(list) ? 'muted' : 'fmap-count-bad')}>${note}</span>
    </div>
    <div className="text-xs muted" style=${{ marginBottom: 8 }}>在来源里插入「当前项」的字段，例如当前项.物料编码</div>
    <${FieldMapping} mapping=${{ mode: 'object', fields: row.each || [] }} schema=${field.item} ctx=${itemCtx} wide=${wide} nested onChange=${(m) => onPatch({ eachOn: true, each: m.fields })} />
  </div>`;
}

function TransformChain({ transforms, onChange, tables, readOnly, pid }) {
  const list = transforms || [];
  const setAt = (i, patch) => onChange(list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i, d) => {
    const arr = [...list];
    [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
    onChange(arr);
  };
  const items = [
    { group: '转换' },
    ...Object.entries(MAP_TRANSFORMS).filter(([k]) => k !== 'lookup').map(([k, m]) => ({ key: k, label: m.label, onClick: () => onChange([...list, { type: k, ...(m.arg ? { arg: defaultTransformArg(k) } : {}) }]) })),
    { divider: true },
    { group: '查映射表' },
    ...(tables.length
      ? tables.map((t) => ({ key: t.id, label: t.name, icon: 'Table2', desc: `${t.rows.length} 条对照 · 找不到时${MISSING_LABEL[t.missing]}`, onClick: () => onChange([...list, { type: 'lookup', arg: t.id }]) }))
      : [{ key: 'none', label: '项目里还没有映射表', disabled: true }]),
    { key: 'manage', label: '管理映射表', icon: 'ArrowUpRight', onClick: () => navigate(`/integration/${pid}/mappings`) },
  ];
  if (readOnly && !list.length) return html`<span className="text-xs muted">无转换</span>`;
  return html`<div className="fmap-chain">
    ${list.map((t, i) => html`<${Fragment} key=${i}>
      <${TransformChip}
        t=${t}
        tables=${tables}
        readOnly=${readOnly}
        pid=${pid}
        first=${i === 0}
        last=${i === list.length - 1}
        onChange=${(patch) => setAt(i, patch)}
        onMove=${(d) => move(i, d)}
        onRemove=${() => onChange(list.filter((_, j) => j !== i))}
      />
      ${i < list.length - 1 && html`<${Icon} name="ChevronRight" size=${12} className="muted" />`}
    <//>`)}
    ${!readOnly && html`<${Dropdown}
      placement="bottom-start"
      width=${240}
      trigger=${html`<button type="button" className="fmap-add"><${Icon} name="Plus" size=${12} />${list.length ? '' : '转换'}</button>`}
      items=${items}
    />`}
  </div>`;
}

function TransformChip({ t, tables, readOnly, pid, first, last, onChange, onMove, onRemove }) {
  const meta = MAP_TRANSFORMS[t.type] || { label: t.type };
  const table = t.type === 'lookup' ? tables.find((x) => x.id === t.arg) : null;
  const broken = t.type === 'lookup' && !table;
  const label = transformLabel(t, tables);
  if (readOnly) return html`<span className=${cx('fmap-chip', broken && 'is-error')} title=${label}>${label}</span>`;
  return html`<${Popover}
    placement="bottom-start"
    width=${270}
    trigger=${html`<button type="button" className=${cx('fmap-chip', broken && 'is-error')} title=${label}>${label}</button>`}
  >
    ${({ close }) => html`<div className="fmap-chip-pop">
      <div className="fmap-chip-title">${meta.label}</div>
      ${t.type === 'lookup'
        ? html`<${Fragment}>
          <${Select} size="sm" value=${t.arg} onChange=${(v) => onChange({ arg: v })} placeholder="选择映射表" options=${tables.map((x) => ({ value: x.id, label: x.name, desc: `${x.rows.length} 条对照` }))} />
          ${table && html`<div className="text-xs muted">找不到对应值时：${MISSING_LABEL[table.missing]}${table.missing === 'default' ? `「${table.defaultValue}」` : ''}</div>`}
          ${broken && html`<div className="param-error">原来的映射表已被删除，请重新选择</div>`}
          ${table && html`<${Link} to=${`/integration/${pid}/mappings?id=${table.id}`} className="link text-xs">查看和编辑映射表<//>`}
        <//>`
        : meta.arg
          ? html`<${Field} label=${meta.arg}><${Input} size="sm" value=${t.arg ?? ''} onChange=${(v) => onChange({ arg: v })} placeholder=${meta.placeholder} /><//>`
          : html`<div className="text-xs muted">这个转换没有参数</div>`}
      <div className="row" style=${{ gap: 4, marginTop: 4 }}>
        <${IconButton} icon="ArrowLeft" size="sm" title="前移" disabled=${first} onClick=${() => onMove(-1)} />
        <${IconButton} icon="ArrowRight" size="sm" title="后移" disabled=${last} onClick=${() => onMove(1)} />
        <span className="spacer" />
        <${Button} size="xs" variant="ghost" icon="Trash2" onClick=${() => { close(); onRemove(); }}>删除<//>
      </div>
    </div>`}
  <//>`;
}

function MappingSuggestModal({ open, onClose, schema, candidates, existing, ctx, onApply }) {
  const [phase, setPhase] = useState('thinking');
  const [picked, setPicked] = useState([]);
  const list = useMemo(() => (open && schema ? suggestMapping(schema, candidates, existing) : []), [open]);
  useEffect(() => {
    if (!open) return undefined;
    setPhase('thinking');
    setPicked(list.filter((s) => s.confidence >= 0.8).map((s) => s.target));
    const state = Store.get();
    const conn = usableConnections(state, { connectors: AI_CONNECTORS, projectId: ctx.wf.projectId })[0];
    recordAiUsage({ source: 'mapping', model: conn ? (MODEL_OPTIONS[conn.connector] || [{}])[0].value : 'claude-haiku-4-5', input: 300 + candidates.length * 24 + (schema || []).length * 30, output: 60 + list.length * 40, projectId: ctx.wf.projectId, workflowId: ctx.wf.id });
    const t = setTimeout(() => setPhase('done'), 700);
    return () => clearTimeout(t);
  }, [open]);
  const mapped = new Set((existing || []).filter((r) => r.source || !isBlank(r.constant)).map((r) => r.target));
  const missing = (schema || []).filter((f) => f.type !== '数组' && !mapped.has(f.key) && !list.some((s) => s.target === f.key));
  const low = list.filter((s) => s.confidence < 0.8).length;
  const toggle = (target, on) => setPicked((p) => (on ? [...p, target] : p.filter((x) => x !== target)));
  const apply = () => {
    onApply(list.filter((s) => picked.includes(s.target)));
    onClose();
  };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    title="AI 自动映射"
    icon="Sparkles"
    width=${720}
    footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${phase !== 'done' || !picked.length} onClick=${apply}>应用 ${picked.length} 条<//><//>`}
  >
    ${phase === 'thinking'
      ? html`<div className="fmap-thinking"><${Icon} name="LoaderCircle" size=${16} className="spin" />正在比对上游字段和目标字段…</div>`
      : html`<${Fragment}>
        <div className="text-sm" style=${{ marginBottom: 12 }}>
          ${list.length
            ? `为 ${list.length} 个字段找到了来源建议。${low ? `其中 ${low} 条置信度较低，默认不勾选，请核对后再应用。` : '请逐条核对后应用。'}`
            : '没有找到可以自动匹配的字段，可以手动为每个字段选择来源。'}
        </div>
        ${list.length > 0 && html`<div className="fmap-sug-list">
          ${list.map((s) => {
            const tone = s.confidence >= 0.85 ? 'success' : s.confidence >= 0.6 ? 'warning' : 'default';
            return html`<div key=${s.target} className=${cx('fmap-sug', picked.includes(s.target) && 'is-picked')}>
              <${Checkbox} checked=${picked.includes(s.target)} onChange=${(v) => toggle(s.target, v)} />
              <div className="fmap-sug-body">
                <div className="fmap-sug-line">
                  <b>${s.target}</b>
                  <${Icon} name="ArrowLeft" size=${14} className="muted" />
                  <span className="fmap-sug-source">${renderVarText(s.source, ctx)}</span>
                  ${s.transforms.length > 0 && html`<span className="text-xs muted">${s.transforms.map((t) => transformLabel(t, [])).join(' · ')}</span>`}
                </div>
                <div className="text-xs muted">${s.reason}${mapped.has(s.target) ? ' · 会替换现有映射' : ''}</div>
              </div>
              <${Tag} size="sm" tone=${tone}>置信度 ${Math.round(s.confidence * 100)}%<//>
            </div>`;
          })}
        </div>`}
        ${missing.length > 0 && html`<div className="text-xs muted" style=${{ marginTop: 12 }}>这些字段没有找到合适的来源，需要手动选择：${missing.map((f) => f.key).join('、')}</div>`}
      <//>`}
  <//>`;
}
