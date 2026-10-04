import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk'
import {
    AiFeature,
    ApplicationError,
    ApplyWorkflowPlanRequestBody,
    ConnectionStatus,
    ErrorCode,
    generateId,
    GenerateWorkflowPlanRequestBody,
    isNil,
    llmWire,
    LocalesEnum,
    NoteColorVariant,
    ProjectId,
    StepLocationRelativeToParent,
    SuggestionType,
    TenantId,
    tryCatchSync,
    UserId,
    WorkflowActionType,
    WorkflowOperationRequest,
    WorkflowOperationType,
    WorkflowPlan,
    WorkflowPlanSource,
    WorkflowPlanStep,
    WorkflowTriggerType,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { z } from 'zod'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { mappingTableService } from '../mapping-table/mapping-table.service'
import { workflowService } from '../workflows/workflow/workflow.service'
import { aiModelService } from './ai-model.service'
import { aiPlanSteps, ConnectionRef, MAX_NAME_LENGTH, StepDraft } from './ai-plan-steps'
import { aiRulePlanner } from './ai-rule-plan'
import { aiSystems } from './ai-systems'

export const aiPlanService = (log: FastifyBaseLogger) => ({
    async generate({ request, tenantId, userId }: { request: GenerateWorkflowPlanRequestBody, tenantId: TenantId, userId: UserId }): Promise<WorkflowPlan> {
        const [catalog, connections] = await Promise.all([
            loadCatalog({ log, projectId: request.projectId, tenantId }),
            loadConnections({ projectId: request.projectId }),
        ])
        const unavailableSystems = aiSystems.unavailable({ prompt: request.prompt, catalog })
        if (isNil(request.modelConnectionExternalId)) {
            const mappingTables = await mappingTableService(log).list({ projectId: request.projectId })
            return aiRulePlanner.plan({ prompt: request.prompt, answers: request.answers ?? [], catalog, connections, mappingTables, unavailableSystems })
        }
        const config = await aiModelService(log).resolveConfig({ projectId: request.projectId, tenantId, userId, externalId: request.modelConnectionExternalId })
        const response = await aiModelService(log).call({
            params: {
                config,
                system: planSystemPrompt(),
                messages: [{ role: 'user', content: [{ type: 'text', text: planUserPrompt({ request, catalog }) }] }],
                maxTokens: PLAN_MAX_TOKENS,
                jsonOutput: true,
            },
            usage: { projectId: request.projectId, feature: AiFeature.GENERATE_WORKFLOW, userId },
        })
        const draft = parseDraft(llmWire.textOf(response))
        if (isNil(draft)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The model did not return a usable plan. Try describing the workflow in more detail.' } })
        }
        return toPlan({ draft, catalog, connections, unavailableSystems })
    },

    async apply({ request, tenantId, userId }: { request: ApplyWorkflowPlanRequestBody, tenantId: TenantId, userId: UserId }): Promise<{ workflowId: string }> {
        const { projectId } = request
        const plan = await withProjectConnections({ plan: request.plan, projectId })
        const versions = await resolveVersions({ log, projectId, tenantId, plan })
        const workflow = await workflowService(log).create({
            projectId,
            ownerId: userId,
            request: {
                displayName: plan.displayName,
                projectId,
                folderId: request.folderId,
                metadata: { aiGenerated: true },
            },
        })
        const operations: WorkflowOperationRequest[] = [
            triggerOperation({ plan, versions }),
            ...plan.steps.map((step, index) => actionOperation({ step, index, versions })),
            noteOperation({ plan }),
        ]
        await operations.reduce<Promise<void>>(async (previous, operation) => {
            await previous
            await workflowService(log).update({ id: workflow.id, projectId, tenantId, userId, operation, emitEvents: false })
        }, Promise.resolve())
        log.info({ project: { id: projectId }, workflow: { id: workflow.id } }, '[aiPlanService#apply] Workflow draft created from an AI plan')
        return { workflowId: workflow.id }
    },
})

async function loadCatalog({ log, projectId, tenantId }: { log: FastifyBaseLogger, projectId: ProjectId, tenantId: TenantId }): Promise<ConnectorMetadataModelSummary[]> {
    return connectorMetadataService(log).list({
        projectId,
        tenantId,
        includeHidden: false,
        suggestionType: SuggestionType.ACTION_AND_TRIGGER,
        locale: LocalesEnum.CHINESE_SIMPLIFIED,
    })
}

async function loadConnections({ projectId }: { projectId: ProjectId }): Promise<ConnectionRef[]> {
    const connections = await connectionsRepo().find({
        where: { projectIds: ArrayContains([projectId]), status: ConnectionStatus.ACTIVE },
        select: ['externalId', 'connectorName', 'displayName'],
    })
    return connections.map((connection) => ({ externalId: connection.externalId, connectorName: connection.connectorName, displayName: connection.displayName }))
}

async function resolveVersions({ log, projectId, tenantId, plan }: { log: FastifyBaseLogger, projectId: ProjectId, tenantId: TenantId, plan: WorkflowPlan }): Promise<Map<string, string>> {
    const names = [...new Set([plan.trigger.connectorName, ...plan.steps.map((step) => step.connectorName)])]
    const entries = await Promise.all(names.map(async (name) => {
        const connector = await connectorMetadataService(log).get({ name, projectId, tenantId })
        if (isNil(connector)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: `Connector ${name} is not available in this project` } })
        }
        return [name, connector.version] satisfies [string, string]
    }))
    return new Map(entries)
}

function planSystemPrompt(): string {
    return [
        'You design integration workflows for an iPaaS. A workflow has exactly one trigger followed by a linear list of steps.',
        'Use ONLY connectors, triggers and actions from the catalog the user gives you, referenced by their exact "connector" and "name" values.',
        'Step outputs are referenced in inputs with {{trigger[\'output\'][\'<field>\']}} for the trigger and {{step_1[\'output\'][\'<field>\']}}, {{step_2[\'output\'][\'<field>\']}}… for steps in order; a nested field is written as {{step_1[\'output\'][\'<field>\'][\'<child>\']}}.',
        'Only fill inputs you are confident about; leave the rest out. Never invent credentials, ids or URLs.',
        'If information is missing, ask at most 3 short questions. Put risks or assumptions in warnings.',
        'Write displayName, summary, questions and warnings in the language the user writes in.',
        'Reply with JSON only: {"displayName": string, "summary": string, "trigger": {"connector": string, "name": string, "displayName": string, "input": object}, "steps": [{"connector": string, "name": string, "displayName": string, "input": object}], "questions": string[], "warnings": string[]}',
    ].join('\n')
}

function planUserPrompt({ request, catalog }: { request: GenerateWorkflowPlanRequestBody, catalog: ConnectorMetadataModelSummary[] }): string {
    const answers = (request.answers ?? []).map((answer) => `Q: ${answer.question}\nA: ${answer.answer}`).join('\n')
    return [
        `Catalog:\n${JSON.stringify(catalog.map(catalogEntry))}`,
        `Request:\n${request.prompt}`,
        ...(answers.length > 0 ? [`Answers to your earlier questions:\n${answers}`] : []),
    ].join('\n\n')
}

function catalogEntry(connector: ConnectorMetadataModelSummary): Record<string, unknown> {
    return {
        connector: connector.name,
        title: connector.displayName,
        needsConnection: !isNil(connector.auth),
        triggers: (connector.suggestedTriggers ?? []).map((trigger) => ({ name: trigger.name, title: trigger.displayName, description: clip(trigger.description) })),
        actions: (connector.suggestedActions ?? []).map((action) => ({
            name: action.name,
            title: action.displayName,
            description: clip(action.description),
            props: Object.entries(action.props).filter(([name]) => name !== 'auth').map(([name, prop]) => ({ name, title: prop.displayName, required: prop.required, type: prop.type })),
        })),
    }
}

function parseDraft(text: string): PlanDraft | null {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) {
        return null
    }
    const { data } = tryCatchSync(() => JSON.parse(text.slice(start, end + 1)))
    const parsed = PlanDraft.safeParse(data)
    return parsed.success ? parsed.data : null
}

function toPlan({ draft, catalog, connections, unavailableSystems }: { draft: PlanDraft, catalog: ConnectorMetadataModelSummary[], connections: ConnectionRef[], unavailableSystems: string[] }): WorkflowPlan {
    const assembled = aiPlanSteps.assemble({ trigger: draft.trigger, steps: draft.steps, catalog, connections })
    if (isNil(assembled.trigger)) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The suggested trigger is not available. Try naming the system that starts the workflow.' } })
    }
    return {
        displayName: draft.displayName.slice(0, MAX_NAME_LENGTH),
        summary: draft.summary,
        source: WorkflowPlanSource.MODEL,
        trigger: assembled.trigger,
        steps: assembled.steps,
        questions: draft.questions.slice(0, MAX_QUESTIONS),
        warnings: [...new Set(draft.warnings)],
        unavailableSystems,
        omittedSteps: assembled.omittedSteps,
    }
}

async function withProjectConnections({ plan, projectId }: { plan: WorkflowPlan, projectId: ProjectId }): Promise<WorkflowPlan> {
    const allowed = new Map((await loadConnections({ projectId })).map((connection) => [connection.externalId, connection.displayName]))
    const checked = (step: WorkflowPlanStep): WorkflowPlanStep => {
        const displayName = isNil(step.connectionExternalId) ? undefined : allowed.get(step.connectionExternalId)
        return { ...step, connectionExternalId: isNil(displayName) ? null : step.connectionExternalId, connectionDisplayName: displayName ?? null }
    }
    return { ...plan, trigger: checked(plan.trigger), steps: plan.steps.map(checked) }
}

function triggerOperation({ plan, versions }: { plan: WorkflowPlan, versions: Map<string, string> }): WorkflowOperationRequest {
    return {
        type: WorkflowOperationType.UPDATE_TRIGGER,
        request: {
            name: 'trigger',
            type: WorkflowTriggerType.CONNECTOR,
            displayName: plan.trigger.displayName,
            valid: false,
            settings: {
                connectorName: plan.trigger.connectorName,
                connectorVersion: versions.get(plan.trigger.connectorName) ?? '',
                triggerName: plan.trigger.operationName,
                input: inputOf(plan.trigger),
                propertySettings: {},
                pendingReview: true,
            },
        },
    }
}

function actionOperation({ step, index, versions }: { step: WorkflowPlanStep, index: number, versions: Map<string, string> }): WorkflowOperationRequest {
    return {
        type: WorkflowOperationType.ADD_ACTION,
        request: {
            parentStep: index === 0 ? 'trigger' : stepName(index - 1),
            stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
            action: {
                name: stepName(index),
                type: WorkflowActionType.CONNECTOR,
                displayName: step.displayName,
                valid: false,
                settings: {
                    connectorName: step.connectorName,
                    connectorVersion: versions.get(step.connectorName) ?? '',
                    actionName: step.operationName,
                    input: inputOf(step),
                    propertySettings: {},
                    errorHandlingOptions: { continueOnFailure: { value: false }, retryOnFailure: { value: false } },
                    pendingReview: true,
                },
            },
        },
    }
}

function noteOperation({ plan }: { plan: WorkflowPlan }): WorkflowOperationRequest {
    return {
        type: WorkflowOperationType.ADD_NOTE,
        request: {
            id: generateId(),
            content: reviewNote(plan),
            color: NoteColorVariant.YELLOW,
            position: { x: NOTE_OFFSET_X, y: 0 },
            size: { width: NOTE_WIDTH, height: NOTE_HEIGHT },
        },
    }
}

function inputOf(step: WorkflowPlanStep): Record<string, unknown> {
    return isNil(step.connectionExternalId) ? step.input : { ...step.input, auth: `{{connections['${step.connectionExternalId}']}}` }
}

function reviewNote(plan: WorkflowPlan): string {
    return [
        plan.summary,
        '',
        CJK_PATTERN.test(plan.summary) ? '这是 AI 生成的草稿，发布前请逐步检查每个步骤。' : 'AI draft: check every step before publishing.',
        ...plan.questions.map((question) => `- ${question}`),
        ...plan.warnings.map((warning) => `- ${warning}`),
    ].join('\n')
}

function stepName(index: number): string {
    return `step_${index + 1}`
}

function clip(text: string): string {
    return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT)}…` : text
}

export const aiCatalog = {
    loadCatalog,
    loadConnections,
    catalogEntry,
}

const PLAN_MAX_TOKENS = 4096
const CJK_PATTERN = /[\u4e00-\u9fff]/
const DESCRIPTION_LIMIT = 140
const MAX_QUESTIONS = 3
const NOTE_OFFSET_X = 420
const NOTE_WIDTH = 320
const NOTE_HEIGHT = 220

const DraftStep = z.object({
    connector: z.string(),
    name: z.string(),
    displayName: z.string().default(''),
    input: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<StepDraft>

const PlanDraft = z.object({
    displayName: z.string().min(1),
    summary: z.string().default(''),
    trigger: DraftStep,
    steps: z.array(DraftStep).max(20).default([]),
    questions: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
})
type PlanDraft = z.infer<typeof PlanDraft>
