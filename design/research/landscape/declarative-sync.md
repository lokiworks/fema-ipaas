# 声明式同步与身份开通：Okta、Entra、Census、Hightouch、Celigo 拆解

调研时间 2026-10-01。范围：Okta Lifecycle Management（Workday 作 HR 源的入站开通、SCIM 出站开通）、Okta Workflows、Microsoft Entra 的 HR 入站开通与 Lifecycle Workflows、Census（2025 年被 Fivetran 收购，现名 Fivetran Activations）和 Hightouch 的 sync、Celigo 的 integration apps。末尾附国内 Authing 同步中心的一小段对照。

**资料与可信度**

- 以官方文档为主，按钮和字段名保留英文原文，方便对照截图。
- 用户评价：G2、Capterra、TrustRadius、Gartner Peer Insights、Reddit 本轮抓取全部被拦（403 或人机验证），拿不到原文；知乎未查到；V2EX 检索没有相关讨论。第 8 节只用能核实的公开来源：Microsoft Q&A 上的用户提问、Okta 开发者论坛、Hacker News、厂商文档自己承认的限制。
- 标「推断」的地方没有直接证据，是从文档结构推出来的判断。

## 0. 先说结论

1. **这几家产品里，「同步」都不是一张流程图，而是一张表单。** 用户配的是七样东西：源对象、目标对象、匹配规则、字段映射、作用域、生命周期规则、安全阈值。引擎负责决定每个人这一轮该「创建、更新、停用还是跳过」。Census 的文档把这层意思说得最直白：同步像 Dropbox 一样让两边保持一致，「不用担心丢事件和补数」（[Fivetran Activations: Syncs](https://fivetran.com/docs/activations/syncs)）。
2. **最值钱的交互是「试一个人」。** Entra 的 Provision on demand 输入一个工号，30 秒内把「读取源 → 是否在范围 → 在目标里匹配 → 执行动作」逐步摊开，每一步都能看到具体的值（[Entra: Provision on demand](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/provision-on-demand)）。Hightouch 的 Test a row 还能把这一行按「新增、变更、删除」三种状态各发一次（[Hightouch: Syncs overview](https://hightouch.com/docs/syncs/overview)）。
3. **启用前的预演决定敢不敢上线。** Census 的 Dry Run 不写目标，只给出「将创建、将更新、将删除」三个数字和前后记录数（[Sync Dry Runs](https://fivetran.com/docs/activations/syncs/sync-monitoring/sync-dry-runs)）。Entra 没有这一步，结果是有人测完一个人就打开开关，一次建了 1.5 万个账号（见第 8 节）。
4. **大批量的停用和删除一定要有闸门。** Okta 的 Import Safeguards 默认 20%（[Import safeguards](https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-import-safeguard.htm)），Entra 的 accidental deletions 超阈值就隔离整个作业，等人点 **Allow deletes**（[Entra: accidental deletions](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/accidental-deletions)）。不过阈值只是粗粒度的保护：用户想要的是逐条放行和缓冲期。
5. **「回滚」只存在于配置层。** 没有一家能把写进目标系统的数据自动撤回。Entra 的部署指南写明，回滚要靠 provisioning logs 里的旧值手工改回去（[Plan cloud HR provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision)）。对我们来说，按期望状态收敛（决定 000042）是更好的答案：先回滚配置，预演受影响的人，再让这些人重新收敛一次。
6. **同步和工作流的分界，Microsoft 划得最清楚**：provisioning 管账号的创建和属性，Lifecycle Workflows 管围绕入离职的「额外任务」，比如发邮件、发临时密码。两者之间还有一个插槽：某个字段的值可以交给一个工作流算出来，只在创建时用（[Extend attribute mappings](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/extend-application-attributes)）。
7. **只和自己上次发出的数据比，看不见目标端的漂移。** Census 的 Mirror 和 Hightouch 的 CDC 都只和「自己上次发出去的数据」比，目标端被人手工改过是看不到的，只能整体重同步（[Syncs](https://fivetran.com/docs/activations/syncs)，[Resync/Reset](https://hightouch.com/docs/syncs/resync-reset-clear)）。Okta 则说明 Workday 全量导入「是在两个系统之间做对账必须跑的」，常见做法是每周一次（[Okta: Workday](https://help.okta.com/en-us/content/topics/provisioning/workday/workday-provisioning.htm)）。这正好印证了决定 000040。

## 1. 核心对象模型

### 1.1 Okta Lifecycle Management

| 对象 | 是什么 |
| --- | --- |
| Okta user | Universal Directory 里的统一档案，所有应用的账号都挂在它下面 |
| App integration | 每接一个应用一个实例。Provisioning 页签分三块：**To Okta**（入站）、**To App**（出站）、**API Integration**（凭证） |
| AppUser profile | 这个人在某个应用里的档案。数据流向固定：上游应用档案 → Okta user → AppUser → 下游应用 |
| Mappings | Profile Editor 里两个方向的映射：**App to Okta User** 和 **Okta User to App** |
| Profile Sources | 档案来源的优先级列表，用箭头排序。只有最高优先级的来源能停用或暂停 Okta 用户 |
| Assignments | 人或组分配到应用，就进入出站开通的范围 |
| Import queue | 应用 **Import** 页签里待确认的导入用户 |

Workday 是 HR 源里做得最深的一个，有几处设计直接对应我们的北森（[Okta: Workday](https://help.okta.com/en-us/content/topics/provisioning/workday/workday-provisioning.htm)）：

- **三种导入并存**：Full（全量，「用来在两个系统之间做对账」，常见做法是每周一次）、Incremental（只取 Workday 标记为有变化的人，每天至少一次、最多每小时一次）、Real Time Sync（由 Workday 的业务流程推送，用于「立即解雇」这类讲时效的变更）。对应到我们就是：事件触发、定时增量、定期对账三层。
- **生命周期参数用业务语言表达**，都在 Integration 设置里：**Pre-Start Interval**（入职前几天导入并激活）、**Immediate Termination Reasons**（用正则匹配哪些离职原因走实时）、**Deactivate on Last Day of Work**（最后工作日后一天停用，而不是等离职日期）、**Timezone aware terminations**（按员工所在时区停用）、**Only Import Workers with Workday Accounts**、**Department Field**（部门取哪个字段，默认 Business Unit）。
- **生命周期事件**：New hire、Updates、Termination、Rehire（再入职时关联回被重新激活的 Okta 用户）。
- **入站匹配规则**（**User Creation & Matching**）：满足所选条件才算 exact match，可选条件有 Okta username format、Email 和 **The following attribute matches**（Workday 建议按 EmployeeID 匹配）；**Allow partial matches** 指姓名相同但用户名或邮箱不同；**Confirm matched users** 和 **Confirm new users** 决定匹配上的、新建的是否自动确认，不勾就进人工确认队列（[Configure provisioning](https://help.okta.com/oie/en-us/content/topics/provisioning/lcm/lcm-provision-application.htm)，[Match imported user attributes](https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-matching-imported-users.htm)）。
- **源头停用时怎么办**：**When a user is deactivated in the app** 可选 Do Nothing、Deactivate、Suspend；**When a user is reactivated in the app** 决定是否一并重新激活。
- **出站 To App**：**Create Users**（目标端已有同名用户就不建）、**Update User Attributes**（「目标应用里的修改会被 Okta 的值覆盖」，也就是源说了算）、**Deactivate Users**（取消分配或 Okta 停用时停用应用账号，重新分配时恢复）、**Sync Password**。

### 1.2 Okta Workflows

无代码的事件驱动流程：Flow 由一张 event card 加若干 action/function card 组成；还有 Folder、Table、Connection、Helper flow（被调用的子流程）、Delegated flow（可以委派给受限管理员在 Admin Console 里直接运行的流程）、Templates。触发方式有 Okta 事件、轮询（**Each record** / **No New Data** / **Every time**）、webhook、定时和 API endpoint（[Set data exchange options](https://help.okta.com/wf/en-us/content/topics/workflows/build/set-monitor-options.htm)，[Delegated flows](https://help.okta.com/wf/en-us/content/topics/workflows/learn/about-delegated-flows.htm)）。

它和 LCM 的分工（推断）：LCM 用声明式配置保证账号和属性一致，Workflows 处理围绕账号的副作用和例外逻辑，比如通知、转移文件、建工单、算一个复杂属性。Okta 文档没有像 Microsoft 那样明说这条边界，但两者的入口、对象和运维界面是完全分开的两套。

### 1.3 Microsoft Entra：HR 入站开通与 Lifecycle Workflows

| 对象 | 关键属性 |
| --- | --- |
| Provisioning app | 一个 HR 源对一个目标域一个实例。规则不同的人群（员工和外包、不同国家）各建一个；没有测试域时，官方建议建一个 *HR2AD (Test)* 指向测试 OU，先在它上面改映射，再搬到生产 app（[Plan cloud HR provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision)） |
| Provisioning job | Start、Stop、Restart；有 initial cycle 和 incremental cycle 两种周期，状态有健康、隔离（quarantine）、停用 |
| Attribute mapping | 按对象类型分组（Users、Groups），表格列为 **Source Attribute**、**Target Attribute**、**Mapping Type**、**Matching Precedence** |
| Target object actions | Create、Update、Delete 三个勾选框，决定这个作业允许做哪些动作 |
| Scoping filters | 子句之间是 AND，过滤器之间是 OR，共 14 种运算符 |
| Settings | **Prevent accidental deletions** 和阈值、**Notification Email**、作用域（Sync assigned / Sync all） |
| Provisioning logs | 每一次对源和目标的读写，加上读写的数据 |
| Provisioning agent | 本地 Windows 上的代理，负责写 AD；官方建议部署两台做高可用 |

单条映射的编辑框有这些字段（[Customize attribute mappings](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/customize-application-attributes)）：

- **Mapping type**：Direct、Constant、Expression（表达式最长 1 万字符）、LCW extensibility workflow、None（不改目标值，目标为空时才写默认值）。
- **Default value if null**：只在创建时生效，更新时不用。
- **Match objects using this attribute** 和 **Matching precedence**：可以设多个匹配属性，按优先级依次试，一旦命中就不再往下试。它不支持「两个属性组合起来匹配」；目标系统必须支持按这个属性查询；每个人至少要有一个匹配属性有值。
- **Apply this mapping**：Always，或 Only during object creation。

周期机制（[How provisioning works](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/how-provisioning-works)）：

- **Initial cycle**：拉取源的全部对象，按作用域过滤，再到目标里按匹配属性查。查不到就创建，查到就更新，然后缓存目标端的 ID（之后所有操作都用这个 ID，相当于建立了链接）。最后记下 watermark。
- **Incremental cycle**：只处理 watermark 之后变化的对象，通常每 20 到 40 分钟一次（[Check status](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/check-status-user-account-provisioning)）。离开作用域、在源里被停用的对象，会在目标里被停用。
- **改映射或作用域会自动触发一次新的 initial cycle**，所有对象重新评估；**Restart provisioning** 会清掉 watermark、escrow 和 quarantine，但不打断链接（要打断链接得调 Graph API）。

**Lifecycle Workflows** 是另一套对象：一个 workflow 由基本信息、tasks、execution conditions（trigger 加 scope）组成。触发方式有时间（如 `employeeHireDate` 前 7 天）、属性变化、组成员变化、长期未登录；默认每 3 小时评估一次。必须从模板创建，比如 *Onboard pre-hire employee*；每个租户最多 100 个 workflow。Microsoft 的原话是：HR provisioning 管账号的创建和属性更新，lifecycle workflows 提供额外的任务自动化（[Understanding lifecycle workflows](https://learn.microsoft.com/en-us/entra/id-governance/understanding-lifecycle-workflows)，[What are lifecycle workflows](https://learn.microsoft.com/en-us/entra/id-governance/what-are-lifecycle-workflows)）。

**API-driven inbound provisioning** 解决的是「我的 HR 系统不在官方列表里」的问题。任何工具（PowerShell、Logic Apps）把源系统的**完整记录**按 SCIM 格式批量上传到 `/bulkUpload`；「客户端不需要比对源和目标来决定该创建、更新、启用还是停用，这由开通服务自动完成」。之后的映射、作用域、匹配、日志都和官方连接器一样。限流为每 5 秒 40 次、每天 2,000 次（Governance 许可 6,000 次），每次最多 50 个操作（[API-driven inbound provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/inbound-provisioning-api-concepts)）。这实际上把「取数」和「收敛引擎」拆成了两层。

### 1.4 Census 与 Hightouch：sync 作为一等对象

**Census（Fivetran Activations）**：一个 sync 由五样东西组成：source（dataset、模型或直连数仓）、destination object、**sync behavior**、**sync key**、**field mappings**，外加调度（[Syncs](https://fivetran.com/docs/activations/syncs)）。

- **Sync behavior**：Update or Create（upsert）、Update Only、Create Only、Mirror（源里没有了就从目标删掉）、Append Only、Delete。
- **Sync key**：源和目标各提供一个「每条记录唯一」的标识字段。
- **字段映射**：可以自动加入同名字段，也可以手工配对。「从映射里移除字段后，只是不再更新它，不会删除已有的值。」还有条件映射：**Don't Sync Null Values**、**Set If Empty**（目标已有值就不覆盖）。
- 所有 sync 都是增量的；**Mirror 判断变化的依据是「已经发出去的数据」，而不是目标里实际存在的数据，所以第一次运行等于对所有记录做一次 upsert**。

**Hightouch**：model → sync，再配 sync type 和 mode（upsert、update、insert、mirror、archive，具体哪些可用由目的地决定）、record matching、field mapping、delete behavior、schedule（[Syncs overview](https://hightouch.com/docs/syncs/overview)）。

- **Record matching** 的界面是一句问话：*How should rows in your data model and records in the destination be matched?* 下拉框里只列目的地支持查询的字段，推荐的字段后面标 **(recommended)**。文档警告：匹配值重复或为空会导致匹配歧义、行被拒、产生重复记录（[Record matching](https://hightouch.com/docs/syncs/record-matching)）。
- **Delete behavior**：Do nothing、Clear fields、Delete destination record。只和上一次运行比较，补不了更早之前删掉的记录。
- **「可用的同步类型、模式、匹配键、字段、删除行为和限额，都由各个目的地定义」**：连接器要声明自己的同步能力，平台据此生成配置界面。

### 1.5 Celigo integration apps

Celigo 的基本结构是 integration（首页上一个卡片）→ 多个 flow（export → lookup/transform → import）→ 可复用资源（connection、export、import、script）。Integration app 是 Celigo 维护的「产品化集成」，和 template 的区别是（[Integration App vs Template](https://docs.celigo.com/hc/en-us/articles/235469468-Integration-App-vs-Template-in-integrator-io)）：

- Integration app 有修复、新功能、文档和领域支持；**受管组件被锁定**，以保证 Celigo 能升级它。
- Template 装好后完全解锁，可以随便改，但再也收不到升级。

用户面对的不是流程，而是一组**业务设置**。以 Shopify–NetSuite 为例（[Configure Shopify integration app settings](https://docs.celigo.com/hc/en-us/articles/115006107487-Configure-Shopify-integration-app-settings)）：

- 设置页按 Shipping、Payment、Tax、Order 等分页签。
- **Map Ship Methods** 是一张值映射表，找不到匹配时必须选一种处理：**Fail If Unique Match Not Found**、**Use Null as Default Value**、**Use Empty String as Default Value**、**Default Lookup Value**。
- **Shopify Order Ids** 输入框可以填最多 5 个订单号，保存即按需同步这几单。
- 匹配规则本身也是一个设置项，比如 Zendesk–NetSuite 的 *Find Zendesk Users in NetSuite using an email address*（[User Sync Settings](https://docs.celigo.com/hc/en-us/articles/228434008-Zendesk-Support-NetSuite-integration-app-User-Sync-Settings)）。

每条记录有一个 **trace key**（默认取源记录 ID，可以用模板自定义，比如把名称和编号拼在一起），用于自动关闭同一记录的重复错误、在报表和错误里按记录搜索（[Trace key](https://docs.celigo.com/hc/en-us/articles/360060740672-Set-a-custom-trace-key-to-uniquely-identify-a-record)）。

### 1.6 横向对照：同步作为一等对象时，用户配置的是什么

| 配置项 | Entra HR 入站 | Okta + Workday | Census / Hightouch | Celigo integration app |
| --- | --- | --- | --- | --- |
| 源对象 | Worker（按 WorkerID） | Worker + Provisioning Groups | 数仓模型的一行 | 源应用的一类记录 |
| 目标对象 | AD / Entra 用户 | Okta user，再到下游 AppUser | 目的地对象（如 Contact） | 目标应用的一类记录 |
| 匹配规则 | 多个匹配属性 + 优先级 | exact / partial + 自动或人工确认 | 一对 sync key | 一个设置项（如「按邮箱找」） |
| 字段映射 | Direct / Constant / Expression / 工作流算值；可选只在创建时写 | 两个方向；可选只在创建时写或创建和更新都写 | 列对字段、常量、模板；空值策略 | Mapper 2.0、值映射表、找不到时的处理 |
| 生命周期规则 | 状态映射到 accountEnabled；离开作用域即停用 | 提前几天开通、最后工作日停用、时区、再入职 | 由 sync behavior 决定，如 Mirror 删除 | 产品内置，如订单状态决定何时同步 |
| 冲突（谁说了算） | 源覆盖目标；Only during creation 的字段保留目标值 | 源覆盖目标；Profile Sources 优先级 | Set If Empty / Don't Sync Null | 由设置决定 |
| 作用域 | Scoping filters（AND/OR） | Workday 筛选项、组 | 模型的 SQL 或筛选 | 设置项 |
| 安全阈值 | Accidental deletions、quarantine | Import Safeguards（20%） | 告警，如模型行数异常 | 未查到 |
| 测试 | Provision on demand | Mapping Preview、导入确认队列 | Test a row、Dry Run | Test mode（逐条标记测试记录） |

七项里没有一项是「画流程」。引擎把「这个人现在该是什么样」翻译成动作，用户只描述期望状态和边界条件。

## 2. 搭建体验

### 2.1 Entra：从空白到第一个人开通

1. **Enterprise apps → 从 gallery 添加** *Workday to Active Directory User Provisioning* → **Provisioning** → 填管理凭证 → **Test Connection**，让 Entra 用这组凭证实际连一次（[How provisioning works](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/how-provisioning-works)）。
2. **Mappings**：默认映射已经预置好，按需改；表达式可以在 **Expression builder** 里选函数、选属性、填测试值，点 **Test expression**，结果显示在 **View expression output**（[Expression builder](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/expression-builder)）。部门对 OU 这类规则用 `Switch()` 写，例如按城市映射到 OU，找不到时落到默认 OU（[Plan cloud HR provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision)）。
3. **Scoping filters**：一个向导依次是 Scope Settings → Scope by assignment → Users and groups → Scope by attribute → Review。保存会触发全量重新评估，**已经在范围内、但被新过滤器排除的人会被停用**（[Scoping filters](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/define-conditional-rules-for-provisioning-user-accounts)）。
4. **Provision on demand**：Workday 场景输入 WorkerID 或 WID，点 **Provision**。结果分五步展示，每步都有 **View details**：
   - Test connection（只在失败时出现）
   - Import user：从源读到的属性
   - Determine if user is in scope：逐条列出范围条件的判断结果，格式是「过滤器名 属性 运算符 值」
   - Match user between source and target：命中的目标用户属性，多个属性就按优先级依次列出
   - Perform action：最终写出的属性；失败时显示的是「本来想写的属性」

   通常不超过 30 秒；后台一次只能处理一个人；OAuth 类应用必须先停掉作业才能用（[Provision on demand](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/provision-on-demand)）。
5. **启动**：官方建议超过 3 万人的租户分阶段跑 initial cycle：先用作用域过滤器圈一小批人，核对 AD 里的属性没问题，再逐步放大范围（[Plan cloud HR provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision)）。

部署指南还要求在动工前和 HR 一起把数据清理干净：匹配标识必须唯一且有值；用作用域过滤掉几十年的历史人事记录；超长字符串用 `Mid` 截断或用 `Switch` 缩写；必填字段为空时用表达式兜底（例如显示名为空就拼姓和名）。这些都是「设计期就能发现的错误」，和我们备忘里的原则一致。

### 2.2 Okta + Workday

1. 在 Workday 里建集成用户（勾选 **Do Not Allow UI Sessions**），授予一组列明的域权限。
2. Okta 里 **Provisioning → Configure API Integration**，填 API 用户名、密码、WebServices Endpoint，点 **Test API Credentials**。
3. **To Okta**：设置导入计划、匹配规则、Profile Sourcing，再到 **Directory → Profile Sources** 把 Workday 拖到最高优先级。
4. **官方建议先手动导入一次，按这次的结果再定计划**；人数多会让导入变慢，所以不要排得太密（[Okta: Workday](https://help.okta.com/en-us/content/topics/provisioning/workday/workday-provisioning.htm)）。
5. 手动导入走 **Import → Import Now**，选全量或增量。导入完成后，每个人旁边有一个下拉框可以改判：**Exact**、**New**、**Existing**（手工指定对应的 Okta 用户）、**Ignore**；勾选后点 **Confirm Assignments**，可以同时勾 **Auto-activate users after confirmation**（[Confirm imported assignments](https://help.okta.com/en-us/Content/topics/directory/ad-agent-confirm-user-assignments.htm)）。
6. 映射在 Profile Editor 里改：点 **Preview**，输入一个用户就能看到每个字段映射后的值。绿色表示有效（包括有效但为空），红色表示无效并附错误信息。保存时提示 **Save Mappings and Apply updates now**（[Map attributes](https://help.okta.com/en-us/Content/Topics/users-groups-profiles/usgp-map-attributes.htm)）。

确认队列是一个「人在环上」的匹配审核，适合第一次接入时存量账号多、匹配不确定的情况。代价是：**Clear Unconfirmed Users** 只能一次清空整个队列，不能挑着删，清错了得重跑全量导入来恢复（[Clear unconfirmed users](https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-clear-unconfirmed.htm)）。

### 2.3 Census / Hightouch

Hightouch 的搭建界面（[Syncs overview](https://hightouch.com/docs/syncs/overview)，[Field mapping](https://hightouch.com/docs/syncs/mapping-data)）：

- **Suggest mappings** 按名称相似度自动配对，比如 `email_address` 对 Email。文档自己承认这样会配错，要求人工复核。
- 目的地的必填字段带星号。
- 每条映射可以单独设空值策略：**Always sync**（默认，可能覆盖已有数据）、**Don't sync null values**、**Only write to empty fields**。
- Liquid 模板映射有 **Test template**，用最多 5 行样例数据显示输出，以及模板是否解析成功。
- **Test a row**：选一行**真实发送**到目的地；发送前可以点铅笔改这一行的值（用于匹配的列除外）；默认按钮是 **Sync as added row**，菜单里还能按变更行、删除行发送；请求和响应并排显示在这一行旁边。

Census 的 **Start Dry Run** 按钮在 sync 概览页上，第一次运行之前就能点。结果分两组，历次预演都留在 **Sync History** 里可以回看（[Sync Dry Runs](https://fivetran.com/docs/activations/syncs/sync-monitoring/sync-dry-runs)）：

- 源：Total records、Records changed、Records invalid。
- 目标：Records before、Records after、Expected creates、Expected updates、Expected deletes。

此外，Census 在发送前会先把 sync key 为空、重复的记录标为 invalid 并过滤掉，和目的地拒收的 rejected 记录分开计数（[Syncs](https://fivetran.com/docs/activations/syncs)）。

### 2.4 Celigo integration app

1. **Marketplace → Install** 之后，首页卡片上出现 **Click to continue setup**。
2. Setup 页是一张逐项清单：**Click to Configure** 配连接 → **Test** → 显示 *Connection is working* → 状态变成 **Configured**；对方系统里要装的包点 **Click to Install**，装完回来点 **Verify Now**，状态变成 **Installed**（[Install Salesforce–NetSuite](https://docs.celigo.com/hc/en-us/articles/360026938651-Install-Salesforce-NetSuite-IO-integration-app)）。
3. 进入 **Settings** 页签，按业务开关配置。
4. 测试有两种方式：
   - 在独立的非生产环境装一份，license 不另算（[Install across environments](https://docs.celigo.com/hc/en-us/articles/360050418152-Install-and-manage-integration-apps-across-environments)）。
   - 打开 **Enable test mode**：只有在源记录上勾了 *Send as test record to IO* 的记录才会同步，可以在生产上只放行几条测试数据（[Test mode](https://docs.celigo.com/hc/en-us/articles/360054609012-Test-your-Salesforce-NetSuite-records-using-Test-mode)）。

Mapper 2.0 的设计（[Mapper 2.0](https://docs.celigo.com/hc/en-us/articles/4536629083035-Mapper-2-0)，[Destination field settings](https://docs.celigo.com/hc/en-us/articles/10115705577755-Mapper-2-0-Destination-field-settings)）：

- 左右两栏：一边是源的样例数据，一边是目标结构；必填字段带挂锁图标，可以只看必填或只看已映射的字段。
- **Auto-populate destination fields** 生成目标结构，**Auto-map destination fields** 由 Celigo AI 自动配对，不覆盖已有的映射。
- Lookup 分 Dynamic（运行时去目标系统查）、Static（预先填好的值对照表）和 Lookup cache；可以命名并在其他 flow 复用。
- **If lookup fails** 默认是 **Fail record**，也可以改成空串、null 或自定义默认值。

### 2.5 Okta Workflows

在 Workflows Console 里 **+New Flow** → **Add Event** 选应用事件 → 添加 action 或 function card → 把上一张卡的输出拖到下一张卡的输入（类型要一致）。

- 每张卡可以单独测试，用来确认映射是否正确。
- 整条流程有两种测法：点 **Run** 在弹窗里手工填事件数据；或者打开开关，在源系统里真的触发一次（开关打开后要等约 60 秒才生效）。
- 运行时每张成功的卡会打勾并显示耗时（[Build and test a flow](https://help.okta.com/wf/en-us/content/topics/workflows/workflows-build-a-flow.htm)）。

### 2.6 复用

- **Entra**：映射和 schema 可以通过 Graph 导出成 JSON 再导回；**Restore default mappings** 一键恢复默认，但会强制所有用户重新同步，官方建议先把 Provisioning status 关掉。
- **Okta Workflows**：flow 和 folder 可以导出成文件。导出会去掉所有连接信息和表格数据，导入后要重新绑定；跨文件夹引用的 helper flow 会提示缺失（[Export and import](https://help.okta.com/wf/en-us/content/topics/workflows/build/export-import-flows.htm)）。
- **Hightouch**：Git Sync 把 model 和 sync 双向同步成 YAML，仅 Business 版（[Git Sync](https://hightouch.com/docs/extensions/git-sync)）。
- **Census**：并入 Fivetran 后，workspace 克隆、模板和变量都停了，改让用户用 Terraform（[Census Migration FAQ](https://fivetran.com/docs/activations/census-migration-faq)）。
- **Celigo**：integration app 对 template 的取舍见 1.5；named lookup 可跨 flow 复用。

## 3. 运行与运维

### 3.1 按业务数据查一个人

| 产品 | 在哪查 | 能按什么搜 | 保留多久 |
| --- | --- | --- | --- |
| Entra | Provisioning logs | 用户名，或源、目标任一侧的标识 | 30 天（服务端不保存 30 天以上的数据），可导出到 Log Analytics |
| Okta LCM | Reports → Import Monitoring | 按应用、状态筛选，点 View 进 System Log | 7 天 |
| Okta Workflows | 每个 flow 的 Execution History | 在执行数据里全文搜索（*Search text within execution...*，支持 AND、OR、通配） | 30 天，前提是打开了「保存执行数据」 |
| Census | Sync History → **View Records** | 按 sync key 搜，按 Invalid、Rejected 筛 | 14 天，可以存到自己的对象存储里长期保留 |
| Hightouch | Runs → **View run** | 按主键搜；看每行的请求和响应 | 逐行日志 7 天，运行摘要 30 天；Warehouse Sync Logs 可长期保留 |
| Celigo | 错误页 | trace key 单独成列，支持全文搜索 | 默认 30 天，按套餐最长 180 天 |
| Entra LCW | Workflow history → Users summary | 按人、状态、执行类型筛 | 筛选范围最长 30 天 |

来源：[Provisioning logs](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-provisioning-logs)，[Import Monitoring](https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-view-import-monitoring-dashboard.htm)，[Execution history](https://help.okta.com/wf/en-us/Content/Topics/workflows/execute/execution-history-view.htm)，[Sync Tracking](https://fivetran.com/docs/activations/syncs/sync-monitoring/sync-tracking)，[Debugger](https://hightouch.com/docs/syncs/debugger)，[Errors page](https://docs.celigo.com/hc/en-us/articles/10080012410651-Errors-page-troubleshoot-and-retry-open-errors)，[LCW history](https://learn.microsoft.com/en-us/entra/id-governance/lifecycle-workflow-history)。

Hightouch 的 **Warehouse Sync Logs** 最值得注意。它在客户自己的数仓里写三张表（[Warehouse Sync Logs](https://hightouch.com/docs/syncs/warehouse-sync-logs)）：

- `sync_changelog`：每一次操作。
- `sync_snapshot`：每一行在最近一次运行后的当前状态。
- `sync_runs`：每次运行的计划数和成功数、失败数。

字段有 `row_id`、`op_type`（added/changed/removed）、`status`、`failure_reason`、`fields`。官方举的用法包括找出反复失败的「抖动行」。`sync_snapshot` 本质上就是「每个业务键一行的同步状态表」。

### 3.2 一条记录怎么呈现

- **Entra**：日志列表的列是 Identity、Action（Create、Update、Delete、Disable、StagedDelete、Other；Other 包括「两边已经一致，什么都没做」）、Source System、Target System、Status（Success、Failure、Skipped、Warning）。点开后有四个页签（[Provisioning logs](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-provisioning-logs)）：
  - **Steps**：导入 → 匹配 → 判断范围 → 同步前评估 → 执行。
  - **Troubleshooting & Recommendations**：错误码和原因。
  - **Modified Properties**：每个字段的旧值和新值。
  - **Summary**：两侧的标识。
- **Hightouch**：运行摘要分阶段显示（*Preparing to sync*、*Querying source*、*Syncing to destination*、*Wrapping up*），操作数分 added(+)、changed(△)、removed(−)；**Successful** 和 **Rejected** 两个页签逐行列出主键和目的地返回的错误；点一行打开 live debugger，看完整的请求和响应（[Debugger](https://hightouch.com/docs/syncs/debugger)）。
- **Census**：每条记录显示主键、状态（Invalid、Rejected、Success，invalid 又细分为 NULL 和 DUPLICATE）、原因和源数据；**没有字段级的旧值和新值，也没有目的地的响应**（[Sync Tracking](https://fivetran.com/docs/activations/syncs/sync-monitoring/sync-tracking)）。
- **Entra LCW**：同一份历史可以从三个视角看：Users summary（处理了谁）、Runs summary（每次运行）、Tasks summary（每个任务）。状态里有一条很细的设计：「排队时人还在范围内，**临执行前资料变了、不再满足条件**，这次处理就取消」，也就是执行前会重新评估一次（[LCW history](https://learn.microsoft.com/en-us/entra/id-governance/lifecycle-workflow-history)）。

### 3.3 错误聚合

- **Entra** 分两层：
  - 单个对象写失败进 escrow，下一个周期自动重试，重试会逐渐变稀。
  - 整个作业大面积失败就进 quarantine，周期降到每天一次。判断规则大致是：失败超过 5,000 条才开始评估，失败比例超过 40% 或失败数超过 4 万条就隔离；Manager 这类引用失败不计入；超过 6 万条无条件隔离。隔离后在第 6、12、24 小时重试，之后每天一次，连续 28 天不恢复就停用作业（[Quarantine](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/application-provisioning-quarantine-status)）。
- **Celigo** 的错误页本身就是一个工作台（[Errors page](https://docs.celigo.com/hc/en-us/articles/10080012410651-Errors-page-troubleshoot-and-retry-open-errors)）：
  - 列表的列有 Timestamp、Message、Classification（Connection、Duplicate、Rate limit、Too large、Missing、Parse、Value）、Code、Source（外部应用名，或平台内部的组件，如 Mapping、Hook、Lookup）、Assign、Tag、Trace key。
  - 可以按来源、分类、负责人、标签筛选。
- **Celigo 的自动关闭**（[Resolve errors](https://docs.celigo.com/hc/en-us/articles/16182564553371-Resolve-errors-automatically-or-manually)）：开启 *Auto-resolve errors with the matching trace key* 后，同一条记录后来处理成功了，或者出现了更新的错误，旧错误就自动标为 Auto-resolved；间歇性错误在 30 秒、1 分 30 秒、3 分 30 秒、7 分 30 秒各自动重试一次。仪表板上 Auto-resolved 和 User-resolved 分两列统计（[Integration dashboard](https://docs.celigo.com/hc/en-us/articles/7326016708763-Explore-the-integration-dashboard)）。
- **Hightouch** 用 sync health 汇总：Healthy、Warning（有行被拒）、Pending、Disabled。有行被拒的运行算 *Completed with errors*，只有查询失败这类整体错误才算 Failed。

### 3.4 重试、重放、改数据后重试

- **Entra**：失败的对象在后续周期自动重试，重试会逐渐变稀；管理员到日志里查原因，修好源数据或映射（[How provisioning works](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/how-provisioning-works)）。文档里没有提到「立即重试这个人」的入口，修好后只能等下个周期，或者用 Provision on demand 单独推一次（推断）。
- **Okta LCM**：**Dashboard → Tasks** 里列出开通失败的任务，修好原因后勾选，点 **Retry Selected**（[Troubleshoot provisioning](https://help.okta.com/oie/en-us/Content/Topics/Provisioning/lcm/troubleshooting.htm)）。没开通成功的人在应用的 **Assignments** 页签里带一个红色感叹号，点 **Provision User** 单独开通（[Provision users](https://help.okta.com/oie/en-us/content/topics/provisioning/lcm/lcm-provision-unprovisioned-users.htm)）。
- **Hightouch** 两层自动重试（[Retries](https://hightouch.com/docs/syncs/retries)）：
  - 同一次运行内指数退避，默认最多 5 次；400、401、403、422 不重试。
  - 记下每一条被拒的记录，以后每次运行都重试，不限次数，直到成功或者它不再出现在模型结果里。
- **Segment**（作为对照）：重试失败记录之前，先读取源里的最新数据，保证不把过时的数据写进目标（[Segment: Manage Reverse ETL](https://static0.twilio.com/docs/segment/connections/reverse-etl/manage-retl)）。这和决定 000042 的思路一致。
- **Celigo** 的「改数据后重试」做得最完整（[Errors page](https://docs.celigo.com/hc/en-us/articles/10080012410651-Errors-page-troubleshoot-and-retry-open-errors)，[Retries](https://docs.celigo.com/hc/en-us/articles/10107073900571-Monitor-and-manage-retries)）：
  - 右侧详情里只有 **Retry data** 可以编辑，其余是 Request、Response 等只读信息。
  - 有人改过重试数据但还没重试的错误，在勾选框旁边显示一个蓝点，并且跨会话保留。
  - 一次可以重试当前页（最多 1,000 条），或者 **Manage all → Retry All** 重试整个列表（最多 2 万条）。
  - **Retries** 页签记录每一批重试的发起人（自动重试显示 *Auto-retried*）、成功数、忽略数、错误数，进行中的可以 **Cancel retry**，已处理的不回滚。
- **Okta Workflows**：卡片级的 **Retry** 只对 HTTP 429 生效；失败后的去向（**Then**）有三种：**Halt Flow**、**Return Values**、**Run another Flow**（[Set error handling](https://help.okta.com/wf/en-us/Content/Topics/workflows/build/set-error-handling.htm)）。没有「从失败处重跑这次执行」的功能，只有 API endpoint 流程里显式放了 Pause 卡片的，才能用 Resume URL 继续。

### 3.5 告警和安全阀

- **Hightouch** 的告警按触发器配置：Fatal errors、Rejected rows、Sync throughput（7 天没有活动）、Model or Audience Size（行数异常，说明上游逻辑坏了）、Sync duration。
  - **只在状态切换时通知一次，并发恢复通知**，不是每次运行都发。
  - 可以在目的地级设默认值，在单个 sync 上覆盖；可以静音一小时、一天或一直静音。
  - 渠道有邮件、Slack、PagerDuty、短信、Webhook（[Alerting](https://hightouch.com/docs/syncs/alerting)）。
- **Celigo** 每 15 分钟检查一次新出现的错误和新关闭的错误，汇总成一封邮件；自动关闭掉的错误如果还没通知过，就不再通知；另有「连接离线、恢复在线」的订阅（[Notifications](https://docs.celigo.com/hc/en-us/articles/8864920211355-How-integrator-io-determines-when-to-email-an-error-notification)）。
- **Okta Workflows** 的轮询有一种 **No New Data** 模式：「这段时间什么都没来」本身就能触发流程，可以用来发现上游静默。
- **大批量停用或删除的闸门**：
  - Okta Import Safeguards：分应用级和组织级，默认 20%，应用级只对超过 100 人的应用生效。超限就停止导入，在 Import Monitoring 里二选一：**Resume All Imports**，或 **Cancel the Affected Import and Resume Other Imports**（[Resolve safeguard warnings](https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-resolve-import-safeguard.htm)）。
  - Entra accidental deletions：每个周期分别计算，超过阈值就把作业隔离并发邮件。开通页显示 *Provisioning has been quarantined*，按钮有 **Allow deletes** 和 **View provisioning logs**；被拦下的对象在日志里的 Action 是 StagedDelete。
  - Hightouch 对 Journey 的同步有 *Unexpected Sync Volume*：一次要发的人数超过进入节点人数的两倍且多出 1,000 行以上，就直接 STOP。

## 4. 生命周期：环境、版本、发布、回滚、协作、影响分析

| 产品 | 环境 | 版本与回滚 | 发布与审批 | 影响分析 |
| --- | --- | --- | --- | --- |
| Entra provisioning | 没有内置环境；官方建议另建一个测试 app 指向测试 OU | 映射没有版本；改映射即全量重新评估 | 没有 | 没有；「先停作业再恢复默认」只是一条操作建议 |
| Entra LCW | 无 | 改任务或范围会生成新版本；历史按版本分开记录 | 无 | Security Copilot 可以对比两个版本的差异 |
| Okta Workflows | 跨组织靠导出导入 | 2026.07 开始提供版本历史（EA），2026.08.4 GA：保存即生成版本，可回到旧版本但不改连接；命名版本保留 90 天，未命名 30 天（[Version history](https://help.okta.com/wf/en-us/content/topics/workflows/build/version-history.htm)） | 文件夹级 RBAC，2026.05 GA | 导出时提示缺少的引用 |
| Hightouch | 多个 workspace，靠 Git Sync 共享 YAML | Git 提交即版本，可回滚 | **Approval flows**：草稿 → 提交审批，审批人看配置差异再批准；模型和 sync 都发布后才能运行（[Approval flows](https://hightouch.com/docs/workspace-management/approval-flows)） | 无 |
| Census | 模板和变量已停用，改用 Terraform | 无 | 无 | 无 |
| Celigo | 多环境，每个环境资源相互隔离 | ILM：clone → pull（Review Changes 显示差异）→ merge；revision 分 snapshot、pull、revert 三种，可以回到其中任一个（[ILM terminology](https://docs.celigo.com/hc/en-us/articles/6661875290523-Integration-Lifecycle-terminology)） | pull 需要目标环境的 Manage 权限 | Ora 可以模拟「删掉这个连接会坏掉什么」（[Ora use cases](https://docs.celigo.com/hc/en-us/articles/48311776508955-Celigo-Ora-use-cases-and-prompts)） |

**按需开通、隔离与回滚**，单独看一下：

- **按需开通**：
  - Entra 的 on demand 会照常评估作用域，并把评估过程展示出来。
  - Entra LCW 的 **Run on demand** 则**完全不看执行条件**，对谁都执行任务（[Understanding LCW](https://learn.microsoft.com/en-us/entra/id-governance/understanding-lifecycle-workflows)）。同一家公司的两个「按需」语义相反，容易误伤。
  - Celigo 用设置项输入最多 5 个 ID；Okta 在分配列表里逐人点 **Provision User**。
- **隔离**有三个粒度：作业级（Entra quarantine）、批次级（Okta safeguard、Entra StagedDelete）、记录级（Celigo test mode 的逐条标记、Entra escrow）。
- **回滚**：配置层有版本可回，比如 Okta Workflows、LCW、Hightouch Git、Celigo revert；数据层一律没有。Entra 的回滚建议原文是三步：看日志确定哪些人被做了错误操作、确定他们最后一次正确的状态、和应用负责人一起手工改回去（[Plan cloud HR provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision)）。**Modified Properties 里的旧值，是唯一的回滚依据**。

## 5. 治理

- **权限**：
  - Entra 按角色分工：Application Administrator 配开通，Hybrid Identity Administrator 装代理，Lifecycle Workflows Administrator 管工作流。
  - Okta Workflows 2026.05 起有五个文件夹角色（Folder Manager、Editor、Runner、Reader，以及 Integration Builder）；**Delegated flow** 让只有「Run delegated flow」权限的管理员在 Admin Console 里运行指定流程，不必开放整个 Workflows（[Release notes](https://help.okta.com/wf/en-us/content/topics/releasenotes/workflows/production.htm)，[Delegated flows](https://help.okta.com/wf/en-us/content/topics/workflows/learn/about-delegated-flows.htm)）。
  - Celigo 分 Monitor 和 Manage 两级；Monitor 用户经管理员授权可以编辑重试数据；官方建议给业务部门开 Monitor 级账号来接收通知，并给这些账号配组邮箱（[Notifications](https://docs.celigo.com/hc/en-us/articles/8864920211355-How-integrator-io-determines-when-to-email-an-error-notification)）。
  - Hightouch 有 Workspace draft editor 角色，这个角色的改动必须走审批。
- **凭证归属**：
  - Okta 对 Workday 用一个专用集成用户，勾 **Do Not Allow UI Sessions**，可以用受限的安全组把它限制在部分组织范围内。
  - Entra 的代理用 gMSA 访问 AD。
  - Celigo 的 integration app 绑定具体实例：不能把连接从一个 Shopify 店或 NetSuite 账号换到另一个，只能换成同一家公司的另一个用户（[Install across environments](https://docs.celigo.com/hc/en-us/articles/360050418152-Install-and-manage-integration-apps-across-environments)）。
- **数据策略**：
  - Entra 开通服务不保存 30 天以上的数据；本地代理的 Windows 事件日志里可能有个人信息，官方建议用计划任务 48 小时内清掉。
  - Hightouch 默认不在自己那边存数据，写在客户的数仓和存储桶里（创始人在 [Launch HN](https://news.ycombinator.com/item?id=29188544) 中的说法）。
- **审计**：
  - Entra 的 provisioning logs 由系统生成，不能修改或删除。
  - Celigo 的审计日志记录变更来源（UI、Ora、API），以及字段的旧值和新值。

## 6. 连接器策略

- **Entra**：
  - gallery 里大多数应用走 SCIM 2.0。
  - 本地系统通过 ECMA 代理转成 LDAP、SQL、REST/SOAP、PowerShell 调用。
  - HR 源只有 Workday 和 SuccessFactors 两个深度连接器，其余都走 API-driven inbound。
  - 目标端的属性列表要预先配置好，因为「大多数应用的用户管理 API 不支持 schema 发现」（[Customize attribute mappings](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/customize-application-attributes)）。
- **Okta**：
  - OIN 里的 SCIM 应用，加上少数「深连接器」。Workday 连接器带了一整套 HR 语义参数，见 1.1。
  - Workflows 的 **Integration Builder** 2026.09 GA，取代原来的 Connector Builder；可以导入 OpenAPI 3.0 以上的规范，自动生成认证和每个端点的基础流程，再逐个点 **Generate flow**（[Integration Builder](https://help.okta.com/wf/en-us/content/topics/workflows/integration-builder/integration-builder.htm)，[Generate core flows from an OpenAPI spec](https://help.okta.com/wf/en-us/content/topics/workflows/integration-builder/api-spec-core-flows.htm)）。
- **Census / Hightouch**：目的地数量是卖点，但真正决定体验的是每个目的地声明的能力：支持哪些模式、哪些字段可以作匹配键、删除怎么处理、限额多少。
- **Celigo**：几百个「应用连接器」，本质上是建在通用 HTTP / GraphQL 连接器之上的简化表单。同一个连接可以在 Simple 表单和 HTTP 表单之间切换，需要细调时直接下钻到原始 HTTP 配置（[Choose a connector](https://docs.celigo.com/hc/en-us/articles/10841316566043-Choose-between-an-application-or-a-universal-connector)）。Integration app 则是在连接器之上再打包一层业务设置，由 Celigo 负责升级。升级时要求所有连接在线，有手工步骤的会逐步引导，中断后可以继续（[Upgrade](https://docs.celigo.com/hc/en-us/articles/11432858485659-Upgrade-your-integration-app)）。

## 7. AI 能力：现在实际能做到什么

- **Okta**：
  - Workflows 和 LCM 没有原生的 AI 搭建或诊断。2025–2026 年的 Workflows 发布说明里没有 AI 条目（[Release notes](https://help.okta.com/wf/en-us/content/topics/releasenotes/workflows/production.htm)）。
  - Okta 开发者布道师 2025 年 9 月的做法是：把 flow 导出成 JSON，贴给 ChatGPT、Gemini 或 Claude，问它「这个 flow 做了什么」，理由是「也许搭它的人没写文档」（[maxkatz.net](https://maxkatz.net/2025/09/03/how-to-use-ai-to-describe-what-an-okta-workflows-automation-does/)）。
  - Okta 这两年的 AI 发布集中在「给 AI agent 做身份和访问治理」（[IDMWorks: Oktane 25](https://www.idmworks.com/insight/oktane-2025/)，[SiliconANGLE 2026-09](https://siliconangle.com/2026/09/22/okta-adds-ai-agent-runtime-gateway-forms-blueprint-alliance-with-aws-and-crowdstrike/)）。
- **Microsoft Entra**：Security Copilot 能用自然语言处理 Lifecycle Workflows（[Security Copilot for LCW](https://learn.microsoft.com/en-us/entra/security-copilot/entra-lifecycle-workflows)），注意几个边界：
  - 新建 workflow 时它只**给出分步指引**，由人去后台照着建。
  - 能列出现有的 workflow、模板和设置。
  - 能汇总运行情况，比如「过去 7 天哪些用户处理失败」「哪个任务失败最多」。
  - 能比较两个版本改了什么。
  - 没查到它能用在 provisioning 的映射和作用域上。
- **Hightouch**：
  - 搭建环节的 **Suggest mappings** 只是按名称相似度配对。
  - AI 投入在营销侧（AI Decisioning、Agents），和同步配置无关。
- **Census**：AI Columns 用大模型给数仓里的数据补列，结果写回数仓，属于数据加工，不碰同步配置（[AI Columns](https://fivetran.com/docs/activations/datasets/smart-columns/ai-columns)）。
- **Celigo Ora**（BETA）是这一组里唯一深入运维环节的（[Ora overview](https://docs.celigo.com/hc/en-us/articles/25951095481755-Celigo-Ora-overview)，[Ora in error management](https://docs.celigo.com/hc/en-us/articles/51210588304155-Error-management-with-Celigo-Ora)）：
  - 能用对话创建和修改 flow、mapping、过滤器；**所有改动先暂存成草稿，人批准后才生效**。说「先别改」就切换到只出方案的模式。
  - 在单条错误上点 Ora，它会自动带上错误详情、flow 上下文和**最近的配置改动**，给出原因摘要、可能的根因和分步建议。
  - 可以用一句话批量修正重试数据，比如「把 X 换成 Y 再重试」。Ora 先拿一批真实失败记录做验证，再把修正暂存起来逐条接受；目前没有「全部接受」。
  - 文档自己写明的局限：不能推断业务规则（谁是权威源、用 upsert 还是 update、重复记录怎么处理），遇到这类问题会反问；**改配置之前不做快照，也没有内置回滚**，官方建议先克隆一份，在克隆上让 Ora 改，再用 ILM 合并回来。
  - Mapper 2.0 的 **Auto-map** 由 Celigo AI 提供，不覆盖已有的映射。

## 8. 用户真实的称赞和抱怨

**抱怨**

- **测一个人，结果全量开通了。** 「我们配置 Workday 作数据源，用 on demand 建了一个用户。用户建成功了，但它把 Workday 里全部 15K 个用户也建了。我们想回滚，只建满足作用域条件（first name = test）的人。」采纳的答案确认**没有内置回滚**，只能暂停作业、用脚本删人、改作用域后重启（[Microsoft Q&A, 2024-02-20](https://learn.microsoft.com/en-us/answers/questions/1540874/how-to-roll-back-the-synced-users-from-workday-to)）。
- **离职即出范围，只有一次机会改他的数据。** 用户想在员工离职时清掉他的经理字段，但员工一被标为非在职就落到作用域之外，「我们只有一次机会更新这个人的记录」。帖子一直没有解决（[Microsoft Q&A, 2022-11-04](https://learn.microsoft.com/en-us/answers/questions/1075186/how-can-i-unset-a-worday-to-azure-ad-user-provisio)）。
- **跳过原因看不懂。** 有人提问未来入职的员工被跳过，显示 *NotEffectivelyEntitled* / *IsActive: False*（[2026-06](https://learn.microsoft.com/en-us/answers/questions/5601366/workday-to-ad-provisioning-future-hire-employees-s)）；有人按需开通时得到 *RedundantExport*，字段却没有更新（[2025-05](https://learn.microsoft.com/en-us/answers/questions/2277702/wd2ad-provisioning-mapping-not-updating-accountexp)）。
- **告警说有错，日志里却找不到。** 一个问题的标题就是「我们几乎每周都收到同步出错的告警邮件，但日志里没有错误」（[2024-12-27](https://learn.microsoft.com/en-us/answers/questions/2129951/weve-detected-an-error-while-synchronizing-to-ente)）。
- **唯一账号名生成失败就卡住。** 候选的 samAccountName 或 UPN 全都被占用时，记录进 escrow，原因只写在审计日志里（[2026-06](https://learn.microsoft.com/en-us/answers/questions/5915495/unique-samaccountname-upn-generation-is-it-possibl)）。
- **组织调整一来，下游权限就断了，而且没人知道。** Okta 用户描述：HR 一次重组拆分了 AD 组，下游的 GitHub 团队被清空，「没有任何通知系统」，开发者丢了仓库权限；他想要「删除的缓冲期」，等迁移做完再真正删除，但「只看到 import safeguards，它只是一个固定阈值，对我们不够」（[Okta devforum, 2025-07-10](https://devforum.okta.com/t/manual-control-of-group-deletion-from-ad/33917)）。
- **反向 ETL 的难点在目标端 API。** Fivetran CEO 解释为什么没有自己做：「Fivetran 是把细管子（API）接到粗管子（数据库），Census 是把粗管子接到细管子」，技术难点完全不同。另一位用户说：「反向 ETL 本质上是从 SQL 到 API，数据对不对是别人的头疼事……它是一个高流失的功能型产品。」还有用户嫌这类工具「贵得离谱」，也有 Census 客户追问收购后要不要在 Fivetran 里重建所有 sync（[HN, 2025-05-01](https://news.ycombinator.com/item?id=43860108)）。
- **流程搭完就没人看得懂。** Okta 布道师推荐用外部 AI 解读 flow，理由是「也许搭它的人没写文档」（[maxkatz.net](https://maxkatz.net/2025/09/03/how-to-use-ai-to-describe-what-an-okta-workflows-automation-does/)）。
- **厂商文档里自己承认的坑。** Celigo ILM 的 pull 预览里，如果同一个组件同时显示为 Removed 和 New，「不要继续，否则可能删除 flow、产生重复」（[ILM pull](https://docs.celigo.com/hc/en-us/articles/6685876051099-Pull-changes-from-one-integration-to-another)）；Ora 改错了生产 flow「没有内置的回退办法」。

**称赞**

- 「我们用 Workday 到 AD 的开通已经稳定跑了一年多」（[Microsoft Q&A, 2023-08-29](https://learn.microsoft.com/en-us/answers/questions/1352101/workday-to-on-prem-active-directory-automatic-user)），后半句接着报了一个属性偶发不映射的问题。
- Hightouch 用了近一年的客户：「团队和产品都很棒」（[HN, 2021-11-11](https://news.ycombinator.com/item?id=29188544)）。当时 Hightouch 自述的差异点正是 live debugger、告警和 Git 版本管理。
- Census 被收购时，有用户评价它「产品很棒，人也很好」（[HN, 2025-05-01](https://news.ycombinator.com/item?id=43860108)）。
- Celigo 的第三方评价原文未查到（评测站全部被拦）。

## 9. 对我们的启示

### 9.1 值得借鉴的设计（画到能直接出界面）

**A. 「同步」配置页：一屏表单，不是画布。** 首发主线的工作流核心是一个「确保一致」节点。点开它，右侧是七段式配置，顺序和 Census、Entra 一致。

1. **源**：北森·员工。业务键为工号，复用 v3 的「业务键」概念，这里只读显示。
2. **目标**：飞书·通讯录用户。
3. **怎么认出同一个人**：匹配规则列表，每行是「北森字段 = 飞书字段」加优先级，可以拖动排序，比如工号对飞书的工号字段优先、手机号其次（飞书哪些字段能按值查询，待连接器核实）。
   - 下拉框里只列连接器声明「可以按它查询」的字段，借鉴 Hightouch 和 Entra。
   - 行尾显示当前样本里这个字段的空值率和重复数。重复的直接标红，并提示「这 3 人将被判为无效，不会处理」，借鉴 Census 的 invalid 预检。
4. **谁在范围内**：条件构造器，条件之间 AND，条件组之间 OR，借鉴 Entra。右上角实时显示「当前命中 1,284 人」。
5. **字段**：映射表，列为目标字段（类型、必填带锁）| 来源（字段、常量、映射表、表达式）| 写入时机（创建和更新 / 仅创建）| 空值时（写空 / 跳过 / 仅当目标为空才写）。
   - 部门这一行走「北森部门 → 飞书部门」映射表，必须选「找不到时：失败 / 放到默认部门 / 跳过这个字段」，借鉴 Celigo 的 Map Ship Methods 和 If lookup fails。
6. **生命周期**：用业务语言的单选和数字框，借鉴 Okta Workday 的 Integration 设置。
   - 入职：入职日前 [3] 天开通，开通时账号状态为 [启用 / 停用]。
   - 离职：[离职日当天 / 最后工作日次日] 停用；[N] 天后 [保留 / 删除]，首发可以只做停用。
   - 调岗：移动部门。
   - 再入职：工号不变时 [恢复原账号 / 新建]。
7. **安全**：本轮停用超过 [5] 人或 [3]% 时暂停等确认，借鉴 Okta 和 Entra；目标被人工改过时，[以北森为准覆盖 / 保留飞书值并记为差异]。

**B. 「试一个人」抽屉。** 配置页右上角放一个按钮，输入工号或姓名，出现五步时间线，每步可以展开，直接对应 Entra 的 Provision on demand：

1. 读取北森：列出取到的字段。
2. 是否在范围：每个条件一行，「部门 包含 研发 → 通过（实际值：深圳研发中心）」。
3. 在飞书中匹配：按优先级逐个试，显示命中的账号卡片；没命中写「将新建」。
4. 计划动作：创建、更新、停用或无变化，加一张字段差异表（旧值 → 新值）。
5. 执行：默认是「只预览」；勾选「写入飞书」才真正执行。

再加两处 Hightouch 式的增强：可以临时改源里的值（例如把状态改成「离职」看看会发生什么），可以选「按入职 / 变更 / 离职」模拟。v3 查人页上的「立即同步这个人」复用同一个抽屉；搭建期和运维期共用一套解释，集成工程师和值班看到的是同一种语言。

**C. 「启用前预演」卡片。** 启用按钮旁边放「预演」，借鉴 Census 的 Dry Run，不写飞书。结果卡片上：

- 北森在范围内 1,284 人，飞书现有 1,250 人。
- 将创建 31、将更新 58（部门 41、职位 17）、将停用 3、无变化 1,192、无效 2（工号为空 1、重复 1）。
- 每个数字都可以点开看名单。
- 下方三个按钮：「分批启用（先 [20] 人）」「全部启用」「保存这次预演」。

把这张卡和 v3 的「起点」选择放在同一个启用对话框里。这一步正好堵住 Microsoft Q&A 里那个测一个人、开出 1.5 万人的事故。

**D. 每人一行的同步状态表。** 集成页上加一个页签「人员」，对应 Hightouch 的 `sync_snapshot`。列为工号 | 姓名 | 北森状态 | 飞书状态 | 是否一致 | 最近动作 | 结果 | 原因 | 最近同步时间。顶部是可点的统计：「不一致 12」「无效 2」「等待确认 3」。这张表数据量小，自托管时直接存在本地库里，不受 7 到 30 天日志保留期的限制，值班和 HR 问「张三」时先看这张表，再下钻到运行记录。

**E. 单人运行详情的四个页签**，照 Entra 来：步骤 | 字段变更（旧值 → 新值）| 排错建议（错误码、所需权限、修复入口）| 摘要（两侧 ID、链接建立时间）。字段变更页是将来「回滚」的依据，必须在写日志之前就脱敏，并按保留期管理，和备忘里的数据与隐私原则一致。

**F. 安全闸横幅。** 超过阈值时，集成页顶部出现黄色横幅：「本轮将停用 37 人（占在职 12%），超过阈值 5%，已暂停。」按钮有「查看这 37 人」「放行选中」「全部放行」「保持暂停」。名单里每人一行，带北森的离职原因和生效日期，可以逐个勾选，回应 Okta 用户「固定阈值不够」的抱怨。另外加一个可选的「停用缓冲期」：先停用不删除，或者先移到「待离职」部门，N 天后再执行，回应「组织调整需要缓冲」的诉求。

**G. 错误工作台。** 在 v3 问题详情里加入 Celigo 式的条目区：

- 左边列表的列为时间 | 消息 | 分类（连接、权限、数据、限流、映射）| 来源（北森、飞书、映射表）| 工号 | 负责人 | 标签。
- 右边详情里「重试数据」可编辑，改过没重试的条目显示蓝点。
- 同一工号后来成功了，旧条目自动关闭，并单独统计「自动关闭」数，接上 v3 首页的「平台替你处理的」。
- AI 批量修正必须先在一批真实失败条目上验证，暂存后逐条或成批接受。
- 按我们的收敛语义，「重试」的含义是「对这个工号再收敛一次」：读取北森的最新状态，而不是重放旧报文。所以重试数据只在源数据有缺陷、又暂时改不了北森时才需要编辑。这一点在界面上要写明。

**H. 方案的设置页。** 方案装好后，进入一个和 Celigo integration app 一样的业务设置页，而不是直接打开工作流：

- 页签为基本 | 生命周期 | 部门映射 | 通知 | 对账 | 安全。
- 安装清单沿用 Celigo 的逐项打勾设计，每项显示「已完成 / 待处理」：北森连接 → 飞书连接 → 飞书通讯录权限范围（**Verify Now**）→ 部门映射覆盖率 96% → 预演 → 启用。
- 方案里的受管部分（同步节点、对账规则）可以随产品升级；客户改过的部分要标出来，升级时逐项提示冲突。

**I. 工作流插槽，划清同步和工作流的界线。**

- 映射类型里加「由工作流计算」：只在创建时调用，有超时，不能用作匹配键，照搬 Entra 的 LCW extensibility 限制。典型用途是生成不重复的邮箱前缀。
- 「确保一致」节点之后接一个「状态变化后」分支，只在创建、停用、部门变化真的发生时才执行通知 HR 群这类副作用。这是决定 000042 里「通知只在状态真的变化时执行」的界面落点。

**J. 照顾值班以外的角色。**

- 平台管理员在租户设置里定安全阈值的默认值和下限、停用和删除是否需要审批、日志保留期。
- HR 和服务台通过委派获得两件事：「查人」和「重新同步这个人」。借鉴 Okta 的 delegated flow：只授予运行这一个动作的权限，看不到配置。
- 业务部门可以用只读账号订阅通知，借鉴 Celigo 的 Monitor 级账号。

### 9.2 反面教材

- **安全开关藏在 API 里。** Entra 的 SkipOutOfScopeDeletions 只能用 Graph Explorer 改 secrets JSON 来设置，过程中还要重新填一遍 Workday 密码。凡是影响停用和删除的开关，必须在界面上，并写进审计日志。
- **改配置静默触发全量。** Entra 改映射或作用域会自动重跑全量，作用域收窄的瞬间就停用一批人。我们改映射、作用域时要先给出「这次改动会影响多少人」的预演，确认后才生效。
- **只和自己的快照比。** Census 的 Mirror 和 Hightouch 的 CDC 看不见目标端漂移，Mirror 遇上源查询出错还会误删。我们坚持对账按业务键比对两边的实际名单（决定 000040），收敛前重新读取源（决定 000042）。
- **原因码不可读。** NotEffectivelyEntitled、RedundantExport 这类内部码要翻译成人话，并配上修复入口。「两边已一致，无需改动」应该是一种明确的、正常的结果，不能和失败混在一起。
- **「按需」不检查条件。** Entra LCW 的 Run on demand 会绕过执行条件。我们的「立即同步这个人」必须照常评估作用域，不在范围内就说明为什么，需要强制执行要单独确认并记审计。
- **全清队列。** Okta 的 Clear Unconfirmed Users 不能挑着删。所有批量操作都要支持挑选和筛选后再执行。
- **环境推广的 ID 映射断裂。** Celigo ILM 的 Removed/New 问题说明，跨环境推广要靠稳定的资源 ID，并在预览里明确标出「替换」与「更新」的区别。这条经验留给第二阶段的项目包（决定 000038）。
- **卡片级重试和无法重跑。** Okta Workflows 的重试只管 429，失败的执行也不能重跑。这证明「从失败节点重跑」「按业务键重放」在工作流产品里确实稀缺，值得作为我们的强项打磨。

### 9.3 对我们定位的特别含义

- **自托管**：
  - 云产品把日志保留期压到 7 到 30 天，靠的是「导出到 Log Analytics 或客户数仓」兜底。我们在客户机房，可以把每人一行的状态表（9.1 D）和问题、对账结果长期留在本地库里，这本身就是卖点。
  - 字段级的旧值和新值要先脱敏，并受保留期约束。
  - 所有关键配置都要在界面上，不能出现 Entra 那种只能用 Graph Explorer 改的设置。
- **中国企业**：
  - 北森没有 Workday 那样现成的深连接器，形态和 Entra 的 API-driven inbound 相近：取数可以多种多样（事件、轮询、全量），收敛引擎是同一个。
  - 飞书一侧的「通讯录权限范围」本身就是一层隐性的作用域，要在「试一个人」第 2 步里和我们的作用域条件一起展示（v3 已经把它做成了问题 I-20）。
  - 飞书哪些字段支持按值查询，还需要连接器核实（见待决问题）。
- **辅助流程**：声明式同步正好对应「接主流程的结果去开通」。它不需要审批和表单，只需要源状态、期望状态和边界。通知、归档这类副作用挂在状态变化之后，不进入同步定义。
- **AI 优先**，眼下可信的 AI 落点有三个，都要遵守「暂存 → 人确认」：
  1. 映射和部门对照的建议，带置信度，对应 v3 的部门 AI 匹配。
  2. 错误归因，并在真实样本上验证后的批量修正，对应 Celigo Ora。
  3. 用一句话解释「这个同步现在做什么、上次改了什么」，对应 Okta 用户在外部做的事和 Security Copilot 的版本对比。
  
  AI 不能替用户决定谁是权威源、离职后停用还是删除、重复记录怎么处理。Celigo 文档把这条写成了 Ora 的硬限制，我们也应该在界面上做成必须由人选择的项。
- **和决定 000041 的关系**：Census 和 Hightouch 说明，声明式同步是一种通用的集成原语，不是身份产品。建议把「确保一致」做成工作流引擎里的一种节点或资源，由方案打包，而不是另起一个「身份同步」模块。这样既有 Entra 式的配置体验，又和运行、问题、重放、对账共用一套基础设施。

### 9.4 待决问题

见文末给编排脚本的结构化输出，这里列要点：

- 「确保一致」做成工作流里的特殊节点，还是独立的「同步」资源？两者在版本、环境推广、权限上的差别要评估。
- 首发是否只做停用、不做删除？删除放到缓冲期之后、需要审批时再开放？
- 飞书通讯录哪些字段可以作匹配键（支持按值查询）？手机号在飞书里是否唯一？未核实。
- 预演要拉取飞书的全量名单，在飞书限流下，千人以上的企业预演要多久？需要按连接器的速率上限估算，并在界面上提示预计时长。
- 每人一行的状态表和问题、对账差异之间的关系：同一个不一致，是否只在一处出现？

## 附：国内对照（Authing 同步中心）

Authing 把同一类能力叫「同步中心」，口号是「一处管理、处处同步」。概念有身份源、上游同步（如企业微信 → Authing）、下游同步（Authing → 飞书等），支持实时、定时、手动三种同步方式和自定义字段映射，还有一篇单独讲「处理删除保护」的文档；下游同步需要联系售后加白名单才能开通（[Authing 同步中心概览](https://docs.authing.cn/v2/guides/sync/)）。子页面是前端渲染的，本轮抓不到具体界面；北森作为上游的支持情况未查到。
