---
icon: 🛡️
---

# 数据与隐私

租户级设置：运行日志保存多久、记录到什么程度、哪些字段打码，以及谁能查看原文。

**记录级别** —— 完整记录 / 仅元数据 / 不记录输入输出。
**打码规则** —— 内置识别器（手机、身份证、银行卡、邮箱、密钥，默认全开）加自定义字段名，命中的值显示为 `******`。不只认整个值，字符串里夹带的号码、JSON 字符串、错误信息、被空格短横线 `+86` 破坏的号码都会处理。
**出参敏感** —— 步骤设置 `sensitiveOutput`（编辑器「出参」页开关）让这个节点的全部出参脱敏，下游日志里出现的相同值（不少于 4 个字符）也遮住。
**个人数据删除** —— 按工号 / 邮箱 / 手机号先扫描再确认清除，命中步骤的入参出参置空、错误信息里的值替换成星号，运行状态保留。确认要输入对方完整标识或固定确认词（`DELETE` / `删除`），服务端同样校验；完成后可下载处理记录（谁发起、谁确认、何时、查询值的哈希、各类清理条数）。
**检索哈希** —— 运行行上的 `searchHashes`：业务标识、手机号、邮箱的带密钥 HMAC，原文清掉后仍能按完整号码或工号精确搜到运行、也能被按人员删除找到。_Avoid_：把它叫「索引」或「脱敏值」，它不可读也不可逆。
**总览** —— 数据与隐私页上三项实时数字：哪些节点标了出参敏感（按工作流列出）、现在谁能查看原文、下次清理会删多少，来自 `GET /v1/privacy-settings/overview`。
**查看原文** —— 有权限的角色对单个步骤临时查看未打码数据，每次都写审计事件 `EXECUTION_PAYLOAD_REVEALED`，被拒绝的尝试写 `EXECUTION_PAYLOAD_REVEAL_DENIED`。

## Gotchas
- **打码在写入前完成。** 引擎每次备份写两份：原始运行状态（`logsFileId`，重跑和恢复要用）和打码后的展示日志（`displayLogsFileId`）。界面只读展示日志；打码规则随任务下发（`logPrivacy`，按租户缓存 60 秒），改规则只影响之后的运行。
- 原始状态在运行结束后按「原文保存期」由 `RAW_STATE_PURGE` 每小时清理；外键 `ON DELETE SET NULL` 会把 `logsFileId` 清空。之后「查看原文」和「从失败节点重跑」都不可用，只能整体重跑。
- 超过 32KB 的步骤输出存在日志分片里（原文）。展示日志不引用分片，只写「输出过大已隐藏」和大小；清理原始状态时会先读出它引用的分片一并删除，否则分片会按日志保留期留下原文。
- 没有 `displayLogsFileId` 的旧运行仍走读取时打码，原始状态也不会被清理。
- **编辑器测试的 websocket 结果在服务端按接收者逐个发。** `testRunBroadcaster` 按连接查出用户，有「查看原文」权限的人收到原文，其余人收到打码后的；标了「出参敏感」的节点对所有人都打码，下游步骤里出现的敏感值也遮住。新增会往项目房间推步骤数据的事件，必须走它，不能直接 `websocketService.to(projectId).emit`。已保存的样例数据（`sample-data` 接口）仍是原文，编辑器靠它搭映射。
- 删除请求里要查的值只加密暂存到任务结束，之后库里只有打码提示；扫描和清除走一次性系统任务 `DATA_ERASURE`。重写日志文件后要把文件的 `created` 改回原值，否则日志保留期被重新计算。
- **展示日志和失败原因不带堆栈、不带服务器路径。** `errorSanitizer.stripLocalDetails` 在脱敏前去掉友好错误里的 `raw`（`inspect` 出来的堆栈）、`at ...` 帧和本地绝对路径（`/Users`、`/private/tmp`、`C:\\` 等），只留 `message`、状态码和错误名；`failedStep.message` 在 API 收到时同样处理。原始运行状态（`logsFileId`）和只给租户管理员看的 `internalError` 不动。引擎是打包产物，改了 `core/execution` 要重新 `npm run build`（引擎和 `core/execution`）才在本机生效。
- 日志保留天数由文件清理任务按租户和项目设置执行，不是 `FEMA_EXECUTION_DATA_RETENTION_DAYS` 一刀切；设置页的「按项目设置保留期」只能选比平台更短的。

- **新增运行元数据字段必须登记到 `RUNS_METADATA_UPSERT_KEYS`。** 它是 Redis 合并前的白名单，漏掉的字段静默丢弃：`displayLogsFileId` 曾因此从未落库，所有运行都退回读取时打码，原始状态也从不被清理。`runs-metadata-upsert-keys.test.ts` 守着这一条。
- **失败原因在写库前脱敏。** `runsMetadataQueue` 落库时对 `failedStep.message` 按租户规则处理，所以运行日志搜索、问题中心、通知拿到的都是已脱敏文本。
- **保留期不再被暂停超时抬高。** `getEffectiveExecutionDataRetentionDays` 只取实例上限和 1 天下限；项目里有早于保留边界还没结束的运行时，这个项目本轮跳过清理，避免删掉暂停中运行要用的文件。
- **原文保留期同时清三样：** 原始运行状态、webhook 原始请求体文件（`WEBHOOK_PAYLOAD`，异步 webhook 才有）、超过日志保留期的运行的业务标识和失败原因（运行行本身不删，统计要用）。定时任务每小时 17 分跑，文件清理 30 分跑。
- **原文清掉后运行不能再重跑。** 整体重跑和从失败节点重跑都靠原始状态里的触发数据，`rerunBlockReason` 为 `RAW_DATA_EXPIRED`，`retry` 也拒绝。
- **按人员删除按整词匹配**：工号和邮箱前后不能是字母数字，手机号容忍空格和短横线。除日志文件，还清运行行的业务标识、失败原因、去重键预览和匹配到的 webhook 原始请求体。原文清掉后展示日志里只剩 `138****0001`，这时靠运行行上的检索哈希（见下）仍能按完整手机号或工号找到运行；没有哈希的老运行在原文清掉后找不到。
- 同步 webhook 回包是流程作者在「返回响应」里配的，不在脱敏范围；工作流失败时回包为空（408）。

- **检索哈希怎么来的。** `searchableHash.digest` 是 HMAC-SHA256，密钥用 HKDF 从 `FEMA_ENCRYPTION_KEY` 派生，不新增必配环境变量。运行结束时 `runSearchIndexService.indexFromRawState` 读原始状态，收集业务标识、手机号（11 位，去掉空格短横线和 +86）、邮箱（小写）写进 `execution.searchHashes`；原文清理前对还没有哈希的运行补一次。运行日志搜索的 `content` 和 `businessKey` 条件、按人员删除的扫描都会再用完整值查哈希，所以只认完整号码，前缀和尾号不命中。
- **哈希只在密钥不泄露时安全。** 手机号只有约十亿种，不带密钥的哈希几秒就能撞出来；带密钥的 HMAC 拿到数据库副本也无法逐个猜（`test/unit/privacy/searchable-hash.test.ts` 对 10000 个候选做了普通 SHA-256、带类型前缀的 SHA-256、错误密钥的 HMAC 三种撞库，都找不到）。密钥和数据库一起泄露就能被撞出来，等同于加密密钥泄露；换密钥后旧哈希只在旧密钥列在 `RETIRED_ENCRYPTION_KEYS` 里时还能搜到。到日志保留期的运行和按人员删除都会清哈希。
- **删除请求新增字段**：`valueHash`（查询值的 HMAC，回执用）、`confirmedById`、`confirmedAt`、`counts`（`displayLogFiles`、`rawStateFiles`、`logSlices`、`webhookPayloads`、`runIdentifiers`、`failureMessages`、`dedupeKeys`、`searchHashes`）。展示日志里手机号已经是打码值，所以 `displayLogFiles` 常常是 0，不代表没清。
- **总览的清理数量和定时任务用同一套条件**（原始状态按原文保留期、业务标识和失败原因按项目生效的日志保留期、日志文件同上），所以数字就是下次定时任务会做的事；下次清理时间固定在每小时 17 分。

## Key files
- `packages/server/api/src/app/privacy/` — `privacyService.maskExecution`、`revealStep`
- `packages/core/utils/src/lib/privacy-masking.ts` — `privacyMasking.maskDeep`
- `packages/core/execution/src/lib/execution/log-redaction.ts` — `logRedaction.redactSteps`
- `packages/server/api/src/app/privacy/raw-state-purge.service.ts`
- `packages/server/api/src/app/privacy/test-run-broadcaster.ts` — 编辑器测试结果的按接收者脱敏
- `packages/server/api/src/app/privacy/privacy-overview.service.ts` — 总览三项数字
- `packages/server/api/src/app/helper/searchable-hash.ts` — `searchableHash`
- `packages/core/execution/src/lib/execution/error-sanitizer.ts` — `errorSanitizer`
