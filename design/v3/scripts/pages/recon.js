function ReconTab({ project, query }) {
  const s = useStore();
  const view = reconView(s, project.id);
  const { recon, run } = view;
  const target = systemName(project.target);
  const [cat, setCat] = useState(query.cat || 'open');
  const [picked, setPicked] = useState([]);
  const [remediate, setRemediate] = useState(null);
  const [exceptionDiff, setExceptionDiff] = useState(null);
  const [rules, setRules] = useState(false);
  const [running, setRunning] = useState(false);
  const counts = {
    open: view.open.length,
    leftActive: view.byCategory.leftActive,
    missing: view.byCategory.missing,
    mismatch: view.byCategory.mismatch,
    extra: view.byCategory.extra,
    done: view.diffs.filter((d) => d.live !== 'open').length,
  };
  const rows = view.diffs
    .filter((d) => (cat === 'open' ? d.live === 'open' : cat === 'done' ? d.live !== 'open' : d.category === cat && d.live === 'open'))
    .sort((a, b) => DIFF_CATEGORY[a.category].order - DIFF_CATEGORY[b.category].order);
  const fixable = (d) => d.live === 'open' && d.category !== 'extra' && !d.linked;
  const pickedFixable = picked.filter((id) => { const d = rows.find((r) => r.id === id); return d && fixable(d); });
  const runNow = () => {
    setRunning(true);
    setTimeout(() => {
      const r = actRunRecon(project.id);
      setRunning(false);
      setPicked([]);
      toast.success(`对账完成：${r.diffs.length} 处差异`);
    }, 1400);
  };
  const trend = [...recon.history, { at: run.at, total: run.diffs.length }].slice(-14).map((h, i, arr) => ({
    label: fmt.short(h.at), short: fmt.date(h.at).slice(5), value: h.total, tone: i === arr.length - 1 ? 'accent' : 'muted', mark: i === arr.length - 1, tip: `${h.total} 处差异`,
  }));
  const keyOf = (d) => d.key || d.accountId;
  return html`<div className="col" style=${{ gap: 16 }}>
    <div className="recon-strip">
      <div className="recon-strip-main">
        <div className="recon-strip-title">
          <${Icon} name="GitCompareArrows" size=${18} />
          <b>${recon.name}</b>
          <span className="muted">上次 ${fmt.dateTime(run.at)} · 用时 ${Math.round(run.durationMs / 1000)} 秒</span>
        </div>
        <div className="recon-counts">
          <div><span>${systemName(project.source)}名单</span><b>${fmt.number(run.counts.source)}</b></div>
          <div><span>${target}账号</span><b>${fmt.number(run.counts.target)}</b></div>
          <div><span>一致</span><b className="tone-success-text">${fmt.number(run.counts.matched)}</b></div>
          <div><span>差异</span><b className=${run.diffs.length ? 'tone-warning-text' : ''}>${run.diffs.length}</b></div>
          <div><span>按例外跳过</span><b>${run.excepted}</b></div>
        </div>
      </div>
      <div className="recon-trend">
        <div className="muted text-xs">近 14 次对账的差异数</div>
        <${ColumnChart} data=${trend} height=${54} ariaLabel="近 14 次对账的差异数" labelEvery=${13} />
      </div>
      <div className="col" style=${{ gap: 8 }}>
        <${Button} variant="primary" icon="RefreshCw" loading=${running} onClick=${runNow}>立即对账<//>
        <${Button} icon="SlidersHorizontal" onClick=${() => setRules(true)}>规则与例外<//>
      </div>
    </div>
    <${Alert} tone="primary" icon="ShieldCheck">
      对账只读取两边的${getWorkflow(s, recon.remediation).trigger.keyField}、状态和部门，不改任何数据。差异进问题中心，补齐仍然走「${getWorkflow(s, recon.remediation).name}」，和平时一样受映射、幂等声明和审计约束。这不是数据同步管道。
    <//>
    <${Tabs}
      value=${cat}
      onChange=${(v) => { setCat(v); setPicked([]); }}
      items=${[
        { value: 'open', label: '待处理', count: counts.open },
        { value: 'leftActive', label: '离职仍可登录', count: counts.leftActive, dot: counts.leftActive > 0 },
        { value: 'missing', label: '漏开通', count: counts.missing },
        { value: 'mismatch', label: '部门不一致', count: counts.mismatch },
        { value: 'extra', label: `${target}多出的账号`, count: counts.extra },
        { value: 'done', label: '已补齐或例外', count: counts.done },
      ]}
      extra=${pickedFixable.length > 0 && html`<${Button} size="sm" variant="primary" icon="Wrench" onClick=${() => setRemediate(pickedFixable.map((id) => keyOf(rows.find((r) => r.id === id))))}>补齐所选 ${pickedFixable.length} 人<//>`}
    />
    <${Table}
      selectable
      selected=${picked}
      onSelect=${setPicked}
      columns=${[
        { key: 'who', title: '人或账号', render: (d) => (d.key ? html`<${KeyLink} k=${d.key} name=${d.name} />` : html`<span className="key-link"><span className="key-link-name">${d.name}</span><span className="key-link-key">${d.target.account}</span></span>`) },
        { key: 'cat', title: '差异', render: (d) => html`<${Tag} size="sm" tone=${DIFF_CATEGORY[d.category].tone} icon=${DIFF_CATEGORY[d.category].icon}>${d.category === 'extra' ? `${target}多出` : DIFF_CATEGORY[d.category].label}<//>` },
        { key: 'src', title: systemName(project.source), wrap: true, render: (d) => (d.source ? html`<div className="diff-cell"><b>${d.source.status}${d.source.date ? ` · ${fmt.date(d.source.date).slice(5)}` : ''}</b><span>${d.source.dept}${d.source.mapped ? ` → ${d.source.mapped}` : ''}</span></div>` : html`<span className="muted">找不到这个人</span>`) },
        { key: 'tgt', title: target, wrap: true, render: (d) => {
          const person = d.key ? getPerson(s, d.key) : null;
          const manual = person && person.target.manual;
          if (!d.target) return html`<span className="muted">没有账号</span>`;
          return html`<div className="diff-cell"><b>${d.target.status}</b><span>${d.target.dept || ''}</span>${manual && html`<span className="tone-warning-text">${manual.by} ${fmt.relative(manual.at)}手工修改</span>`}${d.target.createdBy && html`<span>${d.target.createdBy} 手工创建</span>`}</div>`;
        } },
        { key: 'follow', title: '跟进', render: (d) => {
          if (d.live === 'fixed') return html`<${Tag} size="sm" tone="success" icon="Check">已一致<//>`;
          if (d.live === 'excepted') return html`<${Tag} size="sm" icon="ShieldOff">已例外<//>`;
          if (d.linked) return html`<${Link} to=${`/issues/${d.linked.id}`} className="link text-xs">在 ${d.linked.id} 跟进<//>`;
          if (d.issue) return html`<${Link} to=${`/issues/${d.issue.id}`} className="link text-xs">${d.issue.id}<//>`;
          return html`<span className="muted text-xs">—</span>`;
        } },
        { key: 'act', title: '', align: 'right', render: (d) => {
          if (d.live !== 'open') return null;
          return html`<div className="row" style=${{ justifyContent: 'flex-end' }} onClick=${(e) => e.stopPropagation()}>
            ${fixable(d) && html`<${Button} size="xs" variant="soft" onClick=${() => setRemediate([keyOf(d)])}>补齐<//>`}
            ${d.linked && html`<${Button} size="xs" onClick=${() => navigate(`/issues/${d.linked.id}`)}>去处理<//>`}
            ${!d.linked && html`<${Button} size="xs" variant="ghost" onClick=${() => setExceptionDiff(d)}>例外<//>`}
          </div>`;
        } },
      ]}
      data=${rows}
      empty=${html`<${Empty} size="sm" icon="CircleCheck" title=${cat === 'done' ? '还没有补齐或例外的差异' : '这一类没有差异'} />`}
    />
    <div className="muted text-xs">差异的「跟进」是实时的：补齐成功后显示「已一致」，下次对账会再核对一次。已经在运行问题里跟进的差异不会重复告警。</div>
    <${RemediateDialog} open=${Boolean(remediate)} projectId=${project.id} keys=${remediate} onClose=${() => { setRemediate(null); setPicked([]); }} />
    <${ExceptionDialog} open=${Boolean(exceptionDiff)} projectId=${project.id} diff=${exceptionDiff} onClose=${() => setExceptionDiff(null)} />
    <${ReconRulesDrawer} open=${rules} onClose=${() => setRules(false)} project=${project} />
  </div>`;
}

function ReconRulesDrawer({ open, onClose, project }) {
  const s = useStore();
  const recon = getRecon(s, project.id);
  const wf = getWorkflow(s, recon.remediation);
  return html`<${Drawer} open=${open} onClose=${onClose} width=${560} title="对账规则与例外" subtitle=${recon.name}>
    <div className="col" style=${{ gap: 18 }}>
      <div className="kv-list is-block">
        <div><span>时间</span><b>每天 ${fmt.pad(recon.hour)}:${fmt.pad(recon.minute)}，也可以随时手动执行</b></div>
        <div><span>源</span><b>${recon.sourceDesc}</b></div>
        <div><span>目标</span><b>${recon.targetDesc}</b></div>
        <div><span>匹配</span><b>${recon.matchDesc}</b></div>
        ${recon.fields.map((f) => html`<div key=${f.name}><span>比较「${f.name}」</span><b>${f.rule}</b></div>`)}
        <div><span>补齐</span><b>用工作流「${wf.name}」对差异的工号再跑一次</b></div>
        <div><span>告警</span><b>离职仍可登录立即告警值班；其他差异汇总成一个低优先级问题，白天处理</b></div>
      </div>
      <div>
        <div className="section-label">例外 ${recon.exceptions.length}</div>
        ${recon.exceptions.length === 0 && html`<div className="muted text-xs">还没有例外。</div>`}
        <div className="plan-list">
          ${recon.exceptions.map((ex) => html`<div key=${ex.id} className="plan-item">
            <${Icon} name="ShieldOff" size=${15} className="muted" />
            <div className="grow">
              <div><b>${ex.kind === 'rule' ? ex.text : ex.name}</b></div>
              <div className="muted text-xs">${ex.by} · ${fmt.relative(ex.at)} · ${ex.reason}${ex.expiresAt ? ` · ${fmt.short(ex.expiresAt)} 到期` : ' · 长期'}</div>
            </div>
            <${Button} size="xs" variant="ghost" onClick=${() => { actRemoveException(project.id, ex.id); toast.success('已移除例外'); }}>移除<//>
          </div>`)}
        </div>
      </div>
      <${Alert} tone="info">规则在方案里预置，原型里只读。例外到期后自动失效，这个人或账号重新参与对账。<//>
    </div>
  <//>`;
}
