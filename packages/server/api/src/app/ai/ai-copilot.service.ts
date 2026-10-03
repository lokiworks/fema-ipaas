import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk'
import {
    AiFeature,
    CopilotDiagnosis,
    CopilotMode,
    CopilotProposal,
    CopilotRequestBody,
    CopilotResponse,
    CopilotStepRef,
    Execution,
    ExecutionStatus,
    isNil,
    Issue,
    llmWire,
    ProjectId,
    Step,
    TenantId,
    UserId,
    workflowStructureUtil,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, MoreThanOrEqual } from 'typeorm'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { issueRepo } from '../issue/issue.service'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowService } from '../workflows/workflow/workflow.service'
import { aiModelService } from './ai-model.service'
import { aiCatalog } from './ai-plan.service'
import { copilotProposal } from './copilot-proposal'

export const aiCopilotService = (log: FastifyBaseLogger) => ({
    async ask({ request, tenantId, userId }: { request: CopilotRequestBody, tenantId: TenantId, userId: UserId }): Promise<CopilotResponse> {
        const config = await aiModelService(log).resolveConfig({ projectId: request.projectId, tenantId, userId, externalId: request.modelConnectionExternalId })
        const workflow = await workflowService(log).getOnePopulatedOrThrow({ id: request.workflowId, projectId: request.projectId })
        const version = workflow.version
        const isDiagnose = request.mode === CopilotMode.DIAGNOSE
        const isModify = request.mode === CopilotMode.MODIFY
        const [failure, diagnosis, catalog] = await Promise.all([
            isDiagnose ? latestFailure({ projectId: request.projectId, workflowId: request.workflowId }) : Promise.resolve(null),
            isDiagnose ? diagnosisOf({ projectId: request.projectId, workflowId: request.workflowId, version }) : Promise.resolve(undefined),
            isModify ? aiCatalog.loadCatalog({ log, projectId: request.projectId, tenantId }) : Promise.resolve([]),
        ])
        const response = await aiModelService(log).call({
            params: {
                config,
                system: isModify ? MODIFY_SYSTEM_PROMPT : COPILOT_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: [{ type: 'text', text: copilotPrompt({ mode: request.mode, question: request.question, version, failure, catalog }) }] }],
                maxTokens: isModify ? MODIFY_MAX_TOKENS : COPILOT_MAX_TOKENS,
                jsonOutput: isModify,
            },
            usage: { projectId: request.projectId, feature: AiFeature.COPILOT, workflowId: request.workflowId, userId },
        })
        const text = llmWire.textOf(response)
        const usage = { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
        if (isModify) {
            const proposal = await proposalOf({ log, text, version, catalog, projectId: request.projectId, tenantId })
            return { answer: proposal.summary, ...usage, proposal }
        }
        const linked = linkSteps({ text, version })
        return {
            answer: linked.answer,
            ...usage,
            referencedSteps: linked.steps,
            ...(isNil(diagnosis) ? {} : { diagnosis }),
        }
    },
})

async function proposalOf({ log, text, version, catalog, projectId, tenantId }: ProposalParams): Promise<CopilotProposal> {
    const draft = copilotProposal.parseDraft(text)
    if (isNil(draft)) {
        return {
            summary: '',
            changes: [],
            operations: [],
            affectedStepNames: [],
            rejected: [],
            unsupported: text.trim().length > 0 ? text.trim().slice(0, UNSUPPORTED_TEXT_LIMIT) : null,
        }
    }
    const connectorNames = [...new Set(draft.changes.flatMap((change) => (change.type === 'ADD_STEP' ? [change.connector] : [])))]
    const [versions, connections] = await Promise.all([
        Promise.all(connectorNames.map(async (name) => {
            const connector = await connectorMetadataService(log).get({ name, projectId, tenantId })
            return isNil(connector) ? null : ([name, connector.version] satisfies [string, string])
        })),
        aiCatalog.loadConnections({ projectId }),
    ])
    return copilotProposal.build({
        draft,
        version,
        catalog,
        connectorVersions: new Map(versions.flatMap((entry) => (isNil(entry) ? [] : [entry]))),
        connections,
    })
}

async function diagnosisOf({ projectId, workflowId, version }: { projectId: string, workflowId: string, version: WorkflowVersion }): Promise<CopilotDiagnosis> {
    const since = dayjs().subtract(DIAGNOSIS_WINDOW_DAYS, 'day').toISOString()
    const [failuresLast7Days, latest] = await Promise.all([
        executionRepo().count({
            where: { projectId, workflowId, status: In(FAILED_STATUSES), created: MoreThanOrEqual(since) },
        }),
        executionRepo().findOne({
            where: { projectId, workflowId, status: In(FAILED_STATUSES) },
            order: { created: 'DESC' },
        }),
    ])
    const failedName = latest?.failedStep?.name
    const current = isNil(failedName) ? undefined : workflowStructureUtil.getStep(failedName, version.trigger)
    return {
        failuresLast7Days,
        lastFailureAt: latest?.created ?? null,
        failedStep: isNil(failedName) ? null : { name: failedName, displayName: current?.displayName ?? latest?.failedStep?.displayName ?? failedName },
    }
}

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

function linkSteps({ text, version }: { text: string, version: WorkflowVersion }): { answer: string, steps: CopilotStepRef[] } {
    const steps = workflowStructureUtil.getAllSteps(version.trigger)
    const byName = new Map(steps.map((step) => [step.name, step.displayName]))
    const referenced = [...text.matchAll(STEP_MARKER)]
        .map((match) => match[1])
        .filter((name) => byName.has(name))
    const answer = text.replace(STEP_MARKER, (marker, name: string) => {
        const displayName = byName.get(name)
        return isNil(displayName) ? marker : `**${displayName}**`
    })
    return {
        answer,
        steps: [...new Set(referenced)].map((name) => ({ name, displayName: byName.get(name) ?? name })),
    }
}

function copilotPrompt({ mode, question, version, failure, catalog }: PromptParams): string {
    const outline = `Workflow "${version.displayName}":\n${JSON.stringify(outlineOf(version))}`
    switch (mode) {
        case CopilotMode.EXPLAIN:
            return `${outline}\n\nExplain what this workflow does, step by step, for a colleague who has not seen it. Point out anything that looks unfinished or risky.`
        case CopilotMode.DIAGNOSE:
            return isNil(failure)
                ? `${outline}\n\nThere is no recorded failure for this workflow. Say so, then list the steps most likely to fail and why.`
                : `${outline}\n\nLatest failure:\n${JSON.stringify(failureOf(failure))}\n\nFind the most likely root cause, say how confident you are (high / medium / low) and give concrete fix steps. Say which step to change and how.`
        case CopilotMode.ASK:
            return `${outline}\n\nQuestion: ${question ?? ''}`
        case CopilotMode.MODIFY:
            return [
                outline,
                `Catalog:\n${JSON.stringify(catalog.map(aiCatalog.catalogEntry))}`,
                `Requested change:\n${question ?? ''}`,
            ].join('\n\n')
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
const MODIFY_MAX_TOKENS = 3072
const INPUT_PREVIEW_LIMIT = 200
const UNSUPPORTED_TEXT_LIMIT = 2000
const DIAGNOSIS_WINDOW_DAYS = 7
const STEP_MARKER = /\[\[([A-Za-z_][A-Za-z0-9_]*)\]\]/g
const FAILED_STATUSES = [ExecutionStatus.FAILED, ExecutionStatus.INTERNAL_ERROR, ExecutionStatus.TIMEOUT, ExecutionStatus.MEMORY_LIMIT_EXCEEDED]
const COPILOT_SYSTEM_PROMPT = [
    'You are the assistant inside an integration workflow editor.',
    'Answer in the language of the workflow names and the question; default to Simplified Chinese.',
    'Be concrete and short. Use Markdown lists.',
    'Whenever you mention a step, write its name in double square brackets, e.g. [[step_2]] or [[trigger]]; it is shown to the user as the step display name and becomes clickable.',
    'You cannot change the workflow in this mode; describe changes for the user to make.',
    '{{trigger[\'output\'][\'x\']}} and {{step_n[\'output\'][\'x\']}} in inputs reference earlier step outputs.',
].join('\n')
const MODIFY_SYSTEM_PROMPT = [
    'You propose edits to an integration workflow. The user describes a change; you return a list of concrete edits.',
    'You can only: add an app step after an existing step (ADD_STEP), change input fields of an existing app step (UPDATE_INPUT), delete a step (DELETE_STEP), rename a step (RENAME_STEP).',
    'Use ONLY connectors and actions from the catalog, referenced by their exact "connector" and "name" values. Refer to existing steps by their "name" (e.g. step_2, trigger).',
    'Inputs may reference earlier step outputs with {{trigger[\'output\'][\'<field>\']}} or {{step_n[\'output\'][\'<field>\']}}. Never invent credentials, ids or URLs.',
    'If the request cannot be done with these edits (branches, loops, code, error handling, publishing, runs…), return no changes and explain in "unsupported" what you cannot do and list what you can do instead.',
    'Write "summary" and "unsupported" in the language the user writes in; default to Simplified Chinese.',
    'Reply with JSON only: {"summary": string, "unsupported": string | null, "changes": [{"type": "ADD_STEP", "after": string, "connector": string, "action": string, "displayName": string, "input": object} | {"type": "UPDATE_INPUT", "step": string, "input": object} | {"type": "DELETE_STEP", "step": string} | {"type": "RENAME_STEP", "step": string, "displayName": string}]}',
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
    catalog: ConnectorMetadataModelSummary[]
}

type ProposalParams = {
    log: FastifyBaseLogger
    text: string
    version: WorkflowVersion
    catalog: ConnectorMetadataModelSummary[]
    projectId: ProjectId
    tenantId: TenantId
}
