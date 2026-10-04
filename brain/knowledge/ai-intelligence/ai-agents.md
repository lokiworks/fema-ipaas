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
- **智能体节点里的 MCP 服务器是选出来的，不是手写的。** 选择器（`packages/web/src/features/mcp-servers/components/agent-tools-editor.tsx`）把 `mcpServers`、`allowedTools`、`confirmTools` 三个输入合成一张界面，选中服务器时写入 `{ server: <externalId>, url, authorization }`，授权引用按认证方式生成（Bearer 是 `{{connections['x'].props.token}}`，OAuth2 是 `.access_token`，无认证为空）。`server` 键只给平台用，连接器运行时忽略它；没有 `server` 键的老条目按授权里的连接引用或地址对回服务器，对不上就当手填地址。
- **`allowedTools` 为空等于允许全部，所以界面一取消勾选就把「其余工具」写成显式列表**，并且锁住最后一个勾选框，避免写出空列表反而全放开。列表生效后，手填地址的工具会被拦下（界面有提示和「允许全部工具」）。两台服务器有同名工具时，连接器把它们暴露成 `server<序号>_<名>`，界面和校验用同一套名字。
- **「需要人工确认」的判断只有一份**：`agentToolPolicy`（`packages/core/utils`）按名字拆词匹配写动词，连接器和界面共用。写动词的工具在「写操作前先问人」开着时开关锁成开；读工具打开开关就进 `confirmTools`。
- **服务器被删或连不上时，节点和发布都拦。** `agentMcpServers.inspect`（core-utils）同时给前端校验器和服务端发布校验用，报三类问题：服务器不存在或本项目不可用、服务器状态不是已连接、允许的工具在服务器上已不存在。服务器被已发布流程用着时仍然删不掉（`collectUsage`），所以「服务器没了」多出现在草稿里。
- **删除工作流时待批的智能体调用立刻失效。** `workflowService.delete` 和删除任务都会调 `agentApprovalInvalidation`，状态变 `INVALIDATED`（原因 `WORKFLOW_DELETED`），从待批列表移出；待批项建立时存工作流名称快照 `workflowDisplayName`，工作流删掉后历史还能显示名称。批准或驳回时运行已不存在（保留期清掉了运行）会关闭请求并返回可读错误，不会报「找不到执行」。没有「归档」这个概念，只有删除。
- 不要给 AI 连接器的操作加名为 `agentId` 的参数：`workflowStructureUtil` 会把它当成上游智能体引用去解析。

## Key files
- `packages/connectors/core/ai/`
- `packages/connectors/core/mcp/`
- `packages/core/utils/src/lib/mcp-wire.ts`
