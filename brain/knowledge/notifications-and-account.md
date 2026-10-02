---
title: 通知、个人设置与全局入口
icon: 🔔
---

# 通知、个人设置与全局入口

壳层上每个用户都用得到的几样东西：站内通知、个人设置（含个人访问令牌）、全局搜索、教程和帮助文档，以及登录页和异常兜底页。

**通知（notification）** — 发给某一个接收人的站内消息，只有接收人本人能看到；没有“广播给全项目”的通知，要通知多人就给每人各写一行。_Avoid_：消息、提醒
**通知类型** — `NotificationType`，界面按类型拼标题；`title` 只存对象名（工作流名、问题标题），`body` 存补充说明（驳回理由、失败节点）。
**通知偏好** — 存在 `user.notificationPreferences`（jsonb），只管邮件；站内通知始终开启，即时通讯一列在界面上置灰，因为平台还没有给个人发即时通讯消息的通道。
**个人访问令牌（PAT）** — `pat_` + 32 位字母数字，只存 sha256 哈希和末 4 位；`Authorization: Bearer pat_…` 认证成令牌主人的 USER 身份，权限与本人完全一致。_Avoid_：API Key（那是 MCP 服务自己的密钥）
**每周摘要** — 周一 08:00（服务器时区）的系统任务，只给在偏好里勾了“每周摘要 × 邮件”的人发；没配 SMTP 时整个任务直接跳过。
**教程（tour）** — 高亮页面上带 `data-tour` 属性的真实元素逐步讲解；找不到的步骤会被跳过，一个都找不到就提示当前页面没有可演示的内容。

## 谁会收到通知

- 发布申请：创建 → 审批人；通过 / 驳回 → 申请人；回滚 → 审批人（回滚不需要审批，只通知）。
- 智能体人工确认 → 审批人（工作流所有者 + 项目所有者）。
- 编辑锁被接管 → 原来持锁的人。
- 问题被指派 → 被指派人（自己指派给自己不通知）。
- 模块权限申请被处理 → 申请人；个人数据删除完成或失败 → 发起人。
- 被加入项目 → 本人（站内 + 按偏好发邮件）。
- 运行失败 → 项目所有者（仅在项目开启“失败通知所有者”时，每个工作流 1 小时最多一次）；连接刷新授权失败 → 连接所有者（每个连接 24 小时最多一次）。

## Gotchas

- 容量告警（`CAPACITY_THRESHOLD`）站内通知发给项目所有者和租户管理员，**链接按收件人区分**：租户管理员去 `/tenant/limits/usage`，不是管理员的所有者去 `/projects/<id>/automations`（租户页对他们会被静默重定向回首页）。
- 通知列表里的时间用 `formatUtils.formatDate`（本地化），`formatDateToAgo` 是写死英文的；正文里的角色名、连接器名在前端换成本地化名称，库里存的仍是枚举值和包名。
- 通知永远排除触发它的人（`actorId`），审批人自己申请的发布不会通知自己。
- 通知写库后按接收人 id 的 socket 房间推送 `NOTIFICATION_CREATED`；推送失败只记日志，不影响写库，角标下次拉取时仍会更新。
- 告警策略里配置的邮件渠道是管理员定的群发路由，**不看**个人通知偏好；个人偏好只管“发给我本人”的邮件（运行失败给所有者、连接失效给所有者、被加入项目、每周摘要）。
- 邮件偏好默认开（每周摘要默认关），这样老项目“失败通知所有者”的行为不变。
- PAT 不能用于 websocket 连接，websocket 仍然只认登录 JWT。
- 通知保留 90 天，由 `notification-retention` 系统任务每天清理。
- 帮助文档的正文是 i18n 字符串，ICU 语法下不能出现 `{}`、`{{` 或 `<tag>` 这类字符，写文案时要避开。

## Key files

- `packages/server/api/src/app/notification` — `notificationService.notify`、偏好、每周摘要
- `packages/server/api/src/app/account` — 个人资料、偏好、PAT（`personalAccessTokenService.authenticate`）
- `packages/server/api/src/app/global-search` — 按当前用户可见项目搜索的 `/v1/global-search`
- `packages/web/src/features/notifications`、`packages/web/src/features/account`、`packages/web/src/features/help`
- `packages/web/src/app/components/global-search`
