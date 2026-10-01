# API 与企业治理：MuleSoft、SnapLogic、Power Platform、ServiceNow IntegrationHub

调研时间 2026-10-01。要回答的问题：企业里有几百条集成时，这几家怎么做资产目录与复用、依赖与影响分析、权限与数据策略、审计、成本归属；我们不做 API 全生命周期管理，哪些手段仍然有用。

**资料与可信度**

- 以官方文档为主，界面文字按文档原文保留英文。文档日期较新的几篇：Power Platform 的 ACP（2026-09-09）、Inventory（2026-09-28）、Pipelines（2026-09-29），MuleSoft MCP 发布说明（2026-08-31）。
- SnapLogic 文档正文是前端渲染的，有几页只读到了导航目录，这类内容标「仅目录可证」。
- 用户评价来自 Capterra、PeerSpot、AWS Marketplace。G2、Gartner、TrustRadius 拒绝抓取，G2 只用了搜索摘要并标注。本轮检索额度中途用尽，**Reddit、Hacker News、知乎、V2EX 的讨论未查到；ServiceNow IntegrationHub 的第三方用户评价未查到**。

## 先说结论

1. **治理的核心对象是凭证，不是流程。** 四家真正落地的治理手段都围着「谁的凭证、在哪个环境、能调哪些操作」转：Power Platform 的连接引用和连接器策略、ServiceNow 的连接别名、MuleSoft 的受保护应用属性。流程本身的治理反而薄弱。
2. **影响分析要在改动之前、从定义里算出来。** Power Platform 的「Flows using this connection」和「Show dependencies」是静态的，改之前就能看；MuleSoft Visualizer 按最近 7 天的流量画拓扑，适合看架构，不能回答「我现在收紧这个连接会坏哪些」。
3. **个人拥有凭证，是规模化以后的头号事故源。** Power Automate 的连接属于个人，人走了几周后流程才开始失败。ServiceNow 和 MuleSoft 把凭证挂在实例、环境或应用上，没有这个问题。
4. **数据策略在往「默认拒绝、动作级、设计期报错、运行时兜底」收敛。** 微软自己承认 Business / Non-business 分类「wasn't deemed effective」，改成了严格白名单。端点过滤只检查设计期的静态值，用变量拼地址就能绕过。
5. **治理要做成产品里的日常待办，不能靠外挂工具包。** 微软在 2026 年停止维护 CoE Starter Kit，能力并进管理中心的 Inventory、Usage、Monitor、Actions 四个页面。Actions 页的交互结构可以直接照搬。
6. **这几家在值班运维上都很粗。** Power Automate 批量重提交一次最多 20 条；管理中心的事件日志只留 7 天，指标按天聚合；SnapLogic 用户抱怨只能看最近 100 次执行；MuleSoft 告警只能发邮件，高级监控要另买 SKU。
7. **它们的自托管版和中国区都是二等公民。** MuleSoft 私有云版不含 Anypoint Monitoring 和 Secrets Manager；Power Platform 的 Inventory 和使用洞察在世纪互联不可用；ServiceNow 300 多个 spoke 里没有钉钉、企业微信、飞书。

## 1. 核心对象模型

| | MuleSoft Anypoint | SnapLogic | Power Platform | ServiceNow IntegrationHub |
| --- | --- | --- | --- | --- |
| 组织层级 | 根组织 → Business Group（可多级）→ 环境 | Org → Project Space → Project | 租户 → 环境组 → 环境 | 实例（开发、测试、生产各一个）→ 应用作用域 |
| 搭建单元 | Mule 应用（内含多个 flow） | Pipeline（由 Snap 串成） | Cloud flow（放进 Solution） | Flow、Subflow、Action |
| 复用单元 | Exchange 资产 | Expression Library、子 pipeline、Pattern | Solution、子流程 | Spoke（一组 action）、Subflow |
| 凭证 | 应用属性（可设为受保护） | Account（项目里的资产） | Connection（归个人）+ Connection reference | Credential、Connection & Credential Alias |
| 运行单元 | 部署到 CloudHub 2.0、RTF 或自管服务器的应用 | Task（Scheduled、Triggered、Ultra），跑在 Snaplex 上 | Flow run | Flow 执行 |
| 计量单位 | Mule flow、Mule message、吞吐量 | 未查到 | Power Platform requests、按流程许可 | IntegrationHub transaction |

- **MuleSoft**：Business Group 是带权限边界的资源容器，父组管理员自动管子组，可以把 VPC、负载均衡这类权益分给子组，但新账号默认不开，要找 MuleSoft 开通（[Business groups](https://docs.mulesoft.com/access-management/business-groups)）。权限按 Team 授予，子 Team 继承父 Team，最多 10 层、1000 个 Team，可以指定 Team maintainer 下放管理（[Teams](https://docs.mulesoft.com/access-management/teams)）。Exchange 的资产类型有 API Group、Spec Fragment、AsyncAPI、Connector、Custom、DataWeave Library、Example、GraphQL、HTTP API、Mule Application、Policy（[Asset Types](https://docs.mulesoft.com/exchange/asset-types)）。
- **SnapLogic**：资产全部挂在项目下，包括 Pipelines、Accounts、Tasks、Files、Expression Libraries、Snaplexes、Tables（[Project assets](https://docs.snaplogic.com/manager/project-assets.html)）。凭证（Account）是项目资产，跟着项目权限走。
- **Power Platform**：连接是「存储的凭证」，存在托管流程的环境里（[Data policies](https://learn.microsoft.com/en-us/power-platform/admin/wp-data-loss-prevention)）。Solution 里的 flow 不直接绑连接，而是绑「连接引用」；导入目标环境时为每个引用指定连接，flow 才能自动开启（[Connection reference](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-connection-reference)）。
- **ServiceNow**：Spoke 把一组 action 打包成可复用的集成；action 由 REST、SOAP、PowerShell、Script 等 step 组成；MID Server 负责在客户内网里执行（[Exploring Integration Hub](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/exploring-integration-hub.html)）。别名分「Credential Alias」和「Connection and Credential Alias」两种，运行时解析；同一个别名在开发、测试、生产实例里解析成各自的凭证；子别名可以让同一个集成连多个账号（[Credentials, connections, and aliases](https://www.servicenow.com/docs/bundle/zurich-platform-security/page/product/credentials/concept/credentials-connections-alias.html)）。

## 2. 搭建体验

- **MuleSoft**：官方教程的路径是 File > New > Mule Project → 从 Mule Palette 拖 HTTP Listener（填 host、port、path）→ Add Modules 拖入 Database 连接器 → Configure > Add Maven dependency 装驱动 → 写 SQL → 拖入 Transform Message → 输出设为 application/json，点 Define metadata 用 JSON 样例定义结构 → 左右两棵树之间拖线映射 → Run Project → 用 REST 客户端调用（[教程](https://docs.mulesoft.com/mule-runtime/latest/mule-app-tutorial)）。Transform Message 的图形视图和 DataWeave 源码双向实时同步，按样例数据实时预览输出（[Transform Message](https://docs.mulesoft.com/studio/latest/transform-message-component-concept-studio)）。官方路径里没有逐步测试，测试靠整个应用本地运行和 MUnit。复用靠 Exchange：资产页能看到 Studio 和 API Designer 的导入次数。
- **SnapLogic**：在 Designer 里把 Snap 拖成 pipeline，配置 Account；映射用 Mapper Snap 的表达式。SnapGPT 能为 Mapper 生成表达式（仅目录可证）。复用靠 Pattern library、Expression Library 和子 pipeline。逐个 Snap 预览数据的细节本轮未能读到正文。
- **Power Platform**：两条路。一是首页「Create with Copilot」描述需求，选「Keep it and continue」后检查连接（绿勾、红叹号），再「Create flow」进设计器；二是「Create → Start from blank」选触发器类型后在设计器里加动作。测试是工具栏「Test」→「Manually」→「Run flow」，跑完回到流程详情页看「28-day run history」（[入门教程](https://learn.microsoft.com/en-us/power-automate/get-started-with-cloud-flows)）。复用靠子流程和 Solution。
- **ServiceNow**：在 Workflow Studio 里用 spoke 提供的 action 搭 flow。连接在 Flow Designer 的 Connections 标签里配：找到别名卡片 →「Add Connection」→ 按别名的配置模板填表 →「Create Connection」，需要 connection_admin 或 admin 角色（[Connections dashboard](https://www.servicenow.com/docs/access?context=dashboard-add-connection&version=zurich&pubname=zurich-integrate-applications&ft:locale=en-US)）。分页和超过 10 MB 的大响应用 Data Stream action 处理（[Building integrations](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/building-integrations-ih.html)）。测试一次会自动生成 Trace 级的执行详情。

## 3. 运行与运维

**MuleSoft**

- Anypoint Monitoring 的内置应用看板分 Overview、Inbound、Outbound、Performance、Failures、JVM、Infrastructure 几块。自定义看板、日志点、链路追踪、遥测导出都要 Advanced 或 Titanium 级别，所有级别都有的只有基础告警和单应用日志查看（[Monitoring](https://docs.mulesoft.com/monitoring/)）。
- 日志搜索支持布尔运算、通配和字段过滤，默认搜 message 字段（[查询语法](https://docs.mulesoft.com/monitoring/log-search-query-syntax)）。想按业务数据查，只能靠开发者主动把业务值打进日志。
- 告警的创建路径是 Alerts →「Create Alert」→「Set Alert Condition」→「Configure Notifications」。应用指标有 Message Count、Message Error Count、Average Response Time、CPU、Memory、Thread Count，级别分 Low、Medium、High、Critical，**只能发邮件**（[Basic alerts](https://docs.mulesoft.com/monitoring/basic-alerts)）。Runtime Manager 另有一套应用事件告警（部署失败、worker 无响应、超过事件流量阈值等），同样只发邮件，告警历史留 30 天（[Runtime Manager alerts](https://docs.mulesoft.com/runtime-manager/alerts-on-runtime-manager)）。
- **重放有过，又退场了。** 老的 Insight 能按事务 ID、flow 名、异常消息、处理时间和自定义业务数据搜索，修好后点「replay transaction」重放。但重放只支持 Mule 3 的 CloudHub 应用，免费账号不能用；文档还警告开启 Insight「can significantly impact data processing performance and memory consumption」，不建议在生产长期开（[Insight](https://docs.mulesoft.com/runtime-manager/insight)）。Mule 4 的业务事件文档建议把事务 ID 自定义成订单号、员工号这类业务值，方便在 Insight 里按业务查（[Business events](https://docs.mulesoft.com/mule-runtime/4.9/business-events)）。Mule 4 平台级的重放功能未查到。

**SnapLogic**

- 入口是 Monitor → Pipeline executions。有「Errors」预设（失败或带错误完成）；按 Type、Status、Project 过滤；搜索框可以搜 pipeline 名、task 名、owner 邮箱，也能**按 pipeline 参数搜**（task 调用或子 pipeline）和按运行 ID 搜；文档提醒「Select the smallest time period possible」（[Find executions](https://docs.snaplogic.com/monitor/find-executions.html)）。
- 执行详情分 Snap statistics、Children、Pipeline logs、Pipeline parameters、State transition、Ultra requests 几个标签页；只有被挂起的执行能「Resume pipeline」（[Pipeline executions](https://docs.snaplogic.com/monitor/analyze-execution.html)）。
- 告警在 Notification center，分 Alerts、Activity、Notices、Notification settings，能按 task 或 Snaplex 建通知，支持 Slack（仅目录可证，[Notification center](https://docs.snaplogic.com/monitor/notification-center.html)）。

**Power Platform**

- 运行历史默认只有 Start、Duration、Status 三列。流程所有者可以在详情页点「Edit columns」，**把触发器输出里的字段加成列**，这是四家里最接近「按业务数据找运行」的做法（[Troubleshoot](https://learn.microsoft.com/en-us/power-automate/fix-flow-failures)）。
- 失败时给所有者发「Repair tips」邮件，结构是 Time、What happened、How do I fix、Troubleshooting tips（失败次数，外加用同样输入重试的链接），邮件里有「Fix my flow」入口，每个流程可以单独关掉这类邮件。在运行详情里打开失败步骤，右栏「How to fix」下点「View Connections」→「Fix connection」→ 回到运行点「Resubmit」。
- 批量操作在 My flows → 选流程 → All runs → 勾选 →「Resubmit flow run(s)」，**一次最多 20 条**，还受连接器 API 上限约束。「Cancel all flow runs」可以一键取消所有运行中和等待中的运行，同时可以勾选关闭流程（[Bulk resubmit](https://learn.microsoft.com/en-us/power-automate/how-tos-bulk-resubmit)）。
- Automation center 按顶层流程聚合，带出子流程：Overview 有错误率、错误趋势、最常失败的流程；Errors 页有 Top errors、Error trends，但这两张主要统计桌面流程（[Automation center](https://learn.microsoft.com/en-us/power-automate/automation-center-overview)）。管理中心的 Monitor 指标按天聚合，事件日志只留 7 天，指标留 28 天，时间类指标只给 P75（[Monitor](https://learn.microsoft.com/en-us/power-platform/admin/monitoring/monitoring-overview)）。

**ServiceNow**

- 执行详情逐步列出输入（名称、类型、配置、运行时值）、输出、生成的记录链接、毫秒级耗时和日志；出错时列出已完成步骤的配置和运行值，以及出错步骤的配置。报告级别分 Off、Basic、Full、Trace，其中 Full 只用于非生产（[Flow execution details](https://www.servicenow.com/docs/access?context=flow-execution-details&version=zurich&pubname=zurich-build-workflows&ft:locale=en-US)）。
- **重试策略可以挂在连接上**，也可以挂在单个 step 上；策略有固定间隔、指数退避、遵守 Retry-After 三种；条件可以按方法、状态码、响应头、响应体判断；可设次数、间隔和最长总时长。重试明细在 System Logs → Outbound HTTP Requests（[Retry policy](https://www.servicenow.com/docs/access?context=retry-policy&version=zurich&pubname=zurich-build-workflows&ft:locale=en-US)）。
- 失败聚合和从失败点重放：未查到。

## 4. 生命周期

- **MuleSoft**：CloudHub 2.0 每次部署自动生成一份配置版本，「Config changes」列最近 10 次，每次一个 hash。版本化的内容包括包版本、runtime 版本、副本数、端点和 TLS、CPU 内存、属性值、日志级别。回滚路径是 Runtime Manager → Applications → 应用 → Settings → Configuration → 选旧配置 → Deploy；被重新部署的旧配置移到列表顶部，保留原 hash（[Update apps](https://docs.mulesoft.com/cloudhub-2/ch2-update-apps)）。Exchange 资产有 development、stable、deprecated 三种状态：development 可以覆盖重发，stable 不可覆盖，stable 不能依赖 development，其他产品不消费 development 版本（[Lifecycle](https://docs.mulesoft.com/exchange/lifecycle)）。
- **SnapLogic**：pipeline 可以打版本、回滚，但「task 只能选当前版本」，也只能回到打过版本的点（[Pipeline versions](https://docs.snaplogic.com/design-integrations/pipeline-versions.html)）。Git 支持 GitHub、GitLab、Azure Repos、Bitbucket Data Center，每个项目最多跟踪 1000 个资产，Snap Pack 和 Snaplex 不跟踪（[Git integration](https://docs.snaplogic.com/cicd/git-integration/git-integration-about.html)）。跨 Org 迁移项目的路径是项目下拉 →「Migrate」→ 选目标 → 「Choose asset types to migrate」；**迁到已存在的项目时，task 和 account 默认不勾选**（认为目标环境已经定制过），强行勾选会弹风险警告（[Migrate projects](https://docs.snaplogic.com/manager/migrate-projects-to-another-org.html)）。
- **Power Platform**：在开发环境的 Solution 里点「Pipelines」→ 选阶段如「Deploy to Test」→「Deploy here」→ 选 Now 或 Later → Next 触发预检（缺依赖等）→ 填连接引用和环境变量 → 看摘要、写部署说明 →「Deploy」。有审批时显示「pending」（[Run pipeline](https://learn.microsoft.com/en-us/power-platform/alm/run-pipeline)）。关键约束：**同一个制品按阶段顺序推进，不能跳过测试，也不能被篡改**；每次部署自动备份；部署对象的所有者是执行部署的身份；打开设置后可以从运行历史里重新部署旧版本，否则只能部署更高版本（[Pipelines](https://learn.microsoft.com/en-us/power-platform/alm/pipelines)）。组件的「Show dependencies」分「Delete blocked by」「Used by」「Uses」三个标签页（[Dependencies](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/view-component-dependencies)）。多人同时编辑同一流程的处理方式未查到。
- **ServiceNow**：配置变更用 Update Set 在实例间搬运，流程是 retrieve → preview（找冲突）→ commit（[Update sets](https://www.servicenow.com/docs/access?context=system-update-sets&version=zurich&pubname=zurich-application-development&ft:locale=en-US)）。别名让 flow 本身不用随环境修改。flow 的版本管理细节未查到。

## 5. 治理（本篇重点）

### 5.1 资产目录与复用

- **Exchange** 是唯一一个把「复用」做成一等产品的：资产有类型、语义化版本和生命周期状态。资产页左栏「Asset version engagement」显示下载次数、从 API Designer 和 Studio 导入的次数、依赖者数（dependents）、合约数，以及一个综合参与度分数，但只覆盖 REST API 和规范片段（[Salesforce 开发者博客](https://developer.salesforce.com/blogs/2023/08/close-the-feedback-loop-with-exchange-asset-usage-and-engagement-metrics)）。
- **SnapLogic 的 Asset catalog** 列出 Tasks、Pipelines、Accounts 以及它们之间的关系：哪些 pipeline 引用某个 account、task 跑的是哪个 pipeline、父子 pipeline。从执行推断出的关系只保留 30 天；管理员可以给资产加业务元数据；视图可以导出 CSV（[Catalog](https://docs.snaplogic.com/monitor/catalog.html)）。
- **Power Platform Inventory**（Manage → Inventory）把全租户的 agent、app、flow、连接器、环境放在一张表里：任意列过滤排序，左上角显示匹配条数，「Add or remove columns」，搜索覆盖全量，「Download」导出全量 CSV；详情面板分 Overview、Connectors、Usage 三个标签页；**Connectors 列显示每个资源用到的连接器和具体操作，flow 还单独记触发器的连接器和操作**，于是「某个连接器要弃用，哪些资源受影响」变成一次查询。文档列的典型用途里有「Prevent orphaned agents」，也就是找出离职者拥有的资源。两个坑：cloud flow 的 Owner 列显示创建者，换了所有者也不更新；世纪互联（中国区）不可用（[Inventory](https://learn.microsoft.com/en-us/power-platform/admin/power-platform-inventory)）。
- **ServiceNow** 的复用单元是 spoke，通过 Store 分发，官方列表 300 多个（[Spokes list](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/spokes-list.html)）。

### 5.2 依赖与影响分析

两种做法：

- **静态**：从定义里算，改动之前就能看。Power Platform 的连接详情页有「Apps using this connection」和「Flows using this connection」两个标签页（[Connection reference FAQ](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-connection-reference)），组件有「Show dependencies」，Inventory 能列出连接器的使用情况；SnapLogic 有 Asset catalog；Exchange 有依赖者数。MuleSoft 在 2026-08-31 给 MCP 服务器加了 `get_asset_lineage`，返回 agent、MCP 服务器和 API 在设计期与运行期的关系（[MCP release notes](https://docs.mulesoft.com/mulesoft-mcp-server/mulesoft-mcp-server-release-notes)）。
- **动态**：按流量画。Visualizer 自动发现应用、API 和它们调用的第三方系统，连线来自「最近 7 天」的流量；调用方画在上面，后端系统画在下面，按 system、process、experience 自动分层，分层可以手工调整；另有 Troubleshooting 视图看健康状况，Policies 视图看「哪些 API 没挂某个策略」，用于上线前检查（[Visualizer](https://docs.mulesoft.com/visualizer/)、[App network](https://docs.mulesoft.com/visualizer/visualizer-app-network)）。动态拓扑看不到最近 7 天没跑过的依赖，比如每月一次的对账，所以不适合在变更前做影响分析。

### 5.3 权限与凭证归属

- **Power Platform 是反面案例。** 开启 flow 的人必须拥有或被共享流程用到的所有连接，否则报「ConnectionAuthorizationFailed」；OAuth 连接只能显式共享给代表服务主体的用户（[Connection reference](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-connection-reference)）。所有者离职后，只要账号和连接还有效流程就照跑，直到账号被停用、删除或连接要求重新登录，「Between departure and failure there are often weeks」；连接属于离职者，「die with their account」；只有 Solution 里的流程能把所有者改成别人或服务主体（[nordflux](https://nordflux.de/en/guides/flow-owner-leaves-the-company-how-to-rescue-orphaned-power-automate-flows)）。Pipelines 的「delegated deployments」允许用服务主体部署，部署出来的对象归服务主体所有（[Pipelines](https://learn.microsoft.com/en-us/power-platform/alm/pipelines)）。
- **ServiceNow** 的凭证属于实例，flow 只引用别名，没有个人归属问题。凭证会同步到 MID Server 上执行。
- **MuleSoft** 的凭证是应用属性。CloudHub 2.0 可以把属性设为受保护：界面只显示名字不显示值，谁都取不回来，加密后存在 secrets manager 里（[Protect app properties](https://docs.mulesoft.com/cloudhub-2/ch2-protect-app-props)）。
- **SnapLogic** 的 Account 跟项目权限走，权限分项目空间和项目两级（具体权限名本轮未读到）。另有「Enhanced Encryption」（仅目录可证）。

### 5.4 数据策略

Power Platform 做得最深，演进路线本身就是教训：

- **经典数据策略**：管理中心 → Security → Data and privacy → Data policy →「+ New Policy」，五步：命名 → Prebuilt connectors（把连接器移进 Business、Non-business、Blocked 三组，「Set default group」决定以后新出现的连接器默认进哪组）→ Custom connectors → Scope（全部环境、指定环境、排除某些环境）→ Review。Business 组的连接器不能和其他组的连接器出现在同一个流程里。环境管理员改不了租户级策略（[Manage data policies](https://learn.microsoft.com/en-us/power-platform/admin/prevent-data-loss)）。
- **执行过程**：策略逐级下发到每个环境 → 资源定期检查 → 违规的 app 或 flow 进入 suspended 或 quarantine 状态 → 整个连接器被禁时把连接置为 disabled → 正在跑的运行失败。一般一小时内生效，极端情况要 24 小时。设计期，被禁的连接器保存时就报错（[Data policies](https://learn.microsoft.com/en-us/power-platform/admin/wp-data-loss-prevention)）。
- **动作级控制**：Prebuilt connectors 里选连接器 → More actions →「Configure connectors」→「Connector actions」，在侧栏逐个 Allow 或 Deny；「Default connector action settings」决定以后新增的动作默认放行还是拦截。触发器级控制目前只能用 PowerShell（[Connector action control](https://learn.microsoft.com/en-us/power-platform/admin/connector-action-control)）。
- **端点过滤（预览）**：只对 HTTP、SQL、Blob、SMTP 等少数连接器开放，规则是一张有序的 Allow、Deny 地址模式列表，最后一行固定是 `*`。**规则只检查设计期的静态值，用环境变量或动态值拼出来的地址直接绕过**，文档还给了用变量连 SQL Server 照样跑通的截图（[Endpoint filtering](https://learn.microsoft.com/en-us/power-platform/admin/connector-endpoint-filtering)）。
- **新一代 ACP（Advanced connector policies）**：严格白名单，所有连接器和动作默认拒绝，新连接器自动被拦；可以挂在单个环境上（Security → Data and privacy），也可以挂在环境组上（Rules →「Advanced connector policies」→「Add connectors」→ Save →「Publish rules」）；面板顶部显示 Applied 或 Not applied；能看到触发器、内部动作和已弃用动作的标签；MCP 服务器只能整体阻止，还不能按工具；设计期在 Flow Checker 里报错。从环境组移除时，环境**保留**最后一次的策略，以免出现执法空档。原文：「The concept of the business and nonbusiness categories in data policies isn't brought forward, as it wasn't deemed effective in policy management」（[ACP](https://learn.microsoft.com/en-us/power-platform/admin/advanced-connector-policies)）。
- **环境组规则**：环境组可以理解成环境的文件夹，规则发布后组内环境的对应设置锁成只读，本地管理员改不了；「Per-environment exceptions aren't currently supported」；未发布的改动显示为粗体加星号（[Environment groups](https://learn.microsoft.com/en-us/power-platform/admin/environment-groups)）。
- **导入闸门**：Solution checker 有三档，None、Warn、Block；只有 critical 级别的规则会阻止导入，可以用「Excluded Rules」排除个别规则，结果以摘要邮件发给管理员（[Solution checker](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-solution-checker)）。

MuleSoft 的对应物是 **API Governance**：治理档案 = 规则集 + 一组筛选出的目标 API；档案分 Draft（先试，不对外公开结果）和 Active；合规状态显示在开发者干活的地方（Exchange、Design Center、API Manager）；**通知只在 API 第一次从合规变为不合规时发**，邮件里写清楚失败的规则集和修改入口（[API Governance](https://docs.mulesoft.com/api-governance)、[Notifications](https://docs.mulesoft.com/api-governance/configure-notifications)）。规则集检查的是 API 规范，对我们没用，但档案和通知的机制可以借用。

ServiceNow 连接器级的数据策略：未查到。

### 5.5 审计

- **MuleSoft**：齿轮菜单 → Access Management → Audit Logs，可以按 Product、Type、Actions、环境、对象、用户、时间过滤。每条记录包含时间、产品、对象类型、动作、对象名、操作人、connected app、环境、父对象，以及记录变更字段的 payload。默认保留 1 年，可在 30 到 2190 天之间调整，可以下载，也能用 Telemetry Exporter 推到外部系统。覆盖 API、应用、权限、环境、Exchange、Design Center 等（[Audit logging](https://docs.mulesoft.com/access-management/audit-logging)）。
- **Power Platform**：Purview 只记 flow 的创建、编辑、删除、权限变更和试用事件；每条记录带上事件发生时流程定义里的连接器名（`FlowConnectorNames`）、共享权限（所有者或仅运行）、发起方是用户还是管理员。**不记运行、动作执行和连接器调用**，这些要去 App Insights 或 Dataverse 里的运行记录查（[Purview 审计](https://learn.microsoft.com/en-us/power-platform/admin/activity-logging-auditing/activity-logs-power-automate)）。
- **SnapLogic** 有 Activity logs（仅目录可证）。ServiceNow IntegrationHub 专门的审计：未查到。

### 5.6 成本归属

- **MuleSoft** 从按 vCore 预分配改成了按用量计费：flow 数取当月某一小时的最大并发数，乘以 worker 或副本数；message 按月累加；吞吐量按 GB 计；没有事件源的 flow 不计。用量页按业务组、生产与非生产分开，有「Usage by Application」标签页，可以导出带环境 ID 和业务组的 CSV（[Usage metrics](https://docs.mulesoft.com/general/usage-metrics)、[Pricing metrics](https://docs.mulesoft.com/general/pricing-metrics)）。
- **ServiceNow** 的 IntegrationHub Usage Dashboard（3.0.0 版）分 Transactions 和 Data Egress 两个标签页。报表有：交易量对比年度订阅上限、按类型、**按发起应用（Caller Scope）**、按月、Top 10 Spoke、Top Spoke Actions、自建 spoke 用量、协议用量、功能用量，都可以点开下钻（[Usage dashboard](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/integrationhub-usage-dashboard.html)、[Transaction reports](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/use-the-integration-hub-usage-dashboard.html)）。用到需要订阅的 spoke 时只弹提示，「do not restrict you」（[Subscription notifications](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/integrationhub-subscription-notifications.html)）。
- **Power Platform** 用 billing policy 把环境挂到某个 Azure 订阅上，一个环境只能挂一个；费用出现在对应的 Power Platform account 资源下，再用 Azure 资源组和标签按部门分摊（[Pay-as-you-go](https://learn.microsoft.com/en-us/power-platform/admin/pay-as-you-go-overview)）。被限流的流程要靠分配 Process 许可扩容，每个许可每天加 25 万次动作，一条流程最多叠 10 个（[Bulk resubmit](https://learn.microsoft.com/en-us/power-automate/how-tos-bulk-resubmit)）。
- **SnapLogic** 的计量与成本归属：未查到。

### 5.7 让治理变成日常工作

- **CoE Starter Kit 退场**：要自己装一堆同步流程和 Power BI 报表的 CoE 工具包「no longer actively maintained」，对应场景改用管理中心的 Inventory、Usage、Monitor、Actions（[CoE Starter Kit](https://learn.microsoft.com/en-us/power-platform/guidance/coe/starter-kit)）。
- **Actions 页**：每周扫描一次。每条建议的详情面板依次是 Title、刷新时间、「Why is this important」「What can I do」、操作步骤、受影响的资源表、可以直接执行的操作。非安全类建议可以暂缓最多两个月，到期自动恢复；安全类建议要选理由才能忽略，以后可以重新激活。建议可以整条或选几行通过 Teams 分享给同事；所有操作进入 Action history，还有趋势图。**每周给管理员发一张 Teams 卡片，只放最重要的两条建议**（[Actions](https://learn.microsoft.com/en-us/power-platform/admin/power-platform-advisor)）。
- **每周摘要邮件**分三段：上个月用了多少 app、有多少活跃用户；长期没启动的 app 和 flow（「Last launch」列，从没启动过的显示「None」）；最热门的资源和最活跃的创建者。中国区不可用（[Usage insights](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-usage-insights)）。

## 6. 连接器策略

- **MuleSoft**：连接器是 Exchange 里的一类资产。2026-06-02 的发布说明里，DX MCP 服务器已经有给连接器模块生成测试、构建和发布的工具（[MCP release notes](https://docs.mulesoft.com/mulesoft-mcp-server/mulesoft-mcp-server-release-notes)）。官方连接器数量本轮未查到。
- **SnapLogic**：连接器按 Snap Pack 分发，支持自定义 Snap Pack（仅目录可证）。评价里常夸预置的 Snap 多。数量未查到。
- **Power Platform**：连接器分 certified、custom、virtual、MCP 四类。ACP 目前只管 certified，自定义连接器和 HTTP 连接器还要靠经典数据策略（[ACP](https://learn.microsoft.com/en-us/power-platform/admin/advanced-connector-policies)）。
- **ServiceNow**：300 多个 spoke，**没有钉钉、企业微信、飞书**（[Spokes list](https://www.servicenow.com/docs/r/zurich/integrate-applications/integration-hub/spokes-list.html)）。Spoke Generator 可以从 OpenAPI（默认 10 MB，可调到 100 MB）、Postman Collection 生成 spoke，也可以把第三方 API 文档片段交给 ServiceNow Otto 生成 action；默认最多 500 个操作，可调到 1000；不支持 oneOf、anyOf、discriminator、callback、security scheme，请求体只支持 JSON；只有 admin 能导入和发布，action_designer 能加 action（[Spoke Generator](https://www.servicenow.com/docs/access?context=spoke-builder&version=zurich&pubname=zurich-build-workflows&ft:locale=en-US)）。

## 7. AI 能力（已经可用的）

- **MuleSoft Vibes**（原名 Dev Agent）在 Anypoint Code Builder 里用自然语言生成 flow、API 规范、DataWeave 和 MUnit 测试。它有两种模式：Plan mode 只给出分步计划，不执行任何动作；Act mode 调用 DX MCP Server 的工具真正改文件、建资源。生成的代码由「Layered AI Quality Pipeline」实时校验（[Vibes](https://docs.mulesoft.com/anypoint-code-builder/vibes-get-started)）。MCP 工具方面：2025-07 有 `search_asset`、`deploy_mule_application`、`get_platform_insights`；2026-05 推出 Platform MCP Server，覆盖流量、成本和策略；2026-08 加了 `get_asset_lineage`、模型预算钱包和密钥检查工具（[MCP release notes](https://docs.mulesoft.com/mulesoft-mcp-server/mulesoft-mcp-server-release-notes)）。
- **SnapGPT** 能生成 pipeline（结合公共 Pattern 库，并用环境里已有的 pipeline 做检索增强）。生成结果先以图片形式预览，用户选「replace the current pipeline」或「import the pipeline in a new tab」；有 Plan mode 先出计划供审阅（[生成](https://docs.snaplogic.com/snapgpt/snapgpt-pipe-gen-rag.html)）。失败分析的入口是 Monitor → Pipeline executions →「Analyze failed pipeline execution」，输出「Root cause」（一句标题加详细解释）和带代码 diff 的修复建议（[失败分析](https://docs.snaplogic.com/snapgpt/snapgpt-analyze-failed-execution.html)）。另外还能检查 Snaplex 健康、生成 agent 和 MCP Server pipeline（[SnapGPT](https://docs.snaplogic.com/snapgpt/snapgpt-about.html)）。
- **Power Automate Copilot** 能生成和修改流程，能回答「What does my flow do?」，能起草流程描述，只在新设计器里可用，针对英语优化（[Copilot](https://learn.microsoft.com/en-us/power-automate/create-cloud-flow-using-copilot)）。「Troubleshoot in Copilot」把错误翻译成人能看懂的摘要，并尽量给出修复（[Troubleshoot](https://learn.microsoft.com/en-us/power-automate/fix-flow-failures)）。Automation center 里的 Copilot 回答「昨天跑了多少」这类统计问题。
- **ServiceNow**：Spoke Generator 里的 Otto 已经可用（见上）。「Now Assist for Integration Hub」有文档条目，细节未核实。
- **共同点**：AI 都集中在「生成」和「解释失败」两件事上，而且都在往「先出计划、人确认、再执行」的两段式收敛。治理一侧的 AI 几乎是空白。

## 8. 用户的称赞和抱怨

- **MuleSoft**
  - 「Limited monitoring capabilities unless additional SKU is purchased」「Troubleshooting complex integrations can sometimes be time-consuming」「Less configurability- A lot of code needed」（[AWS Marketplace](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-ay2oifuxwfsla?page=4)）。
  - 交易多了以后「tracking becomes hectic」；夸 Exchange「provides details about the APIs」，让集成方式统一（[PeerSpot](https://www.peerspot.com/products/mulesoft-anypoint-platform-reviews)）。
  - 「The UI can be very buggy at times... I get warnings the don't make sense」「The IDE is the worst part」「becoming quite expensive, making every renewal difficult」（[Capterra](https://www.capterra.com/p/275022/Anypoint-Platform/reviews)）。
  - G2 搜索摘要：vCore 很贵，套餐固定为 2 个生产加 4 个沙箱 vCore，不灵活；RTF 的成本很难算（[G2](https://www.g2.com/products/mulesoft-anypoint-platform/reviews)，原页无法打开）。
  - MuleSoft 官方博客自己也引用了架构师对 API-led 的批评：「over-architecting; too many artifacts」，大多数 API 只是透传（[博客](https://blogs.mulesoft.com/api-integration/patterns/patterns-to-debunk-api-led-connectivity-myths/)，经搜索摘要）。
- **SnapLogic**（[PeerSpot](https://www.peerspot.com/products/snaplogic-reviews)）
  - 「we can monitor the last execution history of only 100 runs」「Troubleshooting complex pipeline failures can be time-consuming」，数据血缘有待改进（集成顾问，1001 到 5000 人的公司）。
  - 要改进「Git integrations and DevOps」；IP 白名单只能一个一个加；拖动 pipeline 片段时有 bug。
  - 称赞集中在低代码拖拽和预置 Snap 多。
- **Power Platform**
  - 新设计器让每个任务多花 15 到 20 分钟；「when I have really complex flows, Copilot just tells me it is not sure」（Aon 的治理运营分析师，[PeerSpot](https://www.peerspot.com/products/microsoft-power-automate-reviews)）。
  - 离职后流程失效是社区里反复出现的话题（见 5.3）。
- **ServiceNow IntegrationHub**：未查到可以引用的第三方评价。

## 9. 对我们的启示

### 9.1 哪些治理手段对我们仍然有用

| 手段 | 出处 | 对我们 | 理由 |
| --- | --- | --- | --- |
| API 规范的规则集检查、网关策略、SLA 层级、合约、开发者门户 | MuleSoft API Governance、API Manager | 不做 | 属于 API 全生命周期 |
| 治理档案的机制（规则 + 目标范围 + 草稿与生效 + 第一次不合规才通知） | MuleSoft API Governance | 换对象来用 | 用在工作流的上线检查上 |
| 导入或发布闸门（None、Warn、Block，可排除个别规则） | Solution checker | 有用 | 正好对应上线检查的执行方式 |
| 资产目录（版本、状态、依赖者数） | Exchange | 部分有用 | 对象换成方案模板、子流程、映射表、自定义连接器；不做对外门户 |
| 按流量自动发现拓扑 | Visualizer | 降级 | 我们能从定义里静态算出依赖，更准；流量只用来显示「最近实际调用」 |
| 资源清单和连接器使用情况 | PPAC Inventory | 有用 | 回答「谁在用北森的写操作」 |
| 连接器白名单、动作级、设计期报错 | ACP、动作控制 | 有用 | 已有 Connector Sets，要补运行时强制和违规清单 |
| Business / Non-business 分组 | 经典数据策略 | 不做 | 微软自己放弃了 |
| 端点过滤 | 数据策略 | 有用，必须在运行时做 | 我们已有 SSRF 过滤，补「允许访问的地址」白名单 |
| 连接别名或连接引用（按环境解析） | ServiceNow、Power Platform | 已有，要补全 | 和我们的「连接替换」是一回事 |
| 环境组与规则锁定 | Power Platform | 暂不需要 | 自托管单实例下项目数有限，租户级策略加项目级覆盖就够 |
| 用量报表（按发起方、Top 连接器、Top 操作） | IH Usage Dashboard、MuleSoft 用量页 | 有用 | 成本换成「对方 API 配额、机器资源、AI Token」 |
| 计费策略挂到云订阅 | Power Platform PAYG | 不做 | 自托管没有计费 |
| 产品内审计（可设保留期、可导出） | MuleSoft、Purview | 有用 | 而且要覆盖运维动作 |
| 治理建议页和每周摘要 | PPAC Actions、Usage insights | 有用 | 把治理变成待办 |
| 配置历史与一键回滚 | CloudHub 2.0 Config changes | 有用 | 值班事故常常出在配置上，而不是工作流定义上 |
| 重试策略挂在连接上，遵守 Retry-After | ServiceNow Retry policy | 有用 | 和「限流属于连接」是同一个思路 |
| 迁移到已有目标时，默认不覆盖凭证和定时任务 | SnapLogic Migrate | 有用 | 第二阶段的项目包导入（决定 000038）照此默认 |

### 9.2 值得借鉴的具体设计

以下按能直接画界面的粒度写。尽量复用仓库里已有的对象：连接分享、连接详情、`access-impact`、Connector Sets、审计、测试与生产环境、问题中心。

**A. 连接详情页：「谁在用」和「改之前先看影响」**（参照 Power Platform 的 Flows using this connection、Show dependencies）

- 页头：连接名、连接器和版本、所有者（人或集成账号，所有者已停用时显示红色「已停用」）、状态（正常 / N 天后到期 / 失效）、可用范围、速率上限。
- 标签页：「使用情况」（默认）、「权限」、「变更历史」。
- 「使用情况」分三组：
  - **生产中引用（会阻止删除）**：工作流、项目、引用的操作，写操作带「写 · 幂等」或「写 · 不幂等」标签，以及近 7 天调用次数、最后成功时间；
  - **测试环境与连接替换**；
  - **其他引用**：MCP 固定连接、对账规则、方案模板。
- 右上角三个按钮：「轮换凭证」「收窄可用范围」「停用」。点任何一个都先弹出影响预览抽屉：「会影响 12 个工作流，其中 9 个正在生产运行，停用后会立即失败」，下面是列表，底部是「通知这些工作流的负责人」和「仍然继续」。
- 空状态：「没有工作流使用这个连接，可以安全删除」。

**B. 资产清单**（全局侧栏「清单」，参照 PPAC Inventory）

- 顶部：类型切换（工作流、连接、映射表、对账规则、子流程、MCP 工具）、「共 312 条」、搜索、「添加或移除列」、「导出 CSV」。
- 工作流的默认列：名称、项目、负责人（停用的人加红点）、环境、状态（运行中 / 已停用 / 从未运行）、触发方式、用到的连接器和操作（写操作单独标出）、业务键、近 7 天运行与失败、未处理问题数、最近修改人。
- 预设筛选：「负责人已停用」「90 天未运行」「生产工作流使用个人连接」「没有告警接收人」「使用已弃用的操作」。
- 行操作：打开、转移负责人、停用（要填原因，写审计）。
- 数据直接查实时库，不学 PPAC 那样有 15 分钟延迟。

**C. 连接器策略**（租户管理 → 安全 → 连接器策略，由现有 Connector Sets 升级，参照 ACP 和动作级控制）

- 推荐模式是「白名单」：以后新加的连接器和新操作默认不可用。
- 列表列：连接器、来源（第一方、社区、自定义、外部 MCP）、已允许的操作数 / 全部操作数、其中写操作数、正在使用它的工作流数。
- 点开一个连接器，右侧面板把操作分成「触发器、读、写、已弃用」四组，每个操作一个开关；底部一项「以后新增的操作：允许 / 禁止」。外部 MCP 服务器按工具逐个开关，这一点 Power Platform 还做不到。
- 「HTTP 请求」有一张有序的地址规则表，最后一行固定是 `*`，并且明确写出「在运行时检查，用变量拼出来的地址同样会被拦截」。
- 保存前做影响预览：「新策略下有 7 个工作流违规（生产 3 个）」。然后让人选执行方式：「仅提示」（已有的继续跑，编辑时提示）或「阻止」（违规的工作流停用，并在问题中心生成问题）。
- 编辑器里，被禁的连接器在选择面板中灰显，写明原因，例如「被『生产连接器策略』禁止，联系林晓」；保存时拦截。

**D. 上线检查**（推广或发布时的闸门，参照 Solution checker 和 API Governance 的治理档案）

- 内置规则，都是可靠性原则的落地：
  - 生产工作流有负责人和告警接收人；
  - 写操作声明了是否幂等；
  - 触发器定义了业务键；
  - 生产用的连接属于集成账号；
  - 映射表全覆盖，或者显式选了「找不到时怎么办」；
  - 没有用到被策略禁止的操作；
  - 生产环境的变量都有值。
- 每条规则单独设「关闭 / 提示 / 阻止」。豁免要填原因和到期日，和对账的「例外可设到期」一致。
- 推广弹窗顶部一行汇总：「✓ 7 项通过 · ⚠ 1 项提示 · ✕ 0 项阻止」，每个阻止项旁边有「去修复」。
- 通知规则学 API Governance：一条规则第一次从通过变成不通过时才通知，不重复轰炸。

**E. 集成账号和离职检查**（反面参照 Power Automate 的连接所有权问题）

- 连接的所有者可以是「集成账号」：租户级、不能登录界面。生产连接是否必须属于集成账号，在上线检查里配置。飞书 App ID / Secret、北森密钥这类国产系统的自建应用凭证，本来就是企业级的，正好对上。
- 用户被停用时（SCIM 同步或手动），自动生成一条治理建议：「王磊已停用：拥有 3 个连接，负责 5 个工作流」。附受影响资源表，一键「转移给…」。

**F. 治理建议页加每周 IM 摘要**（参照 PPAC Actions 和 Usage insights）

- 页面：建议卡片按严重程度排序。点开右侧面板：为什么重要、你可以做什么、受影响的资源（可多选）、一键操作（转移负责人、停用、通知负责人、加入例外）。
- 状态：未处理；已暂缓（非安全类最多 60 天，到期自动恢复）；已忽略（要选理由，只有安全管理员能恢复）。所有操作写进审计。
- 首批建议：
  - 凭证 7 天内到期；
  - 负责人已停用；
  - 生产工作流使用个人连接；
  - 90 天未运行；
  - 问题 7 天没处理；
  - 被策略禁止但仍被引用；
  - 映射表出现没覆盖的新值。
- 每周一推送到飞书、企业微信或钉钉群：只放最重要的两条，外加三个数：本周新增的集成、长期没运行的集成、负责人已停用的资源。

**G. 用量页**（参照 IH Usage Dashboard 的 Caller Scope、Top Spokes、Top Spoke Actions，以及 MuleSoft 的按应用导出 CSV）

- 维度：项目、工作流、连接、连接器操作。
- 指标：运行次数、步骤数、出站调用数、数据量、AI Token、被限速排队的次数、对方配额的占用（例如飞书每分钟的频控）。
- 视图：月度趋势、Top 10 项目、Top 10 操作，可以导出 CSV 给内部分摊。
- 这页要回答的问题是「哪个部门的集成把飞书配额用完了」。

**H. 审计补强**（参照 MuleSoft 的变更字段 payload 和 Purview 的 `FlowConnectorNames`）

- 在现有 27 种事件之外，补上：重放与批量重跑（带条数和范围）、查看原文、轮换与收窄连接、策略变更（带影响数量）、上线检查豁免、负责人转移、导出。
- 每条事件快照当时涉及的连接器和操作，以及字段级的前后差异。
- 保留期可配（MuleSoft 是 30 到 2190 天，默认 1 年），可以导出 CSV，也可以用 syslog 推给客户的 SIEM。

**I. 配置历史与回滚**（参照 CloudHub 2.0 Config changes）

- 工作流已经有版本回滚。缺的是变量值、连接替换、速率上限、触发器运行设置这类配置的变更历史，以及按 hash 一键恢复。

### 9.3 反面教材

- **凭证归个人**：人走了几周后集中失败（Power Automate）。
- **治理靠外挂工具包**：CoE Starter Kit 最终停止维护。
- **抽象的数据分类**：Business / Non-business 分组被微软自己弃用。
- **只在设计期检查**：端点过滤用变量就能绕过。
- **业务追踪做成全量记录**：Insight 能按业务数据搜索、能重放，但开销大到不建议在生产开启，重放也只支持 Mule 3。
- **运维上限太低**：批量重提交一次 20 条，事件日志 7 天，只能看最近 100 次执行。HR 问「上个月张三」时答不上来。
- **把监控拆成付费 SKU**：自托管版干脆不带监控（MuleSoft PCE 不含 Anypoint Monitoring、Secrets Manager，[PCE](https://docs.mulesoft.com/private-cloud/latest/)）。
- **为分层而分层**：API-led 产生大量透传资产。
- **计量模型复杂**：vCore、flow、message 来回换算，RTF 成本难估。

### 9.4 对我们定位的特别含义

- **自托管**：治理能力必须在开源版里完整、离线可用，不能像 PCE 那样缺监控和密钥管理。治理数据就在客户自己的库里，清单和建议可以做到实时，不需要「15 分钟延迟」「按天聚合」。但要提前设计审计和运行数据的保留期与分区：`audit_event` 表在云上曾涨到 475 GB、从不清理（见 `brain/knowledge/data-storage-observability/audit-logs.md`）。
- **中国企业**：IT 部门集中管控是常态，审计要能长期留存和导出（《网络安全法》要求网络日志留存不少于六个月）。国产 SaaS 的凭证多是企业自建应用，天然适合集成账号模型；飞书等开放平台的频控和配额，才是真实的「成本」。海外几家的治理能力在中国区缺位，生态连接器也缺，这是我们的空间。
- **辅助流程**：治理的单位是「集成」（项目），不是 API。治理要回答的是：「这个连接能不能动」「这个人走了，哪些集成没人管」「哪些集成在用写权限」。依赖分析的重点是这几条边：连接到工作流、映射表到工作流、子流程到父流程、对账规则到工作流。按业务键查运行是我们的差异点：四家里最接近的只是 Power Automate 让所有者手工把触发器字段加成列、SnapLogic 能按 pipeline 参数搜；业务键要做成有索引的字段，不能靠日志全文检索（Insight 的教训）。
- **AI 优先**：治理一侧的 AI 是空白，可以做三件事：
  - 把影响预览翻译成人话；
  - 起草治理建议和修复（例如发现某个工作流没有业务键，提议从触发器字段里选一个）；
  - 回答清单类问题（「哪些工作流在用北森的写操作」）。

  所有改动都走「预览 → 确认」。AI 和 MCP 的调用同样受连接器策略和审计约束；Power Platform 已经把 MCP 纳入策略，但只能整服务器阻止，我们可以做到按工具控制。

### 9.5 待定问题

- 是否引入「集成账号」？个人连接是否只允许在测试环境使用？
- 连接器策略只要租户级一套，还是要允许项目级收紧？
- 用量按什么口径计：出站调用、步骤还是运行？要不要读取飞书、北森的配额接口？
- 上线检查的豁免能否由项目所有者自己批？
- 依赖要不要画成拓扑图，还是列表就够？
- 中文社区（知乎、V2EX）对这几家的评价本轮未查到，要不要补一轮？
