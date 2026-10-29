---
title: 运行监控
icon: 📈
---

# 运行监控

跨项目视图（路由 `/monitor`），按项目和工作流看运行次数、成功率、耗时和 AI 用量。只统计调用者是成员的项目（租户管理员看全部项目），项目 ID 由服务端从登录身份推导，客户端传的 `projectIds` 只会和成员项目取交集。

**时间范围** —— 15 分钟 / 1 小时 / 24 小时 / 7 天（默认）/ 30 天，按浏览器传来的 IANA 时区在本地时间分桶：15 分钟每 1 分钟一桶，1 小时每 5 分钟，24 小时每小时，7 天和 30 天每天。范围起点是第一个桶的开始（不是「现在减 N」），上一周期是紧挨着的等长区间。
**统计口径** —— 只算 `environment = PRODUCTION` 且未归档的运行，按 `created` 落桶、按当前状态归类：成功、失败（`FAILED_STATES` 加 `LOG_SIZE_EXCEEDED`）、终止（`CANCELED`）、运行中（排队 / 执行中 / 等待中）。成功率 = 成功 ÷ 已结束。
**运行中工作流** —— 卡片主值是范围内已启用的工作流数（对齐设计文档里「运行中（已启用）」的说法），副行给出此刻有排队 / 执行中 / 等待中运行的工作流数。
**峰值并发** —— SQL 里把每次运行的 `[startTime, finishTime)` 裁到范围内，按开始 +1、结束 -1 做累计求最大值；没结束的运行算到现在，同一时刻先减后加。
**我的视图** —— `run_monitor_view` 表，按 `userId + tenantId` 私有保存范围、项目、工作流、状态指标和图表 / 表格模式；「默认视图」是前端预置，不入库。名称 ≤ 20 字，同一用户不重名，每人最多 50 个。
**AI 用量** —— 来自 `ai_usage`：`AGENT` / `ASK_MODEL` 按关联运行的环境分为工作流运行和调试运行，`COPILOT` 是编辑器 AI 助手，`AUTO_MAPPING` 是自动映射，`GENERATE_WORKFLOW` 是 AI 生成工作流。单价只存在浏览器 localStorage，估算费用不是账单。

## Gotchas
- 「被去重的触发」只能按单个项目看（`/projects/:id/runs?view=deduped`），所以 `handled.duplicateProjects` 带各项目的去重数：只有一个项目有数据就直接跳过去，多个就弹出项目选择；运行日志页的同名按钮也一样。
- 生产运行由 `runsMetadataQueue` 异步落库，刚触发的运行要过一小会儿才出现在监控里。
- 峰值并发只回看范围起点前 24 小时内创建的运行；跨天仍在跑的超长运行可能漏算。
- 「用了 AI 的运行」靠 `ai_usage.executionId` 关联回范围内的生产运行，只有工作流里的 AI 节点会带运行 ID；编辑器里的 AI 功能不进这个比例，但计入 Token 总量。
- 明细表最多返回 500 个工作流（按运行次数），超出时页面会提示；CSV 只导出已加载的这些行。
- **「运行节点数」含失败运行停下的那个节点，但存储的 `execution.stepsCount` 仍只数成功节点。** `stepsCount` 由引擎在节点成功后累加，也是单次运行节点上限（`FEMA_MAX_NODES_PER_RUN`）的计数器，所以不能改口径；监控在展示聚合里（`runMonitorUtils.executedStepsOf`）把状态为 FAILED、TIMEOUT、MEMORY_LIMIT_EXCEEDED 的运行各加 1。失败后被忽略或走分支的节点没有数据可数，不计入；INTERNAL_ERROR 和 LOG_SIZE_EXCEEDED 不加。「平均每次」是这个数除以范围内的全部运行数。
- 点图表柱子或明细行会带 `projectId`、`workflowId`、`status`、`createdAfter`、`createdBefore` 跳到 `/logs`。
- **「平台替你处理掉的事」五个数都从记录算出、能下钻核对**（`RunMonitorHandled`）：「拦下的重复事件」数 `deduped_event` 在范围内的行，点「查看被拦下的事件」进项目运行日志的「已去重」页签（只选了一个项目，或总共只有一个项目时才能点）；「合并进问题的失败」数范围内带 `issueId` 的生产运行（不含重跑行），并给出涉及的问题数，点「查看问题」进问题中心。另外三项数 `run_reliability_event`（只算范围内生产运行的事件）：「限流排队」是调用撞上对方限流、按对方给的等待时间排队后重试的次数，按连接器列出并写明对方声明的计数单位（北森按企业计、飞书按接口×应用×租户计，登记在 shared 的 `rateLimitUnitUtils`）；「自动重试」是节点错误处理策略（含旧的重试开关）触发的重试次数；「宕机后补上的事件」是触发器停了两个轮询周期以上之后第一次轮询补拉到的事件。三项都能点「查看这些运行」带着 `handled=<类型>` 进运行日志（筛选条件「平台已处理」），列表就是这些事件所在的运行。
- **界面写「自动重试」而不是「安全重试」。** 平台还没有按动作的幂等声明过滤重试（决定 000040 的保守规则只写在备忘里），重试是节点设置里选的；写「安全」会承诺做不到的事。

## Key files
- `packages/server/api/src/app/run-monitor/` — `runMonitorService`、`runMonitorAiService`、`runMonitorViewService`，纯计算在 `runMonitorUtils`
- `packages/core/shared/src/lib/automation/run-monitor/` — `RunMonitorSummary`、`RunMonitorView`
- `packages/web/src/features/run-monitor/`、`packages/web/src/app/routes/monitor/` — `MonitorPage`
