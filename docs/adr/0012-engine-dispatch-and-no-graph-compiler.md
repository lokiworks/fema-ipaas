---
title: 节点分发用穷尽映射表，且暂不引入 UI Graph 编译层
icon: 🧭
status: superseded by 0015-parallel-and-the-compiler-without-a-graph-persistence-rewrite
---

## Decision

针对设计文档 §15（`NodeExecutor.supports()`）与 §11（`UI Graph → compile → ExecutionPlan`），本 fork 采取：

1. **分发保留 `Record<WorkflowActionType, BaseExecutor>` 穷尽映射表**，不改写成
   `supports(node): boolean` 的谓词数组。
2. **暂不引入 `ExecutionPlan` 编译层**，Engine 继续直接消费 `WorkflowVersion.trigger`
   这棵 action 树。

两项均为待确认（`proposed`），不是既成事实。

## Context

§15 要求 Engine 不得假定所有节点都是 Piece，并给出 `NodeExecutor { supports, execute }` 作为核心接口。
§11 要求 `WorkflowVersion.graph` 存 `{ nodes, edges, settings }`，Runtime 经编译层消费，
理由是「未来更换 Flow Editor 时不会影响 Engine」。

落地时发现两处与代码现状不符：

- §15 的**意图**（按节点类型分发到 ConnectorExecutor / ComponentExecutor / TriggerExecutor）
  已由 `getExecutors()` 的映射表满足 —— 本次只是补上了缺失的 `ComponentExecutor`。
- §11 的**前提**（Runtime 直接依赖前端 React Flow 结构）在本仓库并不成立：
  持久化模型是 `WorkflowVersion.trigger` 的嵌套 action 树，`{ nodes, edges }`
  只在 `packages/web/src/app/builder/workflow-canvas/utils/` 里为渲染而派生，从不落库。

## Why

**关于 §15。** 映射表是编译期穷尽的：新增一个 `WorkflowActionType` 而忘记写 executor，
TypeScript 直接报错。`supports()` 谓词数组是 O(n) 线性扫描，无匹配时静默落空，
且丢掉穷尽性检查。为对齐伪代码而换成谓词数组，是拿类型安全去换字面一致，净亏。

**关于 §11。** 编译层要解决的解耦问题在本仓库已经解决 —— Engine 从不认识 React Flow。
此时引入 `{nodes, edges}` 持久化格式，再写编译器把它还原成 Engine 已经在消费的树，
只是加了一次有损往返和一次数据迁移。

但 §11 有一个**当下未被满足**的真实动机：graph 模型能表达任意 DAG，
而 `nextAction` 单链表表达不了 §4.3 里的 **Parallel（并行）** 组件。
若要落地 Parallel，就必须换成 graph 模型 —— 那是一次涉及持久化模型、
全部 operations（add/update/move/delete action）、builder 与 Engine 遍历的重写，
不应当夹带在 Step 4 里悄悄做。

## Consequences

- Engine 分发保持类型穷尽；新增节点类型必须显式注册 executor。
- §4.3 组件清单中的 **Parallel** 暂时无法实现，需等 graph 模型的单独决策。
- 若后续确认要做 graph 模型，本 ADR 应被标记为 `superseded by <graph-model-adr>`，
  且该迁移需要独立排期，不能作为其他 Step 的子任务。
