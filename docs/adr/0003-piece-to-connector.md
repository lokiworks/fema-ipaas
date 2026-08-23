---
title: Piece 概念彻底删除，统一为 Connector
icon: 🔌
status: accepted
---

## Decision

在数据库、API 路径、TypeScript 类型、变量名、包名和 UI 文案中彻底移除 `Piece` 系列术语，
统一迁移到 Connector 领域语言。判定标准：核心代码 `grep -ri "piece"` 结果为 0
（LICENSE / NOTICE / 上游迁移说明 / git history 例外）。

术语映射见设计文档 §5。包名从 `@activepieces/*` 迁移到 `@fema/*`，环境变量从 `AP_*`
迁移到 `FEMA_*`。

迁移期允许存在 `legacyPieceToConnector()` 适配器，但它不暴露到 UI、不进新 SDK 文档、
不允许新连接器使用，迁移完成即删除。

## Context

`Piece` 是 Activepieces 的专有词，在企业集成语境里没有任何含义。业务用户、集成实施
顾问和运维人员使用的词是「连接器」。

## Why

术语不是皮肤，是建模。只要代码里还叫 Piece，新功能就会继续按 Piece 的语义去设计——
比如把 Loop 和 Delay 也做成 Piece（这正是上游的现状，见 ADR 0004）。

考虑过**只改 UI 文案、代码保留 Piece**。否决：这恰恰是 §47 要排除的「换皮」形态，
且会让 SDK 文档与实际类型名长期不一致，连接器开发者第一天就会撞上。

## Consequences

- 影响面极大（基线时 server/core/web 下 1974/3035 个文件含 `piece`），必须自底向上
  按依赖顺序推进：core types → SDK → runtime → server → engine → web → connectors。
- 数据库列名与 API 路径变更对已部署实例是破坏性的，需要迁移脚本。
- 两套概念不允许长期并存，适配器有明确的删除期限。
