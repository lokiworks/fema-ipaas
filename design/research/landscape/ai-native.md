# AI 原生与智能体工具层：调研拆解

调研时间 2026-10-01。对象：Zapier（Copilot、AI by Zapier、Agents、MCP、Next Gen Zaps）、Workato（AIRO、Agent Studio 与 genie、Enterprise MCP）、Tray（Merlin Build、Merlin Agent Builder、Agent Gateway、Headless）、Boomi（Agentstudio、DesignGen、Companion）、n8n（AI Workflow Builder、n8n Assistant、Agents、实例级 MCP）、Composio、Arcade.dev、Pipedream Connect。

**资料与可信度**

- 以官方文档原文为主。Workato、Tray、n8n、Composio、Pipedream 都提供 `llms.txt` 和逐页 Markdown，界面文案按原文用粗体标出；Zapier 帮助中心按文章编号引用。
- 第三方评价：G2、TrustRadius、Capterra、Reddit 拒绝抓取或页面没有内容，Workato、Tray、Boomi 的用户评价**未查到**。能用的用户声音来自 n8n 官方社区、GitHub issue、Hacker News、V2EX 和两份安全研究。
- 「现在能用」按文档标注分四档：正式可用；预览（Preview、Early Access、Beta）；限量开放（要联系客户成功或排候补）；路线图。

## 先说结论

1. **一句话生成集成人人都有，没人敢跳过人工检查。** 各家文档都把「生成后复核、测试」写成硬要求。做得好的不是生成更准，而是把 AI 的每次改动做成可查看、可撤回、记进审计的变更（Workato AIRO 的 recipe state）。
2. **竞争点移到了上线之后。** Workato Acumen 在首页列出「静默失败」等事故并按业务影响排序；Zapier Next Gen Zaps 的 Agentic Management 让智能体在运行失败后诊断、测试、发布修复版本。前者在文档里是常规功能，后者还是早期访问。
3. **搭建面正在搬进 MCP 客户端。** n8n、Tray Headless、Workato AIRO MCP、Zapier Next Gen Zaps、Boomi Companion 都让 Claude Code、Codex 直接在平台上建、测、发布。配套的四件东西是：工作流有代码表示、服务端校验、版本差异、不碰真实系统的测试。
4. **独立的「智能体产品」在退潮。** Zapier 把 agents.zapier.com 并回 Zap 里的一个 AI 步骤；Pipedream 关停 Workflows 和 AI 搭建器 String，只留 Connect；n8n 的 agent 和工作流并列放在项目里。智能体是工作流里的一种步骤、工具的一种调用方，不是第二套产品。
5. **把集成能力交给智能体，卖的是治理不是数量。** 有价值的设计集中在五处：以谁的身份执行、调用前谁来确认、限额、审计、工具的语义标注（只读、破坏性、可安全重试）。工具多反而有害：Tray 文档说单个 MCP 服务器超过 15 到 20 个工具，选择准确率明显下降。
6. **托管凭证是这一层最大的风险面。** 安全研究用一把泄露的 Composio 项目密钥取回了用户的 Gmail、GitHub 令牌；Zapier 的邮件智能体被提示注入后外发了历史邮件。凭证不出机房、写操作由平台强制确认，正好是自托管平台的卖点。
7. **各家文档自己承认的坑很多**：测试模式直接写生产、确认流程在测试和无人值守时失效、工具改名后授权作废、对话日志保留期不可配置。这些我们可以在设计期避开。

## 速览

| 产品 | 本质 | 值得看的部分 | 可用状态（2026-10） |
| --- | --- | --- | --- |
| Zapier | SaaS 自动化，8,000+ 应用 | Copilot 两种搭建模式；AI 步骤里逐个工具设审批；MCP 托管模式；Agentic Management | Copilot、AI by Zapier、MCP 正式；Next Gen Zaps 早期访问 |
| Workato | 企业 iPaaS | AIRO 蓝图与变更追踪；Acumen 事故；本人确认与业务审批分开；MCP 网关与工具标注 | AIRO 需管理员开启；护栏、业务审批是 Beta；AIRO 建连接器限部分客户 |
| Tray | 企业 iPaaS | 组合工具与连接器工具之分；两层认证；切换凭证模式前的影响清单；日志打码 | Merlin Build 正式；Agent Builder 是 Beta（工作坊或候补）；Agent Gateway 需开通 |
| Boomi | 企业 iPaaS | DesignGen 先出流程图再生成；护栏；Control Tower 汇总多家智能体 | Agentstudio、Boomi Connect、MCP Registry 正式；智能体版本与评测、自带模型、客户自托管运行时在路线图 |
| n8n | 可自托管的工作流 | AI Workflow Builder；n8n Assistant；逐个工具人工审核；MCP 搭建链路 | Assistant、Agents、实例级 MCP 都是预览，Enterprise 版暂不支持前两者 |
| Composio | 给开发者的智能体工具 SDK | 会话级工具策略；工具包按日期版本锁定 | 云服务，自托管未查到 |
| Arcade.dev | 智能体动作运行时 | 工具级即时授权；访问、执行前、执行后三个钩子；工具评测 | 正式，可用 Helm 自托管 |
| Pipedream Connect | 托管认证加 3,000+ API 的工具层 | 每个应用一个 MCP 服务器；按终端用户隔离凭证 | Connect 正式；Workflows 与 String 于 2027-03-31 关停 |

## 1. 核心对象模型

各家名字不同，骨架一致：**智能体引用工具；工具背后是一条工作流或一个连接器操作；工具以某个身份执行；MCP 服务器是一组工具的对外发放单元；网关和注册中心管多个 MCP 服务器。**

- **智能体**
  - Workato genie = AI 模型 + **Job description** + 聊天入口（Slack、Teams、Workato GO、Headless API）+ 知识库 + skills，另有护栏和 **App Events**（外部事件主动唤醒 genie）。[来源](https://docs.workato.com/en/agentic/agent-studio.md)
  - Tray 的 agent 是一个项目：**Agent scope**、**Data sources**、**Workflows as tools**、**AI model**、**Agent workflow**（负责编排的特殊工作流）。[来源](https://tray.ai/documentation/platform/artificial-intelligence/agent-builder/overview.md)
  - Boomi：**Goal**、**Tasks**、**Instructions**、**Personality**、**Tools**、**Guardrails**、**Knowledge**。[来源](https://help.boomi.com/docs/Atomsphere/Platform/Agent_Designer)
  - n8n：Model、Instructions、Tools、Web search、Skills、Channels、Schedules、Sub-agents、Knowledge base、Memory，分草稿和发布版。[来源](https://docs.n8n.io/build/build-and-manage-agents.md)
  - Zapier：2026-07 起智能体不再是独立对象，而是 Zap 里带工具的 **AI by Zapier** 步骤。[来源](https://help.zapier.com/hc/en-us/articles/47402591569805)
- **工具**分两类，几乎每家都这样分：
  - **组合工具**：一条专门的工作流，入口是「被调用」触发器，出口是「返回结果」动作。Workato skill 是 **Start workflow** + **Return response**，配置页直接问 **When should your genie run this skill?**、**What inputs will your genie require to run this skill?**、**Require user confirmation before executing skill?**；Tray 是 **Agent Tool Trigger** + **Trigger Reply**。
  - **原子工具**：直接暴露一个连接器操作，例如 Tray 的 Connector Tools、Zapier MCP 的动作、Composio 的 `GITHUB_CREATE_ISSUE`。
  - 工具的属性：给 AI 看的 **Name** 与给人看的 **Title** 分开；描述；入参和返回结构；行为标注；执行身份；是否需要审批。
- **身份**：Composio 用 `user_id` 挂 **connected accounts**，**auth config** 决定怎么认证，**session** 决定这一次能用哪些工具和账号；Pipedream 用 `external_user_id`；Tray 把「客户端怎么连 MCP」和「工具用谁的凭证执行」分成两层。
- **会话与调用记录**：Workato **Conversation** 下钻到每条回复的 **Response details**；n8n **Session**；Arcade **Tool executions**；Zapier MCP 的 **History**。
- **AI 搭建的中间产物**：Workato **Blueprint**（资产清单式的实施方案）和 **Recipe state**（AI 每次改动的快照，不是版本）；Zapier Copilot 的检查点；Next Gen Zap 本身就是一段 TypeScript。

## 2. 搭建体验

### 2.1 从一句话到可运行

**Workato AIRO**（[概览](https://docs.workato.com/en/airo.md)、[建 recipe](https://docs.workato.com/en/airo/recipe-editor/create-recipes.md)、[蓝图](https://docs.workato.com/en/airo/blueprints/create.md)）

- 开启 AIRO 后首页换成对话入口。输入框接受文字、文档和 BPMN 图（25 MB 以内），下面是 **Active incidents**、**Pick up where you left off**、**Start your next project**。
- 复杂需求先出蓝图。AIRO 追问应用、触发方式、业务规则和**错误处理**，选好项目后生成一组资产卡片（recipe、genie、skill、API、MCP 服务器）。点卡片看解释，点 **Build** 生成；结果注明「已完成」还是「这几步要手动配置」。官方示例正好是员工入职：Workday、Outlook、Okta、Jira。
- 简单需求直接在编辑器里建。先过 **Connect your apps**：点 **Skip** 也能生成，但映射处会是占位文字而不是 datapill。生成时画布隐藏、对话锁定，完成后在对话里贴摘要。
- **变更追踪最值得学。** AI 每改一次，对话里插一个 **Recipe state** 标记：**View update details** 只看这一次改了什么，标记本身可以对比累计变化，**Restore** 回到任一状态（之后的改动连手动的一起丢弃，先弹确认）。state 不进版本历史，点 **Save** 才出版本。审计日志写「本人账号 + `(via AIRO)`」。

**Zapier**

- Copilot 有两种模式：**Auto-build** 自动选应用、动作、连接和字段映射；**Ask as you build** 每次改动先问再做，文档建议处理敏感数据或可能耗大量任务时用后者。侧栏可展开 **Show reasoning**；用时钟图标存检查点；对话太长会超出上下文、准确率下降；搭建和测试不计任务数。[来源](https://help.zapier.com/hc/en-us/articles/45327353705997)
- Next Gen Zaps（早期访问）：在任意 MCP 客户端里调用 `zapier:build-workflows` 技能，由客户端选连接、接步骤、测试、部署。产物是 TypeScript（上限 20 万字符），在 **Workflow Manager** 里可以用 AI 助手、代码编辑器、画布三种方式改。触发器和动作之间有一个 **Inputs** 步骤，所以一个工作流可以有多个触发器，也可以没有触发器、被智能体或别的工作流调用。文档明说 **Run** 的试运行用真实连接，**不是沙箱**。[来源](https://help.zapier.com/hc/en-us/articles/49005047515021)

**n8n**

- **AI Workflow Builder**：描述需求，看它分阶段构建，检查凭证和参数，再用对话改。每条消息、每次点 **Execute and refine** 扣 1 个 credit，失败的不扣。发给模型的是提示词、节点定义、当前工作流和加载的模拟数据，不发凭证和历史执行。[来源](https://docs.n8n.io/build/ways-of-building-workflows/ai-workflow-builder.md)
- **n8n Assistant**（预览）：规划，在选定项目里建，测试，修错。需要凭证时在对话里弹凭证卡片，只能选已有的或去标准页面新建，秘密不进对话；发布、删除前先问；访问外部网站前按域名请求许可。[来源](https://docs.n8n.io/build/ways-of-building-workflows/n8n-assistant.md)
- 从 MCP 客户端搭建是一条完整链路：`get_workflow_sdk_reference` 取写法；写好代码用 `validate_workflow`、`validate_node_config` 校验；`prepare_workflow_pin_data` 给每个带凭证的节点和 HTTP 节点生成模拟输出的 JSON Schema；`test_workflow` 只让逻辑节点真实执行；`get_workflow_versions_diff` 看字段级差异；最后 `publish_workflow`。[来源](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference.md)

**Tray、Boomi、Pipedream**

- Tray Merlin Build 从步骤间的 **+** 唤起，只能用当前工作区已有的认证；不会填全字段（例如 S3 的桶名和对象键要你填）；提问要具体到能对上连接器操作，有时还要说出「loop」；单次最长约一分钟；文档提醒它会按你的话更新、删除真实记录。[来源](https://tray.ai/documentation/platform/artificial-intelligence/augmented-development/usage-tips-and-faqs.md)
- Boomi DesignGen 先画流程图，按反馈改图，确认后才生成可以在画布打开的流程。[来源](https://help.boomi.com/docs/Atomsphere/Platform/atm-BoomiAI_Boomi_DesignGen)
- Pipedream String 只能改不含分支、Python、多触发器的工作流，2027-03-31 随 Workflows 一起关停。[来源](https://pipedream.com/docs/workflows/building-workflows/build-with-ai.md)

### 2.2 数据映射

- Workato：点输入框弹出按前序步骤推荐的 datapill，菜单底部 **Fill field with AI instead** 交给 AI 生成；结果可 **Insert** 或 **Copy**。AI 引用了不存在的 datapill 时进入 **Remap unknown suggestions**：删掉手选，或点 **Ask AIRO for help**。公式另有 formula 模式。[来源](https://docs.workato.com/en/airo/recipe-editor/map-fields.md)
- Zapier MCP 的托管模式里，管理员给每个工具的字段二选一：交给 AI 猜，或**锁定固定值**。[来源](https://docs.zapier.com/mcp/overview/how-tools-work)
- n8n 用 `$fromAI()` 声明哪些参数由模型填，人工审核时审核人看到的就是这些值。
- 带置信度、逐条接受、用样例预览的映射建议界面：**未查到**。

### 2.3 测试

- n8n 的模拟数据测试最安全：写系统的节点全部用模拟输出，逻辑照常执行。
- 反面：Workato genie 的 **Test mode** 用真实连接、用搭建者本人身份执行、**不走本人确认和审批**，文档专门写了「测试会话可以写生产」。[来源](https://docs.workato.com/en/agentic/agent-studio/test-genie.md)
- Workato Test mode 的好设计：测试场景库（**+ Add scenario** 存一组固定提问），场景之间点 **Reset** 清上下文；检查清单是「调了哪个 skill、搜了哪个知识库、取回哪一段、用了几轮」。
- Tray 的测试面板显示有没有检索知识库、考虑和调用了哪些工具、耗时和 token；测试对话不保存。
- Arcade 把工具调用写成评测用例：期望的工具和参数、加权的 critic，低于阈值（默认 0.8）算失败；**Capture mode** 只记录模型实际调了什么，用来起草期望。[来源](https://docs.arcade.dev/en/build/create-tools/evaluate-tools/why-evaluate)

### 2.4 复用

- Tray 推荐把业务逻辑放进 callable，再套一层薄的工具工作流，同一段逻辑既给 MCP 用也给定时流程用；嵌套最多 5 层、合计 20 个。[来源](https://tray.ai/documentation/platform/artificial-intelligence/agent-gateway/workflow-tools.md)
- Workato 文档列出约 80 个预置 MCP 服务器，本质是可编辑的 recipe 模板，带业务校验（例如供应商入驻先确认再写）。[来源](https://docs.workato.com/en/mcp/prebuilt-mcps.md)
- Zapier MCP 可以分享「工具包」链接，对方拿到同样的工具配置，拿不到你的连接。

## 3. 运行与运维

**运行记录能不能按业务数据查**

- Zapier Zap history 能按日期、Zap 名、应用、文件夹、所有者、状态和版本号筛，**不能按业务字段搜**；只保证 60 天、最多 1 万条。[来源](https://help.zapier.com/hc/en-us/articles/8496291148685)
- Workato 作业报告最多加 10 个自定义列（例如发票号），但只对之后的新作业生效，改列要先停 recipe，打了码的字段不能用。[来源](https://docs.workato.com/en/recipes/jobs.md)
- Arcade 的工具调用记录可按工具、结果、时间、用户编号和**错误文本**过滤，筛选条件写进 URL 方便分享；入参出参默认隐藏，只有项目管理员能打开；默认保留 7 天，可设 1 到 90 天。[来源](https://docs.arcade.dev/en/operate/governance/tool-executions)
- 智能体的记录要能看到推理：Workato **Conversations** 列表有主题、参与者、来源、错误、用户反馈，点开每条回复是 **Response details**（LLM 调用、skill、知识库检索、recipe、应用调用，各有 **Input** 和 **Output**）。Tray 的智能体日志分 **Prompt**、**Reasoning**（**Select tool** 写明为何选它、传了什么参数，**Execute tool** 是完整输出）、**Response**，仍是早期访问。[来源](https://docs.workato.com/en/agentic/agent-studio/conversations.md)

**错误怎么聚合、怎么告警**

- Workato Acumen 盯三类事：**静默失败**（触发器停了、Webhook 因 schema 不对被拒、上游不再发事件，但没有报错）；失败模式（错误突增、连接反复失败、重试风暴、schema 不匹配）；量异常（和历史基线比）。相关信号合成一个事故，写明影响了什么、何时开始、可能原因；首页按 recipe 分组、按业务影响排序，可 **View incident**（进对话调查）或 **Acknowledge**。也能在对话里问「这个连接被哪些 recipe 用」「API 升版会影响哪些 recipe」。[来源](https://docs.workato.com/en/airo/acumen.md)
- Zapier：反复报错的 Zap 会被自动关掉；失败步骤有 **Troubleshoot** 标签，由 AI 解释原因、给出步骤，不改流程。[来源](https://help.zapier.com/hc/en-us/articles/8496037690637)

**重试、重放、改数据后重试**

- Zapier 勾选后批量重放，一次最多 5,000 条，有进度通知和结果汇总；**Autoreplay** 是账号级开关，每个 Zap 可覆盖为 **Always replay** 或 **Never replay**；「重放整次运行」用当前发布版加原来的触发数据。[来源](https://help.zapier.com/hc/en-us/articles/8496241726989)
- Workato 文档直说重跑可能产生重复数据，要自己先查重。[来源](https://docs.workato.com/en/recipes/viewing-jobs-faqs.md)
- 改数据后继续：Zapier **Human in the Loop** 的 **Request Approval** 可设 **Let Reviewer edit content?**，改过的值以 `Edited Content {字段名}` 传给后续步骤。[来源](https://help.zapier.com/hc/en-us/articles/38731463206029)

**AI 维护上线后的集成**

- 真正做到自动修复的只有 Zapier **Agentic Management**（早期访问）。三个开关：**Heal**（运行失败时修）、**Optimize**（成功运行后提改进）、**Automatically apply fixes**（修复不改变工作流能力时自动应用）。以下情况一定等人批：新增工具调用、动作或分支；低置信度；涉及资产或认证。失败先自动重试 5 次，用尽才进入错误状态由智能体接手；修复先测试，再发布成新版本，版本历史里能看改了什么；每个阶段发邮件，自动修了的附差异链接，等人批的直接打开侧栏里的修复和批准按钮。文档举的场景是上游字段改名、连接过期。[来源](https://help.zapier.com/hc/en-us/articles/49007548829069)
- Workato Acumen 只诊断和分析影响，自动改 recipe **未查到**。n8n Assistant 按要求调试最近一次失败，官方示例提示词是「先解释、提出修复，再动手」。Boomi Companion 让 Claude Code 读执行日志来诊断和修流程。[来源](https://developer.boomi.com/blog/boomi-companion-equipping-agents-your-teams-already-use)
- 「对方接口变了，自动改映射」：除了 Zapier Heal 的笼统说法，正式功能**未查到**。工具层靠版本兜底：Composio 工具包用日期版本（如 `20251027_00`），手动执行必须锁定版本。[来源](https://docs.composio.dev/docs/migration-guide/toolkit-versioning.md)

## 4. 生命周期

- **草稿和发布**：Zapier 的智能体发布后不能直接改，要 **Create new draft**（标 v3 这样的版本号）；n8n agent 草稿自动保存，发布是快照，可 **Revert changes** 或 **Unpublish**；Next Gen Zap 在画布左上角切换版本和草稿，**View all versions** 看作者和发布时间。[来源](https://help.zapier.com/hc/en-us/articles/42070243063053)
- **AI 的改动单独成层**：Workato 的 state 不是版本；Zapier 的智能体修复会生成新版本；n8n 的 MCP 能取任意两版的字段级差异。
- **环境**：Workato AIRO MCP 走 OAuth 时，授权范围就是浏览器里当前的工作区和环境，开发、生产要各连一次；MCP Registry 不跨环境。Pipedream Connect 每个请求都标明 `development` 或 `production`。Workato 建议测试时给 skill 换成非生产连接。[来源](https://docs.workato.com/en/airo/mcp.md)
- **工具契约变更**：Workato 改工具的 **Name** 等于换了一个新工具，客户端要重新发现，之前的同意和偏好作废；**Title** 只是给人看的显示名。Tray 的工作流工具改了立即生效、schema 自动更新，没有工具契约的版本。[来源](https://docs.workato.com/en/mcp/manage-tools.md)
- **影响分析**：Tray 的 **Authentications** 页把一个凭证从服务账号切到用户自带之前，先列出所有受影响的工具；Workato 靠在 Acumen 对话里问；我们的决定 000027 已有「被 N 条工作流使用」。
- **协作**：Zapier 智能体有 Viewer、Editor、Owner 三级（[来源](https://zapier.com/blog/zapier-agents-guide/)）；Next Gen Zap 只能共享只读。Workato 建议改 Job description 后 48 到 72 小时抽样复查对话，找回归。

## 5. 治理

**谁能用哪些工具**

- Workato：用户必须进 **end-user group**（管理员也不例外），按组授权 MCP 服务器，按子组授权单个工具。[来源](https://docs.workato.com/en/mcp/mcp-gateway.md)
- Tray：只有 **Access management** 名单里的人能调工具，工作区成员身份不算数；名单里没有角色徽章的人只能执行，看不到工具背后的工作流。[来源](https://tray.ai/documentation/platform/artificial-intelligence/agent-gateway/authentication-and-access.md)
- Zapier MCP：继承账号级的应用和动作限制，但不能只对 MCP 单独设；**对所有账号默认开启，包括 Enterprise**；可按工作区关闭、按成员限制、设任务配额。[来源](https://docs.zapier.com/mcp/security)
- n8n：每条工作流单独打开 **Available in MCP**，只有已发布且带 webhook、表单、定时或聊天触发器的才行；连上的所有客户端看到同一批工作流，不能按客户端区分。[来源](https://docs.n8n.io/connect/connect-to-n8n-mcp-server.md)
- Composio：会话按行为标签过滤（只要 `readOnlyHint`、排除 `destructiveHint`）或用精确白名单，执行时同样强制；白名单能防止同一工具包里新上的工具被顺带放进来。[来源](https://docs.composio.dev/kb/guide/platform-session-tool-policies.md)
- Arcade：三个钩子，列工具时的 **Access**、执行前（放行、拒绝、改入参）、执行后（放行、拒绝、改结果，例如去掉个人信息）。[来源](https://docs.arcade.dev/en/operate/governance/contextual-access)
- Zapier 管理员可以要求含 AI 步骤的 Zap 发布前审批，可以在账号级关掉工具调用，可以禁用指定模型。

**以谁的身份执行**

- Workato **Verified User Access**：工具选 **End user's connection**（调用者本人授权）或 **This recipe's connection**（搭建者的连接），前者只支持 OAuth 2.0 授权码模式。
- Tray：**Service account** 或 **User-provided**。用户自带时，调用中途给一个链接，让用户在自己的个人工作区选或新建凭证；权限少于要求时只警告不拦；映射保存 7 天，想提前换只能断开重连；用 API Token 连入的客户端用不了用户自带。[来源](https://tray.ai/documentation/platform/artificial-intelligence/agent-gateway/dynamic-authentication.md)
- Arcade：工具级即时授权，某个工具第一次需要哪个系统才弹授权，只申请这个工具声明的权限范围。[来源](https://docs.arcade.dev/en/learn/server-level-vs-tool-level-auth)

**人工确认**

- Workato 把两件事分开：
  - **User confirmation**（本人确认）：genie 先展示要调的 skill 和准备好的参数，用户可以改值，再批准或拒绝。文档建议所有写操作都开、读操作别开，参数要给人看得懂的值而不是内部编号。[来源](https://docs.workato.com/en/agentic/skills/user-confirmation.md)
  - **Business approvals**（交给别人审批，Beta）：recipe 里先 **Create approval request** 写入审批数据表，再 **Assign task to user**（最长 30 天过期），审批人在聊天里批；后面必须有批准、拒绝、过期三个分支，可以串多级，也可以按金额查表决定审批人。数据表还管重试：后续写 Jira 失败重试时，查到已批准就不再找经理批一次。[来源](https://docs.workato.com/en/agentic/agent-studio/business-approvals.md)
  - 坑：本人确认在 Test mode 里不生效；无人在场的调用（**Assign task to genie**）跑不了需要确认的 skill，整步不执行。
- n8n：在 AI Agent 节点的工具面板加 **Human review**，把要审的工具接进去；审核渠道可以和对话渠道不同（用户在 Chat 里聊，审批发到某人的 Slack）；消息里用 `$tool.name`、`$tool.parameters` 告诉审核人 AI 想做什么；系统提示词里要写清哪些工具要审、被拒后怎么回复。[来源](https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md)
- Zapier：现在每个工具有 **Require approval before running**，默认关。2026-07 迁移之前，智能体的审批只能写进指令（「继续之前先通过某个应用请我确认」），全靠模型自觉。[来源](https://help.zapier.com/hc/en-us/articles/41776074420493)
- Workato 给工具打 MCP 标注：**Read-only**、**Destructive**（运行前警告）、**Safe to retry**、**Open world**（结果按不可信数据处理）。这些只是给客户端的提示，弹不弹确认由客户端决定。

**限额**

- Workato 网关：速率限制（文档示例每小时 5,000 次工具调用）和用量配额；每个服务器最多 50 个 API Token；同步执行 30 秒超时。
- Zapier：MCP 每次成功调用计 2 个任务；单次运行超过 75 个任务自动暂停待审；Advanced 模型按 3 倍、Premium 按 5 倍计任务，自带 Key 按 1 倍。[来源](https://help.zapier.com/hc/en-us/articles/45863491098893)

**审计与数据**

- 审计要分清「人做的」和「AI 替人做的」：Workato 统一标 `(via AIRO)`；MCP 服务器日志记调用者身份、认证方式、来源 IP、结果。
- Tray：别人的执行记录只显示时间、状态、耗时，入参出参打码；管理员解除打码这一动作本身记审计。[来源](https://tray.ai/documentation/platform/artificial-intelligence/agent-gateway/observability-and-monitoring.md)
- 保留期差别很大：Workato genie 对话即将固定为 90 天且不可配置，不能提前删除某一个人的记录；Composio 工具调用日志默认连入参出参存一年，可开零数据保留；Pipedream Connect 不存请求体和响应体。[来源](https://docs.composio.dev/docs/security/data-retention.md)
- 护栏：Workato 的个人信息检测覆盖用户输入、工具入参出参和 genie 输出，按信息类型选 **Block** 或 **Redact**（Beta）（[来源](https://docs.workato.com/en/agentic/agent-studio/guardrails/guardrails.md)）；Boomi 默认带脏话、提示注入、有害内容过滤，可加最多 30 个禁谈话题、词表和正则（[来源](https://help.boomi.com/docs/Atomsphere/Platform/Creating_guardrails)）。

## 6. 连接器策略

| 产品 | 规模（官方自述） | 深度怎么做 |
| --- | --- | --- |
| Zapier | 8,000+ 应用 | 工具都由 Zapier 维护，不能从第三方引入，以此防工具投毒 |
| Workato | 约 80 个预置 MCP 服务器 | 按场景组合、可以改的 recipe；文档批评很多厂商的 MCP「只是 API 包装」 |
| Tray | 700+ 连接器 | 读操作直接暴露，写操作包成带校验和审批的组合工具 |
| Boomi | 经 Boomi Connect 接 1,000+ 企业工具 | MCP Registry 收录自建、从公共注册中心导入、管理员登记的服务器 |
| Pipedream | 3,000+ API、10,000+ 工具 | 每个应用一个 MCP 服务器，组件注册表在 GitHub 开源 |
| Composio | 1,500+ 工具包 | 工具名 `{TOOLKIT}_{ACTION}`，按日期版本发布 |
| Arcade | 81 个 MCP 服务器、7,500+ 工具 | 自称面向智能体优化而非 API 包装；有工具开发包和评测；2026-08 Smithery 并入 Arcade |

规模出处：[Zapier](https://help.zapier.com/hc/en-us/articles/24393442652557)、[Tray](https://tray.ai/documentation/platform/artificial-intelligence/agent-gateway/connector-tools.md)、[Boomi](https://boomi.com/blog/boomi-innovations-may-2026/)、[Pipedream](https://pipedream.com/docs/connect/mcp.md)、[Composio](https://docs.composio.dev/llms.txt)、[Arcade](https://docs.arcade.dev/llms.txt)、[Smithery 并入 Arcade](https://www.arcade.dev/blog/smithery-joins-arcade/)。

- **工具设计的两种主张**：Workato 要单一用途、可组合，副作用和限额要写在明处（不要让 `update_order` 顺手发邮件，不要让 `search` 悄悄只返回 10 条），错误码统一（[来源](https://docs.workato.com/en/mcp/mcp-server-tool-design.md)）。Tray 主张把多步逻辑包成组合工具，减少上下文和幻觉，例如「发 Slack 消息」在内部查人、重名时反问（[来源](https://tray.ai/documentation/platform/artificial-intelligence/agent-gateway/overview.md)）。两者不矛盾：**读用原子工具，写用组合工具**。
- **AI 生成连接器**：Workato AIRO MCP 给 Claude Code 一套工具：建连接器、读源码、打补丁（先按 SDK 规则校验）、保存新版本、和已发布版比差异、发布。没有 API 文档时客户端会上网搜，文档要求人工核实；目前只对部分客户开放。[来源](https://docs.workato.com/en/airo/build/custom-connectors.md)
- **接入外部 MCP**：Workato 用代理把第三方服务器纳入同一个网关和注册中心；Zapier、n8n 都能把远程 MCP 服务器当工具用。Boomi Labs 承认，已部署的智能体之间还不能互相当工具调用，实际要靠流程居中协调。[来源](https://labs.boomi.com/labs/supply-chain-logistics/sourcing-agent/part-3-integrate-agent)

## 7. 现在实际能做到什么

| 能力 | 已能用 | 预览或限量 | 只在路线图 | 质量与限制 |
| --- | --- | --- | --- | --- |
| 一句话生成集成 | Zapier Copilot、Workato AIRO、n8n AI Workflow Builder、Tray Merlin Build、Boomi DesignGen | n8n Assistant | — | 都要求人工复核；Tray 不填全字段；Workato 会标出需手动配置的步骤 |
| 在 IDE 或 MCP 客户端里搭建 | Boomi Companion（2026-05）、Tray Headless | n8n 实例级 MCP、Zapier Next Gen Zaps、Workato AIRO MCP 建连接器 | — | 都靠校验、差异、测试兜底 |
| AI 解释错误 | Zapier Troubleshoot、Workato Acumen、Boomi Companion | n8n Assistant | — | 多为解释和建议 |
| AI 自动修复线上集成 | — | Zapier Agentic Management | — | 只此一家，而且有必须人批的边界 |
| 静默失败、基线异常 | Workato Acumen | — | — | 其他家**未查到** |
| 受治理的工具层（MCP） | Workato、Zapier、Arcade、Composio、Pipedream、Boomi Connect | Tray Agent Gateway（要开通，OAuth 只支持 Claude Desktop） | — | 治理深度差别很大 |
| 运行期智能体 | Workato genie、Zapier AI 步骤加工具（2026-07-15 起）、Boomi Agentstudio | n8n Agents、Tray Agent Builder | Boomi 智能体版本与评测、自带模型、客户自托管运行时 | 审批、护栏多为 Beta |

**哪些是噱头**

- 「几千个应用都能当工具」：工具一多就选错。Tray 建议每个服务器控制在 15 到 20 个；V2EX 有人抱怨挂一个 GitHub MCP 就加载 90 多个 schema。
- 「AI 员工」式的独立智能体产品：Zapier 已经并回工作流，Pipedream 的 String 停了。
- 「全自动自愈」：唯一的实现还在早期访问，而且凡是改变能力、低置信度、动凭证都要人批。
- 「用提示词当护栏」：把确认、限额写进指令不算治理，Zapier 的邮件智能体就是这样被注入的。

## 8. 用户真实的称赞和抱怨

- **n8n 的 AI 额度**：一位懂流程、不会编程的运营几个小时就用光 credit，社区建议改用 Claude 通过实例级 MCP 搭建，不占内置额度（[帖子](https://community.n8n.io/t/new-to-building-workflows-used-up-all-ai-credits-in-a-few-hours-use-claude-instead/317313)）；额度在调试中途用完，愿意付钱也买不到加量包（[帖子](https://community.n8n.io/t/one-off-ai-workflow-builder-credit-purchases-to-avoid-blocking-active-projects/307741)）；额度用完时助手只报「Something went wrong」，官方承认还没改成明确提示（[帖子](https://community.n8n.io/t/ai-assistant-isnt-working-what-should-i-do/302853)）；刷新页面会中断生成，额度照扣（[帖子](https://community.n8n.io/t/prevent-ai-builder-from-stopping-on-page-refresh-avoid-wasted-credits/259000)）。
- **Zapier**：HN 上有开发者认为把 Zap 暴露成 MCP 服务器比当客户端有意思得多（[HN](https://news.ycombinator.com/item?id=43463196)）。Repello 演示了一封带隐藏指令的邮件，让自动回复智能体汇总历史邮件（含密码）发给攻击者；当时没有审批，额度超了（451/400）还在跑（[研究](https://repello.ai/blog/exploiting-zapier-s-gmail-auto-reply-agent-for-data-exfiltration)，2025-07）。Zapier 自己也写着：早期访问期间别把最敏感的流程放进 Next Gen Zaps（[来源](https://help.zapier.com/hc/en-us/articles/48391476448141)）。
- **Composio**：Cyera 用一把泄露的全权限项目密钥，一次只读调用取回 Gmail 的 access token 和 refresh token、GitHub token、CircleCI key，再用 **Proxy Execute** 读了最近 10 封邮件（[研究](https://www.cyera.com/research/the-hidden-attack-surface-of-agentic-ai-securing-ai-agent-integration-platforms)，2026-08）。GitHub 上：多用户应用没传账号时默认用「第一个连上的账号」，可能串号（[#1816](https://github.com/ComposioHQ/composio/issues/1816)）；返回数据校验失败被静默吞掉（[#2716](https://github.com/ComposioHQ/composio/issues/2716)）；工具只能整体开关，缺按委托范围授权、预算、按目标升级到人工、可证明的审计（[#3123](https://github.com/ComposioHQ/composio/issues/3123)）；想自托管跑不起来（[#642](https://github.com/ComposioHQ/composio/issues/642)）。
- **Arcade**：CLI 不认企业自签根证书，在有 SSL 检查的内网报错（[#798](https://github.com/ArcadeAI/arcade-mcp/issues/798)）。其他评价**未查到**。
- **Pipedream**：官方停掉 Workflows 和 String，理由是「专注做企业把 AI 连到外部世界所依赖的集成层」；工作流数据和凭证 2027-04-30 前删除，只提供 JSON 导出（[公告](https://pipedream.com/docs/workflows.md)）。检索到的报道称 Workday 于 2025-11 宣布收购 Pipedream，未能在官方页面复核。
- **V2EX**：「MCP 是不是已经死了」一帖（37 条回复）里，主流看法是 MCP 占上下文、调试难，不少人转向「Skill 加 API 或命令行」；也有人认为它已成默认依赖，所以没人再提（[帖子](https://www.v2ex.com/t/1199658)）。
- **Workato、Tray、Boomi**：第三方评价**未查到**。它们文档里的自我提醒可以当替代证据：测试会写生产；AIRO 没有细分权限，开启后全体协作者都能用；Tray 的连接器工具没有逐步日志；Boomi 的智能体版本管理和评测还在路线图上。

## 对我们的启示

### 一、2026 年「AI 优先」对我们意味着什么

我们承接的是辅助流程，运行期要确定、可重放、可审计。AI 放在三个位置，而不是塞进每一次运行：

1. **搭建期的副驾驶**：从方案生成草图，给映射表和字段映射提建议，生成节点。产出一律标「待确认」，可撤回，进审计。
2. **运维期的值班助手**：发现静默失败，聚合诊断，给修复提案和影响范围。默认只提案，不自动改线上。
3. **对外的受治理工具**：把查人、查同步状态、重新同步某个人开放成 MCP 工具，让 HR 和 IT 在飞书、企业微信的 AI 助手里直接用。

运行期的智能体节点只做分类、摘要、抽取这类不写系统的事；要写系统，走工具确认。确认只是工具调用前的人工把关，不扩展成流程审批（决定 000039）。

### 二、值得借鉴的具体设计

1. **AI 变更卡与撤回**（学 Workato recipe state）。编辑器右侧 AI 面板，每次 AI 改动后插一张卡：一行摘要（「新增：飞书 确保账号；映射：部门 → 部门映射表」）、**本次改动**、**与当前对比**、**恢复到这里**（确认框写明会丢弃之后的手动修改）。卡片不是版本，点「发布」才出版本。AI 生成的节点带「待确认」角标，确认一个消一个。审计里写「王磊（经 AI）」。
2. **先出方案草图再生成**（学 Workato Blueprint、Boomi DesignGen）。从方案新建「北森 → 飞书人员同步」时，AI 先问 3 到 5 个关键问题：业务键用工号吗？离职是停用还是删除？部门映射从哪来？通知发哪个群？然后出一列卡片：触发与检查点、业务键、按期望状态收敛、确保账号（幂等）、仅状态变化时通知、映射表、对账规则、告警策略。每张卡有「生成」按钮和「需要你手动完成的事」（例如飞书应用的通讯录权限范围）。
3. **只读试运行做默认**（学 n8n 的模拟数据测试，避开 Workato、Zapier 的直连生产）。试运行对话框两档：**只读试运行**（默认，读真实的北森变动，写操作只显示「将会创建飞书用户 张三 zhangsan@…」）；**真实试运行**（二次确认，列出将写入的系统和条数）。AI 生成或修改后，自动跑一次只读试运行，再请人确认。
4. **AI 值守，按风险分级放权**（学 Zapier Agentic Management，边界收得更紧）。问题中心设置里每条集成一张卡，三个开关：**AI 诊断**（默认开）、**修复提案**（默认开）、**自动应用**（默认关）。自动应用只允许不改变能力、不碰凭证、不涉及不幂等写操作的修复；新增步骤、改连接或凭证、低置信度、涉及离职停用一律等人批。修复先只读试运行，再发布成新版本，飞书或企业微信卡片里附差异和「批准」按钮。
5. **静默失败进问题中心**（学 Acumen）。新增问题类型「该来的没来」：例如北森工作日平均 38 条变动、今天 0 条，或 Webhook 连续被拒。文案写业务影响（「可能有 N 人没同步」），和对账差异一起按影响排序。
6. **MCP 工具治理表**（学 Workato 的标注、Tray 的凭证影响清单、Zapier 的逐工具审批）。MCP 服务详情页的工具表，每行：给 AI 看的名字和显示名、来源（工作流或连接器操作）、类型（只读、写·幂等、写·不幂等、破坏性，直接取连接器的幂等声明）、执行身份（服务账号或调用者本人）、调用前（不确认、调用者确认、指定人审批）、限额（次/小时）、最近 7 天调用和失败数。改执行身份时弹出受影响的工具清单；改工具名提示「客户端会当作新工具，之前的确认偏好失效」。默认规则：不幂等的写操作不能做成原子工具，只能经组合工具开放。
7. **确认卡片**（学 Workato 本人确认与业务审批的区分、n8n 的 `$tool`、Zapier 的可编辑审批）。推到飞书或企业微信：「AI 助手请求：在飞书停用账号」，参数用人话（姓名、工号、部门，不显示 open_id），按钮 **批准**、**改后批准**、**拒绝**；超时默认 30 分钟，按拒绝处理并告诉调用方。区分「本人确认」和「交给负责人审批」。无人在场的调用（定时、工作流里的智能体）不能选本人确认，只能走审批或禁用。审批结果持久化，重试时不再找人批第二次。
8. **工具调用记录**（学 Arcade、Tray）。MCP 服务加「调用记录」页签：时间、调用者、客户端、工具、结果、耗时、确认人。可按调用者、工具、结果、错误文本筛，筛选条件进 URL。入参出参默认折叠，别人的记录打码，「查看原文」要权限、填原因、记审计。保留期跟平台设置走。
9. **AI 设置与用量护栏**（学 Zapier 的 75 任务暂停和模型禁用、n8n 的数据开关）。管理后台「AI」页：模型来源（OpenAI 兼容地址，可填国产模型或机房内模型；没配就显示「AI 未启用」，其他功能照常）、允许的模型、发给模型的数据三档（只发结构、发打码样例、发真实值）、单次智能体运行的步数和 Token 上限（超出暂停待审）、每个项目的月度预算。额度用尽给明确提示，不报通用错误。
10. **业务键一次定义，历史运行都能查**。对照 Workato 的自定义列：只对新作业生效、改列要停 recipe。我们的业务键在触发器上定义，查人和查运行都应覆盖全部历史；改业务键时提示「将为历史运行重建索引」。

### 三、反面教材

- 用提示词实现审批和限额（Zapier Agents 早期做法），被提示注入后外发数据。
- 测试模式直连生产、绕过确认、用搭建者身份执行（Workato Test mode）；试运行不是沙箱（Zapier Next Gen Zaps）。
- 确认机制只在有人对话时成立，无人值守时整步不执行（Workato），而且设计期不提示。
- 工具改名后授权作废（Workato）；工具改动即时生效，没有契约版本（Tray）。
- 平台集中托管终端用户令牌，项目密钥能把令牌取回（Cyera 对 Composio 的研究）；没指定账号时默认用第一个（Composio #1816）。
- MCP 对所有账号默认开启，要管理员主动去关（Zapier）。
- 对话日志保留期固定、不能按人删除（Workato），和个人信息保护法的删除权冲突。
- AI 额度用尽时报通用错误、生成过程刷新即丢且照扣额度（n8n）。
- 自托管的 AI 助手要额外起特权容器沙箱，生产环境推荐云沙箱 Daytona（[n8n](https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-n8n-assistant.md)），违背零配置。
- 独立智能体产品和工作流割裂，最后只能迁回或关停（Zapier Agents、Pipedream String）。

### 四、对我们定位的特别含义

- **自托管**：AI 必须可选、零配置降级，没配模型时显示「AI 未启用」，其他照常。支持 OpenAI 兼容端点，客户可以接国产模型或机房内的模型（n8n 已支持本地端点，示例里还有经 OpenRouter 接 DeepSeek）。凭证不出机房、令牌永不经接口返回，是相对 Composio、Pipedream 这类托管凭证平台的明确卖点，应写进安全说明。
- **中国企业**：确认、告警、修复审批走飞书、企业微信、钉钉的卡片，不靠邮件；MCP 默认关闭，由平台管理员按项目开放；日志打码、保留期可配、能按人删除，对应个人信息保护法。
- **辅助流程**：决定 000042 的「对这个业务键再跑一次」天然幂等，最适合当对外的写工具，例如「重新同步工号 E10231」。查人、查同步记录做成只读工具：HR 在飞书里问「张三怎么没账号」，AI 助手调读工具就能答。这是我们最实在的 AI 优先落点，比聊天式搭建更贴近首发用户。
- **首发用户**：集成工程师会在 Claude Code 里干活，我们已有 MCP（决定 000034），下一步是补「工作流有代码表示 + 校验 + 差异 + 只读试运行」这条链路，而不是先做聊天式生成。值班运维要的是第 4、5 条：静默失败和修复提案。
