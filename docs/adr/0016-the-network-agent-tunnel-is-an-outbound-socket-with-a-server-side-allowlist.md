---
title: Network Agent 隧道是出站 socket，白名单在服务端执行
icon: 🛰️
status: superseded by 0018-no-network-agent-self-hosting-removes-the-gap-it-bridged
---

## Decision

Agent 以出站 Socket.IO 连接接入服务端的 `/network-agent` 命名空间，用 Agent token 认证
（库里只存 HMAC）。服务端按需通过该连接下发代理请求，Agent 在企业内网发起真实 HTTP 并回传结果。

**白名单在服务端执行，不在 Agent 上执行。** 每次代理请求在下发之前先过
`networkAgentAllowlist.assertAllowed`，并在完成后写一条审计事件。

Agent 客户端是独立包 `@fema-ipaas/network-agent`，**不依赖** `@fema-ipaas/shared`，
自己声明一份线上协议。

本 ADR 取代 [0014](0014-network-agent-model-lands-before-the-tunnel.md)。

## Context

0014 落地了数据模型、Connection 绑定和 CRUD，明确把隧道推迟，并记录了
「`hostAllowlist` / `cidrAllowlist` 存了但不生效，别在 UI 或文档里宣称它提供了网络隔离」。

现在补上隧道，那句话必须变成真的。

## Why

**为什么白名单在服务端。** Agent 跑在客户的网络里、由客户运维、可以被替换或打补丁。
把访问控制放在那一侧，等于把「哪些内网地址可达」的判定权交给了被控制的一端。
服务端在下发前判定，Agent 只是一条哑管道 —— 即使 Agent 二进制被改动，它也只能收到
已经过白名单的请求。

**为什么空白名单拒绝一切而不是放行一切。** 一个刚创建、还没配置范围的 Agent，
其意图是「尚未授权任何目标」，不是「授权全部内网」。默认放行会让忘记配置变成静默的全网可达。

**为什么 Agent 不依赖 `@fema-ipaas/shared`。** 这个二进制装在客户网络内部。
`shared` 携带 DB schema、dayjs、zod 等重依赖，全部与转发一次 HTTP 无关。
让两端各自声明线上协议，是协议边界的正常做法 —— 不是应当消除的重复。
两份文件互相注明是一对，必须同步修改。

被拒绝的替代方案是「服务端主动连 Agent」：那要求企业开放入站端口，正是 §18 要避免的。

## Consequences

- Agent 连上后 `status` 变 ONLINE 并刷新 `lastSeenAt`，断开变 OFFLINE。0014 里「永远 PENDING」的说明作废。
- 每次代理请求都写审计（`ApplicationEventName.NETWORK_AGENT_REQUEST`），含方法、URL、响应状态。
- 代理请求 30 秒超时后以错误回复，不会无限挂起等待一个已经掉线的 Agent。
- 未做：**引擎侧尚未自动把绑定了 Agent 的 Connection 路由到隧道**。
  `POST /v1/network-agents/proxy` 已可用，但连接器的出站 HTTP 仍走 `safeHttp` 直连。
  打通它需要改连接器 HTTP 路径，是独立一步。
- Agent 与服务端的协议是两份手写副本。改任一份而不改另一份，会在运行时表现为事件名不匹配、静默无响应。
