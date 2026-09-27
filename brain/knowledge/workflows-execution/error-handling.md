---
icon: 🧯
---

# 节点错误处理

应用、代码节点出错后怎么办：默认策略加按错误码匹配的自定义策略，从上往下命中即停。

**策略** — 终止 / 忽略 / 添加分支，以及三者的「重试后」版本；重试次数 1/2/3/5（默认 3）、间隔 5/10/30/60 秒（默认 10）。存在 `errorHandlingOptions.strategy`，自定义规则在 `rules`。
**错误码** — `errorHandlingUtils.classifyErrorMessage` 给出，与问题中心同一套：`HTTP_<状态>`、`STEP_TIMEOUT`、`STEP_FAILED`、`CONNECTION_EXPIRED` 等。规则里只写数字（429）按 `HTTP_429` 处理。
**异常处理分支** — 复用 `continueOnFailureBranches`（`onSuccess` / `onFailure`），分支跑完后继续走 `nextAction`。

## Gotchas
- **没有 `strategy` 字段就走老逻辑**：`continueOnFailure` / `retryOnFailure` 两个开关照旧生效（重试 4 次、2 秒起指数退避），老工作流行为不变。一旦写入 `strategy`，引擎只看新字段；前端保存时同步写 `continueOnFailure.value = usesBranches(...)`，画布和老代码据此显示分支。
- **画布是否显示分支看 `errorHandlingUtils.usesBranches`**：默认策略或任一规则是「分支」类就显示。引擎在规则解析为「忽略」时走 `onSuccess` 分支，只有解析为「分支」时才走 `onFailure`。
- **错误码按最后一次失败计算**：每次重试后重新匹配规则，重试次数取命中规则的设置；单步测试（`stepNameToTest`）不重试也不继续。
- **AI 节点默认「重试后终止」只对新建节点生效**：默认值在前端 `connector-selector-utils` 创建节点时写入，已有节点没有 `strategy`，保持原样。
- **HTTP 状态优先取连接器友好错误里的 `status`**：以前问题中心只在文案里找 3 位数字，「Route not found」这类 404 会被归为 `STEP_FAILED`；现在归为 `HTTP_404`，问题签名会随之变化。

## Key files
- `packages/core/execution/src/lib/workflows/actions/` — `ErrorStrategy`、`ErrorHandlingRule`、`errorHandlingUtils`
- `packages/server/engine/src/lib/helper/error-handling.ts` — 重试循环与结局判定；分支选择在 `workflow-executor.ts`
- `packages/web/src/app/builder/connector-properties/` — 「错误处理」页签与一键应用
