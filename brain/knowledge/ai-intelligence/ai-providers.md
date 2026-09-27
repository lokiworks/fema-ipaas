---
title: 模型连接
icon: 🔑
---

# 模型连接

模型凭据就是 AI 连接器的连接，和其他连接一样按项目授权、加密保存。服务商：Anthropic、OpenAI、DeepSeek、OpenAI 兼容（Ollama、vLLM、通义等，需要填 Base URL）。

## Gotchas
- 服务端功能（生成工作流、编辑器助手）用 `aiModelService` 解析连接并经 `safeHttp` 调模型；指向内网或本机的 OpenAI 兼容地址会被 SSRF 过滤拦下，要加进 `FEMA_SSRF_ALLOW_LIST`。
- 项目里没有模型连接时，AI 入口显示「需要一个模型连接」，接口 `GET /v1/ai/model-connections` 返回空数组，不报错。
- 模型协议的请求构造和响应解析在 `core-utils` 的 `llmWire`，服务端和连接器共用；新增服务商改这一处。

## Key files
- `packages/core/utils/src/lib/llm-wire.ts`
- `packages/server/api/src/app/ai/ai-model.service.ts`
- `packages/connectors/core/ai/`
