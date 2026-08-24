---
title: Network Agent 的数据模型先落地，隧道后做
icon: 🛰️
status: superseded by 0018-no-network-agent-self-hosting-removes-the-gap-it-bridged
---

## Decision

`network_agent` 表、`connection.networkAgentId` 绑定、以及 Agent 的 CRUD 接口现在就进主干，
但**出站隧道本身不实现**。Agent 创建后处于 `PENDING`，`lastSeenAt` 永远为 `null`，
`hostAllowlist` / `cidrAllowlist` 被存储但还没有任何东西去执行它们。

## Context

设计文档 §18 描述了 Network Agent：Agent 主动向 Server 建立出站隧道，
企业无需开放入站端口，Connection 可绑定到某个 Agent，访问范围按 CIDR / Host 白名单限制，
每次代理请求都要审计。

同一节明确写了：

> 该模块可以晚于核心 Workflow 完成，但数据模型和 ConnectionSchema 应从第一天预留。

## Why

隧道是一个独立的、体量很大的子系统（长连接协议、Agent 二进制分发、心跳与重连、
请求转发与审计）。把它整体推迟是文档自己的建议。

但**数据模型不能推迟**：`Connection` 是一等领域对象（ADR 0005），一旦有生产连接数据，
再往 `connection` 上加一个必须回填的绑定列就是一次破坏性迁移。现在加是一个可空列，
零风险；以后加要写数据迁移并协调停机。这正是 §18 说「从第一天预留」的原因。

被拒绝的替代方案是「等隧道做完再一起加表」—— 它把一次免费的 schema 变更
换成了一次带数据回填的破坏性变更，没有换来任何好处。

## Consequences

- 现在能创建 Agent 并拿到一次性 token（只在创建响应里返回，库里存 HMAC），但 Agent 无法连接。
- `status` 会一直停在 `PENDING`，直到隧道落地。UI 不应把 `PENDING` 呈现为故障。
- 白名单字段是**声明性的**：存了但不生效。在隧道落地前，不要在文档或 UI 上宣称它提供了网络隔离。
- `connection.networkAgentId` 可空且当前无人读取。绑定了 Agent 的连接仍然走普通出站路径。
