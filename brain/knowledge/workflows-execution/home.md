---
icon: 🏠
---

# 首页

登录后的落地页（路由 `/`，租户级，不属于任何项目），先回答「现在出了什么事」：顶部一排是今日运行、未处理的问题、需要关注（失败运行和异常连接），下面主列是回到工作，侧列是待我处理。没有 AI 输入框，AI 生成在「新建工作流」里（2026-09-28，ADR 0008 和产品备忘「首发范围」）。

**首页汇总** —— `GET /v1/home/summary?since=<客户端本地 0 点>`，一次返回今日运行、失败运行、不可用连接和待我处理。只统计调用者能访问的项目（所有者、租户管理员、`project_member`），项目 ID 由服务端推导。
**待我处理** —— 我是审批人且能决定的发布申请（有其他审批人时不含自己提的）+ 我是审批人、未过期的智能体人工确认。
**最近访问** —— 本浏览器 localStorage 里的 `recentVisits`，工作流在编辑器加载时记录，数据存储由数据存储页记录。
**我的项目** —— 来自 `GET /v1/projects/directory`，只显示 `myRole` 非空的项目。

## Gotchas
- 今日运行只算 `environment = PRODUCTION` 且未归档的运行，编辑器里的测试运行不计入；成功率 = 成功 ÷ 已结束（含取消），运行中不进分母。
- 小时柱按「距 `since` 的小时数」分桶，不是按 UTC 小时，所以半小时时区也对得上；`since` 超出最近 26 小时会退回最近 24 小时。
- 运行日志页是项目级的：跨多个项目的统计点击后先弹出项目列表，再带 `status` 和 `createdAfter` 跳到对应项目的运行页。
- 最近访问按用户存在当前浏览器里，换浏览器或清缓存就没了；展示前会过滤掉已退出的项目。
- 「新手引导」的跳过也只存在本浏览器；平台里还没有导览，所以首页不显示「开始新手引导」。
- 新建工作流弹窗里没有「告警触发器」，首发不做；选「应用事件」会建一个空触发器，到编辑器里再挑应用。

## Key files
- `packages/server/api/src/app/home/` — `homeService.summary`，纯聚合在 `homeAggregation`
- `packages/core/shared/src/lib/management/home/` — `HomeSummary`
- `packages/web/src/features/home/`、`packages/web/src/app/routes/workspace-home/` — `WorkspaceHomePage`
- `packages/web/src/features/workflows/components/new-workflow-dialog.tsx` — `NewWorkflowDialog`
