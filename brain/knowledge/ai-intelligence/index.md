---
icon: 🧠
---

# AI 与 MCP

AI 是连接器的消费层，不是集成核心的一部分（ADR 0019，取代 ADR 0009 的「不做」部分）。模型和外部 MCP 服务器都是普通连接器，平台自己不保存模型密钥。

**模型连接** —— `@fema-ipaas/connector-ai` 的一个连接（服务商、API Key、模型、可选 Base URL）。所有 AI 功能都用项目里的模型连接。_Avoid_：「AI Provider」「AI 服务商配置」（上游概念，已删除）
**MCP 服务器连接** —— `@fema-ipaas/connector-mcp` 的一个连接，指向一台外部 MCP 服务器（Streamable HTTP 或 SSE）；它的工具在工作流里当操作用，见 *外部 MCP 服务器*。
**AI 智能体** —— AI 连接器的 `run_agent` 操作：在步数上限内调用列出的 MCP 工具。_Avoid_：「Agent 节点」「智能体实体」（没有独立的智能体表）
**MCP 服务** —— 把连接器操作和已发布的子流程工作流开放成 MCP 工具，给 Claude、Cursor 等助手调用，每个成员用自己的 API Key。_Avoid_：「MCP Server」单指这一侧时容易和外部服务器混淆
**AI 用量** —— 每次模型调用一行，按功能、模型、工作流汇总 Token。

## Pages
- [模型连接](ai-providers.md)
- [AI 连接器与智能体](ai-agents.md)
- [MCP 服务](mcp-server.md)
- [外部 MCP 服务器](external-mcp-servers.md)
- [生成工作流、编辑器助手与用量](ai-mcp.md)
