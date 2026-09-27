---
title: MCP 服务
icon: 🔌
---

# MCP 服务

项目级，一个项目可以有多个服务。每个服务列出若干工具，每个工具对应一个已发布、以 Webhook 触发的工作流；外部助手用 `POST /v1/mcp/:serviceId` + `Authorization: Bearer <token>`（Streamable HTTP，无会话）调用。

## Gotchas
- 调用工具走 `webhookService.handleWebhook` 的同步路径，工作流里要有「返回响应」步骤，助手才拿得到数据；否则只拿到确认。
- 子流程（callable）触发的工作流不能当工具：它们通过回调地址返回结果，无法同步等待。
- Webhook 触发器配了 Basic / Header 鉴权时，平台按触发器配置自动补上请求头；HMAC 签名或鉴权值里含表达式的工作流不能当工具。
- 令牌只在创建和轮换时显示一次，库里只存 SHA-256；`tokenHint` 是末四位。
- 工作流被停用后工具仍在列表里，调用返回 `isError`，提示先启用工作流。

## Key files
- `packages/server/api/src/app/mcp-service/` — `mcpEndpointController`、`mcpServiceService`
- `packages/web/src/features/mcp-services/`
