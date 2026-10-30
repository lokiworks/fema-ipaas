---
title: 运行日志
icon: 📜
---

# 运行日志

跨项目的运行记录列表（全局 `/logs`，项目内 `/projects/:projectId/runs` 是同一个页面、预置项目条件）。只返回调用者是成员的项目（租户管理员看全部项目，与连接、运行监控一致），且每个项目只返回保留期内的运行。

**类型** —— 运行日志 = `environment = PRODUCTION`，调试日志 = `TESTING`，另有「全部」。「已去重」仍是按项目的 `?view=deduped` 页签。
**筛选** —— URL 即状态：`type`、`match`（ALL/ANY）、`time` 或 `createdAfter/createdBefore`、`projectId`、`workflowId`、`status`、`connector`、`content`、`durationOperator`+`durationSeconds`、`executionIds`；旧参数 `failedStepMessage` 当作日志内容。解析与写回在 `runLogFilterUtils`，不完整的条件不进 URL、不进查询。时间条件永远 AND，其余条件按 ALL/ANY 组合。
**业务标识** —— `execution.businessKey`，值取自触发器去重键（`dedupe.keyPath`，如 `{{trigger.employee_id}}`）在这次触发的 payload 里读出的内容，所以是工号、审批单号这类能认出同一件事的字段。运行日志列表有「业务标识」列，筛选里有「业务标识」条件（`businessKey` 参数，`ILIKE '%…%'`，可以只输一部分，也会被「日志内容」搜索命中），详情里的「这条记录的全部日志」链接到 `?businessKey=…&time=30d`。重跑（`ON_LATEST_VERSION`）沿用原运行的业务标识，原地续跑本来就是同一行。
**重跑血缘** —— `execution.rerunOfExecutionId` 指向这次触发的**原始**运行（链根），不是上一跳；「从失败节点重跑」是原地续跑同一行，只把 `inPlaceRetryCount` 加一。
**能否重跑** —— 由 `runRerunUtils.blockReason` 一处判定，服务端逐行返回，批量重跑时服务端再判一次，同一链根在一批里只重跑一次。

## Gotchas

- **单步测试以前不写开始时间，调试日志的耗时显示「—」。** 引擎只在从触发器开始的运行里上报 `startTime`，单步测试（`stepNameToTest`）走 `workflowExecutor.execute`，`durationOf` 拿不到开始时间就是空。现在 `executeSingleStepOrWorkflow` 在执行被测步骤前先 `sendUpdate` 一次带上开始时间；修复前留下的旧记录仍然没有耗时。
- **切页签或改筛选条件要清空勾选。** `DataTable` 的选中行按 `rowSelection` 记忆，换数据后不会自己清；运行日志用整个列表查询（含游标）做表格的 `key`，换条件就重新挂载。
- **窄屏（小于 1024 宽）运行日志折叠次要列。** 只留创建时间、工作流、状态、操作；业务标识、项目、环境或类型、版本、耗时、错误数合并进工作流列的第二行（`CompactWorkflowCell`），所以状态和操作不再需要横向滚动才能看到。宽屏仍是完整的列。
- **限流受阻的运行不可重跑，到点才可以。** 失败信息带还没到期的 `[blocked-until=…]`（问题中心同一套标记）时，`runRerunUtils.blockReason` 给 `BLOCKED_UNTIL`，行里的重跑按钮置灰、提示写明解除时间（`RunLogRow.blockedUntil`），批量重跑按「不能重跑」跳过，服务端批量重跑时再判一次；时间一过自动回到可重跑。从问题里批量重跑弹窗也是同一套判断，受阻的归「被拦下」，没有可勾选的项。
- **筛选条件「平台已处理」（`handled`）按运行是否有对应的可靠性事件过滤**：等过限流、自动重试过、宕机后补上的事件，用 `EXISTS run_reliability_event` 查，运行监控的下钻就是带着这个条件过来的。
- **「近 7 天」是含今天的 7 个自然日，不是滚动 168 小时。** 日志的 3/7/15/30 天、问题中心摘要、项目首页统计、告警统计和监控页都用 `runMonitorUtils.calendarDaysStart`，按浏览器传来的 `timezone` 从当地零点算起；没传或传错回落到 UTC。15 分钟到 24 小时的范围仍是滚动窗口。租户级告警统计页也传浏览器时区。
- **业务标识只在触发器设置了去重键、且 payload 里读得到值时才有。** 去重是否开启不影响它（`dedupe.keyPath` 合法就读），但没配去重键的触发器、调试运行、定时和手动触发的运行都没有业务标识，列表里显示「-」。键值最长 255 字符，超出截断；业务标识和日志内容两个筛选条件的上限同样是 255（`RUN_LOG_TEXT_MAX_LENGTH`），否则超过 200 字符的标识点「这条记录的全部日志」会 400。
- **业务标识搜索走 `ILIKE '%x%'`，托管 PG 不能用 pg_trgm。** 靠 `(projectId, businessKey)` 索引加上已有的 `projectId + environment + created` 索引先缩小范围再扫，所以搜索要带时间范围（默认 24 小时）；跨很长时间范围搜很短的片段会慢。
- 执行行随工作流级联删除，所以「工作流已删除」这个不能重跑的原因在现有数据里几乎不会出现；同理被去重的触发不建 execution，`DEDUPED` 原因只为完整性保留。
- 运行只记录 `RunEnvironment` 的 PRODUCTION / TESTING，测试环境部署（`test-env` webhook）的运行也记成 TESTING，和调试运行分不开，所以筛选里没有「环境」条件，环境列只如实显示生产 / 测试。
- 错误数是按运行状态算的（失败为 1），列表不读日志文件；详情抽屉里的节点列表才按步骤数失败节点。
- 「共尝试 N 次」和「沿用原结果，耗时 0 ms」都没做：引擎不在步骤输出里记录重试次数，也不标记原地续跑时沿用的节点。
- 日志内容里的去重键只能匹配「后来有重复事件被拦下」的首次运行（`deduped_event.firstExecutionId` + `keyPreview`），其他运行的去重键只在 Redis 里，查不到。
- 终止运行沿用 `executionService.cancel`，只能终止排队中 / 等待中的生产运行；`includeChildRuns: false` 时不连带取消子流程。
- **项目内的运行日志不能去掉「项目」条件。** 去掉（或通过筛选面板改成没有项目）会跳到全局 `/logs` 并带上其余条件，那里有项目列；旧地址 `?allProjects=true` 也会重定向过去。项目内的「清除条件」保留项目条件。
- **列表「失败节点」列和详情抽屉同一口径。** 列表显示导致运行失败的节点名（运行状态属于失败类时取 `failedStep`，其余为「—」）；抽屉写「运行失败在「X」节点」，出错后按设置继续执行的节点另起一行计数；运行成功但有节点出错继续时写「运行没有失败；N 个节点出错后按设置继续执行」。判定在 `runLogErrorSummary`。
- **保留期是两档，文案必须两档都写。** 脱敏运行日志按 `min(租户 logRetentionDays, 项目 executionDataRetentionDays)`（默认 30 天），原始数据（可查看原文、可重跑）按租户 `rawPayloadRetentionDays`（默认 3 天，且不超过日志保留期）；计算在 `retentionUtils.effective`（`privacy.service.ts`），`GET /v1/run-logs/scope` 带出 `tenantRawRetentionDays` 和各项目 `rawRetentionDays`，前端用 `runLogUiUtils.retentionText` / `projectRetention`。不要再用 `EXECUTION_DATA_RETENTION_DAYS` 标志当保留天数，那是实例上限。
- **原始数据过期后运行页回退到脱敏日志。** `GET /v1/executions/:id` 读的是 `displayLogsFileId`，过期后 `steps` 仍在；运行页右侧面板按 `runLogUiUtils.runDataState` 判断，`MASKED_ONLY` 时照常显示入参出参并标注「原始数据已过保留期，以下为脱敏日志」，只有两份日志都没有（`NONE`）才显示「已过保留期被清理」。

- **节点面板入参／出参是同一套结构。** 运行视图（`/runs/…` 与编辑器里看调试结果）顶层「入参」默认显示本次实际入参、可切到「配置」，顶层「出参」只放本次出参，失败时出参里是 `StepErrorDetails`（友好错误 + 复制错误给 AI + 排查建议）；调试记录面板也只有「入参／出参」两页。`panel=input` 落到顶层「入参」，`ApplyRunFocus` 不能带 `fromAutoFocus`，否则 `useFocusOnStep` 半秒后会把选中改回失败节点。
- **编辑器 URL 记住选中节点和页签。** `StepSelectionUrlSync` 把 `step`、`tab` 写进编辑器地址（replace），从运行视图后退回来能恢复；它只挂在编辑器路由，运行页仍用 `step`/`panel`。

## Key files
- `packages/server/api/src/app/run-logs/` — `runLogService`（列表、范围、详情、批量重跑、终止）、`runLogQuery`、`runLogAccess`
- `packages/core/shared/src/lib/automation/run-log/` — DTO、`runLogFilterUtils`、`runRerunUtils`
- `packages/web/src/features/run-logs/` — 筛选面板、列表、详情抽屉
- `packages/web/src/app/routes/runs/` — `RunsPage`
