---
title: 平台开通接口一次建好租户、登录配置和连接，按外部引用幂等
icon: 🏗️
status: accepted
---

## Decision

新增平台接口 `/v1/platform/*`，只允许平台调用方访问。平台调用方有两种：一是实例运营者签发的 API 密钥；二是受信身份源（比如 fema-iam）以 `client_credentials` 签给业务应用的令牌，要在允许名单里。两种都要单独授予权限，比如 `TENANT_PROVISION`、`TENANT_MEMBERS`、`USAGE_READ`。

`POST /v1/platform/tenants` 一次建好或取回：租户、默认项目、OIDC 登录配置（含附加授权参数 `tenant`）、属主的预绑定（按 issuer + 属主的成员 ID，角色是租户管理员）、事件签名密钥，以及业务连接（OAuth2 `client_credentials`，附加属性带 `tenant`）。幂等键是外部引用"issuer + 外部租户编码"。重复调用时更新密钥，以最后一次为准。

实例运营者在运营后台做同样的事，调用的也是同一组服务。

## Context

原来建租户只认首位用户的引导令牌。业务方（比如 rental-saas 的租户初始化）没有任何入口能替一家新租户开户，见 `fema-bpaas/docs/design-iam-ipaas-federation-2026-11-04.md` 第三节。

## Why

否决了"只允许平台运营的机密客户端调用"：那样业务方要绕道运营才能开户，租户初始化就没法自动完成。按外部引用幂等，是因为这个接口不和 fema-iam 建租户同成同败，必须能放心地重试。

## Consequences

- 平台接口不走用户会话，也不经过 `securityAccess` 的项目判断。它有自己的校验：调用方、权限、是否已吊销，每次调用都写审计。
- 外部引用在 `tenant` 上唯一，同一家外部租户不可能在 ipaas 里开出第二个。
- 业务连接的密钥只在服务端之间传递，不经人手；连接按"外部编号"幂等，重试时更新同一条连接。
- 独立出售时，客户自己的运营系统走的也是这组接口。
