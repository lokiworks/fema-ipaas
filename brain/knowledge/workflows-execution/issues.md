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

- **「结果对不上」（`IssueKind.DRIFT`）是写后读回核对开的问题，不是失败运行开的。** `verificationService.run`（问题页「核对最近的结果」按钮，每天 03:37 的 `verify-recent-results` 任务也会跑）取项目里最近 72 小时成功的生产运行，要求有业务标识；**每个业务标识只核对它最近一次写入**（先入职后调岗的人只按调岗核对，否则会把正常的部门变化当成差异）。规则在 `verification-rules.ts`：飞书的 `provision_user`、`update_user` 核对部门，`suspend_user`、`resume_user` 核对冻结状态，读回用飞书连接器的只读动作 `get_user`，经 `actionRunService.runConnectorAction` 用原来那个连接去读。不一致就按 `workflowId:步骤:RESULT_MISMATCH` 合并成一个问题，每个人只计一次，活动记录里 NOTE 写着工号和运行 id；之后核对一致会自动关闭（`reason: VERIFIED`）；读不到（权限、网络）只计「读取失败」，不开问题。严重度固定为高。这类问题没有失败运行可重放，修复入口是打开这个工作流的运行记录再手动重跑。

- **核对按页翻完整个窗口，读回有限速，不再只看最近 200 个人。** `verificationService.run` 每页 200 条按 `finishTime`、`id` 倒序用键集游标翻（游标取 `finishTime::text`，保留微秒，用毫秒的 Date 会漏行），一个人（`连接器:openId:方面`）只读最新一次写入，跨页靠 `seen` 集合延续；读飞书严格串行，每秒最多 `FEMA_VERIFICATION_READS_PER_SECOND`（默认 10）次，单个项目最长 `FEMA_VERIFICATION_TIME_BUDGET_MINUTES`（默认 60）分钟，超了返回 `truncated: true`，一万人全量约 17 到 35 分钟（取决于飞书单次读的延迟，实际速率是 min(限速, 1/延迟)）。读步骤日志并发 10。两个实例同时跑同一个项目不会重复开问题（按签名的分布式锁加「这个运行 id 已记过 NOTE」），但会各自读一遍飞书。
- **重放成功会自动关闭问题，但要这个问题名下每一次失败都被救回来。** 生产环境里一次重跑（`rerunOfExecutionId`）或原地重试成功结束时，`executionHooks.onFinish` 调 `issueService.resolveIfRecovered`：数这个问题名下没有被成功重跑覆盖的失败根运行，为 0 才把 OPEN 或 INVESTIGATING 的问题标成已解决，系统操作，活动记录里 `reason` 是 `REPLAY_SUCCEEDED`。只救回一部分、重放自己又失败、普通的成功运行都不会关；已解决后同一失败再来仍按原逻辑重新打开。
- 只有 `environment = PRODUCTION` 的失败会进问题中心；编辑器里的测试运行不会。
- 问题记录走 `distributedLock`（按签名），多实例同时失败只会建一条。
- 已解决的问题再次出现会重新打开并标记 `reopened`，不会新建。
- **累计影响（`occurrences`）按触发次数算，不把重跑当新的失败。** 重跑（`rerunOfExecutionId` 非空）、原地续跑再失败（`inPlaceRetryCount > 0`）、同一条运行重复记录，都只更新最近出现时间，不加次数（`issueUtils.isRepeatAttempt`）；趋势和近 7 天失败数同样不数重跑行。重跑再失败仍会让已解决的问题复发。
- **重放检查按「触发链」判断。** 同一次触发的多次尝试只重放最近一次（其余 `DUPLICATE_ATTEMPT`）；链上已有成功或进行中的重跑算 `ALREADY_RETRIED`；HTTP 4xx（401/403/429 除外）是目标系统拒绝了数据（`REJECTED_BY_TARGET`），不论工作流改没改过都归入「大概率再失败」。分类的纯逻辑在 `issue-replay-utils.ts`。
- **重放时 HTTP 401/403 算「可重跑」（`AUTHORIZATION_ERROR`）。** 这类错误多在对方系统里修（开权限、换凭据），平台上的工作流没改动，按「失败后没变化」会被当成数据问题默认跳过。飞书连接器把缺权限（99991672）报成 403、凭据无效（99991663）报成 401，好让这条规则生效。
- **`failedStep.message` 超过 700 字符时要保持 JSON 合法。** 友好错误带着 `raw` 堆栈和响应体，硬截断会把 JSON 截残，问题标题、HTTP 状态识别和重放分类全部失效。`truncateFailedStepMessage` 先去掉 `raw`、请求体、响应体和响应头，再截短里面的文字；完整错误仍在运行日志里。
- **`Issue` 的时间字段（`lastSeenAt`、`firstSeenAt`、`mutedUntil`）在运行时是 `Date`，共享类型却写成 `string`。** 在 JS 里用 `localeCompare` 排序会直接抛错，排序放进 SQL（`applySort`），比较时间用 dayjs。
- **超时、内存超限的运行引擎不记 `failedStep`，问题靠 API 补出来。** worker 杀掉沙箱时不知道卡在哪一步，`issueFailedStep.resolve` 在运行结束时读日志文件，取还在 `RUNNING` 的那一步（没有就取最后一步，再没有就取触发器）当作失败步骤，写回执行行后才进问题中心；运行日志的节点列表也据此把这一步标成失败。早于这个修复的超时运行没有问题。
- **删除工作流会把它名下未关闭的问题由系统标成已解决**（`issueService.onWorkflowDeleted`，活动记录里操作人为空）。执行行随工作流级联删除，问题留着只会永远「未处理」。连接问题（`conn:` 签名）不属于某个工作流，不受影响。
- **告警里的「合并 N 次」只数被问题计入的失败。** 同一条运行的重复落库、重跑再失败都不再合并进告警（`recordFailure` 返回 `counted`，没计入的 `OCCURRED` 不触发告警）；告警统计的「合并的失败次数」只加新问题、复发、仍在失败三类，失败率和容量告警不加。
- **删除告警策略不删告警记录。** `alert_record` 只对租户级联，不再对策略级联；记录里的策略名显示「已删除的策略」。
- **问题页的「今日新增与复发」「处理中」两张卡片和列表视图同口径**：按浏览器时区算今天，静默中的问题两边都不算。趋势图也按浏览器时区分桶（近 24 小时按本地整点，近 30 天按本地自然日）。
- **根因分析是规则引擎，不用模型，也不需要配置模型。** 5xx 是「下游返回服务端错误」，401/403 是「对方拒绝访问」，没有 HTTP 状态码的失败是「步骤失败」，不再一律说成「下游拒绝了请求（HTTP 422）」。
- **连接器在错误消息末尾带 `[blocked-until=<ISO 时间>]`，表示「这个时间之前不要重试」（北森限频后到次日北京时间 00:00）。** 问题签名不变（错误码仍是 `HTTP_429`）。标记没过期时：根因分析是 `BLOCKED_UNTIL`（「X 之前不要重试」，不再推荐「打开节点配置重试」，`insight.blockedUntil` 带时间），重放检查按每条运行自己的 `failedStep.message` 判断，归 `BLOCKED` / `BLOCKED_UNTIL`（弹窗里不可勾选，原因文案写明何时可重放，`ReplayCheckItem.blockedUntil` 取同原因里最晚的）；时间一过自动回到按状态码的判断（429 归「偶发错误」可重放）。标记留在 `issue.message` 里，页面展示用 `issueUiUtils.messageText` 去掉。机制见连接器页 `building-connectors`。轮询触发器的失败文本同样带标记，所以触发器问题也会显示。
- **问题概览 `GET /v1/issues/overview?projectId=` 只收窄 `latest`，各项目的数量不变**；问题中心选中某个项目时，最近 50 条是这个项目自己的。

## Key files
- `packages/server/api/src/app/issue/` — `issueService.recordFailure`、`issueReplayService`
- `packages/core/shared/src/lib/automation/issue/` — `issueUtils.classifyFailure`
- `packages/web/src/features/issues/`、`packages/web/src/app/routes/issues/`、`packages/web/src/app/routes/issue-center/` — `IssueCenterPage`
