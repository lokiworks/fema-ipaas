---
title: AI Agent 与 MCP 不进入 Integration Core
icon: 🚧
status: accepted
---

## Decision

从核心中删除 Agents、Agent Builder、AI Provider Management、AI Chat、Agent Eval、
AI 专属 UI，以及上游当前的 MCP Server 产品能力和 MCP 专属 UI。

保留一个未来接口位 `ConnectorToolAdapter`，将来可以把 Connector Action 适配成
MCP Tool，但该适配器是 Connector 的**消费者**，不是 Connector Domain 的一部分。

正确的依赖方向：

```
Connector ──┬── Workflow
            ├── Direct API
            └── Tool Adapter → MCP Tool → Agent
```

## Context

上游正在向 AI-first 自动化平台演进，Agent 已经成为 Workflow 的基础概念之一。

## Why

一旦 Agent 成为 Workflow Core 的基础概念，Connector 就会被建模成「Agent 的工具」，
而不是「企业能力的抽象」。这会让 Connector 的输入输出 schema 向 LLM 友好的方向倾斜
（自然语言描述优先、宽松类型），损害它作为集成资产在确定性场景下的可用性。

考虑过**保留 AI 能力但标为可选模块**。否决：它当前是深度耦合的，不是可拆的模块；
且保留会持续吸引产品需求往 AI 方向走，稀释集成平台的定位（这是本决策真正要防的东西）。

## Consequences

- 短期内产品能力少于上游，没有 AI 节点。
- 将来接 AI 是加一层 adapter，不需要改 Connector Domain——这正是本决策买到的东西。
- LLM 类连接器（如果需要）以普通 Connector 形式存在，与 SAP、MySQL 同级。
