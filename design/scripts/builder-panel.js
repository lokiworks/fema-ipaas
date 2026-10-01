const FIELD_DEFS = {
  receiveType: { label: '接收者 ID 类型', type: 'select', options: ['用户', '群聊', '部门'], required: true, help: '决定「接收者」字段填写什么' },
  receiver: { label: '接收者', type: 'var', required: true, placeholder: '选择成员或群聊，或连线获取上游输出' },
  chat: { label: '群聊', type: 'var', required: true, placeholder: '选择群聊，或插入变量' },
  content: { label: '消息内容', type: 'var', multiline: true, required: true, placeholder: '输入消息内容，输入 $ 插入变量' },
  template: { label: '卡片模板', type: 'select', options: ['入职欢迎卡片', '入职开通结果卡片', '考勤日报卡片', '生日祝福卡片', '通用通知卡片'], required: true },
  lookup: { label: '查询方式', type: 'select', options: ['邮箱', '手机号', 'open_id', 'user_id'], required: true },
  email: { label: '邮箱', type: 'var', required: true },
  app: { label: '多维表格', type: 'select', options: ['IT 资产台账', '入职管理', '员工关怀', '合同台账', '报销台账'], required: true },
  table: { label: '数据表', type: 'select', options: ['资产', '待入职', '生日', '合同', '票据'], required: true },
  filter: { label: '筛选条件', type: 'var', placeholder: '例如：状态 = 在用' },
  fields: { label: '字段值', type: 'var', multiline: true, placeholder: '{ "字段名": "值" }', mode: 'object' },
  recordId: { label: '记录 ID', type: 'var', required: true },
  instanceCode: { label: '审批实例 Code', type: 'var', required: true },
  approval: { label: '审批定义', type: 'select', options: ['采购申请（新）', '大额报销复核', '请假', '用印申请'], required: true },
  user: { label: '发起人', type: 'var', required: true },
  project: { label: '项目', type: 'select', options: ['IT', 'PLAT', 'HR'], required: true },
  issueType: { label: '问题类型', type: 'select', options: ['任务', '缺陷', '硬件报修', '权限申请'], required: true },
  summary: { label: '概要', type: 'var', required: true },
  repo: { label: '仓库', type: 'select', options: ['xinghe/it-requests', 'xinghe/platform', 'xinghe/web'], required: true },
  title: { label: '标题', type: 'var', required: true },
  object: { label: '对象', type: 'select', options: ['User', 'Lead', 'Opportunity', 'Account'] },
  formId: { label: '表单 ID', type: 'select', options: ['PUR_PurchaseOrder', 'AP_Payable', 'GL_VOUCHER'], required: true },
  model: { label: '单据数据', type: 'var', multiline: true, required: true, mode: 'object' },
  number: { label: '单据编号', type: 'var', required: true },
  sql: { label: 'SQL 语句', type: 'code', required: true },
  list: { label: '列表数据', type: 'var', required: true, mode: 'array' },
  groupBy: { label: '分组字段', type: 'var' },
  aggregate: { label: '聚合方式', type: 'select', options: ['计数', '求和', '平均值', '最大值', '最小值'] },
  status: { label: '状态码', type: 'var', mode: 'number' },
  body: { label: '响应体', type: 'var', multiline: true, mode: 'object' },
  attendees: { label: '参与人', type: 'var' },
  bot: { label: '机器人', type: 'select', options: ['IT 助手', 'HR 小助手'], required: true },
  url: { label: '请求地址', type: 'var', required: true, placeholder: 'https://' },
  method: { label: '请求方法', type: 'select', options: ['GET', 'POST', 'DELETE', 'HEAD'], required: true },
  headers: { label: '请求头', type: 'var', multiline: true, placeholder: '{ "Authorization": "Bearer ..." }', mode: 'object' },
  employeeId: { label: '工号', type: 'var', required: true },
  employee: { label: '员工信息', type: 'var', multiline: true, required: true, mode: 'object', placeholder: '{ "工号": "", "姓名": "", "手机号": "", "部门": "" }' },
  key: { label: '键', type: 'var', required: true },
  value: { label: '值', type: 'var' },
  workflow: { label: '子流程', type: 'select', options: ['公共子流程：发送群通知'], required: true },
  payload: { label: '传入参数', type: 'var', multiline: true, mode: 'object' },
};

const OP_FIELDS = {
  'feishu.send_message': ['receiveType', 'receiver', 'content'],
  'feishu.send_card': ['receiveType', 'receiver', 'template'],
  'feishu.get_user': ['lookup', 'email'],
  'feishu.create_user': ['employee'],
  'feishu.update_user': ['employee'],
  'feishu.freeze_user': ['employeeId'],
  'feishu.get_approval': ['instanceCode'],
  'feishu.create_approval': ['approval', 'user', 'fields'],
  'feishu.bitable_create_record': ['app', 'table', 'fields'],
  'feishu.bitable_update_record': ['app', 'table', 'recordId', 'fields'],
  'feishu.bitable_search_record': ['app', 'table', 'filter'],
  'feishu.create_calendar_event': ['summary', 'attendees'],
  'feishu.approval_approved': ['approval'],
  'feishu.approval_created': ['approval'],
  'feishu.message_received': ['bot'],
  'beisen.get_employee': ['employeeId'],
  'jira.create_issue': ['project', 'issueType', 'summary'],
  'github.create_issue': ['repo', 'title'],
  'github.pr_merged': ['repo'],
  'kingdee.save_bill': ['formId', 'model'],
  'kingdee.submit_bill': ['formId', 'number'],
  'mysql.execute_query': ['sql'],
  'postgres.execute_query': ['sql'],
  'http.request': ['method', 'url', 'headers', 'body'],
  'webhook.respond': ['status', 'body'],
  'subflows.call': ['workflow', 'payload'],
  'subflows.respond': ['body'],
  'store.get': ['key'],
  'store.put': ['key', 'value'],
  'data-summarizer.aggregate': ['list', 'groupBy', 'aggregate'],
  'wecom.robot_message': ['content'],
  'wecom.send_app_message': ['receiver', 'content'],
  'dingtalk.robot_message': ['content'],
  'dingtalk.send_work_notice': ['receiver', 'content'],
  'slack.send_message': ['receiver', 'content'],
};

const OUTPUT_DESC = {
  message_id: '消息 ID', chat_id: '群 ID', create_time: '创建时间', user: '用户', open_id: '用户 open_id', name: '姓名', email: '邮箱',
  department: '部门', department_ids: '部门 ID 列表', status: '状态', employee_id: '工号', position: '岗位', manager: '直属上级', entry_date: '入职日期',
  instance_code: '审批实例 Code', approval_name: '审批名称', user_id: '发起人 ID', user_name: '发起人姓名', end_time: '结束时间', form: '表单',
  total: '总数', has_more: '是否还有更多项', items: '记录结果', record_id: '记录 ID', fields: '字段', record: '记录', key: '键', id: 'ID',
  number: '编号', html_url: '链接', state: '状态', rows: '行', rowCount: '行数', result: '结果', usage: '用量', headers: '请求头', body: '请求体',
  query: '查询参数', text: '消息文本', sender: '发送者', sender_name: '发送者姓名', Result: '返回结果', Number: '单据编号', Id: '单据内码',
  invoice_no: '发票号码', amount: '金额', seller: '销售方', date: '日期', category: '类别', confidence: '置信度', item: '当前项', index: '当前下标',
  context: '循环信息', completed: '已完成', failed: '失败数', message: '说明', fired_at: '触发时间', cron: 'Cron 表达式', triggered_by: '触发人',
  visitor: '访客姓名', company: '来访单位', host: '被访人', visit_time: '来访时间', chat: '群聊', title: '标题', content: '内容', branch: '命中分支',
  value: '值', found: '是否存在', ok: '是否成功', insertId: '自增 ID', affectedRows: '影响行数', totalSize: '总数', records: '记录',
  event_name: '事件', resource_name: '资源名称', resource_url: '资源链接', resource_running_log_url: '运行日志链接', error_message: '错误信息', occurred_at: '发生时间',
};

const VAR_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

const MODE_OPTIONS = [
  { value: 'string', label: '字符串', code: 'Aa' },
  { value: 'number', label: '数值', code: '123' },
  { value: 'object', label: '对象', code: '{ }' },
  { value: 'array', label: '数组', code: '[/]' },
  { value: 'expr', label: '表达式', code: 'Ex' },
];

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const MODEL_OPTIONS = {
  claude: [{ value: 'claude-sonnet-5', label: 'Claude Sonnet 5' }, { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }, { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' }],
  openai: [{ value: 'gpt-4.1', label: 'GPT-4.1' }, { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }],
  deepseek: [{ value: 'deepseek-chat', label: 'DeepSeek-V3' }, { value: 'deepseek-reasoner', label: 'DeepSeek-R1' }],
};

const STRATEGIES = [
  { value: 'stop', label: '终止' },
  { value: 'ignore', label: '忽略' },
  { value: 'branch', label: '添加分支' },
  { value: 'retry-stop', label: '重试后终止' },
  { value: 'retry-ignore', label: '重试后忽略' },
  { value: 'retry-branch', label: '重试后添加分支' },
];

const CRON_PRESETS = [
  { label: '工作日 9:00', value: '0 9 * * 1-5' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每 15 分钟', value: '*/15 * * * *' },
  { label: '每月 1 日 9:00', value: '0 9 1 * *' },
];

const FORM_FIELD_TYPES = ['单行文本', '多行文本', '数字', '日期时间', '成员', '附件'];

function customOp(node) {
  const c = resolveConnector(node.connector);
  if (!c || !(c.custom || c.mcp)) return null;
  return (node.kind === 'trigger' ? c.triggers : c.actions).find((x) => x.key === node.op) || null;
}

function fieldsFor(node) {
  const custom = customOp(node);
  if (custom) return (custom.params || []).map((p) => p.key);
  const base = OP_FIELDS[`${node.connector}.${node.op}`] || [];
  const extra = node.kind === 'action' ? Object.keys(node.config || {}).filter((k) => !base.includes(k) && FIELD_DEFS[k]) : [];
  return [...base, ...extra];
}

function fieldDef(node, key) {
  const custom = customOp(node);
  const p = custom && (custom.params || []).find((x) => x.key === key);
  if (p) {
    if (p.control === '下拉单选') return { label: p.label, type: 'select', options: p.options || [], required: p.required };
    if (p.control === '开关') return { label: p.label, type: 'switch', required: false };
    if (p.control === '代码') return { label: p.label, type: 'var', multiline: true, mode: 'object', required: p.required };
    return { label: p.label, type: 'var', required: p.required, mode: p.type === 'number' ? 'number' : undefined };
  }
  return FIELD_DEFS[key] || { label: key, type: 'var' };
}

function resolveSample(wf, expr, depth = 0) {
  const m = /^\{\{\s*([^.\s}[\]]+)((?:\.[^.}\s]+)*)\s*\}\}$/.exec(String(expr || '').trim());
  if (!m || depth > 4) return null;
  const src = findInWorkflow(wf, m[1]);
  if (!src) return null;
  return m[2].split('.').filter(Boolean).reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), outputOf(src, wf, depth + 1));
}

function outputOf(node, wf, depth = 0) {
  if (node.kind === 'loop') {
    if (node.variant === 'while') return { index: 0, context: { total: 2, completed: 2, failed: 0 } };
    const list = resolveSample(wf, node.config.items, depth);
    const item = Array.isArray(list) && list.length ? list[0] : SAMPLE_OUTPUT.loop.item;
    return { item, index: 0, context: { total: Array.isArray(list) ? list.length : 3, completed: 0, failed: 0 } };
  }
  return nodeOutput(node);
}

function treeMatches(value, shown, f) {
  if (!f) return true;
  if (shown.toLowerCase().includes(f)) return true;
  if (!value || typeof value !== 'object') return false;
  const entries = Array.isArray(value) ? value.slice(0, 1).map((v) => [`${shown}[0]`, v]) : Object.entries(value).map(([k, v]) => [`${shown}.${k}`, v]);
  return entries.some(([p, v]) => treeMatches(v, p, f));
}

function renderVarText(text, ctx, onChip) {
  if (text === undefined || text === null || text === '') return null;
  const str = String(text);
  const parts = [];
  let last = 0;
  str.replace(VAR_RE, (m, expr, idx) => {
    if (idx > last) parts.push(str.slice(last, idx));
    const [head, ...rest] = expr.split('.');
    const node = ctx.nodesById[head];
    const isEnv = head === 'config';
    const isLoop = head === 'loop';
    const isItem = head === 'item' && Boolean(ctx.itemScope);
    const invalid = isItem ? false : isLoop ? !ctx.inLoop : !isEnv && !(ctx.upstreamIds && ctx.upstreamIds.has(head));
    const label = isItem ? ctx.itemScope.label : isLoop ? '循环变量' : isEnv ? '项目配置' : node ? node.name : '已失效的引用';
    const chipProps = onChip ? { role: 'button', tabIndex: 0, onClick: (e) => { e.stopPropagation(); onChip({ token: m, start: idx, end: idx + m.length, anchor: e.currentTarget }); }, onFocus: (e) => e.stopPropagation(), onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onChip({ token: m, start: idx, end: idx + m.length, anchor: e.currentTarget }); } } } : {};
    parts.push(html`<span key=${idx} ...${chipProps} className=${cx('var-chip', isEnv && 'is-env', invalid && 'is-invalid', onChip && 'is-clickable')} title=${invalid ? '引用的节点已删除或不在上游，请重新选择' : `{{${expr}}}`}>
      ${node && !invalid ? html`<${NodeIcon} node=${node} size=${14} />` : html`<${Icon} name=${invalid ? 'Unlink' : isItem ? 'ListTree' : isLoop ? 'Repeat' : 'SlidersHorizontal'} size=${12} />`}
      ${label}${rest.length > 0 && html`<span className="var-chip-path">.${rest.join('.')}</span>`}
    </span>`);
    last = idx + m.length;
    return m;
  });
  if (last < str.length) parts.push(str.slice(last));
  return parts;
}

function VarInput({ value, onChange, placeholder, multiline, ctx, invalid, readOnly }) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef(null);
  const btnRef = useRef(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [chip, setChip] = useState(null);
  const pickRef = useRef(false);
  pickRef.current = pickOpen;
  useEffect(() => { if (editing && taRef.current) taRef.current.focus(); }, [editing]);
  const text = value === undefined || value === null ? '' : String(value);
  const insert = (token) => {
    const ta = taRef.current;
    if (ta && editing) {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const before = text.slice(0, s).replace(/(\{\{|\$)$/, '');
      onChange(before + token + text.slice(e));
    } else {
      onChange(text + token);
    }
    setPickOpen(false);
  };
  if (readOnly) {
    return html`<div className=${cx('var-input-box', 'is-readonly', multiline && 'is-multiline')}>${text ? renderVarText(text, ctx) : html`<span className="placeholder">未填写</span>`}</div>`;
  }
  return html`<div className="var-input">
    ${editing
      ? html`<textarea
        ref=${taRef}
        value=${text}
        rows=${multiline ? 4 : 1}
        placeholder=${placeholder}
        onChange=${(e) => {
          const v = e.target.value;
          onChange(v);
          if (v.endsWith('{{') || v.endsWith('$')) setPickOpen(true);
        }}
        onKeyDown=${(e) => { if (e.key === 'Escape' && !pickRef.current) { e.preventDefault(); e.stopPropagation(); setEditing(false); } }}
        onBlur=${() => setTimeout(() => { if (!pickRef.current) setEditing(false); }, 150)}
      />`
      : html`<div
        className=${cx('var-input-box', multiline && 'is-multiline', invalid && 'is-invalid')}
        role="textbox"
        tabIndex=${0}
        onClick=${() => setEditing(true)}
        onFocus=${() => setEditing(true)}
      >
        ${text ? renderVarText(text, ctx, setChip) : html`<span className="placeholder">${placeholder || '请输入，输入 $ 插入变量'}</span>`}
      </div>`}
    <${Floating} anchorRef=${{ current: chip && chip.anchor }} open=${Boolean(chip)} onClose=${() => setChip(null)} placement="bottom-start" className="popover" style=${{ width: 180 }}>
      ${chip && html`<${Menu} close=${() => setChip(null)} items=${[
        { key: 'copy', label: '复制引用', icon: 'Copy', onClick: () => { if (copyText(chip.token)) toast.success('已复制引用'); else toast.error('复制失败，请手动选中复制'); } },
        { key: 'edit', label: '编辑文本', icon: 'PenLine', onClick: () => setEditing(true) },
        { key: 'del', label: '删除引用', icon: 'Trash2', danger: true, onClick: () => onChange(text.slice(0, chip.start) + text.slice(chip.end)) },
      ]} />`}
    <//>
    <span ref=${btnRef} className="var-input-btn">
      <${IconButton} icon="Braces" size="xs" title="插入变量" onClick=${() => setPickOpen(!pickOpen)} active=${pickOpen} />
    </span>
    <${Floating} anchorRef=${btnRef} open=${pickOpen} onClose=${() => setPickOpen(false)} placement="bottom-end" className="popover var-pop">
      <${VarPicker} ctx=${ctx} onPick=${(path) => insert(`{{${path}}}`)} />
    <//>
  </div>`;
}

function typeOf(v) {
  if (Array.isArray(v)) return { code: '[/]', label: '数组' };
  if (v === null) return { code: 'null', label: '空' };
  if (typeof v === 'object') return { code: '{ }', label: '对象' };
  if (typeof v === 'number') return { code: '123', label: '数字' };
  if (typeof v === 'boolean') return { code: 'T/F', label: '布尔' };
  return { code: 'Aa', label: '文本' };
}

function OutputTree({ value, prefix, shown: shownProp, depth = 0, onPick, filter, defaultOpen = 1 }) {
  if (!value || typeof value !== 'object') return null;
  const shown = shownProp ?? prefix ?? '';
  const isArr = Array.isArray(value);
  const entries = isArr ? value.slice(0, 1).map((v) => ['[0]', v, 0]) : Object.entries(value).map(([k, v]) => [k, v, k]);
  return entries.map(([label, v, k]) => html`<${OutputTreeRow}
    key=${label}
    label=${label}
    v=${v}
    path=${isArr ? `${prefix}[0]` : prefix ? `${prefix}.${k}` : String(k)}
    shown=${isArr ? `${shown}[0]` : shown ? `${shown}.${k}` : String(k)}
    depth=${depth}
    onPick=${onPick}
    filter=${filter}
    defaultOpen=${defaultOpen}
  />`);
}

function OutputTreeRow({ label, v, path, shown, depth, onPick, filter, defaultOpen }) {
  const [open, setOpen] = useState(depth < defaultOpen);
  const t = typeOf(v);
  const isBranch = Boolean(v) && typeof v === 'object';
  const desc = OUTPUT_DESC[label];
  const f = (filter || '').toLowerCase();
  if (f && !treeMatches(v, shown, f) && !(desc && desc.includes(filter))) return null;
  const expanded = open || Boolean(f);
  return html`<${Fragment}>
    <button
      type="button"
      className=${cx('otree-row', !onPick && 'is-static')}
      style=${{ paddingLeft: 6 + depth * 16 }}
      title=${shown}
      onClick=${() => (onPick ? onPick(path) : isBranch && setOpen(!open))}
    >
      ${isBranch
        ? html`<span className="otree-caret" onClick=${(e) => { e.stopPropagation(); setOpen(!open); }}><${Icon} name=${expanded ? 'ChevronDown' : 'ChevronRight'} size=${12} /></span>`
        : html`<span style=${{ width: 12 }} />`}
      <span className="otree-type" title=${t.label}>${t.code}</span>
      <span className="otree-key">${label}</span>
      ${desc && html`<span className="otree-desc">(${desc})</span>`}
      <span className="otree-sample">${isBranch ? '' : String(v)}</span>
    </button>
    ${isBranch && expanded && html`<${OutputTree} value=${v} prefix=${path} shown=${shown} depth=${depth + 1} onPick=${onPick} filter=${filter} defaultOpen=${defaultOpen} />`}
  <//>`;
}

function VarPicker({ ctx, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set(ctx.upstream.slice(-1).map((n) => n.id)));
  const state = Store.get();
  const ql = q.trim().toLowerCase();
  const vars = state.variables.filter((v) => v.projectId === ctx.wf.projectId && (!ql || `${v.key}${v.description}`.toLowerCase().includes(ql)));
  const loop = ctx.loops[ctx.loops.length - 1];
  const loopOut = loop ? outputOf(loop, ctx.wf) : null;
  const loopVars = loopOut ? { item: loopOut.item, index: 0 } : null;
  const nodes = ctx.upstream.map((node) => {
    const out = outputOf(node, ctx.wf);
    const nameHit = ql && `${node.name} ${ctx.refs[node.id]}`.toLowerCase().includes(ql);
    return { node, out, nameHit, visible: !ql || nameHit || treeMatches(out, ctx.refs[node.id], ql) };
  }).filter((x) => x.visible);
  const showLoop = loop && (!ql || '循环变量 loop'.includes(ql) || treeMatches(loopVars, 'loop', ql));
  const itemVars = ctx.itemScope && ctx.itemSample && typeof ctx.itemSample === 'object' ? ctx.itemSample : null;
  const showItem = itemVars && (!ql || '当前项 item'.includes(ql) || treeMatches(itemVars, 'item', ql));
  return html`<${Fragment}>
    <div className="var-pop-head"><${Input} icon="Search" size="sm" placeholder="搜索节点或字段，如 feishu-1.items" value=${q} onChange=${setQ} autoFocus /></div>
    <div className="var-pop-body">
      ${showItem && html`<${Fragment}>
        <div className="menu-group">${ctx.itemScope.label} · 列表中的每一项</div>
        <${OutputTree} value=${itemVars} prefix="item" shown="item" depth=${0} onPick=${onPick} filter=${'当前项 item'.includes(ql) ? '' : ql} defaultOpen=${1} />
      <//>`}
      ${showLoop && html`<${Fragment}>
        <div className="menu-group">循环变量 · ${loop.name}</div>
        <${OutputTree} value=${loopVars} prefix="loop" shown="loop" depth=${0} onPick=${onPick} filter=${'循环变量 loop'.includes(ql) ? '' : ql} defaultOpen=${1} />
      <//>`}
      <div className="menu-group">上游节点</div>
      ${nodes.map(({ node, out, nameHit }) => {
        const isOpen = Boolean(ql) || open.has(node.id);
        return html`<div key=${node.id}>
          <button type="button" className="var-node-head" onClick=${() => setOpen((s) => { const n2 = new Set(s); if (n2.has(node.id)) n2.delete(node.id); else n2.add(node.id); return n2; })}>
            <${Icon} name=${isOpen ? 'ChevronDown' : 'ChevronRight'} size=${12} className="muted" />
            <${NodeIcon} node=${node} size=${20} />
            <span className="grow ellipsis">${node.name}</span>
            <span className="text-xs muted mono">${ctx.refs[node.id]}</span>
          </button>
          ${isOpen && html`<${OutputTree} value=${out} prefix=${node.id} shown=${ctx.refs[node.id]} depth=${1} onPick=${onPick} filter=${nameHit ? '' : ql} />`}
        </div>`;
      })}
      ${nodes.length === 0 && html`<div className="text-xs muted" style=${{ padding: 8 }}>${ql ? '没有匹配的上游节点' : '没有可引用的上游节点'}</div>`}
      ${vars.length > 0 && html`<div className="menu-group">项目配置</div>`}
      ${vars.map((v) => html`<button key=${v.id} type="button" className="otree-row" onClick=${() => onPick(`config.${v.key}`)}>
        <span className="otree-type">${v.type === 'number' ? '123' : v.type === 'boolean' ? 'T/F' : v.type === 'object' ? '{ }' : 'Aa'}</span>
        <span className="otree-key">${v.key}</span>
        <span className="otree-desc">(${v.description})</span>
      </button>`)}
    </div>
  <//>`;
}

function ConnectionPanel({ node, onChange, state, readOnly, wf, onApplySame }) {
  const conns = usableConnections(state, { connector: node.connector, projectId: wf.projectId });
  const [creating, setCreating] = useState(false);
  const current = node.connectionId ? state.connections.find((x) => x.id === node.connectionId) : null;
  const problem = node.connectionId ? connectionIssue(state, node.connectionId, wf.projectId) : null;
  const same = allNodes(wf).filter((x) => x.id !== node.id && x.connector === node.connector && x.connectionId !== node.connectionId);
  const options = [
    ...conns.map((x) => ({ value: x.id, label: x.name, desc: `${x.account} · ${CONN_STATUS[x.status].label}`, iconNode: html`<${ConnectorIcon} id=${x.connector} size=${18} />` })),
    ...(current && !conns.includes(current) ? [{ value: current.id, label: current.name, desc: '当前不可用', disabled: true, iconNode: html`<${ConnectorIcon} id=${current.connector} size=${18} />` }] : []),
    ...(node.connectionId && !current ? [{ value: node.connectionId, label: '已删除的连接', disabled: true }] : []),
  ];
  const error = readOnly ? null : !node.connectionId ? '连接是必填项' : problem && problem.level === 'error' ? problem.text : null;
  return html`<${Fragment}>
    <div className="param">
      <div className="param-head"><span className="param-name">连接</span><span className="param-req">*</span>
        <${Tooltip} content="节点用哪个账号调用该应用。连接在「连接」页面统一管理，只能选择分享给你、且在本项目可用的连接。"><${Icon} name="Info" size=${13} className="muted" /><//>
      </div>
      <${Select}
        value=${node.connectionId}
        disabled=${readOnly}
        onChange=${(v) => onChange({ connectionId: v })}
        placeholder=${conns.length ? '选择连接' : '暂无可用连接'}
        invalid=${Boolean(error)}
        options=${options}
        footer=${!readOnly && html`<button type="button" className="menu-item" onClick=${() => setCreating(true)}><${Icon} name="Plus" size=${16} />新建连接</button>`}
      />
      ${error && html`<div className="param-error">${error}</div>`}
    </div>
    ${current && html`<div className="card" style=${{ padding: 12, marginBottom: 12 }}>
      <div className="row">
        <${ConnectorIcon} id=${current.connector} size=${28} />
        <div className="grow" style=${{ minWidth: 0 }}>
          <div className="ellipsis" style=${{ fontWeight: 500 }}>${current.name}</div>
          <div className="text-xs muted ellipsis">${AUTH_LABEL[current.authType]} · ${current.account}</div>
        </div>
        <${Tag} tone=${CONN_STATUS[current.status].tone} dot>${CONN_STATUS[current.status].label}<//>
      </div>
      ${current.status !== 'active' && html`<div style=${{ marginTop: 10 }}><${Alert} tone="warning" title=${CONN_STATUS[current.status].reason} action=${html`<${Button} size="xs" onClick=${() => navigate(`/connections?id=${current.id}`)}>去授权<//>`}>${current.error}<//></div>`}
      ${current.connector === 'feishu' && FEISHU_SCOPE_OPS[node.op] && html`<div style=${{ marginTop: 10 }}><${Alert} tone="warning" title="应用缺少权限" action=${!readOnly && html`<${Button} size="xs" onClick=${() => toast.success('已向飞书应用管理员提交权限申请')}>申请开通<//>`}>当前操作需要飞书应用开通「${FEISHU_SCOPE_OPS[node.op]}」权限。<//></div>`}
    </div>`}
    ${current && same.length > 0 && !readOnly && html`<${Button} size="sm" icon="Replace" onClick=${() => onApplySame(same)}>让其他 ${same.length} 个${resolveConnector(node.connector) ? resolveConnector(node.connector).name : ''}节点也使用此连接<//>`}
    <${NewConnectionModal} open=${creating} onClose=${() => setCreating(false)} presetConnector=${node.connector} presetProject=${wf.projectId} onCreated=${(conn) => onChange({ connectionId: conn.id })} />
  <//>`;
}

function Param({ name, required, help, children, error, mode, onModeChange, linkable, onLink, linked, readOnly, headExtra }) {
  return html`<div className="param">
    <div className="param-head">
      ${linkable && html`<${Tooltip} content=${readOnly ? '' : '按住拖到画布中的上游节点，获取它的出参'}><span
        className=${cx('param-link', linked && 'is-linked', readOnly && 'is-readonly')}
        onMouseDown=${readOnly ? undefined : onLink}
      /><//>`}
      <span className="param-name">${name}</span>${required && html`<span className="param-req">*</span>`}
      ${help && html`<${Tooltip} content=${help}><${Icon} name="Info" size=${13} className="muted" /><//>`}
      ${headExtra && html`<span style=${{ marginLeft: 'auto' }}>${headExtra}</span>`}
      ${mode && !headExtra && html`<span style=${{ marginLeft: 'auto' }}>${readOnly
        ? html`<span className="param-mode is-static">${(MODE_OPTIONS.find((m) => m.value === mode) || MODE_OPTIONS[0]).code}</span>`
        : html`<${Dropdown}
          width=${140}
          trigger=${html`<button type="button" className="param-mode" aria-label="取值方式">${(MODE_OPTIONS.find((m) => m.value === mode) || MODE_OPTIONS[0]).code}<${Icon} name="ChevronDown" size=${11} /></button>`}
          items=${MODE_OPTIONS.map((m) => ({ label: `${m.code}  ${m.label}`, active: m.value === mode, onClick: () => onModeChange && onModeChange(m.value) }))}
        />`}</span>`}
    </div>
    ${children}
    ${error && html`<div className="param-error">${error}</div>`}
  </div>`;
}

function ConfigField({ fkey, node, onConfig, ctx }) {
  const def = fieldDef(node, fkey);
  const value = node.config[fkey];
  const set = (v) => onConfig({ [fkey]: v });
  const invalid = def.required && isBlank(value) && ctx.showErrors;
  const modes = node.config.__modes || {};
  const isVar = def.type === 'var';
  if (isVar && (def.mode === 'object' || isMapping(value))) return html`<${ObjectField} fkey=${fkey} node=${node} onConfig=${onConfig} ctx=${ctx} def=${def} />`;
  const mode = isVar ? (modes[fkey] || def.mode || 'string') : null;
  let control;
  if (def.type === 'select') {
    control = html`<${Select} value=${value} onChange=${set} disabled=${ctx.readOnly} options=${def.options.map((o) => ({ value: o, label: o }))} invalid=${invalid} searchable=${def.options.length > 6} />`;
  } else if (def.type === 'switch') {
    control = html`<${Switch} checked=${Boolean(value)} disabled=${ctx.readOnly} onChange=${set} />`;
  } else if (def.type === 'code') {
    control = html`<${CodeEditor} value=${value || ''} onChange=${set} rows=${6} light readOnly=${ctx.readOnly} label=${def.label} />`;
  } else if (mode === 'expr') {
    control = html`<${CodeEditor} value=${value || ''} onChange=${set} rows=${3} light readOnly=${ctx.readOnly} label=${def.label} placeholderHint="表达式：可引用上游数据，例如 {{feishu-1.items}}" />`;
  } else {
    control = html`<${VarInput} value=${value} onChange=${set} placeholder=${def.placeholder} multiline=${def.multiline} ctx=${ctx} invalid=${invalid} readOnly=${ctx.readOnly} />`;
  }
  return html`<${Param}
    name=${def.label}
    required=${def.required}
    help=${def.help}
    error=${invalid ? `${def.label}是必填项` : null}
    mode=${mode}
    onModeChange=${(m) => onConfig({ __modes: { ...modes, [fkey]: m } })}
    linkable=${isVar}
    linked=${typeof value === 'string' && value.includes('{{')}
    readOnly=${ctx.readOnly}
    onLink=${(e) => ctx.startLink(e, (path) => set(`{{${path}}}`))}
  >${control}<//>`;
}

function CodeEditor({ value, onChange, rows = 12, light, readOnly, tools, placeholderHint, label }) {
  const text = value || '';
  const lines = Math.max(rows, text.split('\n').length);
  return html`<div className=${cx('code-editor', light && 'is-light', readOnly && 'is-readonly')}>
    ${tools && html`<div className="code-editor-tools">${tools}</div>`}
    <div className="code-gutter" aria-hidden="true">${Array.from({ length: lines }, (_, i) => html`<div key=${i}>${i + 1}</div>`)}</div>
    <textarea
      spellCheck=${false}
      value=${text}
      rows=${lines}
      readOnly=${readOnly}
      aria-label=${label || '代码'}
      placeholder=${placeholderHint}
      onChange=${(e) => onChange && onChange(e.target.value)}
      onKeyDown=${(e) => {
        if (e.key === 'Tab' && !readOnly && onChange) {
          e.preventDefault();
          const t = e.target;
          const s = t.selectionStart;
          onChange(`${text.slice(0, s)}  ${text.slice(t.selectionEnd)}`);
          requestAnimationFrame(() => { t.selectionStart = s + 2; t.selectionEnd = s + 2; });
        }
      }}
    />
  </div>`;
}

function isWorkday(d) {
  return d.getDay() !== 0 && d.getDay() !== 6;
}

function edgeWorkday(y, m, fromEnd) {
  const last = new Date(y, m + 1, 0).getDate();
  const days = Array.from({ length: 7 }, (_, i) => (fromEnd ? last - i : i + 1));
  return days.find((day) => isWorkday(new Date(y, m, day)));
}

function matchesDay(d, cfg, mode) {
  if (cfg.skipWeekend && !isWorkday(d)) return false;
  if (mode === '按周触发') return (cfg.weekdays || []).includes(WEEK[d.getDay()]);
  if (mode === '按月触发') {
    const y = d.getFullYear();
    const m = d.getMonth();
    const sel = cfg.monthDay || '每月第一天';
    if (sel === '每月第一天') return d.getDate() === 1;
    if (sel === '每月最后一天') return d.getDate() === new Date(y, m + 1, 0).getDate();
    if (sel === '每月第一个工作日') return d.getDate() === edgeWorkday(y, m, false);
    if (sel === '每月最后一个工作日') return d.getDate() === edgeWorkday(y, m, true);
    return d.getDate() === Number(cfg.day || 1);
  }
  return true;
}

function nextScheduleRuns(cfg, count = 5) {
  const mode = cfg.mode || '每天触发';
  const now = new Date();
  if (mode === '仅触发一次') {
    const d = cfg.once ? new Date(cfg.once) : null;
    return d && !Number.isNaN(d.getTime()) && d > now ? [d] : [];
  }
  if (mode === '间隔触发') {
    const step = (Number(cfg.interval) || 0) * (cfg.intervalUnit === '小时' ? HOUR : MIN);
    if (!(step > 0)) return [];
    const base = Math.ceil(now.getTime() / MIN) * MIN + (cfg.firstRun === 'later' ? step : 0);
    return Array.from({ length: count }, (_, i) => new Date(base + i * step));
  }
  if (!cfg.at) return [];
  const [hh, mm] = cfg.at.split(':').map(Number);
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  const res = [];
  for (let guard = 0; guard < 800 && res.length < count; guard++) {
    if (d > now && matchesDay(d, cfg, mode)) res.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return res;
}

function SchedulePreview({ runs, note }) {
  return html`<div className="cron-preview">
    <div className="muted">接下来 ${runs.length > 1 ? `${runs.length} 次` : ''}触发时间</div>
    ${runs.length
      ? html`<ul>${runs.map((d) => html`<li key=${+d}>${fmt.dateTime(d).slice(0, 16)} ${WEEK[d.getDay()]}</li>`)}</ul>`
      : html`<div className="text-xs muted" style=${{ marginTop: 6 }}>当前配置没有可预览的触发时间</div>`}
    ${note && html`<div className="text-xs muted" style=${{ marginTop: 6 }}>${note}</div>`}
  </div>`;
}

function TimezoneField({ cfg, onConfig, readOnly }) {
  return html`<${Field} label="时区">
    <${Select} disabled=${readOnly} value=${cfg.timezone || 'Asia/Shanghai'} onChange=${(v) => onConfig({ timezone: v })} options=${[{ value: 'Asia/Shanghai', label: '(GMT+08:00) 中国标准时间 - 北京' }, { value: 'Asia/Tokyo', label: '(GMT+09:00) 东京' }, { value: 'UTC', label: '(GMT+00:00) 协调世界时' }]} />
  <//>`;
}

function ValidityField({ cfg, onConfig, readOnly }) {
  return html`<${Field} label="触发器生效期" help="超过生效期后定时任务不再触发，避免遗忘的任务长期运行">
    <${RadioGroup} disabled=${readOnly} value=${cfg.validity || 'default'} onChange=${(v) => onConfig({ validity: v })} options=${[{ value: 'default', label: '发布后两年' }, { value: 'custom', label: '自定义' }]} />
    ${cfg.validity === 'custom' && html`<div className="row" style=${{ marginTop: 8 }}>
      <${Input} type="date" readOnly=${readOnly} value=${cfg.validFrom || ''} onChange=${(v) => onConfig({ validFrom: v })} />
      <span className="muted">至</span>
      <${Input} type="date" readOnly=${readOnly} value=${cfg.validTo || ''} onChange=${(v) => onConfig({ validTo: v })} invalid=${cfg.validFrom && cfg.validTo && cfg.validTo < cfg.validFrom} />
    </div>`}
  <//>`;
}

function ScheduleSettings({ node, onConfig, readOnly }) {
  const cfg = node.config;
  if (node.op === 'cron') return html`<${CronSettings} node=${node} onConfig=${onConfig} readOnly=${readOnly} />`;
  const mode = cfg.mode || '每天触发';
  const weekdays = cfg.weekdays || [];
  const runs = nextScheduleRuns(cfg);
  return html`<div>
    <${Field} label="触发方式" required>
      <${Select} disabled=${readOnly} value=${mode} onChange=${(v) => onConfig({ mode: v, ...(v === '按周触发' && !weekdays.length ? { weekdays: ['周一'] } : {}) })} options=${['每天触发', '按周触发', '按月触发', '仅触发一次', '间隔触发'].map((x) => ({ value: x, label: x }))} />
    <//>
    ${mode === '按周触发' && html`<${Field} label="每周" required error=${!readOnly && !weekdays.length ? '至少选择一天' : null}>
      <div className="row" style=${{ flexWrap: 'wrap', gap: 6 }}>${[...WEEK.slice(1), WEEK[0]].map((w) => {
        const on = weekdays.includes(w);
        return html`<button key=${w} type="button" disabled=${readOnly} aria-pressed=${on} className=${cx('btn', 'btn-sm', on ? 'btn-soft' : 'btn-outline')} onClick=${() => onConfig({ weekdays: on ? weekdays.filter((x) => x !== w) : [...weekdays, w] })}>${w}</button>`;
      })}</div>
    <//>`}
    ${mode === '按月触发' && html`<${Field} label="每月触发日期" required>
      <${Select} disabled=${readOnly} value=${cfg.monthDay || '每月第一天'} onChange=${(v) => onConfig({ monthDay: v })} options=${['指定日期', '每月第一天', '每月最后一天', '每月第一个工作日', '每月最后一个工作日'].map((x) => ({ value: x, label: x }))} />
      ${cfg.monthDay === '指定日期' && html`<div style=${{ marginTop: 8 }}><${Select} disabled=${readOnly} value=${Number(cfg.day || 1)} onChange=${(v) => onConfig({ day: v })} options=${Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1} 日` }))} /></div>`}
      ${cfg.monthDay === '指定日期' && Number(cfg.day) > 28 && html`<div className="field-hint">没有该日期的月份不会触发</div>`}
    <//>`}
    ${mode === '仅触发一次' && html`<${Field} label="触发时间" required error=${!readOnly && !cfg.once ? '触发时间是必填项' : null}>
      <${Input} type="datetime-local" readOnly=${readOnly} value=${cfg.once || ''} onChange=${(v) => onConfig({ once: v })} invalid=${!readOnly && !cfg.once} />
    <//>`}
    ${mode === '间隔触发' && html`<${Fragment}>
      <${Field} label="触发间隔" required error=${!readOnly && !(Number(cfg.interval) > 0) ? '触发间隔需大于 0' : null}>
        <div className="row"><span className="muted">每</span><${Input} readOnly=${readOnly} type="number" value=${cfg.interval ?? 30} onChange=${(v) => onConfig({ interval: v })} style=${{ width: 100 }} /><${Select} disabled=${readOnly} width=${100} value=${cfg.intervalUnit || '分钟'} onChange=${(v) => onConfig({ intervalUnit: v })} options=${['分钟', '小时'].map((x) => ({ value: x, label: x }))} /></div>
      <//>
      <${Field} label="首次触发">
        <${RadioGroup} disabled=${readOnly} direction="column" value=${cfg.firstRun || 'now'} onChange=${(v) => onConfig({ firstRun: v })} options=${[{ value: 'now', label: '发布后触发一次，随即按照间隔触发' }, { value: 'later', label: '发布后不触发，等待第一个间隔' }]} />
      <//>
    <//>`}
    ${!['仅触发一次', '间隔触发'].includes(mode) && html`<${Field} label="触发时间" required error=${!readOnly && !cfg.at ? '触发时间是必填项' : null}>
      <${Input} type="time" readOnly=${readOnly} value=${cfg.at ?? ''} onChange=${(v) => onConfig({ at: v })} style=${{ width: 160 }} invalid=${!readOnly && !cfg.at} />
    <//>`}
    <${TimezoneField} cfg=${cfg} onConfig=${onConfig} readOnly=${readOnly} />
    <${ValidityField} cfg=${cfg} onConfig=${onConfig} readOnly=${readOnly} />
    ${mode !== '仅触发一次' && html`<${Field} label="跳过">
      <div className="col" style=${{ gap: 8 }}>
        <${Checkbox} disabled=${readOnly} label="跳过法定节假日" checked=${cfg.skipHoliday} onChange=${(v) => onConfig({ skipHoliday: v })} />
        <${Checkbox} disabled=${readOnly} label="跳过休息日（周六、周日）" checked=${cfg.skipWeekend} onChange=${(v) => onConfig({ skipWeekend: v })} />
      </div>
    <//>`}
    <${SchedulePreview} runs=${runs} note=${cfg.skipHoliday ? '法定节假日以国务院公布的安排为准，预览中未排除。' : ''} />
  </div>`;
}

function CronSettings({ node, onConfig, readOnly }) {
  const cfg = node.config;
  const preview = cronPreview(cfg.cron);
  const error = readOnly ? null : isBlank(cfg.cron) ? 'Cron 表达式是必填项' : !preview.ok ? '格式不正确，需要 5 段：分 时 日 月 周' : null;
  return html`<div>
    <${Field} label="Cron 表达式" required error=${error} hint="5 段依次为 分 时 日 月 周，周取 0 ~ 6，0 表示周日">
      <${Input} mono readOnly=${readOnly} value=${cfg.cron || ''} onChange=${(v) => onConfig({ cron: v })} placeholder="0 9 * * 1-5" invalid=${Boolean(error)} />
    <//>
    ${!readOnly && html`<${Field} label="常用">
      <div className="row" style=${{ flexWrap: 'wrap', gap: 6 }}>${CRON_PRESETS.map((p) => html`<button key=${p.value} type="button" className=${cx('btn', 'btn-sm', cfg.cron === p.value ? 'btn-soft' : 'btn-outline')} onClick=${() => onConfig({ cron: p.value })}>${p.label}</button>`)}</div>
    <//>`}
    <${TimezoneField} cfg=${cfg} onConfig=${onConfig} readOnly=${readOnly} />
    <${ValidityField} cfg=${cfg} onConfig=${onConfig} readOnly=${readOnly} />
    <${SchedulePreview} runs=${preview.runs} />
  </div>`;
}

const DEDUPE_WINDOWS = [{ value: '1h', label: '1 小时' }, { value: '24h', label: '24 小时' }, { value: '7d', label: '7 天' }, { value: '30d', label: '30 天' }];

function RunSettings({ node, wf, state, onChange, ctx, readOnly }) {
  const rs = node.runSettings || {};
  const dedupe = { enabled: false, key: '', window: '7d', ...(rs.dedupe || {}) };
  const conc = { max: 0, orderKey: '', ...(rs.concurrency || {}) };
  const set = (patch) => onChange({ runSettings: { ...rs, ...patch } });
  const sample = outputOf(node, wf);
  const supportsDedupe = !['schedule', 'subflows', 'manual-trigger', 'alert'].includes(node.connector);
  const hints = mapCandidates(sample, node.id, node.name).filter((c) => /(^id$|_id$|userid$|_code$|_no$|number$)/i.test(c.key) && ['string', 'number'].includes(typeof c.sample));
  const keyRefs = collectRefs(dedupe.key || '');
  const keyError = readOnly || !dedupe.enabled ? null : isBlank(dedupe.key) ? '开启去重需要设置去重键' : keyRefs.some((r) => r.head !== node.id) ? '去重键只能引用触发器的出参' : null;
  const keyPreview = dedupe.key && !keyError ? resolveMapSource(dedupe.key, (head) => (head === node.id ? sample : undefined)) : undefined;
  const since = Date.now() - 7 * DAY;
  const deduped = state.runs.filter((r) => r.workflowId === wf.id && r.status === 'deduped' && r.startedAt >= since).length;
  const triggerCtx = { ...ctx, upstream: [node], upstreamIds: new Set([node.id]), loops: [], inLoop: false };
  return html`<${Fragment}>
    ${supportsDedupe && html`<div className="panel-section run-set">
      <div className="run-set-head">
        <${Icon} name="ShieldCheck" size=${16} className="muted" />
        <b className="grow">幂等去重</b>
        <${Switch} checked=${dedupe.enabled} disabled=${readOnly} onChange=${(v) => set({ dedupe: { ...dedupe, enabled: v, key: v && !dedupe.key && hints[0] ? `{{${hints[0].path}}}` : dedupe.key } })} />
      </div>
      <div className="run-set-desc">上游可能重复推送同一个事件（网络重试、轮询窗口重叠）。开启后，去重键相同的事件在时间窗口内只处理一次，重复的事件记为「已去重」，能在运行日志里追溯到第一次处理它的运行。</div>
      ${dedupe.enabled && html`<${Fragment}>
        <${Field} label="去重键" required error=${keyError}>
          <${VarInput} value=${dedupe.key} onChange=${(v) => set({ dedupe: { ...dedupe, key: v } })} ctx=${triggerCtx} readOnly=${readOnly} invalid=${Boolean(keyError)} placeholder="插入能唯一标识事件的字段" />
          ${hints.length > 0 && !readOnly && html`<div className="run-set-hints">
            <span className="text-xs muted">推荐</span>
            ${hints.slice(0, 4).map((c) => html`<button key=${c.path} type="button" className=${cx('btn', 'btn-xs', dedupe.key === `{{${c.path}}}` ? 'btn-soft' : 'btn-outline')} onClick=${() => set({ dedupe: { ...dedupe, key: `{{${c.path}}}` } })}>${c.path.split('.').slice(1).join('.')}</button>`)}
          </div>`}
          ${keyPreview !== undefined && html`<div className="field-hint">按样例数据，去重键为 <span className="mono">${typeof keyPreview === 'object' ? JSON.stringify(keyPreview) : String(keyPreview)}</span></div>`}
        <//>
        <${Field} label="时间窗口" help="窗口内出现相同去重键的事件会被跳过；超过窗口后再次出现会重新处理">
          <${Segmented} size="sm" disabled=${readOnly} value=${dedupe.window} onChange=${(v) => set({ dedupe: { ...dedupe, window: v } })} options=${DEDUPE_WINDOWS} />
        <//>
        <div className="run-set-stat">
          <${Icon} name="Filter" size=${14} className="muted" />
          <span className="grow">最近 7 天拦截了 ${deduped} 个重复事件</span>
          ${deduped > 0 && html`<${Link} to=${`/logs?workflow=${wf.id}&status=deduped`} className="link text-xs">查看<//>`}
        </div>
      <//>`}
    </div>`}
    <div className="panel-section run-set">
      <div className="run-set-head"><${Icon} name="Gauge" size=${16} className="muted" /><b className="grow">并发控制</b></div>
      <div className="run-set-desc">事件集中到达时，限制这个工作流同时运行的数量，保护有限流的下游系统。超出的事件排队等待，不会丢失。</div>
      <${Field} label="最大同时运行数">
        <${Select} disabled=${readOnly} width=${200} value=${Number(conc.max) || 0} onChange=${(v) => set({ concurrency: { ...conc, max: v } })} options=${[{ value: 0, label: '不限制' }, ...[1, 3, 5, 10, 20].map((x) => ({ value: x, label: x === 1 ? '1（逐个处理）' : String(x) }))]} />
      <//>
      ${Number(conc.max) !== 1 && html`<${Field} label="保序键" hint="可选。保序键相同的事件按到达顺序依次处理，不同的键之间并行，例如同一个申请人的审批按顺序处理">
        <${VarInput} value=${conc.orderKey} onChange=${(v) => set({ concurrency: { ...conc, orderKey: v } })} ctx=${triggerCtx} readOnly=${readOnly} placeholder="不设置时不保证顺序" />
      <//>`}
    </div>
    ${node.connector === 'schedule' && html`<div className="panel-section run-set">
      <div className="run-set-head"><${Icon} name="Timer" size=${16} className="muted" /><b className="grow">上一次还没运行完时</b></div>
      <${RadioCards} columns=${1} disabled=${readOnly} value=${rs.overlap || 'skip'} onChange=${(v) => set({ overlap: v })} options=${[
        { value: 'skip', label: '跳过本次', desc: '适合汇总、日报类任务，避免重复统计' },
        { value: 'queue', label: '排队等待', desc: '上一次结束后立刻运行本次' },
        { value: 'parallel', label: '同时运行', desc: '各次运行互不影响时使用' },
      ]} />
    </div>`}
  <//>`;
}

function newWebhookToken() {
  return `whk_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

function WebhookSettings({ node, onConfig, state, wf, readOnly }) {
  const cfg = node.config;
  const [ip, setIp] = useState('');
  const url = `https://${state.tenant.domain}/hooks/${wf.id}${node.op === 'catch_sync' ? '/sync' : ''}`;
  const addIp = () => {
    const v = ip.trim();
    if (!v) return;
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(v) || v.split('/')[0].split('.').some((x) => Number(x) > 255)) { toast.error('IP 格式不正确，例如 10.0.0.1 或 10.0.0.0/8'); return; }
    if ((cfg.ips || []).includes(v)) { toast.info('该 IP 已在白名单中'); return; }
    onConfig({ ips: [...(cfg.ips || []), v] });
    setIp('');
  };
  const resetToken = async () => {
    const ok = await confirmDialog({ title: '重置 Token？', content: '重置后旧 Token 立即失效，调用方需要换用新 Token。', okText: '重置' });
    if (!ok) return;
    onConfig({ token: newWebhookToken() });
    toast.success('已重置 Token');
  };
  return html`<${Fragment}>
    <${Field} label="回调地址" help="外部系统向这个地址发送请求即可触发工作流">
      <div className="webhook-url"><${Tag} size="sm" tone="primary">POST<//><span className="url">${url}</span><${CopyButton} text=${url} /></div>
    <//>
    ${node.op === 'catch_sync' && html`<div style=${{ marginBottom: 16 }}><${Alert} tone="info">同步 Webhook 会等待流程中的「同步回调」节点返回响应，调用方最多等待 30 秒。<//></div>`}
    <${Field} label="请求 Body 类型"><${Segmented} disabled=${readOnly} value=${cfg.bodyType || 'JSON'} onChange=${(v) => onConfig({ bodyType: v })} options=${[{ value: 'JSON', label: 'JSON' }, { value: 'Text', label: 'Text' }]} /><//>
    <${Field} label="鉴权方式">
      <${Select} disabled=${readOnly} value=${cfg.auth || '无鉴权'} onChange=${(v) => onConfig({ auth: v, ...(v === 'Header Token' && !cfg.token ? { token: newWebhookToken() } : {}) })} options=${[{ value: '无鉴权', label: '无鉴权' }, { value: 'Header Token', label: 'Header Token', desc: '请求头需携带 X-Webhook-Token' }, { value: 'HMAC 签名', label: 'HMAC 签名', desc: '使用项目配置中的密钥校验签名' }, { value: 'Basic Auth', label: 'Basic Auth' }]} />
      ${cfg.auth === 'Header Token' && cfg.token && html`<div className="webhook-url" style=${{ marginTop: 8 }}>
        <span className="url">X-Webhook-Token: ${cfg.token.slice(0, 8)}••••${cfg.token.slice(-4)}</span>
        <${CopyButton} text=${cfg.token} />
        ${!readOnly && html`<${Button} size="xs" variant="ghost" onClick=${resetToken}>重置<//>`}
      </div>`}
    <//>
    <${Field} label="IP 白名单" hint="为空时不限制来源 IP；支持 CIDR，如 10.0.0.0/8">
      <div className="col" style=${{ gap: 6 }}>
        ${(cfg.ips || []).length > 0 && html`<div className="row" style=${{ flexWrap: 'wrap', gap: 6 }}>${cfg.ips.map((x) => html`<${Tag} key=${x} onClose=${readOnly ? null : () => onConfig({ ips: cfg.ips.filter((y) => y !== x) })}>${x}<//>`)}</div>`}
        ${!readOnly && html`<${Input} size="sm" placeholder="输入 IP 后回车添加" value=${ip} onChange=${setIp} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addIp(); }} />`}
        ${readOnly && !(cfg.ips || []).length && html`<span className="text-xs muted">不限制</span>`}
      </div>
    <//>
  <//>`;
}

function WebhookTest({ node, wf, state, onApply, readOnly }) {
  const [phase, setPhase] = useState('idle');
  const [data, setData] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const url = `https://${state.tenant.domain}/hooks/${wf.id}${node.op === 'catch_sync' ? '/sync' : ''}`;
  const sample = nodeOutput(node);
  const body = JSON.stringify(sample.body || {});
  const listen = () => {
    setPhase('listening');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPhase('done'); setData(sample); toast.success('已收到 1 条请求'); }, 1600);
  };
  return html`<div>
    <${Alert} tone="info" title="获取触发返回数据">向回调地址发送一次真实请求，平台会把收到的数据作为出参结构，供后续节点引用。<//>
    <div style=${{ height: 12 }} />
    <${CodeBlock} code=${`curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`} />
    <div className="row" style=${{ margin: '12px 0' }}>
      <${Button} variant="primary" icon=${phase === 'listening' ? undefined : 'Radio'} loading=${phase === 'listening'} onClick=${listen}>
        ${phase === 'listening' ? '等待请求中…' : '获取数据并预览'}
      <//>
      ${phase === 'listening' && html`<${Button} variant="ghost" onClick=${() => { clearTimeout(timer.current); setPhase('idle'); }}>取消<//>`}
      ${data && !readOnly && html`<${Button} onClick=${() => { onApply(data); toast.success('已应用为出参结构'); }}>应用为出参<//>`}
    </div>
    ${data && html`<div className="card" style=${{ padding: 8 }}><div className="json"><${JsonView} value=${data} /></div></div>`}
  </div>`;
}

function AlertSettings({ node, onConfig, state, wf, readOnly }) {
  const cfg = node.config;
  const wfs = state.workflows.filter((w) => w.projectId === wf.projectId && w.id !== wf.id);
  const threshold = ['流程运行失败率', '流程运行超时', '工作节点 CPU 使用率', '工作节点内存使用率'].includes(cfg.event);
  const ruleError = !readOnly && isBlank(cfg.rule) ? '规则名称是必填项' : null;
  const scopeError = !readOnly && !(cfg.scope || []).length ? '请选择需要监控的资源' : null;
  return html`<${Fragment}>
    <${Field} label="规则名称" required error=${ruleError}><${Input} readOnly=${readOnly} value=${cfg.rule} onChange=${(v) => onConfig({ rule: v.slice(0, 50) })} suffix=${`${(cfg.rule || '').length}/50`} invalid=${Boolean(ruleError)} /><//>
    <${Field} label="事件" required>
      <${Select} disabled=${readOnly} value=${cfg.event || '流程运行失败'} onChange=${(v) => onConfig({ event: v })} options=${[
        { group: '异常事件' }, { value: '流程运行失败', label: '流程运行失败' }, { value: '工作节点状态变更', label: '工作节点状态变更' },
        { group: '阈值事件' }, { value: '流程运行失败率', label: '流程运行失败率' }, { value: '流程运行超时', label: '流程运行超时' }, { value: '工作节点 CPU 使用率', label: '工作节点 CPU 使用率' }, { value: '工作节点内存使用率', label: '工作节点内存使用率' },
      ]} />
    <//>
    ${threshold && html`<div className="form-grid">
      <${Field} label="阈值"><div className="row"><${Input} readOnly=${readOnly} type="number" value=${cfg.threshold ?? 20} onChange=${(v) => onConfig({ threshold: v })} /><span className="muted">${cfg.event === '流程运行超时' ? '秒' : '%'}</span></div><//>
      <${Field} label="计算方式"><${Select} disabled=${readOnly} value=${cfg.calc || '平均值'} onChange=${(v) => onConfig({ calc: v })} options=${['平均值', '最大值', '最小值'].map((x) => ({ value: x, label: x }))} /><//>
    </div>`}
    <${Field} label="资源范围" required help="选择需要监控的工作流" error=${scopeError}>
      <${Select} disabled=${readOnly} multiple value=${cfg.scope || []} onChange=${(v) => onConfig({ scope: v })} options=${wfs.map((w) => ({ value: w.id, label: w.name }))} placeholder="选择需要监控的工作流" searchable invalid=${Boolean(scopeError)} />
    <//>
    <div className="form-grid">
      <${Field} label="告警频率"><${Select} disabled=${readOnly} value=${cfg.frequency || '实时'} onChange=${(v) => onConfig({ frequency: v })} options=${['实时', '1 分钟', '5 分钟', '10 分钟', '15 分钟', '30 分钟'].map((x) => ({ value: x, label: x }))} /><//>
      <${Field} label="持续周期"><div className="row"><span className="muted">持续</span><${Input} readOnly=${readOnly} type="number" value=${cfg.periods ?? 1} onChange=${(v) => onConfig({ periods: v })} style=${{ width: 80 }} /><span className="muted">个周期</span></div><//>
    </div>
    <${Field} label="生效时段" help="仅在此时间段触发告警流程的运行">
      <${Segmented} disabled=${readOnly} value=${cfg.activeHours || '全天'} onChange=${(v) => onConfig({ activeHours: v })} options=${[{ value: '全天', label: '全天' }, { value: '工作时间', label: '工作日 9:00-19:00' }, { value: '自定义', label: '自定义' }]} />
      ${cfg.activeHours === '自定义' && html`<div className="row" style=${{ marginTop: 8 }}>
        <${Input} type="time" readOnly=${readOnly} value=${cfg.activeFrom || '09:00'} onChange=${(v) => onConfig({ activeFrom: v })} style=${{ width: 130 }} />
        <span className="muted">至</span>
        <${Input} type="time" readOnly=${readOnly} value=${cfg.activeTo || '19:00'} onChange=${(v) => onConfig({ activeTo: v })} style=${{ width: 130 }} />
      </div>`}
    <//>
  <//>`;
}

function FormSettings({ node, onConfig, state, wf, readOnly }) {
  const url = `https://${state.tenant.domain}/forms/${wf.id}`;
  const fields = node.config.fields || [];
  const set = (next) => onConfig({ fields: next });
  const patch = (id, p) => set(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (i, d) => {
    const arr = [...fields];
    [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
    set(arr);
  };
  return html`<${Fragment}>
    <${Field} label="表单链接"><div className="webhook-url"><span className="url">${url}</span><${CopyButton} text=${url} /></div><//>
    <${Field} label="表单字段" required error=${!readOnly && !fields.length ? '至少添加一个字段' : null}>
      <div className="col" style=${{ gap: 6 }}>
        ${fields.map((f, i) => html`<div key=${f.id} className="form-field-row">
          <div className="grow" style=${{ minWidth: 0 }}><${InlineEdit} value=${f.name} readOnly=${readOnly} onSave=${(v) => patch(f.id, { name: v })} maxLength=${30} /></div>
          <${Select} size="sm" width=${104} disabled=${readOnly} value=${f.type} onChange=${(v) => patch(f.id, { type: v })} options=${FORM_FIELD_TYPES.map((x) => ({ value: x, label: x }))} />
          <${Checkbox} disabled=${readOnly} label="必填" checked=${f.required} onChange=${(v) => patch(f.id, { required: v })} />
          ${!readOnly && html`<${Fragment}>
            <${IconButton} icon="ArrowUp" size="xs" title="上移" disabled=${i === 0} onClick=${() => move(i, -1)} />
            <${IconButton} icon="ArrowDown" size="xs" title="下移" disabled=${i === fields.length - 1} onClick=${() => move(i, 1)} />
            <${IconButton} icon="Trash2" size="xs" title="删除字段" onClick=${() => set(fields.filter((x) => x.id !== f.id))} />
          <//>`}
        </div>`)}
        ${!readOnly && html`<${Button} variant="dashed" icon="Plus" size="sm" onClick=${() => set([...fields, { id: uid('f'), key: `field_${fields.length + 1}`, name: `字段 ${fields.length + 1}`, type: '单行文本', required: false }])}>添加字段<//>`}
      </div>
    <//>
  <//>`;
}

function SubflowSettings({ node, onConfig, readOnly }) {
  const params = node.config.params || [];
  const set = (next) => onConfig({ params: next });
  const names = params.map((x) => (x.name || '').trim());
  return html`<${Fragment}>
    <${Alert} tone="info">其他工作流通过「调用子流程」节点调用本流程，并等待「子流程响应」返回结果。<//>
    <div style=${{ height: 12 }} />
    <${Field} label="输入参数" error=${!readOnly && new Set(names).size !== names.length ? '参数名不能重复' : null}>
      <div className="col" style=${{ gap: 6 }}>
        ${params.map((p, i) => html`<div key=${i} className="form-field-row">
          <${Input} size="sm" mono readOnly=${readOnly} value=${p.name} onChange=${(v) => set(params.map((x, j) => (j === i ? { ...x, name: v.replace(/\s/g, '') } : x)))} placeholder="参数名" invalid=${!readOnly && !p.name} style=${{ flex: 1 }} />
          <${Select} size="sm" width=${92} disabled=${readOnly} value=${p.type} onChange=${(v) => set(params.map((x, j) => (j === i ? { ...x, type: v } : x)))} options=${['字符串', '数值', '布尔', '对象', '数组'].map((x) => ({ value: x, label: x }))} />
          <${Checkbox} disabled=${readOnly} label="必填" checked=${p.required} onChange=${(v) => set(params.map((x, j) => (j === i ? { ...x, required: v } : x)))} />
          ${!readOnly && html`<${IconButton} icon="Trash2" size="xs" title="删除参数" onClick=${() => set(params.filter((_, j) => j !== i))} />`}
        </div>`)}
        ${!params.length && html`<div className="text-xs muted">暂无输入参数</div>`}
        ${!readOnly && html`<${Button} variant="dashed" icon="Plus" size="sm" onClick=${() => set([...params, { name: `param${params.length + 1}`, type: '字符串', required: false }])}>添加参数<//>`}
      </div>
    <//>
  <//>`;
}

function ConditionRows({ conditions, onChange, ctx, readOnly, allowAi }) {
  const list = conditions || [];
  const setAt = (i, patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const OPS = ['等于', '不等于', '包含', '不包含', '以…开始', '以…结束', '大于', '小于', ...UNARY_OPS];
  return html`<${Fragment}>
    ${list.map((cond, ci) => (cond.type === 'ai'
      ? html`<div key=${ci} className="cond-group is-ai">
        <div className="row" style=${{ marginBottom: 8 }}><${Icon} name="Sparkles" size=${14} style=${{ color: 'var(--primary)' }} /><b className="grow">AI 条件</b>${!readOnly && html`<${IconButton} icon="X" size="xs" title="删除条件" onClick=${() => onChange(list.filter((_, i) => i !== ci))} />`}</div>
        <${Field} label="判断内容"><${VarInput} readOnly=${readOnly} value=${cond.input} onChange=${(v) => setAt(ci, { input: v })} ctx=${ctx} /><//>
        <${Field} label="判断指令"><${Textarea} rows=${2} readOnly=${readOnly} value=${cond.prompt} onChange=${(v) => setAt(ci, { prompt: v })} placeholder="例如：用户是否在询问硬件报修" /><//>
      </div>`
      : html`<div key=${ci} className="cond-row">
        <${VarInput} readOnly=${readOnly} value=${cond.left} onChange=${(v) => setAt(ci, { left: v })} ctx=${ctx} placeholder="选择数据" invalid=${!readOnly && isBlank(cond.left)} />
        <${Select} disabled=${readOnly} value=${cond.op} onChange=${(v) => setAt(ci, { op: v })} options=${OPS.map((x) => ({ value: x, label: x }))} />
        ${UNARY_OPS.includes(cond.op)
          ? html`<div />`
          : html`<${VarInput} readOnly=${readOnly} value=${cond.right} onChange=${(v) => setAt(ci, { right: v })} ctx=${ctx} placeholder="值" invalid=${!readOnly && isBlank(cond.right)} />`}
        ${!readOnly ? html`<${IconButton} icon="X" size="sm" title="删除条件" onClick=${() => onChange(list.filter((_, i) => i !== ci))} />` : html`<span />`}
      </div>`))}
    ${list.length === 0 && html`<div className="param-error" style=${{ marginBottom: 8 }}>请至少添加一个条件</div>`}
    ${!readOnly && html`<div className="row-4">
      <${Button} size="xs" variant="ghost" icon="Plus" onClick=${() => onChange([...list, { left: '', op: '等于', right: '' }])}>添加条件<//>
      ${allowAi && html`<${Button} size="xs" variant="ghost" icon="Sparkles" disabled=${list.some((x) => x.type === 'ai')} onClick=${() => onChange([...list, { type: 'ai', input: '', prompt: '' }])}>添加 AI 条件<//>`}
    </div>`}
  <//>`;
}

function BranchConfig({ node, onChange, ctx, focusBranch, readOnly }) {
  const refs = useRef({});
  useEffect(() => {
    if (focusBranch && refs.current[focusBranch]) refs.current[focusBranch].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusBranch]);
  const setBranch = (bid, patch) => onChange({ branches: node.branches.map((b) => (b.id === bid ? { ...b, ...patch } : b)) });
  const isParallel = node.kind === 'parallel';
  const normal = node.branches.filter((b) => !b.isDefault);
  const switchType = (v) => {
    if (readOnly || v === (isParallel ? 'parallel' : 'branch')) return;
    if (v === 'parallel') {
      onChange({ kind: 'parallel', branches: node.branches.map((b) => (b.isDefault ? { id: b.id, name: b.name, steps: b.steps, wasDefault: true } : b)) });
      return;
    }
    const def = node.branches.find((b) => b.wasDefault);
    const others = node.branches.filter((b) => !b.wasDefault).map((b) => ({ ...b, conditions: b.conditions || [], logic: b.logic || 'and' }));
    onChange({ kind: 'branch', branches: [...others, def ? { id: def.id, name: def.name, steps: def.steps, isDefault: true } : { id: uid('b'), name: '默认', isDefault: true, steps: [] }] });
  };
  const moveBranch = (bi, d) => {
    const arr = [...node.branches];
    [arr[bi + d], arr[bi]] = [arr[bi], arr[bi + d]];
    onChange({ branches: arr });
  };
  const removeBranch = async (b) => {
    const inner = b.steps.reduce((acc, x) => acc + 1 + countDescendants(x), 0);
    if (inner && !(await confirmDialog({ title: `删除分支「${b.name}」？`, content: `分支内的 ${inner} 个节点会一起删除。可以用撤销恢复。`, danger: true, okText: '删除' }))) return;
    onChange({ branches: node.branches.filter((x) => x.id !== b.id) });
  };
  return html`<${Fragment}>
    <${Field} label="分支类型">
      <${RadioCards} columns=${2} disabled=${readOnly} value=${isParallel ? 'parallel' : 'branch'} onChange=${switchType} options=${[
        { value: 'branch', label: '互斥分支', desc: '从左到右依次判断，只运行第一个满足条件的分支' },
        { value: 'parallel', label: '并行分支', desc: '所有分支同时运行，全部结束后继续' },
      ]} />
    <//>
    ${node.branches.map((b, bi) => html`<div key=${b.id} ref=${(el) => { refs.current[b.id] = el; }} className=${cx('cond-group', focusBranch === b.id && 'is-focus')}>
      <div className="cond-group-head">
        ${b.isDefault ? html`<${Tag} size="sm">默认<//>` : html`<${Tag} size="sm" tone="primary">${bi + 1}<//>`}
        <${InlineEdit} value=${b.name} readOnly=${readOnly} maxLength=${30} onSave=${(v) => setBranch(b.id, { name: v })} />
        <span className="spacer" />
        ${!b.isDefault && !readOnly && html`<${MoreMenu} items=${[
          { label: '左移', icon: 'ArrowLeft', disabled: bi === 0, onClick: () => moveBranch(bi, -1) },
          { label: '右移', icon: 'ArrowRight', disabled: bi >= normal.length - 1, onClick: () => moveBranch(bi, 1) },
          { divider: true },
          { label: '删除分支', icon: 'Trash2', danger: true, disabled: normal.length <= (isParallel ? 2 : 1), onClick: () => removeBranch(b) },
        ]} />`}
      </div>
      ${b.isDefault
        ? html`<div className="text-xs muted">以上分支的条件都不满足时，运行默认分支</div>`
        : isParallel
          ? html`<div className="text-xs muted">${b.steps.length} 个节点，与其他分支同时运行</div>`
          : html`<${Fragment}>
            <div className="cond-logic">符合以下
              <${Select} size="sm" width=${76} disabled=${readOnly} value=${b.logic || 'and'} onChange=${(v) => setBranch(b.id, { logic: v })} options=${[{ value: 'and', label: '所有' }, { value: 'or', label: '任意' }]} />
              条件</div>
            <${ConditionRows} conditions=${b.conditions} onChange=${(v) => setBranch(b.id, { conditions: v })} ctx=${ctx} readOnly=${readOnly} allowAi=${true} />
          <//>`}
    </div>`)}
    ${!readOnly && html`<${Button} variant="dashed" icon="Plus" block onClick=${() => {
      const def = node.branches.find((b) => b.isDefault);
      const nb = { id: uid('b'), name: `分支 ${normal.length + 1}`, conditions: isParallel ? undefined : [{ left: '', op: '等于', right: '' }], logic: 'and', steps: [] };
      onChange({ branches: def ? [...normal, nb, def] : [...normal, nb] });
    }}>添加分支<//>`}
  <//>`;
}

function LoopConfig({ node, onConfig, ctx, readOnly }) {
  const cfg = node.config;
  const maxError = !readOnly && !(Number(cfg.max) > 0) ? '最大循环次数需大于 0' : null;
  if (node.variant === 'while') {
    return html`<${Fragment}>
      <${Alert} tone="info">每轮开始前判断条件，满足时运行循环体，不满足或达到最大次数后继续后面的节点。循环体内可以引用「循环变量」的 index。<//>
      <div style=${{ height: 12 }} />
      <div className="cond-logic">符合以下
        <${Select} size="sm" width=${76} disabled=${readOnly} value=${cfg.logic || 'and'} onChange=${(v) => onConfig({ logic: v })} options=${[{ value: 'and', label: '所有' }, { value: 'or', label: '任意' }]} />
        条件时继续循环</div>
      <${ConditionRows} conditions=${cfg.conditions} onChange=${(v) => onConfig({ conditions: v })} ctx=${ctx} readOnly=${readOnly} />
      <div style=${{ height: 12 }} />
      <${Field} label="最大循环次数" required error=${maxError} hint="防止条件一直满足导致无限循环"><${Input} readOnly=${readOnly} type="number" value=${cfg.max ?? 100} onChange=${(v) => onConfig({ max: v })} style=${{ width: 120 }} invalid=${Boolean(maxError)} /><//>
    <//>`;
  }
  return html`<${Fragment}>
    <${Field} label="循环类型">
      <${RadioCards} columns=${2} disabled=${readOnly} value=${cfg.mode || '串行'} onChange=${(v) => onConfig({ mode: v })} options=${[{ value: '串行', label: '串行循环', desc: '逐项依次运行' }, { value: '并行', label: '并行循环', desc: '多项同时运行' }]} />
    <//>
    <${Param} name="循环列表" required linkable linked=${Boolean(cfg.items)} readOnly=${readOnly} onLink=${(e) => ctx.startLink(e, (p) => onConfig({ items: `{{${p}}}` }))} error=${!readOnly && isBlank(cfg.items) ? '循环列表是必填项' : null} help="选择一个数组，循环体会对其中每一项运行一次">
      <${VarInput} readOnly=${readOnly} value=${cfg.items} onChange=${(v) => onConfig({ items: v })} ctx=${ctx} placeholder="选择数组数据" invalid=${!readOnly && isBlank(cfg.items)} />
    <//>
    ${cfg.mode === '并行' && html`<${Field} label="最大并行数量"><${Input} readOnly=${readOnly} type="number" value=${cfg.concurrency ?? 5} onChange=${(v) => onConfig({ concurrency: v })} style=${{ width: 120 }} /><//>`}
    <${Field} label="最大循环次数" required error=${maxError} hint="超过后剩余项不再运行，单次运行最多 4 万个节点"><${Input} readOnly=${readOnly} type="number" value=${cfg.max ?? 100} onChange=${(v) => onConfig({ max: v })} style=${{ width: 120 }} invalid=${Boolean(maxError)} /><//>
  <//>`;
}

function DelayConfig({ node, onConfig, ctx, readOnly }) {
  const cfg = node.config;
  const untilMode = cfg.mode === '至指定时间';
  return html`<${Fragment}>
    <${Field} label="延迟方式"><${Segmented} disabled=${readOnly} value=${cfg.mode || '等待时长'} onChange=${(v) => onConfig({ mode: v })} options=${[{ value: '等待时长', label: '等待一段时间' }, { value: '至指定时间', label: '等到指定时间' }]} /><//>
    ${untilMode
      ? html`<${Param} name="继续时间" required linkable linked=${(cfg.until || '').includes('{{')} readOnly=${readOnly} onLink=${(e) => ctx.startLink(e, (p) => onConfig({ until: `{{${p}}}` }))} error=${!readOnly && isBlank(cfg.until) ? '继续时间是必填项' : null}>
        <${VarInput} readOnly=${readOnly} value=${cfg.until} onChange=${(v) => onConfig({ until: v })} ctx=${ctx} placeholder="2026-10-01 09:00，或插入审批结束时间等变量" invalid=${!readOnly && isBlank(cfg.until)} />
      <//>`
      : html`<${Field} label="延迟时长" required error=${!readOnly && !(Number(cfg.value) > 0) ? '延迟时长需大于 0' : null}>
        <div className="row">
          <${Input} readOnly=${readOnly} type="number" value=${cfg.value ?? ''} onChange=${(v) => onConfig({ value: v })} style=${{ width: 120 }} />
          <${Select} disabled=${readOnly} width=${100} value=${cfg.unit || '分钟'} onChange=${(v) => onConfig({ unit: v })} options=${['秒', '分钟', '小时', '天'].map((x) => ({ value: x, label: x }))} />
        </div>
      <//>`}
    <${Alert} tone="info">延迟期间运行状态为「等待中」，不占用执行资源。单次运行总时长不超过 4 小时。<//>
  <//>`;
}

function EndConfig({ node, onConfig, readOnly }) {
  return html`<${Fragment}>
    <${Field} label="终止后将本次运行标记为">
      <${RadioCards} columns=${2} disabled=${readOnly} value=${node.config.status || '成功'} onChange=${(v) => onConfig({ status: v })} options=${[{ value: '成功', label: '运行成功', desc: '正常结束，不触发告警' }, { value: '失败', label: '运行失败', desc: '计入失败次数，会触发告警' }]} />
    <//>
    <${Field} label="终止说明"><${Input} readOnly=${readOnly} value=${node.config.message} onChange=${(v) => onConfig({ message: v })} placeholder="会显示在运行日志中" /><//>
  <//>`;
}

function CodeConfig({ node, onConfig, ctx, readOnly }) {
  const cfg = node.config;
  const inputs = cfg.inputs || [];
  const lang = cfg.language || 'javascript';
  const langName = lang === 'python' ? 'Python' : 'JavaScript';
  const [full, setFull] = useState(false);
  const names = inputs.map((x) => (x.name || '').trim());
  const setLang = (v) => {
    if (readOnly || v === lang) return;
    const untouched = !cfg.code || cfg.code === CODE_TEMPLATES[lang];
    onConfig({ language: v, code: untouched ? CODE_TEMPLATES[v] : cfg.code });
    if (!untouched) toast.info(`已切换为 ${v === 'python' ? 'Python' : 'JavaScript'}，请按新语言改写代码`);
  };
  const editor = (rows) => html`<${CodeEditor} value=${cfg.code || ''} onChange=${(v) => onConfig({ code: v })} rows=${rows} readOnly=${readOnly} label=${`${langName} 代码`} tools=${!full && html`<${Button} size="xs" icon="Maximize2" onClick=${() => setFull(true)}>全屏${readOnly ? '查看' : '编辑'}<//>`} />`;
  return html`<${Fragment}>
    <div className="panel-section">
      <div className="panel-section-title">入参 <span className="muted text-xs">${lang === 'python' ? '在代码中通过 input["参数名"] 读取' : '在代码中通过 input.参数名 读取'}</span></div>
      ${inputs.map((inp, i) => html`<div key=${i} className="param" style=${{ marginBottom: 10 }}>
        <div className="param-head">
          <span className=${cx('param-link', inp.value && 'is-linked', readOnly && 'is-readonly')} onMouseDown=${readOnly ? undefined : (e) => ctx.startLink(e, (p) => onConfig({ inputs: inputs.map((x, j) => (j === i ? { ...x, value: `{{${p}}}` } : x)) }))} />
          <${InlineEdit} value=${inp.name} readOnly=${readOnly} maxLength=${40} onSave=${(v) => onConfig({ inputs: inputs.map((x, j) => (j === i ? { ...x, name: v.replace(/\s/g, '') } : x)) })} />
          <span className="spacer" />
          ${!readOnly && html`<${IconButton} icon="Trash2" size="xs" title="删除入参" onClick=${() => onConfig({ inputs: inputs.filter((_, j) => j !== i) })} />`}
        </div>
        <${VarInput} readOnly=${readOnly} value=${inp.value} onChange=${(v) => onConfig({ inputs: inputs.map((x, j) => (j === i ? { ...x, value: v } : x)) })} ctx=${ctx} />
      </div>`)}
      ${!inputs.length && html`<div className="text-xs muted" style=${{ marginBottom: 8 }}>暂无入参，代码中的 input 为空对象</div>`}
      ${!readOnly && new Set(names).size !== names.length && html`<div className="param-error" style=${{ marginBottom: 8 }}>入参名称不能重复</div>`}
      ${!readOnly && html`<${Button} size="xs" variant="ghost" icon="Plus" onClick=${() => onConfig({ inputs: [...inputs, { name: `property${inputs.length + 1}`, value: '' }] })}>添加入参<//>`}
    </div>
    <div className="panel-section">
      <div className="panel-section-title" style=${{ justifyContent: 'space-between' }}>
        <span>代码</span>
        <${Segmented} size="sm" disabled=${readOnly} value=${lang} onChange=${setLang} options=${[{ value: 'javascript', label: 'JavaScript' }, { value: 'python', label: 'Python' }]} />
      </div>
      ${editor(12)}
      ${!readOnly && isBlank(cfg.code) && html`<div className="param-error">代码不能为空</div>`}
      <div className="field-hint">运行在隔离沙箱中，单节点最长 60 秒，出入参合计不超过 4 MB。</div>
    </div>
    <${Modal} open=${full} onClose=${() => setFull(false)} title=${`${readOnly ? '查看' : '编辑'} ${langName} 代码`} width=${960} footer=${html`<${Button} variant="primary" onClick=${() => setFull(false)}>完成<//>`}>
      ${editor(26)}
    <//>
  <//>`;
}

function AiConfig({ node, onConfig, ctx, state, readOnly }) {
  const cfg = node.config;
  return html`<${Fragment}>
    <${ModelFields} cfg=${cfg} onConfig=${onConfig} ctx=${ctx} state=${state} readOnly=${readOnly} />
    <${Param} name="提示词" required linkable linked=${(cfg.prompt || '').includes('{{')} readOnly=${readOnly} onLink=${(e) => ctx.startLink(e, (p) => onConfig({ prompt: `${cfg.prompt || ''}{{${p}}}` }))} error=${!readOnly && isBlank(cfg.prompt) ? '提示词是必填项' : null}>
      <${VarInput} readOnly=${readOnly} value=${cfg.prompt} onChange=${(v) => onConfig({ prompt: v })} multiline ctx=${ctx} placeholder="描述你希望模型完成的任务，输入 $ 插入变量" invalid=${!readOnly && isBlank(cfg.prompt)} />
    <//>
    <${Field} label="输出格式"><${Segmented} disabled=${readOnly} value=${cfg.format || '文本'} onChange=${(v) => onConfig({ format: v })} options=${[{ value: '文本', label: '文本' }, { value: 'JSON', label: 'JSON 结构' }]} /><//>
    ${cfg.format === 'JSON' && html`<${Field} label="输出字段" hint="模型会按这些字段输出，下游节点可以直接引用">
      <${OutputFieldsEditor} fields=${cfg.outputFields || []} onChange=${(v) => onConfig({ outputFields: v })} readOnly=${readOnly} />
    <//>`}
    <${Field} label="随机性" hint="分类与抽取建议 0 ~ 0.3，写作类任务可以调高">
      <div className="row"><input type="range" min="0" max="1" step="0.1" aria-label="随机性" disabled=${readOnly} value=${cfg.temperature ?? 0.2} onChange=${(e) => onConfig({ temperature: Number(e.target.value) })} style=${{ flex: 1, accentColor: 'var(--primary)' }} /><span className="mono">${cfg.temperature ?? 0.2}</span></div>
    <//>
  <//>`;
}

function VariableConfig({ node, onConfig, ctx, readOnly }) {
  const vars = node.config.vars || [];
  const names = vars.map((v) => (v.name || '').trim());
  const setVar = (i, p) => onConfig({ vars: vars.map((y, j) => (j === i ? { ...y, ...p } : y)) });
  return html`<${Fragment}>
    ${vars.map((v, i) => html`<div key=${i} className="cond-group">
      <div className="cond-group-head">
        <b className="grow">变量 ${i + 1}</b>
        ${!readOnly && html`<${IconButton} icon="Trash2" size="xs" title="删除变量" onClick=${() => onConfig({ vars: vars.filter((_, j) => j !== i) })} />`}
      </div>
      <div className="form-grid">
        <${Field} label="变量名" error=${!readOnly && (!names[i] ? '变量名不能为空' : names.indexOf(names[i]) !== i ? '变量名重复' : null)}><${Input} readOnly=${readOnly} mono value=${v.name} onChange=${(x) => setVar(i, { name: x.replace(/\s/g, '') })} /><//>
        <${Field} label="类型"><${Select} disabled=${readOnly} value=${v.type} onChange=${(x) => setVar(i, { type: x })} options=${['string', 'number', 'boolean', 'array', 'object'].map((x) => ({ value: x, label: x }))} /><//>
      </div>
      <${Field} label="值"><${VarInput} readOnly=${readOnly} value=${v.value} onChange=${(x) => setVar(i, { value: x })} ctx=${ctx} /><//>
    </div>`)}
    ${!vars.length && html`<div className="param-error" style=${{ marginBottom: 8 }}>至少声明一个变量</div>`}
    ${!readOnly && html`<${Button} variant="dashed" block icon="Plus" onClick=${() => onConfig({ vars: [...vars, { name: `var${vars.length + 1}`, type: 'string', value: '' }] })}>添加变量<//>`}
  <//>`;
}

function JsonConfig({ node, onConfig, ctx, readOnly }) {
  return html`<${Fragment}>
    <${Field} label="操作"><${Segmented} disabled=${readOnly} value=${node.config.mode || '解析'} onChange=${(v) => onConfig({ mode: v })} options=${[{ value: '解析', label: 'JSON 字符串 → 对象' }, { value: '序列化', label: '对象 → JSON 字符串' }]} /><//>
    <${Param} name="数据" required linkable linked=${(node.config.source || '').includes('{{')} readOnly=${readOnly} onLink=${(e) => ctx.startLink(e, (p) => onConfig({ source: `{{${p}}}` }))} error=${!readOnly && isBlank(node.config.source) ? '数据是必填项' : null}>
      <${VarInput} readOnly=${readOnly} value=${node.config.source} onChange=${(v) => onConfig({ source: v })} ctx=${ctx} invalid=${!readOnly && isBlank(node.config.source)} />
    <//>
  <//>`;
}

function usesErrorBranch(settings) {
  return [settings.strategy, ...(settings.rules || []).map((r) => r.strategy)].some((x) => String(x || '').endsWith('branch'));
}

function RetryFields({ value, onChange, readOnly }) {
  return html`<div className="form-grid" style=${{ marginTop: 10 }}>
    <${Field} label="重试次数"><${Select} disabled=${readOnly} value=${value.times || 3} onChange=${(v) => onChange({ times: v })} options=${[1, 2, 3, 5].map((x) => ({ value: x, label: `${x} 次` }))} /><//>
    <${Field} label="重试间隔"><${Select} disabled=${readOnly} value=${value.interval || 10} onChange=${(v) => onChange({ interval: v })} options=${[5, 10, 30, 60].map((x) => ({ value: x, label: `${x} 秒` }))} /><//>
  </div>`;
}

function ErrorHandling({ node, onSettings, readOnly, onApplyAll }) {
  const s = { strategy: 'stop', rules: [], times: 3, interval: 10, ...(node.settings || {}) };
  const rules = s.rules || [];
  const set = (patch) => onSettings({ ...s, ...patch });
  const setRule = (id, patch) => set({ rules: rules.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const [codeDraft, setCodeDraft] = useState({});
  const [closed, setClosed] = useState([]);
  const retry = (v) => String(v || '').startsWith('retry');
  const addCode = (r) => {
    const v = (codeDraft[r.id] || '').trim();
    if (!v) return;
    if (r.codes.includes(v)) { toast.info(`错误码 ${v} 已在列表中`); return; }
    setRule(r.id, { codes: [...r.codes, v] });
    setCodeDraft({ ...codeDraft, [r.id]: '' });
  };
  return html`<${Fragment}>
    <${Alert} tone="info">节点出错时，从上往下匹配自定义策略，命中一条即停止；都没命中时使用默认处理策略。<//>
    ${usesErrorBranch(s) && html`<div style=${{ marginTop: 8 }}><${Alert} tone="primary" icon="Split">出错时会进入画布上该节点下方的「异常处理」分支，可以在分支里添加通知、记录等节点，处理完后继续运行后面的节点。<//></div>`}
    <div style=${{ height: 14 }} />
    <${Field} label="默认处理策略">
      <${Select} disabled=${readOnly} value=${s.strategy} onChange=${(v) => set({ strategy: v })} options=${STRATEGIES} />
      ${retry(s.strategy) && html`<${RetryFields} value=${s} onChange=${set} readOnly=${readOnly} />`}
    <//>
    <div className="panel-section-title" style=${{ justifyContent: 'space-between', marginTop: 4 }}>
      <span>自定义处理策略</span>
      ${!readOnly && html`<${Button} size="xs" variant="ghost" icon="Plus" onClick=${() => set({ rules: [...rules, { id: uid('r'), name: `策略 ${rules.length + 1}`, cond: '等于任一目标值', codes: ['429'], strategy: 'retry-stop', times: 3, interval: 10 }] })}>添加<//>`}
    </div>
    ${rules.length === 0 && html`<div className="text-xs muted" style=${{ marginBottom: 12 }}>暂无自定义策略。可以按错误码区分处理，比如限流（429）时重试，参数错误（400）时直接终止。</div>`}
    ${rules.map((r, i) => {
      const isOpen = !closed.includes(r.id);
      return html`<div key=${r.id} className="strategy">
        <div className="strategy-head">
          <button type="button" className="strategy-toggle" aria-expanded=${isOpen} onClick=${() => setClosed(isOpen ? [...closed, r.id] : closed.filter((x) => x !== r.id))}>
            <${Icon} name=${isOpen ? 'ChevronDown' : 'ChevronRight'} size=${14} className="muted" />
            <b>${r.name}</b>
            ${!isOpen && html`<span className="text-xs muted">Code ${r.cond} ${r.codes.join('、') || '-'} · ${(STRATEGIES.find((x) => x.value === r.strategy) || {}).label}</span>`}
          </button>
          ${!readOnly && html`<${MoreMenu} items=${[
            { label: '复制策略', icon: 'Copy', onClick: () => set({ rules: [...rules.slice(0, i + 1), { ...r, id: uid('r'), name: `${r.name} 副本` }, ...rules.slice(i + 1)] }) },
            { label: '上移', icon: 'ArrowUp', disabled: i === 0, onClick: () => { const arr = [...rules]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; set({ rules: arr }); } },
            { divider: true },
            { label: '删除', icon: 'Trash2', danger: true, onClick: () => set({ rules: rules.filter((x) => x.id !== r.id) }) },
          ]} />`}
        </div>
        ${isOpen && html`<div className="strategy-body">
          <div className="text-xs muted" style=${{ margin: '6px 0 10px' }}>错误处理依据：错误码（Code）</div>
          <${Field} label="条件">
            <${Select} disabled=${readOnly} value=${r.cond} onChange=${(v) => setRule(r.id, { cond: v })} options=${['等于任一目标值', '不等于任一目标值', '以任一目标值开始', '不以任一目标值开始'].map((x) => ({ value: x, label: `Code ${x}` }))} />
          <//>
          <${Field} label="Code" error=${!readOnly && !r.codes.length ? '至少填写一个错误码' : null}>
            <div className="input tag-input">
              ${r.codes.map((c) => html`<${Tag} key=${c} size="sm" onClose=${readOnly ? null : () => setRule(r.id, { codes: r.codes.filter((y) => y !== c) })}>${c}<//>`)}
              ${!readOnly && html`<input aria-label="添加错误码" placeholder="回车添加" value=${codeDraft[r.id] || ''} onChange=${(e) => setCodeDraft({ ...codeDraft, [r.id]: e.target.value })} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addCode(r); }} />`}
            </div>
          <//>
          <${Field} label="处理策略">
            <${Select} disabled=${readOnly} value=${r.strategy} onChange=${(v) => setRule(r.id, { strategy: v })} options=${STRATEGIES} />
            ${retry(r.strategy) && html`<${RetryFields} value=${r} onChange=${(p) => setRule(r.id, p)} readOnly=${readOnly} />`}
          <//>
        </div>`}
      </div>`;
    })}
    ${!readOnly && html`<div className="row" style=${{ marginTop: 8 }}>
      <${Button} size="sm" icon="CopyCheck" onClick=${onApplyAll}>一键应用<//>
      <span className="text-xs muted">${node.kind === 'action' ? '把以上策略应用到同一连接器的同一个操作' : `把以上策略应用到其他${kindMeta(node).name}节点`}</span>
    </div>`}
  <//>`;
}

function nodeTabs(node) {
  const c = node.connector && resolveConnector(node.connector);
  const needsConn = c && c.auth !== 'none';
  if (node.kind === 'trigger') {
    if (!node.connector) return [{ value: 'trigger', label: '触发器' }];
    const tabs = [{ value: 'trigger', label: '触发器' }];
    if (needsConn) tabs.push({ value: 'conn', label: '连接' });
    if (fieldsFor(node).length) tabs.push({ value: 'input', label: '入参' });
    if (['webhook', 'schedule', 'alert', 'forms', 'subflows'].includes(node.connector)) tabs.push({ value: 'settings', label: '设置' });
    if (node.connector !== 'manual-trigger') tabs.push({ value: 'run', label: '运行设置' });
    if (node.connector !== 'manual-trigger') tabs.push({ value: 'output', label: '出参' });
    if (node.connector === 'webhook') tabs.push({ value: 'test', label: '测试' });
    return tabs;
  }
  if (node.kind === 'action') {
    const tabs = [{ value: 'op', label: '操作' }];
    if (needsConn) tabs.push({ value: 'conn', label: '连接' });
    tabs.push({ value: 'input', label: '入参' }, { value: 'output', label: '出参' }, { value: 'error', label: '错误处理' });
    return tabs;
  }
  if (node.kind === 'agent') return [{ value: 'input', label: '配置' }, { value: 'tools', label: '工具' }, { value: 'guard', label: '护栏' }, { value: 'output', label: '出参' }, { value: 'error', label: '错误处理' }];
  if (['code', 'ai', 'json'].includes(node.kind)) return [{ value: 'input', label: '入参' }, { value: 'output', label: '出参' }, { value: 'error', label: '错误处理' }];
  if (['loop', 'variable'].includes(node.kind)) return [{ value: 'config', label: '配置' }, { value: 'output', label: '出参' }];
  return [{ value: 'config', label: '配置' }];
}

function initialTab(tabs, issues, requestTab) {
  if (requestTab && tabs.some((t) => t.value === requestTab.tab)) return requestTab.tab;
  const first = issues.find((i) => i.level === 'error' && tabs.some((t) => t.value === i.tab));
  return first ? first.tab : tabs[0].value;
}

function EditOutputModal({ open, onClose, value, onSave }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(JSON.stringify(value, null, 2)); }, [open]);
  const parsed = (() => { try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } })();
  return html`<${Modal} open=${open} onClose=${onClose} title="编辑出参数据" width=${720} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!parsed} onClick=${() => { onSave(parsed); onClose(); }}>保存<//><//>`}>
    <${Field} label="出参示例（JSON）" help="下游节点按这里的字段结构引用数据，不影响实际运行结果" error=${parsed ? null : '需要是合法的 JSON 对象或数组'}>
      <${CodeEditor} light value=${text} onChange=${setText} rows=${18} label="出参示例" />
    <//>
  <//>`;
}

function NodePanel({ wf, node, issues, onChange, onClose, onDelete, onCopy, state, focusBranch, readOnly, readOnlyText, startLink, refs, onApplySame, onApplyErrorAll, onReplaceTrigger, requestTab }) {
  const tabs = nodeTabs(node);
  const [picked, setPicked] = useState(() => initialTab(tabs, issues, requestTab));
  const [outputOpen, setOutputOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  useEffect(() => { if (requestTab && requestTab.tab) setPicked(requestTab.tab); }, [requestTab && requestTab.tick]);
  const tab = tabs.some((t) => t.value === picked) ? picked : tabs[0].value;
  const contexts = useMemo(() => nodeContexts(wf), [wf]);
  const nodesById = useMemo(() => Object.fromEntries(allNodes(wf).map((x) => [x.id, x])), [wf]);
  const nctx = contexts[node.id] || { upstream: [], loops: [] };
  const ctx = {
    wf, upstream: nctx.upstream, upstreamIds: new Set(nctx.upstream.map((x) => x.id)), loops: nctx.loops, inLoop: nctx.loops.length > 0,
    nodesById, showErrors: !readOnly, readOnly, startLink: (e, cb) => startLink(e, node, cb), refs,
  };
  const onConfig = (patch) => onChange({ config: { ...node.config, ...patch } });
  const onSettings = async (next) => {
    const need = usesErrorBranch(next);
    if (need && !node.errorSteps) { onChange({ settings: next, errorSteps: [] }); return; }
    if (!need && node.errorSteps) {
      const inner = node.errorSteps.reduce((acc, x) => acc + 1 + countDescendants(x), 0);
      if (inner && !(await confirmDialog({ title: '移除异常处理分支？', content: `分支内的 ${inner} 个节点会一起删除。可以用撤销恢复。`, danger: true, okText: '移除' }))) return;
      onChange({ settings: next, errorSteps: undefined });
      return;
    }
    onChange({ settings: next });
  };
  const tabItems = tabs.map((t) => ({ ...t, dot: !readOnly && issues.some((i) => i.tab === t.value && i.level === 'error') }));
  const c = node.connector && resolveConnector(node.connector);
  const fields = node.kind === 'action' || node.kind === 'trigger' ? fieldsFor(node) : [];
  const out = outputOf(node, wf);
  const versions = c && !c.mcp && (node.kind === 'action' || node.kind === 'trigger') ? connectorVersions(c) : [];
  const mcpServer = c && c.mcp ? (state.mcpClients || []).find((x) => x.id === c.id) : null;
  const maskCount = out && typeof out === 'object' ? maskDeep(out, state.privacy).count : 0;
  const version = versions.find((v) => v.version === node.connectorVersion) || versions.find((v) => v.version === c.version && v.status !== 'gray') || versions.find((v) => v.status === 'released') || versions[0];
  const opDef = c && (node.kind === 'trigger' ? c.triggers : c.actions).find((x) => x.key === node.op);
  const pickOp = (o) => {
    if (readOnly) return;
    const list = node.kind === 'trigger' ? c.triggers : c.actions;
    const prevName = (list.find((x) => x.key === node.op) || {}).name;
    const builtinName = node.kind === 'trigger' ? (TRIGGER_TYPES.find((t) => t.connector === node.connector) || {}).name : null;
    const customized = node.name && node.name !== prevName && node.name !== builtinName;
    onChange({ op: o.key, name: customized ? node.name : builtinName || o.name, config: node.kind === 'trigger' ? defaultTriggerConfig(node.connector, o.key) : {}, sampleOutput: undefined });
    if (node.kind === 'action') setPicked(c.auth !== 'none' && !node.connectionId ? 'conn' : 'input');
  };
  return html`<aside className="npanel" onMouseDown=${(e) => e.stopPropagation()} data-tour="panel" aria-label=${`${node.name} 配置`}>
    <div className="npanel-head">
      <span className="npanel-icon"><${NodeIcon} node=${node} size=${node.kind === 'action' || node.kind === 'trigger' ? 28 : 36} /></span>
      <div className="npanel-title">
        <${InlineEdit} value=${node.name} readOnly=${readOnly} maxLength=${50} onSave=${(v) => onChange({ name: v })} />
        <div className="npanel-sub"><span>${nodeTypeLabel(node)}</span><span className="mono">· ${refs[node.id]}</span></div>
      </div>
      <${Popover} placement="bottom-end" width=${280} trigger=${html`<button type="button" className="icon-btn icon-btn-sm icon-btn-ghost" aria-label="节点说明"><${Icon} name="CircleHelp" size=${14} /></button>`}>
        <div className="node-help">
          <div className="node-help-title">${opDef ? opDef.name : kindMeta(node).name}</div>
          <div className="text-xs muted">${(opDef && opDef.desc) || (c && c.desc) || (LOGIC_NODES.concat(HELPER_NODES, AI_NODES).find((x) => x.kind === node.kind) || {}).desc || '按配置处理上游数据后，把结果交给下游节点。'}</div>
          ${c && !c.builtin && html`<${Link} to=${`/connectors/${c.id}`} className="link text-xs">查看连接器详情<//>`}
        </div>
      <//>
      ${!readOnly && node.kind !== 'trigger' && html`<${MoreMenu} items=${[
        { label: '复制节点', icon: 'Copy', onClick: () => onCopy(node.id) },
        { divider: true },
        { label: '删除节点', icon: 'Trash2', danger: true, onClick: () => onDelete(node.id) },
      ]} />`}
      ${!readOnly && node.kind === 'trigger' && node.connector && html`<${IconButton} icon="Replace" size="sm" title="替换触发器" onClick=${onReplaceTrigger} />`}
      <${IconButton} icon="X" size="sm" title="关闭" onClick=${onClose} />
    </div>
    <div className="npanel-tabs"><${Tabs} value=${tab} onChange=${setPicked} items=${tabItems} /></div>
    <div className="npanel-body">
      ${readOnly && html`<div className="npanel-readonly"><${Icon} name="Eye" size=${14} />${readOnlyText || '查看模式，点击右上角「编辑」后可以修改配置'}</div>`}
      ${node.aiDraft && html`<div className="npanel-draft">
        <${Icon} name="Sparkles" size=${15} />
        <div className="grow"><b>AI 生成的节点，待你确认</b><div className="text-xs">检查操作、连接和入参是否符合预期，确认后这个标记会消失。</div></div>
        ${!readOnly && html`<${Button} size="xs" variant="primary" icon="Check" onClick=${() => { onChange({ aiDraft: undefined }); toast.success('已确认这个节点'); }}>确认无误<//>`}
      </div>`}
      ${tab === 'trigger' && (!node.connector
        ? html`<${Empty} size="sm" icon="Zap" title="还没有选择触发器" action=${!readOnly && html`<${Button} variant="primary" onClick=${onReplaceTrigger}>选择触发器<//>`} />`
        : html`<${OperationList} connector=${c} mode="trigger" selected=${node.op} readOnly=${readOnly} onPick=${pickOp} />`)}
      ${tab === 'op' && html`<${OperationList} connector=${c} mode="action" selected=${node.op} readOnly=${readOnly} onPick=${pickOp} />`}
      ${tab === 'conn' && html`<${ConnectionPanel} node=${node} onChange=${onChange} state=${state} readOnly=${readOnly} wf=${wf} onApplySame=${onApplySame} />`}
      ${tab === 'input' && html`<${Fragment}>
        ${!readOnly && ctx.upstream.length > 0 && html`<div className="linkhint"><${Icon} name="Lightbulb" size=${14} />按住参数左侧的圆圈拖到画布中的上游节点，可以连线获取出参</div>`}
        ${node.kind === 'code' && html`<${CodeConfig} node=${node} onConfig=${onConfig} ctx=${ctx} readOnly=${readOnly} />`}
        ${node.kind === 'ai' && html`<${AiConfig} node=${node} onConfig=${onConfig} ctx=${ctx} state=${state} readOnly=${readOnly} />`}
        ${node.kind === 'agent' && html`<${AgentConfig} node=${node} onConfig=${onConfig} ctx=${ctx} state=${state} readOnly=${readOnly} />`}
        ${node.kind === 'json' && html`<${JsonConfig} node=${node} onConfig=${onConfig} ctx=${ctx} readOnly=${readOnly} />`}
        ${(node.kind === 'action' || node.kind === 'trigger') && (fields.length
          ? fields.map((f) => html`<${ConfigField} key=${f} fkey=${f} node=${node} onConfig=${onConfig} ctx=${ctx} />`)
          : html`<${ObjectField} fkey="params" node=${node} onConfig=${onConfig} ctx=${ctx} def=${{ label: '请求参数', mode: 'object', placeholder: '{ "key": "value" }' }} />`)}
      <//>`}
      ${tab === 'settings' && html`<${Fragment}>
        ${node.connector === 'schedule' && html`<${ScheduleSettings} node=${node} onConfig=${onConfig} readOnly=${readOnly} />`}
        ${node.connector === 'webhook' && html`<${WebhookSettings} node=${node} onConfig=${onConfig} state=${state} wf=${wf} readOnly=${readOnly} />`}
        ${node.connector === 'alert' && html`<${AlertSettings} node=${node} onConfig=${onConfig} state=${state} wf=${wf} readOnly=${readOnly} />`}
        ${node.connector === 'forms' && html`<${FormSettings} node=${node} onConfig=${onConfig} state=${state} wf=${wf} readOnly=${readOnly} />`}
        ${node.connector === 'subflows' && html`<${SubflowSettings} node=${node} onConfig=${onConfig} readOnly=${readOnly} />`}
      <//>`}
      ${tab === 'tools' && html`<${AgentTools} node=${node} onConfig=${onConfig} ctx=${ctx} state=${state} readOnly=${readOnly} />`}
      ${tab === 'guard' && html`<${AgentGuard} node=${node} onConfig=${onConfig} state=${state} readOnly=${readOnly} wf=${wf} />`}
      ${tab === 'run' && html`<${RunSettings} node=${node} wf=${wf} state=${state} onChange=${onChange} ctx=${ctx} readOnly=${readOnly} />`}
      ${tab === 'test' && html`<${WebhookTest} node=${node} wf=${wf} state=${state} readOnly=${readOnly} onApply=${(data) => onChange({ sampleOutput: data })} />`}
      ${tab === 'config' && html`<${Fragment}>
        ${(node.kind === 'branch' || node.kind === 'parallel') && html`<${BranchConfig} node=${node} onChange=${onChange} ctx=${ctx} focusBranch=${focusBranch} readOnly=${readOnly} />`}
        ${node.kind === 'loop' && html`<${LoopConfig} node=${node} onConfig=${onConfig} ctx=${ctx} readOnly=${readOnly} />`}
        ${node.kind === 'delay' && html`<${DelayConfig} node=${node} onConfig=${onConfig} ctx=${ctx} readOnly=${readOnly} />`}
        ${node.kind === 'end' && html`<${EndConfig} node=${node} onConfig=${onConfig} readOnly=${readOnly} />`}
        ${node.kind === 'variable' && html`<${VariableConfig} node=${node} onConfig=${onConfig} ctx=${ctx} readOnly=${readOnly} />`}
      <//>`}
      ${tab === 'output' && html`<${Fragment}>
        <div className="panel-section-title" style=${{ justifyContent: 'space-between' }}>
          <span>出参结构 <span className="muted text-xs">${node.sampleOutput ? '已使用自定义出参' : '下游节点可以引用这些字段'}</span></span>
          <${CopyButton} text=${JSON.stringify(out, null, 2)} label="复制" />
        </div>
        <div className="card" style=${{ padding: 6 }}>
          ${out && Object.keys(out).length
            ? html`<${OutputTree} value=${out} prefix=${node.id} shown=${refs[node.id]} defaultOpen=${2} />`
            : html`<div className="text-xs muted" style=${{ padding: 8 }}>该节点没有出参</div>`}
        </div>
        ${!readOnly && node.kind !== 'loop' && html`<div className="row" style=${{ marginTop: 12 }}>
          <${Button} size="sm" icon="PencilLine" onClick=${() => setOutputOpen(true)}>编辑出参数据<//>
          <${Button} size="sm" variant="ghost" disabled=${!node.sampleOutput} onClick=${() => { onChange({ sampleOutput: undefined }); toast.success('已重置为默认出参'); }}>重置为默认出参<//>
        </div>`}
        <div className="sensitive-set">
          <div className="row">
            <${Switch} size="sm" checked=${Boolean(node.sensitive)} disabled=${readOnly} onChange=${(v) => onChange({ sensitive: v || undefined })} />
            <b className="grow">出参包含敏感信息</b>
            <${Icon} name=${node.sensitive ? 'EyeOff' : 'Eye'} size=${14} className="muted" />
          </div>
          <div className="text-xs muted">${node.sensitive
            ? '运行日志里这个节点的全部出参都会脱敏显示，查看原文需要权限、填写原因并记录审计。'
            : maskCount > 0
              ? `按平台的脱敏规则，日志里会自动遮盖其中 ${maskCount} 个字段（手机号、证件号、密钥等）。整个出参都敏感时打开这个开关。`
              : '开启后，运行日志里这个节点的全部出参都会脱敏显示。脱敏规则由平台管理员在「数据与隐私」中设置。'}</div>
        </div>
        <${EditOutputModal} open=${outputOpen} onClose=${() => setOutputOpen(false)} value=${out} onSave=${(v) => { onChange({ sampleOutput: v }); toast.success('已更新出参结构'); }} />
      <//>`}
      ${tab === 'error' && html`<${ErrorHandling} node=${node} onSettings=${onSettings} readOnly=${readOnly} onApplyAll=${onApplyErrorAll} />`}
    </div>
    ${mcpServer && html`<div className="npanel-foot">
      <${Icon} name="Server" size=${14} className="muted" />
      <span className="text-xs ellipsis">MCP 服务器「${mcpServer.name}」</span>
      <${Tag} size="sm" tone=${mcpServer.status === 'connected' ? 'success' : 'danger'} dot>${mcpServer.status === 'connected' ? '已连接' : '连接异常'}<//>
      <span className="spacer" />
      <${Link} to=${`/connectors/${mcpServer.id}`} className="link text-xs">服务器详情<//>
    </div>`}
    ${version && html`<div className="npanel-foot">
      <${Popover}
        placement="top-start"
        width=${240}
        open=${versionOpen}
        onOpenChange=${setVersionOpen}
        trigger=${html`<button type="button" className="btn btn-ghost btn-sm" disabled=${readOnly && versions.length < 2}>版本号 ${version.version} <${Icon} name="ChevronDown" size=${12} /></button>`}
      >
        <div className="menu" style=${{ padding: 4 }}>
          ${versions.map((v) => html`<button key=${v.version} type="button" disabled=${readOnly} className=${cx('menu-item', v.version === version.version && 'is-active')} onClick=${() => {
            setVersionOpen(false);
            if (v.version === version.version) return;
            onChange({ connectorVersion: v.version });
            if (v.status === 'deprecated') toast.warning(`已切换到 ${v.version}，该版本已停止支持，建议使用最新版本`);
            else toast.success(`已切换到 ${v.version}`);
          }}>
            <span className="menu-item-body"><span className="menu-item-label">版本号 ${v.version}</span><span className="menu-item-desc">${v.status === 'released' && v.version === (versions.find((x) => x.status === 'released') || {}).version ? '最新版本' : (VERSION_STATUS[v.status] || VERSION_STATUS.released).label}</span></span>
            ${v.version === version.version && html`<${Icon} name="Check" size=${14} className="menu-item-check" />`}
          </button>`)}
        </div>
      <//>
      ${version.status === 'deprecated' && html`<${Tag} size="sm" tone="warning">停止支持<//>`}
      <span className="spacer" />
      ${c.official ? html`<${Tag} size="sm" tone="outline">官方<//>` : html`<${Tag} size="sm" tone="primary">${c.custom ? '自定义' : '社区'}<//>`}
    </div>`}
  </aside>`;
}
