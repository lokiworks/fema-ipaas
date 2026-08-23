---
title: Connection 是一等领域对象，不只是凭证
icon: 🔗
status: accepted
---

## Decision

Connection = **Connector + Credential + Endpoint + Network Channel** 的可复用连接实例，
而不是上游 `AppConnection` 那种「某个 Piece 的一份账号密码」。

首版结构包含 `connectorName` / `connectorVersion` / `authType` / `encryptedCredentials` /
`endpointConfig` / `networkAgentId` / `status`。作用域首版支持 Workspace 与 Personal，
Tenant Shared 后续再加。

`networkAgentId` 与 `endpointConfig` 从第一天就进 schema，即使 Network Agent
（ADR 见 §18）晚于核心工作流交付。

## Context

企业集成的连接目标经常不是公网 SaaS，而是「上海机房那台 SAP」——同一个 Connector
会对应多个环境（生产/测试）、多个 Endpoint、多条网络通路。

## Why

如果 Connection 只承载凭证，Endpoint 和网络通路就会散落到每个 Action 的入参里，
导致同一套工作流换环境需要逐节点改配置，也无法对「哪些连接当前不可用」做集中治理
（这是首页要回答的四个问题之一）。

考虑过**先只做凭证、Endpoint 后补**。否决：Endpoint 与 NetworkAgent 一旦后补就是
破坏性 schema 变更，且会有一批工作流已经把 baseUrl 写死在节点参数里，迁移成本远高于
第一天预留两个字段。

## Consequences

- Connection 需要独立的健康检查与 `status` 维护，不能只在使用时才发现失效。
- 凭证加密、密钥轮换、API 永不回传明文这几条（§21.1）适用于整个 Connection 对象。
- 节点配置面板里「连接配置」是独立的一等区块，不与业务参数混排。
