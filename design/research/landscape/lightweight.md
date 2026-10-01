# 轻量与开发者工具拆解：Zapier、Make、n8n、Pipedream

调研日期 2026-10-01。目的是从交互层面弄清这四个产品怎么让人从空白搭起一条集成、怎么让人看护它，哪些设计值得借，哪些在企业场景撑不住。

**资料与可信度**

- 以官方文档、帮助中心、发布说明、定价页为准。界面文案保留英文原文，放在引号里。
- 用户评价取自 Hacker News（下称 HN）、Capterra、PeerSpot、各产品官方社区和 jimmysong.io。Reddit、G2、TrustRadius 拒绝抓取，V2EX、知乎没有检索到可引用的原帖，这几处记为「未查到」。
- 「未查到」只表示没找到证据，不等于产品没有这个功能。

## 结论先行

1. **四家都以「工作流的一次运行」为中心组织运维，没有「业务对象」和「问题」这两层。** 想按业务数据找运行，Make 要 Pro 档的全文检索，n8n 要用户自己往运行上打标签（最多 10 个键），Zapier 只在 API 文档里写明支持。值班的人「按工号查张三」，没有一家开箱即用。
2. **搭建手感最好的是 n8n**：三栏节点配置（左输入样例、中参数、右输出）加「钉住样例」，让「每一步对着真实数据调」成为默认动作。Zapier 的线性步骤上手最快，但测试写操作会真的写进对方系统。
3. **重放语义各不相同，而且都不透明。** Make 重放让所有模块再跑一遍，包括已成功的；n8n 从失败节点续跑，并让人选原版本还是当前版本；Zapier 和 Pipedream 用当前版本。没有一家在重放前逐步判断「这一步再执行会不会重复副作用」。
4. **企业能力几乎都在最贵的一档**：环境与 Git、审计日志、操作级限制、外部密钥、日志外发。这正是我们「不分版本」（ADR 0002）要反着做的地方。
5. **自托管的真实成本在运维和安全。** n8n 社区和评论里反复出现的抱怨是执行表越涨越大、内存溢出、队列模式难调、升级有破坏性变化。2026 年 1 月它又连续爆出 CVSS 9.9 到 10 分的远程代码执行漏洞，其中一个影响约 6 万个公网实例。
6. **AI 已是标配，但都停在「帮你搭」。** 四家都能用一句话生成或修改流程，都把流程或连接器开放成 MCP 工具。差异在治理：Zapier MCP 以连接所有者的身份执行，自动套用操作级限制，调用记进审计日志。n8n 的 AI 助手不提供给自托管。
7. **Pipedream 被 Workday 收购后，Workflows 将在 2027-03-31 关停，只保留 Connect**（托管授权，加上给 AI 智能体用的 MCP 工具）。值钱的是连接器和授权这一层，而不是代码优先的工作流编辑器。

## 1. 核心对象模型

### Zapier

- 账户 → 文件夹 → **Zap**。Zap 是一个触发器加若干动作，是一条线性步骤：分支靠 Paths，过滤靠 Filter，其余逻辑用内置工具（Formatter、Delay、Looping、Sub-Zap 等）。
- **App connection**：连接归个人，可以共享给账户里的其他人。MCP 和自定义动作都复用它（[MCP security](https://docs.zapier.com/mcp/security)）。
- **Zap run**：一次运行。界面上的状态有 Success、Filtered、Held、Stopped、Playing、Waiting；API 里还有 error_handled、halted、throttled、skipped（[Zap history](https://help.zapier.com/hc/en-us/articles/8496291148685)、[Get Zap Runs](https://docs.zapier.com/api-reference/workflow/experimental/get-zap-runs)）。
- **草稿与版本**：2022 年加入草稿，之后加入版本回滚（[Version rollback](https://community.zapier.com/product-updates/introducing-version-rollback-22136)）。
- **周边对象**：
  - Tables：表。
  - Interfaces：官网页面现在以 Forms 呈现。
  - Canvas：画系统草图，Beta。
  - Agents、MCP server、Custom action。
  - Transfer：把历史记录一次性灌进 Zap。
- Zap 是主要的运行单元，Forms 的提交通过 Zap 驱动后续动作；Agents 是另一类会自己运行的对象。

### Make

- Organization → Team → **Scenario**。
  - Scenario 是自由画布上的模块图，Router 分出多条路线。
  - 过滤条件挂在模块之间的连线上。
  - 错误处理是从模块上拉出的单独路线。
- **Team 内的共享资源**：
  - Connection、Webhook。
  - Data store：建之前必须先定义 Data structure。
  - Custom variable、Custom function（Enterprise）、Template。
- **运行侧**：
  - Scenario history：运行记录和改动记录混排在一起。
  - Incomplete executions：失败时保存下来的运行现场，等人或自动补完（[scenario history](https://help.make.com/scenario-history)、[incomplete executions](https://help.make.com/incomplete-executions)）。
- **复用**：Subscenario 用 Scenario inputs/outputs 定义契约，用「Call a subscenario」同步调用并等返回值（[社区说明](https://community.make.com/t/product-discovery-scenario-outputs-and-synchronous-subscenarios-lets-talk/65854)）。
- **全局视图**：Make Grid，自动生成的依赖地图。
- **AI**：Make AI Agents、Maia（对话式搭建）、MCP server。

### n8n

- 实例 → **Project**（个人项目 + 共享项目）→ 文件夹 → **Workflow**。
  - Workflow 是自由画布上的节点图。
  - AI 节点是「根节点 + 子节点」：Agent 节点下挂 chat model、memory、tools。
- **Credential**：归个人或项目，可以直接分享给人，也可以放进项目给全员用（[share credentials](https://docs.n8n.io/administer/manage-credentials/share-credentials-securely)）。
- **Execution**：一次运行，可以挂最多 10 个自定义键值（custom data）用来筛选。
- **Workflow history**：每次保存产生一个版本。现行文档（2.x）中，编辑自动保存为草稿，点「Publish」才把某个版本推到生产（[save and publish](https://docs.n8n.io/build/understand-workflows/save-and-publish-workflows)）。
- **周边**：
  - Variables、Tags。
  - Data tables：实例内置的小表，默认所有表合计 200 MiB。
  - Error workflow：以 Error Trigger 开头的普通工作流。
  - Sub-workflow。
  - Source control：Git，Enterprise。
  - Insights、Evaluations、Community nodes。

### Pipedream

- Workspace → **Project**（可以接 GitHub 同步）→ **Workflow**。
  - Workflow 是一个触发器加一串纵向步骤。
  - 每个步骤要么是现成动作，要么是 Node.js、Python、Go、Bash 代码。
- **Source**：独立于工作流的事件源，可以排队和限流。另有 Connected account、Data store、环境变量。
- **运行侧**：Event history、编辑器里的 Inspector，以及每个工作流自带的 `$errors` 事件流。
- **现状**：
  - 「Pipedream Workflows and String will shut down on March 31, 2027」。
  - 2027-04-30 前删除全部数据，包括已连接账号的凭证和 OAuth 令牌。
  - Connect 不受影响，是今后的重点（[官方通知](https://pipedream.com/docs/workflows)）。
  - 收购公告见 [Workday 新闻稿，2025-11-19](https://newsroom.workday.com/2025-11-19-Workday-Signs-Definitive-Agreement-to-Acquire-Pipedream)。

### 对照

| 我们的概念 | Zapier | Make | n8n | Pipedream |
| --- | --- | --- | --- | --- |
| 工作流 | Zap | Scenario | Workflow | Workflow |
| 连接 | App connection（个人，可共享） | Connection（团队） | Credential（个人或项目） | Connected account |
| 映射表、数据存储 | Tables | Data store + Data structure | Data tables | Data store |
| 子流程 | Sub-Zap | Subscenario（有输入输出契约） | Sub-workflow（可声明输入字段） | `$.flow.trigger`（alpha） |
| 问题 | 未查到 | 未查到（Incomplete executions 最接近） | 未查到（用户自建 Error workflow） | 未查到（用户订阅 `$errors`） |
| 业务键 | 未查到 | Run name（2025-10 上线） | Custom execution data | 未查到 |
| 环境 | 未查到 | 未查到 | 一个 Git 分支对应一个实例（Enterprise） | GitHub 开发分支 → 生产分支 |

Make 的运行命名和 n8n 的自定义运行数据，都是让用户自己给运行贴标签。这说明「按业务对象看运行」的需求真实存在，但两家都是事后补丁，没有把业务对象做成一等公民。

## 2. 搭建体验

### 2.1 从空白到第一条跑通

**Zapier：线性的表单式编辑**

来源：[测试步骤](https://help.zapier.com/hc/en-us/articles/8496310366093)、[设置动作](https://help.zapier.com/hc/en-us/articles/8496257774221)。

1. 新建 Zap。画面中间是一列步骤卡片，Trigger 在上，Action 在下。
2. 点 Trigger：
   - 搜索并选 App，选「Trigger event」。
   - 在「Account」里选已有账号，或点「+ Connect a new account」。
3. 在 Test 页签点「Test trigger」，拉回几条真实记录：
   - 「Find new records」换一批。
   - 选中一条后点「Continue with selected record」。
4. 点 Action：
   - 同样选 App、「Action event」和账号。
   - 在「Configure」页签填字段，必填字段带星号。
   - 字段的值可以手填、从上游映射，或从下拉里选。
5. 在 Test 页签点「Test step」。页面写着「Testing is live and may result in changes made in your app」，也可以点「Skip test」跳过。
6. 点「Publish」。触发器、Filter、Paths 必须测试通过，否则发布按钮置灰；动作步骤可以不测。

**Make：画布和气泡**

1. 新建 Scenario。画布上只有一个大圆「+」，选 App 和模块，在弹窗里建连接、填参数。
2. 在模块右侧接下一个模块。点进字段时，旁边弹出映射面板，列出前面所有模块的输出：
   - 点一下就插入一个彩色「药丸」。
   - 鼠标停在药丸上，来源模块会闪动（[mapping](https://help.make.com/mapping)）。
3. 点「Run once」跑一次：
   - 每个模块头上出现带数字的小气泡，点开能看每个 bundle 的输入和输出。
   - 也可以对单个模块右键「Run this module only」，单独生成样例。
4. 轮询触发器第一次启用时，要选从哪里开始：当前时刻、指定日期、指定 ID、第一条记录（[types of modules](https://help.make.com/types-of-modules)）。
5. 打开调度开关，保存。

**n8n：画布加三栏节点配置**

1. 新建 Workflow，加一个触发器节点，双击打开节点配置面板：左栏 INPUT，中栏参数，右栏 OUTPUT。
2. 选或新建 Credential，点「Execute step」。它只执行这个节点和它依赖的前置节点（[execution types](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions)）。
3. 输出出来后，点 pin 图标钉住，横幅显示「This data is pinned」（[pin and mock data](https://docs.n8n.io/build/work-with-data/pin-and-mock-data)）：
   - 之后的手动运行都用这份数据，不再调用外部系统。
   - 钉住的数据可以在 JSON 视图里直接改。
4. 加下一个节点，把左栏 INPUT 里的字段拖到参数框，会生成 `{{ $json.fruit }}` 这样的表达式（[UI mapper](https://docs.n8n.io/build/work-with-data/reference-data/use-the-ui-mapper)）：
   - INPUT 可以在 Table、JSON、Schema 三种视图间切换，三种视图里都能拖。
5. 编辑每 1 到 5 秒自动保存为草稿。点「Publish」才上线，生产只跑已发布的版本；发布时只对有变化的触发器做增量激活。

**Pipedream：代码优先的纵向步骤**

1. 新建 Workflow 并选触发器（HTTP 触发器会给一个地址），发一条测试事件，左侧 Inspector 列出收到的事件。
2. 加步骤，可以选现成动作或代码步骤（[Node.js steps](https://pipedream.com/docs/workflows/building-workflows/code/nodejs)）：
   - 代码里直接写 `import axios from "axios"`，不需要 package.json，平台自动装包。
   - 上游数据从 `steps` 对象取。
   - 向下游传值用 `return` 或 `$.export`。
3. 每个步骤有一个「Test」按钮，只跑当前步；旁边的下拉可以测一段范围或整条（[quickstart](https://pipedream.com/docs/workflows/quickstart)）。
4. Deploy。

### 2.2 数据映射

| | Zapier | Make | n8n | Pipedream |
| --- | --- | --- | --- | --- |
| 怎么填 | 插入上游字段、手填或从下拉选 | 映射面板点选药丸，可套函数 | 拖拽生成表达式，或直接写 JS 表达式 | 写路径引用 `steps.x`，复杂的写代码 |
| 依赖什么样例 | 测试记录；App 没数据时只给通用样例 | 上一次运行，或「Run this module only」 | 上游节点的输出，或钉住的样例 | 测试事件 |
| 数组 | Looping 等内置工具（未细查） | Iterator / Aggregator，门槛最高 | 默认逐条处理 | 写代码 |
| 预览 | Data in / Data out 页签 | 气泡里看 bundle | 输出面板 | 步骤结果 |

差异的根源在于对映射的理解：

- Zapier 和 Make 把映射当成填表。
- n8n 把映射当成写表达式，拖拽只是帮你写。
- Pipedream 干脆让你写代码。

HN 上有人说 n8n「不是 nocode，是可视化编程，有时比写代码还难」（vbezhenar，[HN 讨论](https://news.ycombinator.com/item?id=45525336)）。

### 2.3 每一步怎么测

- **Zapier**：测试就是真实写入。写操作没有演练模式（未查到），只能跳过测试。
- **Make**：
  - 「Run once」跑整条，「Run this module only」跑一个模块。
  - 2025-10 起，可以在编辑器里拿某次历史运行的触发数据重放，用来验证新逻辑（[scenario run replay](https://www.make.com/en/blog/scenario-run-replay-naming-rate-limits)）。
- **n8n**：
  - 「Execute step」加钉住样例，覆盖日常调试。
  - 失败的生产运行可以点「Debug in editor」：把那次运行的数据复制进编辑器，并钉在第一个节点上。成功的运行对应「Copy to editor」。
  - 这两个功能云端所有档都有，自托管要注册社区版或以上（[debug executions](https://docs.n8n.io/build/understand-workflows/understand-executions/debug-executions)）。
  - 钉住的数据只在手动运行时生效，二进制数据不能钉。
- **Pipedream**：
  - 可以测当前步、一段范围或整条。
  - Inspector 里的历史事件可以对当前版本重放（[inspect](https://pipedream.com/docs/workflows/building-workflows/inspect)）。

n8n 的闭环最贴近值班修复：生产失败后一键带着数据回到编辑器，改完用同一份数据再试。Zapier「测试即写入」在开通账号这种场景里不可接受。

### 2.4 复用

- **子流程**：
  - n8n 子流程的触发器叫「When Executed by Another Workflow」，可以选「Define using fields below」声明输入字段和类型，调用方节点会自动带出这些字段；也可以给 JSON 样例，或「Accept all data」（[sub-workflow trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/)）。
  - Make 的 subscenario 有输入输出契约，调用时可以「Wait for subscenario output」。
- **自定义动作**：Zapier 的 Custom Actions 可以跨 Zap、跨同事复用。
- **状态与去重**：
  - n8n 到 2025 年才加 Data tables，官方用例里写着「存标记防止重复运行」「做查找表」（[data tables](https://docs.n8n.io/build/work-with-data/data-tables)）。
  - HN 上有人说「几乎我建的每个工作流都需要存一点状态」（owenthejumper，[HN](https://news.ycombinator.com/item?id=45450044)）。
  - n8n 的去重是一个节点，不是触发器设置：Remove Duplicates 的「Remove Items Processed in Previous Executions」，默认记 10,000 条（[remove duplicates](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.removeduplicates)）。

## 3. 运行与运维

### 3.1 查运行：能不能按业务数据搜

| | 列表筛选 | 按业务数据 | 保留 |
| --- | --- | --- | --- |
| Zapier | 日期、Zap 名、App、文件夹、所有者、状态；可以搜版本号 | 帮助文档只写了按名称和版本搜；[Get Zap Runs](https://docs.zapier.com/api-reference/workflow/experimental/get-zap-runs) API 可以对 data_in、data_out 全文检索 | 保证 60 天，最多显示 10,000 条 |
| Make | 状态（Success、Warning、Error）和时间；列里有运行名、触发类型、耗时、消耗 | Pro 起可以全文检索模块输出；可以给运行起名，如「New customer: Jane Doe」 | Free 7 天，Core 到 Teams 30 天，Enterprise 60 天（[pricing](https://www.make.com/en/pricing)） |
| n8n | 工作流、状态（Failed、Running、Success、Waiting）、开始时间 | 按自定义键值筛选：最多 10 个键，键最长 50 字符，值最长 255 字符（Execution Data 节点页写 512）；云端 Pro 起，自托管要注册社区版起（[custom data](https://docs.n8n.io/build/understand-workflows/understand-executions/customize-executions-data)） | 由实例的清理设置决定 |
| Pipedream | 状态、时间、工作流名（[event history](https://pipedream.com/docs/workflows/event-history)） | 未查到 | 按套餐 |

真实痛点：

- 2025-12，n8n 论坛有人抱怨要一条条点开执行、再点 webhook 节点看数据，「ridiculous」，后来发现按键值搜索要企业账号（[searchable execution log](https://community.n8n.io/t/searchable-execution-log/230575)）。
- 更早的需求汇总帖写道，没有按客户号搜索，「用户可能花几个小时找记录，或者干脆去猜」（[execution list 需求汇总](https://community.n8n.io/t/workflow-execution-list-compilation-of-feature-requests/23503)）。

### 3.2 错误处理模型

**Zapier**（[error handler](https://help.zapier.com/hc/en-us/articles/22495436062605)）

- 操作：在任一步的「···」里选「Add error handler」，流程分成左「Success」、右「Error」两条道。
- 错误道里可以映射出错步骤的「Error Message」。
- 被接住的错误在历史里显示为成功，不计入错误率。
- 限制：
  - 触发器和 Paths 步骤不能加。
  - 带错误处理的运行不能手动重放。
  - 发布后这个 Zap 的 autoreplay 会关掉。
  - 只在付费档提供。

**Make**

- 五个指令：
  - Ignore：丢掉出错的这条数据，接着处理下一条，场景照常结束。
  - Resume：用一个兜底值顶替出错模块的输出，继续往下跑。
  - Commit：立即结束并提交，以成功结束。
  - Rollback：回滚支持 ACID 的模块。
  - Break：把剩余流程存成 incomplete execution，场景以 warning 结束。
- Break 可以开「Automatically complete execution」：尝试 1 到 100 次，间隔按分钟设，失败后每隔一次把间隔指数拉长（[break](https://make.com/en/help/errors/error-handlers/break-error-handler)）。
- Incomplete executions 默认关闭，要在场景设置里手动打开。
- 连续出错会自动停用场景；例如 Rollback 连续触发三次，场景就停用（[Make Academy](https://academy-content.make.com/courses/make-intermediate-errors/04-error-handlers)）。

**n8n**

- 节点的 Settings 里有「On Error」三选一：
  - Stop Workflow。
  - Continue。
  - Continue (using error output)：节点多出一个错误输出口。
- 另有「Retry On Fail」。已知问题：同时打开重试并选了 Continue，重试次数和间隔会被忽略（[issue #9236](https://github.com/n8n-io/n8n/issues/9236)）。
- 全局靠 Error workflow：在工作流设置里指定一个以 Error Trigger 开头的工作流。如果触发器本身失败，传给它的数据里没有 execution id（[handle errors](https://docs.n8n.io/build/flow-logic/handle-errors-gracefully)）。

**Pipedream**（[errors](https://pipedream.com/docs/workflows/building-workflows/errors)、[settings](https://pipedream.com/docs/workflows/building-workflows/settings)）

- Auto-retry 从失败步骤续跑，10 小时内最多 8 次，指数退避。内存溢出和超时不重试。
- 开了自动重试的工作流，默认第一次出错不发邮件，可以打开「Send notification on first error」。
- 每个工作流有 `$errors` 流，另有全局 `$errors` 流，可以订阅一个工作流统一处理所有错误。
- 失败步骤导出 `$attempt`，里面有 `cancel_url`、`rerun_url` 和下次重试时间。

### 3.3 重试、重放、改数据后重试

| | 从哪里开始 | 用哪个版本 | 能否先改数据 | 批量 | 已成功步骤会不会重跑 |
| --- | --- | --- | --- | --- | --- |
| Zapier | 失败步骤或整条 | 失败步骤重放用当前版本；整条重放用当前已发布版本 | 整条重放前可以改触发数据 | 勾选后点「Play X」；「Select all (5000 at a time)」 | 整条重放会；防重复机制未查到 |
| Make | 整条 | 最近保存的版本 | 未查到 | 未查到，在历史里逐条点重放图标 | 会，「data passes through all modules, even those that ran successfully」 |
| n8n | 从失败节点续跑，前面节点沿用原结果（[源码核实](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/executions/execution.service.ts)） | 二选一：「Retry with currently saved workflow」或「Retry with original workflow」 | 不能直接改，要通过 Debug in editor 改流程再跑 | 没有，论坛的长期需求 | 不会 |
| Pipedream | 整条 | 当前版本 | 未查到 | 在事件历史多选后批量 Replay | 会 |

来源：[Zapier replay](https://help.zapier.com/hc/en-us/articles/8496241726989)、[Make replay](https://community.make.com/t/feature-spotlight-scenario-run-replay/94769)、[n8n executions](https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions)。

Zapier 的 autoreplay 从 Pro 档起提供，只重放「errored」状态，不重放「halted」。帮助中心的检索摘要写最多尝试 5 次，间隔未查到。

### 3.4 告警与降噪

- 四家的默认告警都是按错误发邮件。
  - Zapier 有错误率的概念，被错误处理接住的错误不计入。
  - Make 连续出错会自动停用场景。
  - Pipedream 允许关掉首次出错的通知。
- 把失败按原因归并成「问题」（有状态、负责人、能识别复发）：四家都未查到。n8n 和 Pipedream 的答案是「你自己写一个错误工作流」。

### 3.5 并发、限流、积压

- **Pipedream**（[concurrency and throttling](https://pipedream.com/docs/workflows/building-workflows/settings/concurrency-and-throttling)）：
  - 每个工作流单独设并发，设为 1 就严格按序处理。
  - 限流是固定窗口：每个时间窗口内最多处理多少个事件，窗口和次数都可以设。
  - 队列默认 100，付费档可以加到 10,000。
  - 队列满了直接丢弃事件，并报「Event Queue Full」。
- **Make**：2025-10 起可以按场景设每分钟最多运行次数。
- **n8n**：实例级并发上限，超出的生产运行按先进先出排队，手动运行不计入（[concurrency](https://docs.n8n.io/deploy/use-n8n-cloud/understand-concurrency)）。
- **Zapier**：有洪水保护，免费档每分钟 100 次，付费档 1,500 次。
- 按连接设速率上限、按业务键串行处理：四家都未查到。

### 3.6 起点与补数据

- **Make**：轮询触发器启用时选起点，见 2.1。
- **Zapier Transfer**：对支持的触发器，按日期范围或手选历史记录，一次性跑过这条 Zap；入口是 Zap 详情抽屉里的「Transfer data」。定时 Transfer 已在 2024-01-15 下线（[Transfer](https://help.zapier.com/hc/en-us/articles/21694568825485)）。
- **n8n、Pipedream**：未查到。

### 3.7 总览

n8n 的 Insights 统计以下指标（[insights](https://docs.n8n.io/administer/observe-and-log/track-usage-with-insights)）：

- 生产运行数、失败数、失败率、平均耗时。
- 「节省时间」：每次运行按人工分钟数折算，由用户在工作流上填写。

完整的仪表盘只在 Pro 和 Enterprise 提供。

## 4. 生命周期

### 4.1 草稿、版本、回滚

| | 草稿与发布 | 版本保留 | 回滚 | 比较 |
| --- | --- | --- | --- | --- |
| Zapier | 草稿和已发布版本分开 | Pro 1 个月，Team 6 个月，Enterprise 1 年（[pricing](https://zapier.com/pricing)） | 在 Version History 里「Edit from this version」，改完再发布 | Enterprise 可并排比较 |
| Make | 保存即生效，草稿未查到 | 60 天 | 「Previous Versions」里选一个版本，恢复后要手动保存（[restore](https://www.help.make.com/en/help/scenarios/how-to-restore-a-previous-scenario-version)） | 未查到 |
| n8n | 自动保存草稿，「Publish」上线，「Unpublish」下线 | 所有人 24 小时，云端 Pro 5 天，Enterprise 全量；命名版本永不自动清理（[history](https://docs.n8n.io/build/manage-workflows/view-change-history)） | 「Restore version」「Clone to new workflow」或下载 JSON | 在新标签页并排打开；Enterprise 有可视化差异 |
| Pipedream | 一切改动先在开发分支，合并到生产分支即部署（[GitHub sync](https://pipedream.com/docs/workflows/git)） | Git | Git | Git |

### 4.2 环境

- **n8n Enterprise**（[environments](https://docs.n8n.io/administer/use-source-control-and-environments/work-with-environments)）：
  - 每个实例连一个 Git 分支，官方建议单向流动：一个实例只推，另一个只拉。
  - Git 里只存工作流、标签，以及变量和凭证的「占位」；凭证和变量的值要在每个实例手工配。
- **Make**：没有环境。社区里的回答是「No, nothing.」，变通办法是导出 blueprint JSON 推到 GitHub 或 GitLab，或者带时间戳存网盘（[社区，2025-01](https://community.make.com/t/version-control-for-make-com-flows-best-practices-and-possibilities/65857)）。
- **Zapier**：环境概念未查到，官方方案是草稿加回滚。

### 4.3 发布评审

n8n 的 Workflow reviews 只在 Enterprise 提供，要求 2.37.0 以上（[workflow reviews](https://docs.n8n.io/build/manage-workflows/workflow-reviews)）：

- 有发布权限的人发起评审，被指定的评审人只需要读权限。
- 评审进行期间，编辑器、公开 API、n8n MCP server 都不能发布这个工作流。
- 比较的是「Published」和「In review」两个版本的节点与连线，用可视化差异展示；不含设置、凭证、变量、数据表和子流程。
- 批准后，以发起人的身份发布。

### 4.4 多人协作

- 同一个流程有人在编辑时加锁：四家都未查到。
- Make 的场景历史把改动记录和运行记录混排：调度改动、编辑、启用都在里面，可以用「Hide change log」一键隐藏（[scenario history](https://help.make.com/scenario-history)）。值班的人能直接看出「失败是从哪次改动之后开始的」。

### 4.5 依赖与影响分析

Make Grid 2025-06 开放 Beta，付费档都有（[introducing Make Grid](https://www.make.com/en/blog/introducing-make-grid)）：

- 由现有场景自动生成，不用手画。
- 图例：紫色圆是场景，三角是 webhook，特殊形状是数据存储，六边形是其他（智能体、App、HTTP 模块等）。
- 可以按团队、文件夹筛选；按某个表的列、某个 URL、某个 App 搜索，立刻列出依赖它的场景。

其他三家的依赖与影响分析：未查到。

### 4.6 连接器升级

Zapier 平台迁移用户的规则（[migrate](https://docs.zapier.com/integrations/manage/migrate)）：

- 只迁移启用中的 Zap，草稿留在原版本。
- 可以按百分比灰度，也可以按用户邮箱迁移。
- 只允许在同一个主版本内迁移；主版本变化时，只能弃用旧版，不能强迁。

## 5. 治理

### 5.1 角色

- **Make 团队角色**（[teams](https://www.make.com/en/help/access-management/teams)）：
  - Team Admin：管理成员和角色。
  - Team Member：可以改团队里的一切，但不能管成员。
  - Team Monitoring：只读。
  - Team Operator：只读，但能启停场景、改调度。
  - Team Restricted Member：能改，不能发布。
- **n8n 项目角色**（[roles](https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/see-available-roles)）：
  - Admin、Editor、Viewer；Viewer 连手动运行都不能做。
  - Viewer 只在 Enterprise 提供，自定义角色也只在 Enterprise。
- **Zapier**：Team 起有共享文件夹和文件夹级权限。Admin 和 Owner 能看所有 Zap 的用量，Member 只能看自己的。

### 5.2 凭证归属

- **Zapier**：连接归个人，可以共享。MCP 和动作以连接所有者的权限执行，对方系统里的权限照样生效。
- **n8n**：凭证归个人或项目；项目里的凭证只有项目管理员能再分享。
- **Make**：连接属于团队。
- **Pipedream Connect**：替终端用户托管授权，并提供代理，调用方不接触凭证也能发自定义请求（[Connect](https://pipedream.com/docs/connect)）。

### 5.3 应用与操作限制

Zapier Enterprise 的设置路径是 Admin Center → Governance → App permissions（[app access](https://help.zapier.com/hc/en-us/articles/45852792795917-Configure-app-access-settings-for-your-Enterprise-account)）：

- 应用级：选「Restricted apps」（默认开放、列出禁用的）或「Allowed apps」（默认封闭、列出允许的）。
- 操作级：例如允许读 HubSpot、禁止创建和更新；允许发 Slack 消息、禁止往外部频道传文件。
- MCP 自动套用这些限制，每次工具调用记进审计日志（[MCP security](https://docs.zapier.com/mcp/security)）。

其他三家同等粒度的限制：未查到。

### 5.4 数据保留与敏感数据

- **Pipedream**：工作流级「Disable data retention」，不记录导出和运行数据。
- **Zapier**：Enterprise 可以自定义保留期。
- **Make**：日志保留期按档位定，见 3.1。
- **n8n**：
  - 工作流设置里可以选是否保存成功、失败、手动的运行。
  - 自托管靠环境变量清理旧记录。
  - 社区里「清理不生效」「每月 4 万次执行后越来越慢」是常见帖子（[pruning](https://community.n8n.io/t/n8n-pruning-is-not-working/34369)、[slower over time](https://community.n8n.io/t/n8n-on-becoming-slower-over-time-40k-executions-month/302678)）。
- 运行日志里的敏感字段脱敏：四家都未查到。

### 5.5 审计

- **Zapier**：审计日志 Team 档保留 6 个月，Enterprise 1 年；MCP 调用也记进审计日志。
- **Make**：审计日志只在 Enterprise；场景历史里另有改动记录。
- **n8n**：审计日志和日志外发都只在 Enterprise（[pricing](https://n8n.io/pricing/)）。

### 5.6 付费墙在哪

| 能力 | Zapier | Make | n8n |
| --- | --- | --- | --- |
| 版本回滚 | Pro 起 | 所有档（60 天） | 所有人 24 小时，更长要付费 |
| 按业务数据找运行 | API | Pro 起 | 云端 Pro 起；自托管要注册社区版，按键值搜在论坛反馈里要企业版 |
| 自动重试 | Pro 起 | Break 指令，档位限制未查到 | 节点级重试所有档 |
| SSO | Team 起 | Enterprise | Business 起 |
| 审计日志 | Team 起 | Enterprise | Enterprise |
| 环境与 Git | 未查到 | 未查到 | 定价页写 Business 起有 Git 版本控制，文档写环境功能属于 Enterprise |
| 外部密钥、日志外发 | 未查到 | 未查到 | Enterprise |
| 操作级限制 | Enterprise | 未查到 | 未查到 |

运维和治理的基础能力都被当成升级的理由。HN 上有人说现在的定价都是两极：「阉割的社区版」对「企业报价」（jtrn，[HN](https://news.ycombinator.com/item?id=45450044)）。

## 6. 连接器策略

| | 数量 | 开发方式 | 兜底通道 | 社区 |
| --- | --- | --- | --- | --- |
| Zapier | 9,000+ App（[Agents 页](https://zapier.com/agents)） | Platform UI（可视化）和 CLI（代码），见 [platform](https://docs.zapier.com/platform/home) | Custom Actions：Copilot 读 API 文档生成，复用已有连接的认证头，Beta；另有 API Request 动作（[custom actions](https://help.zapier.com/hc/en-us/articles/16276574838925)） | 公开集成要过审核，例如至少 3 个用户有在跑的 Zap |
| Make | 3,000+，列表显示 3,620 个（[integrations](https://www.make.com/en/integrations)） | Custom app 是 JSON 配置（连接、模块、RPC、函数），在网页或 VS Code 扩展里写，支持本地开发和 Git（[local development](https://developers.make.com/custom-apps-documentation/make-apps-editor/apps-sdk/local-development-for-apps)） | HTTP app | 未查到 |
| n8n | 2,280（含合作方节点，[integrations](https://n8n.io/integrations/)） | 声明式（JSON 路由，官方推荐）或编程式（触发器、非 REST、需要外部依赖时必须用），见 [building style](https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-a-node-building-style) | HTTP Request：可以导入 cURL，可以用「Predefined Credential Type」复用现有节点的凭证，自带分页和批量（[HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest)） | 社区节点从 npm 安装，官方文档写明它「拥有运行 n8n 的机器的完全访问权」；另有官方审核的 verified 社区节点；可以用环境变量整体关闭（[risks](https://docs.n8n.io/integrations/community-nodes/risks)） |
| Pipedream | 3,000+ API，10,000+ 工具 | 组件在 GitHub 开源，提 PR 审核后上架（[contributing](https://pipedream.com/docs/components/contributing)）；代码步骤可以直接 import npm 包 | Connect proxy | 开源组件库 |

**Zapier 把连接器质量写成了自动检查**（[integration checks](https://docs.zapier.com/integrations/publish/integration-checks-reference)）。报错的检查阻止发布，警告不阻止。部分例子：

- 每个触发器和动作都必须有静态样例数据（D012）。
- 样例里必须包含用于去重的主键（D010）。
- 轮询的线上结果必须带主键（T002）。
- ID 字段应该用动态下拉，而不是让人手填（D004）。
- 日期用 ISO 8601（D023）。
- 密钥只能出现在认证字段里（D001）。
- 向后兼容：更新时不要隐藏已公开的触发器和动作（C001）。

这和我们「第一方连接器过同一张清单」是同一个思路，区别在于它是机器检查，不靠人自觉。

**从文档或 OpenAPI 生成连接器**：

- 只有 Zapier Custom Actions 是「读 API 文档生成动作」。
- n8n 的导入 cURL 最接近。
- 其他：未查到。

## 7. AI 能力：现在实际能做到什么

| | 生成与修改流程 | 排错 | 智能体与人工确认 | MCP | 自托管 |
| --- | --- | --- | --- | --- | --- |
| Zapier | Copilot 是统一入口，能在 Canvas、Zaps、Tables、Interfaces、Agents 里按描述生成（[ZapConnect](https://zapier.com/zapconnect/launches)） | Zap runs 和编辑器里的 Troubleshoot 页签，用平话解释错误、给分步修复（[AI troubleshooting](https://help.zapier.com/hc/en-us/articles/26355822938509-AI-powered-troubleshooting-is-now-available-in-the-editor-too)）；能否自动应用修复未查到 | Agents 可以挂知识源和 App 动作；Human-in-the-loop 让流程暂停等人批准 | 对外提供 MCP，每次工具调用消耗 2 个 task | 不适用 |
| Make | Maia 能创建、修改、修复场景，可以上传白板图片；不能看其他场景，不能调用子场景；文档没写改动前是否要人确认，只写了不满意可以回退到旧版本（[Maia](https://help.make.com/introduction-to-maia-by-make)） | Maia 在运行后读日志解释错误 | AI Agents 能把模块、场景、MCP 工具当作工具调用（[AI agents](https://help.make.com/make-ai-agents)） | 把「已启用、按需调度、定义了输入输出」的场景暴露成工具；付费档还能开放管理权限（[MCP server](https://help.make.com/make-mcp-server)） | 不适用 |
| n8n | AI Workflow Builder 能创建、修改、调试，每次交互 1 个 credit；不发送凭证和历史运行数据（[builder](https://docs.n8n.io/build/ways-of-building-workflows/ai-workflow-builder)） | AI Assistant 能排错、写表达式和代码，但「isn't available on self-hosted」（[assistant](https://docs.n8n.io/build/ways-of-building-workflows/use-the-ai-assistant)） | AI Agent 节点；工具级人工确认，审核人选 Approve 或 Deny，审核消息可以引用 `$tool.name` 和 `$tool.parameters`（[human-in-the-loop](https://docs.n8n.io/advanced-ai/human-in-the-loop-tools)）；另有 Evaluations | 有 MCP Server Trigger 和 MCP Client Tool 两个节点，另有实例级 MCP server | 助手不可用，Builder 的自托管支持未查到 |
| Pipedream | 「Edit with AI」；String（随 Workflows 关停） | 「Debug with AI」（[build with AI](https://pipedream.com/docs/workflows/building-workflows/build-with-ai)） | 未查到 | Connect 把 3,000+ API 做成 MCP 工具 | 不适用 |

AI 都用在「搭」和「解释」上。把失败归并、规划重放、标出副作用这类用在运维闭环里的 AI：四家都未查到。

## 8. 用户真实的称赞和抱怨

### Zapier

**称赞**

- 集成库是真正的卖点，省掉自建和托管 webhook 处理程序；几分钟就能搭好（[Capterra](https://www.capterra.com/p/130182/Zapier/reviews/)）。
- 「贵，但省心」，自带监控，非开发人员也能自己改（muratsu，[HN](https://news.ycombinator.com/item?id=24428568)）。

**抱怨**

- 计费与用量（[Capterra](https://www.capterra.com/p/130182/Zapier/reviews/)）：
  - 「五步的 Zap 每触发一次就烧掉五个 task」。
  - 业务忙的那一周撞上额度，被迫提前升级。
  - 越依赖它，月度花费越难预测。
- 复杂度与集成深度（同上）：
  - 步骤和数据流一多，就变得笨重，出了问题难排查。
  - 有些集成很浅，只有基本的触发器和动作。
- 很难搭出比基本触发更复杂的东西（zkid18，[HN](https://news.ycombinator.com/item?id=32474658)）。

### Make

**称赞**

- 比 Zapier 强大得多（zkid18，同上）。
- 更多用户原话未查到。产品侧在 2025 年补上了 Grid、运行重放、运行命名和子场景。

**抱怨**

- 为了处理循环和错误，要在界面里花十几分钟建节点（simple10，[HN](https://news.ycombinator.com/item?id=43879735)）。
- 没有版本控制（见 4.2）。
- 重放会重跑全部模块（见 3.3）。
- 评价站点的系统性评价：未查到。

### n8n

**称赞**

- 「保存了所有历史执行，失败时能看到每个组件进出的数据」；可以自托管，导入导出方便（mnky9800n，[HN](https://news.ycombinator.com/item?id=45525336)）。
- 「团队每年在一台小服务器上处理几百万次工作流」（marktolson，同上）。
- 中文视角：对要求内网部署的国内企事业单位，几乎是开箱即用的方案（[jimmysong.io，2025-08](https://jimmysong.io/zh/blog/n8n-deep-dive/)）。

**抱怨**

- 调试：
  - 出问题时很难看到真正的原因（tomwhipple，[HN](https://news.ycombinator.com/item?id=45525336)）。
  - 企业用户反映要手工逐个节点排查，HTTP 节点配置复杂（[PeerSpot](https://www.peerspot.com/products/n8n-pros-and-cons)）。
- 结构与维护：
  - 「一旦走进某条分支就回不到主干，全是 hack」（aerhardt，[HN](https://news.ycombinator.com/item?id=43879282)）。
  - 并行执行异步部分复杂且不稳定（photon_garden，同上）。
  - 「好搭，没法维护」（op00to）；最后变成一堆代码节点拼成的意大利面（melvinmelih，[HN](https://news.ycombinator.com/item?id=45450044)）。
  - 几十上百个节点的大流程在画布上臃肿，不如直接写代码（[jimmysong.io](https://jimmysong.io/zh/blog/n8n-deep-dive/)）。
- 规模与升级：
  - 不适合高负载，破坏性变更多（neoecos，[HN](https://news.ycombinator.com/item?id=43879282)）。
  - 企业用户说扩展性只到中等，适合每天服务 200 到 500 个客户的公司（[PeerSpot](https://www.peerspot.com/products/n8n-pros-and-cons)）。
  - 社区版默认单进程，队列模式的部署和调优要投入运维（[jimmysong.io](https://jimmysong.io/zh/blog/n8n-deep-dive/)）。
- 许可与定价：
  - 自托管也受执行数限制，超了服务就停（seer，[HN](https://news.ycombinator.com/item?id=45525336)）。
  - 团队共享空间要买企业版，贵 20 倍（Tadpole9181，[HN](https://news.ycombinator.com/item?id=43879282)）。
  - 许可不是 OSI 认可的开源（kfogel，同上；[Sustainable Use License](https://docs.n8n.io/n8n-community-license/sustainable-use-license)）。
- 扩展：自定义节点像是后加的，要往 Docker 里注入 JS（ashrafsam，[HN](https://news.ycombinator.com/item?id=43879282)）。
- 安全：2026-01-15 西澳政府安全中心同时通报三个 CVSS 9.9 到 10 的远程代码执行漏洞（[通报](https://soc.cyber.wa.gov.au/advisories/20260115001-N8N-Multiple-Critical-Vulnerabilities/)）。
  - 其中 Ni8mare（CVE-2026-21858，10 分）出在 Form Webhook 的 Content-Type 混淆，约 6 万个公网实例受影响（[分析](https://www.indusface.com/blog/cve-2026-21858-ni8mare-n8n-remote-code-execution/)）。
- 2026-09 HN 上有人问「还有人记得 n8n 吗」，回答里有人说它「比 LLM 生成的意大利面代码更好推理」，也有人把工作流改写成给 Claude 读的 md 文件（[HN](https://news.ycombinator.com/item?id=49763466)）。

### Pipedream

- 使用体验的系统性评价：未查到。
- 收购帖里的反应以担心为主，例如「希望它保持开源，但总体看不是好兆头」（bontaq，[HN](https://news.ycombinator.com/item?id=45987220)）。之后 Workflows 果然宣布关停。

### 企业场景撑不住的地方

1. **没有业务对象视角。** 找人、补数、核对都要绕到运行 ID 上。
2. **变更管控弱。** Zapier、Make 没有环境；n8n 的环境要 Enterprise，Git 里还不带凭证和变量值；n8n 以外没有发布评审。
3. **可观测和审计按档收费，保留期短。** Zapier 60 天，Make 7 到 60 天。
4. **自托管运维重**（n8n）：执行表增长、内存、队列模式、破坏性升级。
5. **安全面大**（n8n）：表达式求值和公开表单、Webhook 入口出过满分漏洞；社区节点拥有整机权限。
6. **大流程不可维护。** 分支回不到主干，画布臃肿，最后退化成代码节点。
7. **按步计费和可靠性对着干。** 多加一步校验或通知就多花钱（Zapier）。
8. **供应商风险。** Pipedream Workflows 关停，n8n 的许可限制商用分发。

## 9. 对我们的启示

### 9.1 值得借鉴的具体设计

**A. 节点配置三栏，加一个样例来源选择器**（借 n8n 的 NDV、pin、Debug in editor 和 Zapier 的选测试记录）

- 节点抽屉分三栏：左「输入样例」，中「参数与映射」，右「输出预览」，类型错误标红。
- 左栏顶部一个下拉「样例来自」，三个选项：
  - 最近一次运行。
  - 按业务键选一次真实运行（输入工号）。
  - 手写样例（固定）。
- 用固定样例的节点卡片带图钉角标。发布时提示「3 个节点使用固定样例，不影响生产」。
- 为什么：集成工程师调映射，最需要的是对着一条真实的员工变动调。

**B. 写操作分「演练」和「真实执行」**（反 Zapier 的「Testing is live」）

- 写操作节点的测试按钮分两个：
  - 「演练」是默认：不调写接口，只显示「将会：在飞书创建用户 张三，部门 销售部/华东」和请求体。
  - 「真实执行」要二次确认，并写明用哪个连接、哪个环境。
- 发布门槛沿用 Zapier：触发器必须测通；另外加上映射覆盖率检查。
- 为什么：首发主线是开通账号，测一次生产飞书里就多一个账号。

**C. 运行列表以业务键为标题**（把 Make 的运行命名和 n8n 的自定义运行数据做成平台能力）

- 每行的主标题是「工号 10023 · 张三 · 入职」，运行 ID 和工作流放在副标题。
- 顶部一个搜索框「按工号、姓名、邮箱查」。
- 筛选项：状态、工作流、时间、失败节点。
- 列表里穿插灰色的变更行「李航 发布了 v12 · 10:02」，可以一键隐藏（照 Make 的场景历史）。
- 为什么：业务键在触发器上定义一次，自动成为标题和检索索引，用户不用自己打标签。

**D. 重放确认框把语义说清楚**

- 选中 N 条失败运行，点「重放」，弹出对话框：
  - 版本：● 当前发布版本 v12　○ 原运行时的版本 v11（照 n8n 的二选一）。
  - 起点：● 从失败节点　○ 从头。
  - 逐步预判表，列是「步骤｜幂等声明｜处理方式」，例如：
    - 「确保飞书账号｜幂等｜执行」。
    - 「发送 HR 群通知｜不幂等｜原运行已成功，跳过」。
  - 底部汇总：「将重放 50 条：执行确保账号 50 次，跳过通知 37 次，13 次通知需要确认」。
- 「改触发数据后重放」只对单条开放，修改留痕。
- 为什么：竞品都没有在重放前说清副作用；我们的幂等声明正好用在这里。

**E. 失败策略配一句话预览**（反 n8n 重试与 Continue 互相冲突）

- 节点设置里的「失败时」：
  - 重试：按连接的默认策略，或自定义次数和退避。
  - 仍然失败：
    - 记为问题，并暂停这个业务键（默认）。
    - 走错误分支。
    - 忽略（必须填理由）。
- 下方实时生成一句话，例如：「超时或 429 时最多重试 5 次，间隔 1、2、4、8、16 分钟；仍然失败就在问题中心开一个问题，同工号后续的事件排队等待。」
- 为什么：选项组合的结果用人话说出来，比再加一个选项有用。

**F. 保存失败现场，默认就开**（借 Make 的 incomplete executions）

- 问题详情里列出「受影响的运行（停在『确保飞书账号』）」，每条显示失败时的输入。
- 修复后点「从失败节点续跑」。
- 不提供关闭开关。

**G. 自动重试做成时间线**（借 Pipedream 的 `$attempt`）

- 失败步骤下方显示「第 3/8 次重试，下次 10:42」。
- 两个按钮：「立即重试」「取消自动重试」。
- 为什么：值班的人要知道平台是不是已经在处理，避免手动重放和自动重试撞车。

**H. 起点选择与补处理**（借 Make 的起点选择和 Zapier Transfer）

- 启用或重新启用工作流时，弹窗问「从哪里开始处理」：
  - 从停用时刻补（默认，显示「约 23 条待补」）。
  - 从现在开始。
  - 从指定时间开始。
- 工作流菜单里另有「补处理历史数据」：选时间范围，或粘贴一列工号；先预览条数，再执行。

**I. 「被谁使用」页签，可切换成依赖图**（借 Make Grid）

- 连接、映射表、对账规则、子流程的详情页都有「被谁使用」页签：列出工作流、节点、最近运行、环境，可以切换成依赖图。
- 修改映射表或停用连接前，确认框列出受影响的工作流。
- 为什么：Grid 的价值是改之前知道会影响谁，不在于图好看。

**J. 推广评审：看图的差异，也看画布外的差异**（借 n8n 的 Workflow reviews）

- 节点图差异：新增绿、删除红、修改黄，点节点看参数差异。
- 单独列出画布外的差异：配置值、连接替换、映射表版本，这些是 n8n 评审不覆盖的部分。
- 评审期间，编辑器、API、MCP 都不能发布。

**K. 值班角色**（借 Make 的 Team Operator）

- 项目角色里加「值班」。
- 能做的：只读查看工作流，处理问题、重放，暂停或恢复工作流，改调度。
- 不能做的：改流程。

**L. 操作级白名单，一套策略管三处**（借 Zapier 的 Action restrictions）

- 在租户管理的「连接器策略」里，每个连接器的操作按「读、写、删除」分组勾选。
- 同一套策略同时作用于工作流、AI 智能体节点和 MCP，命中限制的调用写进审计。

**M. 连接器清单改成机器检查**（借 Zapier 的 integration checks）

- 连接器 CLI 输出带编号的检查结果。必须项包括：
  - 有输出样例。
  - 列表操作声明主键。
  - 写操作声明是否幂等。
  - 声明速率上限。
  - 密钥只出现在连接里。
- 报错的检查阻止打包，警告不阻止。

**N. 复用连接的自定义请求**（借 n8n 的 Predefined Credential Type、导入 cURL，以及 Zapier Custom Actions）

- 每个连接器的操作列表末尾有「自定义请求」：只填方法和相对路径，认证自动带上。
- 请求可以从 cURL 导入，也可以粘贴一段官方文档让 AI 填写。
- 保存为项目里的自定义操作时，必须声明是否幂等。

**O. 子流程的类型化输入**（借 n8n 的「Define using fields below」）

- 子流程的触发器上声明输入字段和类型，父流程的调用节点自动出现对应的映射表单。
- 子流程详情页显示「被 4 个工作流调用」。

### 9.2 反面教材

1. **把运维基础能力放进付费档**：按业务数据找运行、版本保留、审计、环境。我们没有版本之分，这些都进核心。
2. **测试就是写进生产**（Zapier）。
3. **重放不区分副作用**（Make 让全部模块再跑一遍）。
4. **失败现场默认不保存**（Make 的 incomplete executions 默认关闭）。
5. **队列满了就丢事件**（Pipedream）。辅助流程要求「不漏」，积压只能排队并告警。
6. **让用户自己写错误工作流当告警系统**（n8n、Pipedream）：降噪、复发识别、负责人都做不出来。
7. **执行数据无限增长**（n8n）。保留期要有默认值，容量要在产品里看得见。
8. **扩展代码拥有整台机器的权限**（n8n 社区节点），**表达式求值隔离不够**导致远程代码执行。我们已经让连接器跑在子进程里（决定 000029），表达式和代码步骤也要隔离。公开的事件入口（Webhook、表单）和管理界面应该能分开暴露。
9. **AI 能力不给自托管**（n8n 的 AI 助手）。在中国企业的机房里，这等于没有 AI。
10. **一张大画布装下所有分支**。按期望状态收敛（决定 000042）、子流程和方案模板，本来就是让流程保持小。

### 9.3 对我们定位的特别含义

- **自托管**
  - 四家里只有 n8n 可比。它的教训是：自托管的成本在运维和安全，不在功能。
  - 保留期与容量、升级前检查、安全更新提示都要做进产品，不能只写在文档里。
  - Pipedream 关停说明，「能导出、能自己跑」本身就是卖点；项目包（决定 000038）要尽早有。
- **中国企业**
  - 本次没有核实四家对北森、飞书、钉钉、企业微信的覆盖（未查到）。
  - 国产系统的授权向导和缺权限提示仍是我们的差异点。
  - AI 必须能接客户指定的国产或私有部署模型。
- **辅助流程**
  - 四家都是「事件 → 一串动作」的模型，没有业务键、对账和期望状态。
  - Make 的运行命名、n8n 的去重节点和 Data tables，都是用户自己拼的补丁。
  - 把业务键、去重、对账做进触发器和平台，是结构上的差异，不是多一个功能点。
- **AI 优先**
  - 一句话生成流程、MCP 对外开放已经是标配，不能当卖点。
  - 可以做出差异的是把 AI 用在运维闭环：归并失败、给出可执行的修复、生成标出副作用的重放计划。这些都要受同一套操作白名单和审计约束。
  - Pipedream 的结局说明，连接器加授权就是 AI 时代的核心资产。第一方连接器要能直接当 MCP 工具，并且带着幂等声明和权限提示。
- **首发角色**
  - 集成工程师要 n8n 式的调试手感：真实样例、钉住、单步执行。
  - 值班运维要的东西四家都没有：问题、按业务键查、能预判的重放。
  - 下一版原型应该按这两个人的一天来组织页面，而不是按菜单。

### 9.4 待验证

- 写操作的「演练」能做到多真？是只展示请求体，还是调用对方的校验接口？飞书有没有「只校验不创建」的接口：未查到。
- 按工号、姓名、邮箱检索运行，要存可检索的明文或哈希。这和「日志默认脱敏」怎么兼容？
- 重放时「用原版本」需要旧版本的连接器代码，和决定 000037「镜像里每个内置连接器只有一个版本」怎么协调？
- 值班角色能不能「改触发数据后重放」？改数据的风险接近编辑流程。
- Zapier 的 Zap history 界面搜索是否覆盖步骤数据（API 支持，帮助文档没写）：需要实测。
- AI 读国产 API 文档生成自定义请求，准确率需要用北森和飞书的文档实测。
