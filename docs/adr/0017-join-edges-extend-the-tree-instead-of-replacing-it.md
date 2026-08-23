---
title: 用 join edge 扩展 action 树，而不是换成 graph 持久化
icon: 🔗
status: accepted
---

## Decision

`WorkflowVersion` 新增可空的 `graph` 列，只存**树表达不了的那部分**：join edge
（`{ from, to }`）—— 一个步骤要等两条互不相关路径上的步骤都完成。

action 树**仍然是编辑模型**，全部既有 operation 不变。Compiler 把 join edge 合并进
`ExecutionPlan.dependencies`；Engine 在执行一个节点前检查其依赖是否全部完成，未完成则停下，
由最后到达的那条路径接手。

本 ADR 取代 [0015](0015-parallel-and-the-compiler-without-a-graph-persistence-rewrite.md)
中「任意再汇合的 DAG 不支持」的结论。

## Context

§11 要求 `WorkflowVersion.graph` 存 `{ nodes, edges, settings }`。
0015 交付了 Parallel（fan-out + join）和 compiler，但明确留下：任意再汇合仍不支持，
因为 `nextAction` 单链表表达不了「C 同时依赖 A 和 B，而 A、B 在不相关路径上」。

补上这一条有两条路：把持久化整个换成 nodes+edges，或者只补树缺的那部分。

## Why

**只存差集。** 树能表达顺序、分支、循环、fan-out —— 也就是绝大多数工作流的全部形状。
它唯一表达不了的是再汇合。把整个模型换掉，等于为了 5% 的表达力重写 100% 的持久化、
全部 operation、builder 与一次数据迁移，并让每一个既有工作流都要经过转换。
只存 join edge 则是一个可空列：既有工作流的 `graph` 为 `null`，行为逐字节不变，没有迁移风险。

**Engine 不需要改遍历方式。** 因为 [ADR 0016 之前那步](0015-parallel-and-the-compiler-without-a-graph-persistence-rewrite.md)
已经把遍历切到 plan 上，join edge 只是让 compiler 多产出几条 `dependencies`，
Engine 多一个「依赖是否齐了」的判断。如果遍历还在读 `nextAction`，这一步会危险得多。

被拒绝的替代方案是「graph 成为唯一真相」：它要求树↔图双向无损转换，而两者表达力不对等 ——
图能表达的树表达不了，于是转换只能单向可靠，builder 与 operations 会长期活在两个模型之间。

## Consequences

- `graph` 为 `null` 的工作流（即当前全部工作流）行为完全不变，无需迁移。
- join edge 在保存时就过滤：两端必须都是现存步骤，且不能自环。否则删掉一个步骤会留下
  一条指向不存在名字的依赖，Engine 会永远等它。
- 依赖数 ≤ 1 时直接放行，不做检查 —— 这是绝大多数节点，避免为极少数情况给所有节点加开销。
- Trigger 不参与等待：它没有自己的步骤输出，`hasCompleted` 永远为假，会造成死等。
- 仍未做：**UI 里还不能画 join edge**。`SET_JOIN_EDGES` operation 和执行语义都在，
  但 builder 画布没有连线交互。经 API 设置的 join edge 会被正确执行。
