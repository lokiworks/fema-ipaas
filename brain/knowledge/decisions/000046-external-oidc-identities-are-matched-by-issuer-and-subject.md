---
title: 外部身份源的账号按 issuer + sub 认人，邮箱只用于显示和通知
icon: 🪪
status: accepted
---

## Decision

单点登录回来以后，先按 `external_identity`（issuer + subject，全实例唯一）找本地账号和租户内的用户；找不到时，再看开通时有没有为这个 subject 预先绑定过（比如租户属主）。OIDC 配置上的 `matchBy` 决定还能不能按邮箱关联已有账号：`SUBJECT` 只认绑定，fema-iam 开通的配置一律是这种；`EMAIL` 在没有绑定时按已验证邮箱关联，并补建绑定，自配置的单点登录默认是这种，保持原有行为。飞书、企业微信、钉钉的 issuer 记作 `feishu:<appId>`、`wecom:<corpId>`、`dingtalk:<appKey>`。

`user_identity.email` 改为可以为空，只用于显示和发通知。

## Context

fema-iam 的 `sub` 是成员 ID：同一个人在两家租户里是两个不同的成员，可能根本没有邮箱（只用手机号）。原来按邮箱认人，所以 fema-iam 账号一律因为 `EMAIL_MISSING` 登录失败；就算补上邮箱，同一个人的两个成员也会被挂到同一个全局身份上。见 `fema-bpaas/docs/design-iam-ipaas-federation-2026-11-04.md`。

## Why

否决了"让 fema-iam 补发邮箱、ipaas 继续按邮箱认人"：只有手机号的成员仍然进不来，两家同邮箱的成员也分不开。按 issuer + sub 认人，这两个问题同时解决，而且对任何标准 OIDC 身份源都成立。

## Consequences

- 一个外部成员对应一个本地身份。同一个人在两家 fema 租户里，在 ipaas 中就是两个账号，互不影响。
- 读邮箱的地方都要处理空值：通知跳过没有邮箱的账号，列表里显示手机号或名字。
- 测试登录（管理员配置单点登录时）改为比对绑定或邮箱，二者有一个对得上即可。
- 联邦账号的会话缩短有效期，并定期用刷新令牌向身份源复核；身份源的成员被移出时，ipaas 还会收到签名事件，立即停用用户。两条路径互为兜底。
