---
title: 不做 Network Agent，自托管形态下它要跨越的鸿沟不存在
icon: 🚫
status: accepted
---

## Decision

移除 Network Agent 的全部实现：`@fema-ipaas/network-agent` 包、`network_agent` 表与其迁移、
`connection.networkAgentId` 绑定、出站隧道与服务端白名单、租户侧的 Agent 管理页面、
`NETWORK_AGENT` 权限与两个审计事件。

本 ADR 取代 [0014](0014-network-agent-model-lands-before-the-tunnel.md) 与
[0016](0016-the-network-agent-tunnel-is-an-outbound-socket-with-a-server-side-allowlist.md)，
并推翻 [0005](0005-connection-domain-model.md) 中「`networkAgentId` 从第一天就进 schema」那一处。

## Context

对标的飞书集成平台（AnyCross）把「本地代理服务」做成一级模块：宿主机、工具箱、数据通道代理、
代理集群、高可用。我们照着做了一版，先落数据模型（0014），再补出站隧道（0016）。

复盘时发现，那个模块存在的前提是**平台与客户系统分处两个网络**：AnyCross 是 SaaS，
跑在字节的公网机房，客户的 OA 和数据库在客户内网，中间隔着客户的防火墙。
这条鸿沟客户自己填不了，只能由平台提供打洞方案。

我们是自托管优先（`.claude/rules/self-hosting.md`）。平台部署在客户自己的基础设施里，
与那些业务系统通常同处一个网络域，或者加一条路由就通。

## Why

**鸿沟不存在，桥就没有意义。** 自托管形态下，绝大多数部署里 Server 与 Worker 本身就在
能访问业务系统的网络内。为一个已经连通的网络再造一条隧道，是纯粹的复杂度。

**剩下的边角场景该由运维解决，不由产品解决。** 平台在 DMZ 而数据库在核心区、跨子公司网段，
这类情况真实存在，但这些客户的运维手上有 VPN、专线、反向代理 —— 比我们自造的隧道更成熟，
也更容易通过他们自己安全部门的审查。让产品去替代运维基础设施，是在错误的层解决问题。

**为什么删干净而不是留着降级。** 考虑过保留实现、只从导航里撤掉入口，让需要的人还能用。
否决的理由是维护面：隧道、白名单、审计、Agent 二进制的版本兼容，每一项都要长期跟着走，
而它服务的是一个我们判断不存在的需求。一个没人用的安全边界，比没有这个边界更危险 ——
它会在某次审查里被当成「我们有网络隔离能力」的证据。

代码从未合入主干，删除不涉及已发布 schema 的回滚，这让「删干净」的成本降到最低。
这个窗口以后不会再有。

## Consequences

- 一级模块比 AnyCross 少一个。我们的主导航是**业务集成 / 身份集成 / 平台设置**三块。
- Connection 不再有网络通路维度，回到 **Connector + Credential + Endpoint**。
  0005 说的「Endpoint 后补是破坏性变更」对 `endpointConfig` 仍然成立，对 `networkAgentId` 不再成立。
- 连接器的出站 HTTP 统一走 `safeHttp` 直连，没有第二条路径。
- 如果将来真要提供托管版本，这个决定必须重新评估 —— 那时鸿沟会重新出现。
