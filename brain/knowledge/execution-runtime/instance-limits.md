---
title: 实例上限与项目上限
icon: 🎚️
---

# 实例上限与项目上限

设计文档 4.17 的 8 项实例级上限，全部由环境变量配置，未设置时取默认值，零配置即可用。管理后台「用量与上限」只读展示，「项目与上限」调整单个项目的上限。

**实例上限** — `instanceLimits`（`limits/instance-limits.ts`）按环境变量解析出的 8 个值，每项带来源：显式设置 / 沿用旧变量 / 默认值 / 跟随另一项。_Avoid_：套餐、配额包（ADR 0002，没有版本和付费档）

**项目上限** — `project.workflowsLimit` / `project.monthlyRunsLimit`，可空；空表示沿用实例上限（工作流 `FEMA_PROJECT_MAX_WORKFLOWS`，每月运行 `FEMA_MAX_RUNS_PER_MONTH`）。

**本月运行计数** — Redis 计数器 `run-quota:v1:<YYYY-MM>:project:<id>` 和 `…:instance`，首次读取时用当月生产运行数（不含调试）从数据库补种，再逐次 +1。

**容量告警** — 告警策略的一种触发事件 `CAPACITY`，带阈值 50/70/80/90%；同一策略对同一项目每月最多一条（`AlertRecordKind.CAPACITY`）。没有策略时只在「用量与上限」页列出达到阈值的项目。

| 项 | 变量 | 默认 | 在哪里执行 |
| --- | --- | --- | --- |
| 同时运行 | `FEMA_MAX_CONCURRENT_RUNS` | 100 | 派发时（`instanceConcurrencyInterceptor`），超出只排队不拒绝 |
| 每月运行 | `FEMA_MAX_RUNS_PER_MONTH` | 10,000,000 | `executionService.start`，超出记一条失败运行 |
| 每项目工作流 | `FEMA_PROJECT_MAX_WORKFLOWS` | 1,000 | `workflowNaming.assertCanAddWorkflows`（新建 / 导入 / 复制都经过 `workflowService.create`） |
| 单次运行节点数 | `FEMA_MAX_NODES_PER_RUN` | 40,000 | 引擎 `workflow-executor`，超出按失败终止 |
| 单次运行时长 | `FEMA_RUN_TIMEOUT`（旧：`FEMA_WORKFLOW_TIMEOUT_SECONDS`） | 600 秒 | 沙箱时长限制，未改动 |
| 单节点时长 | `FEMA_STEP_TIMEOUT` | 跟随单次运行时长 | 引擎 `connector-runner` 杀掉连接器子进程 |
| 单节点出入参 | `FEMA_MAX_STEP_PAYLOAD` | 跟随 `FEMA_MAX_EXECUTION_LOG_SIZE_MB`（50 MB） | 引擎连接器 / 代码节点 |
| 日志保留 | `FEMA_LOG_RETENTION_DAYS`（旧：`FEMA_EXECUTION_DATA_RETENTION_DAYS`） | 30 天 | 现有清理任务，未改动 |

## Gotchas
- 「同时运行」上限只有显式设置 `FEMA_MAX_CONCURRENT_RUNS` 才执行；不设时不限制，页面显示为「设置之前不限制」。默认 100 会让工作节点槽位合计超过 100 的安装升级后被限流。

- **旧变量永远优先。** `FEMA_WORKFLOW_TIMEOUT_SECONDS`、`FEMA_EXECUTION_DATA_RETENTION_DAYS` 设置了就用它；新名字只在旧的没设时生效，由 `system.ts` 的 `PROP_ALIASES` 转换，所以直接读旧 `AppSystemProp` 的十几处代码自动吃到别名。别在新代码里直接读 `RUN_TIMEOUT` / `LOG_RETENTION_DAYS`。
- **原型里的 4 小时、600 秒、4 MB 没有照搬成默认值。** 升级后不能改变已有安装的行为：运行时长仍是 600 秒；单节点时长、单节点出入参在未设置时跟随已有的上限（等于不新增限制），只有显式设置 `FEMA_STEP_TIMEOUT` / `FEMA_MAX_STEP_PAYLOAD` 才下发到引擎。
- **新建项目不再自动带「50 个工作流 / 每月 10 万次」。** 设计文档 4.3 的默认值会让升级后新建的项目突然受限，所以项目上限默认留空、沿用实例上限。
- **月度计数是按 Redis 计数的近似值。** 多个 API 实例并发启动运行时可能超出上限几次；Redis 不可用时放行运行并记警告日志，页面回退到数据库计数。月份按服务器时区划分，和项目概览的「本月运行」一致。
- **被拒绝的运行也会写一条记录**（状态失败、`failedStep.name = run_limit`），同步 Webhook 立即返回 429，不再等 30 秒超时。

## Key files

- `packages/server/api/src/app/limits` — `instanceLimits`、`runQuota`、`projectLimitsService`、`/v1/limits/*`
- `packages/server/api/src/app/workers/job-queue/interceptors` — `instanceConcurrencyInterceptor`
- `packages/server/engine/src/lib/helper` — `runLimits`
- `packages/web/src/features/limits`、`packages/web/src/app/routes/tenant/limits`
