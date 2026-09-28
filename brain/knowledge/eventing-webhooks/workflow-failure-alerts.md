---
icon: 🚨
---

# 失败告警

问题中心记录一次失败后，按租户的**告警策略**决定要不要、发给谁、走哪个**通知渠道**。旧的「每个工作流版本 24 小时发一封邮件」机制已删除。

**通知渠道** —— 飞书、企业微信、钉钉、Slack、通用 Webhook、邮件之一，租户级，密钥加密存储。
**告警策略** —— 触发事件（新问题 / 重新打开 / 失败率）、范围、渠道、静默时段、升级规则。
**告警记录** —— 每次发送（或因静默、限流被压下）的一行，用来排查「为什么没收到」。

## Gotchas
- 静默时段内的告警不丢，存为待发送，由每分钟一次的 `ALERT_SWEEP` 系统任务在静默结束后补发；升级和失败率也在这个任务里算。
- 邮件渠道依赖 SMTP；没配 SMTP 时渠道显示为不可用，不报错。
- 钉钉加签密钥必须以 `SEC` 开头；Webhook 渠道带 `X-Signature`（HMAC-SHA256）。

## Key files
- `packages/server/api/src/app/alert/` — `alertDispatcher.onIssueRecorded`、`notificationChannelSender`
- `packages/web/src/app/routes/tenant/alerts/` — `AlertSettings`，挂在问题中心页的「告警设置」标签下（`/issue-center?tab=alerts`），不再是租户管理的独立页面
