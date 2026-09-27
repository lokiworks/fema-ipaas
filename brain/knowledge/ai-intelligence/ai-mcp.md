---
title: 生成工作流、编辑器助手与用量
icon: ✨
---

# 生成工作流、编辑器助手与用量

**生成工作流** —— 用户描述需求，服务端把项目可用的连接器目录交给模型，得到计划（触发器、步骤、待确认问题、风险），用户确认后按计划建草稿。接口 `POST /v1/ai/workflow-plans`、`/workflow-plans/apply`。
**编辑器助手** —— 解释工作流、诊断最近一次失败（读最近的失败运行和问题）、回答问题，只给文字建议，不改工作流。接口 `POST /v1/ai/copilot`。
**AI 用量** —— `ai_usage` 表，`GET /v1/ai/usage` 按功能、模型、工作流、日期汇总。

## Gotchas
- 计划里的连接器和操作名在服务端逐个对照目录校验，不存在的步骤被丢弃并计入 `omittedSteps`；步骤输入只保留操作真实存在的参数名，`auth` 永远由项目里已有的连接填入。
- 生成的草稿带 `metadata.aiGenerated = true`，并在画布上加一张黄色便签列出待确认问题；步骤 `valid` 一律为 false，逼用户逐步检查。
- 应用计划时逐个执行 `UPDATE_TRIGGER` / `ADD_ACTION` / `ADD_NOTE` 操作，而不是导入整段 JSON，好让现有的操作校验生效。

## Key files
- `packages/server/api/src/app/ai/` — `aiPlanService`、`aiCopilotService`、`aiUsageService`
- `packages/web/src/features/ai/`
