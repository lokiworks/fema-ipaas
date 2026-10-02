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

- **「近 7 天」是含今天的 7 个自然日，不是滚动 168 小时。** 日志的 3/7/15/30 天、问题中心摘要、项目首页统计、告警统计和监控页都用 `runMonitorUtils.calendarDaysStart`，按浏览器传来的 `timezone` 从当地零点算起；没传或传错回落到 UTC。15 分钟到 24 小时的范围仍是滚动窗口。租户级告警统计页没有传时区，仍按 UTC 算。
- **业务标识只在触发器设置了去重键、且 payload 里读得到值时才有。** 去重是否开启不影响它（`dedupe.keyPath` 合法就读），但没配去重键的触发器、调试运行、定时和手动触发的运行都没有业务标识，列表里显示「-」。键值最长 255 字符，超出截断。
- **业务标识搜索走 `ILIKE '%x%'`，托管 PG 不能用 pg_trgm。** 靠 `(projectId, businessKey)` 索引加上已有的 `projectId + environment + created` 索引先缩小范围再扫，所以搜索要带时间范围（默认 24 小时）；跨很长时间范围搜很短的片段会慢。
- 执行行随工作流级联删除，所以「工作流已删除」这个不能重跑的原因在现有数据里几乎不会出现；同理被去重的触发不建 execution，`DEDUPED` 原因只为完整性保留。
- 运行只记录 `RunEnvironment` 的 PRODUCTION / TESTING，测试环境部署（`test-env` webhook）的运行也记成 TESTING，和调试运行分不开，所以筛选里没有「环境」条件，环境列只如实显示生产 / 测试。
- 错误数是按运行状态算的（失败为 1），列表不读日志文件；详情抽屉里的节点列表才按步骤数失败节点。
- 「共尝试 N 次」和「沿用原结果，耗时 0 ms」都没做：引擎不在步骤输出里记录重试次数，也不标记原地续跑时沿用的节点。
- 日志内容里的去重键只能匹配「后来有重复事件被拦下」的首次运行（`deduped_event.firstExecutionId` + `keyPreview`），其他运行的去重键只在 Redis 里，查不到。
- 终止运行沿用 `executionService.cancel`，只能终止排队中 / 等待中的生产运行；`includeChildRuns: false` 时不连带取消子流程。

## Key files
- `packages/server/api/src/app/run-logs/` — `runLogService`（列表、范围、详情、批量重跑、终止）、`runLogQuery`、`runLogAccess`
- `packages/core/shared/src/lib/automation/run-log/` — DTO、`runLogFilterUtils`、`runRerunUtils`
- `packages/web/src/features/run-logs/` — 筛选面板、列表、详情抽屉
- `packages/web/src/app/routes/runs/` — `RunsPage`
