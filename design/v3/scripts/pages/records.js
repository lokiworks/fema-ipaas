function recordsStuck(s) {
  const map = new Map();
  const add = (person, reason) => { if (person && !map.has(person.key)) map.set(person.key, { person, reason }); };
  const openDiffs = s.projects.flatMap((p) => reconView(s, p.id).open.filter((d) => d.key));
  openDiffs.filter((d) => d.category === 'leftActive').forEach((d) => add(getPerson(s, d.key), `对账：${DIFF_CATEGORY[d.category].label}`));
  openIssues(s).filter((i) => i.kind === 'failure' || i.kind === 'unknown').forEach((i) => i.keys.forEach((k) => add(getPerson(s, k), issueTitle(s, i))));
  s.workflows.filter((w) => w.status === 'off').forEach((w) => {
    pendingChanges(s, w).forEach(({ person, change }) => add(person, `「${w.name}」停用中，${change.type}没有处理`));
  });
  openDiffs.forEach((d) => add(getPerson(s, d.key), `对账：${DIFF_CATEGORY[d.category].label}`));
  return [...map.values()];
}

function RecordsPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const results = searchPeople(s, q);
  const stuck = recordsStuck(s);
  const recent = [...s.people]
    .filter((p) => p.changes.length)
    .sort((a, b) => b.changes[b.changes.length - 1].at - a.changes[a.changes.length - 1].at)
    .slice(0, 8);
  const row = (p, sub, right) => html`<${Link} key=${p.key} to=${`/records/${p.key}`} className="person-row">
    <${Avatar} name=${p.name} size=${30} />
    <div className="grow">
      <div><b>${p.name}</b> <span className="mono muted">${p.key}</span></div>
      <div className="muted text-xs">${sub}</div>
    </div>
    ${right}
    <${Icon} name="ChevronRight" size=${14} className="muted" />
  <//>`;
  return html`<div className="page-inner">
    <${PageHeader} title="查人" description="HR 问「张三怎么没账号」时，在这里按工号、姓名或手机号后四位查：这个人在北森发生了什么、平台做了什么、现在两边是否一致。" />
    <div className="records-search">
      <${Icon} name="UserSearch" size=${20} className="muted" />
      <input autoFocus value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="例如 E10231、张晓雨、6021" />
      ${q && html`<${IconButton} icon="X" size="sm" title="清除" onClick=${() => setQ('')} />`}
    </div>
    ${q
      ? html`<div className="section">
        <div className="section-label">${results.length ? `找到 ${results.length} 人` : '没有找到'}</div>
        <div className="person-list">${results.map((p) => row(p, `${getProject(s, p.projectId).name} · 北森${p.beisen.status} · ${p.beisen.dept}`, html`<${Tag} size="sm" tone=${personVerdict(s, p).tone}>${personVerdict(s, p).tone === 'success' ? '一致' : '不一致'}<//>`))}</div>
      </div>`
      : html`<div className="records-grid">
        <section>
          <div className="section-head"><h2 className="section-title">现在没同步好的人 <span className="muted">${stuck.length}</span></h2></div>
          <div className="person-list">${stuck.map(({ person, reason }) => row(person, reason, null))}</div>
        </section>
        <section>
          <div className="section-head"><h2 className="section-title">北森最近有变动的人</h2></div>
          <div className="person-list">${recent.map((p) => { const c = p.changes[p.changes.length - 1]; return row(p, `${c.type} · ${fmt.relative(c.at)} · ${p.beisen.dept}`, null); })}</div>
        </section>
      </div>`}
  </div>`;
}

function RecordPage({ params }) {
  const s = useStore();
  const person = getPerson(s, params.key);
  const [runId, setRunId] = useState(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!person) {
    const account = getTargetAccount(s, params.key);
    return html`<div className="page-inner"><${Empty} icon="UserRoundX" title=${account ? `${account.name}不在北森里` : '没有找到这个人'} description=${account ? '这是目标系统里多出来的账号，对账会把它列为差异。' : '换个工号或姓名试试。'} action=${html`<${Button} onClick=${() => navigate('/records')}>回到查人<//>`} /></div>`;
  }
  const project = getProject(s, person.projectId);
  const target = systemName(project.target);
  const table = mappingTableOf(s, project.id);
  const verdict = personVerdict(s, person);
  const trail = recordTrail(s, person.key);
  const wf = syncWorkflow(s, project.id);
  const preview = simulateSync(s, { projectId: project.id, workflowId: wf.id, key: person.key, source: 'manual' });
  const want = mapValue(table, person.beisen.dept);
  const t = person.target;
  const previewText = (() => {
    if (preview.failure) return preview.failure.cause === 'mapping' ? `会失败：映射表里还没有「${preview.failure.value}」` : `会失败：部门「${preview.failure.value}」不在${target}应用的权限范围内`;
    const s4 = parseStep(preview.run.steps.s4);
    const s6 = parseStep(preview.run.steps.s6);
    if (s6.state === 'ok') return s6.result === '已停用' ? `会停用${target}账号，并通知 IT 资产群` : '已经一致，不会有任何写入';
    if (s4.result === '已开通') return `会在「${preview.patch.dept}」开通账号，并通知 HR 入职群`;
    if (s4.result === '已更新') return `会把账号更新为「${preview.patch.dept}」，不发通知`;
    return '已经一致，不会有任何写入';
  })();
  const sync = () => {
    setBusy(true);
    setTimeout(() => {
      const res = actRemediate(project.id, [person.key], 'manual');
      setBusy(false);
      setSyncOpen(false);
      if (res.failed) toast.warning('同步失败，已进入问题中心');
      else toast.success(`已同步${person.name}`);
    }, 900);
  };
  return html`<div className="page-inner">
    <${Breadcrumb} items=${[{ label: '查人', to: '/records' }, { label: person.name }]} />
    <div className="record-head">
      <${Avatar} name=${person.name} size=${48} />
      <div className="grow">
        <div className="row"><h1 className="page-title">${person.name}</h1><span className="mono muted">${person.key}</span>${person.batch && html`<${Tag} size="sm">${person.batch}<//>`}</div>
        <div className="page-desc">${person.mobile} · <${Link} to=${`/projects/${project.id}`} className="link">${project.name}<//></div>
      </div>
      <${Button} variant=${verdict.tone === 'success' ? 'outline' : 'primary'} icon="RefreshCw" onClick=${() => setSyncOpen(true)}>立即同步这个人<//>
    </div>
    <div className=${cx('verdict', `tone-${verdict.tone}`)}><${Icon} name=${verdict.icon} size=${18} /><b>${verdict.text}</b><span className="muted text-xs">按两边当前的数据实时判断</span></div>
    <div className="twin">
      <div className="twin-col">
        <div className="twin-head"><${SysLogo} system=${project.source} size=${24} /><b>${systemName(project.source)}</b><span className="muted text-xs">源 · 以它为准</span></div>
        <div className="kv-list">
          <div><span>状态</span><b>${person.beisen.status}</b></div>
          <div><span>部门</span><b>${person.beisen.dept}</b></div>
          ${person.beisen.hireDate && html`<div><span>入职日期</span><b>${fmt.date(person.beisen.hireDate)}</b></div>`}
          ${person.beisen.leaveDate && html`<div><span>离职日期</span><b>${fmt.date(person.beisen.leaveDate)}</b></div>`}
        </div>
      </div>
      <div className="twin-mid">
        <${Icon} name="ArrowRight" size=${18} />
        <span className="text-xs muted">${person.beisen.status === '离职' ? '应停用' : want ? `映射到「${want}」` : '映射表里没有'}</span>
      </div>
      <div className="twin-col">
        <div className="twin-head"><${SysLogo} system=${project.target} size=${24} /><b>${target}</b><span className="muted text-xs">目标</span></div>
        <div className="kv-list">
          <div><span>账号</span><b className=${cx(!t.exists && 'tone-warning-text')}>${t.exists ? (t.active ? '已激活' : '已停用') : '没有账号'}</b></div>
          <div><span>部门</span><b className=${cx(want && t.exists && t.dept !== want && 'tone-warning-text')}>${t.dept || '—'}</b></div>
          <div><span>用户 ID</span><b className="mono">${t.userId || '—'}</b></div>
          ${t.manual && html`<div><span>手工修改</span><b className="tone-warning-text">${t.manual.by} · ${fmt.relative(t.manual.at)}</b></div>`}
        </div>
      </div>
    </div>
    <section className="section">
      <div className="section-head"><h2 className="section-title">经过</h2><span className="muted text-xs">北森的变动、平台的运行、问题、对账和人工操作，按时间排在一起</span></div>
      <div className="card"><div className="card-body"><${Timeline} events=${trail} onRun=${setRunId} /></div></div>
    </section>
    <${RunDrawer} runId=${runId} onClose=${() => setRunId(null)} />
    <${Modal}
      open=${syncOpen}
      onClose=${() => setSyncOpen(false)}
      width=${520}
      title=${`同步${person.name}`}
      description=${`用「${wf.name}」对 ${person.key} 再跑一次：重新读取北森的最新状态，确保${target}和它一致`}
      footer=${html`<${Fragment}>
        <${Button} onClick=${() => setSyncOpen(false)}>取消<//>
        <${Button} variant="primary" icon="RefreshCw" loading=${busy} onClick=${sync}>同步<//>
      <//>`}
    >
      <div className="col" style=${{ gap: 12 }}>
        <div className=${cx('verdict', preview.failure ? 'tone-warning' : 'tone-info')}><${Icon} name="FlaskConical" size=${16} /><span>演练结果：${previewText}</span></div>
        <div className="muted text-xs">同步是幂等的：已经一致时不会有任何写入，也不会重复发通知。</div>
      </div>
    <//>
  </div>`;
}
