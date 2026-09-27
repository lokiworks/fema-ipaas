---
title: AI 连接器与智能体
icon: 🤖
---

# AI 连接器与智能体

AI 连接器有两个操作：**询问模型**（`ask_model`，单次调用，可要求 JSON 输出）和 **AI 智能体**（`run_agent`）。智能体接一个或多个 MCP 服务器，在 `maxSteps` 内循环「模型 → 工具 → 模型」，返回答案和每一步的工具调用记录。

## Gotchas
- **人工确认**：`confirmWrites` 默认开，工具名按单词拆开后含 create / send / update / delete 等动词就先暂停；`confirmTools` 里的工具总是要确认。暂停时连接器建等待点、把智能体状态存进 `store`（`agent-state:<runId>:<stepName>`，超过 400KB 会截短旧的工具结果），再调 `POST /v1/worker/agent-approvals` 登记；审批人是工作流所有者和项目所有者。
- 批准 / 拒绝走 `POST /v1/agent-approvals/:id/decide`，服务端用 `resumeService.resumeFromWaitpoint` 恢复运行，恢复载荷是 `AgentApprovalDecision`；公开的等待点恢复地址不交给用户。超时由每分钟的 `AGENT_APPROVAL_EXPIRY` 自动拒绝。
- 用量按段上报：暂停前报一次，恢复后只报新增部分（状态里记着 `reportedUsage`）。
- 护栏：`allowedTools` 非空时只把这些工具交给模型；模型点名别的工具会得到错误结果而不是被执行。步数用完时返回 `stoppedEarly: true`，不算失败。
- 智能体的 MCP 鉴权可以写成连接引用，例如 `{{connections['my-mcp'].props.token}}`，避免把令牌明文写进步骤。
- 用量由连接器调用 `POST /v1/worker/ai-usage` 上报（引擎令牌鉴权），上报失败不影响步骤结果。
- 不要给 AI 连接器的操作加名为 `agentId` 的参数：`workflowStructureUtil` 会把它当成上游智能体引用去解析。

## Key files
- `packages/connectors/core/ai/`
- `packages/connectors/core/mcp/`
- `packages/core/utils/src/lib/mcp-wire.ts`
