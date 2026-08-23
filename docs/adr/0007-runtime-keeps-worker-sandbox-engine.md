---
title: Runtime 保留 Worker / Sandbox / Engine，不推倒重写
icon: ⚙️
status: accepted
---

## Decision

继续使用 Fastify + PostgreSQL + Redis/BullMQ + Worker + Sandbox + Engine 这套运行时。
本轮二开只做**解耦**（引入 ExecutionPlan 与 NodeExecutor 分发，见 ADR 0004），
不替换任何基础组件。

同时引入编译层，让 Runtime 不直接依赖前端画布数据结构：

```
UI Graph → compile → ExecutionPlan → Engine
```

## Context

设计文档 §14 列出的能力——作业队列、Worker 调度、Run 生命周期、Sandbox 隔离、超时、
日志、Webhook 入队、定时任务、动态包加载——是上游最有价值的成熟资产。

## Why

同时改领域模型和运行时，会让任何一个线上问题都无法定位到底是新领域模型的 bug
还是新运行时的 bug。先把产品和领域改对，运行时的替换（如果将来需要）留到有真实
性能或架构瓶颈时再做，那时也已经有 ExecutionPlan 这层隔离。

考虑过**顺手把执行引擎换成 DAG 调度器**。否决：属于没有需求驱动的重写，且会把
Step 4 的关键架构改动埋在一堆无关变更里。

## Consequences

- 短期内 Engine 内部仍会有上游遗留结构，靠 ADR 0003 的重命名收敛。
- ExecutionPlan 是新增的一层，需要保证 UI Graph 的所有语义都能编译过去，
  否则会出现「画布上能画、但跑不了」的形态。
- 将来更换 Flow Editor 不影响 Engine。
