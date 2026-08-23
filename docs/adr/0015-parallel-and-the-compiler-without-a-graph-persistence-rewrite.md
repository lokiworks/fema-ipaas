---
title: Parallel 与编译层落地，但持久化仍是 action 树
icon: 🔀
status: superseded by 0017-join-edges-extend-the-tree-instead-of-replacing-it
---

## Decision

补上 §11 的编译层与 §4.3 的 Parallel 组件，但**不**把 `WorkflowVersion` 的持久化换成 `{ nodes, edges }`：

1. `workflowCompiler.compile(workflowVersion) → ExecutionPlan`（`entry` / `nodes` / `dependencies`），
   作为「树」与「Engine 认知」之间的显式边界。
2. `WorkflowActionType.PARALLEL` 落地为一等 action：N 条分支并发执行，全部结束后汇合，
   再走 `nextAction`。

本 ADR 取代 [0012](0012-engine-dispatch-and-no-graph-compiler.md)，该 ADR 曾以「前提不成立」为由推迟这两项。

## Context

0012 的判断是：§11 编译层要解决的解耦问题在本仓库已经成立（Engine 消费 action 树，
React Flow 图只在前端派生），所以编译层是纯开销；而 §11 真正未被满足的动机是
Parallel —— `nextAction` 单链表表达不了 DAG。

重新审视后，第二个判断是错的：**Parallel 是 fan-out + join，不是任意 DAG**。
「同时跑这几条分支，全部完成后继续」这个形状，和 Router 的 `children` 数组同构 ——
树完全能表达。树表达不了的是任意再汇合（节点 C 同时依赖两条互不相关路径上的 A 和 B），
而 §4.3 的 Parallel 不要求那个。

## Why

把 Parallel 建在树上，用一个并发执行 + 合并的 executor，直接交付了 §4.3 要的能力，
代价是一个新 action type，而不是一次涉及持久化模型、全部 operations、builder 与
引擎遍历的重写，外加一次数据迁移。

编译层照做，但目的变了：它现在不是为 Parallel 服务，而是**把 Engine 与树形状隔开**。
以后若真要换成 `{nodes, edges}` 持久化，是再写一个 compiler，而不是动 Engine ——
这正是 §11 写「换 Flow Editor 时不影响 Engine」的本意。

被拒绝的替代方案是「先把持久化换成 graph 再做 Parallel」：它把一个可以现在交付的能力，
押在一次破坏性迁移之后，且那次迁移的唯一驱动力本来就是这个能力。

## Consequences

- Parallel 可用：分支并发、失败快速终止、暂停可恢复。
- 分支内的暂停必须让 Parallel 步骤本身标记为 `PAUSED`：`isCompleted()` 把非 PAUSED 一律
  视为已完成，若标成 SUCCEEDED，恢复时会整个跳过该节点、把等待中的分支永久搁置。
- 合并分支结果时按**对象引用**判断而非「是否存在」：各分支从同一 base 出发，未触碰的步骤
  引用相同；只看存在与否会丢掉分支刚从 PAUSED 改成 SUCCEEDED 的那一步。
- 持久化仍是 action 树。任意再汇合的 DAG 仍不支持，需要时再单独决策。
- `ExecutionPlan` 目前由 compiler 产出并有测试覆盖，但 Engine 的遍历仍直接走树。
  把遍历切到 plan 上是下一步，切换时 Engine 不需要知道树。
