---
icon: ⚡
---

# Triggers

Triggers define how and when a workflow starts. The module handles registration, event capture, testing, and deduplication, tracking each enabled trigger as a `TriggerSource` record and driving enable/disable side effects (BullMQ scheduling, external webhook registration).

### Entities & services
- **TriggerStrategy** — `POLLING`, `WEBHOOK`, `APP_WEBHOOK`, `MANUAL`.
- **TriggerSource** — persisted link between a workflow version and its registered trigger; soft-deleted on disable; unique per `(projectId, workflowId, simulate)`.
- **TriggerEvent** — a captured payload stored as a File ref; used for test-data selection in the builder. `sourceName` format: `connectorName@version:triggerName`.
- **AppEventRouting** — routing table for APP_WEBHOOK: maps `(appName, event, identifierValue)` to a workflow.
- Services: `workflow-trigger-side-effect.ts`, `trigger-source-service.ts`, `dedupe-service.ts`, `test-trigger-service.ts`.

### How it works
- **Strategies**: POLLING = cron via BullMQ repeating job + Redis dedupe. WEBHOOK = external service pushes to a FEMA webhook URL. APP_WEBHOOK = app-native events routed via AppEventRouting (Slack, GitHub). MANUAL = user-triggered only.
- **On enable**: POLLING creates the repeating job — the connector's `setSchedule` supplies either a cron (`CRON_EXPRESSION`) or a rolling interval (`INTERVAL` → BullMQ `every`); when the connector sets nothing the default is a rolling interval of `FEMA_TRIGGER_DEFAULT_POLL_INTERVAL` minutes (default 5). WEBHOOK submits ON_ENABLE hook (+ renewal job if the connector needs periodic re-registration); APP_WEBHOOK creates routing records.
- **On disable**: removes repeating jobs, submits ON_DISABLE hook (unregister), deletes routing records.
- **Testing** (`testTriggerService`, distributed-locked): `SIMULATION` creates a `simulate=true` source and collects events; `TEST_FUNCTION` submits a TEST hook and saves outputs as TriggerEvents.

### Gotchas
- **Deduplication** (polling): extracts `__DEDUPE_KEY_PROPERTY`, Redis INCR with 30s TTL — first passes, duplicates filtered; the dedupe key is stripped from returned payloads.
- **Republish preserves the polling checkpoint** (`isRepublish`): republishing a running workflow does `onDisable(old) → onEnable(new)`, which used to reset `lastPoll`/`lastItem` to now and silently drop events created in between. `workflowService.update` sets `isRepublish=true` only for a `LOCK_AND_PUBLISH` of an already-`ENABLED` workflow whose trigger is unchanged — same connector, same trigger name, **and deep-equal `settings.input`** (`workflowPublishUtils.isSameTrigger`); the flag is threaded through the ON_ENABLE job → `ExecuteTriggerOperation` → trigger context (`context.isRepublish`), and `pollingHelper.onEnable` then keeps the existing checkpoint. A fresh enable, a manual off→on toggle, a trigger swap, and any change to the trigger's props all still reset to now. The props check is not cosmetic: a checkpoint kept across a props change points at a resource that is no longer being polled, and `pollingHelper.poll` treats a `LAST_ITEM` id it cannot find in the fetched page (`findIndex → -1`) the same as "no checkpoint", emitting **every** item. Custom polling triggers that don't use `pollingHelper` can opt in by reading `context.isRepublish`.
- The **simulate flag** lets a production source and a test source coexist independently.
- **触发器运行设置（去重 / 并发 / 定时）只在 worker RPC `submitPayloads` 生效**：异步 Webhook、轮询、定时都走这里（`triggerRunPolicy.startRuns`）；同步 Webhook（`/sync`）、手动触发、重跑直接调 `executionService.start`，不去重也不受并发限制。
- **可配置去重的标记在 Redis、记录在 Postgres**：`SET workflow-dedupe:v2:{workflowId}:{sha256(键值)} NX EX 窗口`，值先是 `pending`，启动运行后用 Lua 保留 TTL 改写成首个运行 ID；被拦下的事件各写一行 `deduped_event`（键值预览、首个运行 ID），给「最近 7 天拦截了 N 个」和运行日志的「已去重」页签用。键按 `workflowId` 而非版本，发布新版本后继承。旧格式键 `workflow-dedupe:{workflowId}:{值}` 仍被当作已存在，窗口过后自然消失。Redis 丢数据（非持久化部署）会让窗口内的重复事件再跑一次。
- **并发上限和保序键靠 job 拦截器，不是 BullMQ group**：`submitPayloads` 把 `{ maxConcurrentRuns, orderKey, enqueuedAt }` 放进 `ExecuteWorkflowJobData.concurrency`；`addToQueue` 先把 job 按 `enqueuedAt` 写进 `workflow-concurrency:v1:{wf}:order:{hash}` 有序集合，`workflowConcurrencyInterceptor` 在出队时（按工作流加分布式锁）只放行队头且活跃数未满的 job，其余 `REJECT` 3 秒后再试，所以排队的运行不会丢。槽位按 job 计：运行暂停（延迟、等待回调、人工确认）时 job 结束、槽位释放，同一保序键的下一条可能先于它恢复。队头 job 已不存在时会被跳过，防止卡死。
- **定时的「上一次未跑完」与节假日在 `submitPayloads` 判断**：`scheduleOverlap` 缺省按 PARALLEL（老工作流行为不变），新建定时触发器在前端默认写入 SKIP；SKIP 查 24 小时内该工作流生产环境 QUEUED/RUNNING/PAUSED 的运行，QUEUE 等价于并发上限 1。`skipHolidays` 读租户的 `holiday_calendar`（管理员导入，默认空），按触发器 `timezone` 取当天日期；日历为空时开关不生效。`every_x_minutes` 用 BullMQ `every`，前端预览只是从现在起按间隔推算。
- **Renewal jobs** re-register expiring webhook connectors via the ON_RENEW hook.
- **`*/X` cron is not "every X minutes"** — it means "minutes divisible by X", so it double-fires at :00 and :X for X > 30 and gaps unevenly when X doesn't divide 60. Use `INTERVAL`/`intervalMs` for a rolling interval; reserve cron for wall-clock schedules. This bit the default poll schedule until GIT-1632.
- **Trigger health** (`triggerRunStats`): Redis key `trigger_run:{platformId}:{connectorName}:{date}:{status}`, 14-day retention, shown in Platform Admin (Cloud).

### Editions
All four strategies available in CE/EE/Cloud. Cloud additionally surfaces trigger health stats in Platform Admin.

### Key files
Entry point: `workflowTriggerSideEffect`, exported from `trigger-source/workflow-trigger-side-effect.ts` and called by `trigger-source-service.ts` on enable and disable.

- `packages/server/api/src/app/trigger/trigger-source/` — TriggerSource CRUD, entity, and the enable/disable side effects per strategy
- `packages/server/api/src/app/trigger/trigger-events/` — TriggerEvent storage, entity, and endpoints
- `packages/server/api/src/app/trigger/test-trigger/` — simulation and test-function modes, plus their endpoints
- `packages/server/api/src/app/trigger/app-event-routing/` — APP_WEBHOOK routing table and entity
- `packages/server/api/src/app/trigger/trigger-run/` — per-platform trigger health tracking and stats endpoints
- `packages/server/api/src/app/trigger/dedupe-service.ts` — Redis-based deduplication for polling
- `packages/server/api/src/app/trigger/trigger-run-policy.ts` — `triggerRunPolicy.startRuns`：定时跳过、可配置去重、并发票据
- `packages/server/api/src/app/trigger/deduped-event/`、`packages/server/api/src/app/trigger/holiday-calendar/` — 已去重记录、租户节假日日历
- `packages/server/api/src/app/workers/job-queue/interceptors/` — `workflowConcurrencyInterceptor`（并发上限与保序键）
- `packages/core/execution/src/lib/workflows/triggers/` — `triggerRunSettingsUtils`、`scheduleUtils`（5 段 Cron 校验、下次触发时间）
- `packages/web/src/app/builder/step-settings/connector-settings/` — 触发器「运行设置」页签
- `packages/server/api/src/app/trigger/trigger.module.ts` — module registration
- `packages/core/shared/src/lib/automation/trigger/` — TriggerSource schema, TriggerStrategy enum, handshake and schedule options
- `packages/web/src/app/builder/test-step/` — builder test panel, event selector, and the manual webhook test dialog
- `packages/web/src/app/builder/workflow-canvas/` — trigger node widget and the add-trigger button above it

Paths verified 2026-07-17.
