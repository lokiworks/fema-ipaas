---
icon: 🩺
---

# 问题中心

生产运行失败按原因聚合成**问题**，同一原因只算一个问题、只告警一次，值班人员在问题上重放、指派、备注、关闭。

问题中心是「出事了」的唯一入口（2026-09-27 定）：运行日志是原始记录，从问题下钻；告警策略是问题中心的设置，不是独立的安全配置；首发不做「告警触发器」工作流。

**问题（Issue）** —— 同一签名的失败集合，项目级。_Avoid_：「报错」「事件」
**签名** —— 聚合键：连接错误是 `conn:<连接外部 ID>`（多个工作流共用一个问题），其余是 `<工作流 ID>:<步骤名>:<错误码>`，错误码取 `STEP_TIMEOUT` / `HTTP_<状态码>` / `STEP_FAILED`。
**重放** —— 从失败步骤重跑原运行（`FROM_FAILED_STEP`），复用同一条运行记录，所以问题下的运行会显示重放后的结果。
**问题中心页** —— 全局侧栏「问题」，路由 `/issue-center`（`/issues` 已被「跳到当前项目的问题页」占用）。「未处理的问题」跨项目列出最近 50 条，按项目筛选，点进项目内的问题详情；「告警设置」只对租户管理员显示，旧地址 `/tenant/alerts` 重定向到这里。
**问题概览** —— `GET /v1/issues/overview`，租户级，项目范围由服务端按 `projectAccess.projectsWithPermission(READ_ISSUE)` 推导，返回各项目未处理数量和最近 50 条未处理问题（不含静音的）。问题中心页和首页的「未处理的问题」卡片共用它。
**值班（Operator）** —— ADR 0013 的项目角色，有 `ISSUE:MANAGE`，可以重放和处理问题但不能改工作流。

## Gotchas
- 只有 `environment = PRODUCTION` 的失败会进问题中心；编辑器里的测试运行不会。
- 问题记录走 `distributedLock`（按签名），多实例同时失败只会建一条。
- 已解决的问题再次出现会重新打开并标记 `reopened`，不会新建。
- **累计影响（`occurrences`）按触发次数算，不把重跑当新的失败。** 重跑（`rerunOfExecutionId` 非空）、原地续跑再失败（`inPlaceRetryCount > 0`）、同一条运行重复记录，都只更新最近出现时间，不加次数（`issueUtils.isRepeatAttempt`）；趋势和近 7 天失败数同样不数重跑行。重跑再失败仍会让已解决的问题复发。
- **重放检查按「触发链」判断。** 同一次触发的多次尝试只重放最近一次（其余 `DUPLICATE_ATTEMPT`）；链上已有成功或进行中的重跑算 `ALREADY_RETRIED`；HTTP 4xx（401/403/429 除外）是目标系统拒绝了数据（`REJECTED_BY_TARGET`），不论工作流改没改过都归入「大概率再失败」。分类的纯逻辑在 `issue-replay-utils.ts`。
- **重放时 HTTP 401/403 算「可重跑」（`AUTHORIZATION_ERROR`）。** 这类错误多在对方系统里修（开权限、换凭据），平台上的工作流没改动，按「失败后没变化」会被当成数据问题默认跳过。飞书连接器把缺权限（99991672）报成 403、凭据无效（99991663）报成 401，好让这条规则生效。
- **`failedStep.message` 超过 700 字符时要保持 JSON 合法。** 友好错误带着 `raw` 堆栈和响应体，硬截断会把 JSON 截残，问题标题、HTTP 状态识别和重放分类全部失效。`truncateFailedStepMessage` 先去掉 `raw`、请求体、响应体和响应头，再截短里面的文字；完整错误仍在运行日志里。
- **`Issue` 的时间字段（`lastSeenAt`、`firstSeenAt`、`mutedUntil`）在运行时是 `Date`，共享类型却写成 `string`。** 在 JS 里用 `localeCompare` 排序会直接抛错，排序放进 SQL（`applySort`），比较时间用 dayjs。

## Key files
- `packages/server/api/src/app/issue/` — `issueService.recordFailure`、`issueReplayService`
- `packages/core/shared/src/lib/automation/issue/` — `issueUtils.classifyFailure`
- `packages/web/src/features/issues/`、`packages/web/src/app/routes/issues/`、`packages/web/src/app/routes/issue-center/` — `IssueCenterPage`
