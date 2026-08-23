---
title: WorkflowVersion 锁定 ConnectorVersion，运行时不漂移到 latest
icon: 📌
status: accepted
---

## Decision

每个 WorkflowVersion 显式记录它所使用的每个 ConnectorVersion。运行时按锁定版本解析
连接器，**禁止**无条件解析到 latest。

升级路径是显式的：发现新版本 → 兼容性检查 → 用户确认 → 创建新的 WorkflowVersion。
不存在「连接器发新版后，已发布工作流的行为静默改变」这种情况。

## Context

连接器是可独立发布的资产，第三方和企业自建连接器都会持续迭代。上游的加载机制倾向于
解析当前安装的版本。

## Why

集成平台跑的是生产业务流程。一个连接器改了字段名或默认值，可能让几百条已发布工作流
在无人变更的情况下同时开始失败，而运维在版本历史里找不到任何对应记录。

考虑过**只锁 major 版本、minor/patch 自动跟随**。否决：连接器作者对 semver 的执行
不可控（社区与自建连接器尤其如此），把生产稳定性押在别人的版本纪律上不成立。

## Consequences

- 数据库需要 `connector` 与 `connector_version` 两张表，manifest 与 checksum 入库。
- 需要一个兼容性检查器，能对比两个版本的 Action 输入输出 schema 差异。
- 老版本连接器不能随意删除，Registry 要保留被引用的历史版本。
