---
title: 上游迁移压缩为单一基线，放弃从 FEMA Integration Platform 就地升级
icon: 🗜️
status: accepted
---

## Decision

删除上游全部 536 个迁移文件（`migration/postgres` 368 + `migration/common` 26 +
`migration/sqlite` 142），用一个从实体生成的基线迁移取代，覆盖当前 20 张表。
同时删除 flow-version 的 23 个历史 JSON 迁移，fork 基线直接从
`LATEST_FLOW_SCHEMA_VERSION` 起步。

**后果是明确的：不存在从任何 FEMA Integration Platform 实例就地升级到本平台的路径。**
新部署从空库开始。

同时确定 PostgreSQL 是唯一后端：无引用的 sqlite 连接删除，pglite（零配置开发库）
复用 postgres 的迁移列表。

## Context

上游迁移里大量带有 `isNotOneOfTheseEditions([ApEdition.CLOUD, ...])` 这类版本门，
是 Step 1「代码中不允许出现 Edition 判断」的最大残留来源。而且 Step 3 会把
project → workspace、flow → workflow、app_connection → connection 等表全部改名，
这些历史迁移届时会全部失效。

## Why

保留它们要付出三重代价：Edition 概念无法真正清除；每次领域重命名都要同时维护一条
早已没有实例会执行的历史链；368 个文件的 CI 与阅读负担。

考虑过**保留迁移链、只删除其中的 edition 分支**。否决：那条链的唯一价值是让老实例
能升级上来，而本项目按 ADR 0001 是重建领域模型的独立产品，用户心智、表名、API 路径
都不同，"就地升级" 本来就不成立——付出的维护成本换不到任何真实能力。

## Consequences

- 迁移基线经过验证：对空库执行成功，且与实体比对无 schema 漂移。
- 上游早期迁移创建的 `en_natural` ICU 排序规则已并入基线，connector_metadata 的
  自然版本号排序行为保持不变。
- 未来若确实需要迁移某个 FEMA Integration Platform 实例的数据，走一次性的数据导出/导入工具，
  而不是迁移链。
