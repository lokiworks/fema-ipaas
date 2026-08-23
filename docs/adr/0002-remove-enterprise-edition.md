---
title: 只有一个开源版本，不保留 Edition 分支
icon: ✂️
status: accepted
---

## Decision

删除 `packages/ee/` 与 `packages/server/api/src/app/ee/`，并清除整个 Edition 判断体系：
`FEMA_EDITION` 环境变量、`ApEdition` 枚举、edition guard、feature gate、EE 迁移、EE 测试、
EE Web 路由与 EE shared schema。代码中不允许出现 `if (edition === 'EE')` 形态的分支。

被 EE 覆盖但属于开源集成平台核心目标的能力（RBAC、审计日志、SSO、Git Sync、
项目成员），在 Step 7 以本项目自有实现重建，而不是把 EE 代码搬进 CE。

## Context

上游用 `hooksFactory.create(ceDefault).set(eeImpl)` 在单仓库内维持 CE/EE/Cloud 三条
代码路径。EE 目录使用独立商业许可证，法律上不可自由使用。

## Why

保留 Edition 体系有三重代价：法律上不能用 EE 代码、工程上每个功能都要考虑三种运行
形态、产品上会持续渗出 "Upgrade to Enterprise" 这类与开源定位冲突的 UI。

考虑过的替代方案是**保留 hooks 机制、只把 EE 实现留空**。否决原因：钩子点本身就是
按商业分层切出来的，留着会让新功能不自觉地沿着"这是不是付费功能"去建模。

## Consequences

- 一次性删除量很大，且 EE 曾被 CE 通过 hooks 反向依赖，需逐个把默认实现内联回 CE。
- 企业能力（RBAC/Audit/SSO）需要重写，短期内功能会比上游 EE 少。
- 不再有 CE/EE/Cloud 三套 API 测试矩阵，CI 显著变快。
