const ISSUES_STATUS = {
  open: { label: '未处理', tone: 'danger' },
  investigating: { label: '处理中', tone: 'info' },
  resolved: { label: '已解决', tone: 'success' },
  ignored: { label: '已忽略', tone: 'default' },
};

const ISSUES_SEVERITY = {
  high: { label: '高', tone: 'danger', rank: 0 },
  medium: { label: '中', tone: 'warning', rank: 1 },
  low: { label: '低', tone: 'default', rank: 2 },
};

const ISSUES_MUTE_HOURS = [1, 4, 24];

const ISSUES_STATUS_FILTERS = [
  { value: 'active', label: '未关闭' },
  { value: 'open', label: '未处理' },
  { value: 'reopened', label: '复发' },
  { value: 'investigating', label: '处理中' },
  { value: 'today', label: '今日新增与复发' },
  { value: 'muted', label: '静默中' },
  { value: 'resolved', label: '已解决' },
  { value: 'ignored', label: '已忽略' },
  { value: 'all', label: '全部状态' },
];

const ISSUES_ALERT_KINDS = {
  new: { label: '新问题', tone: 'danger' },
  reopen: { label: '复发', tone: 'danger' },
  threshold: { label: '超过阈值', tone: 'warning' },
  escalated: { label: '已升级', tone: 'warning' },
  ongoing: { label: '仍在失败', tone: 'default' },
};

const ISSUES_EVENTS = [
  { value: 'issue_new', label: '出现新问题', desc: '某个原因第一次导致运行失败时通知。同一原因之后的失败合并进这个问题，不再逐条通知。' },
  { value: 'issue_reopen', label: '问题复发', desc: '已解决的问题再次失败时通知，问题会自动重新打开。' },
  { value: 'connection_invalid', label: '连接失效', desc: '连接认证失败或授权过期时通知，所有用到它的工作流算作同一个问题。' },
  { value: 'failure_rate', label: '失败率超过阈值', desc: '统计窗口内失败次数占比超过阈值时通知，用来发现偶发失败的累积。' },
  { value: 'worker_offline', label: '工作节点离线', desc: '工作节点超过 3 分钟没有心跳时通知，运行会排队变慢。' },
];

const ISSUES_RATE_WINDOWS = [
  { value: '15m', label: '15 分钟' },
  { value: '1h', label: '1 小时' },
  { value: '6h', label: '6 小时' },
  { value: '24h', label: '24 小时' },
];

const ISSUES_TRANSIENT_HTTP = [429, 503, 504, 529];

const ISSUES_REPLAY_CONCURRENCY = [1, 3, 5, 10];

const ISSUES_REPLAY_MODES = {
  node: { label: '从失败节点重跑', short: '从失败节点', icon: 'SkipForward' },
  full: { label: '整体重跑', short: '整体', icon: 'RotateCcw' },
};

const ISSUES_CHANNEL_TYPES = {
  feishu: {
    label: '飞书群机器人', connector: 'feishu', targetLabel: 'Webhook 地址', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/…',
    hint: '在飞书群设置的「群机器人」里添加自定义机器人，复制它的 Webhook 地址。',
    pattern: /^https:\/\/open\.(feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]{8,}$/,
    error: '请填写飞书自定义机器人的 Webhook 地址，以 https://open.feishu.cn/open-apis/bot/v2/hook/ 开头',
    secret: { label: '签名校验密钥', hint: '机器人开启了「签名校验」时填写', pattern: /^[A-Za-z0-9]{8,}$/, error: '签名校验密钥只包含字母和数字，至少 8 位' },
  },
  wecom: {
    label: '企业微信群机器人', connector: 'wecom', targetLabel: 'Webhook 地址', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
    hint: '在企业微信群里「添加群机器人」后复制 Webhook 地址。',
    pattern: /^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[A-Za-z0-9-]{8,}$/,
    error: '请填写企业微信群机器人的 Webhook 地址，形如 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
  },
  dingtalk: {
    label: '钉钉群机器人', connector: 'dingtalk', targetLabel: 'Webhook 地址', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=…',
    hint: '在钉钉群设置的「机器人」里添加自定义机器人，复制 Webhook 地址。',
    pattern: /^https:\/\/oapi\.dingtalk\.com\/robot\/send\?access_token=[A-Za-z0-9]{16,}$/,
    error: '请填写钉钉自定义机器人的 Webhook 地址，形如 https://oapi.dingtalk.com/robot/send?access_token=…',
    secret: { label: '加签密钥', hint: '安全设置选了「加签」时填写，以 SEC 开头', pattern: /^SEC[A-Za-z0-9]{16,}$/, error: '加签密钥以 SEC 开头，后面至少 16 位字母或数字' },
  },
  slack: {
    label: 'Slack', connector: 'slack', targetLabel: 'Incoming Webhook 地址', placeholder: 'https://hooks.slack.com/services/…',
    hint: '在 Slack 应用的 Incoming Webhooks 里为频道生成地址。',
    pattern: /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/,
    error: '请填写 Slack Incoming Webhook 地址，以 https://hooks.slack.com/services/ 开头',
  },
  webhook: {
    label: 'Webhook', icon: 'Webhook', targetLabel: '接收地址', placeholder: 'https://oncall.example.com/hooks/alert',
    hint: '平台会以 POST 发送 JSON，包含问题标题、影响、负责人和问题链接。',
    pattern: /^https?:\/\/[^\s/?#]+\.[^\s/?#]+(:\d+)?([/?#]\S*)?$/,
    error: '请填写以 http:// 或 https:// 开头的完整地址',
    secret: { label: '签名密钥', hint: '平台用它对请求体做 HMAC-SHA256 签名，放在 X-Signature 请求头', pattern: /^\S{8,}$/, error: '签名密钥至少 8 位，不能包含空格' },
  },
  email: {
    label: '邮件', icon: 'Mail', targetLabel: '收件人', placeholder: 'it-ops@xinghe.tech, lihang@xinghe.tech',
    hint: '多个收件人用逗号分隔，最多 20 个。',
    error: '请填写有效的邮箱地址，多个用逗号分隔',
  },
};

const issuesIndexCache = new WeakMap();

const issuesChildCache = new WeakMap();

function issuesCollect(state) {
  return collectIssues({ ...state, runs: logsVisibleRuns(state) });
}

function issuesRunIndex(state) {
  const cached = issuesIndexCache.get(state.runs);
  if (cached) return cached;
  const map = new Map(state.runs.map((r) => [r.id, r]));
  issuesIndexCache.set(state.runs, map);
  return map;
}

function issuesChildren(state) {
  const cached = issuesChildCache.get(state.runs);
  if (cached) return cached;
  const map = state.runs.reduce((acc, r) => (r.retryOf ? acc.set(r.retryOf, [...(acc.get(r.retryOf) || []), r]) : acc), new Map());
  issuesChildCache.set(state.runs, map);
  return map;
}

function issuesChainRoot(state, run) {
  const byId = issuesRunIndex(state);
  const seen = new Set([run.id]);
  let cur = run;
  while (cur.retryOf && byId.get(cur.retryOf) && !seen.has(cur.retryOf)) {
    seen.add(cur.retryOf);
    cur = byId.get(cur.retryOf);
  }
  return cur;
}

function issuesChain(state, root) {
  const children = issuesChildren(state);
  const out = [];
  const seen = new Set();
  const queue = [root];
  while (queue.length) {
    const r = queue.shift();
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    (children.get(r.id) || []).forEach((c) => queue.push(c));
  }
  return out;
}

function issuesLatestAttempt(state, run) {
  return issuesChain(state, issuesChainRoot(state, run)).reduce((a, b) => (b.startedAt > a.startedAt ? b : a), run);
}

function issuesSettled(state, run) {
  if (!run) return false;
  return issuesChain(state, issuesChainRoot(state, run)).some((r) => r.status === 'success');
}

function issuesMuted(issue, now) {
  return Boolean(issue.mutedUntil && issue.mutedUntil > (now || Date.now())) && !['resolved', 'ignored'].includes(issue.status);
}

function issuesDayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function issuesReopenAt(issue, byId) {
  if (!issue.reopened || !issue.resolvedAt) return null;
  const after = issue.runIds.map((id) => byId.get(id)).filter((r) => r && r.startedAt > issue.resolvedAt);
  return after.length ? Math.min(...after.map((r) => r.startedAt)) : null;
}

function issuesReopenCount(issue, byId) {
  if (!issue.reopened || !issue.resolvedAt) return 0;
  return issue.runIds.map((id) => byId.get(id)).filter((r) => r && r.startedAt > issue.resolvedAt).length;
}

function issuesIsToday(issue, byId, now) {
  const start = issuesDayStart(now);
  if (issue.firstAt >= start) return true;
  const at = issuesReopenAt(issue, byId);
  return Boolean(at && at >= start);
}

function issuesSpark(issue, byId, now) {
  const today = issuesDayStart(now);
  const starts = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY);
  return starts.map((s) => issue.runIds.reduce((n, id) => {
    const r = byId.get(id);
    return r && r.startedAt >= s && r.startedAt < s + DAY ? n + 1 : n;
  }, 0));
}

function issuesProjectNames(state, pids) {
  return pids.map((pid) => (state.projects.find((p) => p.id === pid) || { name: '已删除的项目' }).name).join('、');
}

function issuesCanAct(state, issue) {
  return issue.projectIds.length > 0 && issue.projectIds.every((pid) => canEditProject(state, pid));
}

function issuesActReason(state, issue) {
  if (issuesCanAct(state, issue)) return '';
  const ro = issue.projectIds.filter((pid) => !canEditProject(state, pid));
  return `你在「${issuesProjectNames(state, ro)}」只有查看权限，不能处理这个问题`;
}

function issuesCanManageAlerts(state) {
  const me = state.users.find((u) => u.id === state.me);
  return Boolean(me && ['owner', 'admin'].includes(me.role));
}

function issuesAssigneeOptions(state, issues) {
  const eligible = (uid) => issues.every((i) => i.projectIds.some((pid) => ['owner', 'editor'].includes(projectRole(state, pid, uid))));
  const pids = [...new Set(issues.flatMap((i) => i.projectIds))];
  return state.users.filter((u) => u.status === 'active' && eligible(u.id)).map((u) => {
    const roles = pids.map((pid) => ({ pid, role: projectRole(state, pid, u.id) })).filter((x) => x.role);
    return {
      value: u.id,
      label: u.id === state.me ? `${u.name}（我）` : u.name,
      desc: roles.map((x) => `${issuesProjectNames(state, [x.pid])} · ${roleLabel(x.role)}`).join('、'),
      iconNode: html`<${Avatar} name=${u.name} size=${20} />`,
    };
  });
}

function issuesNodeOf(state, issue) {
  if (!issue.nodeId) return null;
  const wf = state.workflows.find((w) => w.id === issue.workflowIds[0]);
  if (!wf) return null;
  const latest = issuesRunIndex(state).get(issue.runIds[0]);
  const graph = latest ? graphForRun(latest, wf) : null;
  return findInWorkflow(graph ? { ...wf, ...graph } : wf, issue.nodeId) || findInWorkflow(wf, issue.nodeId);
}

function issuesPatch(items, patch, log) {
  const now = Date.now();
  const me = Store.get().me;
  Store.set((s) => {
    const next = { ...(s.issueStates || {}) };
    items.forEach((issue) => {
      const saved = next[issue.sig] || { status: 'open', assignee: null, mutedUntil: null, notes: [], resolvedAt: null, resolvedBy: null };
      const change = typeof patch === 'function' ? patch(saved, issue) : patch;
      const text = log && (typeof log.text === 'function' ? log.text(saved, issue) : log.text);
      const history = text ? [...(saved.history || []), { id: uid('ih'), at: now, by: me, action: log.action, text }] : saved.history || [];
      next[issue.sig] = { ...saved, ...change, history };
    });
    return { ...s, issueStates: next };
  });
  if (log && log.audit) items.forEach((issue) => addAudit(log.audit, issue.title, issue.projectIds[0] || null));
}

function issuesSetStatus(items, status) {
  const label = ISSUES_STATUS[status].label;
  const me = Store.get().me;
  if (status === 'resolved') {
    issuesPatch(items, { status, resolvedAt: Date.now(), resolvedBy: me }, { action: 'resolve', text: '标记为已解决', audit: '解决问题' });
  } else if (status === 'ignored') {
    issuesPatch(items, { status }, { action: 'ignore', text: '忽略了这个问题', audit: '忽略问题' });
  } else {
    issuesPatch(items, { status }, { action: 'status', text: (saved) => (saved.status === 'resolved' || saved.status === 'ignored' ? `重新打开，状态改为「${label}」` : `把状态改为「${label}」`), audit: '更新问题状态' });
  }
}

function issuesAssign(items, userId) {
  issuesPatch(items, { assignee: userId || null }, { action: 'assign', text: userId ? `把负责人改为 ${personName(userId)}` : '取消了负责人', audit: '指派问题' });
}

function issuesMute(items, hours) {
  if (!hours) {
    issuesPatch(items, { mutedUntil: null }, { action: 'unmute', text: '取消静默', audit: '取消静默问题' });
    return;
  }
  const until = Date.now() + hours * HOUR;
  issuesPatch(items, { mutedUntil: until }, { action: 'mute', text: `静默 ${hours} 小时（到 ${fmt.short(until)}）`, audit: '静默问题' });
}

function issuesUnsettled(state, issue) {
  const byId = issuesRunIndex(state);
  return issue.runIds.filter((id) => !issuesSettled(state, byId.get(id))).length;
}

async function issuesConfirmResolve(state, items) {
  const pending = items.map((i) => ({ issue: i, n: issuesUnsettled(state, i) })).filter((x) => x.n > 0);
  if (!pending.length) return true;
  const total = pending.reduce((a, x) => a + x.n, 0);
  return confirmDialog({
    title: items.length > 1 ? `把 ${items.length} 个问题标记为已解决？` : '标记为已解决？',
    content: `还有 ${total} 次失败的运行没有重跑成功。标记为已解决后它们不会自动重跑；之后再次失败时问题会重新打开并告警。`,
    okText: '标记已解决',
  });
}

function issuesConfirmIgnore(count) {
  return confirmDialog({
    title: count > 1 ? `忽略 ${count} 个问题？` : '忽略这个问题？',
    content: '忽略后不再计入未处理，也不会再告警；之后再次失败时仍保持忽略。确认是偶发问题或已知的数据问题时再忽略。',
    okText: '忽略',
  });
}

function issuesSmtpReady(state) {
  const sys = state.system || {};
  if (sys.smtp && typeof sys.smtp.configured === 'boolean') return sys.smtp.configured;
  return !((sys.setup && sys.setup.skipped) || []).includes('smtp');
}

function issuesChannelState(state, ch) {
  if (!ch) return { ok: false, reason: '渠道已删除' };
  if (ch.type === 'email') return issuesSmtpReady(state) ? { ok: true, reason: '' } : { ok: false, reason: '没有配置 SMTP 服务，邮件发不出去' };
  if (ch.status === 'unavailable') return { ok: false, reason: '渠道不可用，请检查地址后重新测试' };
  return { ok: true, reason: '' };
}

function issuesChannelText(ch) {
  const t = String(ch.target || '');
  if (!/^https?:\/\//i.test(t)) return t;
  const m = /^https?:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(t);
  if (!m) return t;
  const hide = (x) => (x.length > 12 ? `…${x.slice(-4)}` : x);
  const path = m[2].split('/').map(hide).join('/');
  const qs = m[3] ? `?${m[3].slice(1).split('&').map((kv) => { const [k, v = ''] = kv.split('='); return `${k}=${hide(v)}`; }).join('&')}` : '';
  return `${m[1]}${path}${qs}`;
}

function issuesPrivateHost(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(url || ''));
  if (!m) return false;
  const h = m[1].toLowerCase();
  return h === 'localhost' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h);
}

function IssuesChannelIcon({ type, size = 28 }) {
  const t = ISSUES_CHANNEL_TYPES[type] || ISSUES_CHANNEL_TYPES.webhook;
  return t.connector ? html`<${ConnectorIcon} id=${t.connector} size=${size} />` : html`<${KindTile} icon=${t.icon} size=${size} />`;
}

function issuesPolicyScope(p, run) {
  return (!(p.projects || []).length || p.projects.includes(run.projectId)) && (!(p.workflows || []).length || p.workflows.includes(run.workflowId));
}

function issuesPolicyCovers(p, issue, byId) {
  const ev = p.events || [];
  const kind = issue.kind === 'connection' ? ev.some((e) => ['connection_invalid', 'issue_new', 'issue_reopen'].includes(e)) : ev.some((e) => ['issue_new', 'issue_reopen'].includes(e));
  return kind && issue.runIds.some((id) => { const r = byId.get(id); return r && issuesPolicyScope(p, r); });
}

function issuesParseClock(text) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(text || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function issuesInQuiet(quiet, ts) {
  if (!quiet || !quiet.enabled) return false;
  const from = issuesParseClock(quiet.from);
  const to = issuesParseClock(quiet.to);
  if (from === null || to === null || from === to) return false;
  const d = new Date(ts);
  const m = d.getHours() * 60 + d.getMinutes();
  return from < to ? m >= from && m < to : m >= from || m < to;
}

function issuesMinutesLabel(min) {
  if (min % 1440 === 0) return `${min / 1440} 天`;
  if (min % 60 === 0) return `${min / 60} 小时`;
  return `${min} 分钟`;
}

function issuesRecordAlerts(before, after, failedRuns) {
  if (!failedRuns.length) return { created: 0, merged: 0 };
  const live = Store.get();
  const now = Date.now();
  const policies = (live.alertPolicies || []).filter((p) => p.enabled);
  const bySig = failedRuns.reduce((acc, r) => {
    const sig = issueSignature(r);
    return sig ? { ...acc, [sig]: [...(acc[sig] || []), r] } : acc;
  }, {});
  const created = [];
  const merges = new Map();
  const notes = [];
  Object.entries(bySig).forEach(([sig, runs]) => {
    const prev = before.find((i) => i.sig === sig);
    const cur = after.find((i) => i.sig === sig);
    if (!cur || cur.status === 'ignored' || issuesMuted(cur, now)) return;
    const kind = cur.reopened && !(prev && prev.reopened) ? 'reopen' : prev ? 'ongoing' : 'new';
    const conn = cur.kind === 'connection';
    policies.filter((p) => runs.some((r) => issuesPolicyScope(p, r))).forEach((p) => {
      const ev = p.events || [];
      const wants = kind === 'reopen' ? ev.includes('issue_reopen') || (conn && ev.includes('connection_invalid')) : ev.includes('issue_new') || (conn && ev.includes('connection_invalid'));
      if (!wants) return;
      const last = (live.alertEvents || []).filter((e) => e.policyId === p.id && e.issue === sig).sort((a, b) => b.at - a.at)[0];
      if (kind !== 'reopen' && last && now - last.at < (p.groupWindow || 30) * MIN) {
        merges.set(last.id, (merges.get(last.id) || 0) + runs.length);
        return;
      }
      const channels = (p.channels || []).filter((cid) => issuesChannelState(live, (live.channels || []).find((c) => c.id === cid)).ok);
      created.push({ id: uid('ae'), policyId: p.id, issue: sig, kind, at: now, channels, merged: runs.length, ...(issuesInQuiet(p.quiet, now) ? { deferred: true } : {}) });
    });
    if (kind === 'reopen') {
      notes.push({ id: uid('nt'), type: 'issue', title: `问题复发：${cur.title}`, desc: `已解决后又失败了 ${runs.length} 次，问题已重新打开`, time: now, read: false, to: `/issues/${encodeURIComponent(sig)}` });
    }
  });
  Store.set((s) => ({
    ...s,
    alertEvents: [...created, ...(s.alertEvents || []).map((e) => (merges.has(e.id) ? { ...e, merged: (e.merged || 1) + merges.get(e.id) } : e))],
    notifications: [...notes, ...s.notifications],
  }));
  return { created: created.length, merged: [...merges.values()].reduce((a, b) => a + b, 0) };
}

function issuesReplayGate(run, state) {
  if (!run) return '运行记录不存在，或已超过日志保留期';
  if (run.kind !== 'run') return '调试日志不能重跑';
  if (run.status === 'deduped') return '被去重的触发没有执行，不需要重跑';
  if (!['failed', 'timeout'].includes(run.status)) return '只有失败或超时的运行可以重跑';
  const wf = state.workflows.find((w) => w.id === run.workflowId);
  if (!wf) return '工作流已删除，无法重跑';
  if (!canEditProject(state, run.projectId)) return `你在「${issuesProjectNames(state, [run.projectId])}」只有查看权限，不能重跑`;
  if (wf.trigger && wf.trigger.connector === 'subflows') return '子流程的运行不能单独重跑，请重跑调用它的工作流';
  const env = run.env || 'prod';
  const staged = isStagedProject(state, run.projectId);
  const where = staged ? (env === 'test' ? '在测试环境' : '在生产环境') : '';
  const dep = deploymentOf(wf, env);
  if (!dep || !(dep.version > 0)) return `工作流${where}还没有已发布的版本，无法重跑`;
  if (dep.status !== 'enabled') return `工作流${where}已停止运行，启动后才能重跑`;
  return null;
}

function issuesNodeConnection(node) {
  if (!node) return null;
  return node.kind === 'ai' || node.kind === 'agent' ? (node.config || {}).connectionId : node.connectionId;
}

function issuesReplayGraph(state, wf, version) {
  const v = state.versions.find((x) => x.workflowId === wf.id && x.version === version);
  return v && v.snapshot ? { ...wf, ...v.snapshot } : wf;
}

function issuesBrokenOnPath(state, run, graph, mode) {
  const taken = new Set(buildRunTrace(run, graph).flatMap((t) => t.meta.branchIds || []));
  const path = logsExecPath(graph.steps, taken);
  const from = mode === 'node' ? path.findIndex((n) => n.id === run.failedNodeId) : 0;
  const scope = from >= 0 ? path.slice(from) : path;
  const env = run.env || 'prod';
  return scope.map((node) => {
    const cid = issuesNodeConnection(node);
    if (!cid) return null;
    const mapped = envConnectionId(state, run.projectId, env, cid);
    const conn = state.connections.find((c) => c.id === mapped);
    if (!conn) return { node, conn: null };
    return conn.status !== 'active' ? { node, conn } : null;
  }).find(Boolean) || null;
}

function issuesReplayPlan(state, runIds, { mode, version }) {
  const byId = issuesRunIndex(state);
  const groups = new Map();
  const excluded = [];
  [...new Set(runIds)].forEach((id) => {
    const run = byId.get(id);
    if (!run) { excluded.push({ id, run: null, reason: '运行记录不存在，或已超过日志保留期' }); return; }
    const root = issuesChainRoot(state, run);
    const g = groups.get(root.id) || { root, selected: [] };
    groups.set(root.id, { root, selected: [...g.selected, run] });
  });
  const items = [];
  const merged = [];
  groups.forEach(({ root, selected }) => {
    const chain = issuesChain(state, root);
    const busy = chain.find((r) => r.retryOf && ['running', 'waiting'].includes(r.status));
    if (busy) { selected.forEach((r) => excluded.push({ id: r.id, run: r, reason: '这次触发正在重跑中' })); return; }
    const done = chain.find((r) => r.retryOf && r.status === 'success');
    if (done) { selected.forEach((r) => excluded.push({ id: r.id, run: r, reason: '已经重跑成功', link: done.id })); return; }
    const failedAttempts = chain.filter((r) => ['failed', 'timeout'].includes(r.status) && r.kind === 'run');
    const target = failedAttempts.length ? failedAttempts.reduce((a, b) => (b.startedAt > a.startedAt ? b : a)) : null;
    if (!target) { selected.forEach((r) => excluded.push({ id: r.id, run: r, reason: issuesReplayGate(r, state) || '没有可重跑的失败记录' })); return; }
    const gate = issuesReplayGate(target, state);
    if (gate) { selected.forEach((r) => excluded.push({ id: r.id, run: r, reason: gate })); return; }
    selected.filter((r) => r.id !== target.id).forEach((r) => merged.push({ id: r.id, run: r, into: target.id }));
    const wf = state.workflows.find((w) => w.id === target.workflowId);
    const env = target.env || 'prod';
    const dep = deploymentOf(wf, env);
    const ver = version === 'latest' ? dep.version : target.version;
    const graph = issuesReplayGraph(state, wf, ver);
    const failedNode = target.failedNodeId ? findInWorkflow(graph, target.failedNodeId) : null;
    const base = { id: target.id, run: target, wf: graph, env, version: ver, node: failedNode, swapped: !selected.some((r) => r.id === target.id) };
    if (mode === 'node' && target.failedNodeId && !failedNode) {
      excluded.push({ id: target.id, run: target, reason: `失败节点在 v${ver} 中已不存在，请改用整体重跑` });
      return;
    }
    const broken = issuesBrokenOnPath(state, target, graph, mode);
    if (broken) {
      const perm = broken.conn ? connectionPerm(state, broken.conn) : null;
      const manage = perm === 'owner' || perm === 'edit';
      items.push({
        ...base, category: 'blocked',
        reason: broken.conn
          ? `连接「${broken.conn.name}」仍未恢复${broken.conn.error ? `（${broken.conn.error}）` : ''}，节点「${broken.node.name}」会再次失败`
          : `节点「${broken.node.name}」使用的连接已被删除，需要在工作流里重新选择连接`,
        fix: broken.conn
          ? (manage ? { label: '前往重新授权', to: `/connections?id=${broken.conn.id}` } : { label: '查看连接', to: `/connections?id=${broken.conn.id}`, note: `需要所有者${personName(broken.conn.owner)}重新授权` })
          : null,
        connId: broken.conn ? broken.conn.id : null,
      });
      return;
    }
    const f = target.failure || {};
    const code = String(f.code || '');
    const connFailure = code.startsWith('CONNECTION_');
    const transient = ISSUES_TRANSIENT_HTTP.includes(f.http_status);
    const fixed = wf.updatedAt > target.startedAt && (version === 'latest' || target.version === dep.version);
    const dataError = f.http_status === 422 || /未审核|不存在|缺少|不匹配/.test(String(f.message || ''));
    if (dataError && !connFailure) {
      items.push({ ...base, category: 'stale', reason: '这是目标系统里的数据问题，改工作流不会让结果不同；先在目标系统里处理好，再重跑', outcome: { status: target.status === 'timeout' ? 'timeout' : 'failed', failedNodeId: target.failedNodeId, failure: target.failure } });
      return;
    }
    if (connFailure) { items.push({ ...base, category: 'ready', note: '连接已恢复', outcome: { status: 'success' } }); return; }
    if (transient) { items.push({ ...base, category: 'ready', note: `偶发错误（HTTP ${f.http_status}）`, outcome: { status: 'success' } }); return; }
    if (fixed) { items.push({ ...base, category: 'ready', note: `工作流在失败后修改过（${fmt.short(wf.updatedAt)}）`, outcome: { status: 'success' } }); return; }
    items.push({
      ...base, category: 'stale',
      reason: version === 'original' && wf.updatedAt > target.startedAt ? '失败后的修改只在新版本里，选择原版本会再次失败' : '工作流在这次失败之后没有修改过，重跑大概率会再次失败',
      outcome: { status: target.status === 'timeout' ? 'timeout' : 'failed', failedNodeId: target.failedNodeId, failure: target.failure },
    });
  });
  return { items, excluded, merged };
}

function issuesReplayMake(item, { mode, me, at }) {
  const run = item.run;
  const base = {
    id: uid('run'), workflowId: run.workflowId, projectId: run.projectId, env: item.env, kind: 'run', version: item.version,
    startedAt: at, triggerType: ISSUES_REPLAY_MODES[mode].label, retryOf: run.id, retryBy: me,
    ...(mode === 'node' && run.failedNodeId ? { startNodeId: run.failedNodeId } : {}),
    ...(run.payload ? { payload: run.payload } : {}),
    ...(run.bizKey ? { bizKey: run.bizKey } : {}),
    ...(run.vars ? { vars: run.vars } : {}),
    ...(run.ai && (mode === 'full' || (item.node && ['ai', 'agent'].includes(item.node.kind))) ? { ai: run.ai } : {}),
  };
  const outcome = item.outcome || { status: 'success' };
  const draft = outcome.status === 'success'
    ? { ...base, status: 'success', errors: 0 }
    : { ...base, status: outcome.status, errors: 1, failedNodeId: outcome.failedNodeId, failure: outcome.failure };
  const trace = buildRunTrace(draft, item.wf);
  const duration = outcome.status === 'timeout' ? 600000 : trace.reduce((a, t) => a + (t.duration || 0), 0);
  return { ...draft, duration };
}

function IssuesStatusTag({ issue, size = 'md' }) {
  if (issue.reopened) return html`<${Tag} tone="danger" size=${size} icon="RotateCcw">复发<//>`;
  const m = ISSUES_STATUS[issue.status] || ISSUES_STATUS.open;
  return html`<${Tag} tone=${m.tone} size=${size} dot>${m.label}<//>`;
}

function IssuesSeverityTag({ severity, size = 'sm' }) {
  const m = ISSUES_SEVERITY[severity] || ISSUES_SEVERITY.low;
  return html`<${Tag} tone=${m.tone} size=${size}>${m.label}<//>`;
}

function IssuesKindIcon({ issue, state, size = 30 }) {
  if (issue.kind === 'connection') {
    const conn = state.connections.find((c) => c.id === issue.connectionId);
    return conn ? html`<${ConnectorIcon} id=${conn.connector} size=${size} />` : html`<${KindTile} icon="Link2Off" size=${size} />`;
  }
  const node = issuesNodeOf(state, issue);
  return node ? html`<${NodeIcon} node=${node} size=${size} />` : html`<${KindTile} icon="CircleAlert" size=${size} />`;
}

function IssuesSpark({ data, muted }) {
  const max = Math.max(1, ...data);
  const total = data.reduce((a, b) => a + b, 0);
  const bw = 7;
  const gap = 2;
  const h = 24;
  const w = data.length * bw + (data.length - 1) * gap;
  const peak = Math.max(...data);
  return html`<${Tooltip} content=${total ? `近 7 天失败 ${total} 次，单日最多 ${peak} 次（最右是今天）` : '近 7 天没有失败'}>
    <svg width=${w} height=${h} className=${cx('iss-spark', muted && 'is-muted')} role="img" aria-label=${`近 7 天每天失败次数：${data.join('、')}`}>
      ${data.map((v, i) => {
        const bh = v ? Math.max(3, Math.round((v / max) * (h - 2))) : 1;
        const x = i * (bw + gap);
        return v
          ? html`<path key=${i} d=${issuesRoundTop(x, h - bh, bw, bh, 2)} className="iss-spark-bar" />`
          : html`<rect key=${i} x=${x} y=${h - 1} width=${bw} height=${1} className="iss-spark-zero" />`;
      })}
    </svg>
  <//>`;
}

function issuesRoundTop(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function issuesTicks(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) || Math.ceil(raw));
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

function issuesBuckets(mode, now) {
  if (mode === 'hour') {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    const top = d.getTime();
    return Array.from({ length: 24 }, (_, i) => {
      const start = top - (23 - i) * HOUR;
      const last = i === 23;
      return { start, end: last ? now + 1 : start + HOUR, label: `${fmt.pad(new Date(start).getHours())}:00`, title: `${fmt.short(start)} - ${last ? '现在' : fmt.short(start + HOUR).slice(6)}` };
    });
  }
  const today = issuesDayStart(now);
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const last = i === 29;
    return { start: d.getTime(), end: last ? now + 1 : next.getTime(), label: `${d.getMonth() + 1}/${d.getDate()}`, title: `${d.getMonth() + 1}月${d.getDate()}日${last ? '（今天）' : ''}` };
  });
}

function IssuesOccurrenceChart({ runs, resolvedAt }) {
  const [mode, setMode] = useState(() => (runs.every((r) => r.startedAt >= Date.now() - DAY) ? 'hour' : 'day'));
  const [view, setView] = useState('chart');
  const [hover, setHover] = useState(null);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);
  const now = Date.now();
  const buckets = issuesBuckets(mode, now);
  const counts = buckets.map((b) => runs.filter((r) => r.startedAt >= b.start && r.startedAt < b.end).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const height = 188;
  const pad = { l: 36, r: 12, t: 18, b: 26 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;
  const n = buckets.length;
  const band = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const ticks = issuesTicks(Math.max(0, ...counts));
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => pad.t + plotH * (1 - v / top);
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 52))));
  const markIdx = resolvedAt ? buckets.findIndex((b) => resolvedAt >= b.start && resolvedAt < b.end) : -1;
  const markX = markIdx >= 0 ? pad.l + (markIdx + (resolvedAt - buckets[markIdx].start) / Math.max(1, buckets[markIdx].end - buckets[markIdx].start)) * band : null;
  const hv = hover != null && hover < n ? hover : null;
  const tipX = hv != null ? pad.l + (hv + 0.5) * band : 0;
  const tipStyle = tipX > width / 2 ? { right: width - tipX + 10 } : { left: tipX + 10 };
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = band ? Math.floor((e.clientX - rect.left) / band) : -1;
    setHover(i >= 0 && i < n ? i : null);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => (h == null ? n - 1 : Math.min(n - 1, h + 1))); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => (h == null ? n - 1 : Math.max(0, h - 1))); }
    else if (e.key === 'Escape') setHover(null);
  };
  const nonZero = buckets.map((b, i) => ({ b, v: counts[i] })).filter((x) => x.v > 0);
  return html`<${Card}
    className="iss-card"
    title="发生趋势"
    subtitle=${`${mode === 'hour' ? '近 24 小时' : '近 30 天'}失败 ${total} 次${resolvedAt && markIdx >= 0 ? '，竖线是标记为已解决的时间' : ''}`}
    extra=${html`<${Fragment}>
      <${Segmented} size="sm" value=${mode} onChange=${(v) => { setMode(v); setHover(null); }} options=${[{ value: 'hour', label: '按小时' }, { value: 'day', label: '按天' }]} />
      <${IconButton} size="sm" icon=${view === 'chart' ? 'Table2' : 'ChartColumn'} title=${view === 'chart' ? '以表格查看' : '以图表查看'} onClick=${() => setView(view === 'chart' ? 'table' : 'chart')} />
    <//>`}
  >
    ${view === 'table'
      ? html`<div className="iss-chart-table">
        ${nonZero.length === 0
          ? html`<div className="text-xs muted">这段时间没有失败</div>`
          : html`<table className="table is-dense"><thead><tr><th>时间段</th><th style=${{ textAlign: 'right' }}>失败次数</th></tr></thead><tbody>
            ${nonZero.map((x) => html`<tr key=${x.b.start}><td>${x.b.title}</td><td style=${{ textAlign: 'right' }}>${x.v}</td></tr>`)}
          </tbody></table>`}
      </div>`
      : html`<div
        ref=${wrapRef}
        className="iss-chart"
        style=${{ height }}
        tabIndex=${0}
        role="group"
        aria-label="失败次数趋势，可用左右方向键查看各时间段"
        onKeyDown=${onKeyDown}
        onBlur=${() => setHover(null)}
      >
        ${width > 0 && html`<svg width=${width} height=${height} aria-hidden="true">
          ${hv != null && html`<rect x=${pad.l + hv * band} y=${pad.t} width=${band} height=${plotH} className="iss-chart-band" />`}
          ${ticks.map((t) => {
            const ty = Math.round(y(t)) + 0.5;
            return html`<g key=${`t${t}`}>
              <line x1=${pad.l} x2=${width - pad.r} y1=${ty} y2=${ty} className="iss-chart-grid" />
              <text x=${pad.l - 8} y=${ty + 4} textAnchor="end" className="iss-chart-axis">${t}</text>
            </g>`;
          })}
          ${counts.map((v, i) => {
            if (!v) return null;
            const h = Math.max(2, y(0) - y(v));
            const x = pad.l + (i + 0.5) * band - barW / 2;
            return html`<path key=${buckets[i].start} d=${issuesRoundTop(x, y(0) - h, barW, h, 4)} className=${cx('iss-chart-bar', hv === i && 'is-hover')} />`;
          })}
          ${markX != null && html`<g>
            <line x1=${markX} x2=${markX} y1=${pad.t - 6} y2=${pad.t + plotH} className="iss-chart-mark" />
            <text x=${markX + (markX > width - 60 ? -4 : 4)} y=${pad.t - 6} textAnchor=${markX > width - 60 ? 'end' : 'start'} className="iss-chart-mark-label">已解决</text>
          </g>`}
          ${buckets.map((b, i) => ((n - 1 - i) % every === 0
            ? html`<text key=${`l${b.start}`} x=${pad.l + (i + 0.5) * band} y=${height - 8} textAnchor="middle" className="iss-chart-axis">${b.label}</text>`
            : null))}
          <rect x=${pad.l} y=${pad.t} width=${plotW} height=${plotH} fill="transparent" onMouseMove=${onMove} onMouseLeave=${() => setHover(null)} />
        </svg>`}
        ${hv != null && html`<div className="iss-chart-tip" style=${{ ...tipStyle, top: pad.t }} role="status">
          <div className="iss-chart-tip-value">${counts[hv]} 次失败</div>
          <div className="iss-chart-tip-label">${buckets[hv].title}</div>
        </div>`}
      </div>`}
  <//>`;
}

function IssuesAssignSelect({ issue, state, disabled, width = 164 }) {
  const opts = issuesAssigneeOptions(state, [issue]);
  const extra = issue.assignee && !opts.some((o) => o.value === issue.assignee)
    ? [{ value: issue.assignee, label: personName(issue.assignee), desc: '已不在受影响的项目中', iconNode: html`<${Avatar} name=${personName(issue.assignee)} size=${20} />` }]
    : [];
  const options = [{ value: '__none', label: '未指派', icon: 'UserX' }, ...opts, ...extra];
  return html`<${Select}
    width=${width}
    searchable
    disabled=${disabled}
    value=${issue.assignee || '__none'}
    onChange=${(v) => {
      const next = v === '__none' ? null : v;
      if (next === (issue.assignee || null)) return;
      issuesAssign([issue], next);
      toast.success(next ? (next === state.me ? '已指派给你' : `已指派给${personName(next)}，对方会收到站内通知`) : '已取消指派');
    }}
    options=${options}
    dropdownWidth=${280}
    renderValue=${(sel) => sel[0] && html`<span className="select-value">${sel[0].value === '__none' ? html`<${Icon} name="UserX" size=${14} />` : html`<${Avatar} name=${personName(sel[0].value)} size=${18} />`}${sel[0].value === '__none' ? '未指派' : personName(sel[0].value)}</span>`}
  />`;
}

function IssuesMuteMenu({ items, disabled, size = 'md', label, onDone }) {
  const now = Date.now();
  const muted = items.some((i) => issuesMuted(i, now));
  const until = muted ? Math.max(...items.map((i) => i.mutedUntil || 0)) : null;
  const text = label || (muted && items.length === 1 ? `静默到 ${fmt.short(until).slice(6)}` : '静默');
  if (disabled) return html`<${Button} size=${size} icon="BellOff" disabled iconRight="ChevronDown">${text}<//>`;
  return html`<${Dropdown}
    width=${220}
    trigger=${html`<${Button} size=${size} icon="BellOff" iconRight="ChevronDown">${text}<//>`}
    items=${[
      { group: '静默期间不发送告警，也不计入未处理' },
      ...ISSUES_MUTE_HOURS.map((h) => ({ key: `m${h}`, label: `静默 ${h} 小时`, icon: 'BellOff', onClick: () => { issuesMute(items, h); toast.success(items.length > 1 ? `已把 ${items.length} 个问题静默 ${h} 小时` : `已静默 ${h} 小时`); if (onDone) onDone(); } })),
      muted && { divider: true },
      muted && { key: 'unmute', label: '取消静默', icon: 'Bell', onClick: () => { issuesMute(items, 0); toast.success('已取消静默'); if (onDone) onDone(); } },
    ]}
  />`;
}

function IssuesPage() {
  const state = useStore();
  const route = useRoute();
  const [q, setQ] = useState(() => route.query.q || '');
  const [status, setStatus] = useState(() => (ISSUES_STATUS_FILTERS.some((f) => f.value === route.query.status) ? route.query.status : 'active'));
  const [project, setProject] = useState(() => route.query.project || null);
  const [severity, setSeverity] = useState(null);
  const [env, setEnv] = useState(null);
  const [owner, setOwner] = useState(() => (route.query.assignee === 'me' ? 'me' : null));
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const issues = useMemo(() => issuesCollect(state), [state.runs, state.issueStates, state.connections, state.workflows, state.members, state.privacy, state.versions]);
  const byId = issuesRunIndex(state);
  const now = Date.now();
  const memberPids = logsMemberProjectIds(state);
  const myProjects = state.projects.filter((p) => memberPids.has(p.id));
  const staged = myProjects.some((p) => isStagedProject(state, p.id));
  const matchers = {
    active: (i) => ['open', 'investigating'].includes(i.status),
    open: (i) => i.status === 'open' && !issuesMuted(i, now),
    reopened: (i) => i.reopened,
    investigating: (i) => i.status === 'investigating',
    today: (i) => issuesIsToday(i, byId, now),
    muted: (i) => issuesMuted(i, now),
    resolved: (i) => i.status === 'resolved',
    ignored: (i) => i.status === 'ignored',
    all: () => true,
  };
  const counts = Object.fromEntries(Object.entries(matchers).map(([k, fn]) => [k, issues.filter(fn).length]));
  const ql = q.trim().toLowerCase();
  const list = issues
    .filter(matchers[status] || matchers.active)
    .filter((i) => !project || i.projectIds.includes(project))
    .filter((i) => !severity || i.severity === severity)
    .filter((i) => !env || i.envs.includes(env))
    .filter((i) => !owner || (owner === 'me' ? i.assignee === state.me : owner === 'none' ? !i.assignee : i.assignee === owner))
    .filter((i) => !ql || [i.title, i.workflowName, i.nodeName, i.message, i.code, i.sig].join(' ').toLowerCase().includes(ql))
    .sort((a, b) => {
      if (sort === 'count') return b.count - a.count || b.lastAt - a.lastAt;
      if (sort === 'severity') return ISSUES_SEVERITY[a.severity].rank - ISSUES_SEVERITY[b.severity].rank || b.lastAt - a.lastAt;
      return b.lastAt - a.lastAt;
    });
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * pageSize, cur * pageSize);
  const picked = issues.filter((i) => selected.includes(i.sig) && list.some((x) => x.sig === i.sig));
  const blocked = picked.filter((i) => !issuesCanAct(state, i));
  const filtering = Boolean(ql || project || severity || env || owner || status !== 'active');
  const clear = () => { setQ(''); setProject(null); setSeverity(null); setEnv(null); setOwner(null); setStatus('active'); setPage(1); };
  const setQuick = (key) => { setStatus(status === key ? 'active' : key); setPage(1); };
  const weekAgo = now - 7 * DAY;
  const weekFailures = logsVisibleRuns(state).filter((r) => r.kind === 'run' && ['failed', 'timeout'].includes(r.status) && r.startedAt >= weekAgo).length;
  const weekIssues = issues.filter((i) => i.lastAt >= weekAgo).length;
  const sigSet = new Set(issues.map((i) => i.sig));
  const weekAlerts = (state.alertEvents || []).filter((e) => e.at >= weekAgo && sigSet.has(e.issue)).length;
  const openHigh = issues.filter((i) => matchers.open(i) && i.severity === 'high').length;
  const mineInv = issues.filter((i) => i.status === 'investigating' && i.assignee === state.me).length;
  const todayNew = issues.filter((i) => i.firstAt >= issuesDayStart(now)).length;
  const mutedList = issues.filter(matchers.muted);
  const assignees = [...new Set(issues.map((i) => i.assignee).filter((u) => u && u !== state.me))];
  const bulkOptions = picked.length ? issuesAssigneeOptions(state, picked) : [];
  const bulkReason = blocked.length ? `你对其中 ${blocked.length} 个问题只有查看权限` : '';
  const bulkStatus = async (st) => {
    if (st === 'resolved' && !(await issuesConfirmResolve(Store.get(), picked))) return;
    if (st === 'ignored' && !(await issuesConfirmIgnore(picked.length))) return;
    issuesSetStatus(picked, st);
    toast.success(`已把 ${picked.length} 个问题标记为${ISSUES_STATUS[st].label}`);
    setSelected([]);
  };
  const columns = [
    {
      key: 'title', title: '问题', render: (i) => html`<div className="iss-cell">
        <${IssuesKindIcon} issue=${i} state=${state} />
        <div className="iss-cell-text">
          <div className="iss-cell-title" title=${i.title}>${i.title}</div>
          <div className="iss-cell-sub">
            <span className="ellipsis">${i.kind === 'connection' ? `连接问题 · 影响 ${i.workflowIds.length} 个工作流` : `${i.workflowName} · ${i.nodeName}`}</span>
            ${i.envs.includes('test') && html`<${Tag} size="sm" tone="info">测试环境<//>`}
          </div>
        </div>
      </div>`,
    },
    { key: 'impact', title: '影响', width: 124, render: (i) => html`<div className="iss-two"><span><b>${i.count}</b> 次运行</span><span className="muted text-xs">${i.workflowIds.length} 个工作流</span></div>` },
    { key: 'spark', title: '近 7 天', width: 96, render: (i) => html`<${IssuesSpark} data=${issuesSpark(i, byId, now)} muted=${['resolved', 'ignored'].includes(i.status)} />` },
    { key: 'seen', title: '首次 / 最近', width: 118, render: (i) => html`<div className="iss-two"><span className="text-xs muted" title=${fmt.dateTime(i.firstAt)}>${fmt.relative(i.firstAt)}</span><span title=${fmt.dateTime(i.lastAt)}>${fmt.relative(i.lastAt)}</span></div>` },
    {
      key: 'status', title: '状态', width: 116, render: (i) => html`<span className="row-4">
        <${IssuesStatusTag} issue=${i} size="sm" />
        ${issuesMuted(i, now) && html`<${Tooltip} content=${`静默到 ${fmt.short(i.mutedUntil)}`}><span className="iss-muted-ic" aria-label="静默中"><${Icon} name="BellOff" size=${13} /></span><//>`}
      </span>`,
    },
    { key: 'owner', title: '负责人', width: 108, render: (i) => (i.assignee ? html`<span className="row-4 iss-owner"><${Avatar} name=${personName(i.assignee)} size=${20} /><span className="ellipsis">${personName(i.assignee)}</span></span>` : html`<span className="muted">未指派</span>`) },
    { key: 'sev', title: '严重度', width: 72, render: (i) => html`<${IssuesSeverityTag} severity=${i.severity} />` },
  ];
  const stat = (key, label, icon, value, delta, tone) => html`<${Stat} label=${label} icon=${icon} value=${value} delta=${delta} tone=${tone} active=${status === key} onClick=${() => setQuick(key)} />`;
  const earliest = mutedList.length ? Math.min(...mutedList.map((i) => i.mutedUntil)) : null;
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      title="问题中心"
      description="失败按原因聚合成问题：同一工作流、同一节点、同一错误码算一个问题，连接认证失败按连接合并。告警按问题发送，不会每次失败都通知。"
      actions=${html`<${Button} icon="BellRing" onClick=${() => navigate('/issues/alerts')}>告警策略<//>`}
    />
    <div className="iss-funnel" aria-label="近 7 天降噪情况">
      <span className="muted">近 7 天</span>
      <span><b>${fmt.number(weekFailures)}</b> 次失败</span>
      <${Icon} name="ArrowRight" size=${14} className="muted" />
      <span><b>${weekIssues}</b> 个问题</span>
      <${Icon} name="ArrowRight" size=${14} className="muted" />
      <span><b>${weekAlerts}</b> 条告警</span>
      <${Link} to="/issues/alerts?tab=records" className="link text-xs">查看告警记录<//>
    </div>
    <div className="stat-grid">
      ${stat('open', '未处理', 'CircleAlert', counts.open, openHigh ? `其中高严重度 ${openHigh} 个` : '没有高严重度的问题', openHigh ? 'danger' : undefined)}
      ${stat('investigating', '处理中', 'Wrench', counts.investigating, mineInv ? `指派给我 ${mineInv} 个` : '没有指派给我的')}
      ${stat('today', '今日新增与复发', 'CalendarClock', counts.today, `新增 ${todayNew} · 复发 ${counts.today - todayNew}`)}
      ${stat('muted', '静默中', 'BellOff', counts.muted, earliest ? `最早 ${fmt.short(earliest).slice(6)} 恢复告警` : '没有静默的问题')}
    </div>
    <div className="toolbar">
      <${SearchInput} value=${q} onChange=${(v) => { setQ(v); setPage(1); }} placeholder="搜索问题、工作流或错误码" width=${240} />
      <${Select} width=${148} value=${status} onChange=${(v) => { setStatus(v); setPage(1); }} options=${ISSUES_STATUS_FILTERS.map((f) => ({ value: f.value, label: `${f.label}（${counts[f.value]}）` }))} />
      <${Select} width=${124} clearable value=${project} onChange=${(v) => { setProject(v); setPage(1); }} placeholder="全部项目" options=${myProjects.map((p) => ({ value: p.id, label: p.name }))} />
      <${Select} width=${112} clearable value=${severity} onChange=${(v) => { setSeverity(v); setPage(1); }} placeholder="严重度" options=${Object.entries(ISSUES_SEVERITY).map(([k, m]) => ({ value: k, label: `${m.label}严重度` }))} />
      ${staged && html`<${Select} width=${112} clearable value=${env} onChange=${(v) => { setEnv(v); setPage(1); }} placeholder="全部环境" options=${[{ value: 'prod', label: '生产环境' }, { value: 'test', label: '测试环境' }]} />`}
      <${Select} width=${124} clearable value=${owner} onChange=${(v) => { setOwner(v); setPage(1); }} placeholder="负责人" options=${[
        { value: 'me', label: '我负责的', icon: 'UserCheck' },
        { value: 'none', label: '未指派', icon: 'UserX' },
        ...(assignees.length ? [{ group: '成员' }, ...assignees.map((u) => ({ value: u, label: personName(u), iconNode: html`<${Avatar} name=${personName(u)} size=${18} />` }))] : []),
      ]} />
      <span className="spacer" />
      <${Select} width=${132} value=${sort} onChange=${setSort} options=${[{ value: 'recent', label: '最近出现' }, { value: 'count', label: '失败次数' }, { value: 'severity', label: '严重度' }]} renderValue=${(sel) => sel[0] && html`<span className="select-value"><${Icon} name="ArrowUpDown" size=${14} />${sel[0].label}</span>`} />
    </div>
    ${picked.length > 0 && html`<div className="iss-bulk" role="region" aria-label="批量操作">
      <span>已选 <b>${picked.length}</b> 个问题</span>
      <span className="vdivider" />
      ${bulkReason
        ? html`<${Tooltip} content=${bulkReason}><${Button} size="sm" icon="UserPlus" iconRight="ChevronDown" disabled>指派<//><//>`
        : html`<${Dropdown}
          width=${260}
          placement="bottom-start"
          trigger=${html`<${Button} size="sm" icon="UserPlus" iconRight="ChevronDown">指派<//>`}
          items=${[
            ...(bulkOptions.length ? [{ group: '可以处理所选问题的成员' }, ...bulkOptions.map((o) => ({ key: o.value, label: o.label, desc: o.desc, iconNode: o.iconNode, onClick: () => { issuesAssign(picked, o.value); toast.success(`已把 ${picked.length} 个问题指派给${personName(o.value)}`); setSelected([]); } }))] : [{ group: '所选问题没有共同的可编辑成员' }]),
            { divider: true },
            { key: 'none', label: '取消指派', icon: 'UserX', onClick: () => { issuesAssign(picked, null); toast.success('已取消指派'); setSelected([]); } },
          ]}
        />`}
      <${Tooltip} content=${bulkReason}><${Button} size="sm" icon="Wrench" disabled=${Boolean(bulkReason)} onClick=${() => bulkStatus('investigating')}>标记处理中<//><//>
      <${Tooltip} content=${bulkReason}><${Button} size="sm" icon="CircleCheck" disabled=${Boolean(bulkReason)} onClick=${() => bulkStatus('resolved')}>标记已解决<//><//>
      <${Tooltip} content=${bulkReason}><${Button} size="sm" icon="CircleSlash" disabled=${Boolean(bulkReason)} onClick=${() => bulkStatus('ignored')}>忽略<//><//>
      <${Tooltip} content=${bulkReason}><${IssuesMuteMenu} items=${picked} disabled=${Boolean(bulkReason)} size="sm" label="静默" onDone=${() => setSelected([])} /><//>
      <span className="spacer" />
      <${Button} size="sm" variant="ghost" onClick=${() => setSelected([])}>取消选择<//>
    </div>`}
    <${Table}
      className="iss-table"
      rowKey="sig"
      columns=${columns}
      data=${shown}
      selectable
      selected=${selected}
      onSelect=${setSelected}
      onRowClick=${(i) => navigate(`/issues/${encodeURIComponent(i.sig)}`)}
      empty=${html`<${Empty}
        icon=${filtering ? 'SearchX' : 'CircleCheck'}
        title=${filtering ? '没有符合条件的问题' : '没有未关闭的问题'}
        description=${filtering ? '换个关键词，或者清除筛选条件再看看。' : '运行失败会按原因自动聚合到这里，同一原因只告警一次。'}
        action=${filtering ? html`<${Button} onClick=${clear}>清除筛选<//>` : null}
      />`}
    />
    ${list.length > pageSize && html`<${Pagination} page=${cur} pageSize=${pageSize} total=${list.length} onChange=${(p) => setPage(Math.min(pages, Math.max(1, p)))} />`}
  </div></div>`;
}

function issuesTimeline(issue, state) {
  const byId = issuesRunIndex(state);
  const saved = (state.issueStates || {})[issue.sig] || {};
  const policies = state.alertPolicies || [];
  const channels = state.channels || [];
  const first = byId.get(issue.runIds[issue.runIds.length - 1]);
  const entries = [
    { id: 'first', at: issue.firstAt, rank: -1, icon: 'CircleAlert', tone: 'danger', title: '首次失败', text: issue.kind === 'connection' ? `${issue.workflowName} 调用连接失败：${issue.message}` : `${issue.workflowName} · ${issue.nodeName}：${issue.message}`, run: first ? first.id : null },
    ...(state.alertEvents || []).filter((e) => e.issue === issue.sig).map((e) => {
      const p = policies.find((x) => x.id === e.policyId);
      const names = (e.channels || []).map((cid) => (channels.find((c) => c.id === cid) || { name: '已删除的渠道' }).name).join('、') || '没有可用的渠道';
      return { id: e.id, at: e.at, icon: 'BellRing', tone: 'warning', title: `发送告警 · ${(ISSUES_ALERT_KINDS[e.kind] || { label: e.kind }).label}`, text: `「${p ? p.name : '已删除的策略'}」通知了 ${names}${(e.merged || 1) > 1 ? `，这条告警合并了 ${e.merged} 次失败` : ''}${e.deferred ? '（静默时段内，结束后发送）' : ''}` };
    }),
    ...(saved.notes || []).map((n) => ({ id: n.id, at: n.at, icon: 'MessageSquare', by: n.by, title: '添加了备注', text: n.text, note: true })),
    ...(saved.history || []).map((h) => ({ id: h.id, at: h.at, icon: { resolve: 'CircleCheck', ignore: 'CircleSlash', assign: 'UserPlus', mute: 'BellOff', unmute: 'Bell', replay: 'RotateCcw', status: 'Wrench' }[h.action] || 'Dot', tone: h.action === 'resolve' ? 'success' : undefined, by: h.by, title: h.text })),
  ];
  if (saved.resolvedAt && !(saved.history || []).some((h) => h.action === 'resolve' && Math.abs(h.at - saved.resolvedAt) < 2000)) {
    entries.push({ id: 'resolved', at: saved.resolvedAt, icon: 'CircleCheck', tone: 'success', by: saved.resolvedBy, title: '标记为已解决' });
  }
  const reopenAt = issuesReopenAt(issue, byId);
  if (reopenAt) entries.push({ id: 'reopen', at: reopenAt, icon: 'RotateCcw', tone: 'danger', title: '复发', text: `解决后又失败了 ${issuesReopenCount(issue, byId)} 次，问题已自动重新打开` });
  if (issue.count > 1 && issue.lastAt !== reopenAt) entries.push({ id: 'last', at: issue.lastAt, icon: 'Clock', title: '最近一次失败', text: `累计失败 ${issue.count} 次`, run: issue.runIds[0] });
  return entries.sort((a, b) => b.at - a.at || (b.rank || 0) - (a.rank || 0));
}

function IssuesInsightCard({ issue, state, canAct, actReason, settledAll, onReplay, onResolve, onIgnore }) {
  const insight = issueInsight(issue, state);
  const conn = issue.connectionId ? state.connections.find((c) => c.id === issue.connectionId) : null;
  const perm = conn ? connectionPerm(state, conn) : null;
  const manage = perm === 'owner' || perm === 'edit';
  const pct = Math.round(insight.confidence * 100);
  const views = insight.fixes.map((fix) => {
    if (fix.kind === 'done') return { kind: 'done', label: fix.label, note: conn ? `${fmt.relative(conn.updatedAt)}恢复` : '' };
    if (fix.kind === 'reauth') {
      if (!conn) return { kind: fix.kind, label: fix.label, icon: 'KeyRound', disabled: true, reason: '连接已被删除，需要在工作流里重新选择连接' };
      if (!manage) return { kind: fix.kind, label: fix.label, icon: 'KeyRound', disabled: true, reason: `你对连接「${conn.name}」只有使用权限，需要所有者${personName(conn.owner)}重新授权`, alt: { label: '查看连接', to: `/connections?id=${conn.id}` } };
      return { kind: fix.kind, label: fix.label, icon: 'KeyRound', to: `/connections?id=${fix.target}`, reason: '在「连接」页面完成重新授权后，回到这里重跑受影响的运行' };
    }
    if (fix.kind === 'openNode') {
      const wf = state.workflows.find((w) => w.id === fix.target.workflowId);
      if (!wf) return { kind: fix.kind, label: fix.label, icon: 'SquarePen', disabled: true, reason: '工作流已删除' };
      const edit = canEditProject(state, wf.projectId);
      const lock = (state.editLocks || {})[wf.id];
      const params = new URLSearchParams({ ...(edit ? { mode: 'edit' } : {}), node: fix.target.nodeId || '', tab: fix.target.tab || 'input' }).toString();
      const note = !edit ? '你只有查看权限，打开后只能查看节点配置' : lock && lock.userId !== state.me ? `${personName(lock.userId)} 正在编辑这个工作流，打开后是只读` : '';
      return { kind: fix.kind, label: fix.label, icon: 'SquarePen', to: `/integration/${wf.projectId}/wf/${wf.id}?${params}`, reason: note };
    }
    if (fix.kind === 'replay') {
      if (settledAll) return { kind: 'settled', label: `受影响的 ${issue.count} 次运行都已重跑成功` };
      const mode = /整体/.test(fix.label) ? 'full' : 'node';
      if (fix.disabled) return { kind: fix.kind, label: fix.label, icon: ISSUES_REPLAY_MODES[mode].icon, disabled: true, reason: fix.reason };
      if (!canAct) return { kind: fix.kind, label: fix.label, icon: ISSUES_REPLAY_MODES[mode].icon, disabled: true, reason: actReason };
      return { kind: fix.kind, label: fix.label, icon: ISSUES_REPLAY_MODES[mode].icon, run: () => onReplay(issue.runIds, mode), reason: mode === 'node' ? '前面成功的节点沿用原结果，不会重复执行' : '' };
    }
    if (fix.kind === 'ignore') {
      if (issue.status === 'ignored') return { kind: 'done', label: '已忽略这个问题' };
      return { kind: fix.kind, label: fix.label, icon: 'CircleSlash', disabled: !canAct, reason: canAct ? '' : actReason, run: onIgnore, quiet: true };
    }
    return { kind: fix.kind, label: fix.label, icon: 'Wrench' };
  });
  const primaryIdx = views.findIndex((v) => !v.disabled && (v.to || v.run) && !v.quiet);
  return html`<${Card}
    className="iss-card iss-ai"
    icon="Sparkles"
    title="AI 根因分析"
    subtitle="根据错误码、失败节点、连接状态和最近的变更推断，执行修复前请确认"
    extra=${html`<span className="iss-conf" title=${`置信度 ${pct}%`}><span className="text-xs muted">置信度</span><span className="iss-conf-track"><span className="iss-conf-fill" style=${{ width: `${pct}%` }} /></span><b>${pct}%</b></span>`}
  >
    <div className="iss-ai-cause">${insight.cause}</div>
    <div className="iss-ai-impact"><${Icon} name="Waypoints" size=${14} /><span>${insight.impact}</span></div>
    <div className="iss-fix-title">建议的修复</div>
    <ol className="iss-fixes">
      ${views.map((v, i) => html`<li key=${`${v.kind}-${i}`} className=${cx('iss-fix', v.disabled && 'is-disabled')}>
        <span className="iss-fix-no">${i + 1}</span>
        <div className="iss-fix-body">
          ${v.kind === 'done' || v.kind === 'settled'
            ? html`<div className="iss-fix-done"><${Icon} name="CircleCheck" size=${16} /><span>${v.label}</span>${v.note && html`<span className="text-xs muted">${v.note}</span>`}
              ${v.kind === 'settled' && issue.status !== 'resolved' && canAct && html`<${Button} size="sm" variant="primary" icon="CircleCheck" onClick=${onResolve}>标记已解决<//>`}</div>`
            : html`<div className="iss-fix-action">
              <${Button}
                size="sm"
                variant=${i === primaryIdx ? 'primary' : 'outline'}
                icon=${v.icon}
                disabled=${v.disabled || (!v.to && !v.run)}
                onClick=${() => { if (v.to) navigate(v.to); else if (v.run) v.run(); }}
              >${v.label}<//>
              ${v.alt && html`<${Button} size="sm" variant="ghost" iconRight="ArrowUpRight" onClick=${() => navigate(v.alt.to)}>${v.alt.label}<//>`}
            </div>`}
          ${v.reason && html`<div className=${cx('iss-fix-reason', v.disabled && 'is-blocked')}>${v.disabled && html`<${Icon} name="Info" size=${12} />`}${v.reason}</div>`}
        </div>
      </li>`)}
    </ol>
  <//>`;
}

function IssuesRunsCard({ issue, state, canAct, actReason, onReplay }) {
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState([]);
  const byId = issuesRunIndex(state);
  const runs = issue.runIds.map((id) => byId.get(id)).filter(Boolean);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(runs.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = runs.slice((cur - 1) * pageSize, cur * pageSize);
  const picked = sel.filter((id) => runs.some((r) => r.id === id));
  const staged = issue.projectIds.some((pid) => isStagedProject(state, pid));
  const unsettled = runs.filter((r) => !issuesSettled(state, r)).length;
  const wfName = (id) => (state.workflows.find((w) => w.id === id) || { name: '已删除的工作流' }).name;
  const nodeName = (r) => {
    const wf = state.workflows.find((w) => w.id === r.workflowId);
    const g = wf ? graphForRun(r, wf) : null;
    const node = g && r.failedNodeId ? findInWorkflow({ ...wf, ...g }, r.failedNodeId) : null;
    return node ? node.name : '';
  };
  const replayCell = (r) => {
    const latest = issuesLatestAttempt(state, r);
    const settled = issuesSettled(state, r);
    if (latest.id === r.id && !settled) return html`<span className="muted">未重跑</span>`;
    const target = settled ? issuesChain(state, issuesChainRoot(state, r)).find((x) => x.status === 'success') : latest;
    const text = settled ? '已重跑成功' : ['running', 'waiting'].includes(target.status) ? '重跑中' : '重跑后仍失败';
    return html`<a className="link row-4" onClick=${(e) => { e.stopPropagation(); navigate(`/logs?run=${target.id}`); }}><${Dot} tone=${RUN_STATUS[target.status].tone} pulse=${target.status === 'running'} />${text}</a>`;
  };
  const columns = [
    { key: 'time', title: '失败时间', width: 128, render: (r) => html`<span title=${fmt.dateTime(r.startedAt)}>${fmt.short(r.startedAt)}</span>` },
    { key: 'wf', title: '工作流 · 节点', render: (r) => html`<div className="iss-two"><span className="ellipsis">${wfName(r.workflowId)}</span><span className="text-xs muted ellipsis">${nodeName(r) || '-'}${r.retryOf ? ' · 重跑记录' : ''}</span></div>` },
    ...(staged ? [{ key: 'env', title: '环境', width: 72, render: (r) => html`<${Tag} size="sm" tone=${(r.env || 'prod') === 'test' ? 'info' : 'outline'}>${(r.env || 'prod') === 'test' ? '测试' : '生产'}<//>` }] : []),
    { key: 'ver', title: '版本', width: 56, render: (r) => `v${r.version}` },
    { key: 'status', title: '状态', width: 96, render: (r) => html`<${RunStatusDot} status=${r.status} />` },
    { key: 'replay', title: '重跑结果', width: 118, render: replayCell },
    { key: 'op', title: '操作', width: 64, render: (r) => html`<a className="link" onClick=${(e) => { e.stopPropagation(); navigate(`/logs?run=${r.id}`); }}>日志</a>` },
  ];
  return html`<${Card}
    className="iss-card iss-runs"
    title="受影响的运行"
    subtitle=${unsettled ? `${runs.length} 次失败，${unsettled} 次还没有重跑成功` : `${runs.length} 次失败都已重跑成功`}
    extra=${html`<${Tooltip} content=${canAct ? '' : actReason}>
      <${Button} size="sm" icon="RotateCcw" disabled=${!canAct || (!picked.length && !unsettled)} onClick=${() => onReplay(picked.length ? picked : issue.runIds, 'node')}>${picked.length ? `重跑所选 ${picked.length} 次` : '批量重跑'}<//>
    <//>`}
    bodyClassName="card-body-flush"
  >
    <${Table} dense rowKey="id" columns=${columns} data=${shown} selectable=${canAct} selected=${picked} onSelect=${setSel} onRowClick=${(r) => navigate(`/logs?run=${r.id}`)} />
    ${runs.length > pageSize && html`<div className="iss-card-pager"><${Pagination} page=${cur} pageSize=${pageSize} total=${runs.length} onChange=${(p) => setPage(Math.min(pages, Math.max(1, p)))} /></div>`}
  <//>`;
}

function IssuesAlertsCard({ issue, state }) {
  const byId = issuesRunIndex(state);
  const events = (state.alertEvents || []).filter((e) => e.issue === issue.sig).sort((a, b) => b.at - a.at);
  const policies = state.alertPolicies || [];
  const channels = state.channels || [];
  const covering = policies.filter((p) => p.enabled && issuesPolicyCovers(p, issue, byId));
  const merged = events.reduce((a, e) => a + (e.merged || 1), 0);
  return html`<${Card} className="iss-card" title="告警记录" icon="BellRing" extra=${html`<${Link} to="/issues/alerts" className="link text-xs">告警策略<//>`}>
    <div className="iss-noise">
      <div className="iss-noise-figure"><b>${issue.count}</b><span>次失败</span><${Icon} name="ArrowRight" size=${14} className="muted" /><b>${events.length}</b><span>条告警</span></div>
      <div className="text-xs muted">${events.length
        ? `同一问题在聚合窗口内只通知一次，其余失败合并进已发出的告警${merged > events.length ? `（共合并 ${merged} 次）` : ''}。`
        : covering.length
          ? (covering[0].updatedAt > issue.firstAt
            ? `「${covering[0].name}」覆盖这个问题，但这个问题在策略生效（${fmt.date(covering[0].updatedAt)}）之前就出现了，没有发出过告警；它复发时才会通知。${issue.assignee ? '' : '它还没有负责人，建议先指派。'}`
            : `「${covering[0].name}」覆盖这个问题，出现新问题或复发时通知；目前还没有触发。`)
          : '没有启用的告警策略覆盖这个问题。'}</div>
    </div>
    ${events.length === 0 && covering.length === 0 && html`<${Button} size="sm" icon="Plus" onClick=${() => navigate('/issues/alerts')}>配置告警策略<//>`}
    <div className="iss-alert-list">
      ${events.map((e) => {
        const p = policies.find((x) => x.id === e.policyId);
        const kind = ISSUES_ALERT_KINDS[e.kind] || { label: e.kind, tone: 'default' };
        return html`<div key=${e.id} className="iss-alert-row">
          <div className="row-4"><${Tag} size="sm" tone=${kind.tone}>${kind.label}<//><span className="ellipsis iss-alert-policy">${p ? p.name : '已删除的策略'}</span><span className="spacer" /><span className="text-xs muted" title=${fmt.dateTime(e.at)}>${fmt.relative(e.at)}</span></div>
          <div className="iss-alert-merge"><b>${(e.merged || 1) > 1 ? `这条告警合并了 ${e.merged} 次失败` : '1 次失败'}</b>${e.deferred ? ' · 静默时段内，结束后发送' : ''}</div>
          <div className="text-xs muted ellipsis">通知：${(e.channels || []).map((cid) => (channels.find((c) => c.id === cid) || { name: '已删除的渠道' }).name).join('、') || '没有可用的渠道'}</div>
        </div>`;
      })}
    </div>
  <//>`;
}

function IssuesActivityCard({ issue, state, canAct, actReason }) {
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');
  const entries = issuesTimeline(issue, state).filter((e) => filter === 'all' || e.note);
  const value = text.trim();
  const tooLong = value.length > 500;
  const add = () => {
    if (!value || tooLong || !canAct) return;
    const note = { id: uid('in'), by: state.me, at: Date.now(), text: value };
    issuesPatch([issue], (saved) => ({ notes: [...(saved.notes || []), note] }), { audit: '添加问题备注' });
    setText('');
    toast.success('备注已添加');
  };
  return html`<${Card}
    className="iss-card"
    title="备注与活动"
    extra=${html`<${Segmented} size="sm" value=${filter} onChange=${setFilter} options=${[{ value: 'all', label: '全部' }, { value: 'notes', label: '只看备注' }]} />`}
  >
    <div className="iss-composer">
      <${Avatar} name=${personName(state.me)} size=${28} />
      <div className="grow">
        <${Textarea} rows=${2} value=${text} onChange=${setText} disabled=${!canAct} invalid=${tooLong} placeholder=${canAct ? '记录排查进展，例如「已联系金蝶管理员重置密码」' : actReason} />
        <div className="iss-composer-foot">
          <span className=${cx('text-xs', tooLong ? 'iss-over' : 'muted')}>${value.length}/500</span>
          <span className="spacer" />
          <${Button} size="sm" variant="primary" disabled=${!value || tooLong || !canAct} onClick=${add}>添加备注<//>
        </div>
      </div>
    </div>
    ${entries.length === 0
      ? html`<div className="iss-empty-line">${filter === 'notes' ? '还没有备注' : '暂无活动'}</div>`
      : html`<ol className="iss-timeline">
        ${entries.map((e) => html`<li key=${e.id} className=${cx('iss-tl', e.tone && `tone-${e.tone}`, e.note && 'is-note')}>
          <span className="iss-tl-icon"><${Icon} name=${e.icon} size=${14} /></span>
          <div className="iss-tl-body">
            <div className="iss-tl-head">
              ${e.by && html`<b>${personName(e.by)}</b>`}
              <span>${e.title}</span>
              <span className="text-xs muted" title=${fmt.dateTime(e.at)}>${fmt.relative(e.at)}</span>
              ${e.run && html`<a className="link text-xs" onClick=${() => navigate(`/logs?run=${e.run}`)}>查看日志</a>`}
            </div>
            ${e.text && html`<div className=${cx('iss-tl-text', e.note && 'is-note')}>${e.text}</div>`}
          </div>
        </li>`)}
      </ol>`}
  <//>`;
}

function IssueDetailPage({ sig }) {
  const state = useStore();
  const [replay, setReplay] = useState(null);
  const issues = useMemo(() => issuesCollect(state), [state.runs, state.issueStates, state.connections, state.workflows, state.members, state.privacy, state.versions]);
  const issue = issues.find((i) => i.sig === sig) || null;
  if (!issue) {
    return html`<div className="page"><div className="page-inner">
      <${PageHeader} title="问题详情" back="/issues" />
      <${Empty} icon="SearchX" title="问题不存在" description="这个问题可能已经没有失败记录（超过了日志保留期），或者属于你没有访问权限的项目。" action=${html`<${Button} onClick=${() => navigate('/issues')}>回到问题中心<//>`} />
    </div></div>`;
  }
  const byId = issuesRunIndex(state);
  const runs = issue.runIds.map((id) => byId.get(id)).filter(Boolean);
  const canAct = issuesCanAct(state, issue);
  const actReason = issuesActReason(state, issue);
  const settledAll = runs.length > 0 && runs.every((r) => issuesSettled(state, r));
  const now = Date.now();
  const muted = issuesMuted(issue, now);
  const saved = (state.issueStates || {})[issue.sig] || {};
  const reopenCount = issuesReopenCount(issue, byId);
  const resolve = async () => {
    if (!(await issuesConfirmResolve(Store.get(), [issue]))) return;
    issuesSetStatus([issue], 'resolved');
    toast.success('已标记为已解决，再次失败时会自动重新打开');
  };
  const ignore = async () => {
    if (!(await issuesConfirmIgnore(1))) return;
    issuesSetStatus([issue], 'ignored');
    toast.success('已忽略这个问题');
  };
  const changeStatus = (v) => {
    if (v === issue.status && !issue.reopened) return;
    if (v === 'resolved') { resolve(); return; }
    if (v === 'ignored') { ignore(); return; }
    issuesSetStatus([issue], v);
    toast.success(`状态已改为「${ISSUES_STATUS[v].label}」`);
  };
  const statusOptions = Object.entries(ISSUES_STATUS).map(([k, m]) => ({ value: k, label: m.label }));
  const meta = html`<span className="iss-meta">
    <${IssuesStatusTag} issue=${issue} />
    <${Tag} tone=${ISSUES_SEVERITY[issue.severity].tone}>${ISSUES_SEVERITY[issue.severity].label}严重度<//>
    <${Tag} tone="outline" icon=${issue.kind === 'connection' ? 'Link2Off' : 'Box'}>${issue.kind === 'connection' ? '连接问题' : '节点问题'}<//>
    <span className="mono iss-meta-code">${issue.code}${issue.http ? ` · HTTP ${issue.http}` : ''}</span>
    ${issue.envs.length > 0 && isStagedProject(state, issue.projectIds[0]) && html`<span>${issue.envs.map((e) => (e === 'test' ? '测试环境' : '生产环境')).join('、')}</span>`}
    <span title=${fmt.dateTime(issue.firstAt)}>首次 ${fmt.relative(issue.firstAt)}</span>
    <span title=${fmt.dateTime(issue.lastAt)}>最近 ${fmt.relative(issue.lastAt)}</span>
  </span>`;
  const workflows = issue.workflowIds.map((wid) => {
    const wf = state.workflows.find((w) => w.id === wid);
    return { wid, wf, count: runs.filter((r) => r.workflowId === wid).length };
  }).sort((a, b) => b.count - a.count);
  const maxWf = Math.max(1, ...workflows.map((w) => w.count));
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      back="/issues"
      icon=${html`<${IssuesKindIcon} issue=${issue} state=${state} size=${36} />`}
      title=${issue.title}
      description=${meta}
      actions=${html`<${Fragment}>
        <${Tooltip} content=${canAct ? '' : actReason}><${IssuesAssignSelect} issue=${issue} state=${state} disabled=${!canAct} /><//>
        <${Tooltip} content=${canAct ? '' : actReason}><${IssuesMuteMenu} items=${[issue]} disabled=${!canAct} /><//>
        <${Tooltip} content=${canAct ? '' : actReason}><${Select} width=${112} value=${issue.status} onChange=${changeStatus} options=${statusOptions} disabled=${!canAct} /><//>
        ${issue.status !== 'resolved' && html`<${Tooltip} content=${canAct ? '' : actReason}><${Button} variant="primary" icon="CircleCheck" disabled=${!canAct} onClick=${resolve}>标记已解决<//><//>`}
      <//>`}
    />
    <div className="iss-banners">
      ${!canAct && html`<${Alert} tone="warning" title="只读">${actReason}。<//>`}
      ${issue.reopened && html`<${Alert} tone="danger" icon="RotateCcw" title="问题复发">
        ${personName(saved.resolvedBy)} 在 ${fmt.short(saved.resolvedAt)} 把它标记为已解决，之后又失败了 ${reopenCount} 次，问题已自动重新打开${(state.alertEvents || []).some((e) => e.issue === issue.sig && e.kind === 'reopen' && e.at >= saved.resolvedAt) ? '，并按告警策略发送了复发告警' : ''}。
      <//>`}
      ${issue.status === 'resolved' && html`<${Alert} tone="success" title="已解决">${personName(issue.resolvedBy)} 在 ${fmt.short(issue.resolvedAt)} 标记为已解决。之后再失败会自动重新打开并告警。<//>`}
      ${issue.status === 'ignored' && html`<${Alert} tone="info" icon="CircleSlash" title="已忽略" action=${canAct ? html`<${Button} size="sm" onClick=${() => { issuesSetStatus([issue], 'open'); toast.success('已取消忽略'); }}>取消忽略<//>` : null}>不计入未处理，也不会告警；再次失败时保持忽略。<//>`}
      ${muted && html`<${Alert} tone="info" icon="BellOff" title=${`静默到 ${fmt.short(issue.mutedUntil)}`} action=${canAct ? html`<${Button} size="sm" onClick=${() => { issuesMute([issue], 0); toast.success('已取消静默'); }}>取消静默<//>` : null}>这段时间内的失败不会发送告警，也不计入未处理。<//>`}
      ${settledAll && !['resolved', 'ignored'].includes(issue.status) && html`<${Alert} tone="success" title=${`受影响的 ${runs.length} 次运行都已重跑成功`} action=${canAct ? html`<${Button} size="sm" variant="primary" onClick=${resolve}>标记已解决<//>` : null}>确认修复后把问题标记为已解决；之后再失败会自动重新打开。<//>`}
    </div>
    <div className="iss-detail">
      <div className="iss-main">
        <${IssuesInsightCard} issue=${issue} state=${state} canAct=${canAct} actReason=${actReason} settledAll=${settledAll} onReplay=${(ids, mode) => setReplay({ ids, mode })} onResolve=${resolve} onIgnore=${ignore} />
        <${IssuesOccurrenceChart} runs=${runs} resolvedAt=${saved.resolvedAt || null} />
        <${IssuesRunsCard} issue=${issue} state=${state} canAct=${canAct} actReason=${actReason} onReplay=${(ids, mode) => setReplay({ ids, mode })} />
        <${IssuesActivityCard} issue=${issue} state=${state} canAct=${canAct} actReason=${actReason} />
      </div>
      <div className="iss-side">
        <${Card} className="iss-card" title="概况">
          <div className="kv iss-kv">
            <div><span>状态</span><span className="row-4"><${IssuesStatusTag} issue=${issue} size="sm" />${muted && html`<span className="text-xs muted">静默中</span>`}</span></div>
            <div><span>负责人</span><span>${issue.assignee ? personName(issue.assignee) : html`<span className="muted">未指派</span>`}</span></div>
            <div><span>影响</span><span>${issue.workflowIds.length} 个工作流 · ${issue.count} 次运行</span></div>
            <div><span>首次出现</span><span>${fmt.dateTime(issue.firstAt)}</span></div>
            <div><span>最近出现</span><span>${fmt.dateTime(issue.lastAt)}</span></div>
            <div><span>所属项目</span><span>${issuesProjectNames(state, issue.projectIds)}</span></div>
            <div><span>错误码</span><span className="mono iss-kv-code">${issue.code}</span></div>
            ${issue.http && html`<div><span>HTTP 状态</span><span className="mono iss-kv-code">${issue.http}</span></div>`}
            ${issue.kind === 'connection' && html`<div><span>连接</span><span>${(() => { const c = state.connections.find((x) => x.id === issue.connectionId); return c ? html`<span className="row-4"><${Dot} tone=${CONN_STATUS[c.status].tone} /><${Link} className="link" to=${`/connections?id=${c.id}`}>${c.name}<//></span>` : '已删除的连接'; })()}</span></div>`}
          </div>
        <//>
        <${Card} className="iss-card" title="受影响的工作流">
          <div className="iss-wfs">
            ${workflows.map((w) => html`<div key=${w.wid} className="iss-wf">
              <div className="row-4">
                ${w.wf ? html`<${Link} className="link ellipsis" to=${`/integration/${w.wf.projectId}/wf/${w.wf.id}`}>${w.wf.name}<//>` : html`<span className="muted ellipsis">已删除的工作流</span>`}
                <span className="spacer" />
                <span className="text-xs"><b>${w.count}</b> 次</span>
              </div>
              <div className="iss-wf-bar"><span style=${{ width: `${Math.max(4, Math.round((w.count / maxWf) * 100))}%` }} /></div>
              ${w.wf && html`<div className="text-xs muted">${issuesProjectNames(state, [w.wf.projectId])}${isStagedProject(state, w.wf.projectId) ? ` · 生产 v${w.wf.version}` : ` · v${w.wf.version}`}</div>`}
            </div>`)}
          </div>
        <//>
        <${IssuesAlertsCard} issue=${issue} state=${state} />
      </div>
    </div>
    <${ReplayModal} open=${Boolean(replay)} runIds=${replay ? replay.ids : []} mode=${replay ? replay.mode : 'node'} state=${state} onClose=${() => setReplay(null)} />
  </div></div>`;
}

function ReplayModal({ open, onClose, runIds, state, mode: initialMode, onDone }) {
  const live = useStore();
  const st = live || state;
  const [mode, setMode] = useState(initialMode || 'node');
  const [version, setVersion] = useState('latest');
  const [conc, setConc] = useState(3);
  const [override, setOverride] = useState(false);
  const [phase, setPhase] = useState('config');
  const [queue, setQueue] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const jumpRef = useRef(false);
  const beforeRef = useRef([]);
  const finishedRef = useRef(false);
  const idsKey = (runIds || []).join(',');
  useEffect(() => {
    if (!open) return;
    setMode(initialMode || 'node');
    setVersion('latest');
    setConc(3);
    setOverride(false);
    setPhase('config');
    setQueue([]);
    setCursor(0);
    setResults([]);
    setSummary(null);
    setShowSkipped(false);
    jumpRef.current = false;
    finishedRef.current = false;
  }, [open, idsKey]);
  const plan = useMemo(() => (open && phase === 'config' ? issuesReplayPlan(st, runIds || [], { mode, version }) : { items: [], excluded: [], merged: [] }), [open, phase, st.runs, st.workflows, st.connections, st.members, st.versions, idsKey, mode, version]);
  const ready = plan.items.filter((x) => x.category === 'ready');
  const stale = plan.items.filter((x) => x.category === 'stale');
  const blockedItems = plan.items.filter((x) => x.category === 'blocked');
  const runnable = [...ready, ...(override ? stale : [])];
  const finish = (all, stopped) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const s = Store.get();
    const made = all.map((x) => x.next);
    const ok = made.filter((r) => r.status === 'success');
    const bad = made.filter((r) => r.status !== 'success');
    const label = ISSUES_REPLAY_MODES[mode].label;
    const after = issuesCollect(s);
    const sigs = [...new Set(all.map((x) => issueSignature(x.item.run)).filter(Boolean))];
    const touched = after.filter((i) => sigs.includes(i.sig));
    if (touched.length && made.length) {
      touched.forEach((issue) => {
        const mine = all.filter((x) => issueSignature(x.item.run) === issue.sig).map((x) => x.next);
        const good = mine.filter((r) => r.status === 'success').length;
        issuesPatch([issue], {}, { action: 'replay', text: `${label}了 ${mine.length} 次运行：成功 ${good}${mine.length - good ? `，再次失败 ${mine.length - good}` : ''}` });
      });
    }
    const pids = [...new Set(made.map((r) => r.projectId))];
    pids.forEach((pid) => {
      const mine = made.filter((r) => r.projectId === pid);
      addAudit(mine.length === 1 && all.length === 1 ? '重跑运行' : '批量重跑', mine.length === 1 && all.length === 1 ? `${all[0].item.run.id}（${label}）` : `${mine.length} 次运行（${label}）`, pid);
    });
    const alerts = issuesRecordAlerts(beforeRef.current, issuesCollect(Store.get()), bad);
    const s2 = Store.get();
    const offers = issuesCollect(s2).filter((i) => !['resolved', 'ignored'].includes(i.status) && sigs.includes(i.sig) && i.runIds.every((id) => issuesSettled(s2, issuesRunIndex(s2).get(id))));
    setSummary({ ok: ok.length, bad: bad.length, stopped: stopped || 0, alerts, offers: offers.map((i) => i.sig) });
    setPhase('done');
    if (onDone) onDone(made, { jump: jumpRef.current });
    if (jumpRef.current) onClose();
  };
  useEffect(() => {
    if (phase !== 'running') return undefined;
    if (cursor >= queue.length) { finish(results); return undefined; }
    const t = setTimeout(() => {
      const wave = queue.slice(cursor, cursor + conc);
      const s = Store.get();
      const at = Date.now();
      const made = wave.map((item, i) => {
        const recheck = issuesBrokenOnPath(s, item.run, item.wf, mode);
        const eff = recheck && (!item.outcome || item.outcome.status === 'success')
          ? { ...item, outcome: { status: 'failed', failedNodeId: recheck.node.id, failure: { code: 'CONNECTION_AUTH_FAILED', message: (recheck.conn && recheck.conn.error) || '连接不可用，请重新授权', http_status: 401, attempts: 3, ...(recheck.conn ? { connectionId: recheck.conn.id } : {}) } } }
          : item;
        return { item, next: issuesReplayMake(eff, { mode, me: s.me, at: at + i }) };
      });
      Store.set((x) => ({ ...x, runs: [...made.map((m) => m.next).reverse(), ...x.runs] }));
      setResults((r) => [...r, ...made]);
      setCursor((c) => c + wave.length);
    }, 520);
    return () => clearTimeout(t);
  }, [phase, cursor]);
  if (!open) return null;
  const start = (jump) => {
    if (!runnable.length) return;
    jumpRef.current = Boolean(jump);
    beforeRef.current = issuesCollect(Store.get());
    setQueue(runnable);
    setCursor(0);
    setResults([]);
    setPhase('running');
  };
  const stopRest = () => {
    const left = queue.length - cursor;
    setQueue((q) => q.slice(0, cursor));
    finish(results, left);
  };
  const close = () => {
    if (phase === 'running') {
      const left = queue.length - cursor;
      finish(results, left);
      if (left) toast.info(`已停止，剩余 ${left} 次运行没有重跑`);
    }
    onClose();
  };
  const single = (runIds || []).length === 1;
  const wfIds = [...new Set(runnable.map((x) => x.run.workflowId))];
  const versions = [...new Set(plan.items.map((x) => x.run.version))];
  const latestVersions = [...new Set(plan.items.map((x) => { const dep = deploymentOf(x.wf, x.env); return dep ? dep.version : x.version; }))];
  const versionDiff = plan.items.some((x) => { const dep = deploymentOf(x.wf, x.env); return dep && dep.version !== x.run.version; });
  const hasTest = plan.items.some((x) => x.env === 'test');
  const concLimited = wfIds.map((id) => st.workflows.find((w) => w.id === id)).filter((w) => w && w.trigger.runSettings && w.trigger.runSettings.concurrency && w.trigger.runSettings.concurrency.max < conc);
  const blockFix = blockedItems.find((x) => x.fix);
  const skippedCount = plan.excluded.length + plan.merged.length;
  const title = single ? (mode === 'node' ? '从失败节点重跑' : '整体重跑') : '批量重跑';
  const doneItems = results.length;
  const total = queue.length;
  const okCount = results.filter((x) => x.next.status === 'success').length;
  const badCount = doneItems - okCount;
  const inflight = phase === 'running' ? queue.slice(cursor, cursor + conc) : [];
  const wfLabel = (id) => (st.workflows.find((w) => w.id === id) || { name: '已删除的工作流' }).name;
  const offerIssues = summary ? issuesCollect(st).filter((i) => summary.offers.includes(i.sig) && !['resolved', 'ignored'].includes(i.status)) : [];
  const newIds = results.map((x) => x.next.id);
  const footer = phase === 'config'
    ? html`<${Fragment}>
      <span className="text-xs muted grow">${runnable.length ? `将重跑 ${runnable.length} 次运行${wfIds.length > 1 ? `（${wfIds.length} 个工作流）` : ''}，生成新日志并关联原日志` : '没有可以重跑的运行'}</span>
      <${Button} onClick=${close}>取消<//>
      ${single
        ? html`<${Fragment}>
          <${Button} disabled=${!runnable.length} onClick=${() => start(false)}>仅重跑<//>
          <${Button} variant="primary" disabled=${!runnable.length} onClick=${() => start(true)}>重跑并跳转<//>
        <//>`
        : html`<${Button} variant="primary" icon=${ISSUES_REPLAY_MODES[mode].icon} disabled=${!runnable.length} onClick=${() => start(false)}>${runnable.length ? `开始重跑 ${runnable.length} 次` : '开始重跑'}<//>`}
    <//>`
    : phase === 'running'
      ? html`<${Fragment}><span className="text-xs muted grow">关闭窗口会停止还没开始的重跑</span><${Button} icon="CircleStop" onClick=${stopRest}>停止剩余<//><//>`
      : html`<${Fragment}>
        <span className="grow" />
        ${newIds.length > 0 && html`<${Button} icon="ScrollText" onClick=${() => { onClose(); navigate(newIds.length === 1 ? `/logs?run=${newIds[0]}` : `/logs?workflow=${[...new Set(results.map((x) => x.next.workflowId))].join(',')}&time=15m`); }}>查看新日志<//>`}
        <${Button} variant="primary" onClick=${onClose}>完成<//>
      <//>`;
  const versionOptions = [
    { value: 'latest', label: latestVersions.length === 1 ? `最新已发布版本（v${latestVersions[0]}）` : '最新已发布版本' },
    { value: 'original', label: versions.length === 1 ? `原版本（v${versions[0]}）` : '原版本（各自运行的版本）' },
  ];
  return html`<${Modal}
    open=${true}
    onClose=${close}
    width=${660}
    maskClosable=${phase !== 'running'}
    className="iss-replay"
    title=${title}
    description=${single ? `重跑后，将重新触发${version === 'latest' ? '最新已发布' : '原版本'}的工作流并生成新日志${mode === 'node' ? '；失败节点之前的节点沿用原结果' : ''}` : '失败的运行会生成新日志并关联原日志，便于追溯'}
    footer=${footer}
  >
    ${phase === 'config' && html`<div className="iss-replay-body">
      <${Field} label="重跑方式">
        <div className="iss-mode-grid">
          ${Object.entries(ISSUES_REPLAY_MODES).map(([k, m]) => html`<button key=${k} type="button" className=${cx('radio-card', mode === k && 'is-active')} onClick=${() => setMode(k)} aria-pressed=${mode === k}>
            <span className="radio-card-icon"><${Icon} name=${m.icon} size=${18} /></span>
            <span className="radio-card-body">
              <span className="radio-card-title">${m.label}${k === 'node' && html`<span className="iss-rec">推荐</span>`}</span>
              <span className="radio-card-desc">${k === 'node' ? '失败节点之前的节点沿用原结果，不会重复执行，不会重复开通账号或重复发消息。' : '从触发器开始重新执行，前面成功过的节点会再执行一次，可能产生重复数据。'}</span>
            </span>
          </button>`)}
        </div>
      <//>
      <div className="iss-replay-row">
        <${Field} label="使用版本" hint=${versionDiff && mode === 'node' && version === 'latest' ? '最新版本在失败节点之前有改动时，沿用的结果可能和新流程不一致' : ''}>
          <${Segmented} value=${version} onChange=${setVersion} options=${versionOptions} />
        <//>
        ${!single && html`<${Field} label="并发数" help="同时重跑的运行数量。并发越高越快，但下游系统可能限流。">
          <${Segmented} value=${conc} onChange=${setConc} options=${ISSUES_REPLAY_CONCURRENCY.map((c) => ({ value: c, label: String(c) }))} />
        <//>`}
      </div>
      <div className="iss-pre">
        <div className="iss-pre-title">运行前检查</div>
        ${ready.length > 0 && html`<div className="iss-pre-row is-ok">
          <${Icon} name="CircleCheck" size=${16} />
          <div className="grow"><b>${ready.length} 次可以重跑</b><span className="muted">${[...new Set(ready.map((x) => x.note).filter(Boolean))].slice(0, 2).join('；')}</span></div>
        </div>`}
        ${stale.length > 0 && html`<div className="iss-pre-row is-warn">
          <${Icon} name="TriangleAlert" size=${16} />
          <div className="grow">
            <b>${stale.length} 次是数据或配置问题，${stale[0].reason}</b>
            <span className="muted">${stale[0].run.failure ? stale[0].run.failure.message : ''}</span>
            <div className="iss-pre-override"><${Checkbox} checked=${override} onChange=${setOverride} label=${`仍然重跑这 ${stale.length} 次（用来确认问题是否还在）`} /></div>
          </div>
        </div>`}
        ${blockedItems.length > 0 && html`<div className="iss-pre-row is-block">
          <${Icon} name="Ban" size=${16} />
          <div className="grow">
            <b>${blockedItems.length} 次被拦下：${blockedItems[0].reason}</b>
            <span className="muted">连接修好之前重跑只会再失败一次，所以这些运行不会重跑。</span>
            ${blockFix && html`<div className="iss-pre-fix">
              <a className="link" onClick=${() => { onClose(); navigate(blockFix.fix.to); }}>${blockFix.fix.label}</a>
              ${blockFix.fix.note && html`<span className="text-xs muted">${blockFix.fix.note}</span>`}
            </div>`}
          </div>
        </div>`}
        ${skippedCount > 0 && html`<div className="iss-pre-row is-skip">
          <${Icon} name="CircleMinus" size=${16} />
          <div className="grow">
            <b>${skippedCount} 次不需要重跑</b>
            <span className="muted">${plan.merged.length ? `${plan.merged.length} 次是同一次触发的重复尝试，每次触发只重跑最近的一次` : ''}${plan.merged.length && plan.excluded.length ? '；' : ''}${plan.excluded.length ? `${plan.excluded.length} 次不满足重跑条件` : ''}</span>
            <button type="button" className="link text-xs" onClick=${() => setShowSkipped(!showSkipped)}>${showSkipped ? '收起明细' : '查看明细'}</button>
            ${showSkipped && html`<ul className="iss-pre-list">
              ${plan.merged.map((x) => html`<li key=${`m${x.id}`}><span className="mono">${x.id}</span><span className="muted">和 ${x.into} 是同一次触发，只重跑 ${x.into}</span></li>`)}
              ${plan.excluded.map((x) => html`<li key=${`e${x.id}`}><span className="mono">${x.id}</span><span className="muted">${x.reason}</span>${x.link && html`<a className="link" onClick=${() => { onClose(); navigate(`/logs?run=${x.link}`); }}>查看</a>`}</li>`)}
            </ul>`}
          </div>
        </div>`}
        ${!plan.items.length && !skippedCount && html`<div className="iss-pre-row is-skip"><${Icon} name="Inbox" size=${16} /><div className="grow"><b>没有选择运行</b></div></div>`}
      </div>
      ${hasTest && html`<div className="iss-replay-note"><${Icon} name="Info" size=${14} />测试环境的运行在测试环境重跑，使用测试环境的连接替换。</div>`}
      ${mode === 'full' && runnable.length > 0 && html`<div className="iss-replay-note is-warn"><${Icon} name="TriangleAlert" size=${14} />整体重跑会重新执行已经成功的节点。手动重跑不受触发器去重限制，请确认下游能接受重复请求。</div>`}
      ${!single && concLimited.length > 0 && html`<div className="iss-replay-note"><${Icon} name="Info" size=${14} />「${concLimited[0].name}」的触发器限制最多 ${concLimited[0].trigger.runSettings.concurrency.max} 个并发，超出的会排队执行。</div>`}
    </div>`}
    ${phase !== 'config' && html`<div className="iss-replay-body">
      <div className="iss-progress-head">
        <b>${phase === 'running' ? `正在重跑 ${doneItems} / ${total}` : summary && summary.stopped ? `已停止，完成 ${doneItems} 次` : `完成 ${doneItems} 次重跑`}</b>
        <span className="text-xs"><span className="iss-ok-text">成功 ${okCount}</span> · <span className=${badCount ? 'iss-bad-text' : 'muted'}>再次失败 ${badCount}</span>${phase === 'running' ? html`<span className="muted"> · 排队 ${Math.max(0, total - doneItems - inflight.length)}</span>` : null}</span>
      </div>
      <${Progress} value=${total ? (doneItems / total) * 100 : 100} tone=${badCount ? 'warning' : 'success'} />
      ${phase === 'done' && summary && html`<div className="iss-done">
        ${summary.bad === 0 && summary.ok > 0 && html`<${Alert} tone="success" title=${`${summary.ok} 次运行全部重跑成功`}>新日志已关联原日志${mode === 'node' ? '，失败节点之前的节点沿用了原结果' : ''}。<//>`}
        ${summary.bad > 0 && html`<${Alert} tone="warning" title=${`${summary.bad} 次再次失败`}>
          失败原因没有变化。${summary.alerts && summary.alerts.created ? `已按告警策略发送 ${summary.alerts.created} 条告警。` : summary.alerts && summary.alerts.merged ? `失败已合并进最近的告警，没有重复通知。` : ''}
        <//>`}
        ${summary.stopped > 0 && html`<div className="text-xs muted">有 ${summary.stopped} 次运行没有开始，已取消。</div>`}
        ${offerIssues.map((i) => html`<div key=${i.sig} className="iss-offer">
          <${Icon} name="CircleCheck" size=${16} />
          <div className="grow"><b>问题「${i.title}」受影响的运行都已重跑成功</b><span className="text-xs muted">确认修复后可以关闭这个问题，之后再失败会自动重新打开。</span></div>
          <${Button} size="sm" variant="primary" disabled=${!issuesCanAct(st, i)} onClick=${() => { issuesSetStatus([i], 'resolved'); toast.success('已标记为已解决'); }}>标记已解决<//>
        </div>`)}
      </div>`}
      <ul className="iss-run-list">
        ${results.map((x) => html`<li key=${x.next.id}>
          <span className=${cx('status-ic', `tone-${RUN_STATUS[x.next.status].tone}`)}><${Icon} name=${RUN_STATUS[x.next.status].icon} size=${15} /></span>
          <span className="ellipsis grow">${wfLabel(x.item.run.workflowId)}<span className="muted"> · ${fmt.short(x.item.run.startedAt)} 的运行</span></span>
          <span className="text-xs muted nowrap">${x.next.status === 'success' ? '成功' : x.next.failure ? x.next.failure.code : '失败'}</span>
          <a className="link text-xs nowrap" onClick=${() => { onClose(); navigate(`/logs?run=${x.next.id}`); }}>新日志</a>
        </li>`)}
        ${inflight.map((item) => html`<li key=${`f${item.id}`} className="is-running">
          <span className="status-ic tone-info"><${Icon} name="LoaderCircle" size=${15} className="spin" /></span>
          <span className="ellipsis grow">${wfLabel(item.run.workflowId)}<span className="muted"> · ${fmt.short(item.run.startedAt)} 的运行</span></span>
          <span className="text-xs muted">运行中</span>
        </li>`)}
      </ul>
    </div>`}
  <//>`;
}

function issuesPolicyDraft(policy) {
  if (policy) {
    return {
      ...policy,
      projects: [...(policy.projects || [])],
      workflows: [...(policy.workflows || [])],
      events: [...(policy.events || [])],
      channels: [...(policy.channels || [])],
      threshold: policy.threshold == null ? '20' : String(policy.threshold),
      window: policy.window || '1h',
      groupWindow: String(policy.groupWindow ?? 30),
      quiet: { enabled: false, from: '22:00', to: '08:00', ...(policy.quiet || {}) },
      escalation: { enabled: false, channel: null, ...(policy.escalation || {}), afterMin: String((policy.escalation && policy.escalation.afterMin) || 60) },
    };
  }
  return { id: null, name: '', enabled: true, projects: [], workflows: [], events: ['issue_new', 'issue_reopen'], channels: [], threshold: '20', window: '1h', groupWindow: '30', quiet: { enabled: false, from: '22:00', to: '08:00' }, escalation: { enabled: false, afterMin: '60', channel: null } };
}

function issuesPolicyErrors(d, state) {
  const e = {};
  const name = d.name.trim();
  if (!name) e.name = '请输入策略名称';
  else if (name.length > 30) e.name = '策略名称不能超过 30 个字';
  else if ((state.alertPolicies || []).some((p) => p.id !== d.id && p.name === name)) e.name = '已有同名的告警策略';
  if (!d.events.length) e.events = '至少选择一个触发事件';
  if (d.events.includes('failure_rate')) {
    const t = String(d.threshold).trim();
    if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > 100) e.threshold = '失败率阈值需为 1-100 之间的整数';
    if (!ISSUES_RATE_WINDOWS.some((w) => w.value === d.window)) e.window = '请选择统计窗口';
  }
  const g = String(d.groupWindow).trim();
  if (!/^\d+$/.test(g) || Number(g) < 1 || Number(g) > 1440) e.groupWindow = '聚合窗口需为 1-1440 之间的整数（分钟）';
  if (d.quiet.enabled) {
    const from = issuesParseClock(d.quiet.from);
    const to = issuesParseClock(d.quiet.to);
    if (from === null || to === null) e.quiet = '时间格式为 HH:MM，例如 22:00';
    else if (from === to) e.quiet = '开始和结束时间不能相同';
  }
  const chs = state.channels || [];
  if (!d.channels.length) e.channels = '至少选择一个通知渠道';
  else if (d.channels.some((cid) => !issuesChannelState(state, chs.find((c) => c.id === cid)).ok)) e.channels = '选中了不可用的渠道，请移除';
  if (d.escalation.enabled) {
    const a = String(d.escalation.afterMin).trim();
    if (!/^\d+$/.test(a) || Number(a) < 5 || Number(a) > 1440) e.escalation = '升级时间需为 5-1440 之间的整数（分钟）';
    else if (!d.escalation.channel) e.escalation = '请选择升级通知的渠道';
    else if (!issuesChannelState(state, chs.find((c) => c.id === d.escalation.channel)).ok) e.escalation = '升级渠道不可用，请换一个';
  }
  return e;
}

const ISSUES_POLICY_FIELD_LABEL = { name: '策略名称', events: '触发事件', threshold: '失败率阈值', window: '统计窗口', groupWindow: '聚合窗口', quiet: '静默时段', channels: '通知渠道', escalation: '升级规则' };

function IssuesPolicyDrawer({ open, policyId, onClose, onTest }) {
  const state = useStore();
  const policy = policyId ? (state.alertPolicies || []).find((p) => p.id === policyId) || null : null;
  const [draft, setDraft] = useState(() => issuesPolicyDraft(policy));
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    setDraft(issuesPolicyDraft(policyId ? (Store.get().alertPolicies || []).find((p) => p.id === policyId) : null));
    setTouched({});
  }, [open, policyId]);
  const canManage = issuesCanManageAlerts(state);
  const errors = issuesPolicyErrors(draft, state);
  const invalid = Object.keys(errors).length > 0;
  const show = (k) => (touched[k] || draft.id ? errors[k] || null : errors[k] && !['name', 'channels'].includes(k) ? errors[k] : null);
  const set = (k, v) => { setDraft((d) => ({ ...d, [k]: v })); setTouched((t) => ({ ...t, [k]: true })); };
  const setQuiet = (patch) => { setDraft((d) => ({ ...d, quiet: { ...d.quiet, ...patch } })); setTouched((t) => ({ ...t, quiet: true })); };
  const setEsc = (patch) => { setDraft((d) => ({ ...d, escalation: { ...d.escalation, ...patch } })); setTouched((t) => ({ ...t, escalation: true })); };
  const projects = state.projects;
  const scopePids = draft.projects.length ? draft.projects : projects.map((p) => p.id);
  const wfOptions = state.workflows.filter((w) => scopePids.includes(w.projectId)).map((w) => ({ value: w.id, label: w.name, desc: issuesProjectNames(state, [w.projectId]) }));
  const chOptions = (state.channels || []).map((c) => {
    const cs = issuesChannelState(state, c);
    return { value: c.id, label: c.name, desc: cs.ok ? (ISSUES_CHANNEL_TYPES[c.type] || {}).label : `不可用：${cs.reason}`, disabled: !cs.ok && !draft.channels.includes(c.id), iconNode: html`<${IssuesChannelIcon} type=${c.type} size=${18} />` };
  });
  const toggleEvent = (v, on) => set('events', on ? [...draft.events, v] : draft.events.filter((x) => x !== v));
  const save = () => {
    setTouched({ name: true, channels: true, events: true, quiet: true, escalation: true, threshold: true, groupWindow: true });
    if (invalid || !canManage) return;
    const now = Date.now();
    const clean = {
      name: draft.name.trim(), enabled: draft.enabled, projects: draft.projects, workflows: draft.workflows.filter((wid) => wfOptions.some((o) => o.value === wid)),
      events: ISSUES_EVENTS.map((x) => x.value).filter((v) => draft.events.includes(v)), channels: draft.channels,
      ...(draft.events.includes('failure_rate') ? { threshold: Number(draft.threshold), window: draft.window } : { threshold: undefined, window: undefined }),
      groupWindow: Number(draft.groupWindow), quiet: { enabled: draft.quiet.enabled, from: draft.quiet.from.trim(), to: draft.quiet.to.trim() },
      escalation: { enabled: draft.escalation.enabled, afterMin: Number(draft.escalation.afterMin) || 60, channel: draft.escalation.channel || null },
      updatedBy: state.me, updatedAt: now,
    };
    if (draft.id) {
      patchList('alertPolicies', draft.id, clean);
      addAudit('修改告警策略', clean.name, null);
      toast.success('告警策略已保存');
    } else {
      Store.set((s) => ({ ...s, alertPolicies: [{ id: uid('ap'), ...clean }, ...(s.alertPolicies || [])] }));
      addAudit('新建告警策略', clean.name, null);
      toast.success('告警策略已创建');
    }
    onClose();
  };
  const missing = Object.keys(errors).map((k) => ISSUES_POLICY_FIELD_LABEL[k]).filter(Boolean);
  const eventOn = (v) => draft.events.includes(v);
  return html`<${Drawer}
    open=${open}
    onClose=${onClose}
    width=${620}
    title=${draft.id ? '编辑告警策略' : '新建告警策略'}
    subtitle="决定哪些问题、在什么时候、通知到哪里"
    footer=${html`<${Fragment}>
      <${Button} icon="Send" disabled=${!draft.channels.length || Boolean(errors.channels)} onClick=${() => onTest({ name: draft.name.trim() || '未命名策略', channels: draft.channels })}>测试发送<//>
      <span className="grow text-xs muted iss-drawer-hint">${invalid ? `还需完善：${missing.join('、')}` : ''}</span>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" disabled=${invalid || !canManage} onClick=${save}>保存<//>
    <//>`}
  >
    ${!canManage && html`<div className="iss-drawer-alert"><${Alert} tone="warning">只有平台所有者和管理员可以修改告警策略。<//></div>`}
    <${Field} label="策略名称" required error=${show('name')} extra=${html`<span className=${cx('text-xs', draft.name.trim().length > 30 ? 'iss-over' : 'muted')}>${draft.name.trim().length}/30</span>`}>
      <${Input} value=${draft.name} onChange=${(v) => set('name', v)} placeholder="例如：核心流程出现新问题" invalid=${Boolean(show('name'))} autoFocus=${!draft.id} />
    <//>
    <div className="iss-form-section">范围</div>
    <div className="form-grid iss-scope-grid">
      <${Field} label="项目" hint="不选表示全部项目">
        <${Select} multiple searchable value=${draft.projects} onChange=${(v) => set('projects', v)} placeholder="全部项目" options=${projects.map((p) => ({ value: p.id, label: p.name }))} />
      <//>
      <${Field} label="工作流" hint="不选表示范围内的全部工作流">
        <${Select} multiple searchable value=${draft.workflows.filter((w) => wfOptions.some((o) => o.value === w))} onChange=${(v) => set('workflows', v)} placeholder="全部工作流" options=${wfOptions} dropdownWidth=${320} renderValue=${(sel) => (sel.length ? html`<span className="select-value" title=${sel.map((o) => o.label).join('、')}>${sel.length === 1 ? sel[0].label : `${sel[0].label} 等 ${sel.length} 个`}</span>` : null)} />
      <//>
    </div>
    <div className="iss-form-section">触发事件</div>
    <${Field} error=${show('events')}>
      <div className="iss-events">
        ${ISSUES_EVENTS.map((ev) => html`<div key=${ev.value} className=${cx('iss-event', eventOn(ev.value) && 'is-on')}>
          <${Checkbox} checked=${eventOn(ev.value)} onChange=${(on) => toggleEvent(ev.value, on)} label=${ev.label} />
          <div className="iss-event-desc">${ev.desc}</div>
          ${ev.value === 'failure_rate' && eventOn('failure_rate') && html`<div className="iss-event-extra">
            <span className="text-xs">统计窗口</span>
            <${Select} size="sm" width=${110} value=${draft.window} onChange=${(v) => set('window', v)} options=${ISSUES_RATE_WINDOWS} />
            <span className="text-xs">内失败率超过</span>
            <${Input} size="sm" style=${{ width: 84 }} value=${draft.threshold} onChange=${(v) => set('threshold', v.replace(/[^\d]/g, '').slice(0, 3))} suffix="%" invalid=${Boolean(errors.threshold)} />
            ${errors.threshold && html`<div className="field-error iss-inline-error">${errors.threshold}</div>`}
          </div>`}
        </div>`)}
      </div>
    <//>
    <div className="iss-form-section">降噪</div>
    <${Field} label="聚合窗口" error=${show('groupWindow')} hint="窗口内的后续失败合并进已发出的告警，告警里会写明合并了多少次">
      <div className="row iss-sentence">
        <span>同一问题</span>
        <${Input} style=${{ width: 96 }} value=${draft.groupWindow} onChange=${(v) => set('groupWindow', v.replace(/[^\d]/g, '').slice(0, 4))} suffix="分钟" invalid=${Boolean(show('groupWindow'))} />
        <span>内只通知一次</span>
        <span className="text-xs muted">${/^\d+$/.test(String(draft.groupWindow)) && Number(draft.groupWindow) >= 60 ? `（${issuesMinutesLabel(Number(draft.groupWindow))}）` : ''}</span>
      </div>
    <//>
    <${Field} label="静默时段" error=${show('quiet')} hint=${draft.quiet.enabled ? '静默时段内产生的告警会在结束后合并发送；升级通知不受静默影响' : '例如夜间不打扰值班群'}>
      <div className="row iss-sentence">
        <${Switch} checked=${draft.quiet.enabled} onChange=${(v) => setQuiet({ enabled: v })} />
        <span>${draft.quiet.enabled ? '每天' : '关闭'}</span>
        ${draft.quiet.enabled && html`<${Fragment}>
          <${Input} style=${{ width: 80 }} mono value=${draft.quiet.from} onChange=${(v) => setQuiet({ from: v.slice(0, 5) })} placeholder="22:00" invalid=${Boolean(show('quiet'))} />
          <span>至</span>
          <${Input} style=${{ width: 80 }} mono value=${draft.quiet.to} onChange=${(v) => setQuiet({ to: v.slice(0, 5) })} placeholder="08:00" invalid=${Boolean(show('quiet'))} />
          <span className="text-xs muted">${issuesParseClock(draft.quiet.from) !== null && issuesParseClock(draft.quiet.to) !== null && issuesParseClock(draft.quiet.from) > issuesParseClock(draft.quiet.to) ? '跨午夜' : ''}</span>
        <//>`}
      </div>
    <//>
    <${Field} label="升级" error=${show('escalation')} hint=${draft.escalation.enabled ? '问题一直是「未处理」时触发；标记处理中、已解决或静默后不再升级' : '没人响应时通知更高一级的渠道'}>
      <div className="row iss-sentence">
        <${Switch} checked=${draft.escalation.enabled} onChange=${(v) => setEsc({ enabled: v })} />
        ${draft.escalation.enabled
          ? html`<${Fragment}>
            <${Input} style=${{ width: 96 }} value=${draft.escalation.afterMin} onChange=${(v) => setEsc({ afterMin: v.replace(/[^\d]/g, '').slice(0, 4) })} suffix="分钟" invalid=${Boolean(show('escalation')) && !(/^\d+$/.test(String(draft.escalation.afterMin)) && Number(draft.escalation.afterMin) >= 5 && Number(draft.escalation.afterMin) <= 1440)} />
            <span>未处理，升级到</span>
            <${Select} width=${190} value=${draft.escalation.channel} onChange=${(v) => setEsc({ channel: v })} placeholder="选择渠道" options=${chOptions} />
          <//>`
          : html`<span>关闭</span>`}
      </div>
    <//>
    <div className="iss-form-section">通知</div>
    <${Field} label="通知渠道" required error=${show('channels')} hint="不可用的渠道不能选择；没有合适的渠道时到「通知渠道」添加">
      <${Select} multiple value=${draft.channels} onChange=${(v) => set('channels', v)} placeholder="选择要通知的群或地址" options=${chOptions} dropdownWidth=${320} invalid=${Boolean(show('channels'))} />
    <//>
  <//>`;
}

function IssuesTestSendModal({ open, onClose, name, channelIds }) {
  const state = useStore();
  const [phase, setPhase] = useState('sending');
  const timer = useRef(null);
  const key = (channelIds || []).join(',');
  useEffect(() => {
    if (!open) return undefined;
    setPhase('sending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPhase('done');
      addAudit('测试发送告警', name, null);
    }, 900);
    return () => clearTimeout(timer.current);
  }, [open, key]);
  if (!open) return null;
  const chs = (channelIds || []).map((id) => (state.channels || []).find((c) => c.id === id)).filter(Boolean);
  const sample = issuesCollect(state).find((i) => ['open', 'investigating'].includes(i.status));
  return html`<${Modal} open=${true} onClose=${onClose} width=${520} title="测试发送" description="发一条测试告警，确认群里能收到" footer=${html`<${Button} variant="primary" disabled=${phase === 'sending'} onClick=${onClose}>完成<//>`}>
    <div className="iss-test-preview">
      <div className="iss-test-head"><${Icon} name="BellRing" size=${14} /><b>【测试】${name}</b></div>
      <div className="kv">
        <div><span>问题</span><span>${sample ? sample.title : '示例问题：连接认证失败'}</span></div>
        <div><span>影响</span><span>${sample ? `${sample.workflowIds.length} 个工作流 · ${sample.count} 次运行` : '1 个工作流 · 3 次运行'}</span></div>
        <div><span>负责人</span><span>${sample && sample.assignee ? personName(sample.assignee) : '未指派'}</span></div>
        <div><span>链接</span><span className="mono iss-test-link">https://${state.tenant.domain}/issues/…</span></div>
      </div>
      <div className="text-xs muted">这是测试消息，不对应真实的问题，也不计入告警记录。</div>
    </div>
    <ul className="iss-test-list">
      ${chs.map((c) => {
        const cs = issuesChannelState(state, c);
        const blockedPrivate = c.type === 'webhook' && issuesPrivateHost(c.target);
        const status = !cs.ok ? 'skip' : blockedPrivate ? 'fail' : phase === 'sending' ? 'sending' : 'ok';
        return html`<li key=${c.id}>
          <${IssuesChannelIcon} type=${c.type} size=${22} />
          <span className="grow ellipsis">${c.name}</span>
          ${status === 'sending' && html`<span className="row-4 text-xs muted"><${Icon} name="LoaderCircle" size=${14} className="spin" />发送中</span>`}
          ${status === 'ok' && html`<span className="row-4 text-xs iss-ok-text"><${Icon} name="CircleCheck" size=${14} />已发送</span>`}
          ${status === 'fail' && html`<span className="row-4 text-xs iss-bad-text"><${Icon} name="CircleX" size=${14} />内网地址被出站安全策略拦截</span>`}
          ${status === 'skip' && html`<span className="row-4 text-xs muted"><${Icon} name="CircleMinus" size=${14} />未发送：${cs.reason}</span>`}
        </li>`;
      })}
    </ul>
  <//>`;
}

function issuesChannelErrors(d, state) {
  const e = {};
  const t = ISSUES_CHANNEL_TYPES[d.type];
  const name = d.name.trim();
  if (!t) e.type = '请选择渠道类型';
  if (!name) e.name = '请输入渠道名称';
  else if (name.length > 30) e.name = '渠道名称不能超过 30 个字';
  else if ((state.channels || []).some((c) => c.id !== d.id && c.name === name)) e.name = '已有同名的通知渠道';
  const target = d.target.trim();
  if (t && d.type === 'email') {
    const list = target.split(/[,，;；\s]+/).filter(Boolean);
    if (!list.length) e.target = '请填写收件人';
    else if (list.length > 20) e.target = '收件人最多 20 个';
    else if (list.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) e.target = t.error;
  } else if (t) {
    if (!target) e.target = `请填写${t.targetLabel}`;
    else if (!t.pattern.test(target)) e.target = t.error;
  }
  const secret = (d.secret || '').trim();
  if (t && t.secret && secret && !t.secret.pattern.test(secret)) e.secret = t.secret.error;
  return e;
}

function IssuesChannelModal({ open, channelId, onClose, onTest }) {
  const state = useStore();
  const [draft, setDraft] = useState({ id: null, type: 'feishu', name: '', target: '', secret: '' });
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!open) return;
    const ch = channelId ? (Store.get().channels || []).find((c) => c.id === channelId) : null;
    setDraft(ch ? { id: ch.id, type: ch.type, name: ch.name, target: ch.target, secret: ch.secret || '' } : { id: null, type: 'feishu', name: '', target: '', secret: '' });
    setTouched({});
  }, [open, channelId]);
  if (!open) return null;
  const smtp = issuesSmtpReady(state);
  const errors = issuesChannelErrors(draft, state);
  const invalid = Object.keys(errors).length > 0;
  const t = ISSUES_CHANNEL_TYPES[draft.type];
  const show = (k) => (touched[k] ? errors[k] || null : null);
  const set = (k, v) => { setDraft((d) => ({ ...d, [k]: v })); setTouched((x) => ({ ...x, [k]: true })); };
  const editingEmail = draft.id && draft.type === 'email';
  const privateHost = draft.type === 'webhook' && issuesPrivateHost(draft.target.trim());
  const save = () => {
    setTouched({ name: true, target: true, secret: true });
    if (invalid) return;
    const clean = { type: draft.type, name: draft.name.trim(), target: draft.target.trim(), ...(draft.secret.trim() ? { secret: draft.secret.trim() } : { secret: undefined }), status: 'active' };
    if (draft.id) {
      patchList('channels', draft.id, clean);
      addAudit('修改通知渠道', clean.name, null);
      toast.success('通知渠道已保存');
    } else {
      Store.set((s) => ({ ...s, channels: [...(s.channels || []), { id: uid('ch'), ...clean, createdBy: s.me }] }));
      addAudit('添加通知渠道', clean.name, null);
      toast.success('通知渠道已添加');
    }
    onClose();
  };
  return html`<${Modal}
    open=${true}
    onClose=${onClose}
    width=${600}
    title=${draft.id ? '编辑通知渠道' : '添加通知渠道'}
    description="告警会发到这里。一个渠道可以被多条告警策略使用。"
    footer=${html`<${Fragment}>
      <${Button} icon="Send" disabled=${invalid || (draft.type === 'email' && !smtp) || !draft.id} onClick=${() => onTest({ name: draft.name.trim(), channels: [draft.id] })} title=${draft.id ? '' : '保存后可以测试发送'}>测试发送<//>
      <span className="grow text-xs muted">${!draft.id ? '保存后可以测试发送' : ''}</span>
      <${Button} onClick=${onClose}>取消<//>
      <${Button} variant="primary" disabled=${invalid} onClick=${save}>保存<//>
    <//>`}
  >
    <${Field} label="渠道类型" required>
      <div className="iss-type-grid">
        ${Object.entries(ISSUES_CHANNEL_TYPES).map(([k, m]) => {
          const off = k === 'email' && !smtp && !editingEmail;
          return html`<button key=${k} type="button" className=${cx('radio-card', 'iss-type', draft.type === k && 'is-active', off && 'is-disabled')} disabled=${off} onClick=${() => { if (k !== draft.type) { setDraft((d) => ({ ...d, type: k, target: '', secret: '' })); setTouched((x) => ({ ...x, target: false, secret: false })); } }} aria-pressed=${draft.type === k}>
            <${IssuesChannelIcon} type=${k} size=${28} />
            <span className="radio-card-body"><span className="radio-card-title">${m.label}</span>${off && html`<span className="radio-card-desc">需要先配置 SMTP</span>`}</span>
          </button>`;
        })}
      </div>
    <//>
    ${!smtp && html`<div className="iss-modal-alert"><${Alert} tone="warning" title="邮件渠道未启用" action=${html`<${Button} size="sm" onClick=${() => { onClose(); navigate('/admin/system'); }}>前往配置<//>`}>
      平台还没有配置 SMTP 服务，邮件发不出去。到「管理后台 · 系统与升级」配置邮件服务后，邮件渠道会自动启用。
    <//></div>`}
    <${Field} label="渠道名称" required error=${show('name')} extra=${html`<span className=${cx('text-xs', draft.name.trim().length > 30 ? 'iss-over' : 'muted')}>${draft.name.trim().length}/30</span>`}>
      <${Input} value=${draft.name} onChange=${(v) => set('name', v)} placeholder="例如：集成平台运维群" invalid=${Boolean(show('name'))} />
    <//>
    <${Field} label=${t.targetLabel} required error=${show('target')} hint=${t.hint}>
      <${Input} mono value=${draft.target} onChange=${(v) => set('target', v)} placeholder=${t.placeholder} invalid=${Boolean(show('target'))} />
    <//>
    ${privateHost && !errors.target && html`<div className="iss-modal-alert"><${Alert} tone="warning">这是内网地址。平台的出站请求默认会拦截内网地址，需要运维把它加入出站白名单后才能送达。<//></div>`}
    ${draft.type === 'webhook' && /^http:\/\//i.test(draft.target.trim()) && !errors.target && html`<div className="field-hint iss-http-hint">建议使用 HTTPS，告警内容包含内部系统信息。</div>`}
    ${t.secret && html`<${Field} label=${t.secret.label} error=${show('secret')} hint=${t.secret.hint}>
      <${Input} mono type="password" value=${draft.secret} onChange=${(v) => set('secret', v)} placeholder="选填" invalid=${Boolean(show('secret'))} />
    <//>`}
  <//>`;
}

function AlertPoliciesPage() {
  const state = useStore();
  const route = useRoute();
  const tab = ['policies', 'channels', 'records'].includes(route.query.tab) ? route.query.tab : 'policies';
  const [editing, setEditing] = useState(null);
  const [channelEdit, setChannelEdit] = useState(null);
  const [test, setTest] = useState(null);
  const [recPolicy, setRecPolicy] = useState(null);
  const [recKind, setRecKind] = useState(null);
  const [recPage, setRecPage] = useState(1);
  const canManage = issuesCanManageAlerts(state);
  const policies = state.alertPolicies || [];
  const channels = state.channels || [];
  const events = [...(state.alertEvents || [])].sort((a, b) => b.at - a.at);
  const issues = useMemo(() => issuesCollect(state), [state.runs, state.issueStates, state.connections, state.workflows, state.members, state.privacy, state.versions]);
  const smtp = issuesSmtpReady(state);
  const setTab = (v) => navigate(v === 'policies' ? '/issues/alerts' : `/issues/alerts?tab=${v}`, { replace: true });
  const usedBy = (cid) => policies.filter((p) => (p.channels || []).includes(cid) || (p.escalation && p.escalation.enabled && p.escalation.channel === cid));
  const alertWf = state.workflows.find((w) => w.id === 'wf_alert');
  const alertWfOk = alertWf && projectRole(state, alertWf.projectId);
  const togglePolicy = (p, on) => {
    if (!canManage) return;
    patchList('alertPolicies', p.id, { enabled: on, updatedBy: state.me, updatedAt: Date.now() });
    addAudit(on ? '启用告警策略' : '停用告警策略', p.name, null);
    toast.success(on ? `已启用「${p.name}」` : `已停用「${p.name}」，它不会再发送告警`);
  };
  const removePolicy = async (p) => {
    const ok = await confirmDialog({ title: `删除告警策略「${p.name}」？`, content: '删除后这条策略不再发送告警，已发送的告警记录会保留。', danger: true, okText: '删除' });
    if (!ok) return;
    removeFromList('alertPolicies', p.id);
    addAudit('删除告警策略', p.name, null);
    toast.success('告警策略已删除');
  };
  const removeChannel = async (c) => {
    const users = usedBy(c.id);
    if (users.length) { toast.error(`「${c.name}」正在被 ${users.length} 条告警策略使用，先从策略中移除`); return; }
    const ok = await confirmDialog({ title: `删除通知渠道「${c.name}」？`, content: '删除后无法恢复，已发送的告警记录会保留。', danger: true, okText: '删除' });
    if (!ok) return;
    removeFromList('channels', c.id);
    addAudit('删除通知渠道', c.name, null);
    toast.success('通知渠道已删除');
  };
  const scopeText = (p) => {
    const pj = (p.projects || []).length ? issuesProjectNames(state, p.projects) : '全部项目';
    const wf = (p.workflows || []).length ? `${p.workflows.length} 个工作流` : '全部工作流';
    return `${pj} · ${wf}`;
  };
  const chName = (cid) => (channels.find((c) => c.id === cid) || { name: '已删除的渠道' }).name;
  const lastEvent = (pid) => events.find((e) => e.policyId === pid);
  const recList = events.filter((e) => (!recPolicy || e.policyId === recPolicy) && (!recKind || e.kind === recKind));
  const recPages = Math.max(1, Math.ceil(recList.length / 10));
  const recCur = Math.min(recPage, recPages);
  const weekAgo = Date.now() - 7 * DAY;
  const week = events.filter((e) => e.at >= weekAgo);
  const weekMerged = week.reduce((a, e) => a + (e.merged || 1), 0);
  const tabs = html`<${Tabs} value=${tab} onChange=${setTab} items=${[
    { value: 'policies', label: '告警策略', count: policies.length },
    { value: 'channels', label: '通知渠道', count: channels.length, dot: channels.some((c) => !issuesChannelState(state, c).ok) },
    { value: 'records', label: '告警记录', count: events.length },
  ]} />`;
  const headerAction = tab === 'policies'
    ? html`<${Tooltip} content=${canManage ? '' : '只有平台所有者和管理员可以新建告警策略'}><${Button} variant="primary" icon="Plus" disabled=${!canManage} onClick=${() => setEditing({ id: null })}>新建策略<//><//>`
    : tab === 'channels'
      ? html`<${Tooltip} content=${canManage ? '' : '只有平台所有者和管理员可以添加通知渠道'}><${Button} variant="primary" icon="Plus" disabled=${!canManage} onClick=${() => setChannelEdit({ id: null })}>添加渠道<//><//>`
      : null;
  return html`<div className="page"><div className="page-inner is-wide">
    <${PageHeader}
      back="/issues"
      title="告警策略"
      description="决定什么时候通知谁：按问题聚合、静默时段、升级规则和通知渠道都在这里设置。"
      actions=${headerAction}
      tabs=${tabs}
    />
    <div className="iss-alerts-body">
      ${tab === 'policies' && html`<${Fragment}>
        <div className="iss-note">
          <${Alert} tone="info" icon="Workflow" title="需要更复杂的告警？">
            平台内置的告警只负责「什么时候通知谁」。要按错误内容分派、自动建工单或调用其他系统，可以用「告警触发器」开头的工作流自己处理${alertWfOk ? html`<${Fragment}>，参考 <${Link} className="link" to=${`/integration/${alertWf.projectId}/wf/${alertWf.id}`}>「${alertWf.name}」<//><//>` : ''}。
          <//>
        </div>
        ${policies.length === 0
          ? html`<${Empty} icon="BellRing" title="还没有告警策略" description="新建策略后，出现新问题、问题复发或连接失效时会按规则通知。" action=${canManage ? html`<${Button} variant="primary" icon="Plus" onClick=${() => setEditing({ id: null })}>新建策略<//>` : null} />`
          : html`<div className="iss-policies">
            ${policies.map((p) => {
              const last = lastEvent(p.id);
              const bad = (p.channels || []).filter((cid) => !issuesChannelState(state, channels.find((c) => c.id === cid)).ok);
              return html`<div key=${p.id} className=${cx('iss-policy', !p.enabled && 'is-off')}>
                <${Tooltip} content=${canManage ? (p.enabled ? '停用' : '启用') : '只有平台所有者和管理员可以修改'}><${Switch} checked=${p.enabled} disabled=${!canManage} onChange=${(v) => togglePolicy(p, v)} /><//>
                <div className="iss-policy-main">
                  <div className="iss-policy-head">
                    <button type="button" className="iss-policy-name" onClick=${() => setEditing({ id: p.id })}>${p.name}</button>
                    ${!p.enabled && html`<${Tag} size="sm">已停用<//>`}
                    ${(p.events || []).map((ev) => html`<${Tag} key=${ev} size="sm" tone="outline">${(ISSUES_EVENTS.find((x) => x.value === ev) || { label: ev }).label}${ev === 'failure_rate' && p.threshold ? ` ${p.threshold}%` : ''}<//>`)}
                  </div>
                  <div className="iss-policy-lines">
                    <span><${Icon} name="Layers" size=${13} />${scopeText(p)}</span>
                    <span><${Icon} name="Send" size=${13} />${(p.channels || []).map(chName).join('、') || '没有通知渠道'}${bad.length > 0 && html`<span className="iss-bad-text">（${bad.length} 个不可用）</span>`}</span>
                    <span><${Icon} name="Combine" size=${13} />同一问题 ${issuesMinutesLabel(p.groupWindow || 30)}内只通知一次</span>
                    ${p.quiet && p.quiet.enabled && html`<span><${Icon} name="Moon" size=${13} />静默 ${p.quiet.from}-${p.quiet.to}</span>`}
                    ${p.escalation && p.escalation.enabled && html`<span><${Icon} name="ChevronsUp" size=${13} />${p.escalation.afterMin} 分钟未处理升级到 ${chName(p.escalation.channel)}</span>`}
                  </div>
                  <div className="text-xs muted">${last ? `最近一次告警 ${fmt.relative(last.at)}` : '还没有发送过告警'} · ${personName(p.updatedBy)} ${fmt.relative(p.updatedAt)}更新</div>
                </div>
                <div className="iss-policy-ops">
                  <${Button} size="sm" variant="ghost" icon="Send" disabled=${!(p.channels || []).length} onClick=${() => setTest({ name: p.name, channels: p.channels })}>测试发送<//>
                  <${Button} size="sm" onClick=${() => setEditing({ id: p.id })}>${canManage ? '编辑' : '查看'}<//>
                  <${MoreMenu} items=${[
                    { key: 'records', label: '查看告警记录', icon: 'History', onClick: () => { setRecPolicy(p.id); setRecKind(null); setRecPage(1); setTab('records'); } },
                    { divider: true },
                    { key: 'del', label: '删除', icon: 'Trash2', danger: true, disabled: !canManage, onClick: () => removePolicy(p) },
                  ]} />
                </div>
              </div>`;
            })}
          </div>`}
      <//>`}
      ${tab === 'channels' && html`<${Fragment}>
        ${!smtp && html`<div className="iss-note"><${Alert} tone="warning" title="邮件渠道不可用" action=${html`<${Button} size="sm" onClick=${() => navigate('/admin/system')}>前往配置<//>`}>平台还没有配置 SMTP 服务，邮件告警发不出去。到「管理后台 · 系统与升级」配置后，邮件渠道会自动启用；其他渠道不受影响。<//></div>`}
        <${Table}
          className="iss-ch-table"
          rowKey="id"
          columns=${[
            { key: 'name', title: '渠道', render: (c) => html`<div className="cell-main"><${IssuesChannelIcon} type=${c.type} size=${30} /><div className="iss-cell-text"><div className="cell-title">${c.name}</div><div className="cell-sub">${(ISSUES_CHANNEL_TYPES[c.type] || { label: c.type }).label}</div></div></div>` },
            { key: 'target', title: '地址', render: (c) => html`<span className="mono iss-target" title=${issuesChannelText(c)}>${issuesChannelText(c)}</span>` },
            { key: 'status', title: '状态', width: 150, render: (c) => { const cs = issuesChannelState(state, c); return html`<${Tooltip} content=${cs.reason}><span className="row-4"><${Dot} tone=${cs.ok ? 'success' : 'warning'} />${cs.ok ? '可用' : c.type === 'email' ? '未启用（缺 SMTP）' : '不可用'}</span><//>`; } },
            { key: 'used', title: '使用中', width: 110, render: (c) => { const u = usedBy(c.id); return u.length ? html`<${Tooltip} content=${u.map((p) => p.name).join('、')}><span>${u.length} 条策略</span><//>` : html`<span className="muted">未使用</span>`; } },
            { key: 'by', title: '创建人', width: 104, render: (c) => html`<span className="row-4"><${Avatar} name=${personName(c.createdBy)} size=${18} /><span className="ellipsis">${personName(c.createdBy)}</span></span>` },
            { key: 'op', title: '操作', width: 170, render: (c) => {
              const cs = issuesChannelState(state, c);
              const u = usedBy(c.id);
              return html`<span className="row" onClick=${(e) => e.stopPropagation()}>
                <${Tooltip} content=${cs.ok ? '' : cs.reason}><button type="button" className="link iss-link-btn" disabled=${!cs.ok} onClick=${() => setTest({ name: `${c.name} 渠道测试`, channels: [c.id] })}>测试发送</button><//>
                <button type="button" className="link iss-link-btn" disabled=${!canManage} onClick=${() => setChannelEdit({ id: c.id })}>编辑</button>
                <${MoreMenu} items=${[{ key: 'del', label: '删除', icon: 'Trash2', danger: true, disabled: !canManage || u.length > 0, desc: u.length ? `被 ${u.length} 条策略使用，先从策略中移除` : !canManage ? '只有平台所有者和管理员可以删除' : undefined, onClick: () => removeChannel(c) }]} />
              </span>`;
            } },
          ]}
          data=${channels}
          empty=${html`<${Empty} icon="Send" title="还没有通知渠道" description="添加飞书、企业微信、钉钉、Slack 群机器人或 Webhook 后，告警策略就能把告警发出去。" />`}
        />
      <//>`}
      ${tab === 'records' && html`<${Fragment}>
        <div className="stat-grid">
          <${Stat} label="近 7 天告警" icon="BellRing" value=${week.length} delta="按问题发送，不按失败次数" />
          <${Stat} label="合并的失败" icon="Combine" value=${weekMerged} delta="近 7 天被告警覆盖的失败次数" />
          <${Stat} label="平均每条告警" icon="Filter" value=${week.length ? (weekMerged / week.length).toFixed(1) : '-'} suffix="次失败" delta="数值越大，降噪越明显" />
          <${Stat} label="涉及问题" icon="Siren" value=${new Set(week.map((e) => e.issue)).size} delta="近 7 天" />
        </div>
        <div className="toolbar">
          <${Select} width=${200} clearable value=${recPolicy} onChange=${(v) => { setRecPolicy(v); setRecPage(1); }} placeholder="全部策略" options=${policies.map((p) => ({ value: p.id, label: p.name }))} />
          <${Select} width=${140} clearable value=${recKind} onChange=${(v) => { setRecKind(v); setRecPage(1); }} placeholder="全部类型" options=${Object.entries(ISSUES_ALERT_KINDS).map(([k, m]) => ({ value: k, label: m.label }))} />
        </div>
        <${Table}
          className="iss-rec-table"
          rowKey="id"
          columns=${[
            { key: 'at', title: '时间', width: 150, render: (e) => html`<span title=${fmt.dateTime(e.at)}>${fmt.dateTime(e.at).slice(0, 16)}</span>` },
            { key: 'policy', title: '告警策略', width: 170, render: (e) => html`<span className="ellipsis iss-rec-policy">${(policies.find((p) => p.id === e.policyId) || { name: '已删除的策略' }).name}</span>` },
            { key: 'issue', title: '问题', render: (e) => { const i = issues.find((x) => x.sig === e.issue); return i ? html`<div className="iss-two"><${Link} className="link ellipsis" to=${`/issues/${encodeURIComponent(e.issue)}`}>${i.title}<//><span className="text-xs muted ellipsis">${i.kind === 'connection' ? `连接问题 · ${i.workflowIds.length} 个工作流` : `${i.workflowName} · ${i.nodeName}`}</span></div>` : html`<span className="muted mono text-xs">${e.issue}（没有可见的失败记录）</span>`; } },
            { key: 'kind', title: '类型', width: 92, render: (e) => { const k = ISSUES_ALERT_KINDS[e.kind] || { label: e.kind, tone: 'default' }; return html`<${Tag} size="sm" tone=${k.tone}>${k.label}<//>`; } },
            { key: 'ch', title: '通知渠道', width: 190, render: (e) => html`<span className="ellipsis iss-rec-ch" title=${(e.channels || []).map(chName).join('、')}>${(e.channels || []).map(chName).join('、') || '没有可用的渠道'}</span>` },
            { key: 'merged', title: '合并', width: 150, render: (e) => ((e.merged || 1) > 1 ? html`<span>合并了 <b>${e.merged}</b> 次失败</span>` : html`<span className="muted">1 次失败</span>`) },
          ]}
          data=${recList.slice((recCur - 1) * 10, recCur * 10)}
          empty=${html`<${Empty} icon="BellOff" title="没有告警记录" description=${recPolicy || recKind ? '换个筛选条件再看看。' : '告警策略发出告警后会记录在这里。'} />`}
        />
        ${recList.length > 10 && html`<${Pagination} page=${recCur} pageSize=${10} total=${recList.length} onChange=${(p) => setRecPage(Math.min(recPages, Math.max(1, p)))} />`}
      <//>`}
    </div>
    <${IssuesPolicyDrawer} open=${Boolean(editing)} policyId=${editing ? editing.id : null} onClose=${() => setEditing(null)} onTest=${(t) => setTest(t)} />
    <${IssuesChannelModal} open=${Boolean(channelEdit)} channelId=${channelEdit ? channelEdit.id : null} onClose=${() => setChannelEdit(null)} onTest=${(t) => setTest(t)} />
    <${IssuesTestSendModal} open=${Boolean(test)} onClose=${() => setTest(null)} name=${test ? test.name : ''} channelIds=${test ? test.channels : []} />
  </div></div>`;
}
