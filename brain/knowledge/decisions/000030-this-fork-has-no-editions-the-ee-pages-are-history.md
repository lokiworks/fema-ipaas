---
title: 这个 fork 没有 Edition，EE 相关页面是历史资料
icon: 🔱
status: accepted
---

## Decision

本仓库自 Activepieces CE `eef1a1d4d2`（v0.88.3）分叉，重建为面向企业系统集成的
开源 iPaaS。Edition 体系已彻底删除：`packages/ee`、`src/app/ee`、`FEMA_EDITION`、
`ApEdition`、`getEdition()` 在树中为 0 引用。

本 fork 自己的架构决策记录在 **`docs/adr/`**（编号 0001-0011），不在
`brain/knowledge/decisions/`——设计文档 §52 指定了那个位置。

`brain/knowledge/platform-editions-ee/` 下的所有页面从此是**上游历史资料**：
它们描述的 hooksFactory 边界、`PlatformPlan` 计费门、EE 模块注册开关在本仓库已不存在。
读它们了解上游为什么那样设计可以，照着写代码不行。

## Context

上游用一个仓库承载 CE / EE / Cloud 三种运行形态，EE 目录另有商业许可。
本项目定位为单一开源版本，且 EE 目录的代码在法律上不可自由使用。

## Why

保留 Edition 体系有三重代价：EE 代码不可用、每个功能都要考虑三种形态、
产品上会持续渗出与开源定位冲突的升级引导。详见 `docs/adr/0002`。

考虑过把 EE 页面直接删掉。否决：上游的取舍原因仍然有参考价值，
标注为历史比删除更有用——但必须标注，否则下一个人会照着已删的接口写代码。

## Consequences

- 读 `platform-editions-ee/` 时默认它与代码不一致，以 `docs/adr/` 和代码为准。
- 被 EE 覆盖但属于开源核心目标的能力（RBAC、审计、SSO、Git Sync、成员管理）
  是**重写**而非搬运，实现细节与上游不同。
