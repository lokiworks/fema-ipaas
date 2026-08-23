---
title: Connector 与 Flow Component 是两类不同的节点
icon: 🧩
status: accepted
---

## Decision

把上游的 Piece 拆成两个互不隶属的概念：

- **Connector** —— 对一个外部系统、协议或技术服务的封装（飞书、SAP、MySQL、Kafka、HTTP）。
- **Flow Component** —— 平台自己的流程逻辑节点，不代表任何外部系统
  （Branch、Switch、Loop、Parallel、Subflow、Mapper、Filter、Delay、Retry、Code、Stop）。

Engine 不再假定所有节点都是 Piece，而是通过 `NodeExecutor` 接口分发到
`ConnectorNodeExecutor` / `ComponentNodeExecutor` / `SubflowNodeExecutor`。

硬约束：Branch、Loop、Code、Delay **不得**实现为 Connector。

## Context

上游把流程控制（分支、循环、延迟、代码）和外部系统能力都塞进同一个 Piece 抽象里，
`packages/pieces/core/` 下混着 `delay`、`approval`、`subflows` 和 `http`、`sftp`、`smtp`。

## Why

两者的生命周期完全不同。Connector 有版本、有连接配置、有认证、可以由第三方开发和发布、
需要 Registry 治理；Flow Component 是平台语义的一部分，随平台版本走，没有连接、
不该被第三方替换。用同一个抽象承载会导致：连接器市场里出现「循环」这种条目，
版本锁定机制被迫适用于流程控制节点，节点选择器无法给业务用户一个清晰的分类。

考虑过**保留单一抽象、靠 category 标记区分**。否决：category 是展示层的软约定，
挡不住新功能继续按 Piece 建模，而运行时仍然只有一条执行路径。

## Consequences

- 这是整个二开中最关键、也最容易出错的架构改动，必须在 UI 重建（ADR 0008）之前完成。
- 节点选择器天然分成「连接器」与「核心组件」两栏，与飞书 AnyCross 心智一致。
- 现有 `pieces/core/*` 中的流程类包要拆出来，落到 `components/` 而不是 `connectors/`。
