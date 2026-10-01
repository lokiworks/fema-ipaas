# 组织架构与人员生命周期：部门、生效日、离职交接、临时改值

调研时间 2026-10-01。这是第二轮补证，回答完整性检查留下的四个缺口：组织架构要不要同步；未来生效与撤销；离职交接；临时改值。第一轮已查清的内容（Okta 的 Pre-Start Interval 和 Import Safeguards、Entra 的 `Switch()` 与 accidental deletions、竹云的删除策略、飞书 `is_frozen` 与 `client_token` 等）只引用 `declarative-sync.md`、`users-and-scenarios.md`，不再复述。

标注：【文档】官方文档原文；【二手】从业者文章或搜索摘要；【推断】由文档推出、未经验证；【需实测】只有真实租户能确认；【未查到】查过、没找到；【需访谈】要问客户。北森开放文档要登录，本文和第一轮一样用北森在 apifox 上的官方镜像（`italent.apifox.cn`）。飞书、钉钉、企业微信、Celigo 的部分页面是脚本渲染的，本轮用浏览器渲染后读的原文。来源编号见文末。

## 一页结论

1. **国外 IdP 不同步部门树，国内 IDaaS 同步。** Okta 的 Workday 集成只把一个字段（默认 Business Unit）写进用户的 `department` 字符串；Entra 用 `Switch()` 把人放进事先建好的 OU，找不到就落默认 OU；两家接飞书都走 SCIM，部门只是用户上的一个属性（S1、S11、S12、S18、S19）。竹云、Authing、阿里云 IDaaS 都把组织树当一等对象同步到 IM，并且都给「删组织」单独设了策略或保护（S63、S64、S66、S68、S72）。
2. **推荐首发做「部门映射 + 可选的只建不删」，不做完整的部门树同步。** 映射是默认；另给一个默认关闭的开关「在指定根部门下补齐缺失部门」，按北森组织编码写飞书自定义部门 ID，只建、改名、移动，永不删除；北森停用的组织在台账里标「待清理」，删不删由人决定。理由是出错代价、飞书侧的硬约束（删部门要先清空、改部门 1 QPS、外部数据源的部门不能改），以及决定 000041 不做身份产品（第 1.6 节）。
3. **批量闸门要管部门。** 北森停用一个组织会联动停用全部下级（S61）；Entra 把组的删除计入阈值，竹云的阈值包括「删除组织 / 组织层级变动」，阿里云 IDaaS 删超过 10 个组织就停（S14、S63、S72）。闸门的计数要从「本轮停用人数」扩到「本轮换部门人数、部门移动数、部门删除数」。
4. **北森的未来生效变动不会在生效日自己冒出来。** 时间窗按修改时间查，文档里没有按生效日期查的类型；默认返回「最新主职记录」（可能是未来才生效的那一条），传 `isGetLatestRecord=false` 才是「当前生效」；只返回审批生效的记录；默认不含离职、不含待入职、不含已删除（S49、S51、S52）。平台要在读到变动时读整条任职时间轴，自己按生效日排程，到点重读当前生效状态再执行。撤销在文档里没有专门字段，最可能表现为任职记录被删除或审批状态变化【需实测】。
5. **Okta 和 Entra 都在生效日上吃过亏，微软给的方向是「存日期、到点按状态判断」。** Okta 的 Pre-Start Interval 会把其他未来生效的更新一起提前导入，入职日推后超出窗口会把人停用；Entra 的 Workday 连接器把未来生效的转岗当成新入职提前写进 AD，亚太的离职晚 12 到 18 小时，SuccessFactors 撤回的 offer 根本取不到，「需要带外处理」；微软建议把离职日同步进 `employeeLeaveDateTime`，由 Lifecycle Workflows 按状态到点执行（S1、S2、S8、S9、S13）。
6. **第一轮有一条前提要改：飞书删人时没有接收人、员工又没有上级，文档不再被删除。** 现行「删除用户」文档写的是：文档、妙记、邮件保留在该用户名下，日程和问卷才直接删除；管理后台写明「资源转移后不可撤销」；恢复已删除用户只限离职 30 天内，已转移的资源、所属部门、管理员角色恢复不了（S26、S27、S28）。「首发只暂停不删除」的结论不变，理由要换。
7. **「停用前先转交」在三家 IM 上都做不全；飞书官方的顺序是「先暂停，再转交，最后离职」。** 飞书的文档、日程、邮件、应用、部门群、外部群只能随删除接口一起转；单独转文档要以文档所有者身份调用，转普通群的群主要求机器人是群主或管理员；只有审批待办能用接口逐条转（S26、S28、S31、S32、S33）。钉钉通讯录删人接口没有任何交接参数，智能人事「确认离职并删除」接口能指定审批、团队文档、钉盘、权限、直属下属五类交接人（S35、S36）。企业微信删人不可恢复、消息记录清空、连同绑定的腾讯企业邮一起删，接口能转交的只有客户和客户群（S42、S43、S46、S47）。
8. **交接要建模成离职之后的缓冲期，不是停用前的一个附加动作。** 生效当天暂停（飞书 `is_frozen`、企业微信 `enable=0`）→ 缓冲期内做接口能做的交接、其余生成对方待办 → 到期删除并按接收人规则转移，删除前过闸门。钉钉没有暂停接口，只有「待离职 → 确认离职并交接」。
9. **临时改值：Celigo、Okta、Entra、竹云都没有「针对一个人、带到期日的覆盖值」。** 有的是一次性改重试数据（Celigo 提醒改完要回端点改）、解除这个人和来源的绑定再手改（Okta）、字段只在创建时写（Entra、竹云「执行方式：创建」）、找不到值时用默认值（Entra 的默认 OU、`IgnoreFlowIfNullOrEmpty`）（S6、S7、S9、S11、S15、S63、S74）。
10. **推荐不做覆盖值，做两件小事：入职缺映射时放「待分配」部门让账号先到位；带到期的字段级例外（到期前不改写这个字段，单列「例外中」）。** 「到位」永远对照源系统当前生效状态判定，例外和临时值都不算到位；到期自动复查，源改好了例外自动关闭，没改好就变成未到位并提醒数据所有者。

---

## 1. 组织架构要不要同步

### 1.1 各家怎么做

**Okta（Workday 为源）**
- 部门是用户上的一个字符串：「Department Field 决定用 Workday 的哪个字段做 Okta 用户的 department 属性，默认是 Business Unit」（S1）【文档】。
- 能导入的结构只有 Workday Provisioning Groups，「Workday 安全组不导入」；Provisioning Groups 要在 Workday 里手工建，导入后当普通组用，用于分配应用、MFA 策略，以及驱动 AD 开通（S1）【文档】。把 Supervisory Organization 或成本中心树导成组的选项【未查到】。
- 下游的结构靠 Group Push：「用来在下游应用里建组、维护组成员」。解除推送有两种：解除并在目标应用里删掉这个组，或解除并把组留在目标应用（S4）【文档】。第一轮记下的一线抱怨正发生在这里：一次改组拆了 AD 组，下游 GitHub 团队被清空，「没有任何通知」，用户要的是删除缓冲期（`declarative-sync.md` §8，Okta devforum 2025-07-10）。
- 接飞书：飞书管理后台「组织架构数据同步」接 Okta 的 Feishu SCIM 应用，属性表里部门只有一行 `EnterpriseExtension.Department → DepartmentIDs`，职务是 `Title → JobTitleID`；同步日志里能看到「用户关联对象（例如职务，部门等）」（S18）【文档】。部门字符串在飞书里是匹配已有部门还是新建、建在哪一层，文档没写【需实测】。

**Microsoft Entra**
- 进 AD 时按部门放 OU：用 `Switch()` 写规则映射到 `parentDistinguishedName`，官方例子按城市放 OU，「没有匹配时建在默认 OU」；调岗改了 supervisory organization，账号就从一个 OU 移到另一个 OU（S11）【文档】。
- OU 不由开通服务创建：排错表要求 `parentDistinguishedName`「总是算出域内一个已知的容器」，否则导出失败（S12）【文档】。即「只做映射」，结构由 AD 管理员事先建好。
- 成本中心只是可选属性：Workday 的成本中心、成本中心层级默认不取，要加 XPath 作为「信号」才会在 `Get_Workers` 里返回（S8）【文档】。
- 接飞书同样走 SCIM：映射表里是 `department → urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department`；飞书侧可选「收到 SCIM 删除请求时暂停或直接删除」，「飞书中具有相同邮箱地址的现有用户将与 Entra ID 中的用户进行关联」，Entra 侧「也可以设置删除的保护阈值」（S19）【文档】。
- 闸门把组算进去：「被评估为删除的组计入删除阈值；除了删除，停用也一样计入」，每个周期单独计算（S14）【文档】。

**竹云 IDaaS（北森为源，飞书为下游）**
- 读北森组织用的是「查询指定组织的下级组织单元列表」（整树读，不是增量），要填北森根部门 ID；高级配置有「选择根组织」「组织匹配策略」「创建组织（默认是）」「删除组织：默认保留组织即可，还支持禁用、删除组织」（S63）【文档】。
- 安全阈值覆盖组织：「当上游身份源出现删除用户 / 删除组织 / 组织层级变动等情况时」按比例拦截，超过阈值「将不进行禁用 / 删除操作」（S63）【文档】。
- 到飞书：要「授权应用机构，开启机构自动授权，选择机构范围」，再授权账号；验收是在飞书通讯录里「查看同步的组织机构和用户」（S64）【文档】。部门树是被同步过去的。

**Authing（同步中心）**
- 定位：「同步中心连接上下游数据源，实现组织信息和成员信息的同步」；HR 系统里离职一名员工，「自动将其在下游所有应用的账号冻结或删除」（S65）【文档】。
- 下游同步就是一棵组织树加成员：「每个同步任务只能固定同步一棵组织树」「同步任务执行后组织不可更改」；文档直说「直接进行全量下游同步有可能造成下游全部组织和成员的调整」，所以提供按部门勾选的「部分同步」（S66）【文档】。
- 同步记录的类型包括创建部门、修改部门信息、删除部门信息、移动部门、同步部门负责人、修改用户部门（S67）【文档】。
- 删除保护是逐条的：「在 Authing 控制台删除一个用户或部门时，需要在同步中心的删除保护页面进行二次确认」，手动、定时、实时同步都要过；删部门前要先移走子部门和人员（S68）【文档】。这不是阈值，是逐条放行。
- 北森列在「其他应用」里，「请联系北森售后人员获取相关参数」（S70）；常见问题里「下游部门名称不支持特殊字符，比如空格、*、_」会让部门同步失败（S71）【文档】。

**阿里云 IDaaS（附带）**
- 出方向到钉钉：把 IDaaS 的「账户 / 组织数据导入到钉钉的这个节点之下」，节点填钉钉部门 ID；匹配成功「将覆盖更新」；建议「先用小范围的数据（或非生产环境）进行测试验证，完成验证后再扩大节点范围」（S73）【文档】。
- 从飞书拉：「系统内置保护机制，当检测到删除超过 30 个账户或 10 个组织时自动终止同步」（S72）【文档】。

| | 同步部门树 | 部门怎么表达 | 部门找不到时 | 部门删除 | 闸门管不管部门 |
| --- | --- | --- | --- | --- | --- |
| Okta + Workday | 不同步 | 用户的 `department` 字符串；结构靠 Provisioning Groups 和 Group Push | 不适用 | Group Push 解除时选删或留 | Import Safeguards 只说用户【未查到组】 |
| Entra | 不同步 | AD：`Switch` 映射到既有 OU；Entra 和飞书：`department` 字符串 | 落默认 OU | 不删 OU | 组计入删除阈值 |
| 竹云 | 同步 | 组织机构 | 不适用 | 默认保留 | 含删除组织、组织层级变动 |
| Authing | 同步 | 一棵组织树 | 不适用 | 逐条二次确认 | 逐条确认，不按比例 |
| 阿里云 IDaaS | 同步 | 组织节点 | 不适用 | 【未查到】 | 删超 10 个组织即停 |

### 1.2 北森的组织模型（开放平台文档）

- **三个维度。** 组织单元同时有「行政维度上级」`pOIdOrgAdmin`、「业务维度上级」`pOIdOrgReserve2`、「产品维度」`pOIdOrgReserve3`，各有顺序号和路径（S58）【文档】。飞书只有一棵部门树，接的时候要选一个维度，一般是行政维度【推断】。
- **虚拟组织是一个布尔字段** `isVirtualOrg`（S58）【文档】。它在客户那里是项目组、虚线团队还是只为汇报存在的节点，文档没说【需访谈】。
- **组织也有生效日期。** `startDate`、`stopDate`、`isCurrentRecord`（是否当前生效）；查下级组织可以传 `queryDate` 按某一天查（S58、S59）【文档】。组织改组同样可能是未来生效的。
- **停用会联动下级。** 「停用组织单元后，会联动停用该组织的下级组织」（S61）【文档】。时间窗查组织「默认查询未删除、启用的组织单元信息」，要看到停用的得传 `withDisabled`（S60）【文档】。
- **其他字段**：组织类型、组织层级（都是引用对象）、部门负责人 `personInCharge`、HRBP、组织编码 `code`、一到十级组织 OId（S58）【文档】。
- **成本中心不在组织树里。** 它在薪酬模块，接口是「获取未删除的所有成本中心」，而且「需先在薪酬系统对外接口设置中，配置请求路由和返回值等相关参数」才能调（S62）【文档】。成本中心和部门不是一对一，不该拿来建飞书部门【推断】。
- **任职记录上部门和机构是两个字段**：`oIdDepartment`（任职部门）和 `oIdOrganization`（任职机构，如子公司）（S49）【文档】。机构更像飞书的「单位」，部门绑定单位用 `unit_ids`（S20）【推断，需访谈】。

### 1.3 飞书部门树的约束（同步部门时会撞上的）

| 约束 | 原文或错误码 | 来源 |
| --- | --- | --- |
| 只能在应用通讯录权限范围内的部门下建部门；在根部门下建，权限范围要设为「全部成员」 | 创建部门 · 注意事项 | S20 |
| 有一个部门的权限，就有它所有子部门的权限 | 「只要有一个部门的通讯录范围权限，那么就拥有这个部门下所有子部门的权限」 | S23 |
| 删部门要求部门下没有用户和子部门，还要有父部门的权限 | 删除部门 · 注意事项 | S21 |
| 部门名不能含「/」（43029），「不能与存量部门名称重复」（43022）；`order` 也不能和存量部门重复（43005） | 创建部门 · 请求体、错误码 | S20 |
| 上限：单租户 3 万个部门、单部门直属成员 1 万、直属子部门 1000、25 层 | 创建部门 · 使用限制 | S20 |
| 接口不能设置自定义部门字段 | 同上 | S20 |
| 部门结构变更有租户锁，并发会报 43024、43030 | 创建部门、修改部门 · 错误码 | S20、S22 |
| 「无法编辑来自外部数据源的数据」（43031） | 修改部门 · 错误码 | S22 |
| 改用户的 `department_ids`、`is_frozen` 限 1 QPS，并发冻结会概率失败，建议串行 | 修改用户部分信息 · 注意事项 | S25 |
| 可自定义部门 ID（不以 `od-` 开头，最长 64 字符），删除后可复用 | 创建部门 · `department_id` | S20 |
| 已离职用户不能设为部门主管、负责人、HRBP（42006） | 创建部门 · 错误码 | S20 |

三条对设计影响最大：
- **1 QPS。** 一次改组移动 300 人，换部门调用至少 5 分钟，只能串行；回滚同样慢。
- **43031。** 如果客户的飞书组织已由飞书人事或「组织架构数据同步」（Okta、Entra 等）喂入，平台改不了这些部门，只能做映射【推断：43031 的「外部数据源」指这类同步源，需实测】。
- **重名。** 北森常见多个分公司下都有「销售部」。「不能与存量部门名称重复」是全局还是同级【需实测】；如果是全局，按北森名称原样建部门会失败。

### 1.4 两边通常怎么对应、由谁维护

- 北森的组织由 HR 维护（组织调整走北森流程）；飞书的部门由超级管理员或有「成员与部门」权限的管理员维护（S28 的「谁能操作」），除非飞书组织由某个外部源同步喂入【文档 + 推断】。
- 两边怎么对应，一线没有统计【未查到】。可能的三种形态【推断，需访谈】：
  - **镜像**：飞书树等于北森行政维度，常见于新开飞书的企业；
  - **收拢**：飞书只到二三级部门，北森的末级组织多对一映射上去；
  - **另起**：飞书按地点、项目或产品线组织，和北森不对齐，只能靠映射表。
- 第三版原型演示的两条核心失败，缺映射（I-19）和新部门不在权限范围（I-20），都是「部门靠手工映射表」的直接后果（`critique-v3.md` P1「组织架构」一条）。

### 1.5 两种做法对比

| | 同步部门（平台在飞书建、改、移、删部门） | 只做部门映射（平台只把人放进已有部门） |
| --- | --- | --- |
| 上线第一天 | 选根部门和维度；把飞书现有的手工部门和北森组织对上（按编码或名称路径，冲突进待确认池）；权限范围要覆盖根部门，在根下建部门还要「全部成员」；首轮会改名、移动现有部门，部门群、按部门配的审批跟着变 | 为在范围内的北森组织逐个选飞书部门（几十到几百行，可按名称路径批量推荐）；不动飞书现有结构 |
| 日常维护 | 新部门自动建，子部门自动在权限范围内，40004 基本消失；HR 在北森建错、挂错层级会立刻反映到飞书 | 每出现一个新部门，就要有人补映射，可能还要在飞书建部门、加权限范围 |
| 出错代价 | 高：删部门要先清空；误移影响可见范围、部门群和审批人；北森停一个组织联动停全部下级；换部门 1 QPS，回滚慢 | 低：最坏是人进了待分配部门或停在原部门；平台不碰结构 |
| 批量闸门 | 必须管部门删除、部门移动和换部门人数 | 管停用人数和换部门人数 |
| 飞书组织由外部源喂入时 | 做不了（43031） | 照常 |
| 和决定 000041 | 往身份产品走了一步（竹云、Authing 的核心能力） | 留在「方案」里 |

### 1.6 推荐

1. **默认只做部门映射。** 映射表的键用北森组织 OId（或编码），不用名称；每行选「找不到时」：
   - 入职：默认「放到待分配部门并开问题给映射表负责人」，新人当天有账号；
   - 调岗：默认「保持原部门，部门字段记为未到位」，不把在职员工挪进待分配。
   这比 `china.md` §11.1 第 13 条的「缺映射一律停在等待前置」更细：入职等不起，调岗等得起。
2. **可选开关「在指定根部门下补齐缺失部门」，默认关闭。** 只对映射表里标了「自动」的子树生效；飞书部门 ID 写成北森组织编码，之后一律按 ID 操作；只建、改名、移动，不删；北森停用或删除的组织在台账标「待清理」，由人在飞书处理。打开前的检查：根部门在应用权限范围内；目标部门不是外部数据源（读到 43031 就提示不能开）。一个经验规则【推断】：飞书是新开的（现有部门很少）时建议打开，飞书已用多年时保持映射。
3. **部门也进「对应关系」。** 北森组织 ↔ 飞书部门，状态和人员一样（已链接、待确认、冲突、例外）。首次启用时和人员一起对齐：已匹配、北森有飞书无、飞书有北森无（如「外部协作」「会议室」）、冲突。
4. **虚拟组织默认不进映射**，以后可以单独映射成飞书用户组；**成本中心不建部门**，需要时写用户自定义字段（要飞书管理员先在「成员字段管理 → 全局设置」打开「允许开放平台通讯录 API 调用」，见竹云的配置步骤 S64）。
5. **负责人和上级算依赖。** 部门负责人已离职报 42006，用户上级已离职报 44021（`users-and-scenarios.md` §5.4）；处理顺序是部门先于人员、上级先于下属。

### 对设计的含义

- 台账里，部门是人员结果的一个关键字段，不单独成为一种应有结果；只有打开「补齐部门」时，部门才作为第二类业务记录（键是北森组织 OId，形态「保持一致」）进台账。
- 映射表负责人是数据所有者（HRIS）。给他的待办写成「缺映射的北森组织 + 受影响人数 + 推荐的飞书部门」，补完走变更通道。
- **闸门计数扩展**：本轮停用人数、本轮换部门人数、本轮部门移动和删除数，任一超阈值整批暂停。北森停用组织带出的联动要合并成一条问题：「北森停用了 X 及其 N 个下级组织，影响 M 人」。
- 设计期检查加两项：映射表的目标部门都在飞书权限范围内（第一轮已提）；开补齐时根部门在范围内且不是外部数据源。
- 组织改组也有生效日期，和人员变动一起排程；预演卡按 1 QPS 估算耗时（「换部门 300 人，约 5 分钟」）。

---

## 2. 未来生效与撤销

### 2.1 北森开放平台（只看官方文档）

**文档写明的**

- 时间窗查询（员工与单条任职）：「默认查询未删除、审批生效的员工信息」「只支持查询审批生效的任职记录」；时间窗不超过 90 天（S49）【文档】。
- `isGetLatestRecord`：「默认 true 查询最新主职记录，为否时获取当前生效主职记录」（S49）【文档】。旧版接口同样「默认是」（S52）。最新记录可能是未来才生效的那一条【推断，按字面】。
- 人员状态：`empStatus` 为空且 `withDisabled=false` 时只查「试用、正式、返聘」；`withDisabled=true` 才查全部状态（S49）【文档】。默认既不含离职，也不含待入职（旧版示例里 1 是「待入职」，S52）。
- `isWithDeleted`：「是否包括已删除数据，默认否」（S49）。旧版接口写着：「若查询已删除状态的数据，则已删除数据会自动忽略传入的员工状态、任职类型条件，用以解决待入职数据无法查询问题」（S52）【文档】。
- 任职记录是时间轴：`startDate`「任职记录的生效时间，用于任职记录的时间轴」、`stopDate`、`entryDate`、`lastWorkDate`「离职操作时，任职记录的最后工作日」、`approvalStatus`（示例「1（审批中）」）、`changeTypeOID` 变动类型、`transitionTypeOID` 异动类型、`stdIsDeleted`；`businessModifiedTime`「系统更新数据时，该字段值不会修改」，`modifiedTime`「系统更新数据时，该字段值会修改」（S49）【文档】。
- 按 UserID 读任职记录：`option` 为 1「直接获取最新主职任职记录」，为 2「直接获取当前生效的主职任职记录」；「支持查询已删除的数据」；`approvalStatus`「默认审批生效，空表示查询全部」，示例 [4] 表示审批生效（S51）【文档】。另有返回一个人多条任职记录的时间窗接口（S50）。
- 审批状态至少有「审批中、审批通过、审批生效」，另有「审批不通过、驳回」（「发起离职交接流程」的适用场景原文，S56）【文档】。
- 调动接口必填 `startDate`（生效日期），离职接口必填 `lastWorkDate`；两者都「不支持调动申请 / 离职申请，请在页面进行操作」（S54、S55）【文档】。
- 删除待入职：「不支持删除已入职的员工」，「若想删除已入职的员工，需在界面操作按生效时间从后往前删除任职记录到待入职」（S57）【文档】。界面能按时间轴从后往前删任职记录。
- 时间窗类型 `timeWindowQueryType` 必填，但所有页面都没有列出取值，示例只用 1（S49、S60）。旧版接口分「根据修改时间窗」和「根据业务修改时间窗」两个（S52、S53）。按生效日期查的时间窗【未查到】。

**能回答的和不能回答的**

| 问题 | 按文档的结论 | 不确定处 |
| --- | --- | --- |
| 未来生效的调岗什么时候能查到 | 审批生效后出现在修改时间窗里；默认返回最新记录，能看到未来的新部门和它的 `startDate` | 未来生效的单子是在审批完成时就「审批生效」，还是停在「审批通过」直到生效日【需实测】 |
| 生效当天会不会再出现在时间窗里 | 没有按生效日查的时间窗；生效当天没人改数据，`modifiedTime` 大概率不变 | 北森是否有日终任务在生效日改写记录（工龄字段「每天定时任务刷新」会不会带动 `modifiedTime`）【需实测】 |
| 未来生效的离职 | 离职记录上能读到 `lastWorkDate`；默认查询不含离职，要传 `withDisabled=true` 或显式人员状态 | 生效前这个人的人员状态是在职还是离职【需实测】 |
| 待入职（入职前开通） | 待入职是人员状态之一，默认查询不含；`entryDate` 是入职日期 | 招聘模块「查询待入职人员信息」和核心人事的待入职是不是同一批人、谁先出现【需实测】 |
| 撤销怎么体现 | 文档没有「撤销」字段。可能的表现：任职记录被删除（`stdIsDeleted`，要 `isWithDeleted=true` 才查得到）；审批被撤回或驳回（生效前撤回的，时间窗本来就查不到）；删除待入职员工（旧版接口说已删除数据可查） | 每一种在接口里的样子【需实测】 |
| 组织的未来生效 | 组织有 `startDate`、`stopDate`、`isCurrentRecord`，可按 `queryDate` 查 | 同上 |

**仓库现状**：北森触发器调的是文档标为「不推荐」的「根据修改时间窗分页查询」（`/TenantBasePublicApiV2/v2/employee/timewindow/search`），传的是时间窗、`capacity`、`scrollId` 和 `isWithDeleted: false`，没传 `WithDisabled`、`IsGetLatestRecord`（`packages/connectors/community/beisen/src/lib/triggers/employee-changed.ts`）。该接口文档里删除开关叫 `WithDeleted`、分页是 `PageIndex/PageSize`（S52）。按文档默认，它读不到离职和已删除的记录，拿到的是最新而不是当前生效的记录。仓库实测记录写的是返回 `scrollId`（`china.md` §8），说明线上行为和文档不完全一致，参数是否生效【需实测】。

**建议的实测脚本**（一个北森沙箱租户，两周）：
1. 走审批建一笔 7 天后生效的调岗、一笔 7 天后生效的离职、一个 10 天后入职的待入职；
2. 每天各调一次：单条时间窗（最新 / 当前生效 × 含删除 × 含离职）、按 UserID 取全部审批状态；记下 `approvalStatus`、`stdIsDeleted`、`modifiedTime`、`businessModifiedTime`；
3. 生效前分别撤销三笔，再观察三天；
4. 顺带确认 `timeWindowQueryType` 的取值、事件订阅器有没有「生效」类事件。

### 2.2 Okta（Workday）

- **Pre-Start Interval**：入职日前多少天导入并激活；要先开 Profile Sourcing；它「定义的是何时有资格提前导入，不定义何时导入」（S1）【文档】。
- **副作用**：「Pre-Start Interval 非零时，未来生效的 Workday 用户更新会提前这么多天导入」，例子是两天后生效的 provisioning group 变化，在 Interval 为 3 时下一次导入就生效；离职日期和 Custom Reports 的属性不受影响；只想给新人提前、不想其他更新提前，就改用 Custom Reports 的属性（S1）【文档】。
- **改期即撤销**：入职日推后超出窗口，「下一次导入会停用这个用户」，Okta 说这是预期行为（S2）【文档】。撤销入职（Workday 的 rescind）怎么处理【未查到】。
- **离职**：Deactivate on Last Day of Work（最后工作日的次日停用）；Timezone aware terminations（过了员工当地午夜后的下一次导入停用）；Immediate Termination Reasons 经 Real Time Sync 触发，且要求「离职日期是当天」（S1）【文档】。只支持按时区停用，不支持按时区激活（S3）【文档】。
- 全量导入包含「非未来和未来生效的自定义属性」，官方定位是两系统间的对账，常见每周一次（S1）【文档】。

### 2.3 Microsoft Entra

- **Workday 增量同步发三类查询**：手工更新（按 `Updated_From/Through`）；生效日落在两次运行之间的更新和离职（按 `Effective_From/Through`）；未来入职（用这个人的入职日期查）（S8）【文档】。即调岗、离职在生效那一刻取到，新人提前取到。
- **未来入职提前建号**：连接器按入职日查，拿到的 `Active` 已是 1，「可以提前把未来入职者的资料准备好」；「想推迟启用账号，就用 DateDiff」（S8）【文档】。
- **坑一，未来生效的转岗被提前**：在职外包转正式员工、未来生效时，因为连接器「自动处理未来入职」，会在发起当天就把正式员工的信息写进 AD；解法是在 Workday 建 provisioning group 圈出这些人，用范围过滤排除，到生效日再移出（S8）【文档】。
- **坑二，最后工作日拿不到提前量**：Workday 的 Last Day of Work 要等离职生效后才有值；解法同样是 provisioning group（S9）【文档】。
- **坑三，时区**：集成账号按太平洋时间取数，亚太和澳新的离职晚 12 到 18 小时；后来加了 24 小时的 termination lookahead，配合表达式在当地某一时刻停用；已知问题是同一天还有别的生效变更时，会「先临时重新启用，再停用」（S9、S10）【文档】。
- **SuccessFactors**：未来入职按 `asOfDate=startDate` 查；撤回 offer、取消入职的 Onboarding 用户（`inactive_external_suite`）连接器取不到，「没有变通办法，需要带外处理，停用这些人」；已知问题是可能提前一天停用（S13）【文档】。
- **微软给的方向**：SuccessFactors 当天离职可能取不到变更事件，建议「改用 Lifecycle Workflows，这个模型基于状态，而不是基于时间事件」：把离职日同步进 `employeeLeaveDateTime`，到点由工作流停用（S9）【文档】。工作流「不会早于属性里的时间运行」，但租户调度（默认 3 小时）会推迟；入职时间要设在一天开始，离职时间设在一天结束（S17）【文档】。

### 2.4 IM 侧的「待离职」

- **飞书人事管理模式**：办理离职后状态变「待离职」，管理员可以「确认离职」（此时账号关闭，可设日程、文档、部门群的交接人）、「调整离职信息」或「撤销离职」；成员也可以在服务台提交未来日期的离职，审批通过后自动变为待离职（S30）【文档】。
- **钉钉智能人事**：有「员工加入待离职」（带最后工作日）、「撤销员工待离职」「更新待离职员工离职信息」接口；文档提醒「后续的确认离职要使用智能人事的接口，如果是通过其他渠道删人的（比如通讯录接口删人），离职原因和备注等信息都会丢失」（S37、S38）【文档】。
- 两家都把「已决定、未生效」做成一个可撤销的显式状态。

### 对设计的含义

1. **业务记录存时间轴，不只存当前值**：每个员工带当前生效状态和已知的未来变动（类型、生效日、来源记录 ID）。台账行加「已排程」：「张三 · 10 月 8 日调到平台组（已排程）」。
2. **读到任何变动，就读整条时间轴**（多条任职接口，或按 UserID `option=0`、审批状态全部、含已删除），不只信时间窗返回的那一条。
3. **到点执行前重读**：排程到期时按工号读「当前生效」记录，变动还在、生效日没改才收敛；没了就把排程标「已撤销」，不执行。这是决定 000042「读源当前状态再收敛」加一个按生效日的唤醒，也是微软「按状态，不按时间事件」的做法。
4. **兜底两层**：每天一次「今天生效」扫描；周期全量对账读当前生效。不依赖北森在生效日推事件。
5. **连接器的查询参数写死**：含离职、含待入职、含已删除；`isGetLatestRecord` 两种都要用（最新用来发现未来变动，当前生效用来收敛）。按现在的默认值，「确保一致」会在审批当天就把未来的调岗写进飞书，正是 Okta、Entra 踩过的坑。
6. **入职前开通**：默认「入职日前 1 天」，可配。飞书创建用户时「系统会以短信或邮件的形式向用户发送邀请」（S24），提前开通就是提前邀请；飞书「未激活」的账号不能暂停（S29），所以撤销入职时如果账号还没激活，删除没有数据损失，可以作为唯一允许删除的情形；入职日推后超出窗口时不停用（Okta 的做法会让已激活的人掉线），保持现状并在台账提示「入职日改为 X」。
7. **离职按北森 `lastWorkDate` 排程**，时区按中国标准时间，可选「最后工作日当晚 X 点」或「次日 0 点」。
8. **撤销是一等事件**：已执行的变动被撤销（已暂停又撤销离职），用「补到位」反向收敛，预演写清能恢复什么、哪些（已删除、已转移）恢复不了。

---

## 3. 离职交接

### 3.1 飞书

**删除用户接口的转交参数**（S26）【文档】

| 资源 | 参数 | 不指定接收人时 | 他没有直属上级时 |
| --- | --- | --- | --- |
| 部门群（他是群主） | `department_chat_acceptor_user_id` | 转给群内第一个入群的人 | 同左 |
| 外部群（他是群主） | `external_chat_acceptor_user_id` | 转给群内与他同组织、最先入群的人；组织内只剩他就解散群 | 同左 |
| 文档 | `docs_acceptor_user_id` | 转给直属上级 | 保留在该用户名下 |
| 日程 | `calendar_acceptor_user_id` | 直属上级 | 直接删除 |
| 他建的应用 | `application_acceptor_user_id` | 直属上级 | 保留在他名下，但他登不了开发者后台，管理员可手动转 |
| 妙记 | `minutes_acceptor_user_id` | 直属上级 | 保留 |
| 问卷 | `survey_acceptor_user_id` | 直属上级 | 直接删除 |
| 邮件 | `email_acceptor`（1 转移、2 保留、3 删除） | 直属上级 | 保留 |
| 集成平台资源 | `anycross_acceptor_user_id` | 直属上级 | 保留，他登不了集成平台 |

接口没有覆盖的：普通群（非部门群、非外部群）的群主、审批待办、服务台。普通群群主离职后的默认行为【未查到】。

**管理后台和其他接口**
- 管理后台操作离职时可以转移「文档（含飞书妙记）、日程、部门群、外部群、邮件、应用、服务台和审批」；官方建议「先暂停账号阻止成员登录，待完成账号资源的转移后，再操作离职」；另有「仅转移资源」（不离职）；推荐接收人的顺序是直属上级、部门主负责人、当前操作的管理员；「资源转移后不可撤销」；批量离职时只能转给同一接收人；离职后「释放该成员占用的席位」（S28）【文档】。
- 暂停：「暂停期间，该成员将无法登录飞书，但组织内其他成员依然可以向该成员发送消息、邀约日程、共享文件等」；「无法对状态为未激活和未加入的账号进行暂停操作」；暂停可恢复，恢复后能看到暂停期间所有记录（S29）【文档】。暂停占不占席位【未查到】。
- 恢复已删除用户：只限离职 30 天内；可恢复单聊、外部联系人、群聊、企业邮箱地址和邮件、未转移的文档、妙记、问卷；不可恢复已转移的资源、所属部门、管理员角色（S27）【文档】。
- 单独转交：转移云文档所有者要「确保调用身份为云文档的所有者」（S31），应用替员工转不了他的文档；更新群信息的 `owner_id` 只对群主、群管理员，或创建该群且有 `im:chat:operate_as_owner` 权限的机器人开放，新群主还必须在群里（S32）；转交审批任务可以按任务逐条转（需要审批定义、实例、任务 ID），配合「查询用户的任务列表」能找出他的待办（S33、S34）【文档】。
- 删除接口的错误码里有 44062：「根据租户管理员规则配置，该用户仅能通过生命周期引擎删除」（S26）【文档】。飞书侧可能有自己的离职流程接管删除，这条规则怎么配【未查到】。

### 3.2 钉钉

- 通讯录「删除用户」只有 `userid` 一个参数，没有交接；删除后员工从考勤组移除，智能人事花名册移除（S35）【文档】。
- 智能人事「确认员工离职并删除」（`POST /v1.0/hrm/processes/terminateAndHandOver`）：必填离职人、操作人、离职日期、离职原因备注；可选五类交接人：审批（`aflowHandOverUserId`）、团队文档（`docNoteHandoverUserId`）、钉盘（`dingPanHandoverUserId`）、权限（`permissionHandoverUserId`）、直属下属（`directSubordinatesHandoverUserId`）；「本接口调用成功后企业员工将直接离职并从企业通讯录删除」；不支持主管理员（S36）【文档】。没有群主参数。
- 文档（钉钉国际版帮助中心）：文件属于组织；离职员工的「我的文档」不支持离职前主动转交，只能离职后被动转交，默认给主管，没有主管给超级管理员；「通过 API 删除时，接收人默认是主管」；知识库可以离职前逐个转交，不支持批量（S40）【文档】。有「知识库转交所有者」接口（S39）。国内版规则是否一致【需实测】。
- 停用账号：通讯录接口里没有停用或冻结【未查到】；待离职状态是否阻止登录【未查到，推断不阻止】。
- 离职员工所建群的群主：只在搜索摘要里看到「群主退出时自动转给下一个成员」【二手】，官方页面未读到。

### 3.3 企业微信

- 删除成员：「仅通讯录同步助手或第三方通讯录应用可调用。若是绑定了腾讯企业邮，则会同时删除邮箱账号」（S42）【文档】。帮助中心：「删除成员后，成员所有信息和日志将被清除不可恢复」「删除后，成员的企业微信消息记录将完全被清除」（S47）【文档】。
- 禁用：更新成员接口的 `enable`「1 表示启用成员，0 表示禁用成员」，同样只有通讯录同步助手或第三方通讯录应用能调；「禁用后成员将无法登录到对应的企业微信」（S41、S47）【文档】。
- 客户和客户群：
  - 在职继承（`transfer_customer`）每次最多 100 个客户，返回 0「表示成功发起接替，待 24 小时后自动接替，并不代表最终接替成功」，90 个自然日内每位客户只能被转接 2 次（S43）【文档】；
  - 离职继承（`resigned/transfer_customer`、`groupchat/transfer`）只对已离职成员，离职不超过 1 年，接替人一年内登录过、配置了客户联系、已实名；客户群每人每天最多分配 300 个（S44、S45、S46）【文档】。
- 文档、微盘、日程：据从业者文章，管理后台「安全与管理 → 数据资产交接」能交接文档与微盘、日程、客户与客户群，并可开启离职后自动交接给直属上级（S48）【二手，官方帮助页未读到】。接口层的交接【未查到】。

### 3.4 「停用前先转交」可行吗

| | 停用（不删） | 停用后、删除前能用接口转交的 | 只能随删除一起转交的 | 只能在管理后台做的 |
| --- | --- | --- | --- | --- |
| 飞书 | `is_frozen`（1 QPS；未激活的不能暂停） | 审批待办（逐条） | 文档、日程、妙记、问卷、邮件、应用、部门群、外部群、集成平台资源 | 普通群群主、服务台、「仅转移资源」 |
| 钉钉 | 【未查到接口】 | 知识库（逐个） | 审批、团队文档、钉盘、权限、直属下属（智能人事接口） | 群主【未查到接口】 |
| 企业微信 | `enable=0` | 客户（在职继承，24 小时后才知道结果；禁用后还算不算在职成员【需实测】） | 无（删除不交接，还会删企业邮箱） | 文档、微盘、日程【二手】；离职后的客户和客户群可走离职继承接口 |

结论：作为一个通用的「附加动作」，「停用前先转交」做不到，大部分资源要么只能在删除那一刻随接口转，要么只能离职后转，要么只能在管理后台转。可行的是飞书官方推荐的顺序：**生效即暂停 → 缓冲期内交接 → 到期删除并按接收人规则转移**。缓冲期里平台能做的是：用接口做能做的（飞书审批待办、钉钉知识库、企业微信在职继承），其余生成对方待办（「请在飞书管理后台把李四名下 3 个群转给王五」）。

### 对设计的含义

1. **离职的应有结果分两段**：「当天不能登录」（暂停到位，读回 `status.is_frozen`）和「交接完成并清理」（缓冲期到期删除，读回 `status.is_resigned` 和转移记录）。首发做第一段，第二段只做待办与预演，删除仍不开放（与 `design-inputs.md` 第 4 问一致），但设置页先留好「接收人规则」。
2. **接收人规则**：默认直属上级 → 部门负责人 → 兜底接收人（必填）。设计期算出「没有直属上级的人」「上级也已离职的人」，预演里写「张三没有直属上级：日程和问卷会被删除」。
3. **停用前的预演卡**：他是多少个部门群、外部群的群主；名下多少条待审批任务（飞书可查）；是不是租户管理员（44037）、应用负责人；企业微信下还要写「删除会同时删除企业邮箱」。
4. **每家 IM 的交接能力做成连接器声明**（像 Hightouch 让目的地声明同步能力，`declarative-sync.md` §1.4），界面按声明生成选项，不在界面里写死飞书的参数。
5. **交接是异步、可能失败的**：企业微信在职继承 24 小时后才知道结果。台账里「交接」是一个有时限的应有结果，按「每次变化一条」核对。
6. **钉钉方案要单独设计**：没有暂停，只有「待离职 → 确认离职并交接」，安全上的「当天不能登录」只能靠删除或钉钉侧别的手段【需实测】。

---

## 4. 临时改值

场景：源数据一时改不了（比如北森里新人的部门挂错，HR 要走流程），新人当天又必须有账号。

### 4.1 各家怎么处理

- **Celigo**：错误页可以「编辑重试数据」再重试，有授权的 Monitor 用户也能改；文档的步骤是改好字段重试，「如果错误解决了，记得在端点上更新对应的值」；Resolve 用于「已在平台外处理掉的错误」；缺字段一类错误的处理是「在源记录里补上缺的信息」；重试数据只保留每步最近 2 万条，默认 30 天内可重试（S74）【文档】。即一次性改载荷，不改源，不锁定，不到期。
- **Okta**：HR 来源的属性在 Okta 里不能改；办法有三个：在源系统改再导入；「把这个人和来源应用断开，改完再连回去」；或把这个属性的权威源改成 Okta（S6）【文档】。权威源设置「按属性对所有人生效」（S5）。出站映射可选「只在创建时」：值被冻结，「唯一能改的办法是删掉再重建分配」（S7）【文档】。
- **Entra**：「Default value if null」只在创建时使用（S15）；映射可选只在创建时写（`declarative-sync.md` §1.3）；源为空时可以用 `IgnoreFlowIfNullOrEmpty` 保留目标现值（S9）；OU 用 `Switch` 的默认值兜底（S11）【文档】。按人排除只能靠范围过滤，而「保存新的范围过滤会触发一次全量同步，之前在范围内、现在落到范围外的账号会被停用或删除」（S16）【文档】。
- **竹云**：映射的「执行方式」有不映射、创建、更新、创建和更新四种（S63）【文档】，按字段、对所有人。
- **阿里云 IDaaS**：匹配成功即「覆盖更新」（S73）【文档】。
- **Authing**：字段映射只有增加和删除（S69）；「仅创建时写」一类选项【未查到】。

共同点：没有一家有「针对一个人、一个字段、带到期日的覆盖值」。最接近的是 Okta 的「断开来源 → 手改 → 再连回」，没有到期，靠人记得连回去；其次是字段级的「只在创建时写」，对所有人永久生效。

### 4.2 两种做法对比，加一个折中

| | 带到期的覆盖值 | 不做，交给数据所有者 | 折中（推荐）：待分配部门 + 带到期的字段级例外 |
| --- | --- | --- | --- |
| 新人当天有没有账号 | 有，部门也对 | 看 HR 当天改不改；改不了就没有 | 有；部门先放「待分配」，IT 可以在飞书里手动挪到正确部门 |
| 平台存什么 | 一个值（谁、为什么、到期日） | 不存 | 一条例外（谁、哪个字段、为什么、到期日），不存值 |
| 写目标时 | 用覆盖值 | 用源值 | 例外期间不改写这个字段 |
| 到期时 | 回到源值；源没改，就把人改回错的部门 | 不适用 | 复查：源改好了，例外自动关闭；没改好，变成未到位并提醒数据所有者 |
| 风险 | 覆盖值成为第二份事实，和源长期不一致；需要变更通道、审计、权限 | 新人第一天没法工作；IT 绕过平台手工建号，平台再撞「手机号已存在」 | 例外堆积，要有期限和上限 |
| 和「源是唯一真相」 | 打破 | 保持 | 保持：平台从不写入非源的值，只暂停写 |

### 4.3 和「已到位」口径的冲突

- **冲突在哪**：覆盖值生效时，目标和源不一致，却和「覆盖后的期望」一致。算到位，月报里的「32 人全部到位」就掩盖了 HR 数据没修；算未到位，首页一直挂着一个已经处理过的人。
- **处理**：「到位」只对源系统当前生效状态判定，不对覆盖或例外判定。台账行的「例外」细到字段：「账号到位，部门例外中（HR 待改，10 月 8 日到期）」。首页「未到位」不显示例外中的行；数据所有者的「待我修的数据」显示；月报写「到位 31，例外 1」，不并入到位。到期当天自动重评估。
- **例外的边界**：只能开在非安全字段上（部门、职务、显示名）。停用这类安全结果不允许字段级例外；整条结果的例外（如返聘保留账号）只能由平台管理员开，并进审计。

### 4.4 推荐

1. **首发不做覆盖值**，做第 1.6 节的「入职缺映射放待分配」和这里的「字段级例外」。
2. **例外**：默认 7 天、最长 30 天；开的人和原因进审计；到期后同一人同一字段再开，需要映射表负责人或平台管理员。
3. **IT 当天在飞书里手动挪了部门**：平台读回发现部门与源不一致，先看有没有例外；没有例外就按「目标端被人改过」的策略处理（以北森为准覆盖，或保留并记差异，`declarative-sync.md` §9.1 第 7 段）。建议默认「保留并记差异，并建议开例外」，避免平台和 IT 来回拉锯。

### 对设计的含义

- 台账行状态细化到字段级：一个人的「账号」结果可以是「到位（部门例外中）」。
- 「补到位」的预演要列出被例外挡住的字段：「部门：例外中，不改写」。
- 例外是变更通道里的一类变更（设计原则 5），有到期、有负责人；首页右栏可以显示「例外中 N（3 个本周到期）」。
- 数据所有者轻页面的主语是「源里要改的字段」，不是「平台里要填的值」。

---

## 5. 对第一轮结论的修正和补充

| 第一轮的说法 | 本轮证据 | 修改为 |
| --- | --- | --- |
| 飞书删用户时没有接收人、员工又没有上级，文档会被直接删掉（`design-inputs.md`「没进前十」、`users-and-scenarios.md` S4） | 现行删除用户文档：文档、妙记、邮件保留在该用户名下；日程、问卷直接删除；转移不可撤销；恢复限 30 天且恢复不了部门（S26、S27、S28） | 「只暂停不删除」照旧，理由改为：日程和问卷会被删、转移不可撤销、恢复不了部门；企业微信删人还会清空消息并删企业邮箱 |
| 收敛读「当前生效」记录，未来生效的变动按生效日排程（`design-inputs.md`、决定 000042 的补充） | 北森时间窗按修改时间查，默认返回最新记录，默认不含离职、待入职、已删除；没有按生效日查的时间窗（S49、S52） | 读整条时间轴、自己排程、到点重读当前生效再执行；查询参数显式包含离职、待入职、已删除 |
| 首发批量闸门：一轮要暂停超过 5 人或在职人数的 3% 就整批停下 | 北森停用组织联动下级；Entra 把组计入阈值；竹云、阿里云的阈值含组织（S14、S61、S63、S72） | 计数加上换部门人数、部门移动和删除数；北森组织联动合并成一条问题 |
| 部门映射缺失或目标部门不存在时，人员同步停在「等待前置」（`china.md` §11.1 第 13 条） | Entra 用默认 OU 兜底；新人等不起 | 入职缺映射放待分配部门并开问题；调岗缺映射保持原部门、部门字段记未到位 |
| 「例外（可到期）」是台账行的一种状态 | 没有竞品有单人覆盖值；字段级才是真实需要 | 例外细到字段，到期复查，不算到位 |
| 入职前几天开通 | 飞书创建即发邀请；未激活账号不能暂停（S24、S29） | 默认入职前 1 天；撤销入职且账号未激活时，删除是允许的例外 |

---

## 6. 未查到与需实测

| 事项 | 状态 | 怎么补 |
| --- | --- | --- |
| 北森 `timeWindowQueryType` 的取值（1 是修改时间还是业务修改时间） | 未查到 | 问北森或沙箱实测 |
| 未来生效的调岗、离职：「审批通过」与「审批生效」的时间点；生效日当天是否出现在时间窗 | 需实测 | 第 2.1 节的两周脚本 |
| 撤销调岗、离职、入职在接口里的表现 | 需实测 | 同上 |
| 招聘模块的待入职与核心人事待入职的关系 | 需实测 | 同上 |
| 北森事件订阅器有哪些事件、有没有「生效」类事件 | 未查到（文档要登录） | 问北森或在租户里看 |
| 我们的北森触发器所传参数（`isWithDeleted`、`scrollId`）在旧版接口上是否生效 | 需实测 | 对真实租户各调一次比对 |
| 北森虚拟组织、业务维度在客户那里的实际用法；成本中心与部门的关系 | 需访谈 | HRIS 访谈 |
| 北森组织和飞书部门树在客户里怎么对应（镜像、收拢、另起）、谁维护 | 需访谈 | HRIS 和 IT 访谈 |
| 飞书「部门名不能与存量部门名称重复」是全局还是同级 | 需实测 | 在两个父部门下建同名部门 |
| 飞书经 SCIM（Okta、Entra）接入时，部门字符串怎么落成部门 | 需实测 | 测试租户 |
| 43031「外部数据源」具体指哪些来源 | 需实测 | 测试租户接飞书人事或 SCIM 后调接口 |
| 飞书暂停的账号占不占席位；接口能否暂停未激活账号 | 未查到 / 需实测 | 问飞书或实测 |
| 飞书 44062「仅能通过生命周期引擎删除」的规则在哪配 | 未查到 | 问飞书 |
| 飞书普通群（非部门群、外部群）群主离职后的默认行为 | 未查到 | 实测 |
| 钉钉国内版文档交接是否与国际版一致；离职员工群主的默认行为；有没有停用账号的接口 | 未查到 / 需实测 | 实测 |
| 企业微信「数据资产交接」和自动交接的官方说明、是否收费 | 只有二手 | 读官方帮助页或问企业微信 |
| 企业微信禁用成员是否占许可；禁用后还能不能走在职继承 | 未查到 / 需实测 | 问企业微信或实测 |
| Okta 处理 Workday 撤销入职（rescind）；Entra 处理 Workday 撤销入职和撤销离职 | 未查到 | 留待需要时再查 |
| HR 和 IT 能否接受「待分配部门」和「字段级例外」 | 需访谈 | 原型评审时问 |

---

## 来源

**Okta**
- S1　Okta：Workday provisioning（Department Field、Pre-Start Interval、Deactivate on Last Day of Work、Timezone aware terminations、Provisioning Groups）。https://help.okta.com/en-us/content/topics/provisioning/workday/workday-provisioning.htm
- S2　Okta 支持：Workday Hire Date Pushed Back Beyond Pre-Start Interval Deactivates the User（2025-02-06）。https://support.okta.com/help/s/article/workday-integration-hire-date-pushed-back-beyond-pre-start-interval-deactivates-user
- S3　Okta 支持：Workday User Activation Based on User Timezone（2026-08-25）。https://support.okta.com/help/s/article/Workday-User-Activation-Based-On-User-Timezone
- S4　Okta：Group Push operations。https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-group-push-operations.htm
- S5　Okta：Define the attribute profile source。https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-define-attribute-profile-source.htm
- S6　Okta 支持：Unable to Edit Okta User Profile Attributes（2026-09-17）。https://support.okta.com/help/s/article/Unable-to-edit-user-profile-attributes
- S7　Okta 支持：Create Only vs. Create and Update for Okta Profile Mappings（2026-09-22）。https://support.okta.com/help/s/article/create-only-vs-create-and-update-for-profile-mappings

**Microsoft Entra**
- S8　Workday integration reference（增量查询三类、未来入职、未来生效的转岗、成本中心）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/workday-integration-reference
- S9　Troubleshoot user update issues with HR provisioning（Last Day of Work、亚太离职延迟、SuccessFactors 离职延迟与 Lifecycle Workflows、IgnoreFlowIfNullOrEmpty）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/hr-user-update-issues
- S10　Configure Workday termination lookahead。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/configure-workday-termination-lookahead
- S11　Plan cloud HR provisioning（OU 用 Switch、默认 OU）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision
- S12　Workday inbound tutorial（parentDistinguishedName 必须是已知容器）。https://learn.microsoft.com/en-us/entra/identity/saas-apps/workday-inbound-tutorial
- S13　SAP SuccessFactors integration reference（pre-hire、撤回 offer 不支持）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/sap-successfactors-integration-reference
- S14　Accidental deletions（组计入阈值、停用也计入）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/accidental-deletions
- S15　Customize attribute mappings（Default value if null 只在创建时）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/customize-application-attributes
- S16　Scoping filters（改范围触发全量、出范围即停用）。https://learn.microsoft.com/en-us/entra/identity/app-provisioning/define-conditional-rules-for-provisioning-user-accounts
- S17　Lifecycle workflow attribute sync（employeeHireDate、employeeLeaveDateTime、调度）。https://learn.microsoft.com/en-us/entra/id-governance/how-to-lifecycle-workflow-sync-attributes

**飞书**
- S18　帮助中心：管理员同步 Okta 组织架构数据到飞书。https://www.feishu.cn/hc/zh-CN/articles/527839043690
- S19　帮助中心：管理员同步 Entra ID 组织架构数据到飞书。https://www.feishu.cn/hc/zh-CN/articles/551589835558
- S20　创建部门。https://open.feishu.cn/document/server-docs/contact-v3/department/create
- S21　删除部门。https://open.feishu.cn/document/server-docs/contact-v3/department/delete
- S22　修改部门部分信息。https://open.feishu.cn/document/server-docs/contact-v3/department/patch
- S23　权限范围资源介绍。https://open.feishu.cn/document/ukTMukTMukTM/uETNz4SM1MjLxUzM/v3/guides/scope_authority
- S24　创建用户（创建即发邀请）。https://open.feishu.cn/document/server-docs/contact-v3/user/create
- S25　修改用户部分信息（department_ids、is_frozen 限 1 QPS）。https://open.feishu.cn/document/server-docs/contact-v3/user/patch
- S26　删除用户（各类资源接收人、44062）。https://open.feishu.cn/document/server-docs/contact-v3/user/delete
- S27　恢复已删除用户。https://open.feishu.cn/document/server-docs/contact-v3/user/resurrect
- S28　帮助中心：管理员操作成员离职及转移资源。https://www.feishu.cn/hc/zh-CN/articles/360043223853
- S29　帮助中心：管理员暂停成员账号。https://www.feishu.cn/hc/zh-CN/articles/360041605594
- S30　帮助中心：管理员将成员状态更新为待离职。https://www.feishu.cn/hc/zh-CN/articles/703612138512
- S31　转移云文档所有者。https://open.feishu.cn/document/server-docs/docs/permission/permission-member/transfer_owner
- S32　更新群信息。https://open.feishu.cn/document/server-docs/group/chat/update-2
- S33　转交审批任务。https://open.feishu.cn/document/server-docs/approval-v4/task/transfer
- S34　查询用户的任务列表。https://open.feishu.cn/document/server-docs/approval-v4/approval-search/query

**钉钉**
- S35　删除用户。https://open.dingtalk.com/document/orgapp/delete-a-user
- S36　确认员工离职并删除。https://open.dingtalk.com/document/orgapp/api-hrmprocessterminationandhandover
- S37　员工加入待离职。https://open.dingtalk.com/document/orgapp/api-empstartdismission
- S38　撤销员工待离职。https://open.dingtalk.com/document/orgapp/api-revoketermination
- S39　知识库转交所有者。https://open.dingtalk.com/document/orgapp/api-handoveryworkspace
- S40　钉钉国际版帮助中心：Transfer Docs of Departed Staff。https://help.dingtalk.io/docs/admin-guide/transfer-after-departure

**企业微信**
- S41　更新成员（enable）。https://developer.work.weixin.qq.com/document/path/90197
- S42　删除成员。https://developer.work.weixin.qq.com/document/path/90198
- S43　分配在职成员的客户。https://developer.work.weixin.qq.com/document/path/92125
- S44　获取待分配的离职成员列表。https://developer.work.weixin.qq.com/document/path/92124
- S45　分配离职成员的客户。https://developer.work.weixin.qq.com/document/path/94081
- S46　分配离职成员的客户群。https://developer.work.weixin.qq.com/document/path/93242
- S47　帮助中心：如何退出企业 / 删除企业微信账号。https://open.work.weixin.qq.com/help2/pc/14951
- S48　【二手】搜狐《企业微信数据资产交接》，只读到搜索摘要。https://www.sohu.com/a/674293159_120410563

**北森（apifox 官方镜像）**
- S49　根据时间窗滚动查询变动的员工与单条任职信息。https://italent.apifox.cn/api-6342604.md
- S50　根据时间窗滚动查询变动的员工与多条任职信息。https://italent.apifox.cn/api-6342609.md
- S51　根据员工 UserID 集合获取指定条件的任职记录相关信息。https://italent.apifox.cn/api-6342603.md
- S52　根据修改时间窗分页查询变动的员工相关信息（不推荐）。https://italent.apifox.cn/api-6342627.md
- S53　根据业务修改时间窗分页查询变动的员工相关信息（不推荐）。https://italent.apifox.cn/api-6342622.md
- S54　直接调动已入职的正式员工或实习生。https://italent.apifox.cn/api-6342620.md
- S55　直接离职已入职的正式员工或实习生。https://italent.apifox.cn/api-6342619.md
- S56　发起离职交接流程。https://italent.apifox.cn/api-6342602.md
- S57　删除指定待入职员工的员工信息与任职记录。https://italent.apifox.cn/api-6342614.md
- S58　根据组织 OId 集合获取组织相关信息。https://italent.apifox.cn/api-6342680.md
- S59　查询指定组织的下级组织单元列表。https://italent.apifox.cn/api-6342677.md
- S60　根据时间窗滚动查询变动的组织单元信息。https://italent.apifox.cn/api-6342679.md
- S61　停用组织单元。https://italent.apifox.cn/api-6342683.md
- S62　获取未删除的所有成本中心。https://italent.apifox.cn/api-6342572.md

**国内 IDaaS**
- S63　竹云 IDaaS：北森 HR 系统作为身份源。https://open.bccastle.com/guide/admin/id_source/italent.html
- S64　竹云 IDaaS：飞书数据同步。https://open.bccastle.com/app_integration/authentication/feishusync.html
- S65　Authing：同步中心概览。https://docs.authing.cn/v2/guides/sync-new/
- S66　Authing：筛选同步范围。https://docs.authing.cn/v2/guides/sync-new/create-sync-new/sync-scope-new.html
- S67　Authing：执行同步任务。https://docs.authing.cn/v2/guides/sync-new/perform-sync-new.html
- S68　Authing：处理删除保护。https://docs.authing.cn/v2/guides/sync-new/risky-operation.html
- S69　Authing：配置同步字段映射。https://docs.authing.cn/v2/guides/sync-new/create-sync-new/field-mapping-new.html
- S70　Authing：获取其他应用配置项和权限（含北森）。https://docs.authing.cn/v2/guides/sync-new/create-sync-new/get-config-new/others.html
- S71　Authing：同步中心常见问题。https://docs.authing.cn/v2/guides/faqs/sync.html
- S72　阿里云 IDaaS：绑定飞书。https://help.aliyun.com/zh/idaas/eiam/user-guide/binding-fly-book
- S73　阿里云 IDaaS：绑定钉钉（出方向）。https://help.aliyun.com/zh/idaas/eiam/user-guide/bind-idaas-to-dingtalk-outbound

**Celigo**
- S74　Resolve errors – automatically or manually。https://docs.celigo.com/hc/en-us/articles/16182564553371-Resolve-errors-automatically-or-manually
