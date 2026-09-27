import {
    AiFeature,
    CopilotMode,
    CopilotRequestBody,
    CopilotResponse,
    Execution,
    ExecutionStatus,
    isNil,
    Issue,
    llmWire,
    Step,
    TenantId,
    UserId,
    workflowStructureUtil,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { issueRepo } from '../issue/issue.service'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowService } from '../workflows/workflow/workflow.service'
import { aiModelService } from './ai-model.service'

export const aiCopilotService = (log: FastifyBaseLogger) => ({
    async ask({ request, tenantId, userId }: { request: CopilotRequestBody, tenantId: TenantId, userId: UserId }): Promise<CopilotResponse> {
        const config = await aiModelService(log).resolveConfig({ projectId: request.projectId, tenantId, externalId: request.modelConnectionExternalId })
        const workflow = await workflowService(log).getOnePopulatedOrThrow({ id: request.workflowId, projectId: request.projectId })
        const failure = request.mode === CopilotMode.DIAGNOSE
            ? await latestFailure({ projectId: request.projectId, workflowId: request.workflowId })
            : null
        const response = await aiModelService(log).call({
            params: {
                config,
                system: COPILOT_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: [{ type: 'text', text: copilotPrompt({ mode: request.mode, question: request.question, version: workflow.version, failure }) }] }],
                maxTokens: COPILOT_MAX_TOKENS,
            },
            usage: { projectId: request.projectId, feature: AiFeature.COPILOT, workflowId: request.workflowId, userId },
        })
        return {
            answer: llmWire.textOf(response),
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
        }
    },
})

async function latestFailure({ projectId, workflowId }: { projectId: string, workflowId: string }): Promise<FailureContext | null> {
    const [execution, issue] = await Promise.all([
        executionRepo().findOne({
            where: { projectId, workflowId, status: In(FAILED_STATUSES) },
            order: { created: 'DESC' },
        }),
        issueRepo().findOne({
            where: { projectId, workflowId },
            order: { lastSeenAt: 'DESC' },
        }),
    ])
    if (isNil(execution) && isNil(issue)) {
        return null
    }
    return { execution, issue }
}

function copilotPrompt({ mode, question, version, failure }: PromptParams): string {
    const outline = `Workflow "${version.displayName}":\n${JSON.stringify(outlineOf(version))}`
    switch (mode) {
        case CopilotMode.EXPLAIN:
            return `${outline}\n\nExplain what this workflow does, step by step, for a colleague who has not seen it. Point out anything that looks unfinished or risky.`
        case CopilotMode.DIAGNOSE:
            return isNil(failure)
                ? `${outline}\n\nThere is no recorded failure for this workflow. Say so, then list the steps most likely to fail and why.`
                : `${outline}\n\nLatest failure:\n${JSON.stringify(failureOf(failure))}\n\nFind the most likely root cause and give concrete fix steps. Say which step to change and how.`
        case CopilotMode.ASK:
            return `${outline}\n\nQuestion: ${question ?? ''}`
    }
}

function outlineOf(version: WorkflowVersion): Record<string, unknown>[] {
    return workflowStructureUtil.getAllSteps(version.trigger).map((step: Step) => ({
        name: step.name,
        displayName: step.displayName,
        type: step.type,
        skipped: 'skip' in step ? step.skip ?? false : false,
        connector: 'connectorName' in step.settings ? step.settings.connectorName : undefined,
        operation: 'actionName' in step.settings ? step.settings.actionName : 'triggerName' in step.settings ? step.settings.triggerName : undefined,
        input: 'input' in step.settings ? summarizeInput(step.settings.input) : undefined,
    }))
}

function summarizeInput(input: unknown): Record<string, string> {
    if (typeof input !== 'object' || isNil(input)) {
        return {}
    }
    return Object.fromEntries(Object.entries(input)
        .filter(([name]) => name !== 'auth')
        .map(([name, value]) => {
            const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
            return [name, text.length > INPUT_PREVIEW_LIMIT ? `${text.slice(0, INPUT_PREVIEW_LIMIT)}…` : text]
        }))
}

function failureOf({ execution, issue }: FailureContext): Record<string, unknown> {
    return {
        run: isNil(execution) ? null : {
            status: execution.status,
            at: execution.created,
            failedStep: execution.failedStep ?? null,
        },
        issue: isNil(issue) ? null : {
            title: issue.title,
            message: issue.message,
            step: issue.stepDisplayName ?? issue.stepName,
            errorCode: issue.errorCode,
            occurrences: issue.occurrences,
            status: issue.status,
        },
    }
}

const COPILOT_MAX_TOKENS = 2048
const INPUT_PREVIEW_LIMIT = 200
const FAILED_STATUSES = [ExecutionStatus.FAILED, ExecutionStatus.INTERNAL_ERROR, ExecutionStatus.TIMEOUT, ExecutionStatus.MEMORY_LIMIT_EXCEEDED]
const COPILOT_SYSTEM_PROMPT = [
    'You are the assistant inside an integration workflow editor.',
    'Answer in the language of the workflow names and the question; default to Simplified Chinese.',
    'Be concrete and short. Use Markdown lists. Refer to steps by their display name.',
    'You cannot change the workflow; describe changes for the user to make.',
    '{{trigger.x}} and {{step_n.x}} in inputs reference earlier step outputs.',
].join('\n')

type FailureContext = {
    execution: Execution | null
    issue: Issue | null
}

type PromptParams = {
    mode: CopilotMode
    question: string | undefined
    version: WorkflowVersion
    failure: FailureContext | null
}
