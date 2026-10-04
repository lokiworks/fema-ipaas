---
icon: 🛡️
---

# 数据与隐私

租户级设置：运行日志保存多久、记录到什么程度、哪些字段打码，以及谁能查看原文。

**记录级别** —— 完整记录 / 仅元数据 / 不记录输入输出。
**打码规则** —— 内置识别器（手机、身份证、银行卡、邮箱、密钥，默认全开）加自定义字段名，命中的值显示为 `******`。不只认整个值，字符串里夹带的号码、JSON 字符串、错误信息、被空格短横线 `+86` 破坏的号码都会处理。
**出参敏感** —— 步骤设置 `sensitiveOutput`（编辑器「出参」页开关）让这个节点的全部出参脱敏，下游日志里出现的相同值（不少于 4 个字符）也遮住。
**个人数据删除** —— 按工号 / 邮箱 / 手机号先扫描再确认清除，命中步骤的入参出参置空、错误信息里的值替换成星号，运行状态保留。
**查看原文** —— 有权限的角色对单个步骤临时查看未打码数据，每次都写审计事件 `EXECUTION_PAYLOAD_REVEALED`，被拒绝的尝试写 `EXECUTION_PAYLOAD_REVEAL_DENIED`。

## Gotchas
- **打码在写入前完成。** 引擎每次备份写两份：原始运行状态（`logsFileId`，重跑和恢复要用）和打码后的展示日志（`displayLogsFileId`）。界面只读展示日志；打码规则随任务下发（`logPrivacy`，按租户缓存 60 秒），改规则只影响之后的运行。
- 原始状态在运行结束后按「原文保存期」由 `RAW_STATE_PURGE` 每小时清理；外键 `ON DELETE SET NULL` 会把 `logsFileId` 清空。之后「查看原文」和「从失败节点重跑」都不可用，只能整体重跑。
- 超过 32KB 的步骤输出存在日志分片里（原文）。展示日志不引用分片，只写「输出过大已隐藏」和大小；清理原始状态时会先读出它引用的分片一并删除，否则分片会按日志保留期留下原文。
- 没有 `displayLogsFileId` 的旧运行仍走读取时打码，原始状态也不会被清理。
- 编辑器测试时通过 websocket 推给浏览器的单步结果没有打码，同项目在线成员都能收到（缺口，未修）。
- 删除请求里要查的值只加密暂存到任务结束，之后库里只有打码提示；扫描和清除走一次性系统任务 `DATA_ERASURE`。重写日志文件后要把文件的 `created` 改回原值，否则日志保留期被重新计算。
- 日志保留天数由文件清理任务按租户和项目设置执行，不是 `FEMA_EXECUTION_DATA_RETENTION_DAYS` 一刀切；设置页的「按项目设置保留期」只能选比平台更短的。

- **新增运行元数据字段必须登记到 `RUNS_METADATA_UPSERT_KEYS`。** 它是 Redis 合并前的白名单，漏掉的字段静默丢弃：`displayLogsFileId` 曾因此从未落库，所有运行都退回读取时打码，原始状态也从不被清理。`runs-metadata-upsert-keys.test.ts` 守着这一条。
- **失败原因在写库前脱敏。** `runsMetadataQueue` 落库时对 `failedStep.message` 按租户规则处理，所以运行日志搜索、问题中心、通知拿到的都是已脱敏文本。
- **保留期不再被暂停超时抬高。** `getEffectiveExecutionDataRetentionDays` 只取实例上限和 1 天下限；项目里有早于保留边界还没结束的运行时，这个项目本轮跳过清理，避免删掉暂停中运行要用的文件。
- **原文保留期同时清三样：** 原始运行状态、webhook 原始请求体文件（`WEBHOOK_PAYLOAD`，异步 webhook 才有）、超过日志保留期的运行的业务标识和失败原因（运行行本身不删，统计要用）。定时任务每小时 17 分跑，文件清理 30 分跑。
- **原文清掉后运行不能再重跑。** 整体重跑和从失败节点重跑都靠原始状态里的触发数据，`rerunBlockReason` 为 `RAW_DATA_EXPIRED`，`retry` 也拒绝。
- **按人员删除按整词匹配**：工号和邮箱前后不能是字母数字，手机号容忍空格和短横线。除日志文件，还清运行行的业务标识、失败原因、去重键预览和匹配到的 webhook 原始请求体。手机号只能搜到原文还在的运行，原文清掉后展示日志里只剩 `138****0001`。
- 同步 webhook 回包是流程作者在「返回响应」里配的，不在脱敏范围；工作流失败时回包为空（408）。

## Key files
- `packages/server/api/src/app/privacy/` — `privacyService.maskExecution`、`revealStep`
- `packages/core/utils/src/lib/privacy-masking.ts` — `privacyMasking.maskDeep`
- `packages/core/execution/src/lib/execution/log-redaction.ts` — `logRedaction.redactSteps`
- `packages/server/api/src/app/privacy/raw-state-purge.service.ts`
