---
title: 调试运行把当时的草稿存成文件快照，不新建版本
icon: 📸
status: accepted
---

## Decision

整条调试、单步测试和草稿上的手动触发启动时，如果跑的是 DRAFT 版本，`runWorkflowSnapshot.capture` 把这个版本整体 zstd 压缩存成一条 `RUN_WORKFLOW_SNAPSHOT` 文件，运行行上记 `execution.workflowSnapshotFileId`。回看运行走 `GET /v1/executions/:id/workflow`：有快照就用快照里的结构，没有（已发布版本、旧运行、文件过期）就按 `workflowVersionId` 读当前版本。

## Context

调试运行引用的是同一个、不断被编辑的草稿行。改完流程再打开上一次调试，画布按现在的结构画：节点序号对不上，还多出当时不存在的节点标「未执行」。LOCKED 版本不可变，没有这个问题，所以只给草稿存。

## Why

否决了「启动调试时把草稿固化成一个不可变的 workflow_version 行」：「最新版本」靠 `ORDER BY created DESC` 不看状态（见 workflows 页 Gotchas），多一行就会被编辑器当成草稿打开；样例数据、调试验证、版本列表、发布对比也都按版本 id 关联，全要改。也否决了运行行上直接放 JSONB：执行行在保留期后不删，只删日志文件，快照会永远留在大表里。存成文件则跟 `EXECUTION_LOG` 走同一个 `deleteStaleBulk` 清理，S3 可用时落 S3。

## Consequences

- 快照只在启动请求里写一次、按运行 id 读，没有共享可变状态，多服务器下不需要锁。写失败只记 warn，运行照常进行，回看退回当前版本。
- worker 仍按 `workflowVersionId` 在任务开始时取草稿，启动请求和 worker 取数之间极短的窗口里如果有人改了草稿，快照和实际执行可能差一点；调试期间编辑器是只读的，实际碰不到。
- 快照按存入时的 schemaVersion 保存，读时如果落后就在内存里跑 `workflowMigrations.apply`，不回写。
- 从失败节点原地重跑调试运行沿用原快照，重跑的后半段其实执行的是当时的草稿。
