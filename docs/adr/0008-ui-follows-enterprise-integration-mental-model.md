---
title: UI 按企业集成心智重建，而不是自动化工具心智
icon: 🖥️
status: accepted
---

## Decision

按设计文档 §6 的信息架构重建路由与页面：首页、工作流、连接器、连接配置、运行中心、
集成方案、资源、管理。参考飞书 AnyCross 的**产品逻辑与信息架构**，不复制其视觉资产、
图标、商标或前端源码。

首页回答四个问题：今天运行多少次、成功率多少、哪些工作流失败、哪些系统连接异常。
不做上游那种 Automation Dashboard。

移除：Activepieces 品牌紫、AI-first 导航、Cloud upsell、Locked Enterprise Feature、
Upgrade plan、Pricing prompt。

## Context

上游的 IA 是 Zapier 式个人自动化叙事：以「我的自动化」为中心，运行记录是次要页面。

## Why

企业集成平台的主要用户不是搭流程的人，而是**运维流程的人**。他们每天的动作是
「发现失败 → 定位节点 → 看请求响应 → 重试 → 追踪历史版本」。把运行治理放在
二级页面，意味着产品的主路径和真实使用路径错位。

考虑过**保留现有 IA、只做视觉换肤**。否决：§47 明确以「用户不应能判断平台是
Activepieces 换皮」为完成判定，换肤达不到；且导航结构本身就在暗示产品是什么。

## Consequences

- 路由与页面是重建而非改造，Step 5 的改动量接近前端重写。
- 运行中心成为一等公民：执行记录、失败记录、Webhook、运行统计四个子页面。
- 「发布」是显式动作（Draft → Test → Publish），不再保存即生效。
