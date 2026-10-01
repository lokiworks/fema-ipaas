const RUN_STATUS = {
  success: { label: '成功', tone: 'success', icon: 'CircleCheck' },
  failed: { label: '失败', tone: 'danger', icon: 'CircleX' },
  unknown: { label: '结果未知', tone: 'warning', icon: 'CircleHelp' },
  deduped: { label: '已去重', tone: 'default', icon: 'CircleSlash' },
  running: { label: '运行中', tone: 'info', icon: 'LoaderCircle' },
};

const RUN_SOURCE = {
  trigger: '触发', replay: '重放', remediation: '对账补齐', catchup: '补处理', manual: '手动同步', schedule: '定时', dryrun: '试运行',
};

const EFFECTS = {
  read: { label: '只读', tone: 'outline', icon: 'Eye', desc: '只读取数据，重跑多少次都没有副作用。' },
  idempotent: { label: '幂等', tone: 'success', icon: 'ShieldCheck', desc: '重复执行结果相同。调用超时时平台会自动重试，重放时照常执行。' },
  'non-idempotent': { label: '不幂等', tone: 'warning', icon: 'TriangleAlert', desc: '重复执行会产生重复结果。超时后平台不自动重试，停下来等人确认；重放时已经成功的不会再执行。' },
  unknown: { label: '未声明', tone: 'danger', icon: 'CircleHelp', desc: '连接器没有声明是否幂等，平台按不幂等处理。' },
  declare: { label: '节点声明', tone: 'info', icon: 'PenLine', desc: '通用 HTTP 请求由搭建者在节点上声明是否幂等，没有声明时按不幂等处理。' },
};

const SEVERITY = {
  high: { label: '高危', tone: 'danger', rank: 0 },
  normal: { label: '需处理', tone: 'warning', rank: 1 },
  low: { label: '待确认', tone: 'default', rank: 2 },
};

const ISSUE_KIND = {
  failure: { label: '运行失败', icon: 'CircleX' },
  unknown: { label: '结果未知', icon: 'CircleHelp' },
  recon: { label: '对账差异', icon: 'GitCompareArrows' },
  credential: { label: '连接', icon: 'KeyRound' },
  paused: { label: '工作流停用', icon: 'CirclePause' },
};

const DIFF_CATEGORY = {
  leftActive: { label: '离职仍可登录', tone: 'danger', icon: 'UserX', order: 0 },
  missing: { label: '漏开通', tone: 'warning', icon: 'UserPlus', order: 1 },
  mismatch: { label: '部门不一致', tone: 'info', icon: 'Shuffle', order: 2 },
  extra: { label: '多出的账号', tone: 'default', icon: 'UserRoundSearch', order: 3 },
};

function getProject(s, id) { return s.projects.find((p) => p.id === id); }
function getWorkflow(s, id) { return s.workflows.find((w) => w.id === id); }
function getConnection(s, id) { return s.connections.find((c) => c.id === id); }
function getIssue(s, id) { return s.issues.find((i) => i.id === id); }
function getRecon(s, projectId) { return s.recons.find((r) => r.projectId === projectId); }
function getPerson(s, key) { return s.people.find((p) => p.key === key); }
function getRun(s, id) { return s.runs.find((r) => r.id === id); }
function getTargetAccount(s, id) { return s.targetOnly.find((a) => a.id === id); }
function getConnector(system) { return CONNECTORS.find((c) => c.system === system); }

function systemName(system) { return (SYSTEMS[system] && SYSTEMS[system].name) || system; }

function workflowSteps(wf) { return WF_TEMPLATES[wf.template] || []; }
function workflowStep(wf, stepId) { return workflowSteps(wf).find((st) => st.id === stepId); }
function projectWorkflows(s, projectId) { return s.workflows.filter((w) => w.projectId === projectId); }
function syncWorkflow(s, projectId) { return s.workflows.find((w) => w.projectId === projectId && w.template.startsWith('sync-')); }
function mappingTableOf(s, projectId) { return s.mappingTables.find((t) => t.projectId === projectId); }

function projectConnection(s, project, system) {
  return project.connections.map((id) => getConnection(s, id)).find((c) => c && c.system === system);
}

function stepConnection(s, project, step) {
  if (step.system === project.source || step.system === project.target) return projectConnection(s, project, step.system);
  if (step.system === 'feishu') return getConnection(s, 'c_feishu');
  return null;
}

function mapValue(table, value) {
  const row = table && table.rows.find((r) => r.from === value);
  return row ? row.to : null;
}

function mappingCoverage(s, table) {
  const values = table.sourceValues.map((v) => {
    const people = s.people.filter((p) => p.projectId === table.projectId && p.beisen.dept === v.value && p.beisen.status !== '离职');
    return { ...v, mapped: mapValue(table, v.value), people: people.length };
  });
  const uncovered = values.filter((v) => !v.mapped);
  return { total: values.length, covered: values.length - uncovered.length, uncovered, values };
}

function inReconScope(person, at) {
  if (person.beisen.status !== '离职') return true;
  return person.beisen.leaveDate >= at - 30 * DAY || (person.target.exists && person.target.active);
}

function exceptionActive(ex, at = Date.now()) {
  return !ex.expiresAt || ex.expiresAt > at;
}

function exceptionCovers(exceptions, item, at = Date.now()) {
  return exceptions.some((ex) => {
    if (!exceptionActive(ex, at)) return false;
    if (ex.kind === 'rule') return item.dept === '外部协作' && ex.text.includes('外部协作');
    if (ex.key) return ex.key === item.key;
    if (ex.accountId) return ex.accountId === item.accountId;
    return false;
  });
}

function buildReconRun(s, projectId, at = Date.now()) {
  const project = getProject(s, projectId);
  const recon = getRecon(s, projectId);
  const table = mappingTableOf(s, projectId);
  const exceptions = recon ? recon.exceptions : [];
  const people = s.people.filter((p) => p.projectId === projectId && inReconScope(p, at) && p.changes.every((c) => c.at <= at));
  const accounts = s.targetOnly.filter((a) => a.projectId === projectId);
  const found = people.map((p) => {
    const t = p.target;
    const want = mapValue(table, p.beisen.dept);
    const base = { key: p.key, name: p.name };
    if (p.beisen.status === '离职') {
      return t.exists && t.active
        ? { ...base, category: 'leftActive', source: { status: '离职', dept: p.beisen.dept, date: p.beisen.leaveDate }, target: { status: '已激活', dept: t.dept } }
        : null;
    }
    if (!t.exists || !t.active) {
      return { ...base, category: 'missing', source: { status: p.beisen.status, dept: p.beisen.dept, date: p.beisen.hireDate }, target: t.exists ? { status: '已停用', dept: t.dept } : null };
    }
    if (want && t.dept !== want) {
      return { ...base, category: 'mismatch', source: { status: p.beisen.status, dept: p.beisen.dept, mapped: want }, target: { status: '已激活', dept: t.dept } };
    }
    return null;
  }).filter(Boolean);
  const extra = accounts.map((a) => ({
    accountId: a.id, name: a.name, category: 'extra', dept: a.dept, source: null,
    target: { status: a.active ? '已激活' : '已停用', dept: a.dept, account: a.account, createdBy: a.createdBy },
  }));
  const all = [...found, ...extra];
  const kept = all.filter((d) => !exceptionCovers(exceptions, d, at));
  const matched = people.length - found.length;
  return {
    id: `rcr_${Math.floor(at / 1000)}`,
    at,
    durationMs: 38000 + people.length * 11,
    counts: {
      source: project.baseConsistent + people.length,
      target: project.baseConsistent + people.filter((p) => p.target.exists).length + accounts.length,
      matched: project.baseConsistent + matched,
    },
    diffs: kept.map((d) => ({ ...d, id: `d_${d.key || d.accountId}` })),
    excepted: all.length - kept.length,
  };
}

function diffLiveState(s, projectId, diff) {
  const recon = getRecon(s, projectId);
  if (exceptionCovers(recon.exceptions, diff)) return 'excepted';
  if (diff.category === 'extra') {
    const account = getTargetAccount(s, diff.accountId);
    return account && account.active ? 'open' : 'fixed';
  }
  const person = getPerson(s, diff.key);
  if (!person) return 'open';
  const t = person.target;
  if (diff.category === 'leftActive') return t.active ? 'open' : 'fixed';
  if (diff.category === 'missing') return t.exists && t.active ? 'fixed' : 'open';
  if (diff.category === 'mismatch') {
    const want = mapValue(mappingTableOf(s, projectId), person.beisen.dept);
    return t.dept === want ? 'fixed' : 'open';
  }
  return 'open';
}

function diffLinkedIssue(s, projectId, diff) {
  const wf = syncWorkflow(s, projectId);
  const paused = s.issues.find((i) => i.status === 'open' && i.kind === 'paused' && i.workflowId === (wf && wf.id));
  if (paused && diff.key) {
    const person = getPerson(s, diff.key);
    if (person && person.changes.some((c) => c.pending)) return paused;
  }
  if (diff.key) {
    const runIssue = s.issues.find((i) => i.status === 'open' && (i.kind === 'failure' || i.kind === 'unknown') && i.projectId === projectId && i.keys.includes(diff.key));
    if (runIssue) return runIssue;
  }
  return null;
}

function reconIssueFor(s, projectId, diff) {
  const id = diff.key || diff.accountId;
  return s.issues.find((i) => i.kind === 'recon' && i.projectId === projectId && i.status === 'open' && i.keys.includes(id));
}

function nextIssueId(issues) {
  const max = issues.reduce((m, i) => Math.max(m, Number(String(i.id).replace(/\D/g, '')) || 0), 0);
  return `I-${max + 1}`;
}

function syncReconIssues(s, projectId, at = Date.now()) {
  const recon = getRecon(s, projectId);
  const run = recon.runs[0];
  if (!run) return s.issues;
  const live = run.diffs.filter((d) => diffLiveState(s, projectId, d) === 'open' && !diffLinkedIssue(s, projectId, d));
  const groups = [
    { category: 'leftActive', severity: 'high', keys: live.filter((d) => d.category === 'leftActive').map((d) => d.key) },
    { category: 'pending', severity: 'low', keys: live.filter((d) => d.category !== 'leftActive').map((d) => d.key || d.accountId) },
  ];
  return groups.reduce((issues, g) => {
    const existing = issues.find((i) => i.kind === 'recon' && i.projectId === projectId && i.category === g.category && i.status === 'open');
    if (existing) {
      if (!g.keys.length) {
        return issues.map((i) => (i === existing ? {
          ...i, keys: [], status: 'resolved', resolvedAt: at, resolvedNote: '差异都已补齐或列为例外，下次对账会再核对一次',
          timeline: [...i.timeline, { at, text: '差异都已补齐或列为例外，问题自动关闭' }],
        } : i));
      }
      return issues.map((i) => (i === existing ? { ...i, keys: g.keys, lastSeenAt: Math.max(i.lastSeenAt, run.at) } : i));
    }
    if (!g.keys.length) return issues;
    const issue = {
      id: nextIssueId(issues), kind: 'recon', severity: g.severity, status: 'open', projectId, category: g.category,
      title: '', keys: g.keys, firstSeenAt: run.at, lastSeenAt: run.at, assignee: null,
      timeline: [{ at: run.at, text: g.severity === 'high' ? `对账发现 ${g.keys.length} 名离职员工的账号仍可登录，已通知值班` : `对账发现 ${g.keys.length} 处差异，低优先级，不在夜间告警` }],
    };
    return [issue, ...issues];
  }, s.issues);
}

function reconView(s, projectId) {
  const recon = getRecon(s, projectId);
  const run = recon.runs[0];
  const diffs = run.diffs.map((d) => ({
    ...d,
    live: diffLiveState(s, projectId, d),
    linked: diffLinkedIssue(s, projectId, d),
    issue: reconIssueFor(s, projectId, d),
  }));
  const open = diffs.filter((d) => d.live === 'open');
  const byCategory = Object.keys(DIFF_CATEGORY).reduce((acc, k) => ({ ...acc, [k]: open.filter((d) => d.category === k).length }), {});
  return {
    recon, run, diffs, open, byCategory,
    fixed: diffs.filter((d) => d.live === 'fixed').length,
    excepted: diffs.filter((d) => d.live === 'excepted').length,
    linked: open.filter((d) => d.linked).length,
  };
}

function issueTitle(s, issue) {
  if (issue.frozenTitle) return issue.frozenTitle;
  if (issue.kind === 'recon') {
    const project = getProject(s, issue.projectId);
    const target = systemName(project.target);
    const n = issue.keys.length;
    if (issue.category === 'leftActive') return n ? `${n} 名离职员工的${target}账号仍可登录` : `离职员工的${target}账号仍可登录`;
    return n ? `${n} 处对账差异待确认` : '对账差异待确认';
  }
  if (issue.kind === 'credential') {
    const conn = getConnection(s, issue.connectionId);
    const days = conn && conn.expiresAt ? Math.max(0, Math.ceil((conn.expiresAt - Date.now()) / DAY)) : null;
    return days != null ? `${conn.name.split(' · ')[0]}连接的应用密钥 ${days} 天后到期` : issue.title;
  }
  if (issue.kind === 'paused') {
    const wf = getWorkflow(s, issue.workflowId);
    const pending = pendingChanges(s, wf).length;
    const days = wf.disabledAt ? Math.max(1, Math.round((Date.now() - wf.disabledAt) / DAY)) : 0;
    return `「${wf.name}」已停用 ${days} 天，北森有 ${pending} 条变动没有处理`;
  }
  return issue.title;
}

function issueSummary(s, issue) {
  const project = getProject(s, issue.projectId);
  const target = project ? systemName(project.target) : '';
  if (issue.kind === 'recon' && issue.category === 'leftActive') return `北森里已经离职，${target}账号还能登录。可能是有人在${target}后台手工恢复了账号，或者这条离职在北森里没有产生变动记录。`;
  if (issue.kind === 'recon') return '这些差异不影响安全，但会让两边的数据越走越远。逐条补齐、列为例外，或者确认后忽略。';
  if (issue.cause === 'scope') return '目标部门「深圳研发中心」是新建的，不在飞书应用的通讯录权限范围里，飞书拒绝在这个部门下开通账号。';
  if (issue.cause === 'mapping') return `北森新建了部门「${issue.mappingValue}」，映射表里还没有它对应的飞书部门，缺失处理设为「报错」。`;
  if (issue.kind === 'unknown') return '消息请求已经发出，但 30 秒内没有收到飞书的响应。这一步不幂等，平台没有自动重试，免得群里出现两条。';
  if (issue.kind === 'credential') return '到期后北森的所有调用都会失败：员工变动不再触发，对账也读不到名单。';
  if (issue.kind === 'paused') return '停用期间北森的变动没有处理，这些人的账号状态和北森不一致。启用时可以选择从停用时刻开始补处理。';
  return '';
}

function sortIssues(list) {
  return [...list].sort((a, b) => (SEVERITY[a.severity].rank - SEVERITY[b.severity].rank) || (b.lastSeenAt - a.lastSeenAt));
}

function openIssues(s, projectId) {
  return sortIssues(s.issues.filter((i) => i.status === 'open' && (!projectId || i.projectId === projectId)));
}

function pendingChanges(s, wf) {
  if (!wf || wf.status !== 'off' || !wf.disabledAt) return [];
  return s.people
    .filter((p) => p.projectId === wf.projectId)
    .flatMap((p) => p.changes.filter((c) => c.pending && c.at > wf.disabledAt).map((c) => ({ person: p, change: c })));
}

function projectPulse(s, projectId) {
  const view = reconView(s, projectId);
  const issues = openIssues(s, projectId);
  const since = Date.now() - DAY;
  const runs = s.runs.filter((r) => r.projectId === projectId && r.at >= since && r.key);
  const counted = runs.filter((r) => r.status !== 'deduped' && !r.replayedBy);
  const stuck = new Set();
  issues.forEach((i) => { if (i.kind === 'failure' || i.kind === 'unknown') i.keys.forEach((k) => stuck.add(k)); });
  view.open.forEach((d) => stuck.add(d.key || d.accountId));
  const pausedWf = projectWorkflows(s, projectId).find((w) => w.status === 'off');
  if (pausedWf) pendingChanges(s, pausedWf).forEach(({ person }) => stuck.add(person.key));
  return {
    view,
    issues,
    stuck: stuck.size,
    high: issues.filter((i) => i.severity === 'high').length,
    consistent: view.run.counts.matched + view.fixed,
    total: view.run.counts.source,
    runs24: {
      total: counted.length,
      ok: counted.filter((r) => r.status === 'success').length,
      failed: counted.filter((r) => r.status === 'failed').length,
      unknown: counted.filter((r) => r.status === 'unknown').length,
      deduped: runs.filter((r) => r.status === 'deduped').length,
    },
  };
}

function credentialDaysLeft(conn) {
  if (!conn.expiresAt) return null;
  return Math.max(0, Math.ceil((conn.expiresAt - Date.now()) / DAY));
}

function connectionHealth(s, conn) {
  const problems = [];
  if (conn.scope && conn.scope.missing.length) problems.push({ tone: 'warning', text: `${conn.scope.label}不含「${conn.scope.missing.join('、')}」` });
  const days = credentialDaysLeft(conn);
  if (days != null && days <= 7) problems.push({ tone: 'warning', text: `凭证 ${days} 天后到期` });
  conn.permissions.filter((p) => p.state === 'missing').forEach((p) => problems.push({ tone: 'danger', text: `缺少权限「${p.name}」` }));
  return { ok: problems.length === 0, problems };
}

function connectionConsumers(s, conn) {
  const projects = s.projects.filter((p) => p.connections.includes(conn.id));
  const workflows = s.workflows.filter((w) => projects.some((p) => p.id === w.projectId) && workflowSteps(w).some((st) => st.system === conn.system));
  const recons = s.recons.filter((r) => projects.some((p) => p.id === r.projectId));
  return { projects, workflows, recons };
}

function autoHandledStats(s, days = 7) {
  const since = Date.now() - days * DAY;
  return s.journal.filter((j) => j.at >= since).sort((a, b) => b.at - a.at);
}

function parseStep(token) {
  if (!token) return { state: 'none' };
  const [main, flag] = token.split('|');
  const [state, result] = main.split(':');
  return { state, result, retried: flag === 'retry' };
}

function newRunId(at) {
  const d = new Date(at);
  return `R${fmt.pad(d.getMonth() + 1)}${fmt.pad(d.getDate())}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

function simulateSync(s, { projectId, workflowId, key, at = Date.now(), source = 'trigger', mode = 'full', fromStep = null, change = null, replayOf = null }) {
  const project = getProject(s, projectId);
  const wf = getWorkflow(s, workflowId);
  const person = getPerson(s, key);
  const table = mappingTableOf(s, projectId);
  const targetConn = projectConnection(s, project, project.target);
  const order = ['s1', 's3', 's4', 's5', 's6', 's7'];
  const reuseBefore = mode === 'fromFailed' && fromStep ? order.indexOf(fromStep) : -1;
  const reuse = (id) => reuseBefore > 0 && order.indexOf(id) < reuseBefore && order.indexOf(id) >= 0;
  const steps = { s1: reuse('s1') ? 'reuse' : 'ok' };
  const t = person.target;
  const active = person.beisen.status !== '离职';
  let patch = null;
  let failure = null;
  if (active) {
    const to = mapValue(table, person.beisen.dept);
    if (!to) {
      steps.s3 = 'fail:mapping';
      failure = { stepId: 's3', code: 'MAPPING_MISSING', cause: 'mapping', value: person.beisen.dept };
    } else {
      steps.s3 = reuse('s3') ? 'reuse' : 'ok';
      const top = to.split('/')[0];
      if (targetConn.scope && targetConn.scope.missing.includes(top)) {
        steps.s4 = 'fail:scope';
        failure = { stepId: 's4', code: 'HTTP_400', cause: 'scope', value: top };
      } else {
        const result = !t.exists ? '已开通' : (!t.active || t.dept !== to) ? '已更新' : '无变化';
        steps.s4 = `ok:${result}`;
        steps.s5 = result === '已开通' ? 'ok' : 'skip';
        if (result !== '无变化') {
          patch = { exists: true, active: true, dept: to, userId: t.userId || `ou_${Math.random().toString(16).slice(2, 12)}`, manual: null };
        }
      }
    }
  } else {
    const result = t.exists && t.active ? '已停用' : '无变化';
    steps.s6 = `ok:${result}`;
    steps.s7 = result === '已停用' ? 'ok' : 'skip';
    if (result === '已停用') patch = { ...t, active: false, manual: null };
  }
  const lastChange = person.changes[person.changes.length - 1];
  const run = {
    id: newRunId(at), workflowId, projectId, key, name: person.name,
    change: change || ({ remediation: '对账补齐', manual: '手动同步' }[source]) || (lastChange ? lastChange.type : '同步'),
    source, status: failure ? 'failed' : 'success', at, durationMs: 1400 + Math.floor(Math.random() * 1800), version: wf.version, steps,
    ...(replayOf ? { replayOf } : {}),
  };
  return { run, patch, failure };
}

function failureTitle(s, projectId, failure) {
  const table = mappingTableOf(s, projectId);
  const project = getProject(s, projectId);
  if (failure.cause === 'mapping') return `${table.fromLabel.replace('北森', '')}映射缺失：${table.fromLabel}「${failure.value}」`;
  if (failure.cause === 'scope') return `确保账号失败：部门不在${systemName(project.target)}应用的通讯录权限范围内`;
  return '运行失败';
}

function applyRunOutcomes(s, outcomes, { by, at = Date.now() } = {}) {
  const peoplePatch = new Map(outcomes.filter((o) => o.patch).map((o) => [o.run.key, o.patch]));
  const people = s.people.map((p) => {
    const patch = peoplePatch.get(p.key);
    const cleared = outcomes.some((o) => o.run.key === p.key && !o.failure) ? p.changes.map((c) => (c.pending ? { ...c, pending: false } : c)) : p.changes;
    return patch || cleared !== p.changes ? { ...p, target: patch ? { ...p.target, ...patch } : p.target, changes: cleared } : p;
  });
  const replaced = new Map(outcomes.filter((o) => o.run.replayOf).map((o) => [o.run.replayOf, o.run.id]));
  const runs = [...outcomes.map((o) => o.run).reverse(), ...s.runs.map((r) => (replaced.has(r.id) ? { ...r, replayedBy: replaced.get(r.id) } : r))];
  const issues = outcomes.reduce((list, o) => {
    if (o.failure) {
      const sig = (i) => i.workflowId === o.run.workflowId && i.stepId === o.failure.stepId && i.code === o.failure.code && (o.failure.cause !== 'mapping' || i.mappingValue === o.failure.value);
      const withoutKey = list.map((i) => (i.status === 'open' && (i.kind === 'failure' || i.kind === 'unknown') && i.workflowId === o.run.workflowId && !sig(i) && i.keys.includes(o.run.key)
        ? closeIfEmpty({ ...i, keys: i.keys.filter((k) => k !== o.run.key) }, at, '受影响的人都转到了新的原因下')
        : i));
      const open = withoutKey.find((i) => i.status === 'open' && sig(i));
      if (open) {
        return withoutKey.map((i) => (i === open ? {
          ...i,
          keys: i.keys.includes(o.run.key) ? i.keys : [...i.keys, o.run.key],
          runIds: [...(i.runIds || []).filter((rid) => getRun(s, rid) && getRun(s, rid).key !== o.run.key), o.run.id],
          lastSeenAt: at,
          timeline: o.run.source === 'replay' || o.run.source === 'remediation'
            ? [...i.timeline, { at, text: `${o.run.name}（${o.run.key}）${RUN_SOURCE[o.run.source]}后仍在这一步失败，转到这个问题` }]
            : i.timeline,
        } : i));
      }
      const resolved = withoutKey.find((i) => i.status === 'resolved' && sig(i));
      if (resolved) {
        return withoutKey.map((i) => (i === resolved ? {
          ...i, status: 'open', reopened: true, keys: [o.run.key], runIds: [o.run.id], lastSeenAt: at, resolvedAt: null,
          timeline: [...i.timeline, { at, text: '已解决的问题再次出现，自动重新打开（复发）' }],
        } : i));
      }
      const fresh = {
        id: nextIssueId(withoutKey), kind: 'failure', severity: 'normal', status: 'open', projectId: o.run.projectId,
        workflowId: o.run.workflowId, stepId: o.failure.stepId, code: o.failure.code, cause: o.failure.cause,
        ...(o.failure.cause === 'mapping' ? { mappingValue: o.failure.value, tableId: mappingTableOf(s, o.run.projectId).id } : {}),
        title: failureTitle(s, o.run.projectId, o.failure), keys: [o.run.key], runIds: [o.run.id],
        firstSeenAt: at, lastSeenAt: at, assignee: by || null,
        timeline: [{ at, text: `${o.run.name}（${o.run.key}）的${RUN_SOURCE[o.run.source]}运行在这一步失败` }],
      };
      return [fresh, ...withoutKey];
    }
    return list.map((i) => {
      if (i.status !== 'open' || !(i.kind === 'failure' || i.kind === 'unknown') || i.workflowId !== o.run.workflowId || !i.keys.includes(o.run.key)) return i;
      const next = { ...i, keys: i.keys.filter((k) => k !== o.run.key), timeline: [...i.timeline, { at, text: `${o.run.name}（${o.run.key}）${RUN_SOURCE[o.run.source]}成功` }] };
      return closeIfEmpty(next, at, '受影响的运行全部成功，自动关闭');
    });
  }, s.issues);
  const next = { ...s, people, runs, issues };
  const projectIds = [...new Set(outcomes.map((o) => o.run.projectId))];
  return projectIds.reduce((acc, pid) => ({ ...acc, issues: syncReconIssues(acc, pid, at) }), next);
}

function closeIfEmpty(issue, at, note) {
  if (issue.keys.length) return issue;
  return { ...issue, status: 'resolved', resolvedAt: at, resolvedNote: note, timeline: [...issue.timeline, { at, text: note }] };
}

function latestRunOfKey(s, workflowId, key, statuses = ['failed', 'unknown']) {
  return s.runs.find((r) => r.workflowId === workflowId && r.key === key && statuses.includes(r.status) && !r.replayedBy);
}

function earlierStepsSafe(wf, stepId) {
  const steps = workflowSteps(wf).filter((st) => st.role !== 'trigger' && st.role !== 'branch');
  const idx = steps.findIndex((st) => st.id === stepId);
  return steps.slice(0, Math.max(0, idx)).every((st) => st.effect === 'read' || st.effect === 'idempotent');
}

function replayPlan(s, issue, mode) {
  const project = getProject(s, issue.projectId);
  const wf = getWorkflow(s, issue.workflowId);
  const table = mappingTableOf(s, issue.projectId);
  const targetConn = projectConnection(s, project, project.target);
  const safe = earlierStepsSafe(wf, issue.stepId);
  const effectiveMode = mode || (safe ? 'full' : 'fromFailed');
  const items = issue.keys.map((key) => {
    const person = getPerson(s, key);
    const run = latestRunOfKey(s, wf.id, key);
    const to = mapValue(table, person.beisen.dept);
    let block = null;
    if (person.beisen.status !== '离职') {
      if (!to) block = { text: `映射表里还没有「${person.beisen.dept}」`, issueId: issue.cause === 'mapping' ? null : null };
      else if (targetConn.scope && targetConn.scope.missing.includes(to.split('/')[0])) {
        const scopeIssue = s.issues.find((i) => i.status === 'open' && i.cause === 'scope' && i.projectId === issue.projectId);
        block = { text: `目标部门「${to}」不在${systemName(project.target)}应用的通讯录权限范围内，重放会在「确保账号」再次失败`, issueId: scopeIssue && scopeIssue.id !== issue.id ? scopeIssue.id : null };
      }
    }
    return { key, person, run, to, block };
  });
  const runnable = items.filter((i) => !i.block);
  const readAge = items[0] && items[0].run ? Date.now() - items[0].run.at : 0;
  const checks = [
    {
      level: runnable.length === items.length ? 'ok' : runnable.length ? 'warn' : 'block',
      text: runnable.length === items.length
        ? '所有人的目标部门都有映射，并且在应用的权限范围内'
        : `${items.length - runnable.length} 人还会失败，先不重放，处理好对应的问题后再来`,
    },
    {
      level: 'ok',
      text: effectiveMode === 'full'
        ? '整体重跑：重新读取北森的最新状态。前面的步骤都是只读或幂等，重跑没有副作用'
        : `从失败步骤重跑：沿用 ${fmt.relative(Date.now() - readAge)}读到的北森数据；如果这期间员工信息变了，会按旧数据执行`,
    },
    {
      level: 'ok',
      text: issue.stepId === 's5'
        ? '「通知 HR 入职群」不幂等，只对确认没有发出的执行一次'
        : '「通知 HR 入职群」不幂等，只在账号真正新开通时发送，每人最多一条',
    },
    {
      level: 'ok',
      text: `约 ${Math.max(2, runnable.length * 3)} 次请求，飞书连接上限每秒 ${targetConn.rate.limit} 次，预计 ${Math.max(1, Math.ceil((runnable.length * 3) / targetConn.rate.limit))} 秒内完成`,
    },
    { level: 'ok', text: `使用当前发布的版本 v${wf.version}（失败时也是 v${items[0] && items[0].run ? items[0].run.version : wf.version}）` },
  ];
  return { mode: effectiveMode, safe, items, runnable, checks };
}

function remediationPlan(s, projectId, diffs) {
  const project = getProject(s, projectId);
  const wf = getWorkflow(s, getRecon(s, projectId).remediation);
  return diffs.map((d) => {
    if (d.category === 'extra') return { diff: d, action: null, text: `北森里没有这个人，平台不会自动处理。确认后在${systemName(project.target)}后台停用，或者列为例外。` };
    const outcome = simulateSync(s, { projectId, workflowId: wf.id, key: d.key, source: 'remediation' });
    const st = outcome.run.steps;
    if (outcome.failure) return { diff: d, action: 'blocked', text: outcome.failure.cause === 'mapping' ? `映射表里还没有「${outcome.failure.value}」` : `目标部门不在应用的权限范围内` };
    const s4 = parseStep(st.s4);
    const s6 = parseStep(st.s6);
    if (s6.state === 'ok') return { diff: d, action: 'disable', text: s6.result === '已停用' ? `停用${systemName(project.target)}账号，并通知 IT 资产群` : '账号已经是停用状态，无需处理' };
    if (s4.result === '已开通') return { diff: d, action: 'create', text: `在「${outcome.patch.dept}」开通账号，并通知 HR 入职群` };
    if (s4.result === '已更新') return { diff: d, action: 'update', text: `把部门改为「${outcome.patch.dept}」` };
    return { diff: d, action: 'none', text: '已经一致，无需处理' };
  });
}

function wfChecks(s, wf) {
  const project = getProject(s, wf.projectId);
  const steps = workflowSteps(wf);
  const list = [];
  if (wf.template.startsWith('sync-')) {
    const table = mappingTableOf(s, wf.projectId);
    const cov = mappingCoverage(s, table);
    cov.uncovered.forEach((v) => {
      const failing = s.issues.find((i) => i.status === 'open' && i.cause === 'mapping' && i.mappingValue === v.value);
      list.push({
        level: 'warn', icon: 'Table2', title: `映射表缺少${table.fromLabel}「${v.value}」`,
        detail: `${fmt.relative(v.firstSeenAt)}在北森里出现${failing ? `，已有 ${failing.keys.length} 人因此失败` : `，${v.people} 人在这个部门`}`,
        to: `/projects/${wf.projectId}/mappings`, action: '去补映射',
      });
    });
    const targetConn = projectConnection(s, project, project.target);
    if (targetConn.scope && targetConn.scope.missing.length) {
      const affected = table.rows.filter((r) => targetConn.scope.missing.includes(r.to.split('/')[0]));
      list.push({
        level: 'warn', icon: 'ShieldAlert', title: `${systemName(project.target)}应用的${targetConn.scope.label}不含「${targetConn.scope.missing.join('、')}」`,
        detail: `映射表里有 ${affected.length} 个部门指向它，开通到这些部门会被拒绝`, to: `/connections/${targetConn.id}`, action: '查看连接',
      });
    }
    const sourceConn = projectConnection(s, project, project.source);
    const days = credentialDaysLeft(sourceConn);
    if (days != null && days <= 7) {
      list.push({ level: 'warn', icon: 'KeyRound', title: `连接「${sourceConn.name}」的应用密钥 ${days} 天后到期`, detail: '到期后触发器和对账都会停止', to: `/connections/${sourceConn.id}`, action: '更新密钥' });
    }
    if (!cov.uncovered.length) list.push({ level: 'ok', icon: 'Table2', title: `映射表覆盖了北森的全部 ${cov.total} 个${table.fromLabel.replace('北森', '')}`, detail: '北森出现新值时会在这里提示' });
  }
  const writes = steps.filter((st) => st.effect !== 'read');
  list.push({ level: 'ok', icon: 'ShieldCheck', title: `${writes.length} 个写操作都声明了是否幂等`, detail: writes.map((st) => `${st.title}：${EFFECTS[st.effect].label}`).join('；') });
  steps.filter((st) => st.effect === 'non-idempotent').forEach((st) => {
    list.push({ level: 'info', icon: 'TriangleAlert', title: `「${st.title}」不幂等`, detail: st.when ? `${st.when}执行。超时后不会自动重试，重放时如果已经发出过会跳过` : '超时后不会自动重试，重放时如果已经发出过会跳过' });
  });
  if (wf.trigger.keyField) list.push({ level: 'ok', icon: 'Fingerprint', title: `业务键是「${wf.trigger.keyField}」`, detail: '用于去重、按人查记录、对账匹配和重放分组' });
  list.push({ level: 'ok', icon: 'Gauge', title: '高峰期会在连接上排队，不会因为限流失败', detail: `${steps.filter((st) => st.system !== 'logic' && st.system !== 'mapper' && st.system !== 'schedule').map((st) => st.system).filter((v, i, a) => a.indexOf(v) === i).map((sys) => { const c = projectConnection(s, project, sys) || stepConnection(s, project, { system: sys }); return c ? `${systemName(sys)}每秒 ${c.rate.limit} 次` : null; }).filter(Boolean).join('，')}` });
  return list;
}

function recordTrail(s, key) {
  const person = getPerson(s, key);
  if (!person) return [];
  const project = getProject(s, person.projectId);
  const target = systemName(project.target);
  const events = [];
  person.changes.forEach((c) => {
    events.push({
      at: c.at, kind: 'source', icon: 'Building2', tone: c.missing ? 'warning' : 'default',
      title: c.missing ? `北森：${c.type}（没有产生变动记录）` : `北森：${c.type}`,
      detail: c.missing
        ? '北森里这个人已经离职，但没有对应的变动记录，所以工作流没有被触发'
        : c.pending ? '工作流停用中，这条变动还没有处理'
          : c.skipped ? '工作流启用时选择了「从现在开始」，这条变动被跳过' : (c.note || `部门：${person.beisen.dept}`),
    });
  });
  s.runs.filter((r) => r.key === key).forEach((r) => {
    const wf = getWorkflow(s, r.workflowId);
    const meta = RUN_STATUS[r.status];
    events.push({
      at: r.at, kind: 'run', icon: meta.icon, tone: meta.tone, run: r,
      title: `${wf.name} · ${RUN_SOURCE[r.source]} · ${meta.label}`,
      detail: runOneLine(s, r),
    });
  });
  if (person.target.manual) {
    events.push({ at: person.target.manual.at, kind: 'target', icon: 'PenLine', tone: 'warning', title: `${target}：${person.target.manual.by}手工修改`, detail: person.target.manual.text });
  }
  s.recons.filter((rc) => rc.projectId === person.projectId).forEach((rc) => {
    rc.runs.forEach((run) => {
      const d = run.diffs.find((x) => x.key === key);
      if (d) events.push({ at: run.at, kind: 'recon', icon: 'GitCompareArrows', tone: d.category === 'leftActive' ? 'danger' : 'warning', title: `对账：${DIFF_CATEGORY[d.category].label}`, detail: diffOneLine(s, project, d) });
    });
    rc.exceptions.filter((ex) => ex.key === key).forEach((ex) => {
      events.push({ at: ex.at, kind: 'exception', icon: 'ShieldOff', tone: 'default', title: '列为对账例外', detail: `${ex.by}：${ex.reason}${ex.expiresAt ? `（${fmt.short(ex.expiresAt)} 到期）` : ''}` });
    });
  });
  s.issues.filter((i) => i.projectId === person.projectId && (i.keys.includes(key) || (i.runIds || []).some((rid) => { const r = getRun(s, rid); return r && r.key === key; }))).forEach((i) => {
    events.push({ at: i.firstSeenAt, kind: 'issue', icon: 'Siren', tone: SEVERITY[i.severity].tone, issue: i, title: `问题 ${i.id}：${issueTitle(s, i)}`, detail: i.status === 'resolved' ? `已解决：${i.resolvedNote || ''}` : '处理中' });
  });
  return events.sort((a, b) => a.at - b.at);
}

function runOneLine(s, r) {
  if (r.status === 'deduped') return `和运行 ${r.dedupeOf} 是同一次变动，已拦下`;
  const st = r.steps;
  const s4 = parseStep(st.s4);
  const s6 = parseStep(st.s6);
  if (r.status === 'failed') {
    const f = Object.entries(st).find(([, v]) => v.startsWith('fail'));
    if (f && f[1] === 'fail:mapping') return '在「部门映射」失败：映射表里没有这个部门';
    if (f && f[1] === 'fail:scope') return '在「确保账号」失败：部门不在应用的通讯录权限范围内';
    return '运行失败';
  }
  if (r.status === 'unknown') return '账号已开通；通知 HR 入职群超时，结果未知';
  if (r.workflowId === 'wf_remind') return '已通知 IT 准备设备';
  if (s6.state === 'ok') return s6.result === '已停用' ? '账号已停用，已通知 IT 资产群' : '账号本来就是停用状态，无需处理';
  if (s4.state === 'ok') {
    const extra = [s4.retried ? '第一次调用超时，幂等操作自动重试成功' : null, r.queueWaitMs > 10000 ? `在连接上排队 ${fmt.duration(r.queueWaitMs)}` : null].filter(Boolean).join('；');
    const main = s4.result === '已开通' ? '账号已开通，已通知 HR 入职群' : s4.result === '已更新' ? '账号信息已更新' : '账号已经一致，无需修改';
    return extra ? `${main}（${extra}）` : main;
  }
  return '';
}

function diffOneLine(s, project, d) {
  const target = systemName(project.target);
  if (d.category === 'leftActive') return `北森 ${fmt.date(d.source.date)} 离职，${target}账号仍是激活状态`;
  if (d.category === 'missing') return d.target ? `北森${d.source.status}，${target}账号已停用` : `北森${d.source.status}（${d.source.dept}），${target}没有账号`;
  if (d.category === 'mismatch') return `北森部门映射后应为「${d.source.mapped}」，${target}里是「${d.target.dept}」`;
  return `${target}账号「${d.target.account}」在北森里找不到对应的人`;
}

function personVerdict(s, person) {
  const project = getProject(s, person.projectId);
  const target = systemName(project.target);
  const recon = getRecon(s, person.projectId);
  if (exceptionCovers(recon.exceptions, { key: person.key })) return { tone: 'default', icon: 'ShieldOff', text: '列为对账例外' };
  const t = person.target;
  if (person.beisen.status === '离职') {
    return t.exists && t.active
      ? { tone: 'danger', icon: 'UserX', text: `不一致：北森已离职，${target}账号仍可登录`, category: 'leftActive' }
      : { tone: 'success', icon: 'CircleCheck', text: `一致：北森已离职，${target}账号已停用` };
  }
  if (!t.exists || !t.active) return { tone: 'warning', icon: 'UserPlus', text: `不一致：北森${person.beisen.status}，${target}${t.exists ? '账号已停用' : '没有账号'}`, category: 'missing' };
  const want = mapValue(mappingTableOf(s, person.projectId), person.beisen.dept);
  if (want && t.dept !== want) return { tone: 'info', icon: 'Shuffle', text: `不一致：部门应为「${want}」，${target}里是「${t.dept}」`, category: 'mismatch' };
  return { tone: 'success', icon: 'CircleCheck', text: '一致' };
}

function searchPeople(s, q) {
  const text = String(q || '').trim().toLowerCase();
  if (!text) return [];
  return s.people.filter((p) => p.key.toLowerCase().includes(text) || p.name.includes(text) || (text.length >= 4 && p.mobile.endsWith(text.slice(-4)))).slice(0, 20);
}

function actReplay(issueId, mode) {
  const s = Store.get();
  const issue = getIssue(s, issueId);
  const plan = replayPlan(s, issue, mode);
  const at = Date.now();
  const outcomes = plan.runnable.map((item, i) => simulateSync(s, {
    projectId: issue.projectId, workflowId: issue.workflowId, key: item.key, at: at + i * 900, source: 'replay',
    mode: plan.mode, fromStep: issue.stepId, change: item.run ? item.run.change : null, replayOf: item.run ? item.run.id : null,
  }));
  const next = applyRunOutcomes(s, outcomes, { by: s.me.name, at });
  const withNote = {
    ...next,
    issues: next.issues.map((i) => (i.id === issueId ? { ...i, timeline: [...i.timeline, { at, text: `${s.me.name}${plan.mode === 'full' ? '整体重跑' : '从失败步骤重跑'}了 ${outcomes.length} 次运行` }] } : i)),
  };
  Store.set(withNote);
  return { ok: outcomes.filter((o) => !o.failure).length, failed: outcomes.filter((o) => o.failure).length, skipped: plan.items.length - plan.runnable.length };
}

function actRemediate(projectId, keys, source = 'remediation') {
  const s = Store.get();
  const recon = getRecon(s, projectId);
  const at = Date.now();
  const outcomes = keys.map((key, i) => simulateSync(s, { projectId, workflowId: recon.remediation, key, at: at + i * 900, source }));
  const next = applyRunOutcomes(s, outcomes, { by: s.me.name, at });
  Store.set(next);
  return { ok: outcomes.filter((o) => !o.failure).length, failed: outcomes.filter((o) => o.failure).length };
}

function actConfirmUnknown(issueId, outcome) {
  const s = Store.get();
  const issue = getIssue(s, issueId);
  const at = Date.now();
  const run = getRun(s, issue.runIds[0]);
  if (outcome === 'sent') {
    Store.set({
      ...s,
      runs: s.runs.map((r) => (r.id === run.id ? { ...r, status: 'success', steps: { ...r.steps, s5: 'ok:人工确认' }, confirmedBy: s.me.name } : r)),
      issues: s.issues.map((i) => (i.id === issueId ? {
        ...i, keys: [], status: 'resolved', resolvedAt: at, resolvedNote: `${s.me.name}确认消息已经发出，没有重发`,
        timeline: [...i.timeline, { at, text: `${s.me.name}在群里看到了消息，确认已发出；运行标为成功，没有重发` }],
      } : i)),
    });
    return;
  }
  const retry = {
    ...run, id: newRunId(at), source: 'replay', replayOf: run.id, status: 'success', at, durationMs: 900,
    steps: { s1: 'reuse', s3: 'reuse', s4: 'reuse', s5: 'ok' },
  };
  Store.set({
    ...s,
    runs: [retry, ...s.runs.map((r) => (r.id === run.id ? { ...r, replayedBy: retry.id } : r))],
    issues: s.issues.map((i) => (i.id === issueId ? {
      ...i, keys: [], status: 'resolved', resolvedAt: at, resolvedNote: `${s.me.name}确认消息没有发出，只重发了这一步`,
      timeline: [...i.timeline, { at, text: `${s.me.name}确认消息没有发出，只重跑了「通知 HR 入职群」，前面的步骤沿用原结果` }],
    } : i)),
  });
}

function actAddMapping(tableId, from, to) {
  const s = Store.get();
  const at = Date.now();
  Store.set({
    ...s,
    mappingTables: s.mappingTables.map((t) => (t.id === tableId ? { ...t, rows: [...t.rows.filter((r) => r.from !== from), { from, to, addedBy: s.me.name, addedAt: at }] } : t)),
    issues: s.issues.map((i) => (i.status === 'open' && i.cause === 'mapping' && i.mappingValue === from ? {
      ...i, timeline: [...i.timeline, { at, text: `${s.me.name}补上映射：「${from}」→「${to}」` }],
    } : i)),
  });
}

function actRecheckScope(connId) {
  const s = Store.get();
  const conn = getConnection(s, connId);
  const at = Date.now();
  const added = conn.scope.missing;
  Store.set({
    ...s,
    connections: s.connections.map((c) => (c.id === connId ? { ...c, scope: { ...c.scope, included: [...c.scope.included, ...added], missing: [] } } : c)),
    issues: s.issues.map((i) => (i.status === 'open' && i.cause === 'scope' ? {
      ...i, timeline: [...i.timeline, { at, text: `${s.me.name}重新检查连接：${conn.scope.label}已包含「${added.join('、')}」` }],
    } : i)),
  });
  return added;
}

function actUpdateCredential(connId) {
  const s = Store.get();
  const at = Date.now();
  Store.set({
    ...s,
    connections: s.connections.map((c) => (c.id === connId ? { ...c, expiresAt: at + 180 * DAY, fields: c.fields.map((f) => (f.secret ? { ...f, value: '已加密保存（刚刚更新）' } : f)) } : c)),
    issues: s.issues.map((i) => (i.status === 'open' && i.kind === 'credential' && i.connectionId === connId ? {
      ...i, status: 'resolved', resolvedAt: at, resolvedNote: `${s.me.name}更新了应用密钥，验证通过`, frozenTitle: issueTitle(s, i),
      timeline: [...i.timeline, { at, text: `${s.me.name}更新了应用密钥，调用验证通过，新密钥 180 天后到期` }],
    } : i)),
  });
}

function actDisableWorkflow(wfId, note) {
  const s = Store.get();
  const at = Date.now();
  Store.set({
    ...s,
    workflows: s.workflows.map((w) => (w.id === wfId ? {
      ...w, status: 'off', disabledAt: at, disabledBy: s.me.name, disabledNote: note,
      history: [...w.history, { at, type: 'disable', by: s.me.name, note: note || '停用' }],
    } : w)),
  });
}

function actEnableWorkflow(wfId, start, fromAt) {
  const s = Store.get();
  const wf = getWorkflow(s, wfId);
  const at = Date.now();
  const pending = pendingChanges(s, wf);
  const chosen = start === 'gap' ? pending : start === 'custom' ? pending.filter((p) => p.change.at >= fromAt) : [];
  const outcomes = chosen.map(({ person, change }, i) => simulateSync(s, { projectId: wf.projectId, workflowId: wf.id, key: person.key, at: at + i * 1200, source: 'catchup', change: change.type }));
  const afterRuns = applyRunOutcomes(s, outcomes, { by: s.me.name, at });
  const skipped = pending.length - chosen.length;
  const note = start === 'gap'
    ? `从停用时刻开始，补处理了 ${chosen.length} 条变动`
    : start === 'custom'
      ? `从 ${fmt.short(fromAt)} 开始，补处理了 ${chosen.length} 条变动，跳过 ${skipped} 条`
      : `从现在开始，跳过了停用期间的 ${skipped} 条变动`;
  const chosenKeys = new Set(chosen.map(({ person }) => person.key));
  const people = afterRuns.people.map((p) => (p.projectId === wf.projectId ? {
    ...p,
    changes: p.changes.map((c) => (c.pending ? { ...c, pending: false, skipped: !chosenKeys.has(p.key) } : c)),
  } : p));
  Store.set({
    ...afterRuns,
    people,
    workflows: afterRuns.workflows.map((w) => (w.id === wfId ? {
      ...w, status: 'on', disabledAt: null, disabledBy: null, disabledNote: null,
      trigger: { ...w.trigger, checkpointAt: at },
      history: [...w.history, { at, type: 'enable', by: s.me.name, start, note }],
    } : w)),
    issues: afterRuns.issues.map((i) => (i.status === 'open' && i.kind === 'paused' && i.workflowId === wfId ? {
      ...i, status: 'resolved', resolvedAt: at, resolvedNote: note, frozenTitle: issueTitle(s, i),
      timeline: [...i.timeline, { at, text: `${s.me.name}启用了工作流：${note}${skipped && start !== 'gap' ? '；跳过的变动会在下次对账中列为差异' : ''}` }],
    } : i)),
  });
  return { processed: chosen.length, skipped, failed: outcomes.filter((o) => o.failure).length };
}

function actRunRecon(projectId) {
  const s = Store.get();
  const at = Date.now();
  const run = buildReconRun(s, projectId, at);
  const recons = s.recons.map((r) => (r.projectId === projectId ? {
    ...r,
    history: r.runs[0] ? [...r.history, { at: r.runs[0].at, total: r.runs[0].diffs.length }].slice(-13) : r.history,
    runs: [run, ...r.runs].slice(0, 5),
  } : r));
  const next = { ...s, recons };
  Store.set({ ...next, issues: syncReconIssues(next, projectId, at) });
  return run;
}

function actAddException(projectId, exception) {
  const s = Store.get();
  const at = Date.now();
  const next = {
    ...s,
    recons: s.recons.map((r) => (r.projectId === projectId ? { ...r, exceptions: [...r.exceptions, { id: uid('ex'), at, by: s.me.name, ...exception }] } : r)),
  };
  Store.set({ ...next, issues: syncReconIssues(next, projectId, at) });
}

function actRemoveException(projectId, exId) {
  const s = Store.get();
  const next = { ...s, recons: s.recons.map((r) => (r.projectId === projectId ? { ...r, exceptions: r.exceptions.filter((e) => e.id !== exId) } : r)) };
  Store.set({ ...next, issues: syncReconIssues(next, projectId) });
}

function actAssign(issueId, name) {
  const s = Store.get();
  const at = Date.now();
  Store.set({
    ...s,
    issues: s.issues.map((i) => (i.id === issueId ? { ...i, assignee: name, timeline: [...i.timeline, { at, text: `${s.me.name}把问题指派给${name}` }] } : i)),
  });
}

function actSetRateLimit(connId, limit) {
  const s = Store.get();
  Store.set({ ...s, connections: s.connections.map((c) => (c.id === connId ? { ...c, rate: { ...c.rate, limit } } : c)) });
}
