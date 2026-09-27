---
icon: 🛡️
---

# 数据与隐私

租户级设置：运行日志保存多久、记录到什么程度、哪些字段打码，以及谁能查看原文。

**记录级别** —— 完整记录 / 仅元数据 / 不记录输入输出。
**打码规则** —— 内置识别器（手机、身份证、银行卡、邮箱、密钥）加自定义字段名，命中的值显示为 `******`。
**个人数据删除** —— 按工号 / 邮箱 / 手机号先扫描再确认清除，命中步骤的入参出参置空、错误信息里的值替换成星号，运行状态保留。
**查看原文** —— 有权限的角色对单个步骤临时查看未打码数据，每次都写审计事件 `EXECUTION_PAYLOAD_REVEALED`。

## Gotchas
- **打码在写入前完成。** 引擎每次备份写两份：原始运行状态（`logsFileId`，重跑和恢复要用）和打码后的展示日志（`displayLogsFileId`）。界面只读展示日志；打码规则随任务下发（`logPrivacy`，按租户缓存 60 秒），改规则只影响之后的运行。
- 原始状态在运行结束后按「原文保存期」由 `RAW_STATE_PURGE` 每小时清理；外键 `ON DELETE SET NULL` 会把 `logsFileId` 清空。之后「查看原文」和「从失败节点重跑」都不可用，只能整体重跑。
- 超过 32KB 的步骤输出存在日志分片里（原文）。展示日志不引用分片，只写「输出过大已隐藏」和大小；清理原始状态时会先读出它引用的分片一并删除，否则分片会按日志保留期留下原文。
- 没有 `displayLogsFileId` 的旧运行仍走读取时打码，原始状态也不会被清理。
- 编辑器测试时通过 websocket 推给浏览器的单步结果没有打码。
- 删除请求里要查的值只加密暂存到任务结束，之后库里只有打码提示；扫描和清除走一次性系统任务 `DATA_ERASURE`。重写日志文件后要把文件的 `created` 改回原值，否则日志保留期被重新计算。
- 日志保留天数由文件清理任务按租户设置执行，不是 `FEMA_EXECUTION_DATA_RETENTION_DAYS` 一刀切。

## Key files
- `packages/server/api/src/app/privacy/` — `privacyService.maskExecution`、`revealStep`
- `packages/core/utils/src/lib/privacy-masking.ts` — `privacyMasking.maskDeep`
- `packages/core/execution/src/lib/execution/log-redaction.ts` — `logRedaction.redactSteps`
- `packages/server/api/src/app/privacy/raw-state-purge.service.ts`
