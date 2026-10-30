---
icon: 🧯
---

# 节点错误处理

应用、代码节点出错后怎么办：默认策略加按错误码匹配的自定义策略，从上往下命中即停。

**策略** — 终止 / 忽略 / 添加分支，以及三者的「重试后」版本；重试次数 1/2/3/5（默认 3）、间隔 5/10/30/60 秒（默认 10）。存在 `errorHandlingOptions.strategy`，自定义规则在 `rules`。
**错误码** — `errorHandlingUtils.classifyErrorMessage` 给出，与问题中心同一套：`HTTP_<状态>`、`STEP_TIMEOUT`、`STEP_FAILED`、`CONNECTION_EXPIRED` 等。规则里只写数字（429）按 `HTTP_429` 处理。
**失败分支** — 画布上和「成功」分支成对出现，复用 `continueOnFailureBranches`（`onSuccess` / `onFailure`），分支跑完后继续走 `nextAction`。设置页签叫「错误处理」，策略选项写作走「失败」分支。_Avoid_：「异常处理」分支（第九轮旧称）

## Gotchas
- 自动重试和问题重放都读取 SDK reliability：未声明或结果不确定的 UNSAFE 写入停止，记录 RETRY_WITHHELD；消息去重键还要处于厂商去重窗口内。重放接口重新计算每个将执行的写步骤，未逐项确认时返回 400。
- **步骤撞上限流时先排队再重试，不管有没有配重试策略。** 连接器在失败信息里带 `[blocked-until=…]` 并且等待不超过 30 秒（`RATE_LIMIT_QUEUE.maxWaitMs`）时，引擎在 `requestWithRateLimitQueue` 里按这个时间等一等再调一次，最多 3 次，之后才算失败；等待超过 30 秒（北森当天封禁）、没有等待提示、单步测试都不排队。限流是对方在处理前拒绝的，所以重试写操作也不会重复。飞书连接器读 `x-ogw-ratelimit-reset` 头（没有就等 1 秒），北森读 `Retry-After`（没有仍是次日零点封禁）。
- **排队和重试都记事件，随运行日志上传。** 引擎把每次排队（`RATE_LIMIT_QUEUED`）和每次策略重试（`AUTO_RETRY`）放进 `WorkflowExecutorContext.reliabilityEvents`，进度和结束时带在 `UploadRunLogsRequest.reliabilityEvents` 里，API 在 `uploadRunLog` 用 `eventKey` 幂等写进 `run_reliability_event`（先核对工作流属于这个项目）。事件键含运行、步骤、循环位置和时间，重复上传不会重复记，续跑也不会撞键。
- **没有 `strategy` 字段就走老逻辑**：`continueOnFailure` / `retryOnFailure` 两个开关照旧生效（重试 4 次、2 秒起指数退避），老配置仍会经过写入安全判定。一旦写入 `strategy`，引擎只看新字段；前端保存时同步写 `continueOnFailure.value = usesBranches(...)`，画布和老代码据此显示分支。
- **画布是否显示分支看 `errorHandlingUtils.usesBranches`**：默认策略或任一规则是「分支」类就显示。引擎在规则解析为「忽略」时走 `onSuccess` 分支，只有解析为「分支」时才走 `onFailure`。
- **错误码按最后一次失败计算**：每次重试后重新匹配规则，重试次数取命中规则的设置；单步测试（`stepNameToTest`）不重试也不继续。
- **AI 节点默认「重试后终止」只对新建节点生效**：默认值在前端 `connector-selector-utils` 创建节点时写入，已有节点没有 `strategy`，保持原样。
- **HTTP 状态优先取连接器友好错误里的 `status`**：以前问题中心只在文案里找 3 位数字，「Route not found」这类 404 会被归为 `STEP_FAILED`；现在归为 `HTTP_404`，问题签名会随之变化。
- **走异常处理分支时，引擎把失败步骤的出参改写成 `{ errorCode, errorCategory, errorMessage, rawMessage, errorTime, errorTimeIso }`**（`recordFailureDetails` → `helper/failure-details.ts`）。`errorCode` 优先取外部系统原始码（从 `(Feishu error 41017)`、`(Beisen code 417)` 这类尾注里取），没有才是平台分类，平台分类另放 `errorCategory`。`errorMessage` 是中文：连接器在抛出的 Error 上挂 `readableMessage`，`formatConnectorError` 把它带进友好错误；没挂时用「步骤执行失败：原文」兜底。`rawMessage` 是去掉 `[fix-owner=…]`、`[blocked-until=…]` 的原文。`errorTime` 是北京时间 `YYYY-MM-DD HH:mm:ss`，`errorTimeIso` 是 UTC ISO。分支里用 `{{step_x['output']['errorCode']}}` 引用，漏了 `['output']` 的引用在输入框里显示为「无效引用」。老的 `{{step_x.error.message}}` 仍然能解析。单步测试不走分支，所以测试分支里的步骤时这些引用是空的。
- **错误码规则同时比对平台码和外部码**：规则写 `41017` 能命中飞书 41017；只有三位数字（如 429）才补成 `HTTP_429`，更长的数字原样比对。

## Key files
- `packages/core/execution/src/lib/workflows/actions/` — `ErrorStrategy`、`ErrorHandlingRule`、`errorHandlingUtils`
- `packages/server/engine/src/lib/helper/error-handling.ts` — 重试循环与结局判定；分支选择在 `workflow-executor.ts`
- `packages/web/src/app/builder/connector-properties/` — 「错误处理」页签与一键应用
