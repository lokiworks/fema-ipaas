---
icon: 🚦
---

# 测试与生产环境

项目默认只有生产环境，发布即上线。打开「测试与生产」（`project.releasesEnabled`）后，改动先**发布到测试**，验证后**推广到生产**，推广可以要求审批。

**测试部署** —— `workflow.testVersionId`：锁定当前草稿得到的版本，测试环境只跑它。_Avoid_：「测试版」「预发布」
**推广** —— 把测试部署的版本通过发布申请上线到生产；没有审批人时立即上线。_Avoid_：「发布」（发布只指单环境下直接上线或发布到测试）
**发布申请** —— 一次推广的记录，待审批 → 已上线 / 已驳回 / 已撤回。
**回滚** —— 把历史版本内容复制成草稿再发布，生成新版本号；自动撤回该工作流的待审批推广，不需要审批。
**测试环境运行** —— `RunEnvironment.TESTING`：变量用测试值，连接按「连接替换」换成测试账号；入口是编辑器调试和 `/v1/webhooks/:id/test-env[/sync]`。

## Gotchas
- 双环境下服务端拒绝直接 `LOCK_AND_PUBLISH`（`assertCanPublishDirectly`），上线只能走推广或回滚。审批通过时服务内部带 `versionId` 调 `LOCK_AND_PUBLISH`，不经过这道闸。
- `releaseApproverIds` 为空表示推广不需要审批，不再回落到项目所有者。审批人只能是所有者或 Admin / Developer 成员。
- 测试环境只有 Webhook 入口；定时和轮询触发器只在生产运行。测试 Webhook 在生产停用时也能用。
- 发布到测试后要让 `workflowExecutionCache` 失效，否则测试 Webhook 读到旧的 `testVersionId`。
- 关闭双环境会清空所有测试部署和连接替换；有待审批申请时不能关闭。
- 引擎令牌带 `environment` 声明；worker 取变量和连接时据此换成测试值或替换连接。

## Key files
- `packages/server/api/src/app/release/` — `workflowReleaseService`（`deployToTest`、`create`、`rollback`、`updateEnvironmentSettings`、`overview`）、`connectionReplacementService`
- `packages/server/api/src/app/webhooks/` — `WebhookWorkflowVersionToRun.TEST_DEPLOYMENT`
- `packages/web/src/features/releases/`、`packages/web/src/app/routes/releases/`
