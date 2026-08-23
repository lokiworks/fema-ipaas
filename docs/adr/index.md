---
title: 架构决策记录
icon: 🧭
---

# 架构决策记录（ADR）

每份记录一个**难以回退**的架构决定。新增按序号递增，不复用序号。
已被推翻的决策不删除，改 frontmatter 的 `status: superseded by <slug>`。

| # | 决策 | 状态 |
| --- | --- | --- |
| 0001 | [FEMA Integration Platform CE 是工程底座，不是最终领域模型](0001-fork-fema-ce.md) | accepted |
| 0002 | [只有一个开源版本，不保留 Edition 分支](0002-remove-enterprise-edition.md) | accepted |
| 0003 | [Connector 概念彻底删除，统一为 Connector](0003-connector-to-connector.md) | accepted |
| 0004 | [Connector 与 Flow Component 是两类不同的节点](0004-separate-connector-and-flow-component.md) | accepted |
| 0005 | [Connection 是一等领域对象，不只是凭证](0005-connection-domain-model.md) | accepted |
| 0006 | [WorkflowVersion 锁定 ConnectorVersion，运行时不漂移到 latest](0006-workflow-version-and-connector-version-lock.md) | accepted |
| 0007 | [Runtime 保留 Worker / Sandbox / Engine，不推倒重写](0007-runtime-keeps-worker-sandbox-engine.md) | accepted |
| 0008 | [UI 按企业集成心智重建，而不是自动化工具心智](0008-ui-follows-enterprise-integration-mental-model.md) | accepted |
| 0009 | [AI Agent 与 MCP 不进入 Integration Core](0009-no-ai-agent-in-integration-core.md) | accepted |
| 0010 | [保持 MIT 并冻结上游基线](0010-license-and-upstream-notice-policy.md) | accepted |
| 0011 | [上游迁移压缩为单一基线，放弃从 FEMA Integration Platform 就地升级](0011-squash-upstream-migrations-into-one-baseline.md) | accepted |
