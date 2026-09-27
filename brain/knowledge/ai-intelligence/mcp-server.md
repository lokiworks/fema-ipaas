---
title: MCP 服务
icon: 🔌
---

# MCP 服务

把连接器操作和已发布的子流程工作流打包成 MCP 服务，给 Claude Code、Cursor 等助手调用。服务属于一个项目（工具只能来自这个项目的工作流，连接器操作在这个项目里执行），列表按租户展示：我开发的、我所在项目的、我获取的、企业 MCP 市场里对我开放的。

**服务唯一标识** —— `key`，小写字母开头、≤ 40、全局唯一、创建后不改，服务地址是 `/api/mcp/{key}`。老服务没有 key，仍走 `/api/v1/mcp/:id`。
**个人 API Key** —— `mcp_sk_` + 14 位，每个成员（所有者自动、其他人「获取」时）一把，存 SHA-256 做查找、加密原文供本人复制。Key 标识调用者，所以才有「客户端上下文」和按人的连接。_Avoid_：「服务 Token」（旧的服务级 Token 只剩老服务在用）
**草稿与发布** —— 编辑改的是 `tools`；发布做问题检查，把工具快照到 `publishedTools`，版本号 1.0、1.1… 自动递增。端点只对外提供已发布且未暂停的工具。
**入参取值模式** —— AI 推断（进 `inputSchema`，可带提示）/ 固定值 / 引用其他参数（`{{name}}`）/ 客户端上下文（调用者邮箱、ID、姓名、`initialize` 里的客户端名）。
**连接模式** —— 开发者固定连接（所有者选、必须分享给所有者且在服务项目可用）/ 服务使用者配置 / 用户首次调用时授权（成员在服务页选自己拥有的连接）。

## Gotchas
- **子流程工具是同步等回调。** 端点用 `webhookService.handleWebhook` 异步触发子流程，并把 `/v1/mcp-callbacks/:serverId/:requestId?token=` 作为 `callbackUrl` 传进去；子流程里的「Return Response」回调后经 `engineResponseWatcher` 的 pubsub 回到等待的那台 API，token 只在内存里比对。110 秒没回应就告诉助手「已启动但没返回」，不要自动重试。
- **Webhook 工作流工具保留兼容**：走同步 Webhook 路径，要有「返回响应」步骤；HMAC 签名或鉴权值含表达式的不能当工具。
- **连接器操作工具走单操作执行（`actionRunService`，EXECUTE_ACTION），不创建运行记录**；超时要区分「没开始」和「可能已执行」，见 action runs 的 `neverStarted`。
- **「由服务使用者配置」「首次调用授权」只对服务项目的成员真正可用。** 连接必须在服务所在项目可用，而普通成员只能把连接加到自己所在的项目；非成员调用时只会收到「去服务页选连接」的提示。
- 没有部门数据，可用范围只有「全员 / 指定成员」。平台没有「平台官方」服务，类型一律是企业自定义。
- 调用次数按天累计在 `mcp_service_usage`（每服务每天一行，`ON CONFLICT` 加一），卡片上的「近 7 天调用」由它求和。
- 管理接口要求「MCP 服务」模块权限（`tenantModuleGuard`），端点本身是公开路由，只认 Bearer Key。

## Key files
- `packages/server/api/src/app/mcp-service/` — `mcpServiceService`（管理与鉴权）、`mcpToolExecutor`（执行三种来源）、`mcpToolModel`（参数、inputSchema、问题检查，纯函数）、`mcpToolSources`（候选工作流、连接器参数）、端点与回调控制器
- `packages/server/api/src/app/action-run/` — `actionRunService.runConnectorAction`
- `packages/core/shared/src/lib/automation/mcp-service/mcp-service.ts`
- `packages/web/src/features/mcp-services/`
