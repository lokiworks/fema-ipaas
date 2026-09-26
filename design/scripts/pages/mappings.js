const MAPT_MISSING = {
  error: { label: '报错', icon: 'CircleX', desc: '运行失败，运行日志里会写明缺少哪个值。适合必须精确对照的数据，例如部门编码。', short: '找不到时报错' },
  default: { label: '使用默认值', icon: 'Replace', desc: '写入下面填写的默认值，运行继续。', short: '找不到时用默认值' },
  passthrough: { label: '原样输出', icon: 'MoveRight', desc: '把原来的值直接写入目标字段，运行继续。', short: '找不到时原样输出' },
};

const MAPT_MAX_ROWS = 5000;
const MAPT_KEY_MAX = 100;
const MAPT_VALUE_MAX = 200;

function maptRowTargets(rows, tableId, prefix) {
  return (rows || []).flatMap((r) => {
    const name = `${prefix}${r.target || '未命名字段'}`;
    const own = (r.transforms || []).some((t) => t.type === 'lookup' && t.arg === tableId) ? [name] : [];
    return [...own, ...maptRowTargets(r.each, tableId, `${name}[] · `)];
  });
}

function maptLookupTargets(value, tableId) {
  if (Array.isArray(value)) return value.flatMap((v) => maptLookupTargets(v, tableId));
  if (!value || typeof value !== 'object') return [];
  if (isMapping(value)) return maptRowTargets(value.$map.fields, tableId, '');
  return Object.values(value).flatMap((v) => maptLookupTargets(v, tableId));
}

function maptRefs(state, table) {
  return state.workflows.filter((w) => w.projectId === table.projectId).flatMap((wf) => {
    const sources = [
      { where: '草稿', graph: { trigger: wf.trigger, steps: wf.steps } },
      ...(wf.test ? [{ where: `测试 v${wf.test.version}`, graph: relGraphOf(state, wf, wf.test.version) }] : []),
      ...(wf.published ? [{ where: `生产 v${wf.version}`, graph: relGraphOf(state, wf, wf.version) }] : []),
    ].filter((x) => x.graph);
    const byNode = sources.reduce((acc, { where, graph }) => allNodes(graph).reduce((inner, node) => {
      const targets = maptLookupTargets(node.config || {}, table.id);
      if (!targets.length) return inner;
      const prev = inner[node.id] || { node, targets: [], where: [] };
      return { ...inner, [node.id]: { node: prev.node, targets: [...new Set([...prev.targets, ...targets])], where: [...prev.where, where] } };
    }, acc), {});
    return Object.values(byNode).map((x) => ({ key: `${wf.id}:${x.node.id}`, wf, node: x.node, targets: x.targets, where: x.where }));
  });
}

function maptDetectDelim(text) {
  const first = (text.split(/\r?\n/).find((l) => l.trim()) || '');
  if (first.includes('\t')) return '\t';
  if (first.includes(',')) return ',';
  if (first.includes('，')) return '，';
  if (first.includes(';')) return ';';
  return ',';
}

function maptParseCsv(text) {
  const delim = maptDetectDelim(text);
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return { delim, rows: rows.filter((r) => r.some((c) => c.trim())) };
}

function maptLooksLikeHeader(table, cells) {
  const a = String(cells[0] || '').trim().toLowerCase();
  const b = String(cells[1] || '').trim().toLowerCase();
  const keys = [table.keyLabel, '键', 'key', '原值', '名称', '来源'].map((x) => String(x).toLowerCase());
  const values = [table.valueLabel, '值', 'value', '映射值', '编码', '目标值'].map((x) => String(x).toLowerCase());
  return keys.includes(a) || values.includes(b);
}

function maptImportPlan(table, rows, { header, mode }) {
  const offset = header ? 1 : 0;
  const body = rows.slice(offset);
  const last = body.reduce((acc, cells, i) => {
    const k = String(cells[0] || '').trim();
    return k ? { ...acc, [k]: i } : acc;
  }, {});
  const lines = body.map((cells, i) => {
    const line = i + offset + 1;
    const k = String(cells[0] || '').trim();
    const v = cells.length > 1 ? String(cells[1]).trim() : null;
    if (!k) return { line, k, v: v || '', status: 'skip', reason: '键为空' };
    if (v === null) return { line, k, v: '', status: 'skip', reason: '缺少值' };
    if (k.length > MAPT_KEY_MAX) return { line, k, v, status: 'skip', reason: `键超过 ${MAPT_KEY_MAX} 个字` };
    if (v.length > MAPT_VALUE_MAX) return { line, k, v, status: 'skip', reason: `值超过 ${MAPT_VALUE_MAX} 个字` };
    if (last[k] !== i) return { line, k, v, status: 'skip', reason: '键重复，以最后一行为准' };
    const old = table.rows.find((r) => r.k === k);
    if (!old) return { line, k, v, status: 'add' };
    if (old.v === v) return { line, k, v, status: 'same' };
    return { line, k, v, status: 'update', old: old.v };
  });
  const valid = lines.filter((l) => l.status !== 'skip');
  const removed = mode === 'replace' ? table.rows.filter((r) => !valid.some((l) => l.k === r.k)) : [];
  const imported = valid.map((l) => ({ k: l.k, v: l.v }));
  const next = mode === 'replace'
    ? imported
    : [...table.rows.map((r) => imported.find((x) => x.k === r.k) || r), ...imported.filter((x) => !table.rows.some((r) => r.k === x.k))];
  const count = (st) => lines.filter((l) => l.status === st).length;
  return { lines, valid, removed, next, added: count('add'), updated: count('update'), same: count('same'), skipped: count('skip'), multiCol: body.some((c) => c.length > 1), wide: body.some((c) => c.length > 2) };
}

function maptCsvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

function maptToCsv(table) {
  return [[table.keyLabel, table.valueLabel], ...table.rows.map((r) => [r.k, r.v])].map((cells) => cells.map(maptCsvCell).join(',')).join('\r\n');
}

function maptDownload(filename, text) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function maptPatch(tableId, patch) {
  Store.set((s) => ({
    ...s,
    mappingTables: (s.mappingTables || []).map((t) => (t.id === tableId ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch), updatedAt: Date.now(), updatedBy: s.me } : t)),
  }));
}

function MapTableModal({ open, onClose, pid, table, onCreated }) {
  const state = useStore();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [valueLabel, setValueLabel] = useState('');
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    setName(table ? table.name : '');
    setDesc(table ? table.description || '' : '');
    setKeyLabel(table ? table.keyLabel : '原值');
    setValueLabel(table ? table.valueLabel : '映射值');
    setTouched({});
  }, [open]);
  const n = name.trim();
  const kl = keyLabel.trim();
  const vl = valueLabel.trim();
  const dup = (state.mappingTables || []).some((t) => t.projectId === pid && t.name === n && (!table || t.id !== table.id));
  const nameError = dup ? '项目内已有同名映射表' : touched.name && !n ? '请输入映射表名称' : null;
  const keyError = touched.key && !kl ? '请输入键的名称' : null;
  const valueError = touched.value && !vl ? '请输入值的名称' : kl && vl && kl === vl ? '键和值的名称不能相同' : null;
  const valid = Boolean(n && kl && vl) && !dup && kl !== vl;
  const save = () => {
    setTouched({ name: true, key: true, value: true });
    if (!valid) return;
    if (!canEditProject(Store.get(), pid)) { toast.error(INTEG_VIEWER_TIP); return; }
    if (table) {
      const same = n === table.name && desc.trim() === (table.description || '') && kl === table.keyLabel && vl === table.valueLabel;
      if (!same) {
        maptPatch(table.id, { name: n, description: desc.trim(), keyLabel: kl, valueLabel: vl });
        addAudit('修改映射表', n, pid);
        toast.success('已保存');
      }
      onClose();
      return;
    }
    const t = { id: uid('mt'), projectId: pid, name: n, description: desc.trim(), keyLabel: kl, valueLabel: vl, missing: 'error', defaultValue: '', rows: [], updatedAt: Date.now(), updatedBy: Store.get().me };
    Store.set((s) => ({ ...s, mappingTables: [...(s.mappingTables || []), t] }));
    addAudit('新建映射表', n, pid);
    toast.success('已新建映射表，可以添加对照数据或导入 CSV');
    onClose();
    onCreated(t.id);
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${table ? '编辑映射表' : '新建映射表'} width=${520} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid} onClick=${save}>${table ? '保存' : '创建'}<//><//>`}>
    <${Field} label="名称" required error=${nameError}><${CharInput} value=${name} onChange=${(v) => { setName(v); setTouched((t) => ({ ...t, name: true })); }} max=${30} placeholder="例：部门编码对照" autoFocus invalid=${Boolean(nameError)} /><//>
    <${Field} label="描述"><${CharTextarea} value=${desc} onChange=${setDesc} max=${100} rows=${2} placeholder="说明对照的是什么，在哪些工作流里用" /><//>
    <div className="form-grid">
      <${Field} label="键的名称" required error=${keyError} hint="要查找的原值，例如「北森部门」"><${CharInput} value=${keyLabel} onChange=${(v) => { setKeyLabel(v); setTouched((t) => ({ ...t, key: true })); }} max=${20} invalid=${Boolean(keyError)} /><//>
      <${Field} label="值的名称" required error=${valueError} hint="查到后写入的值，例如「飞书部门 ID」"><${CharInput} value=${valueLabel} onChange=${(v) => { setValueLabel(v); setTouched((t) => ({ ...t, value: true })); }} max=${20} invalid=${Boolean(valueError)} /><//>
    </div>
  <//>`;
}

function MapImportModal({ open, onClose, table, pid }) {
  const [source, setSource] = useState('paste');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState(null);
  const [header, setHeader] = useState(null);
  const [mode, setMode] = useState('merge');
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setSource('paste'); setText(''); setFileName(''); setFileError(null); setHeader(null); setMode('merge'); setOver(false);
  }, [open]);
  if (!open || !table) return null;
  const parsed = text.trim() ? maptParseCsv(text) : null;
  const detected = parsed && parsed.rows.length ? maptLooksLikeHeader(table, parsed.rows[0]) : false;
  const useHeader = header === null ? detected : header;
  const plan = parsed ? maptImportPlan(table, parsed.rows, { header: useHeader, mode }) : null;
  const tooMany = plan && plan.next.length > MAPT_MAX_ROWS;
  const parseError = !plan ? null
    : !plan.lines.length ? '没有可以导入的数据行'
      : !plan.multiCol ? '没有识别到两列数据。每行写一个键和一个值，用英文逗号或 Tab 分隔'
        : tooMany ? `导入后会有 ${plan.next.length} 行，超过每个映射表 ${MAPT_MAX_ROWS} 行的上限`
          : null;
  const changes = plan ? plan.added + plan.updated + plan.removed.length : 0;
  const read = (f) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setFileError('文件超过 2 MB，请拆分后再导入'); return; }
    f.text()
      .then((t) => { setText(t); setFileName(f.name); setFileError(null); setHeader(null); })
      .catch(() => setFileError('无法读取文件，请重新选择'));
  };
  const apply = () => {
    if (!plan || parseError || !changes) return;
    const s = Store.get();
    const t = (s.mappingTables || []).find((x) => x.id === table.id);
    if (!t) { toast.error('映射表已被删除'); onClose(); return; }
    if (!canEditProject(s, pid)) { toast.error(INTEG_VIEWER_TIP); return; }
    const now = maptImportPlan(t, parsed.rows, { header: useHeader, mode });
    maptPatch(t.id, { rows: now.next });
    const summary = [`新增 ${now.added} 行`, `更新 ${now.updated} 行`, ...(mode === 'replace' ? [`删除 ${now.removed.length} 行`] : [])].join('，');
    addAudit('导入映射表', `${t.name} · ${summary}`, pid);
    toast.success(`已导入：${summary}`);
    onClose();
  };
  const STATUS = { add: ['success', '新增'], update: ['info', '更新'], same: ['default', '无变化'], skip: ['warning', '跳过'] };
  return html`<${Modal}
    open=${open}
    onClose=${onClose}
    title="导入 CSV"
    description=${`导入到「${table.name}」`}
    width=${720}
    footer=${html`<${Fragment}>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" disabled=${!plan || Boolean(parseError) || !changes} onClick=${apply}>${plan && !parseError && changes ? `导入（${changes} 处变化）` : '导入'}<//>
    <//>`}
  >
    <div className="row mapt-import-bar">
      <${Segmented} size="sm" value=${source} onChange=${setSource} options=${[{ value: 'paste', label: '粘贴文本', icon: 'ClipboardPaste' }, { value: 'file', label: '选择文件', icon: 'FileUp' }]} />
      <span className="text-xs muted">每行一对：${table.keyLabel}，${table.valueLabel}。支持英文逗号或 Tab 分隔，文件请用 UTF-8 编码</span>
    </div>
    ${source === 'paste'
      ? html`<${Textarea} mono rows=${6} value=${text} onChange=${(v) => { setText(v); setFileName(''); }} placeholder=${`${table.keyLabel},${table.valueLabel}\n${(table.rows[0] || { k: '研发中心' }).k},${(table.rows[0] || { v: 'od-rd-001' }).v}`} />`
      : html`<${Fragment}>
        <button
          type="button"
          className=${cx('dropzone', over && 'is-over', fileError && 'is-invalid')}
          onClick=${() => inputRef.current && inputRef.current.click()}
          onDragOver=${(e) => { e.preventDefault(); if (!over) setOver(true); }}
          onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
          onDrop=${(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        >
          <${Icon} name=${fileName ? 'FileSpreadsheet' : 'Upload'} size=${28} strokeWidth=${1.5} />
          ${fileName
            ? html`<${Fragment}><b>${fileName}</b><span className="muted text-xs">点击重新选择</span><//>`
            : html`<${Fragment}><b>点击或拖拽 CSV 文件到这里</b><span className="muted text-xs">支持 .csv 和 .txt，最大 2 MB</span><//>`}
        </button>
        <input ref=${inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange=${(e) => { read(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        ${fileError && html`<div className="field-error integ-gap-top">${fileError}</div>`}
      <//>`}
    ${plan && html`<div className="mapt-import-opts">
      <${Checkbox} checked=${useHeader} onChange=${setHeader} label=${`第一行是表头${detected ? '（已自动识别）' : ''}`} />
      <span className="spacer" />
      <${RadioGroup} value=${mode} onChange=${setMode} options=${[{ value: 'merge', label: '合并：保留现有的行，新增或更新导入的行' }, { value: 'replace', label: '替换：清空现有的行' }]} />
    </div>`}
    ${plan && parseError && html`<div className="integ-gap-top"><${Alert} tone="warning">${parseError}<//></div>`}
    ${plan && !parseError && html`<${Fragment}>
      <div className="mapt-import-sum">
        <${Tag} tone="success" size="sm">新增 ${plan.added}<//>
        <${Tag} tone="info" size="sm">更新 ${plan.updated}<//>
        <${Tag} size="sm">无变化 ${plan.same}<//>
        ${plan.skipped > 0 && html`<${Tag} tone="warning" size="sm">跳过 ${plan.skipped}<//>`}
        ${mode === 'replace' && html`<${Tag} tone="danger" size="sm">删除 ${plan.removed.length}<//>`}
        ${plan.wide && html`<span className="text-xs muted">只读取前两列</span>`}
      </div>
      ${mode === 'replace' && plan.removed.length > 0 && html`<div className="integ-gap"><${Alert} tone="warning">替换会删除现有的 ${plan.removed.length} 行：${plan.removed.slice(0, 5).map((r) => r.k).join('、')}${plan.removed.length > 5 ? ' 等' : ''}。引用这个映射表的工作流再遇到这些值时，会按「找不到对应值时」的设置处理。<//></div>`}
      ${!changes && html`<div className="integ-gap"><${Alert} tone="info">导入的内容和现有数据相同，没有需要导入的变化。<//></div>`}
      <div className="table-wrap mapt-import-preview">
        <table className="table is-dense">
          <thead><tr><th style=${{ width: 56 }}>行</th><th>${table.keyLabel}</th><th>${table.valueLabel}</th><th style=${{ width: 190 }}>结果</th></tr></thead>
          <tbody>
            ${plan.lines.slice(0, 100).map((l) => html`<tr key=${l.line}>
              <td className="muted">${l.line}</td>
              <td><span className="mono ellipsis mapt-cell" title=${l.k}>${l.k || html`<span className="muted">（空）</span>`}</span></td>
              <td><span className="mono ellipsis mapt-cell" title=${l.v}>${l.status === 'update' ? html`<span className="muted mapt-old">${l.old}</span>` : null}${l.v || html`<span className="muted">（空）</span>`}</span></td>
              <td><span className="row-4"><${Tag} size="sm" tone=${STATUS[l.status][0]}>${STATUS[l.status][1]}<//>${l.reason && html`<span className="text-xs muted ellipsis">${l.reason}</span>`}</span></td>
            </tr>`)}
          </tbody>
        </table>
        ${plan.lines.length > 100 && html`<div className="text-xs muted mapt-more">只预览前 100 行，共 ${plan.lines.length} 行</div>`}
      </div>
    <//>`}
  <//>`;
}

function MappingTablesPage({ pid }) {
  const state = useStore();
  const route = useRoute();
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('rows');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState(null);
  const canEdit = canEditProject(state, pid);
  const viewerTip = canEdit ? '' : INTEG_VIEWER_TIP;
  const tables = (state.mappingTables || []).filter((t) => t.projectId === pid);
  const wanted = route.query.id || null;
  const cur = tables.find((t) => t.id === wanted) || tables[0] || null;
  const badLink = Boolean(wanted) && !tables.some((t) => t.id === wanted);
  const curId = cur ? cur.id : null;
  useEffect(() => { setEdit(null); setQ(''); setDraft(null); }, [curId]);
  const pick = (id) => navigate(`/integration/${pid}/mappings?id=${id}`, { replace: true });
  const refs = cur ? maptRefs(state, cur) : [];
  const refWorkflows = new Set(refs.map((r) => r.wf.id)).size;

  const exportCsv = () => {
    maptDownload(`${cur.name}.csv`, maptToCsv(cur));
    addAudit('导出映射表', cur.name, pid);
    toast.success(`已导出「${cur.name}.csv」`);
  };
  const removeTable = async () => {
    const live = maptRefs(Store.get(), cur);
    if (live.length) { setModal({ type: 'blocked' }); return; }
    const ok = await confirmDialog({ title: `删除映射表「${cur.name}」？`, content: `${cur.rows.length} 行对照数据会一并删除，无法恢复。当前没有工作流引用这个映射表。`, danger: true, okText: '删除' });
    if (!ok) return;
    if (maptRefs(Store.get(), cur).length) { setModal({ type: 'blocked' }); return; }
    const gone = cur;
    Store.set((s) => ({ ...s, mappingTables: (s.mappingTables || []).filter((t) => t.id !== gone.id) }));
    addAudit('删除映射表', gone.name, pid);
    toast.success('已删除映射表');
    navigate(`/integration/${pid}/mappings`, { replace: true });
  };

  const rows = cur ? cur.rows : [];
  const ql = q.trim().toLowerCase();
  const shown = rows.map((r, i) => ({ ...r, i })).filter((r) => !ql || `${r.k}\n${r.v}`.toLowerCase().includes(ql));
  const startAdd = () => { setQ(''); setEdit({ index: 'new', k: '', v: '', error: null }); };
  const startEdit = (i) => setEdit({ index: i, k: rows[i].k, v: rows[i].v, error: null });
  const saveEdit = () => {
    if (!edit) return;
    const k = edit.k.trim();
    const v = edit.v.trim();
    const t = (Store.get().mappingTables || []).find((x) => x.id === curId);
    if (!t) { setEdit(null); return; }
    const list = t.rows;
    const error = !k ? { field: 'k', text: '键不能为空' }
      : k.length > MAPT_KEY_MAX ? { field: 'k', text: `键最多 ${MAPT_KEY_MAX} 个字` }
        : v.length > MAPT_VALUE_MAX ? { field: 'v', text: `值最多 ${MAPT_VALUE_MAX} 个字` }
          : list.some((r, i) => r.k === k && i !== edit.index) ? { field: 'k', text: `「${k}」已经存在，同一个键只能对应一个值` }
            : edit.index === 'new' && list.length >= MAPT_MAX_ROWS ? { field: null, text: `每个映射表最多 ${MAPT_MAX_ROWS} 行` }
              : null;
    if (error) { setEdit({ ...edit, error }); return; }
    const before = edit.index === 'new' ? null : list[edit.index];
    if (before && before.k === k && before.v === v) { setEdit(null); return; }
    const next = edit.index === 'new' ? [{ k, v }, ...list] : list.map((r, i) => (i === edit.index ? { k, v } : r));
    maptPatch(t.id, { rows: next });
    addAudit(edit.index === 'new' ? '新增映射表数据' : '修改映射表数据', `${t.name} · ${before && before.k !== k ? `${before.k} → ${k}` : k}`, pid);
    toast.success(edit.index === 'new' ? '已添加' : '已保存');
    setEdit(null);
  };
  const removeRow = async (i) => {
    const r = rows[i];
    const ok = await confirmDialog({
      title: `删除「${r.k}」这一行？`,
      content: `引用这个映射表的工作流再遇到「${r.k}」时，会按「${MAPT_MISSING[cur.missing].label}」处理。`,
      danger: true,
      okText: '删除',
    });
    if (!ok) return;
    maptPatch(cur.id, (t) => ({ rows: t.rows.filter((x) => x.k !== r.k) }));
    addAudit('删除映射表数据', `${cur.name} · ${r.k}`, pid);
    toast.success('已删除');
    setEdit(null);
  };
  const editKeys = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEdit(null); }
  };
  const editorRow = (key, rowNo) => html`<tr key=${key} className="mapt-edit-row">
    <td className="muted">${rowNo}</td>
    <td><${Input} size="sm" mono autoFocus value=${edit.k} onChange=${(v) => setEdit({ ...edit, k: v.slice(0, MAPT_KEY_MAX), error: null })} onKeyDown=${editKeys} invalid=${Boolean(edit.error && edit.error.field === 'k')} placeholder=${`输入${cur.keyLabel}`} /></td>
    <td><${Input} size="sm" mono value=${edit.v} onChange=${(v) => setEdit({ ...edit, v: v.slice(0, MAPT_VALUE_MAX), error: null })} onKeyDown=${editKeys} invalid=${Boolean(edit.error && edit.error.field === 'v')} placeholder=${`输入${cur.valueLabel}`} /></td>
    <td><span className="row-4">
      <${IconButton} icon="Check" size="sm" variant="outline" title="保存" onClick=${saveEdit} />
      <${IconButton} icon="X" size="sm" title="取消" onClick=${() => setEdit(null)} />
    </span></td>
  </tr>`;

  const missingDraft = draft || (cur ? { missing: cur.missing, defaultValue: cur.defaultValue || '' } : null);
  const missingDirty = Boolean(cur && missingDraft && (missingDraft.missing !== cur.missing || (missingDraft.missing === 'default' && missingDraft.defaultValue.trim() !== (cur.defaultValue || ''))));
  const defaultError = missingDraft && missingDraft.missing === 'default' && !missingDraft.defaultValue.trim() ? '请填写默认值' : null;
  const saveMissing = () => {
    if (!missingDirty || defaultError) return;
    const patch = { missing: missingDraft.missing, defaultValue: missingDraft.missing === 'default' ? missingDraft.defaultValue.trim() : cur.defaultValue || '' };
    maptPatch(cur.id, patch);
    addAudit('修改映射表设置', `${cur.name} · ${MAPT_MISSING[patch.missing].short}${patch.missing === 'default' ? `「${patch.defaultValue}」` : ''}`, pid);
    toast.success('已保存');
    setDraft(null);
  };
  const exampleResult = missingDraft && (missingDraft.missing === 'error'
    ? '运行失败，运行日志里写明表里没有这个值'
    : missingDraft.missing === 'default' ? `写入默认值${missingDraft.defaultValue.trim() ? `「${missingDraft.defaultValue.trim()}」` : ''}，运行继续` : '把查找的原值直接写入目标字段，运行继续');

  const refsList = html`<div className="mapt-refs">
    ${refs.map((r) => html`<div key=${r.key} className="mapt-ref">
      <${WorkflowGlyph} wf=${r.wf} size=${20} />
      <div className="grow">
        <div className="row-4 mapt-ref-title">
          <${Link} to=${`/integration/${pid}/wf/${r.wf.id}`} className="link">${r.wf.name}<//>
          <span className="muted">·</span>
          <span className="ellipsis">${r.node.name}</span>
        </div>
        <div className="text-xs muted">字段 ${r.targets.join('、')}</div>
      </div>
      <span className="row-4 mapt-ref-where">${r.where.map((w) => html`<${Tag} key=${w} size="sm" tone=${w.startsWith('生产') ? 'primary' : 'default'}>${w}<//>`)}</span>
    </div>`)}
  </div>`;

  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="映射表"
      description="保存常用的对照关系，例如部门名称 → 部门编码。在字段映射里用「查映射表」转换，多个工作流共用一份，改一处全部生效。"
      actions=${html`<${IntegDisabledTip} tip=${viewerTip}><${Button} variant="primary" icon="Plus" disabled=${!canEdit} onClick=${() => setModal({ type: 'table' })}>新建映射表<//><//>`}
    />
    ${!canEdit && html`<div className="integ-gap"><${Alert} tone="info">你在此项目中是「可查看」权限，可以查看和导出映射表，不能修改。<//></div>`}
    ${badLink && html`<div className="integ-gap"><${Alert} tone="warning">链接里的映射表不存在，或者不属于这个项目。<//></div>`}
    ${!cur
      ? html`<${Empty}
        icon="Table2"
        title="还没有映射表"
        description="把部门、物料、客户来源这类固定的对照关系存成映射表，字段映射里选「查映射表」就能直接转换，不用写代码节点。"
        action=${canEdit && html`<${Button} variant="primary" icon="Plus" onClick=${() => setModal({ type: 'table' })}>新建映射表<//>`}
      />`
      : html`<div className="storage-layout">
        <div className="storage-list">
          ${tables.map((t) => html`<button key=${t.id} type="button" className=${cx('storage-item', t.id === cur.id && 'is-active')} onClick=${() => pick(t.id)}>
            <${Icon} name="Table2" size=${16} />
            <span className="grow"><span className="storage-name">${t.name}</span><span className="text-xs muted">${t.rows.length} 行 · ${MAPT_MISSING[t.missing].short}</span></span>
          </button>`)}
        </div>
        <div className="storage-main">
          <div className="row mapt-head">
            <div className="grow">
              <div className="section-title">${cur.name}</div>
              <div className="text-xs muted">${cur.description || '暂无描述'}</div>
              <div className="mapt-meta">
                <span className="mapt-pair"><span>${cur.keyLabel}</span><${Icon} name="ArrowRight" size=${12} /><span>${cur.valueLabel}</span></span>
                <span>${cur.rows.length} 行</span>
                <span>${MAPT_MISSING[cur.missing].short}${cur.missing === 'default' ? `「${cur.defaultValue}」` : ''}</span>
                <span>${refWorkflows ? `被 ${refWorkflows} 个工作流引用` : '没有被引用'}</span>
                <span>${personName(cur.updatedBy)} 更新于 ${fmt.relative(cur.updatedAt)}</span>
              </div>
            </div>
            <${Button} icon="Download" onClick=${exportCsv}>导出 CSV<//>
            ${canEdit && html`<${Button} icon="Upload" onClick=${() => setModal({ type: 'import' })}>导入 CSV<//>`}
            ${canEdit && html`<${MoreMenu} size="md" items=${[
              { key: 'edit', label: '编辑名称和描述', icon: 'PenLine', onClick: () => setModal({ type: 'table', table: cur }) },
              { divider: true },
              { key: 'delete', label: '删除映射表', icon: 'Trash2', danger: true, desc: refs.length ? '被引用时不能删除' : '', onClick: removeTable },
            ]} />`}
          </div>
          <${Tabs} className="mapt-tabs" value=${tab} onChange=${setTab} items=${[
            { value: 'rows', label: '对照数据', count: cur.rows.length },
            { value: 'missing', label: '找不到对应值时' },
            { value: 'refs', label: '被引用', count: refs.length },
          ]} />
          ${tab === 'rows' && html`<${Fragment}>
            <div className="toolbar mapt-toolbar">
              <${SearchInput} value=${q} onChange=${setQ} placeholder=${`搜索${cur.keyLabel}或${cur.valueLabel}`} />
              <span className="text-xs muted">键区分大小写，前后的空格会被去掉</span>
              <span className="spacer" />
              <${IntegDisabledTip} tip=${viewerTip}><${Button} icon="Plus" disabled=${!canEdit || Boolean(edit && edit.index === 'new')} onClick=${startAdd}>添加一行<//><//>
            </div>
            <div className="table-wrap mapt-rows">
              <table className="table is-dense mapt-table">
                <thead><tr>
                  <th style=${{ width: 56 }}>#</th>
                  <th>${cur.keyLabel}</th>
                  <th>${cur.valueLabel}</th>
                  <th style=${{ width: 84 }}>${canEdit ? '操作' : ''}</th>
                </tr></thead>
                <tbody>
                  ${edit && edit.index === 'new' && editorRow('new', '新')}
                  ${shown.map((r) => (edit && edit.index === r.i
                    ? editorRow(`e-${r.i}`, r.i + 1)
                    : html`<tr key=${r.k}>
                      <td className="muted">${r.i + 1}</td>
                      <td><span className="mono ellipsis mapt-cell" title=${r.k}>${r.k}</span></td>
                      <td><span className="mono ellipsis mapt-cell" title=${r.v}>${r.v || html`<span className="muted">（空）</span>`}</span></td>
                      <td>${canEdit && html`<span className="row-4">
                        <${IconButton} icon="PenLine" size="sm" title="编辑" disabled=${Boolean(edit)} onClick=${() => startEdit(r.i)} />
                        <${IconButton} icon="Trash2" size="sm" title="删除" disabled=${Boolean(edit)} onClick=${() => removeRow(r.i)} />
                      </span>`}</td>
                    </tr>`))}
                </tbody>
              </table>
              ${edit && edit.error && html`<div className="mapt-edit-error" role="alert"><${Icon} name="CircleAlert" size=${14} />${edit.error.text}</div>`}
              ${shown.length === 0 && !(edit && edit.index === 'new') && html`<${Empty}
                size="sm"
                icon=${ql ? 'SearchX' : 'Table2'}
                title=${ql ? '没有匹配的行' : '还没有对照数据'}
                description=${ql ? '' : canEdit ? '逐行添加，或者从 CSV 导入。' : ''}
                action=${!ql && canEdit && html`<${Fragment}><${Button} size="sm" icon="Plus" onClick=${startAdd}>添加一行<//><${Button} size="sm" icon="Upload" onClick=${() => setModal({ type: 'import' })}>导入 CSV<//><//>`}
              />`}
            </div>
          <//>`}
          ${tab === 'missing' && missingDraft && html`<div className="mapt-missing">
            <div className="text-xs muted mapt-missing-tip">工作流用「查映射表」转换时，如果「${cur.keyLabel}」在表里找不到，按下面的方式处理。</div>
            <${RadioCards}
              columns=${3}
              value=${missingDraft.missing}
              disabled=${!canEdit}
              onChange=${(v) => setDraft({ ...missingDraft, missing: v })}
              options=${Object.entries(MAPT_MISSING).map(([value, m]) => ({ value, label: m.label, desc: m.desc, icon: m.icon }))}
            />
            ${missingDraft.missing === 'default' && html`<div className="mapt-default">
              <${Field} label="默认值" required error=${canEdit ? defaultError : null}>
                <${Input} mono value=${missingDraft.defaultValue} readOnly=${!canEdit} invalid=${Boolean(canEdit && defaultError)} onChange=${(v) => setDraft({ ...missingDraft, defaultValue: v.slice(0, MAPT_VALUE_MAX) })} placeholder="例：Other" style=${{ maxWidth: 360 }} />
              <//>
            </div>`}
            <div className="mapt-example">
              <${Icon} name="Info" size=${14} />
              <span>例如查一个表里没有的${cur.keyLabel}：${exampleResult}</span>
            </div>
            ${canEdit && html`<div className="row mapt-missing-actions">
              <${Button} disabled=${!missingDirty} onClick=${() => setDraft(null)}>取消<//>
              <${Button} variant="primary" disabled=${!missingDirty || Boolean(defaultError)} onClick=${saveMissing}>保存<//>
            </div>`}
          </div>`}
          ${tab === 'refs' && (refs.length
            ? html`<${Fragment}>
              <div className="text-xs muted mapt-refs-tip">下面的节点在字段映射里用「查映射表」引用了「${cur.name}」。修改对照数据会立即影响这些工作流的下一次运行。</div>
              ${refsList}
            <//>`
            : html`<${Empty} size="sm" icon="Link2" title="没有工作流引用这个映射表" description="在节点的字段映射里添加「查映射表」转换并选择这个映射表后，引用会出现在这里。" />`)}
        </div>
      </div>`}
    ${modal && modal.type === 'table' && html`<${MapTableModal} open=${true} onClose=${() => setModal(null)} pid=${pid} table=${modal.table} onCreated=${pick} />`}
    ${modal && modal.type === 'import' && cur && html`<${MapImportModal} open=${true} onClose=${() => setModal(null)} table=${cur} pid=${pid} />`}
    ${modal && modal.type === 'blocked' && cur && html`<${Modal}
      open=${true}
      onClose=${() => setModal(null)}
      title=${`不能删除「${cur.name}」`}
      width=${560}
      footer=${html`<${Fragment}><${Button} onClick=${() => { setModal(null); setTab('refs'); }}>查看被引用<//><${Button} variant="primary" onClick=${() => setModal(null)}>知道了<//><//>`}
    >
      <div className="integ-gap"><${Alert} tone="warning">${refWorkflows} 个工作流的字段映射还在用这个映射表，删除后它们会运行失败。先在下面这些节点里去掉「查映射表」转换，再删除。<//></div>
      ${refsList}
    <//>`}
  </div></div>`;
}
