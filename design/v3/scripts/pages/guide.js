const GUIDE_HYPOTHESES = [
  { icon: 'LayoutDashboard', title: '值班的人 10 秒内知道有没有人没同步好', how: '首页按对业务的影响排序，每个集成显示「还没同步好的人数」，而不是运行成功率。', to: '/', cta: '看首页' },
  { icon: 'UserSearch', title: 'HR 问到某个人，30 秒内答上来', how: '按工号、姓名、手机号查人：北森发生了什么、平台做了什么、现在两边是否一致。', to: '/records/E10231', cta: '查张晓雨' },
  { icon: 'RotateCcw', title: '一条告警，修好原因，安全重放', how: '同一原因只告警一次；重放前逐人检查，还会失败的先不重放；按幂等声明决定执行还是跳过。', to: '/issues/I-19', cta: '打开问题 I-19' },
  { icon: 'GitCompareArrows', title: '「不漏」是能证明的', how: '对账按工号比对两边名单，抓到事件触发发现不了的差异：后台手工恢复的账号、没有变动记录的离职。', to: '/projects/p_hr/recon', cta: '看对账' },
  { icon: 'Rocket', title: '新集成一小时内上线，第一天就看清历史欠账', how: '方案一次装好连接、工作流、映射表和对账；用真实变动试运行；首次对账列出过去手工维护留下的差异。', to: '/new', cta: '从方案新建' },
];

const GUIDE_PRINCIPLES = [
  ['ShieldCheck', '不重靠幂等', '每个写操作声明是否幂等。超时后幂等的自动重试，不幂等的停下等人确认；重放按声明决定执行还是跳过。', '工作流节点上的「幂等 / 不幂等」标签，问题 I-18'],
  ['GitCompareArrows', '不漏靠对账', '按业务键定期比对，差异进问题中心，补齐走工作流。停用后再启用，由人选择从哪里开始处理。', '对账页，门店的「店员同步」启用对话框'],
  ['Target', '按期望状态同步', '触发后按工号重新读取北森最新状态，确保目标一致。重放、补处理、对账补齐都是「对这个工号再跑一次」。', '查人页的「立即同步这个人」'],
  ['Gauge', '限流属于连接', '同一连接的请求共用速率上限，超出的排队等待，不算失败。', '飞书连接的「速率与排队」，校招那天的运行'],
  ['Fingerprint', '业务键贯穿始终', '工号在触发器上定义一次，同时用于去重、查人、对账匹配和重放分组。', '运行记录的「人」列，查人页'],
  ['ListChecks', '错误在设计期发现', '映射表覆盖率、权限范围、凭证到期，在发布前和运行前提示。', '工作流页右侧的设计期检查'],
  ['Eye', '让可靠性看得见', '首页列出平台替人处理掉的事：拦下的重复变动、限速排队、安全重试、停机后补处理。', '首页右下角'],
];

const GUIDE_TOUR = [
  ['首页有一个高危：2 名离职员工的飞书账号仍可登录。点「补齐」，看计划：陈立是 IT 在后台手工恢复的，孙悦的离职在北森没有变动记录。', '/'],
  ['打开问题 I-19，在页面里补上「深圳研发中心-平台组」的映射，再点「重放」：检查会拦下这 2 人，因为目标部门不在飞书应用的权限范围内，提示先处理 I-20。', '/issues/I-19'],
  ['在问题 I-20 按步骤处理权限范围，点「重新检查连接」，再重放 3 人；回到 I-19 重放 2 人。两个问题自动关闭，查人页里能看到完整经过。', '/issues/I-20'],
  ['问题 I-18：通知 HR 群超时、结果未知。选「群里看到了」或「只重发这一步」，账号不会重新开通。', '/issues/I-18'],
  ['门店的「店员同步」停用了 2 天。启用时选「从停用时刻开始」，6 条变动补处理完，对账差异随之消失。', '/projects/p_store/workflows'],
  ['回到首页：只剩低优先级的差异和北森密钥到期，可以白天处理。', '/'],
];

function GuidePage() {
  return html`<div className="page-inner guide">
    <div className="guide-hero">
      <div className="guide-kicker">第三版原型 · 首发主线</div>
      <h1>集成的成本大头在上线之后</h1>
      <p>好的集成平台卖的不是「连得上」，而是「连上以后没人盯着也不出错，出了错能很快补平」。这一版只做首发主线（北森 → 飞书人员同步）的核心闭环，用它证明下面五件事。</p>
    </div>
    <div className="guide-hyp">
      ${GUIDE_HYPOTHESES.map((h, i) => html`<div key=${h.title} className="guide-hyp-item">
        <div className="guide-hyp-num">${i + 1}</div>
        <div className="grow">
          <div className="guide-hyp-title"><${Icon} name=${h.icon} size=${16} />${h.title}</div>
          <div className="muted">${h.how}</div>
        </div>
        <${Button} size="sm" onClick=${() => navigate(h.to)}>${h.cta}<//>
      </div>`)}
    </div>
    <section className="section">
      <h2 className="section-title">值班的一个早上（约 5 分钟）</h2>
      <ol className="guide-tour">
        ${GUIDE_TOUR.map(([text, to], i) => html`<li key=${i}><span>${text}</span><${Link} to=${to} className="link nowrap">去这里<//></li>`)}
      </ol>
      <div className="muted text-xs">想从头再走一遍：头像菜单 →「重置演示数据」。</div>
    </section>
    <section className="section">
      <h2 className="section-title">这一版新加的设计</h2>
      <div className="guide-principles">
        ${GUIDE_PRINCIPLES.map(([icon, title, text, where]) => html`<div key=${title} className="guide-principle">
          <span className="auto-icon"><${Icon} name=${icon} size=${16} /></span>
          <div>
            <b>${title}</b>
            <div className="muted text-xs" style=${{ marginTop: 2 }}>${text}</div>
            <div className="guide-where"><${Icon} name="MapPin" size=${12} />${where}</div>
          </div>
        </div>`)}
      </div>
    </section>
    <section className="section">
      <h2 className="section-title">和第二版的关系</h2>
      <div className="guide-cols">
        <div className="card"><div className="card-body">
          <b>第二版铺全了页面</b>
          <p className="muted text-xs" style=${{ marginTop: 4 }}>照 AnyCross 做了除数据集成以外的全部页面：完整的编辑器、环境推广与审批、AI 生成、MCP、自托管运维。这些交互仍以第二版为准。</p>
          <${Button} size="sm" icon="ExternalLink" onClick=${() => { window.location.href = '../index.html'; }}>打开第二版<//>
        </div></div>
        <div className="card"><div className="card-body">
          <b>第三版只做核心闭环</b>
          <p className="muted text-xs" style=${{ marginTop: 4 }}>值班看板、查人、问题与安全重放、对账、连接的速率与权限、方案向导。新加的概念写进了 product-brief.md 的「可靠性原则」和决定 000040 ~ 000042。</p>
        </div></div>
      </div>
    </section>
  </div>`;
}
