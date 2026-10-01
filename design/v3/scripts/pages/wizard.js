const WIZ_SOLUTIONS = [
  { value: 'beisen-feishu', source: 'beisen', target: 'feishu', label: '北森 → 飞书 · 人员同步', desc: '入职开通、调岗更新、离职停用，通知 HR 和 IT 群；每天对账。', state: 'ready' },
  { value: 'beisen-wecom', source: 'beisen', target: 'wecom', label: '北森 → 企业微信 · 人员同步', desc: '门店和分公司常用，成员管理加应用消息；每天对账。', state: 'ready' },
  { value: 'beisen-dingtalk', source: 'beisen', target: 'dingtalk', label: '北森 → 钉钉 · 人员同步', desc: '钉钉连接器还在开发，写操作的幂等声明没完成，暂不开放。', state: 'building' },
];

const WIZ_DEPTS = [
  { from: '总经办-综合组', exact: null, ai: null, fallback: '总经办' },
  { from: '研发部-算法组', exact: '研发部/算法' },
  { from: '研发部-平台组', exact: '研发部/平台' },
  { from: '研发部-测试组', exact: '研发部/测试' },
  { from: '销售部-华东组', exact: '销售部/华东' },
  { from: '销售部-华南组', exact: null, ai: null },
  { from: '交付部-实施一组', ai: '客户交付部/实施一', confidence: 92 },
  { from: '交付部-实施二组', ai: '客户交付部/实施二', confidence: 92 },
  { from: '财务部-核算组', exact: '财务部/核算' },
  { from: '人事行政部-人事组', ai: '人力行政/人事', confidence: 81 },
  { from: '人事行政部-行政组', ai: '人力行政/行政', confidence: 58 },
];

const WIZ_FEISHU_DEPTS = ['总经办', '研发部/算法', '研发部/平台', '研发部/测试', '销售部/华东', '客户交付部/实施一', '客户交付部/实施二', '财务部/核算', '人力行政/人事', '人力行政/行政', '人力行政', '外部协作'];

function wizInitialMapping() {
  return WIZ_DEPTS.map((d) => ({
    from: d.from,
    to: d.exact || d.ai || null,
    kind: d.exact ? 'exact' : d.ai ? 'ai' : 'none',
    confidence: d.confidence || null,
    accepted: Boolean(d.exact) || (Boolean(d.ai) && d.confidence >= 80),
  }));
}

function wizWorld(s, { pid, keyPrefix, mapping }) {
  const rand = seedRandom(4242 + keyPrefix.charCodeAt(0));
  const nextName = makeNamer(rand);
  const now = Date.now();
  let seq = 0;
  const key = () => { seq += 1; return `${keyPrefix}${String(seq).padStart(4, '0')}`; };
  const mapped = mapping.filter((m) => m.accepted && m.to);
  const deptPick = () => pickOne(rand, mapped);
  const mk = (beisen, target, changes = []) => ({ key: key(), name: nextName(), mobile: maskedMobile(rand), projectId: pid, beisen, target, changes });
  const people = [];
  for (let i = 0; i < 9; i++) {
    const d = deptPick();
    people.push(mk({ status: '离职', dept: d.from, hireDate: now - 900 * DAY, leaveDate: now - (60 + Math.floor(rand() * 340)) * DAY }, { exists: true, active: true, dept: d.to, userId: `ou_${hexId(rand, 10)}` }));
  }
  for (let i = 0; i < 2; i++) {
    const d = deptPick();
    people.push(mk({ status: '在职', dept: d.from, hireDate: now - (100 + Math.floor(rand() * 300)) * DAY, leaveDate: null }, { exists: false, active: false, dept: null, userId: null }));
  }
  for (let i = 0; i < 5; i++) {
    const d = deptPick();
    const other = pickOne(rand, mapped.filter((m) => m.to !== d.to));
    people.push(mk({ status: '在职', dept: d.from, hireDate: now - 500 * DAY, leaveDate: null }, { exists: true, active: true, dept: other.to, userId: `ou_${hexId(rand, 10)}`, manual: { by: '飞书管理员', at: now - (20 + Math.floor(rand() * 200)) * DAY, text: '在飞书后台手工调整过部门' } }));
  }
  const recentDefs = [['入职', '研发部-平台组'], ['入职', '交付部-实施一组'], ['入职', '销售部-华南组'], ['入职', '研发部-测试组'], ['调岗', '财务部-核算组'], ['离职', '研发部-算法组']];
  const recent = recentDefs.map(([type, dept], i) => {
    const at = now - (6 - i) * DAY + 10 * HOUR + Math.floor(rand() * 5 * HOUR);
    const prev = pickOne(rand, mapped.filter((m) => m.from !== dept));
    if (type === '入职') return mk({ status: '待入职', dept, hireDate: at + 2 * DAY, leaveDate: null }, { exists: false, active: false, dept: null, userId: null }, [{ type, at, pending: true }]);
    if (type === '调岗') return mk({ status: '在职', dept, hireDate: now - 300 * DAY, leaveDate: null }, { exists: true, active: true, dept: prev.to, userId: `ou_${hexId(rand, 10)}` }, [{ type, at, pending: true }]);
    return mk({ status: '离职', dept, hireDate: now - 600 * DAY, leaveDate: at }, { exists: true, active: true, dept: (mapped.find((m) => m.from === dept) || prev).to, userId: `ou_${hexId(rand, 10)}` }, [{ type, at, pending: true }]);
  });
  const extraNames = ['实习生', '外包', '驻场', '测试账号', '会议室平板', '供应商'];
  const targetOnly = Array.from({ length: 21 }, (_, i) => {
    const kind = extraNames[i % extraNames.length];
    const isDevice = kind === '测试账号' || kind === '会议室平板';
    return {
      id: `${pid}_fx${i}`, projectId: pid, name: isDevice ? `${kind} ${String(i + 1).padStart(2, '0')}` : `${nextName()}（${kind}）`,
      account: isDevice ? `device${i + 1}` : `ext${i + 1}`, dept: kind === '外包' || kind === '供应商' ? '外部协作' : pickOne(rand, mapped).to,
      createdAt: now - (30 + Math.floor(rand() * 600)) * DAY, createdBy: 'IT 手工创建', active: true,
    };
  });
  return { people: [...people, ...recent], recent, targetOnly };
}

function wizDraftState(s, form) {
  const n = s.projects.filter((p) => p.solution && p.id.startsWith('p_new')).length + 1;
  const pid = `p_new${n}`;
  const keyPrefix = String.fromCharCode(89 - n);
  const solution = WIZ_SOLUTIONS.find((x) => x.value === form.solution);
  const now = Date.now();
  const world = wizWorld(s, { pid, keyPrefix, mapping: form.mapping });
  const cb = { id: `c_src_${n}`, system: 'beisen', name: `北森 · ${form.company}`, owner: s.me.name, createdAt: now, authKind: '开放平台应用', fields: [{ label: '租户 ID', value: form.beisen.tenant }, { label: 'App Key', value: form.beisen.key }, { label: 'App Secret', value: '已加密保存', secret: true }], expiresAt: now + 180 * DAY, credentialNote: '应用密钥设置了到期时间，到期前要在北森后台重新生成', rate: { declared: 20, limit: 20 }, permissions: [{ name: '员工信息（只读）', usedBy: ['员工变动', '读取员工', '列出员工（对账）'], state: 'verified', at: now }, { name: '组织信息（只读）', usedBy: ['列出部门（映射覆盖率）'], state: 'verified', at: now }], queueDaily: [0, 0, 0, 0, 0, 0, 0], waitDaily: [0, 0, 0, 0, 0, 0, 0], callsToday: 0 };
  const ct = { id: `c_tgt_${n}`, system: solution.target, name: `${systemName(solution.target)} · ${form.company}人事`, owner: s.me.name, createdAt: now, authKind: '企业自建应用', fields: [{ label: 'App ID', value: form.feishu.appId }, { label: 'App Secret', value: '已加密保存', secret: true }], expiresAt: null, credentialNote: '访问令牌由平台自动续期', rate: { declared: 50, limit: 50 }, scope: { label: '通讯录权限范围', mode: '全部成员', included: ['全部成员'], missing: [] }, permissions: [{ name: '更新通讯录', usedBy: ['确保账号', '停用账号'], state: 'verified', at: now }, { name: '读取通讯录', usedBy: ['列出通讯录用户（对账）'], state: 'verified', at: now }, { name: '以应用身份发消息', usedBy: ['发送群消息'], state: 'verified', at: now }], queueDaily: [0, 0, 0, 0, 0, 0, 0], waitDaily: [0, 0, 0, 0, 0, 0, 0], callsToday: 0 };
  const project = { id: pid, name: form.name, source: solution.source, target: solution.target, owner: s.me.name, members: [s.me.name], desc: `${form.company}的北森员工入职、调岗、离职后，在${systemName(solution.target)}开通、更新或停用账号，并通知相关的群。`, object: '员工', createdAt: now, solution: solution.value, connections: [cb.id, ct.id], baseConsistent: 240 };
  const wf = { id: `wf_sync_${n}`, projectId: pid, name: '员工同步', template: 'sync-feishu', status: 'off', version: 1, updatedAt: now, updatedBy: s.me.name, disabledAt: now - 7 * DAY, disabledBy: s.me.name, disabledNote: '方案刚装好，还没有启用', trigger: { label: '北森 · 员工变动', mode: '轮询 · 每 5 分钟', keyField: '工号', keyPath: 'EmployeeNumber', displayField: '姓名', dedupe: '工号 + 变动时间', checkpointAt: now }, history: [{ at: now, type: 'publish', by: s.me.name, version: 1, note: `从方案「${solution.label}」创建` }] };
  const workflows = [wf];
  if (form.remind) workflows.push({ id: `wf_remind_${n}`, projectId: pid, name: '入职前一天提醒 IT', template: 'remind-it', status: 'on', version: 1, updatedAt: now, updatedBy: s.me.name, trigger: { label: '定时 · 每个工作日 17:00', mode: '定时', keyField: null, missedPolicy: '错过的不补' }, history: [{ at: now, type: 'enable', by: s.me.name, start: 'now', note: '从方案创建' }] });
  const table = { id: `mt_${n}`, projectId: pid, name: '北森部门 → 飞书部门', fromLabel: '北森部门', toLabel: '飞书部门', missing: 'error', rows: form.mapping.filter((m) => m.accepted && m.to).map((m) => ({ from: m.from, to: m.to, addedBy: m.kind === 'ai' ? `${s.me.name}（采纳 AI 建议）` : s.me.name, addedAt: now })), sourceValues: WIZ_DEPTS.map((d) => ({ value: d.from, firstSeenAt: now - 400 * DAY })), targetValues: WIZ_FEISHU_DEPTS };
  const recon = { id: `rc_${n}`, projectId: pid, name: `北森 ↔ ${systemName(solution.target)} 员工对账`, hour: 2, minute: 0, sourceDesc: '北森 · 列出员工：在职、待入职，以及 30 天内离职的员工', targetDesc: `${systemName(solution.target)} · 列出通讯录用户：全部用户`, matchDesc: '北森「工号」对飞书用户的「工号」字段；对不上时用手机号兜底', fields: [{ name: '账号状态', rule: '北森在职、待入职 ↔ 飞书已激活；北森离职 ↔ 飞书已停用' }, { name: '部门', rule: '北森部门经「北森部门 → 飞书部门」映射后比较' }], remediation: wf.id, exceptions: form.ruleException ? [{ id: uid('ex'), kind: 'rule', text: '飞书部门为「外部协作」的账号不参与对账', by: s.me.name, at: now, reason: '外包和供应商，不在北森里' }] : [], history: [], runs: [] };
  const state = {
    ...s,
    projects: [...s.projects, project],
    workflows: [...s.workflows, ...workflows],
    connections: [...s.connections, cb, ct],
    mappingTables: [...s.mappingTables, table],
    recons: [...s.recons, recon],
    people: [...s.people, ...world.people],
    targetOnly: [...s.targetOnly, ...world.targetOnly],
  };
  return { state, pid, wfId: wf.id, world };
}

function WizardPage() {
  const s = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    solution: 'beisen-feishu', company: '星河智能', name: '星河智能 · 人员同步', remind: true, ruleException: true,
    beisen: { tenant: '', key: '', secret: '' }, feishu: { appId: '', secret: '' },
    mapping: wizInitialMapping(), start: 'backfill', firstRecon: true,
  });
  const [verified, setVerified] = useState({ beisen: false, feishu: false });
  const [checking, setChecking] = useState(null);
  const [dry, setDry] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const steps = [{ title: '选方案' }, { title: '连接北森' }, { title: '连接飞书' }, { title: '部门映射' }, { title: '试运行' }, { title: '启用' }];
  const verify = (which) => {
    setChecking(which);
    setTimeout(() => { setVerified((v) => ({ ...v, [which]: true })); setChecking(null); }, 1100);
  };
  const fillDemo = (which) => {
    if (which === 'beisen') set({ beisen: { tenant: '311204', key: 'bs_k_9a71c2', secret: '••••••••••••' } });
    else set({ feishu: { appId: 'cli_a6b17d0e43f5', secret: '••••••••••••' } });
  };
  const mapped = form.mapping.filter((m) => m.accepted && m.to).length;
  const runDry = () => {
    const draft = wizDraftState(s, form);
    const results = draft.world.recent.map((p) => ({ person: p, outcome: simulateSync(draft.state, { projectId: draft.pid, workflowId: draft.wfId, key: p.key, source: 'dryrun' }) }));
    setDry(results);
  };
  const finish = () => {
    setBusy(true);
    setTimeout(() => {
      const draft = wizDraftState(s, form);
      Store.set(draft.state);
      const res = actEnableWorkflow(draft.wfId, form.start === 'backfill' ? 'gap' : 'now');
      let diffs = 0;
      let high = 0;
      if (form.firstRecon) {
        const run = actRunRecon(draft.pid);
        diffs = run.diffs.length;
        high = run.diffs.filter((d) => d.category === 'leftActive').length;
      }
      const cur = Store.get();
      Store.set({
        ...cur,
        workflows: cur.workflows.map((w) => (w.id === draft.wfId ? { ...w, history: w.history.map((h) => (h.type === 'enable' ? { ...h, note: form.start === 'backfill' ? `首次启用，补处理了过去 7 天的 ${res.processed} 条变动` : '首次启用，从现在开始' } : h)) } : w)),
        projects: cur.projects.map((p) => (p.id === draft.pid ? { ...p, firstRecon: form.firstRecon ? { diffs, high } : null } : p)),
      });
      setBusy(false);
      toast.success('集成已启用');
      navigate(`/projects/${draft.pid}`);
    }, 1500);
  };
  const solution = WIZ_SOLUTIONS.find((x) => x.value === form.solution);
  const canNext = [
    Boolean(form.name.trim()),
    verified.beisen,
    verified.feishu,
    true,
    true,
    true,
  ][step];
  return html`<div className="page-inner wiz">
    <${Breadcrumb} items=${[{ label: '集成', to: '/projects' }, { label: '从方案新建' }]} />
    <h1 className="page-title" style=${{ margin: '8px 0 16px' }}>从方案新建集成</h1>
    <div className="wiz-steps"><${Steps} current=${step} items=${steps} onChange=${(i) => { if (i < step) setStep(i); }} /></div>
    <div className="wiz-body">
      ${step === 0 && html`<div className="wiz-two">
        <div className="col" style=${{ gap: 16 }}>
          <${Field} label="方案">
            <${RadioCards} columns=${1} value=${form.solution} onChange=${(v) => set({ solution: v })} options=${WIZ_SOLUTIONS.map((x) => ({ value: x.value, label: x.label, desc: x.desc, disabled: x.state !== 'ready' }))} />
          <//>
          <div className="wiz-row">
            <${Field} label="公司或组织"><${Input} value=${form.company} onChange=${(v) => set({ company: v, name: `${v} · 人员同步` })} /><//>
            <${Field} label="集成名称"><${Input} value=${form.name} onChange=${(v) => set({ name: v })} /><//>
          </div>
        </div>
        <div className="wiz-aside">
          <div className="section-label">这个方案会装好</div>
          <ul className="wiz-includes">
            <li><${Icon} name="Cable" size=${15} /><div><b>两个连接</b><span>北森和${systemName(solution.target)}，下两步用向导填写</span></div></li>
            <li><${Icon} name="Workflow" size=${15} /><div><b>工作流「员工同步」</b><span>按工号重新读取北森状态，确保${systemName(solution.target)}一致；写操作都声明了幂等</span></div></li>
            <li><${Checkbox} checked=${form.remind} onChange=${(v) => set({ remind: v })} /><div><b>工作流「入职前一天提醒 IT」</b><span>可选，每个工作日 17:00</span></div></li>
            <li><${Icon} name="Table2" size=${15} /><div><b>映射表「北森部门 → 飞书部门」</b><span>第 4 步自动匹配，逐条确认</span></div></li>
            <li><${Icon} name="GitCompareArrows" size=${15} /><div><b>每天对账</b><span>按工号比对两边名单，差异进问题中心</span></div></li>
            <li><${Checkbox} checked=${form.ruleException} onChange=${(v) => set({ ruleException: v })} /><div><b>例外规则：外部协作不参与对账</b><span>外包、供应商不在北森里</span></div></li>
            <li><${Icon} name="BellRing" size=${15} /><div><b>告警</b><span>离职仍可登录立即通知值班；其他差异白天处理</span></div></li>
          </ul>
        </div>
      </div>`}
      ${step === 1 && html`<${WizConnect}
        system="beisen"
        title="连接北森"
        path="北森开放平台 › 应用管理 › 新建应用 › 权限设置"
        features=${[
          { name: '读取员工变动和员工信息', perms: ['员工信息（只读）'] },
          { name: '检查映射表覆盖率', perms: ['组织信息（只读）'] },
          { name: '入职前一天提醒', perms: ['入职信息（只读）'] },
        ]}
        fields=${[['tenant', '租户 ID'], ['key', 'App Key'], ['secret', 'App Secret']]}
        values=${form.beisen}
        onChange=${(v) => { set({ beisen: v }); setVerified((x) => ({ ...x, beisen: false })); }}
        onFill=${() => fillDemo('beisen')}
        onVerify=${() => verify('beisen')}
        checking=${checking === 'beisen'}
        verified=${verified.beisen}
        results=${['凭证有效', '能读取员工：共 293 人', `能读取组织：共 ${WIZ_DEPTS.length} 个部门`]}
      />`}
      ${step === 2 && html`<${WizConnect}
        system=${solution.target}
        title=${`连接${systemName(solution.target)}`}
        path="飞书开发者后台 › 创建企业自建应用 › 权限管理"
        features=${[
          { name: '开通、更新、停用账号', perms: ['更新通讯录', '通过手机号或邮箱获取用户 ID'] },
          { name: '通知 HR 和 IT 群', perms: ['以应用身份发消息'] },
          { name: '对账', perms: ['读取通讯录'] },
        ]}
        note="通讯录权限范围要包含所有要同步的部门，建议设为「全部成员」。其余权限会在第一次调用时验证，缺少时出错的步骤会写明权限名。"
        fields=${[['appId', 'App ID'], ['secret', 'App Secret']]}
        values=${form.feishu}
        onChange=${(v) => { set({ feishu: v }); setVerified((x) => ({ ...x, feishu: false })); }}
        onFill=${() => fillDemo('feishu')}
        onVerify=${() => verify('feishu')}
        checking=${checking === 'feishu'}
        verified=${verified.feishu}
        results=${['凭证有效', '通讯录权限范围：全部成员', '能读取通讯录：共 301 个账号']}
      />`}
      ${step === 3 && html`<${WizMapping} mapping=${form.mapping} onChange=${(m) => set({ mapping: m })} />`}
      ${step === 4 && html`<div className="col" style=${{ gap: 16 }}>
        <${Alert} tone="info" icon="FlaskConical" title="用北森过去 7 天的真实变动演练">读操作真实执行，写操作只生成请求、不发送。不用造测试数据，也不用另开测试环境。<//>
        <div className="row"><${Button} variant="primary" icon="FlaskConical" onClick=${runDry}>${dry ? '再演练一次' : '开始演练'}<//><span className="muted text-xs">已映射 ${mapped} / ${form.mapping.length} 个部门</span></div>
        ${dry && html`<div className="plan-list">
          ${dry.map(({ person, outcome }) => {
            const st = outcome.run.steps;
            const s4 = parseStep(st.s4);
            const s6 = parseStep(st.s6);
            const fail = outcome.failure;
            const text = fail ? `会失败：映射表里没有「${fail.value}」，启用后会进问题中心` : s6.state === 'ok' ? '会停用飞书账号，并通知 IT 资产群' : s4.result === '已开通' ? `会在「${outcome.patch.dept}」开通账号，并通知 HR 入职群` : s4.result === '已更新' ? `会把部门更新为「${outcome.patch.dept}」` : '已经一致，不会写入';
            return html`<div key=${person.key} className="plan-item">
              <${Icon} name=${fail ? 'CircleX' : 'CircleCheck'} size=${16} className=${fail ? 'tone-danger-text' : 'tone-success-text'} />
              <span className="key-link"><span className="key-link-name">${person.name}</span><span className="key-link-key">${person.key}</span></span>
              <span className="muted text-xs nowrap">${person.changes[0].type}</span>
              <span className="plan-item-text">${text}</span>
            </div>`;
          })}
        </div>`}
        ${dry && dry.some((d) => d.outcome.failure) && html`<div className="muted text-xs">可以回到上一步补映射，也可以先启用：失败的人会进问题中心，补上映射后一键重放。</div>`}
      </div>`}
      ${step === 5 && html`<div className="wiz-two">
        <div className="col" style=${{ gap: 16 }}>
          <${Field} label="从哪里开始处理">
            <${RadioCards} columns=${1} value=${form.start} onChange=${(v) => set({ start: v })} options=${[
              { value: 'backfill', label: '补处理过去 7 天的变动（推荐）', desc: '北森过去 7 天有 6 条员工变动。同步是幂等的，已经一致的人不会被重复处理。' },
              { value: 'now', label: '从现在开始', desc: '过去的变动不处理，第一次对账会把相关的人列为差异。' },
            ]} />
          <//>
          <label className="wiz-check"><${Checkbox} checked=${form.firstRecon} onChange=${(v) => set({ firstRecon: v })} /><div><b>启用后立即对账一次</b><span>第一次对账通常会发现历史遗留的差异：过去手工维护留下的，不是新集成造成的。</span></div></label>
        </div>
        <div className="wiz-aside">
          <div className="section-label">确认</div>
          <div className="kv-list">
            <div><span>集成</span><b>${form.name}</b></div>
            <div><span>方案</span><b>${solution.label}</b></div>
            <div><span>部门映射</span><b>${mapped} / ${form.mapping.length}${mapped < form.mapping.length ? '，没映射的部门会报错' : ''}</b></div>
            <div><span>工作流</span><b>员工同步${form.remind ? '、入职前一天提醒 IT' : ''}</b></div>
            <div><span>告警发到</span><b>飞书群「集成值班」</b></div>
          </div>
        </div>
      </div>`}
    </div>
    <div className="wiz-foot">
      <${Button} disabled=${step === 0} onClick=${() => setStep(step - 1)}>上一步<//>
      <span className="spacer" />
      ${step < steps.length - 1
        ? html`<${Button} variant="primary" disabled=${!canNext} onClick=${() => setStep(step + 1)}>下一步<//>`
        : html`<${Button} variant="primary" icon="Play" loading=${busy} onClick=${finish}>启用集成<//>`}
    </div>
  </div>`;
}

function WizConnect({ system, title, path, features, note, fields, values, onChange, onFill, onVerify, checking, verified, results }) {
  const filled = fields.every(([k]) => String(values[k] || '').trim());
  return html`<div className="wiz-two">
    <div className="col" style=${{ gap: 14 }}>
      <div className="row"><${SysLogo} system=${system} size=${32} /><div className="section-title">${title}</div><span className="spacer" /><${Button} size="sm" variant="ghost" onClick=${onFill}>填入演示值<//></div>
      ${fields.map(([k, label]) => html`<${Field} key=${k} label=${label} required>
        <${Input} value=${values[k]} type=${k === 'secret' ? 'password' : 'text'} mono=${k !== 'secret'} onChange=${(v) => onChange({ ...values, [k]: v })} />
      <//>`)}
      <div className="row">
        <${Button} variant="primary" icon="ShieldCheck" disabled=${!filled} loading=${checking} onClick=${onVerify}>验证<//>
        <span className="muted text-xs">保存前先验证凭证，再按功能试调一次只读接口</span>
      </div>
      ${verified && html`<ul className="check-list">${results.map((r) => html`<li key=${r} className="is-ok"><${Icon} name="Check" size=${14} /><span>${r}</span></li>`)}</ul>`}
    </div>
    <div className="wiz-aside">
      <div className="section-label">在对方后台怎么做</div>
      <div className="fix-path"><span className="mono">${path}</span><${CopyButton} text=${path} /></div>
      <div className="section-label" style=${{ marginTop: 16 }}>按功能需要的权限</div>
      <div className="col" style=${{ gap: 10 }}>
        ${features.map((f) => html`<div key=${f.name}><b>${f.name}</b><div className="muted text-xs">${f.perms.join('、')}</div></div>`)}
      </div>
      ${note && html`<${Alert} tone="info" className="wiz-note">${note}<//>`}
    </div>
  </div>`;
}

function WizMapping({ mapping, onChange }) {
  const update = (i, patch) => onChange(mapping.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const exact = mapping.filter((m) => m.kind === 'exact').length;
  const ai = mapping.filter((m) => m.kind === 'ai').length;
  const none = mapping.filter((m) => m.kind === 'none').length;
  return html`<div className="col" style=${{ gap: 14 }}>
    <div className="row">
      <div className="section-title grow">北森部门 → 飞书部门</div>
      <${Tag} tone="success">按名称匹配 ${exact}<//>
      <${Tag} tone="primary" icon="Sparkles">AI 建议 ${ai}<//>
      <${Tag} tone="warning">没找到 ${none}<//>
    </div>
    <div className="muted text-xs">AI 建议只是建议：置信度低于 80% 的默认不采用。没映射的部门，启用后在那个部门入职的人会在「部门映射」报错，不会被开通到错误的部门。</div>
    <${Table}
      dense
      rowKey="from"
      columns=${[
        { key: 'use', title: '采用', width: 60, render: (m) => html`<${Checkbox} checked=${m.accepted} disabled=${!m.to} onChange=${(v) => update(mapping.indexOf(m), { accepted: v })} />` },
        { key: 'from', title: '北森部门', render: (m) => html`<b>${m.from}</b>` },
        { key: 'to', title: '飞书部门', render: (m) => html`<${Select} size="sm" width=${220} value=${m.to} placeholder="选择飞书部门" clearable onChange=${(v) => update(mapping.indexOf(m), { to: v, accepted: Boolean(v), kind: m.kind === 'none' && v ? 'manual' : m.kind })} options=${WIZ_FEISHU_DEPTS.map((d) => ({ value: d, label: d }))} />` },
        { key: 'how', title: '来源', render: (m) => (m.kind === 'exact'
          ? html`<span className="muted text-xs">名称一致</span>`
          : m.kind === 'ai'
            ? html`<${Tag} size="sm" tone=${m.confidence >= 80 ? 'primary' : 'warning'} icon="Sparkles">AI 建议 · 置信度 ${m.confidence}%<//>`
            : m.kind === 'manual' ? html`<span className="muted text-xs">手动选择</span>` : html`<span className="tone-warning-text text-xs">飞书里没找到对应部门</span>`) },
      ]}
      data=${mapping}
    />
  </div>`;
}
