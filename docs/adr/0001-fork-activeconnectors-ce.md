---
title: FEMA Integration Platform CE 是工程底座，不是最终领域模型
icon: 🧱
status: accepted
---

## Decision

以 FEMA Integration Platform Community Edition v0.88.3 为工程底座 fork，保留其执行引擎、Worker、
Sandbox、队列、画布和连接扩展机制；但不继承其领域语言、信息架构和产品边界。基线冻结
记录在 `UPSTREAM.md`，从冻结时刻起不再跟随上游 main。

## Context

目标是一个面向企业系统集成的开源 iPaaS。从零实现一套可靠的工作流运行时（作业队列、
Worker 调度、Run 生命周期、Sandbox 隔离、超时、Webhook 入队、定时任务、动态包加载）
是数人年的工作量，且这些能力在 FEMA Integration Platform 中已经过生产验证。

## Why

真正的差异化在 Connector 抽象、连接治理、运行治理和企业信息架构，不在队列和沙箱。
把工程预算投在重写 Runtime 上，会在没有产品差异的地方消耗掉全部时间。

考虑过但否决的替代方案：

- **从零重写**——差异化收益为零，风险极高。
- **作为上游插件/主题长期跟随 main**——领域模型无法独立化，每次上游改动都要重新适配，
  且 §47 的「用户不应能判断这是换皮」判定标准永远无法达成。

## Consequences

- 初期代码中会长期存在上游遗留命名，必须靠 ADR 0003 的重命名工程消除，而不是靠约定。
- 上游安全修复只能 cherry-pick，需要人工判断适用性；`UPSTREAM.md` 规定了流程。
- 上游 EE 目录属于商业许可，必须完整删除且不得复制片段（见 ADR 0002、0010）。
