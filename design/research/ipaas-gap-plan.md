# iPaaS 补齐方案：产品与详细设计

2026-10-26 · 原文：[Claude Doc](https://claude.ai/artifact/S3eDCQeiuVH1huKhpLubsT)

## 概述

平台引擎已经能上生产，缺的是三样：连接器的覆盖面、组织同步、对账兜底。补齐后，它才能从「北森到飞书的一条主线」变成能接人事、OA、IM 的集成平台。本方案按六个工作包拆分，每个包都写到文件落点、类型、接口和验收判定，拿到就能开工。

**现状（2026-10-26）**

- 引擎和可靠性：2000 人入职季 2640 个运行全部成功，故障注入下不丢、不重；问题中心、写后读回核对、环境推广、脱敏、保留期清理都已上线。
- 连接器：第三方只有北森、飞书、MySQL、Postgres 四个，外加 HTTP、Webhook、定时、代码、映射这些内置节点。
- 组织：飞书连接器只能列部门，不能写，现在靠人手建好飞书部门，再用映射表对上北森部门。
- 对账：只核对平台写过的结果；平台漏掉的变动（例如北森晚 15 分钟以上才查得到的）发现不了。
- 真实环境：一直跑在模拟服务上，没用真实飞书企业、真实北森租户跑过。

**补齐目标**

1. 人员和组织都能从北森同步到飞书、企业微信、钉钉，漏处理的有对账兜底。
2. 「单据提交或审批通过之后」的辅助流程有现成的触发、动作和方案模板。
3. 每个第一方连接器都满足同一份深度契约：限流、幂等、读回、错误归因、全量列举。

**边界（沿用已有决定）**

- 只做主流程之后的辅助流程，不做审批流和表单（决定 000039）。
- 不做 ETL、数据仓库、API 网关、主数据管理。
- 人员同步是工作流上的方案，不做身份管理产品；离职只暂停，不删除（决定 000041、000042）。
- 自托管零配置：没配的可选集成显示为未启用，不报错（`.claude/rules/self-hosting.md`）。

**怎么读**：第 2 节是总清单和优先级；第 3 节是所有连接器共用的契约，后面每节都依赖它；第 4 到 9 节各是一个可独立交付的工作包；第 10、11 节是验收和排期。代码约定一律按仓库 CLAUDE.md（不写注释、命名参数、`tryCatch`、`POST` 和 `DELETE`、导出放文件末尾）。

## 差距清单与优先级

一共 13 项差距，其中 6 项 P0。P0 做完之后才能拿北森到飞书上生产，P1 是「集成平台」这个称呼的最低配置，P2 可以上线以后再做。

| 编号 | 差距 | 现在的情况（代码位置） | 优先级 | 本文章节 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| G1 | 连接器深度契约进 SDK | 限流、幂等、错误码表都是各连接器自己的约定，只有 `aiMetadata.idempotent` 和 `classification` 进了元数据（`packages/connectors/sdk/src/lib/connector-metadata.ts`） | P0 | 第 3 节 | 无 |
| G2 | 自动重试不区分幂等 | 步骤失败就重试，不看动作是否幂等（`packages/server/engine/src/lib/helper/error-handling.ts` 的 `executionFailedWithRetryableError`） | P0 | 第 6 节 | G1 |
| G3 | 飞书部门写入和组织同步方案 | 飞书连接器只有 `list_departments`；部门靠人手建，再用映射表对应 | P0 | 第 4 节 | G1 |
| G4 | 全量名单对账 | `verificationService` 只核对 72 小时内平台写过的结果，发现不了漏处理的人 | P0 | 第 5 节 | G1 |
| G5 | 真实环境验收 | 主线只在模拟服务上跑过（`tools/e2e/main-line/`） | P0 | 第 9 节 | G3、G4 |
| G6 | 手动核对是同步请求 | `POST /v1/verification/run` 占着连接直到读完，1 万条会被代理超时断开 | P0 | 第 5 节 | 无 |
| G7 | 企业微信连接器 | 没有 | P1 | 第 7 节 | G1 |
| G8 | 钉钉连接器 | 没有 | P1 | 第 7 节 | G1 |
| G9 | 飞书审批触发和单据后样板方案 | 飞书只有通用事件触发 `event_received`，没有审批实例的读取动作 | P1 | 第 8 节 | G1 |
| G10 | 邮件发送连接器 | 平台自己的可选 SMTP 只发系统邮件，工作流里不能发信 | P1 | 第 8 节 | 无 |
| G11 | 备份真恢复、镜像与多机实测 | 只做了恢复前检查，恢复靠管理员上服务器手动做 | P1 | 第 9 节 | 无 |
| G12 | OA/ERP 接入路径（泛微、金蝶） | 只能用 HTTP 步骤自己接，没有深度能力 | P2 | 第 8 节 | G1 |
| G13 | 审计日志重复的「运行结束」 | 每个运行两条（6324 条对 3629 个运行），根因没查 | P2 | 第 9 节 | 无 |

不列入的：审批流和表单、ETL、SAML 和企业微信登录、第二段离职（删除账号）。企业登录和本文的集成能力无关，另开方案。

## 连接器深度契约（G1）

把「第一方连接器清单」从约定变成 SDK 类型加契约测试：动作声明写入安全性、查重键、读回动作、限流桶和全量列举，引擎、问题中心、对账都按声明工作。引擎在 `connectorExecutor` 里已经通过 `connectorRunner.describe()` 拿到动作元数据，所以声明不用新的传递通道。

### 3.1 SDK 类型

改 `packages/connectors/sdk/src/lib/connector-metadata.ts`，沿用该文件的 `zod/mini` 写法：

```ts
export const WriteSafety = z.enum(['IDEMPOTENT', 'LOOKUP_BEFORE_WRITE', 'UNSAFE'])
export const RateLimitScope = z.enum(['TENANT', 'APP', 'APP_ENDPOINT'])
export const EnumeratedEntity = z.enum(['EMPLOYEE', 'DEPARTMENT', 'ACCOUNT'])

export const RateLimitDeclaration = z.object({
  bucket: z.string(),
  scope: RateLimitScope,
  perSecond: z.number(),
})

export const ActionReliability = z.object({
  writeSafety: z.optional(WriteSafety),
  lookupKeys: z.optional(z.array(z.string())),
  readBack: z.optional(z.object({ actionName: z.string(), aspects: z.array(z.string()) })),
  rateLimits: z.optional(z.array(RateLimitDeclaration)),
  enumeration: z.optional(z.object({ entity: EnumeratedEntity, businessKeyPath: z.string() })),
})
export type ActionReliability = z.infer<typeof ActionReliability>
```

- `ActionBase`（zod 和 type 两处）加 `reliability: z.optional(ActionReliability)`。
- `packages/connectors/sdk/src/lib/action/action.ts`：`CreateActionParams` 加 `reliability?: ActionReliability`，`IAction` 构造参数末尾加 `public readonly reliability?: ActionReliability`，`createAction` 透传。
- `aiMetadata.idempotent` 保留给 AI 用，契约测试要求它等于 `writeSafety !== 'UNSAFE'`。
- 各字段的含义：
  - `IDEMPOTENT`：对方接口自己去重（例如飞书 `client_token`）或者动作天然幂等（按期望状态覆盖，例如 `suspend_user`）。
  - `LOOKUP_BEFORE_WRITE`：动作先按 `lookupKeys`（属性名）读目标，存在就不写。
  - `UNSAFE`：重复执行会产生第二份结果（发消息且没有去重键、写多维表格）。
  - `readBack`：用哪个只读动作读回、核对哪些方面，和 `verification-rules.ts` 的 `aspect` 同名。
  - `enumeration`：这个动作能按页列出全量名单，对账用（第 5 节）。

### 3.2 列举动作的入参和出参

声明了 `enumeration` 的动作，`classification` 必须是 `SEARCH`，属性里必须有 `pageToken`（可选文本）和 `pageSize`（数字），返回值必须是：

```ts
export type EnumerationPage = {
  items: Record<string, unknown>[]
  nextPageToken: string | null
}
```

这个类型放在 `packages/core/connector-types`，对账服务和连接器共用。

### 3.3 错误归因到谁能修

仿照现有的 `blockedUntilMarker`（`packages/core/utils/src/lib/blocked-until.ts`）新增 `fixOwnerMarker`，把责任人写进错误消息尾部，问题中心解析。

```ts
export const fixOwnerMarker = { attach, parse, strip }

function attach({ message, owner }: { message: string, owner: FixOwner }): string
function parse(message: string | null | undefined): FixOwner | null
function strip(message: string): string

export const FixOwner = z.enum(['CONNECTION_OWNER', 'TARGET_ADMIN', 'SOURCE_DATA_OWNER', 'MAPPING_OWNER', 'WORKFLOW_OWNER', 'WAIT'])
export type FixOwner = z.infer<typeof FixOwner>
```

- 标记格式 `[fix-owner=TARGET_ADMIN]`，和 `[blocked-until=…]` 可以并存。`execution.ts` 里截断消息时要和 `blockedUntilMarker` 一样先剥离再补回。
- `IssueFixOwner`（`packages/core/shared/src/lib/automation/issue/issue-requests.ts`）加 `SOURCE_DATA_OWNER`。
- `issueUtils.insightOf`：在 `blockedUntil` 判断之后、超时判断之前，`fixOwnerMarker.parse(issue.message)` 有值就用它做 `owner`，`confidence` 取 0.9。
- 飞书 `error-table.ts` 的 `ErrorRule` 加 `owner?: FixOwner`，`feishuError()` 有 `owner` 时调 `fixOwnerMarker.attach`。归属如下：

| 责任人 | 飞书错误码 |
| --- | --- |
| `TARGET_ADMIN`（飞书管理员） | 40003、40004、41050、99991672、99991401、10014、41007、41008、44023、44052、230006、230013 |
| `SOURCE_DATA_OWNER`（北森里的 HR） | 41001、41002、41003、41004、41005、41009、41010、44020、44051 |
| `MAPPING_OWNER` | 40015、41017、44035 |
| `CONNECTION_OWNER` | 10003、10005、10015 |

### 3.4 按声明限流

现在是被动限流：对方返回 429 后，引擎按 `blocked-until` 等待再试，最多 3 次、每次最长 30 秒（`RATE_LIMIT_QUEUE`）。并发一高，就会把北森每分钟 3000 次的企业配额打穿。补上主动限流：

1. SDK 的 `ActionContext` 加 `rateLimit.acquire({ bucket, scopeKey }): Promise<void>`。连接器在发请求前调用，`perSecond` 由运行时从动作的 `rateLimits` 声明里取。
2. 引擎的 `buildRuntime` 把它接到新接口 `POST /v1/engine/rate-limits/acquire`，请求体 `{ bucket, scopeKey, perSecond }`，返回 `{ waitMs }`；`waitMs > 0` 时等待后再取一次，累计超过 60 秒就报错并带 `blocked-until`。
3. API 侧新建 `packages/server/api/src/app/rate-limit/`：Redis 上的 GCRA 令牌桶（一段 Lua，键 `rl:{tenantId}:{bucket}:{scopeKey}`，过期 2 秒）。`securityAccess` 只允许 engine 主体，`tenantId` 从令牌取，不信任请求体。内存 Redis 模式下用进程内实现，保证零配置可用。
4. 每次等待上报一条 `RATE_LIMIT_QUEUED` 可靠性事件，运行监控的「限速排队」计数自动包含它。

首批声明：北森 `beisen-api`（`TENANT`，50 次每秒）；飞书 `contact-write`（`APP_ENDPOINT`，改部门和暂停账号 1 次每秒）、`contact-read`（`APP_ENDPOINT`，50 次每秒）、`im-send`（`APP`，50 次每秒）。飞书的具体数字上线前要对照开放平台每个接口的频控文档核一遍，这是待确认项。

### 3.5 契约测试

新建 `packages/connectors/sdk/src/lib/contract/connector-contract.ts`，导出 `connectorContract.violationsOf({ connector }): string[]`。每个第一方连接器加一个 `test/contract.test.ts`，断言结果为空。检查规则：

1. `WRITE`、`DESTRUCTIVE` 动作必须声明 `writeSafety`。
2. `LOOKUP_BEFORE_WRITE` 必须有 `lookupKeys`，而且每一项都是该动作的属性名。
3. `readBack.actionName` 指向同一连接器里的 `READ` 动作。
4. `requireAuth` 的动作至少声明一个 `rateLimits`。
5. `enumeration` 动作满足 3.2 的入参和出参约定。
6. `aiMetadata.idempotent` 与 `writeSafety` 一致。
7. 错误码表里每条 `FAILED` 都有 `owner`；这条由各连接器自己的测试检查，因为错误码表不在元数据里。

### 3.6 现有动作补声明

| 动作 | writeSafety | lookupKeys | readBack |
| --- | --- | --- | --- |
| 飞书 `provision_user` | `LOOKUP_BEFORE_WRITE` | mobile、email | `get_user`：department |
| 飞书 `update_user` | `IDEMPOTENT` | — | `get_user`：department |
| 飞书 `suspend_user`、`resume_user` | `IDEMPOTENT` | — | `get_user`：suspension |
| 飞书 `send_group_message`、`send_direct_message` | 填了去重键是 `IDEMPOTENT`，否则 `UNSAFE`（见第 6 节） | — | — |
| 飞书 `create_bitable_record` | `UNSAFE` | — | — |
| MySQL、Postgres `insert_row` | `UNSAFE` | — | — |
| MySQL、Postgres `update_row`、`delete_row` | `IDEMPOTENT` | — | — |

要补的一处：飞书的两个发消息动作已经有 `dedupeKey` 属性，填了就声明为 `IDEMPOTENT`，前提是飞书 `uuid` 只在 1 小时内去重，重放超过 1 小时仍然会重发。所以引擎按「上次尝试距今是否超过 `dedupeWindowSeconds`」再判一次，字段加在 `ActionReliability` 上：`dedupeWindowSeconds: z.optional(z.number())`。

### 3.7 版本

`@fema-ipaas/connector-sdk`、`core-utils`、`core-connector-types` 升 minor；`@fema-ipaas/shared` 升 minor（新导出）；北森、飞书、MySQL、Postgres 连接器升 minor。引擎只读新字段，没声明的旧连接器按 `UNSAFE` 处理。

## 组织同步：北森组织到飞书部门（G3）

组织同步按「整棵树收敛」来做：定时读北森和飞书两棵树，算出有序的变更计划，先父后子地写飞书，绑定关系写进映射表。不按单条事件写，是因为部门之间有父子顺序，单条事件乱序到达时，子部门会找不到父部门；一家企业的部门一般在几千个以内，整树读一遍是分钟级。这是决定 000042「按期望状态收敛」在组织上的落地。

### 4.1 收敛规则

1. **绑定优先**：映射表「北森组织 OId → 飞书 open\_department\_id」是唯一的对应关系，人员同步的「部门对照」继续用它。
2. **首次自动绑定**：没有绑定的北森组织，在已绑定的父部门下找同名飞书部门，找到就绑定（`BIND`），找不到才新建（`CREATE`）。客户飞书里已经手工建好的部门因此不会被重复创建。
3. **新建的部门带自定义 ID** `bs-{OId}`，创建前先按它查，调用超时后重跑也不会建出两个。
4. **变更**：名称或父部门不一致就 `UPDATE`，只发变化的字段。
5. **停用不等于删除**：北森停用的组织，配了「归档父部门」就移到它下面（`ARCHIVE`），没配就只通知（`REPORT_DISABLED`）。任何情况下都不调飞书的删除部门接口。
6. **只管自己承诺的部门**：飞书里没有绑定到北森的部门一律不动（决定 000041）。
7. **绑定失效**：绑定的飞书部门被人删了，就输出 `REBIND_CREATE`：重新创建，并更新映射表。
8. **孤儿**：父链连不到根的组织输出 `ORPHAN`，不写，给北森管理员开问题。
9. **闸门**：一次计划里 `ARCHIVE` 超过 `maxArchives`（默认 10），或 `UPDATE` 里改父部门的超过 `maxMoves`（默认 50），整次不执行并报错。由工作流负责人确认后调高闸门、重放。这是防北森批量误操作。

### 4.2 飞书连接器新增动作

文件放在 `packages/connectors/community/feishu/src/lib/actions/`，接口调用都写进新的 `common/departments.ts`（`feishuDepartments` 对象）。

| 动作 | 分类 | 可靠性声明 | 飞书接口 |
| --- | --- | --- | --- |
| `get_department` | READ | rateLimits: contact-read | `GET /open-apis/contact/v3/departments/:id` |
| `upsert_department` | WRITE | `LOOKUP_BEFORE_WRITE`，lookupKeys: customDepartmentId；readBack: get\_department / name、parent | 先 GET，再 `POST /open-apis/contact/v3/departments`（带 `client_token`）或 `PATCH /open-apis/contact/v3/departments/:id` |
| `archive_department` | WRITE | `IDEMPOTENT`；readBack: get\_department / parent | `PATCH`，只改 `parent_department_id` |
| `enumerate_departments` | SEARCH | enumeration: DEPARTMENT，业务键 `open_department_id` | `GET /open-apis/contact/v3/departments/:id/children?fetch_child=true&page_size=50` |

`upsert_department` 的入参和出参：

```ts
type UpsertDepartmentInput = {
  customDepartmentId: string
  name: string
  parentDepartmentId: string
  leaderOpenId?: string
  order?: number
}

type UpsertDepartmentResult = {
  created: boolean
  open_department_id: string
  department_id: string
  changed: Array<'name' | 'parent_department_id' | 'leader_user_id' | 'order'>
}
```

- `parentDepartmentId` 可以是 `od-` 开头的 open\_department\_id，也可以是自定义 ID，沿用 `contacts.ts` 里的 `departmentIdType()` 判断。
- `client_token` 用 `feishuIdempotency.uuidFrom` 生成，种子是「appId + `:dept:` + 自定义部门 ID」，只按自定义 ID 生成，改名后重跑也是同一个 token。
- 错误码补进 `error-table.ts`：同级部门重名、父部门不存在、把部门移到自己的子部门下、部门不在应用通讯录范围内。具体错误码照开放平台「创建部门」「修改部门」文档的错误码表抄，并同步加到 `tools/e2e/main-line/mock-server.mjs`。
- 飞书应用要开「更新通讯录」权限，并把通讯录范围设为全部成员，否则不能在根部门下建部门。连接向导的权限清单加上这一条。

### 4.3 北森连接器新增

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `enumerate_organizations` | 动作，SEARCH | 调 `GetSubOrganizationTrees`（从根 OId 开始，根 OId 是 900 加租户 ID，带停用）。北森一次返回整棵树，`pageToken` 是本地偏移量。输出统一成 `{ key, parentKey, name, order, disabled }` |
| `organization_changed` | 轮询触发器 | 按组织的时间窗口接口轮询，复用 `common/change-window.ts` 和 `time-window.ts`。触发后只用来叫醒一次整树收敛。北森的接口名和字段待按 v5 文档核实 |

### 4.4 计划计算：新内置连接器 `org-sync`

新建 `packages/connectors/core/org-sync`，一个动作 `plan_tree_sync`（READ，不调外部接口）。计划算法是纯函数，放在 `packages/core/utils/src/lib/org-tree-plan.ts`，导出 `orgTreePlan.build`，单测可以覆盖全部规则。

```ts
export const orgTreePlan = { build }

function build({ source, target, bindings, rootSourceKey, rootTargetId, archiveParentId, maxArchives, maxMoves }: BuildParams): OrgTreePlan

export type SourceOrgNode = { key: string, parentKey: string | null, name: string, order: number | null, disabled: boolean }
export type TargetOrgNode = { id: string, customId: string | null, parentId: string | null, name: string }
export type OrgPlanOp =
  | { op: 'BIND', sourceKey: string, targetId: string }
  | { op: 'CREATE', sourceKey: string, customId: string, name: string, parentSourceKey: string, order: number | null }
  | { op: 'REBIND_CREATE', sourceKey: string, staleTargetId: string, customId: string, name: string, parentSourceKey: string, order: number | null }
  | { op: 'UPDATE', sourceKey: string, targetId: string, name?: string, parentSourceKey?: string }
  | { op: 'ARCHIVE', sourceKey: string, targetId: string }
  | { op: 'REPORT_DISABLED', sourceKey: string, targetId: string }
  | { op: 'ORPHAN', sourceKey: string }
export type OrgTreePlan = { ops: OrgPlanOp[], gateExceeded: { archives: number, moves: number } | null }
```

- `ops` 按深度优先排好序：父节点的 `CREATE` 一定在子节点之前。执行时，由工作流在循环里用映射表把 `parentSourceKey` 换成飞书 ID。
- 同一次计划里父节点刚创建、映射表还没读到时，子节点直接用父节点的自定义 ID（`bs-` 加父 OId）做父部门，不等映射表。
- `gateExceeded` 不为空时，动作抛错，消息写明数量和闸门值，并带 `fixOwnerMarker` 的 `WORKFLOW_OWNER`。
- 输入规模：5000 个部门大约 1 MB，在单步 `FEMA_MAX_STEP_PAYLOAD_MB` 的默认上限内。超过 2 万个部门的客户不在首发范围。

### 4.5 映射表的写入动作

现在工作流只能读映射表（`/v1/worker/mapping-tables/:id`）。要补两处：

- API：`POST /v1/worker/mapping-tables/:id/rows`，请求体 `{ rows: [{ key, value }], onConflict: 'KEEP' | 'REPLACE' }`，返回 `{ inserted, replaced, conflicts: [{ key, existing, proposed }] }`。只允许 engine 主体；映射表必须属于令牌里的 `projectId`，不属于就返回 404。写入时加 `SELECT … FOR UPDATE`，防止两个运行并发写同一个键。
- `data-mapper` 连接器加动作 `upsert_mapping_rows`（WRITE，`IDEMPOTENT`）。`onConflict` 默认 `KEEP`；有冲突时报错，并带 `MAPPING_OWNER`。只有 `REBIND_CREATE` 用 `REPLACE`。

### 4.6 官方方案「北森 → 飞书 组织同步」

新建 `packages/server/api/src/app/solution/official/beisen-feishu-org.ts`，结构照 `beisen-feishu.ts`，注册到 `OFFICIAL_SOLUTIONS`。与人员同步方案共用同一张部门映射表：按 `solutionPackageUtils` 的表复用规则，名称、键标签、值标签都相同就复用。

两条工作流：

1. **整树收敛**（定时每 15 分钟，可配）：`enumerate_organizations`（循环翻页）→ `enumerate_departments` → 读映射表 → `plan_tree_sync` → 循环 `ops`，按 `op` 分支：
   - `BIND` → `upsert_mapping_rows`
   - `CREATE`、`REBIND_CREATE` → `upsert_department` → `upsert_mapping_rows`
   - `UPDATE` → `upsert_department`
   - `ARCHIVE` → `archive_department`
   - `REPORT_DISABLED`、`ORPHAN` → 汇总成一条发到 IT 群
2. **变动叫醒**：`organization_changed` 触发，去重键为固定值 `org-tree`、窗口 1 分钟，调用第 1 条的子流程。第 1 条工作流并发上限设为 1。

配置项：北森根 OId（必填）、飞书根部门（默认 `0`）、归档父部门（默认空，即只通知）、两个闸门值、IT 群 ID。安装前的检查项：飞书通讯录范围是否为全部成员（阻塞）。

**与人员同步的衔接**：入职流里「部门对照」查不到时，先调一次整树收敛子流程再查；还查不到，才按现在的方式失败。方案升到 1.2。

### 4.7 验收

- `orgTreePlan.build` 单测：上面 9 条规则各至少一个用例；另加「部门上下级对调」「同名兄弟」「根改名」。
- 模拟服务补飞书部门接口和北森组织接口，新增 `tools/e2e/scenarios/org-sync.mjs`。判定：300 个组织首次同步后飞书部门树与北森一致；重跑一次计划为空；改名 5 个、移动 3 个、停用 2 个后再同步，飞书与北森一致且没有删除调用；停用 11 个时闸门拦下。

## 全量名单对账（G4、G6）

对账按业务键比对源和目标的全量名单，只产出差异单，不做覆盖写入；差异进问题中心，补齐走原来的处理工作流（决定 000040）。现有的「写后读回核对」保留，它管「平台写过的对不对」；对账管「该写的有没有写」，补上漏处理这个洞。

### 5.1 对账对谁负责

只以本平台承诺的结果为主语（决定 000041）。一条规则对应一条处理工作流，只比对这条工作流承诺的方面，例如「在职的人有飞书账号、部门对、未暂停」「离职的人已暂停」。飞书里有、北森里没有的账号不算差异，也不对外统计。

### 5.2 数据模型

三个新表。实体写在 `packages/server/api/src/app/reconciliation/reconciliation.entity.ts`（`EntitySchema` 写法，同 `solution.entity.ts`），并加入 `getEntities()`。迁移文件 `AddReconciliation`，只建表，`breaking = false`。类型放在 `packages/core/shared/src/lib/automation/reconciliation/`。

**reconciliation\_rule**

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id、created、updated | `BaseColumnSchemaPart` |  |
| projectId | id，索引 | 所有查询必带 |
| name | text | 例如「北森在职 ↔ 飞书账号」 |
| workflowId | id | 补齐用的处理工作流 |
| source | jsonb | `{ connectorName, actionName, connectionExternalId, input, keyPath }`，`actionName` 必须声明了 `enumeration` |
| target | jsonb | 同上 |
| scope | jsonb | 源记录过滤条件 `{ path, in: string[] }[]`，例如只看在职和 30 天内离职的 |
| expectations | jsonb | `ReconciliationExpectation[]`，见下 |
| repair | jsonb | `{ readActionName, keyInput }`：按业务键重新读源记录的动作，输出要与处理工作流触发器的单条结果同构 |
| cron | text | 默认 `17 2 * * *` |
| enabled | boolean | 默认 true |
| maxRepairsPerRun | int | 默认 20，超过的不自动补齐，等人放行 |

```ts
export const ReconciliationExpectation = z.object({
  aspect: z.string(),
  when: z.array(z.object({ path: z.string(), in: z.array(z.string()) })),
  expect: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('EXISTS') }),
    z.object({ kind: z.literal('EQUALS'), sourcePath: z.string(), targetPath: z.string(), mappingTableId: z.string().optional() }),
    z.object({ kind: z.literal('CONTAINS'), sourcePath: z.string(), targetPath: z.string(), mappingTableId: z.string().optional() }),
    z.object({ kind: z.literal('FLAG'), targetPath: z.string(), value: z.boolean() }),
  ]),
})
```

北森到飞书的默认三条：在职 → `EXISTS`；在职 → `CONTAINS`（任职部门 OId 查部门映射表，得到的 ID 应在 `department_ids` 里）；离职 → `FLAG is_frozen = true`。

**reconciliation\_run**：id、created、updated、projectId、ruleId、status（`QUEUED`、`RUNNING`、`SUCCEEDED`、`FAILED`、`TRUNCATED`）、startedAt、finishedAt、sourceCount、targetCount、matchedCount、differenceCount、repairedCount、error（text，可空）。索引 `(projectId, ruleId, created DESC)`。

**reconciliation\_difference**：id、created、updated、projectId、ruleId、businessKey、aspect、kind（`MISSING_IN_TARGET`、`MISMATCH`）、expected（jsonb）、actual（jsonb）、status（`OPEN`、`REPAIRING`、`RESOLVED`、`IGNORED`）、firstSeenRunId、lastSeenRunId、repairExecutionId（可空）、resolvedAt（可空）。部分唯一索引 `(ruleId, businessKey, aspect) WHERE status IN ('OPEN','REPAIRING')`。业务键是工号，不含个人信息；`expected` 和 `actual` 只存比对用到的字段，写入前过一遍 `sanitizeObjectForPostgresql()`。

### 5.3 运行流程

`reconciliationService(log).run({ runId })`，在 BullMQ 系统任务 `RECONCILE` 里执行，不在请求线程里：

1. `distributedLock(log).runExclusive({ key: recon:{ruleId} })`，取不到锁就把 run 标为 `FAILED`，并写明「同一规则已在运行」。
2. 用 `actionRunService.runConnectorAction` 按页调源的列举动作，直到 `nextPageToken` 为空；再同样翻目标。受 `FEMA_RECONCILIATION_MAX_ITEMS`（默认 50000）和 `FEMA_RECONCILIATION_TIME_BUDGET_MINUTES`（默认 60）限制，超了就标 `TRUNCATED`，并且不关闭任何差异。
3. 读规则用到的映射表。
4. 调纯函数 `reconciliationDiff.compute({ source, target, rule, mappingTables })`（`packages/core/shared/src/lib/automation/reconciliation/reconciliation-diff.ts`），得到 `{ matched, differences }`。源里重复的业务键算一条 `MISMATCH`，`aspect` 为 `duplicate-key`。
5. 一个事务里：本次出现的差异按部分唯一索引 upsert，更新 `lastSeenRunId`；上次打开、本次没出现的，改为 `RESOLVED`。
6. 问题中心：`IssueKind` 加 `RECONCILIATION`，每条规则一个问题，签名 `recon:{ruleId}`。有未关闭差异就打开或更新计数，归零就自动关闭（`reason: RECONCILED`）。只在差异数从 0 变成大于 0 时告警一次。方法加在 `issueService`：`recordReconciliation({ projectId, ruleId, openCount })`。
7. 自动补齐：未关闭差异数不超过 `maxRepairsPerRun` 时，对每条 `OPEN` 差异调用 `reconciliationRepair.start`，超过就只开问题。

### 5.4 补齐

`reconciliationRepair.start({ differenceId })`：

1. 用 `repair.readActionName` 按业务键重新读源记录（符合决定 000042：只信当前生效的记录）。读不到就标 `RESOLVED`，并在问题活动里写明「源记录已不存在」。
2. 把这条记录作为触发输出提交给处理工作流的生产版本，走和轮询触发相同的入队路径。触发步骤状态取 `SUCCEEDED`，因为载荷已经是提取后的结果（见 executions 页的 Gotchas）。运行打上标签 `reconciliation-repair`。
3. 差异标为 `REPAIRING`，并记下 `repairExecutionId`。下次对账一致了才算 `RESOLVED`，运行成功并不算数。
4. 处理工作流本身的去重键会拦下 7 天内的同一事件，所以补齐运行要带 `skipDedupe: true`，只允许这条路径使用。

北森要补两个动作：`enumerate_employees`（SEARCH，全量在职加最近 N 天离职，翻页）和 `get_employee_record`（READ，按工号查，输出与 `employee_changed` 的单条结果同构）。飞书要补 `enumerate_users`（SEARCH，按部门递归、带 `employee_no`）。北森的具体接口待按 v5 文档核实。

### 5.5 接口

前缀 `/v1/reconciliation`，都要配 `securityAccess`：项目成员可读，工作流编辑权限才能改规则和补齐。`projectId` 从主体取。

| 方法和路径 | 说明 |
| --- | --- |
| `GET /rules` | 本项目的规则列表，带最近一次 run 的摘要 |
| `POST /rules` | 新建；校验源和目标动作都声明了 `enumeration`，工作流属于本项目 |
| `POST /rules/:id` | 修改 |
| `DELETE /rules/:id` | 删除，连同它的差异 |
| `POST /rules/:id/runs` | 立即对账，返回 `{ runId }`，不等待 |
| `GET /runs/:id` | 状态和计数 |
| `GET /rules/:id/differences?status=&cursor=` | 分页差异列表（`SeekPage`） |
| `POST /differences/repair` | `{ ids }`，批量补齐，单次最多 200 条 |
| `POST /differences/ignore` | `{ ids, reason }` |

定时：启动时为每条 `enabled` 规则用 `systemJobsSchedule.upsertJob` 注册 `repeated` 任务，`jobId` 为 `recon:{ruleId}`；规则增删改时同步。删除规则时一并删掉任务。

### 5.6 界面

- 问题中心的设置里加「对账规则」页签：列表、新建抽屉。源和目标只列出声明了 `enumeration` 的动作，期望用表格编辑。
- `RECONCILIATION` 问题详情：顶部是最近一次对账的计数（源、目标、一致、差异）；下面是差异表（工号、方面、期望、实际、状态、补齐运行链接），可以勾选后补齐或忽略。
- 方案安装时一并建好规则：`SolutionPackage` 加可选的 `reconciliationRules`，安装时按工作流 key 解析 `workflowId`，按连接槽位解析连接。北森到飞书方案 1.2 带上 5.2 的默认三条。

### 5.7 核对改为异步（G6）

`POST /v1/verification/run` 改成只入队，返回 `{ runId }`；结果写 Redis，键 `verification-run:{runId}`，过期 24 小时。新增 `GET /v1/verification/runs/:runId`，返回 `{ status, result: RunVerificationResult | null }`。前端「核对最近的结果」按钮改成每 3 秒轮询一次。这是接口行为变化，要写进 `docs/install/reference/breaking-changes.mdx`。

### 5.8 验收

- `reconciliationDiff.compute` 单测：四种 `expect`、`when` 过滤、映射表未命中、重复键。
- 集成测试（`test/integration/reconciliation/`）：差异的新建、更新、自动关闭；两个实例同时跑只有一个执行；`TRUNCATED` 不关闭差异；跨项目访问返回 404。
- e2e：在模拟北森里写入一批「晚 20 分钟才可见」的入职。现在这批会丢；对账后应全部出现在差异里，自动补齐后再对账，差异为 0。
- 规模：1 万人对 1 万账号，默认限速下 10 分钟内跑完，API 内存峰值不超过 500 MB。列举是按页读，不是逐人读，所以应远快于现在核对的 17 分钟。

## 安全重试（G2）

自动重试只对重复执行不会产生第二份结果的步骤生效；不幂等的写操作只在「确定对方没处理」时自动重试，其余情况交给人确认。这是可靠性原则里「不幂等的写操作不自动重试」的实现。做完后，界面上的「自动重试」改叫「安全重试」。

### 6.1 判定规则

新建纯函数 `retrySafety.decide`（`packages/core/execution/src/lib/execution/retry-safety.ts`），引擎和问题中心共用：

```ts
export const retrySafety = { decide }

function decide({ classification, writeSafety, errorCode, message, firstAttemptAt, now, dedupeWindowSeconds }: DecideParams): RetryDecision

export type RetryDecision =
  | { allowed: true, reason: 'READ_ONLY' | 'IDEMPOTENT' | 'LOOKUP_BEFORE_WRITE' | 'NOT_APPLIED' }
  | { allowed: false, reason: 'UNSAFE_OUTCOME_UNKNOWN' | 'DEDUPE_WINDOW_PASSED' }
```

| 条件（从上往下取第一条） | 结果 |
| --- | --- |
| `classification` 为 READ 或 SEARCH | 允许，`READ_ONLY` |
| `writeSafety` 为 `IDEMPOTENT`，有 `dedupeWindowSeconds` 且首次尝试已超过窗口 | 不允许，`DEDUPE_WINDOW_PASSED` |
| `writeSafety` 为 `IDEMPOTENT` | 允许 |
| `writeSafety` 为 `LOOKUP_BEFORE_WRITE` | 允许 |
| 错误带 `blocked-until`，或 HTTP 状态为 400、401、403、404、409、422、429（对方明确拒绝，没有处理） | 允许，`NOT_APPLIED` |
| 其余（超时、5xx、连接断开、没有声明的写操作） | 不允许，`UNSAFE_OUTCOME_UNKNOWN` |

HTTP 状态从错误码里取，复用 `issueUtils.isRejectedByTargetHttpStatus` 和 `isAuthorizationHttpStatus` 的定义，把它们搬到 `core-execution`，`issue-utils.ts` 改为引用，避免两份。

### 6.2 引擎改动

文件 `packages/server/engine/src/lib/helper/error-handling.ts`：

1. `runWithExponentialBackoff` 对 `ConnectorAction` 先取动作元数据：`connectorRunner.describe(connector)` 已经在 `executeAction` 里调过，结果按 `connectorName@version` 缓存在进程内，不增加子进程开销。把 `classification`、`reliability` 传给两个重试分支。
2. `runWithLegacyRetry` 和 `runWithErrorStrategy` 在「要重试」之前加一道 `retrySafety.decide`，不允许就停止重试，并记一条可靠性事件。`requestWithRateLimitQueue` 的限速等待不受影响，因为它只在 `blocked-until` 时起作用，属于 `NOT_APPLIED`。
3. `ReliabilityEventKind` 加 `RETRY_WITHHELD`，`EngineReliabilityEventKind` 同步加上，事件带 `errorCode` 和 `reason`。运行监控加一项计数「为避免重复未自动重试」，可以下钻到运行。
4. 代码步骤和 HTTP 步骤没有声明：代码步骤保持现状（用户自己打开重试就重试）；HTTP 步骤按方法判断，GET、HEAD 等同 `READ`，PUT、DELETE 等同 `IDEMPOTENT`，POST、PATCH 等同 `UNSAFE`。

### 6.3 重放前说清楚会发生什么

`POST /v1/issues/:id/replay-check` 的 `ReplayCheckItem` 加一个字段：

```ts
writeSteps: z.array(z.object({
  stepName: z.string(),
  displayName: z.string(),
  writeSafety: z.enum(['IDEMPOTENT', 'LOOKUP_BEFORE_WRITE', 'UNSAFE']),
  willRun: z.boolean(),
  needsConfirmation: z.boolean(),
}))
```

- `willRun`：按重放策略算。「从失败节点重跑」时，失败点之前已成功的步骤为 false；「重试」时全部为 true。
- `needsConfirmation`：`willRun` 且 `retrySafety.decide` 不允许。
- `IssueReplayRequestBody` 加 `confirmedUnsafeSteps: z.array(z.string()).optional()`。服务端发现有需要确认、却没有列在里面的步骤，就拒绝整批重放，返回 400，错误信息用新的 i18n 键 `issues.replay.unsafeStepsNotConfirmed`。
- 前端重放对话框列出会执行的写步骤，需要确认的步骤前加勾选框和一句说明，例如「重新发送通知可能让群里收到两条」；全部勾上才能提交。
- 这是接口行为变化：直接调 API 的人重放含不幂等步骤的运行，会从成功变成 400。要记入 breaking-changes。

### 6.4 编辑器

步骤设置里的「失败时重试」，当动作为 `UNSAFE` 时，开关下方显示一行提示：「这个操作重复执行会产生第二份结果，只在对方明确拒绝时自动重试」。发布前检查不拦。文案放在 `packages/web/public/locales/en/translation.json` 和中文语言包。

### 6.5 验收

- `retrySafety.decide` 单测覆盖上表每一行。
- 引擎单测：`UNSAFE` 步骤遇 500 只执行 1 次，并上报 `RETRY_WITHHELD`；遇 429 仍会排队重试；`IDEMPOTENT` 步骤遇 500 按策略重试。
- 故障注入 `load-faults.mjs` 加场景 `unsafe-write-500`：给多维表格写入注入「写入成功但返回 500」。断言没有重复记录，问题中心有一个问题，并且重放时要求确认。

## 企业微信与钉钉连接器（G7、G8）

两个连接器照飞书连接器的结构和动作名来做，这样北森的两套方案只要换连接器。差异在三处：企业微信要配可信 IP，并且要用两套密钥；钉钉没有「暂停账号」；两家都没有飞书那样的创建用户幂等令牌。下文的接口来自两家开放平台的公开文档，频控数字和错误码写代码前要逐条对照最新文档核实。

### 7.1 统一结构

每个连接器放在 `packages/connectors/community/<name>/`，文件照飞书拆：

- `common/index.ts`：`obtainAccessToken`（进程内缓存，提前 5 分钟刷新）、`callApi`（令牌失效时清缓存重发一次）、`collectPages`、`describeError`；超时 30 秒，写操作超时的文案要写明「可能已生效，先读回再写」。
- `common/error-table.ts`：错误码 → `{ kind, hint, status, owner }`，限流类用 `blockedUntilMarker`，责任人用 `fixOwnerMarker`。
- `common/contacts.ts`、`common/departments.ts`：动作的实现。
- 基础地址允许用 `FEMA_WECOM_BASE_URL`、`FEMA_DINGTALK_BASE_URL` 覆盖，只给模拟服务用，和 `FEMA_FEISHU_BASE_URL` 一样。
- 连接向导：对方后台的菜单路径、按功能列出的权限、可复制的回调地址；保存时取一次令牌，验证凭证。

### 7.2 企业微信

**认证属性**：`corpId`、`contactSecret`（通讯录同步的 Secret，写通讯录只能用它）、`appSecret` 与 `agentId`（自建应用，发消息用）。令牌接口为 `GET /cgi-bin/gettoken?corpid=&corpsecret=`，两个 Secret 各缓存一份。

**必须在向导里讲清楚的限制**：

- 自建应用要配「企业可信 IP」，否则接口拒绝。自托管的客户要填本机的出口 IP，向导里显示它。出口 IP 用 `safeHttp` 访问一个公共地址取得；取不到就提示手工填写。
- 自建应用读不到成员的手机号和邮箱，按手机号查 `userid` 要走通讯录同步 Secret。
- `userid` 由我们指定，默认用工号。这是企业微信侧天然的查重键，创建前先 `user/get`。

| 动作 / 触发 | 对应飞书 | 接口 | 可靠性声明 |
| --- | --- | --- | --- |
| `provision_user` | 同名 | 先 `GET /cgi-bin/user/get`、`POST /cgi-bin/user/getuserid`（按手机号），再 `POST /cgi-bin/user/create` | `LOOKUP_BEFORE_WRITE`：userid、mobile |
| `update_user` | 同名 | `POST /cgi-bin/user/update`（部门、职位、上级） | `IDEMPOTENT` |
| `suspend_user`、`resume_user` | 同名 | `POST /cgi-bin/user/update`，字段 `enable` 取 0 或 1 | `IDEMPOTENT`；读回 `get_user` 的 `status` |
| `get_user`、`find_user` | 同名 | `GET /cgi-bin/user/get`；按手机号或邮箱反查 userid | READ |
| `enumerate_users` | 同名 | `POST /cgi-bin/user/list_id`（游标分页）后逐个 `user/get` 补字段 | SEARCH，列举 EMPLOYEE |
| `upsert_department`、`get_department`、`enumerate_departments` | 同名 | `department/create`（可指定 `id`）、`department/update`、`department/get`、`department/simplelist` | 同飞书第 4 节；部门 ID 是整数，自定义 ID 只能记在映射表里 |
| `send_app_message` | `send_direct_message` | `POST /cgi-bin/message/send`，开 `enable_duplicate_check` | 填去重键即 `IDEMPOTENT`，`dedupeWindowSeconds` 14400 |
| `send_group_robot_message` | `send_group_message` | 群机器人 Webhook（`key` 存在连接里） | `UNSAFE`（没有去重） |
| `contact_changed` | `event_received` | 通讯录变更回调，需要 Token 与 EncodingAESKey 解密；配置回调时的 GET 校验走 `handshakeConfiguration` | — |

**错误码初稿**（待对照全局错误码表核实）：40014、42001 令牌失效（重取令牌）；40001、40013 凭证错误（`CONNECTION_OWNER`）；45009 频率超限（`RATE_LIMIT`）；48002、60011 无权限或不在通讯录范围（`TARGET_ADMIN`）；60020 IP 不在可信列表（`TARGET_ADMIN`，文案里带上本机出口 IP）；60003 部门不存在（`MAPPING_OWNER`）；60102 userid 已存在（按已存在处理，读回后返回 `created: false`）；60104、60106 手机号或邮箱已被占用（`SOURCE_DATA_OWNER`）。

### 7.3 钉钉

**认证属性**：`appKey`、`appSecret`、`agentId`（发工作通知用）。令牌用新版接口 `POST https://api.dingtalk.com/v1.0/oauth2/accessToken`；通讯录类接口大多在旧版 `oapi.dingtalk.com/topapi/v2/...`，两类地址共用同一个令牌。

**离职怎么做**：钉钉没有「暂停账号」，只有删除。按决定 000041「永不把停用映射成删除」，钉钉版 `suspend_user` 的做法是：把人移到安装时指定的「待离职」部门，再给钉钉管理员发一条待办，由管理员在后台办离职。待办属于决定 000039 修订里允许的「平台自身的运维交接」。动作返回 `{ moved: true, suspended: false, pendingAdminAction: 'RESIGN' }`，核对规则核对「在待离职部门」。这一点要在方案说明里写明，不能让人以为和飞书一样已经暂停。

| 动作 / 触发 | 接口 | 可靠性声明 |
| --- | --- | --- |
| `provision_user` | 先 `topapi/v2/user/getbymobile`，再 `topapi/v2/user/create`（带 `userid` 为工号、`job_number`、`dept_id_list`） | `LOOKUP_BEFORE_WRITE`：mobile、userid |
| `update_user` | `topapi/v2/user/update` | `IDEMPOTENT` |
| `suspend_user` | 见上：`update` 移部门 + 给管理员发工作通知 | `IDEMPOTENT`（通知部分用去重键先查后记） |
| `get_user`、`find_user` | `topapi/v2/user/get`、`getbymobile` | READ |
| `enumerate_users` | `topapi/v2/user/list`（按部门、游标分页，每页最多 100） | SEARCH，列举 EMPLOYEE |
| `upsert_department` | `topapi/v2/department/create`（带 `source_identifier` 为 `bs-` 加 OId）、`department/update` | `LOOKUP_BEFORE_WRITE`：source\_identifier |
| `get_department`、`enumerate_departments` | `topapi/v2/department/get`、`listsubid` 递归 | READ、SEARCH |
| `send_work_notice` | `topapi/message/corpconversation/asyncsend_v2` | `UNSAFE`（没有去重），方案里一律配「先查后记」 |
| `send_group_robot_message` | 自定义机器人 Webhook，加签密钥存在连接里 | `UNSAFE` |
| `contact_changed` | 事件订阅的 HTTP 推送（加密）。Stream 长连接模式不需要公网入口，对自托管更友好，但要在 worker 里保持连接，放到 P2 | — |

钉钉的频控和错误码在新旧两版接口里写法不同：新版用 HTTP 状态加 `code` 字符串，旧版用 `errcode`。`describeError` 要两种都认。错误码表从官方文档抄，初稿先覆盖令牌失效、频率超限、无权限、部门不存在、手机号已存在这五类。

### 7.4 官方方案和核对规则

- 新增 `official/beisen-wecom.ts`、`official/beisen-dingtalk.ts`，从 `beisen-feishu.ts` 复制结构。触发器、保序键、去重键、部门映射表不变，只换目标动作。公共部分抽到 `official-solution-builders.ts`，例如 `beisenPeopleWorkflows({ target })`，避免三份拷贝。
- 组织同步方案同理：`plan_tree_sync` 与目标无关，只换 `upsert_department`、`enumerate_departments`。
- `verification-rules.ts` 的 `RULES` 加上两个连接器的部门规则和状态规则。钉钉的 `suspend_user` 核对「在待离职部门」。
- 两个连接器都打进镜像（决定 000037）；`package.json` 各自声明依赖，版本从 0.1.0 开始。

### 7.5 验收

- 契约测试（第 3.5 节）通过。
- 模拟服务加 `/wecom`、`/dingtalk` 两组接口，按官方文档复现错误码和频控，错误注入方式与现有 `/__admin/feishu-failure` 一致。
- 主线脚本加参数 `E2E_TARGET=wecom|dingtalk`，跑同样的 8 项判定；`load-faults.mjs` 对两个目标各跑一遍。
- 真实租户：企业微信和钉钉都能免费注册企业，上线前各跑一遍主线。

## 单据后的辅助流程（G9、G10、G12）

「单据提交或审批通过之后」就是决定 000039 里的辅助流程：主流程在 OA 或飞书审批里走完，平台接住结果，去入账、通知、归档、推给下游。首发用飞书审批做样板，因为飞书连接已经在了；邮件和通用 Webhook、HTTP 补上底座；泛微、金蝶这类系统走连接器开发工具，不在首发内。

### 8.1 常见场景（产品侧要覆盖的）

| 主流程的结果 | 平台要做的辅助动作 | 首发能否支持 |
| --- | --- | --- |
| 报销审批通过 | 写费用台账、通知申请人、推财务系统生成应付 | 台账和通知可以；推财务走 HTTP |
| 合同审批通过 | 归档到多维表格、到期前 30 天提醒、通知法务 | 可以（定时触发 + 多维表格查询） |
| 采购申请通过 | 推 ERP 建采购订单、通知采购员 | 通知可以；ERP 走 HTTP |
| 用印、出差审批通过 | 通知行政、写日历或台账 | 可以 |
| 入职审批通过（OA 里） | 触发人员同步 | 可以（调人员同步子流程） |
| 审批被驳回或撤销 | 撤回已发的通知、台账标作废 | 可以（按状态分支） |
| 业务系统里新增一行（数据库） | 通知、写入另一个系统 | Postgres 可以；MySQL 要补触发器 |

### 8.2 飞书审批能力

加在飞书连接器里，接口写进新的 `common/approvals.ts`。

| 名称 | 类型 | 接口 | 说明 |
| --- | --- | --- | --- |
| `approval_instance_changed` | Webhook 触发 | 事件 `approval_instance`；启用时 `POST /open-apis/approval/v4/approvals/:approval_code/subscribe`，停用时取消订阅 | 属性：审批定义 code（手填）、关心的状态（默认只有「已通过」）、Verification Token、Encrypt Key。握手和解密复用 `event-payload.ts` |
| `approval_instance_polled` | 轮询触发 | `GET /open-apis/approval/v4/instances?approval_code=&start_time=&end_time=`，再逐个读状态 | 给没有公网入口的自托管实例用；只看最近 N 天（默认 7）创建的实例，按「实例 code + 状态」去重 |
| `get_approval_instance` | READ | `GET /open-apis/approval/v4/instances/:instance_id` | 输出把 `form` 的 JSON 字符串解成 `{ 控件名: 值 }`，另带状态、申请人 open\_id、编号、各节点审批人 |
| `enumerate_approval_instances` | SEARCH | 同轮询接口 | 声明 `enumeration`，供对账用：「本月通过的报销单都入了台账」 |

两个触发器都只从事件里取实例 code，再调 `get_approval_instance` 重新读当前状态（决定 000042）。触发器设置里默认去重键为「实例 code:状态」，业务键为审批编号。表单里有金额、日期、人员、附件等控件时，解析后统一成文本、数字、ISO 日期、open\_id 数组和附件 URL 数组，写进 `outputSchema`，便于字段映射。

飞书应用要开「查看、创建、更新、删除审批应用相关信息」权限，并订阅审批事件，连接向导里加上。

### 8.3 样板方案「飞书报销审批通过 → 台账与通知」

新建 `official/feishu-approval-ledger.ts`，一条工作流：

1. `approval_instance_changed`，状态取「已通过」和「已撤销」。
2. `get_approval_instance` 重新读。
3. `map_fields`：申请人、部门、金额、费用类型、审批编号、通过时间。费用类型查映射表，得到会计科目。
4. `search_bitable_records`：按审批编号查台账。分支：没有就 `create_bitable_record`；有且状态变为撤销，就改「状态」列为作废（飞书连接器要补 `update_bitable_record`，`IDEMPOTENT`）；其余什么都不做。这一步把 `UNSAFE` 的写入在工作流里变成「先查后写」。
5. `send_direct_message` 通知申请人，去重键为「审批编号:状态」。
6. 可选（配置项开关）：HTTP 步骤 `POST` 到财务系统，请求头 `Idempotency-Key` 取审批编号。

配置项：审批定义 code、多维表格 App Token 与数据表 ID、财务接口地址（可空）。另带一条对账规则：源为 `enumerate_approval_instances`（已通过），目标为多维表格的 `enumerate_records`（要新增，SEARCH），期望为 `EXISTS`。

### 8.4 通用底座的补强

- **HTTP 步骤**（`packages/connectors/core/http`）：加属性「幂等键」，填了就以 `Idempotency-Key` 请求头发送，引擎按 `IDEMPOTENT` 对待；不填就按第 6.2 节按方法判断。外发一律走 `safeHttp`。
- **Webhook 触发**（`packages/connectors/core/webhook`）：加可选的签名校验（HMAC-SHA256，密钥存在触发器属性里，比对指定请求头），不通过就返回 401、不启动运行。
- **MySQL 新增行触发**：照 `postgres/src/lib/triggers/new-row.ts` 做，按自增列或更新时间列做游标。

### 8.5 邮件连接器（G10）

新建 `packages/connectors/core/email`，依赖 `nodemailer` 写在这个包自己的 `package.json` 里。

- 连接有两种：「自己的 SMTP」（主机、端口、TLS、用户名、密码、发件人）；「使用平台邮件服务」，经新接口 `POST /v1/engine/email/send` 由 API 代发。平台没配邮件服务时，第二种置灰，并提示去系统设置里配，不报错。
- 动作 `send_email`（WRITE，`UNSAFE`）：收件人、抄送、主题、HTML 或纯文本、附件（文件属性）。单封收件人不超过 50。
- SMTP 主机是用户填的，按 `FEMA_SSRF_ALLOW_LIST` 同样的规则拦私网地址；内网邮件服务器要由管理员加进放行名单。连接向导里说明这一点。
- 错误归因：认证失败 535 归 `CONNECTION_OWNER`；收件人被拒 550 归 `SOURCE_DATA_OWNER`；421、451 归限流。

### 8.6 OA 和 ERP 的接入路径（G12，P2）

泛微 e-cology、致远、金蝶云星空、用友这类系统部署差异大、接口随版本变，首发不做第一方连接器。路径是：

1. 连接器开发工具的清单格式（决定 000035）加上第 3 节的 `reliability` 字段，让客户或实施方写的连接器也能声明幂等和限流。
2. 为金蝶云星空做第一个清单样例（登录、保存、提交、审核、按单据编号查询）。金蝶没有幂等键，所以保存要声明 `LOOKUP_BEFORE_WRITE`，按单据编号查。
3. 泛微的审批通过事件一般通过流程节点里的「接口动作」推出来，平台这边用带签名校验的 Webhook 触发接住，文档里给出配置步骤。

### 8.7 验收

- 飞书审批模拟接口加到模拟服务；场景脚本 `tools/e2e/scenarios/approval-ledger.mjs`：100 个实例通过、其中 10 个重复推送、5 个通过后撤销。判定：台账 100 行、其中 5 行作废，通知 105 条，对账差异为 0。
- 轮询版触发在关掉 Webhook 的情况下跑同样的场景。
- 邮件连接器用本机 SMTP 模拟服务（例如 `smtp-server` 包，只放在 `tools/` 的依赖里）做集成测试。

## 平台与运维（G5、G11、G13）

这一节不加新功能，只是把「在本机模拟服务上过了」变成「在真实租户和真实部署上过了」。备份仍按已定的取舍，界面只做预检，恢复由管理员在服务器上执行；但恢复要有脚本，并且演练过。

### 9.1 真实环境验收（G5）

**飞书**（可以马上做，只缺账号）：

1. 注册一个飞书免费企业，建企业自建应用；开通讯录读写、发消息、多维表格、审批权限；通讯录范围设为全部成员；发布版本。
2. 用全新镜像部署一个实例，不改任何环境变量（产品备忘的完成标准）。
3. 跑 `tools/e2e/main-line/run-main-line.mjs`，设 `E2E_FEISHU_APP_ID`、`E2E_FEISHU_APP_SECRET`、`E2E_FEISHU_HR_CHAT_ID`，不设 `FEMA_FEISHU_BASE_URL`；北森仍用模拟服务。
4. 再跑组织同步（第 4.7 节）和审批台账（第 8.7 节）的真实飞书版本。
5. 记录实际观察到的频控和错误码，回填到 `error-table.ts`、模拟服务和第 3.4 节的限流声明。
6. 脚本要能清场：用新增的 `tools/e2e/real/feishu-cleanup.mjs`，暂停并移走测试创建的账号和部门。按「名称前缀 e2e-」识别，不碰其他数据。

**北森**（拿到第一个客户租户时做）：新增只读探测脚本 `tools/e2e/real/beisen-probe.mjs`。它取令牌、读最近 1 天的变动、读组织树、读一页全量员工，对照连接器的字段假设输出差异，不写任何数据。客户允许后再开写入。

**企业微信、钉钉**：各注册一个免费企业，步骤同飞书。企业微信要先在应用里配上测试机的出口 IP。

### 9.2 恢复脚本与演练（G11）

- 镜像里加命令 `fema-restore <备份文件>`，入口放在 `packages/server/api/src/cli/restore.ts`，用 `docker compose run --rm app fema-restore ...` 执行。步骤：
  1. 调用现有的恢复预检，不通过就退出。
  2. 在 Redis 里放维护标志，app 和 worker 看到后停止接收新运行。
  3. 用 `pg_restore --clean --if-exists` 恢复数据库，再解包数据目录。
  4. 跑迁移到当前版本；备份来自更新的版本时拒绝恢复。
  5. 清掉维护标志，输出恢复前后的项目数、工作流数、运行数。
- 恢复后的触发器：轮询游标会回到备份时刻，备份之后的变动会被重新处理。靠去重键和「先查后写」保证不重复，恢复后立即跑一次对账。这一点写进运维文档。
- 演练脚本 `tools/e2e/scenarios/backup-restore-drill.mjs`：跑 200 人主线 → 备份 → 再跑 50 人 → 恢复 → 对账。判定：恢复后对账差异为 0，飞书里没有重复账号。
- 加一个双主机实测：两台机器，一台 app 加 worker，另一台只跑 worker，共用 Postgres 和 Redis。跑 `load-faults.mjs` 的并发场景和备份并发；在真容器里确认 compose 卷的行为。

### 9.3 容量指引

先按 2026-10-05 本机实测给初版：默认每个 worker 5 路并发，约 1.3 到 2 个运行每秒；API 内存峰值 412 到 820 MB；worker 进程树 1.3 到 1.6 GB；2640 个运行占库 37 MB。在空闲机器上重测后，写成 `docs/install/` 里的一页：

| 规模（员工数） | 建议部署 | 入职季 2000 人预计耗时 |
| --- | --- | --- |
| 5000 以内 | 1 台 4 核 8 GB，app 加 1 个 worker | 约 25 到 35 分钟 |
| 5000 到 2 万 | 1 台 app，2 个 worker，Postgres 独立 | 约 15 分钟（待实测） |

Redis 建议开 AOF。Redis 清空的情况已经有守卫和清扫，但开了 AOF 就不用走那条路。镜像体积在 CI 里记录并设上限，超过上一版 10% 就失败。

### 9.4 审计日志重复（G13）

实测 3629 个运行有 6324 条「运行结束」。先找出写这条事件的所有调用点（引擎回调和 worker 收尾都可能写），只保留终态变更那一处；再加一道保险：审计写入带事件键「运行结束:运行 ID」，建部分唯一索引，插入用 `ON CONFLICT DO NOTHING`。验收是重跑 `load-scale.mjs`，结束事件数等于运行数。

## 测试与验收

每个工作包合入 main 前要过下表前五行；对外称「可以上生产」前要过全部十行。引擎和前端的构建都不做类型检查，构建成功说明不了问题，所以 tsc 单独列一行。并行开发时，要在合并后的 HEAD 上重跑，不能只信各分支自查。

| # | 门槛 | 命令或脚本 | 判定 |
| --- | --- | --- | --- |
| 1 | 类型检查 | engine、api、web、shared、改过的连接器各跑 `tsc --noEmit` | 0 错误 |
| 2 | 代码规范 | `npm run lint-dev` | 0 错误 |
| 3 | 单元测试 | `npm run test-unit`，加各连接器的 `test/` | 全过；新增的纯函数（`orgTreePlan`、`reconciliationDiff`、`retrySafety`、`connectorContract`）每条规则至少一个用例 |
| 4 | 连接器契约 | 各第一方连接器的 `test/contract.test.ts` | `violationsOf` 为空 |
| 5 | API 集成测试 | `npx vitest run test/integration`（PGlite 加内存 Redis） | 全过；新接口都覆盖跨项目 404 和权限不足 403 |
| 6 | 迁移 | 在临时 Postgres 上执行并回滚新迁移；`check-migration-rollback.ts` | 两向都成功 |
| 7 | 主线与场景 | `tools/e2e/main-line/`（三个目标）、`scenarios/org-sync.mjs`、`approval-ledger.mjs`、`s1` 到 `s7` | 各脚本判定全过 |
| 8 | 规模与故障 | `load-scale.mjs`（2000 人）、`load-faults.mjs`（全部场景，含新增的 `unsafe-write-500`）、对账 1 万人 | 不丢、不重、通知恰好一次、问题只有一个；对账 10 分钟内 |
| 9 | 真实租户 | 第 9.1 节 | 飞书、企业微信、钉钉各跑一遍主线；北森探测无差异 |
| 10 | 备份演练 | `backup-restore-drill.mjs`、双主机实测 | 恢复后对账差异为 0 |

**上线文档**：第 5.7 节和第 6.3 节是接口行为变化，PR 要勾「Breaking change」，打 `⛓️‍💥 breaking-change` 标签，并写进 `docs/install/reference/breaking-changes.mdx`。每个工作包把新的术语和坑写进对应的 brain 页面：组织同步和对账写进 `workflows-execution/solutions.md` 与新的 `reconciliation.md`，安全重试写进 `error-handling.md`，连接器契约写进 `connectors-engine/building-connectors.md`。

## 里程碑与任务拆分

按两名工程师、约 25 人周排：北森到飞书在 2026-12-11 过第一个闸口，可以上生产；2027-01-22 过第二个闸口，具备人事加三家 IM 加审批的集成平台最低配置。人数是假设，只有一人时日期约拉长一倍。

| 工作项 | 开始 | 结束 |
| --- | --- | --- |
| G1 连接器契约 | 2026-11-02 | 2026-11-13 |
| G6 核对改异步 | 2026-11-02 | 2026-11-06 |
| G5 真实飞书验收 | 2026-11-02 | 2026-11-13 |
| G2 安全重试 | 2026-11-09 | 2026-11-20 |
| G3 组织同步 | 2026-11-16 | 2026-12-04 |
| G4 全量对账 | 2026-11-23 | 2026-12-11 |
| **闸口一：北森到飞书上生产** | 2026-12-11 | |
| G7 企业微信 | 2026-12-14 | 2027-01-15 |
| G8 钉钉 | 2026-12-14 | 2027-01-15 |
| G9、G10 审批与邮件 | 2026-12-14 | 2027-01-01 |
| G11、G13 恢复与审计 | 2027-01-04 | 2027-01-15 |
| **闸口二：集成平台最低配置** | 2027-01-22 | |
| G12 金蝶清单样例 | 2027-01-25 | 2027-02-05 |

G1 是其他工作包的前提，先做；G3 和 G4 共用列举动作，故意错开一周。第一个闸口是第 10 节门槛 1 到 9 全过（只算飞书），第二个闸口是十项全过。

| 工作包 | 人周 | 完成定义 |
| --- | --- | --- |
| G1 连接器契约 | 2 | SDK 类型、`fixOwnerMarker`、契约测试合入；北森、飞书、MySQL、Postgres 全部补声明并过契约测试；主动限流接口上线 |
| G6 核对改异步 | 0.5 | 1 万条核对从按钮发起后能在页面上看到结果；breaking-changes 已写 |
| G5 真实飞书验收 | 0.5 | 主线 8 项在真实飞书上全过；错误码和频控已回填 |
| G2 安全重试 | 1.5 | `unsafe-write-500` 场景通过；重放对话框列出需确认步骤 |
| G3 组织同步 | 3 | `org-sync.mjs` 全过；北森到飞书方案 1.2 发布 |
| G4 全量对账 | 4 | 晚到变动场景被对账发现并自动补齐；1 万人 10 分钟内 |
| G7 企业微信 | 3 | 主线在模拟服务和真实租户上全过 |
| G8 钉钉 | 3 | 同上；离职待办链路打通 |
| G9 飞书审批与样板方案 | 2 | `approval-ledger.mjs` 全过，含轮询版 |
| G10 邮件连接器 | 1 | 两种连接方式都能发信；平台未配邮件时不报错 |
| G11 恢复脚本与演练 | 1.5 | 演练脚本和双主机实测通过；容量指引发布 |
| G13 审计日志去重 | 0.5 | 结束事件数等于运行数 |
| G12 金蝶清单样例 | 3 | 开发工具清单支持 `reliability`；金蝶保存、提交、审核、查询四个动作在测试账套上跑通 |

**待确认项**

- [ ] 北森组织时间窗口接口、按工号查员工接口的名称和字段（影响 G3、G4）
- [ ] 飞书各接口的频控数字和部门类错误码（影响 G1、G3）
- [ ] 企业微信、钉钉的频控和错误码（影响 G7、G8）
- [ ] 投入人数：排期按 2 人算
- [ ] 注册飞书、企业微信、钉钉测试企业的负责人
