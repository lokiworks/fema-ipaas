# 运维与错误管理：Celigo integrator.io 与 Boomi 拆解

调研日期 2026-10-01。资料以官方帮助中心为主：Celigo 文档经 Zendesk 帮助中心接口读取全文（网页有 Cloudflare 拦截），Boomi 文档读取 help.boomi.com 当前版本。用户评价来自 Capterra、PeerSpot、Celigo 官方社区 Connective、Hacker News。G2、TrustRadius、Reddit 拒绝抓取；知乎需要登录；V2EX 上只检索到一篇 Gartner 报告译文，没有两款产品的使用讨论。以上渠道标为「未查到」。

## 先说结论

1. **两家都把「一条业务记录的身份」当作运维的脊梁。** Celigo 叫 trace key（追踪键），去重、自动关闭错误、按记录检索、端到端追踪全靠它；Boomi 叫 tracked fields（追踪字段），要事先在连接器操作上配好，不追溯历史。没配好的后果有用户原话：Boomi 里「查一笔交易要几个小时，只能一个个时间戳去翻」。
2. **Celigo 的错误工作台是这一类产品里最成熟的交互**：按流程步骤聚合、按分类过滤、同一追踪键只留最新一条、可编辑「重试数据」、单条/整页/全部重试、指派和标签、内嵌 AI。它的问题也暴露得最清楚：「全部重试」无视筛选条件，一页最多选 1000 条；重试从失败的那一步接着跑，若该步设成「失败也继续往下走」，重试成功后不会再推给下游，用户只好绕开它「从头再跑这条记录」。
3. **「自动解决」实际上只有四条内置规则**：按追踪键合并重复错误、临时故障自动重试、限流自动降并发、连接失效时暂停流程并定时探测恢复。其余「某类错误自动重试/自动忽略」要用户自己搭流程调平台 API 或写脚本。可配置的处理规则是空白地带。
4. **告警两家都很粗**：15 分钟一次的邮件汇总，按个人订阅。Celigo 只能发给平台内的账号（官方建议用组邮箱注册一个只读账号来绕），Boomi 要替别人配置订阅只能用别人的账号登录。
5. **Boomi 最值得抄的一个动作**：在运行报告里选一条生产环境的失败文档，「在测试模式里重跑」，它会走构建页上最新（未发布）的流程版本。修完先用真实失败数据验证，再发布、再重放，这个闭环 Celigo 没有。
6. **预制集成暴露配置的两种思路**：Celigo 的 integration app 用业务语言的设置页（按订单、客户、税、发货分页签），把反复出现的数据错误变成开关（「手机号不合法时自动去掉」「名字超长时截断」）；Boomi 让开发者在流程里声明「扩展点」，部署到每个环境时逐项填值，勾「沿用默认」即不覆盖。
7. **AI 现在真正能做的**：错误分类（Celigo，已上线多年）；按文档和社区检索给建议（Boomi Resolve Agent，仅英文、仅北美区）；读上下文给修复建议并把改动做成待确认的草稿（Celigo Ora，测试版，改错的配置没有回滚）。没有一家会先用失败记录验证修复再应用。

---

## 1. 核心对象模型

### Celigo integrator.io

| 层级 | 对象 | 说明 |
| --- | --- | --- |
| 账号 | Account → Environment | 多环境许可下每个环境资源隔离；旧的 Production/Sandbox 许可两边**共用同一套资源**，在一边改就是两边都改（[通知逻辑文档](https://docs.celigo.com/hc/en-us/articles/8864920211355)） |
| 组织 | Integration（首页上的一个磁贴）→ Flow group → Flow | Integration 内有 Flows、Dashboard、Connections、Notifications、Audit log、Analytics、Users、Admin、Aliases、Revisions、Settings 等页签（[Navigate your integration](https://docs.celigo.com/hc/en-us/articles/360025641652)） |
| 流程步骤 | Export（来源）/ Lookup / Import（目标），每步可挂 Transformation、Filter、Hook、Mapping、Response mapping | 资源（Connection、Export、Import、Script、Lookup cache）是全局共享的，改一处影响所有引用它的流程 |
| 运行 | Job（一次运行）→ Record（以 trace key 标识）→ **Error（挂在某个流程步骤上，带可编辑的 retry data）** → Retry job | 错误是一等对象，有状态（Open / Resolved：auto 或 user）、分类、来源、指派人、标签 |
| 版本 | Revision：snapshot / pull / revert | 见第 4 节 |
| 预制 | Integration app（托管、组件锁定、可升级）与 Template（装完即解锁的副本，不再更新） | [IA vs Template](https://docs.celigo.com/hc/en-us/articles/235469468) |
| 配置 | Custom settings（JSON）+ Form builder 生成的表单 | 可定义在 integration、flow、connection、export、import 上 |

### Boomi

| 层级 | 对象 | 说明 |
| --- | --- | --- |
| 账号 | Account；伙伴有 Account group 管多个客户账号 | |
| 构建 | Component：Process、Connection、Operation、Profile、Map、Cross Reference Table、Process Property 等，放在 Component Explorer 的文件夹里 | 组件被多个流程复用，改一次处处生效；「Show Where Used」查引用（[Component references](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/int-Component_references_8d7cf9db-2716-4301-b8d8-46eb9f055999)） |
| 版本与部署 | Packaged Component（流程连同依赖组件的快照，有版本号）→ Deployment 到 Environment | [Deployment](https://help.boomi.com/docs/Atomsphere/Integration/Deployment/c-atm-Deployment_4e723d20-3e2b-41b7-8d57-010dccb940b8) |
| 运行时 | Runtime：basic runtime（旧称 Atom）、runtime cluster（Molecule）、runtime cloud（Atom Cloud），挂到环境上 | 日志和处理过的文档存在运行时本地 |
| 环境 | Environment：分类 Production / Test（创建后不能改）、Roles with Access、Extensions | [Environment management](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Environment_management_1ec94aeb-ffaf-4cec-a3b0-483c2af3967c) |
| 运行 | Execution → 按连接分组的 **Document** → Process log / Document log | 运维的基本单位是「文档」，一个文档可以是一批记录；错误分进程级和文档级 |
| 预制 | Integration Pack（伙伴把可共享的打包组件发给客户账号）+ Process Library | |
| 消息 | Event Streams：Topic → Subscription（Exclusive/Shared/Failover）→ Backlog / Dead letter | |

**对比**：Celigo 的错误是「某条记录在某一步卡住了」，天然适合值班处理；Boomi 的错误是「某次运行里某个连接上的某个文档失败了」，更接近运行日志，值班要自己从执行往下钻。

---

## 2. 搭建体验

### Celigo

从空白到第一条集成（[Create custom flows](https://docs.celigo.com/hc/en-us/articles/360025919171)）：

1. 左侧 **Build > Flows > + Create flow**，抽屉里填名称、选所属 Integration（必须先有 Integration）、可选 Flow group。
2. Flow builder 画布上点 **Add source**，选应用，再选「What would you like to do?」：导出记录 / 传文件 / 监听实时数据；选已有连接或点 **+** 新建。
3. Export 表单：名称、HTTP 方法与路径、**Export type**（All / Delta / Once / Limit，Limit 最多 100 条专供测试）、分页，然后 **Preview** 看真实返回（[HTTP export](https://docs.celigo.com/hc/en-us/articles/360044407971)）。高级区有两个运维相关的设置：**Data URI template**（错误里生成回源系统记录的链接）和 **Override trace key template**。
4. **Add destination / lookup**，配 Import；点步骤上的映射图标进入 **Mapper 2.0**：左边逐行建目标字段（类型、是否必填），右上是来源样例，右下实时预览输出；映射类型分标准、固定值、Handlebars 表达式、查找（动态 / 静态值对值 / Lookup cache），菜单里有「自动填充目标字段」「自动映射」（[Mapper 2.0](https://docs.celigo.com/hc/en-us/articles/4536629083035)）。
5. 测试：流程未启用时自动处于测试模式，**Run** 变成 **Run test**。来源可用 Mock output，目标用 Mock response，「Populate with > Live data / Sample data」一键填。跑完后每个处理环节（转换、过滤、映射、脚本）旁出现结果图标，点开逐条看输入和输出，过滤结果分 Success 和 Success (ignored)。只跑第一页数据；端点两分钟不响应或出现未捕获异常时 5 分钟后自动取消；改了流程结果就清空；仪表盘不计测试运行（[Test mode](https://docs.celigo.com/hc/en-us/articles/16837144477339)）。
6. 启用、设定时间表。

复用：共享资源、Lookup cache（全局键值表）、Aliases（脚本里用别名引用连接）、2026 年新增的 Tools（有 JSON Schema 输入输出契约的可复用逻辑块）、模板和 integration app。

### Boomi

1. **Build** 页左侧 Component Explorer 新建 Process；画布上从 Start 步骤开始，连接器步骤由 Connection（地址和凭证）和 Operation（具体动作）两个组件组成，Operation 可以从应用里「导入」生成 Profile（数据结构）（[Connectors](https://help.boomi.com/docs/Atomsphere/Integration/Connectors/c-atm-Connectors_bb305b35-0f13-4937-a918-f85dbbe1b27b)）。
2. 映射用 Map 组件：左右两棵 Profile 树之间拖线，中间插函数；**Boomi Suggest** 弹向导，按高、中、低置信度三页逐条勾选建议（[Boomi Suggest](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/t-atm-Using_Boomi_Suggest_to_map_elements_9663a5a5-8b8b-441a-8923-905fd7e01234)）。值对照用 Cross Reference Table，任一列都可作查找键，支持精确、通配符、正则匹配。
3. 测试：点 **Test**，选运行时，可填 **Test Extensions**（测试用的环境配置值），**Run Test**。画布变灰不可编辑，正在跑的步骤黄色、成功绿色、失败红色；点步骤看「Documents」编号列表，每个文档有 Connection Data / Step Source Data / Logs 页签，「View Source」打开文档查看器。**Retry Previous Test** 可以拿上次抓到的文档重跑，不用再去源系统取数。退出测试模式后数据全部丢失（[Test mode operations](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/t-atm-Test_mode_operations_4da90c4b-3c2f-4479-a341-a17e2b6199e0)、[Logs and documents in test mode](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/c-atm-Logs_and_documents_in_test_mode_844762ff-8656-41c4-ab6b-498d8f2e10dd)）。
4. 打包（Packaged Component）→ 部署到测试环境 → 设环境扩展值 → 部署到生产 → 在 Runtime Management 的 Deployed Processes 面板设时间表。

复用：组件级复用、子流程（Process Call）、Process Library、Integration Pack。

---

## 3. 运行与运维

### 3.1 运行记录怎么查，能否按业务数据搜

**Celigo**（[Monitor errors](https://docs.celigo.com/hc/en-us/articles/360048814732)、[View flow run logs](https://docs.celigo.com/hc/en-us/articles/45564542727067)）

- 左侧 **Dashboard**：Running flows（实时成功、忽略、错误计数）和 Completed flows（按时间范围，「Open errors」是当前未解决总数而不是那次运行的数，另有 Auto-resolved / User-resolved 计数）。可按 integration、环境、状态过滤。
- Flow builder 每个步骤气泡上显示该步当前未解决错误数；**Run console** 只看最近一次运行；**Run history** 保留最近 1000 次，按时间范围、状态过滤，「Hide empty runs」隐藏空跑。
- **Run logs**（2026 年的执行日志）：每条记录一行（时间、状态、步骤、应用、耗时、trace key），点「Open trace view」看这条记录在整个流程里每一步的经过；运行历史可以**按 trace key 全值或前缀搜索**，一对多拆分时可按子记录过滤。trace key 重复时显示「Duplicate」徽标，只能看单步视图。限制：目前只支持 HTTP、Salesforce、NetSuite，重试任务不记日志。
- **Tools > Reports**：按集成、流程、最多 3 天范围导出事件 CSV，每行一条记录事件，第一列就是 traceKey，带 exportDataURI 回源链接、错误码和分类（[Flow events report](https://docs.celigo.com/hc/en-us/articles/4402565285389)）。
- trace key 默认由平台猜「最可能唯一的字段」，猜不出就空着；可在 Export 高级设置用 Handlebars 改写（如 `{{join "-" record.product_name record.product_code}}`），最长 256 字符，超长从中间截断；**integration app 里的流程不能改写**（[Trace key](https://docs.celigo.com/hc/en-us/articles/360060740672)）。

**Boomi**（[Process reporting](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Process_reporting_c49a74c4-026d-4c0d-a69e-4fca30ed34a3)）

- **Manage > Process Reporting**，默认显示过去一小时；分 Executions / Documents / Trading Partner 三个视图。执行视图可按运行时、流程、执行 ID、执行方式（Listener、Manual、Manual Retry、Scheduled、Scheduled Retry、Sub Process、Test Mode）过滤，「Hide Successes with 0 Inbound Docs」隐藏空跑。
- 点时间链接，执行详情从右侧滑出：每个连接一个方框，显示成功数和失败数（各是链接），下面列出 Start 步骤失败的前 5 个文档；Actions 里有 View Process Logs、View Process State（每步执行顺序和耗时）、View Deployment Components、取消执行；文档的 Actions 有 View Document、Re-run、Run in Test Mode、**View Linked Documents**（这个文档在前后连接上对应的文档）（[执行详情](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/r-atm-Process_execution_detail_view_e48ac4f2-36ed-49f3-9ea0-7fb562a05da4)）。
- 按业务数据搜：只能在 Documents 视图用 **Tracked Fields** 过滤。追踪字段由管理员在 **Settings > Document Tracking** 定义，最多 20 个（字符、数字、日期），每个值最长 1000 字符，再到每个连接器操作上配取值；部署之后才开始记录，**不追溯历史**，integration pack 不能用（[Document Tracking](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Document_Tracking_bf2f68f0-a8b1-4efc-8726-424341acaccc)）。
- 限制：平台只保留 30 天（要延长得找 Boomi）；每次执行只报告前 10,000 个文档；**日志和文档存在运行时本地，运行时离线就看不了**（[Log viewing](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Process_and_document_log_viewing_b4a3524e-7797-4406-b1fe-1f2ff0b2bfc6)）；低延迟模式不生成完整日志也不发告警。

### 3.2 错误如何聚合与分类

**Celigo 的 Errors 页**（[Errors page](https://docs.celigo.com/hc/en-us/articles/10080012410651)）

- 入口：点仪表盘或流程步骤上的错误数。**作用域是单个流程步骤**。三个页签：Open errors、Resolved errors（标明 auto resolved 还是 user resolved）、Retries。
- 左右分栏：左边列表，右边详情，可隐藏详情只看列表；列宽、列顺序、显示哪些列、详情栏开合都跨会话记住。单页最多 1000 条，整个列表最多 20,000 条；搜索和过滤作用于整个列表。
- 列：Timestamp、Message（这两列不能隐藏）、Ora 图标、Classification、Code、Source、Assign、Tag、Trace key、Error ID（默认隐藏）。只能按时间排序。过滤：Source、Classification、Assign、Tag，支持「空值」。
- **Source** 告诉你错在哪：外部应用名（如 Zendesk Support），或平台内部环节（Mapping、Transformation、Hook、Filter、Lookup）；显示「internal」说明是 Celigo 自己的故障，只能提工单。
- **Classification**（只读，平台按代码、消息、来源自动判定，判不准就留空）共 8 类，并配了「看到这类该做什么」（[Error classifications](https://docs.celigo.com/hc/en-us/articles/4403697564429)、[Resolve errors](https://docs.celigo.com/hc/en-us/articles/16182564553371)）：

| 分类 | 典型原因 | 建议动作 |
| --- | --- | --- |
| Connection | 凭证错误、令牌过期、无权限编辑该记录 | 重新授权，检查权限 |
| Rate limit | 429、超出配额 | 调并发或等配额恢复（可自动） |
| Intermittent | 超时、502/504、连接被重置 | 自动重试 |
| Value | 值被目标拒绝（电话格式、状态不允许改） | 核对数据格式 |
| Missing | 必填字段缺失、查找找不到匹配 | 补源数据 |
| Duplicate | 目标已存在、查找命中多条 | 修映射避免重复 |
| Too large | 413、超出响应大小或脚本时长 | 减页大小、预过滤 |
| Parse | 脚本语法错、JSON 不合法、Handlebars 编译失败 | 修映射或表达式 |

- **按 trace key 合并**：开启「Auto-resolve errors with the matching trace key」（流程设置，默认开）后，同一步骤上同一 trace key 出现新错误，旧错误自动移到已解决；这条记录后来成功或被忽略，旧错误也自动解决。效果是每条记录在每一步只留最新一个阻塞原因（[Best practices 2](https://docs.celigo.com/hc/en-us/articles/16179013311771)）。
- 协作：给错误打自定义标签、指派给账号内的人（被指派人收邮件）。2022 年起有用户要求「给错误加备注和状态（等待处理中）」，因为常要等业务部门几天，只能在外部记笔记（[Connective #582](https://connective.celigo.com/t/feature-request-add-notes-to-errors-maybe-even-a-status/582)）；当前文档里只看到标签和指派，未查到备注或状态字段。

**Boomi** 未查到按原因聚合错误的界面：错误挂在执行和文档上。仪表盘的 Process Errors 小组件列出最近出错的流程，点「Load Errored Executions」跳到对应执行（[Account Dashboard](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/Account_dashboard)）。点错误消息打开 Document Error Details：执行 ID、流程名和修订号、出错步骤类型、步骤用到的组件和修订号（都可点开）、引用的文档、堆栈；旁边是 Resolve Agent 页签。分类、指派、标签都未查到。设计期能做的是在流程里放 Try/Catch（失败文档带原文和 Try/Catch Message 走 Catch 分支）和 Exception 步骤，自己写错误分流逻辑。

### 3.3 重试、重放、改数据后重试

**Celigo：改数据后重试的完整交互**

1. 收到邮件或在仪表盘看到错误数，点进对应步骤的 Errors 页，Open errors 页签。
2. 先按 Classification 过滤（比如先处理 Connection 类，修好连接后整批重试），再看 Source 和 Message。
3. 选中一行，右侧详情四块：**Retry data**（这条记录的数据载荷，文档称 source data payload，唯一可编辑的部分）、Fields（消息、代码、来源、时间、ID、分类）、Request 和 Response（原始请求和响应，仅 HTTP、NetSuite、Salesforce 步骤有）。trace key 显示在详情顶部。若配了 Data URI template，还有回源系统记录的链接。
4. 改 Retry data（比如把电话号码改对）并保存。**保存了但还没重试的，列表里那条前面出现一个蓝点**，全队可见，跨会话保留。
5. 点详情里的 **Retry**；或勾选多条/勾「Select all」（只选当前页，最多 1000 条）点底部 **Retry**；或 **Manage all > Retry all**（整个列表，最多 20,000 条）。按钮上显示条数。注意：**Select all 和 Retry all 都无视当前的过滤和搜索**。
6. 页面顶部出现「Retrying errors」，完成后变「Retry completed」，点「View results」。**Retries** 页签记录每次重试：状态（Completed 绿色全成功 / Completed 黄色仍有错误 / Canceled）、耗时、开始结束时间、成功数、忽略数、错误数、发起人（自动重试显示「Auto-retried」），进行中的可以「Cancel retry」，已处理的不会回滚（[Monitor and manage retries](https://docs.celigo.com/hc/en-us/articles/10107073900571)）。
7. 重试成功的错误进 Resolved（user resolved）。不想重跑的点 **Resolve**，直接移走（官方说用于「清理噪音」或已在外部处理）。

语义细节：

- 重试从**失败的那一步**接着跑，用的是存下的 retry data。步骤上「What should happen to a record if the import fails?」默认「Pause here until someone can fix the error」，记录停在这一步，重试成功后才往下走；若选「Proceed to the next application regardless」，失败记录照样往下游走，**之后重试成功也不会再推给下游**（[Failed records](https://docs.celigo.com/hc/en-us/articles/4414777521307)）。社区里用户因此遇到「重试成功了，但回写 NetSuite 状态的分支没执行」，解决办法是把错误状态写回 ERP，再「对这条记录从头跑一遍整个流程，而不是靠重试」（[Connective #4795](https://connective.celigo.com/t/flow-steps-after-proceed-to-next-application-doesn-t-run-after-retry/4795)）。
- 下游失败不会回滚 Delta 导出的时间点，失败记录除非源数据再变，下次不会再被导出；官方建议用错误重试，或做一个对账/补发流程，并且只在目标确认成功后打完成标记（同上文档）。
- 保留期：每步只保留最近 20,000 条错误的 retry data；默认 30 天内的错误可重试，按套餐最长 180 天。
- 权限：权限文档写明 Monitor 角色可以运行流程、重试、解决、指派；邀请 Monitor 用户时有「Users can edit retry data」开关，默认开（[Permissions](https://docs.celigo.com/hc/en-us/articles/115003929872)）。另一篇文档说重试需要 Manage 权限，两处不一致，以权限文档为准。
- Ora 批量改数据（测试版）：点任一错误的 Ora 图标，用自然语言描述「把这些错误里的 296026139 换成 91967422740 再重试」，支持替换值、设字段、从别的字段复制、删行项目。Ora 先拿一批真实失败记录验证，再把修改后的数据作为待确认项列出，**目前只能逐条接受**；列表里勾选的错误不会传给 Ora，要先打标签再让 Ora 按标签过滤（[Ora error management](https://docs.celigo.com/hc/en-us/articles/51210588304155)）。

**Boomi：重跑文档**（[Rerunning documents](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Rerunning_documents_in_Process_Reporting_bc807a70-0433-4770-9f91-779e573fb816)）

- 重跑的单位是 **Start 步骤进来的文档**，从流程开头整体再跑，不是从失败步骤接着跑。也适合源数据已经不存在的情况（比如 FTP 文件取完即删）。
- 交互：执行详情 → 连接方框的 Errors 链接 → 文档列表 → 单条 Actions「Re-run Document」；或勾选（全选只选当前页，最多 25 个）点「Re-run documents」，再选 All Errors / All Successes / Selected。**不能跨执行一次重跑**，每次执行要单独进去点。
- **Re-run Document in Test Mode**：弹窗把生产文档送进构建页上最新的流程版本，按测试模式逐步展示，最多 100 个。
- **改数据后重跑：未查到**界面里编辑文档内容再重跑的功能，只能改源数据或改流程。
- 运行时崩溃：重启后执行显示「Recovering documents...」，恢复完变「Process aborted...」，再从 Start 步骤的 Errors 里选文档重跑（[Document viewing](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Process_execution_document_viewing_6f00f633-7472-4a85-8f37-c8e91042baa7)）。

### 3.4 自动解决的规则

| 规则 | Celigo | Boomi |
| --- | --- | --- |
| 重复错误 | 同一 trace key 新错误或成功后，旧错误自动解决 | 无此概念；重试成功后原执行**仍是红色** |
| 临时故障 | 分类为 Intermittent 时自动重试最多 4 次，文档列出的时间点为 00:30、01:30、03:30、07:30（未注明单位；另一篇通知文档说运行中重试持续约 5 分钟，两处对不上） | Try/Catch 的 Retry Count 0–5 次，依次等 0、10、30、60、120 秒；**Retry schedule** 按计划自动重跑所有失败文档，可设最大次数（[Retry schedules](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Retry_execution_schedules_aebf64ee-0cdc-4985-9263-2dff0a463d56)） |
| 限流 | 连接设置「Auto-recover rate limit errors」+ 目标并发：遇到限流并发降到 1，间隔 1、2、4 分钟……最长 1024 分钟加倍重试，逐步恢复到目标并发 | 未查到连接级的限流自适应 |
| 连接失效 | 分类为 Connection 时暂停流程，按 1、2、4、8、16、32 小时退避探测，恢复后自动续跑（[Best practices 1](https://docs.celigo.com/hc/en-us/articles/10972500798107)） | 运行时离线由平台检测（45 秒到 4 分钟），重启后恢复文档 |
| 消息队列 | — | Event Streams：最大重试次数，退避立即、10、30、60、120 秒，之后每 5 分钟；超限进该订阅的死信；有序订阅不开「Enable Dead Letter Routing on Failure」会**一直卡在这条消息上**（[Event Streams operation](https://help.boomi.com/docs/Atomsphere/Event%20Streams/es-event_streams_operation_c4a09f7a-17fb-4212-8955-dd561a3fb121)） |
| 自定义规则 | 平台不提供；官方给的办法是装「Error automation via integrator.io APIs」模板（两个流程，按流程 ID、步骤 ID、错误消息、错误码筛出错误再调 /retry 或 /resolve），或写 postSubmit 脚本忽略特定错误（[模板](https://docs.celigo.com/hc/en-us/articles/24194391589147)） | 在流程里用 Try/Catch、Decision 自己写 |

Celigo 文档称 2022 年 9 月某一周平台自动解决和自动重试了 430 万条错误（厂商自述）。Retry schedule 有个坑：部署后会把**过去所有执行**的失败文档都拿来重跑，想阻止只能删运行时 `execution/error` 目录下的文件并重启，云运行时得找客服。

### 3.5 告警

| | Celigo | Boomi |
| --- | --- | --- |
| 渠道 | 只有邮件；Slack 要自己搭流程或用模板 | 邮件、RSS；流程里 Notify 步骤可发自定义事件 |
| 订阅单位 | 每人在 Integration 的 Notifications 页签勾选：哪些流程出错通知我、哪些连接离线通知我；有 Manage 权限的人可在 Users 页签替别人配 | 每人在 **Settings > My User Settings > Email Alerts** 按账号订阅：事件类型（ATOM.STATUS / PROCESS.EXECUTION / USER.NOTIFICATION / ALL）× 级别（INFO / WARNING / ERROR）；**要替别人配置只能用对方账号登录** |
| 频率 | 每 15 分钟检查一次，邮件汇总新增、已解决、当前未解决数和明细 | 每 15 分钟轮询，按事件类型合并成一封；运行时离线检测后要等到下一个 15 分钟整点才发 |
| 去噪 | 自动解决前没发过通知的错误不再发；发过的会补一封「已自动解决」；临时故障重试成功不发 | 测试分类环境不发告警；低延迟流程不发 |
| 环境 | 每个环境要分别订阅；非生产环境的邮件主题里带环境名 | — |
| 收件人 | 只能是平台账号；官方建议给部门组邮箱建一个只读账号来收 | 平台用户 |

来源：[Celigo 通知逻辑](https://docs.celigo.com/hc/en-us/articles/8864920211355)、[Celigo 订阅](https://docs.celigo.com/hc/en-us/articles/8961419557019)、[Boomi Email Alerts](https://help.boomi.com/docs/Atomsphere/Platform/c-atm-_Email_alert_management_88a27564-0062-4cd8-9dfb-2226b122b1da)、[Boomi 添加订阅](https://help.boomi.com/docs/Atomsphere/Platform/t-atm-Adding_an_email_subscription_7eb61f01-4a5a-4523-9134-776686fbd32e)、[Notify step](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/r-atm-Notify_shape_370d8b10-3713-4ea1-95d6-a2e82db7928d)。

### 3.6 值班人的一天

以下按官方文档描述的界面和流程还原，时间是示意。

**在 Celigo 里**

- 08:40 邮箱里有几封 15 分钟汇总邮件：「订单导入」流程新增 37 条错误；另有一封「NetSuite 连接离线」和一封「该连接已恢复」（流程期间被自动暂停，又自动续跑了）。
- 08:45 打开 Dashboard → Completed flows，按 integration 过滤，看到「订单导入」的 Open errors 是 37，Auto-resolved 有 120（夜里的超时被自动重试掉了）。
- 08:50 在 Flow builder 里看到错误集中在「导入销售订单」这一步，点错误数进 Errors 页。按 Classification 过滤：Missing 30 条，Value 7 条。
- 09:00 Missing 类的 Message 都是「Could not find mapping in static lookup ... Key: direct」：新出了一种支付方式。去 Flows > Order > Edit mappings，在 Payment Method 的查找里加一行「direct → 对应值」（[missing_static_lookup](https://docs.celigo.com/hc/en-us/articles/115000307691)）。回到 Errors 页，在 Missing 过滤下逐条勾这 30 条再点 Retry：全选和 Retry all 都不认筛选条件，用了会把 7 条 Value 类也一起重试。
- 09:15 Value 类是电话格式不合法。急的两单直接改 retry data 再重试；其余指派给负责电商后台的同事，打标签「等店铺修正」。有用户反映这类单子常要等几天，备注只能记在外部（Connective #582）。
- 09:30 Retries 页签确认 30 条成功；剩下 5 条点 Ora 图标看分析，Ora 给出原因、步骤和文档链接。
- 10:00 前一天还正常的流程今天全错，去 Audit log 页签按时间、用户过滤，看到有人改了导入字段。如果改动前有人做过快照，就在 Revisions 里回滚；没有就只能照着审计日志里的旧值手工改回去，因为普通保存不会生成修订（[Revisions](https://docs.celigo.com/hc/en-us/articles/6662583168027)）。
- 全天：每 15 分钟一封汇总邮件。用户评价里有人说「总在报错，得 7×24 小时盯着」（Capterra，2020）。

**在 Boomi 里**

- 08:40 邮件：PROCESS.EXECUTION 级别 ERROR，附执行 ID 和 Process Reporting 链接；另一封 ATOM.STATUS 说某运行时凌晨离线又上线。
- 08:45 Dashboard > Account Dashboard，Offline Runtimes 已清零；Process Errors 小组件里列出出错流程，点「Load Errored Executions」。
- 08:50 Process Reporting 的 Errors 结果里点执行时间，详情滑出：「NetSuite 订单」连接 Errors 12。点进去看文档列表，点错误消息，Document Error Details 给出步骤、组件修订号和堆栈；点「Generate Solution with Resolve Agent」，得到最多 10 条按相关度排序的建议和社区链接。
- 09:00 想看数据内容，「View Document」需要 View Data 权限；日志和处理过的文档都存在运行时本地，文档明确说运行时离线时看不了日志。
- 09:10 业务问「订单 SO-1234 到哪了」：切到 Documents 视图，用追踪字段「Order Number」过滤；如果当初没配这个追踪字段，就只能按时间段一个个执行翻（PeerSpot 用户原话见第 8 节）。
- 09:30 在 Build 里改 Map，选失败文档「Re-run Document in Test Mode」用新版本验证，通过后打包、部署到生产（Production Support 角色可以部署）。
- 10:00 回到 Process Reporting，在每个失败执行里各点一次「Re-run documents > All Errors」（不能跨执行批量）。
- 10:30 Runtime Management：Listeners 面板确认监听都在跑；Queue Management 看死信（旧版 Atom Queue 可以在这里选中死信 Retry）；Event Streams 的仪表盘看各订阅的积压和死信积压，在 Message Management 里查看、下载、删除消息（[Message Management](https://help.boomi.com/docs/Atomsphere/Event%20Streams/es-Event_streams_message_management)；界面里一键重新投递死信未查到，文档给的是在流程里用「Consume from Dead Letter」去消费）。

---

## 4. 生命周期

**Celigo**

- 环境：多环境许可下可建开发、测试等环境，资源隔离；旧许可的 Sandbox 和生产共用资源。
- 资源保存即对后续运行生效，文档里没有草稿与发布之分；Ora 文档建议「先克隆集成、在克隆上试、再用 ILM 合并回去」，因为「Ora 改了生产流程没有内置的回滚」（[Ora overview](https://docs.celigo.com/hc/en-us/articles/25951095481755)）。
- ILM（[overview](https://docs.celigo.com/hc/en-us/articles/5349100943003)、[pull](https://docs.celigo.com/hc/en-us/articles/6685876051099)、[revisions](https://docs.celigo.com/hc/en-us/articles/6662583168027)）：修订只在 pull、revert、snapshot 时生成，普通保存不生成；只能整个 integration 克隆；在克隆上改，然后在目标上 **Revisions > Create Pull**，Review Changes 面板对比 Current 和 Remote，处理冲突后 Merge；合并前后自动快照，可「Revert to before / after this revision」；也可手动「Create snapshot」。坑：两边都改过会冲突，「不要同时改原集成和克隆」；改名、重建组件多了会丢失 ID 对应，Review 里同一组件同时出现 Removed 和 New，官方说**这时不要继续**，只能重新克隆，修订历史清零；Lookup cache 的数据不随 pull 走；带认证的实时监听要重新填密钥。
- 审计：保留至少一年，单次下载 20,000 条；每条记录 Source 字段：UI、API、Stack、System、Integration app、Ora、CLI、MCP，由服务端判定（[Audit logs](https://docs.celigo.com/hc/en-us/articles/6514515710107)）。
- 多人协作：未查到编辑锁的文档。依赖分析：资源页提醒检查 References；Ora 声称能「改动前在全账号范围画出影响面」。

**Boomi**

- Build 上的修改不影响已部署版本；打包是带依赖组件的快照；部署新版本时进行中的执行用旧版本跑完。
- **Compare Deployments**：选一个已部署版本，和「Latest Revision in Development」或另一版本比，结果表列出主组件和子组件，有变化的行标黄，可筛「With Changes」（[Compare](https://help.boomi.com/docs/Atomsphere/Integration/Deployment/int-Comparing_versions_of_a_deployed_component_3cc43f0b-6604-4e80-a3a5-06bf521461ba)）。
- **Rollback**：Deployments 列表 Actions > Rollback，只能选**曾经部署到这个环境的版本**，填部署备注，Review 后 Deploy（[Rollback](https://help.boomi.com/docs/Atomsphere/Integration/Deployment/int-Rolling_back_a_deployed_version_of_a_packaged_component_c997c129-e146-4985-9741-1cecd916f0ba)）。
- **Branch and Merge**：管理员开启后不能关闭；有分支选择器、分支管理、合并请求，可从已部署版本直接拉 hotfix 分支（[Branch and merge](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/int-Branch_merge_overview)）。
- **Component locking**：默认关闭，不开就是「后保存的覆盖先保存的」；开了之后打开组件是只读，点「Lock & Edit」才能改，管理员可以抢锁；保存旧修订时弹窗让你选覆盖还是放弃并重载（[Locking](https://help.boomi.com/docs/Atomsphere/Integration/Process%20building/c-atm-Component_locking_9c951ff5-186e-46eb-908e-bf32b55e87b2)）。
- **环境扩展**：开发者在流程里声明哪些设置可按环境覆盖（连接设置、操作设置、流程属性、交叉引用表、数据映射、PGP 证书等）；Runtime Management 里选环境 → Environment Extensions，按页签逐项填值，每项一个「Use Default?」勾选框。保存后该环境**所有监听重启**；流程取消部署后扩展值界面上消失但还留在 override.xml 里，重新部署会悄悄恢复（[Environment extensions](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/Setting_environment_extensions)）。扩展值的修改有审计，但界面只显示最近一个月，新值以原始 XML 展示（[Audit](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/t-atm-Viewing_audit_log_entries_599f341b-ca7d-4312-a17d-ec93140a1536)）。
- 运行时升级：Runtime Release 在平台发布前两周提供，可选第一周、最后一周或随正式发布，并指定星期、小时、时区（[Release scheduling](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/r-atm-Release_Control_Scheduling_panel_561dc2b7-3beb-49aa-91a4-8d0f6ed95685)）。

---

## 5. 治理

**Celigo**

- 角色：Owner、Admin、Manage all、Monitor all、Custom（按 integration 分别给 Manage 或 Monitor）。Monitor 能看、能运行流程、能重试和解决错误、能指派，不能改流程、连接、令牌。邀请时可单独要求 SSO 或 MFA。
- 日志与数据：执行日志分 Basic（默认，不存载荷）、Detailed（存请求响应载荷和头）、Debug（连内部步骤的输入输出都存）。要用 Detailed 或 Debug，管理员必须在该环境打开「Store payload」，这是一次留审计的授权；普通用户点「Request admin approval」发邮件申请，24 小时内只能发一次。Debug 是限时的：最短 5 分钟，最长按套餐 1、24、72 小时。保留期可选 7、15、30、60、180 天；可按日期范围删除日志，运行历史和错误保留，删除动作进审计。认证令牌、API 密钥在日志里总是脱敏（[Execution logs](https://docs.celigo.com/hc/en-us/articles/45404136636699)）。
- Export 有「Do not store retry data」，Import 有「Purge blob data immediately」，但一旦授权了载荷存储，Detailed/Debug 模式会覆盖这两个设置并弹提示。
- 凭证：Connection 是账号级共享资源；integration app 的连接不能换到另一个应用实例（另一家店铺、另一个 NetSuite 账号）。

**Boomi**

- 内置角色 Administrator、Standard User、Production Support、Support，可自定义角色。关键权限拆得很细：**View Results**（看执行情况和日志，不看数据）与 **View Data**（看文档内容）分开；**Execute**（执行或重试）；Packaged Component Deployment；Runtime Management（可只读）；Environment Extensions Edit / Read Only；View Audit Logs；只有管理员能加追踪字段、管理环境、发布 SDK 连接器（[Roles](https://help.boomi.com/docs/Atomsphere/Platform/c-atm-User_roles_and_privileges_5a1c8a1a-4d58-4e7d-a6b6-b684a0c6d672)）。
- 环境上可挂「Roles with Access」，挂了之后只有这些角色能进；文件夹也能设哪些角色可修改。
- 凭证：放在 Connection 组件里，按环境用扩展覆盖；可选的 Secrets Management 让环境扩展只引用客户自己的 AWS、Azure、GCP 密钥库里的密钥，平台只存引用，运行时取值并可清缓存以配合轮换（需单独开通功能，[Secrets Management](https://help.boomi.com/docs/Atomsphere/Platform/c-atm-Secrets_Management)）。
- 数据保留：运行时本地默认 30 天，「Purge History After x Days」可调，日志、文档、临时数据、组件可分别设；「Purge Data Immediately」执行完立即删文档；要长期保存用连接器操作归档或运行时级归档（[Purging](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Purging_of_Atom_Molecule_or_Cloud_logs_and_data_c3d9858e-c3de-4817-b08a-d8d6a5ac1e9a)）。
- DataDetective：按字段名和步骤名把数据分类为个人信息，地图和表格展示个人信息在哪些流程、连接器、国家之间流动；每周刷新，不读实际数据，EU 区不可用（[DataDetective](https://help.boomi.com/docs/Atomsphere/Platform/atm-BoomiAI_PII_Insights)）。

---

## 6. 连接器策略

**Celigo**：「几百个」应用连接器，大多建在一个通用 HTTP 连接器和一个通用 GraphQL 连接器之上，同一个连接器可在 Simple 表单和 HTTP/GraphQL 表单之间切换，Simple 表单列出必填参数、给出下拉选项、默认最新 API 版本（[Application vs universal](https://docs.celigo.com/hc/en-us/articles/10841316566043)）；通用连接器还有 FTP、AS2、SQL 等；HTTP 也覆盖不了的用 Wrapper（开发者写 stack）。第三方开发者计划可发布模板和 integration app（IAF 2.0，[Publish](https://docs.celigo.com/hc/en-us/articles/360048995431)）。从 OpenAPI 或 API 文档生成连接器：未查到。

**Boomi**：应用、事件驱动、技术三类连接器加 Java 的 Connector SDK；每个连接器拆成 Connection 和 Operation 两个组件；按部署出去的连接数计许可，分 Small Business、Standard、Enterprise、Trading Partner 四档，部署到不同运行时会多算（用环境扩展可以复用同一个连接组件）；公开了十几个开源连接器的代码。**OpenAPI connector** 读 OpenAPI 3.0 规范直接生成请求和响应结构，「不用写 Java 就有应用连接器的体验」（[OpenAPI connector](https://help.boomi.com/docs/Atomsphere/Integration/Connectors/int-OpenAPI_connector_6766251b-b601-41f5-8c13-86d79faf52b9)）；另有 Data Connector Agent 用 AI 为任意 REST 数据源生成数据连接器（面向数据集成）。

---

## 7. AI 能力（现在能用的）

**Celigo**

- 错误分类：已上线多年，按代码、消息、来源自动归 8 类，判不准留空（[Classification](https://docs.celigo.com/hc/en-us/articles/4403697564429)）。
- Ora（2026 年 4 月测试版）：每条错误一个图标，点开自动带上错误详情、流程上下文、**最近的流程改动**、该步骤的错误模式和公开文档，输出摘要、可能原因、步骤、最佳实践、文档链接；不改原始错误，不自动执行建议。批量改 retry data 见 3.3。也能按自然语言建流程、找某个值硬编码在哪、看最近改动和审计。所有改动先做成草稿，明确批准才应用；权限跟随用户角色；审计里来源标「Ora」；**改动前不打快照、没有回滚**；文档列出的语言有西班牙语、法语、意大利语等，未提中文；按额度计费，有 Priority 和 Standard 两档响应速度。
- 映射建议、Handlebars/JavaScript 生成；2026 年起有 MCP Server、AI agent 步骤、guardrail 和对应的执行日志（[Agentic release notes](https://docs.celigo.com/hc/en-us/articles/47114270888475)）。

**Boomi**（[AI agents](https://help.boomi.com/docs/Atomsphere/Platform/Boomi_AI_agents)）

- Resolve Agent：在文档错误详情里点「Generate Solution with Resolve Agent」，基于帮助中心和社区做检索增强生成，给最多 10 条建议，可复制为 Markdown。**只支持英文、只在北美区**，需要管理员开启 AI（[Resolve Agent](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Boomi_Resolve_161e2c65-2c4d-45b8-a0ae-b107ddddac89)）。文档描述的输入只有错误详情和公开知识库，未提到读取流程配置或最近改动。
- DesignGen：在 Boomi GPT 里描述集成，先出流程图，按反馈修改，批准后生成可在画布打开的流程。Pathfinder：建流程时推荐下一步，映射时给建议。Boomi Suggest：众包映射建议，按高中低置信度勾选。Scribe：生成流程文档和两个版本间的差异说明。另有 Integration Advisor、API 设计和文档代理。

---

## 8. 用户真实的称赞和抱怨

**Celigo**

- 称赞：「错误处理和日志很有用，出问题时排查容易得多」（Sonu P.，系统分析师，2026-03）；「AI 错误处理把大部分同步失败自动修好了，省了维护的头疼」（Nikunj K.，2026-03）（[Capterra](https://www.capterra.com/p/157596/Celigo/reviews/)）。社区里有资深用户直言喜欢新的错误与重试界面（Connective #582）。
- 抱怨：「错误处理不透明、错误码笼统，排查复杂的同步问题很费劲」（Nikunj K.）；「流程一复杂就难调试，尤其错误描述不清楚时」（Sonu P.）；「排查同步错误很难，错误码太笼统」（Brett G.，2022-05）；「总在报错，得 7×24 盯着」（Alan N.，2020-05）；贵（同上 Capterra）。
- 社区：要求给错误加备注和「等待处理」状态，用来记录「为什么点了 Resolve 而不是 Retry」（[#582](https://connective.celigo.com/t/feature-request-add-notes-to-errors-maybe-even-a-status/582)）；一次只能选 1000 条，Celigo 一方的回复者承认「错误上千条时这个体验很痛苦」，建议连点多批并行（[#753](https://connective.celigo.com/t/upload-csv-to-resolve-or-retry-multiple-errors/753)）；重试不重新判断下游分支，只好把错误写回 ERP 让业务人员在自己的系统里看到（他们没有 Celigo 账号），再从头重跑（[#4795](https://connective.celigo.com/t/flow-steps-after-proceed-to-next-application-doesn-t-run-after-retry/4795)）；美国区涉及 NetSuite 的生产流程集体卡在排队状态一个多小时（[#5134](https://connective.celigo.com/t/celigo-integration-flows-stuck-in-queue/5134)）。
- 咨询公司评述：「仪表盘决定不了谁该修一条坏的客户记录、订单失败要多快处理」；预制内容「不可能知道每一个自定义记录、审批规则、税务情形」（[Six Lakes Consulting](https://www.sixlakesconsulting.com/blogs/celigo-pros-and-cons-what-to-know-before-you-commit.html)）。

**Boomi**

- 称赞：「最有价值的是调试和测试，追踪执行、文档和流程历史都很方便」（Xiaoqing Zou，集成开发，2024-03）；「监控部分适合排查问题」（Peter Pries，2023-10）（[PeerSpot](https://www.peerspot.com/products/boomi-ipaas-reviews)）。
- 抱怨：「追踪交易是大难题，查一笔要几个小时。TIBCO、IBM 按 ID 就能查，Boomi 得一个个时间戳去翻」；「通用模式很吃资源，但要有足够日志只能用它；低延迟模式吞吐好，却丢了很多重要信息」（RamAlla，高级经理，2024-01）；「除非建了不同版本，否则没法正确回滚」（Eugene Paden，CTO，2025-01）；价格高（PeerSpot）。Hacker News 上维护 Boomi 流程的工程师说「版本控制很烂，还必须用它自己的」「贵得离谱」「被锁死」（[2019](https://news.ycombinator.com/item?id=20987643)）；另一位把 Boomi 层换成自研服务，「集成错误下降约 85%」（[2026](https://news.ycombinator.com/item?id=48367877)）。

中文社区（知乎、V2EX）上关于这两款产品运维体验的讨论：未查到。

---

## 9. 对我们的启示

### 9.1 值得借鉴的设计（写到能画界面的程度）

**A. 问题详情里的「受影响的人」工作台**（借 Celigo Errors 页，按人而不是按运行）

- 左列表、右详情，详情可收起；列宽、列顺序、显隐、详情开合按人记住。
- 顶部筛选条：原因分类（带数量的标签）、出错方（北森 / 飞书 / 映射表 / 平台内部）、负责人、状态、标签；搜索框支持工号、姓名、手机号后四位，前缀匹配。
- 列：最近失败时间、人（姓名 + 工号，点开到查人页）、失败步骤、原因分类、对方错误码、已尝试次数、负责人；行首状态点：蓝点「已临时改值，未重放」、灰钟「等待外部处理」。
- 详情页签：「这次会写入什么」（目标字段逐行，标出来源和是否被临时改过）、「源系统现在的样子」（实时读北森）、「请求与响应」（脱敏）、「历次尝试」（时间线，含自动重试）、「AI 诊断」。
- 同一人在同一步骤只留最新一个阻塞原因；之后成功自动关闭，Celigo 的做法已经证明这能把列表压到可处理的长度。我们按业务键做，跨步骤也能合并。

**B. 原因分类和标准动作**（借 Celigo 的分类表，换成我们的连接器语境）

| 分类 | 北森到飞书的例子 | 平台自动做什么 | 值班点一下做什么 |
| --- | --- | --- | --- |
| 权限不足 | 飞书返回缺通讯录权限、部门不在应用可见范围 | 暂停该连接上的同类写入，不再刷出新错误 | 「查看缺的权限」：权限名 + 飞书后台菜单路径 + 「重新检查」 |
| 凭证失效 | 北森应用密钥过期 | 暂停，按退避探测，恢复后自动补处理 | 「重新授权」 |
| 限流 | 飞书 429 | 排队，不计为失败 | 无 |
| 对方暂时故障 | 超时、5xx | 幂等写入自动重试；不幂等的进「结果未知」 | 「确认结果」 |
| 映射缺失 | 北森出现新部门 | 无 | 行内补映射行，保存后提示「重放这 5 人」 |
| 数据不合法 | 手机号格式、姓名超长 | 无 | 「只对这个人临时改值」或「加一条数据规则」 |
| 重复 | 飞书已有同邮箱账号 | 按业务键关联已存在账号（「确保存在」语义） | 「关联到已有账号」或「列为例外」 |
| 平台内部 | 我们自己的 bug | 无 | 「下载诊断包」 |

**C. 处理规则页**（Celigo 要用户自己搭流程做的事，我们做成一等对象）

- 列表：规则名、条件摘要、动作、生效范围、近 7 天命中次数、上次命中、到期时间、开关。内置规则（按业务键合并、暂时故障重试、限流排队、连接失效暂停）也列在这里，可以看命中数，不能删。
- 编辑：条件 = 连接 / 步骤 / 原因分类 / 对方错误码 / 消息包含；动作 = 按退避自动重试 N 次 / 自动关闭并记原因 / 指派给某人 / 某段时间内不告警；必填「为什么」；可设到期。
- AI 发现「过去 7 天同一错误码出现 23 次、每次人工重试都成功」时，提议一条规则，人确认后生效。

**D. 改数据的三层**（Celigo 的「编辑重试数据」放进按期望状态收敛的模型里）

1. 默认：在源系统改正后「对这个人重新同步」，重新读北森最新状态（决定 000042）。
2. 临时改值：源系统一时改不了时，在「这次会写入什么」里点字段旁的笔，填新值和原因，选范围「仅这一次」或「直到北森该字段变化」；列表出现蓝点，写审计。
3. 规则化：同类错误多了，提示「把它变成方案设置里的数据规则？」，比如「手机号不合法时：不同步手机号 / 报错」「姓名超过 N 字：截断 / 报错」。这正是 Celigo 的 integration app 把常见数据错误变成设置项的做法（[Shopify 设置](https://docs.celigo.com/hc/en-us/articles/115006107487)）。

**E. 批量操作永远作用于看得见的范围**（反 Celigo 的「Retry all 无视筛选」）

- 按钮写成「重放筛选出的 37 人」「重放勾选的 5 人」，不出现无范围的「全部重试」。
- 点下去先预检：多少人会执行、多少人会因为原因未修好被拦下、用哪个版本、对不幂等的步骤如何处理（已有的逐人检查保留）。
- 没有每页 1000 条的上限；任务进度单独成条，可取消，已完成的不回滚（Celigo Retries 页签的字段可以照搬：发起人或「自动」、成功、跳过、仍失败、耗时）。

**F. 用失败的人试跑修复**（借 Boomi 的 Re-run in Test Mode）

问题详情「怎么修」卡片分三步：① 修原因（补映射、改草稿、开权限）；② 「用这 5 人试跑草稿」：重新读北森，走草稿版本，写入步骤只做校验不真正写，逐人逐步显示结果；③ 「发布并重放」。三步都通过才亮第三个按钮。

**G. 告警策略按项目，不按个人**

- 订阅对象是项目或集成，渠道是飞书、企业微信、钉钉群机器人和 Webhook，不要求收件人有平台账号（两家都卡在这里）。
- 默认 15 分钟合并（与两家一致），高危（离职仍可登录）立即发；发过通知的问题自动恢复后补一条「已恢复」，没发过的不发（Celigo 的规则）。
- 每个问题卡片带「认领」和「静默 2 小时」，认领人写回问题负责人。

**H. 运行记录的分级与限时详细记录**（借 Celigo 执行日志）

- 默认只记步骤、状态、耗时、业务键和对方错误码，不存载荷；「临时开启详细记录」要填原因、选时长（30 分钟到 24 小时），到点自动关，开关都进审计。
- 查人页的时间线就是 Celigo 的 trace view：同一个人在各步骤的经过，点任一步看那一步的输入输出（如果当时有记录）。

**I. 方案设置页**（借 Celigo integration app）

北森到飞书方案安装后有一个「设置」页，分页签：范围（哪些用工类型、哪些组织）、账号（邮箱生成规则、手机号缺失时）、部门（映射表 + 找不到时：报错 / 放到默认部门 / 暂缓）、离职（停用还是删除、延迟几天）、通知（发到哪个群、消息模板）、对账（时间和范围）、数据规则（见 D）。每个设置用业务语言写，下面一行灰字写「影响哪些工作流」。另有「立即同步这些工号」输入框，一次最多几十个（对应 Celigo Shopify 应用设置里的订单号输入框：填几个订单号点保存，就按需同步这几单）。安装向导：连接北森 → 连接飞书 → 快速配置（现在配 / 稍后配）→ 首次对账 → 默认全部工作流**未启用**，确认后再启用。

**J. 环境差异表与可读的变更审计**（借 Boomi 扩展）

「环境与配置」页每个可按环境不同的项一行：配置项、默认值、测试环境值、生产环境值，每格一个「沿用默认」勾选。改动记审计并以字段级差异展示，不要像 Boomi 那样只给原始 XML、只显示一个月。

**K. 发布对比与回滚**（借 Boomi）

回滚弹窗只列出**曾经在这个环境发布过**的版本，每个版本带发布备注和发布人；对比可选「当前草稿 vs 线上」，只看有变化的步骤和映射行。

### 9.2 反面教材

- 批量操作范围不明（Celigo Retry all 无视筛选；勾选的错误不传给 Ora）。
- 每页 1000 条的选择上限，错误一多就只能连点（Celigo）。
- 重试从失败步骤接着跑，若该步设成「失败也继续」，重试成功后不再推给下游，导致下游状态回写缺失（Celigo）；Boomi 反过来，重跑永远从头，还不能跨执行批量。
- 只能通知平台账号，业务方收不到（Celigo）；替别人配告警要用对方账号登录（Boomi）。
- 追踪字段要事先配、不追溯历史，没配就只能翻时间戳（Boomi）。
- 日志存在运行时上，运行时离线就看不了（Boomi）；日志详细程度和吞吐二选一（Boomi 低延迟模式）。
- 重试成功后原执行仍显示失败（Boomi），状态不反映「已补平」。
- 自动重试计划会把历史上所有失败都重跑，要删磁盘文件才能停（Boomi Retry schedule）。
- 保存扩展值导致该环境全部监听重启；取消部署后旧值藏在 override.xml 里（Boomi）。
- 克隆再拉取的版本模型容易丢 ID 对应、产生冲突，出事只能重建、历史清零；普通保存不生成修订，回滚全靠事先手动快照（Celigo ILM）。编辑锁默认关闭、后存覆盖先存（Boomi）。
- AI 改配置不打快照、不能回滚（Celigo Ora）；AI 排障只做文档检索、只支持英文和北美区（Boomi Resolve）。
- 错误没有备注和「等待外部」状态，用户把笔记记在别处（Celigo，社区 2022 年就提了）。
- 托管的预制集成锁住组件，trace key 都不能改写，边缘情况无处安放（Celigo integration app）。

### 9.3 对我们定位的特别含义

- **自托管**：Boomi 把数据留在客户运行时，是它在数据驻留上的卖点，代价是「运行时离线看不了日志」。我们整机部署在客户机房，不存在这个问题，但保留期、清理和归档必须是系统设置里的一等配置；Celigo 的「下载诊断包」（流程配置快照 + 运行信息）对我们更重要，因为厂商不能远程登录客户实例排障。
- **错误分类不能靠云端海量数据训练**：Celigo 的分类依赖它在所有租户上见过的错误。我们改走「连接器声明错误码映射 + 规则 + 本地模型兜底」，这正是连接器深度清单里的「错误码映射」，确定性更高，也能离线工作。
- **中国企业**：告警和处理入口要在飞书、企业微信、钉钉里；HR 问「张三怎么没账号」时按姓名、工号、手机号后四位查，展示时脱敏，符合个人信息保护法的最小必要。Celigo 用户「把错误状态写回 ERP 让没有账号的业务人员看到」说明，把可操作的信息送到业务方日常系统是刚需；但给 HR 发一张带「我已在北森改好，重新同步」按钮的消息卡片，是否越过决定 000039 的「不做待办」边界，需要先确认。
- **辅助流程与按期望状态收敛**：Celigo 用户的绕法（从头重跑这条记录）、Celigo 官方的建议（Delta 导出不回滚，要靠对账或补发流程兜底）都印证了决定 000040 和 000042。我们的「重放」默认应该是「对这个业务键重新收敛」，「从失败步骤继续」只作为不幂等步骤的特殊处理。
- **AI 优先**：竞品的 AI 停在三层：分类、按文档给建议、把改动做成待确认草稿。我们可以多走一步：AI 给出修复后自动用受影响的人试跑（F），通过才允许应用；应用前打快照，可一键撤销；AI 的上下文包含最近的配置改动、连接器错误码字典和缺失权限清单；默认支持本地或国产模型，载荷不出机房。

### 9.4 未查到或待确认

- Celigo 编辑锁、OpenAPI 生成连接器、Boomi 界面内编辑文档后重跑、Event Streams 死信一键重投：文档中均未查到。
- Celigo 临时故障自动重试的时间单位，两篇官方文档说法不一致。
- Celigo「Select all」在已筛选列表上的确切行为：文档写「无视过滤和搜索」，未实测。
- Boomi 查看文档内容是否和日志一样要求运行时在线：文档只对日志明确说了。
- G2、TrustRadius、Reddit、知乎的评价：抓取被拒或需要登录，未查到。
