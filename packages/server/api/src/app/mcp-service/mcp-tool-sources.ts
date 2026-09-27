import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import {
    McpServiceIssueCode,
    McpServiceIssueLevel,
    McpServiceTool,
    McpToolParam,
    McpToolSourceType,
    McpToolTriggerKind,
    McpWorkflowToolCandidate,
    WorkflowStatus,
    workflowStructureUtil,
    WorkflowTriggerType,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { mcpToolModel, PropLike } from './mcp-tool-model'

export const mcpToolSources = (log: FastifyBaseLogger) => ({
    async workflowCandidates({ projectId }: { projectId: string }): Promise<McpWorkflowToolCandidate[]> {
        const workflows = await workflowRepo().find({ where: { projectId }, select: ['id', 'status', 'publishedVersionId', 'projectId'] })
        const versions = await publishedVersions({ versionIds: workflows.flatMap((workflow) => (isNil(workflow.publishedVersionId) ? [] : [workflow.publishedVersionId])) })
        const latest = await latestVersions({ workflowIds: workflows.map((workflow) => workflow.id) })
        return workflows.map((workflow) => {
            const published = isNil(workflow.publishedVersionId) ? undefined : versions.get(workflow.publishedVersionId)
            const shown = published ?? latest.get(workflow.id)
            const target = isNil(published) ? null : classify(published)
            return {
                workflowId: workflow.id,
                displayName: shown?.displayName ?? workflow.id,
                projectId: workflow.projectId,
                triggerKind: target?.kind ?? null,
                published: !isNil(published),
                enabled: workflow.status === WorkflowStatus.ENABLED,
                respondsWithData: !isNil(published) && respondsWithData(published),
                params: isNil(published) ? [] : paramsOfWorkflow(published),
            }
        })
    },

    async workflowIdsInProject({ projectId, workflowIds }: { projectId: string, workflowIds: string[] }): Promise<string[]> {
        if (workflowIds.length === 0) {
            return []
        }
        const workflows = await workflowRepo().find({ where: { projectId, id: In(workflowIds) }, select: ['id'] })
        return workflows.map((workflow) => workflow.id)
    },

    async resolveWorkflowTarget({ projectId, workflowId }: { projectId: string, workflowId: string }): Promise<WorkflowTarget | null> {
        const workflow = await workflowRepo().findOne({ where: { projectId, id: workflowId }, select: ['id', 'status', 'publishedVersionId'] })
        if (isNil(workflow) || isNil(workflow.publishedVersionId)) {
            return null
        }
        const version = await workflowVersionRepo().findOneBy({ id: workflow.publishedVersionId })
        const target = isNil(version) ? null : classify(version)
        return isNil(target) ? null : { ...target, workflowId: workflow.id, enabled: workflow.status === WorkflowStatus.ENABLED }
    },

    async connectorActionParams({ tenantId, connectorName, actionName }: ConnectorActionRef): Promise<McpToolParam[] | null> {
        const action = await loadAction({ log, tenantId, connectorName, actionName })
        return isNil(action) ? null : mcpToolModel.paramsFromProps(action.props)
    },

    async connectorNeedsAuth({ tenantId, connectorName, actionName }: ConnectorActionRef): Promise<boolean> {
        const action = await loadAction({ log, tenantId, connectorName, actionName })
        return !isNil(action) && action.needsAuth
    },

    async facts({ tenantId, projectId, tools }: FactsParams): Promise<ToolFacts> {
        const sourceProblems = new Map<string, { level: McpServiceIssueLevel, code: McpServiceIssueCode }>()
        const expectedParams = new Map<string, McpToolParam[]>()
        const connectorsNeedingAuth = new Set<string>()
        const workflowIds = tools.flatMap((tool) => (tool.source.type === McpToolSourceType.WORKFLOW ? [tool.source.workflowId] : []))
        const workflows = workflowIds.length === 0 ? [] : await workflowRepo().find({ where: { projectId, id: In(workflowIds) }, select: ['id', 'status', 'publishedVersionId'] })
        const versions = await publishedVersions({ versionIds: workflows.flatMap((workflow) => (isNil(workflow.publishedVersionId) ? [] : [workflow.publishedVersionId])) })
        for (const tool of tools) {
            const source = tool.source
            if (source.type === McpToolSourceType.WORKFLOW) {
                const workflow = workflows.find((candidate) => candidate.id === source.workflowId)
                const version = isNil(workflow?.publishedVersionId) ? undefined : versions.get(workflow.publishedVersionId)
                const problem = workflowProblem({ workflow, version })
                if (!isNil(problem)) {
                    sourceProblems.set(tool.id, problem)
                }
                if (!isNil(version) && classify(version)?.kind === McpToolTriggerKind.SUBFLOW) {
                    expectedParams.set(tool.id, paramsOfWorkflow(version))
                }
                continue
            }
            const action = await loadAction({ log, tenantId, connectorName: source.connectorName, actionName: source.actionName })
            if (isNil(action)) {
                sourceProblems.set(tool.id, { level: McpServiceIssueLevel.ERROR, code: action === undefined ? McpServiceIssueCode.SOURCE_CONNECTOR_MISSING : McpServiceIssueCode.SOURCE_ACTION_MISSING })
                continue
            }
            expectedParams.set(tool.id, mcpToolModel.paramsFromProps(action.props))
            if (action.needsAuth) {
                connectorsNeedingAuth.add(source.connectorName)
            }
        }
        return { sourceProblems, expectedParams, connectorsNeedingAuth: [...connectorsNeedingAuth] }
    },
})

async function loadAction({ log, tenantId, connectorName, actionName }: ConnectorActionRef & { log: FastifyBaseLogger }): Promise<LoadedAction | null | undefined> {
    const { data: metadata } = await tryCatch(() => connectorMetadataService(log).get({ name: connectorName, version: undefined, tenantId }))
    if (isNil(metadata)) {
        return undefined
    }
    const action = metadata.actions[actionName]
    if (isNil(action)) {
        return null
    }
    const props: Record<string, PropLike> = Object.fromEntries(Object.entries(action.props).map(([name, prop]) => [name, {
        type: prop.type,
        displayName: prop.displayName,
        description: prop.description,
        required: prop.required,
    }]))
    return { props, needsAuth: !isNil(metadata.auth) && action.requireAuth !== false }
}

async function publishedVersions({ versionIds }: { versionIds: string[] }): Promise<Map<string, WorkflowVersion>> {
    if (versionIds.length === 0) {
        return new Map()
    }
    const versions = await workflowVersionRepo().find({ where: { id: In(versionIds) } })
    return new Map(versions.map((version) => [version.id, version]))
}

async function latestVersions({ workflowIds }: { workflowIds: string[] }): Promise<Map<string, Pick<WorkflowVersion, 'displayName'>>> {
    if (workflowIds.length === 0) {
        return new Map()
    }
    const rows = await workflowVersionRepo()
        .createQueryBuilder('version')
        .distinctOn(['version.workflowId'])
        .where('version."workflowId" IN (:...workflowIds)', { workflowIds })
        .orderBy('version.workflowId')
        .addOrderBy('version.created', 'DESC')
        .select(['version.workflowId', 'version.displayName'])
        .getMany()
    return new Map(rows.map((row) => [row.workflowId, { displayName: row.displayName }]))
}

function workflowProblem({ workflow, version }: { workflow: { status: WorkflowStatus } | undefined, version: WorkflowVersion | undefined }): { level: McpServiceIssueLevel, code: McpServiceIssueCode } | null {
    if (isNil(workflow)) {
        return { level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.SOURCE_WORKFLOW_MISSING }
    }
    if (isNil(version)) {
        return { level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.SOURCE_WORKFLOW_NOT_PUBLISHED }
    }
    if (isNil(classify(version))) {
        return { level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.SOURCE_WORKFLOW_WRONG_TRIGGER }
    }
    if (workflow.status !== WorkflowStatus.ENABLED) {
        return { level: McpServiceIssueLevel.WARNING, code: McpServiceIssueCode.SOURCE_WORKFLOW_DISABLED }
    }
    return null
}

function classify(version: Pick<WorkflowVersion, 'trigger'>): { kind: McpToolTriggerKind, headers: Record<string, string> } | null {
    const trigger = version.trigger
    if (trigger.type !== WorkflowTriggerType.CONNECTOR) {
        return null
    }
    const { connectorName, triggerName } = trigger.settings
    if (connectorName === SUBFLOWS_CONNECTOR && triggerName === CALLABLE_TRIGGER) {
        return { kind: McpToolTriggerKind.SUBFLOW, headers: {} }
    }
    if (connectorName === WEBHOOK_CONNECTOR && triggerName === CATCH_WEBHOOK_TRIGGER) {
        const headers = webhookAuthHeaders(version)
        return isNil(headers) ? null : { kind: McpToolTriggerKind.WEBHOOK, headers }
    }
    return null
}

function paramsOfWorkflow(version: Pick<WorkflowVersion, 'trigger'>): McpToolParam[] {
    const input: Record<string, unknown> = version.trigger.settings?.input ?? {}
    const example = input['exampleData']
    const sample = typeof example === 'object' && !isNil(example) && !Array.isArray(example) ? Reflect.get(example, 'sampleData') : undefined
    return mcpToolModel.paramsFromSample(sample)
}

function respondsWithData(version: WorkflowVersion): boolean {
    return workflowStructureUtil.getAllSteps(version.trigger).some((step) => 'actionName' in step.settings
        && ((step.settings.connectorName === WEBHOOK_CONNECTOR && WEBHOOK_RESPONSE_ACTIONS.includes(String(step.settings.actionName)))
            || (step.settings.connectorName === SUBFLOWS_CONNECTOR && step.settings.actionName === SUBFLOW_RESPONSE_ACTION)))
}

function webhookAuthHeaders(version: Pick<WorkflowVersion, 'trigger'>): Record<string, string> | null {
    const input: Record<string, unknown> = version.trigger.settings?.input ?? {}
    const authType = input['authType'] ?? 'none'
    const rawFields = input['authFields']
    const fields = typeof rawFields === 'object' && !isNil(rawFields) ? rawFields : {}
    const read = (key: string): string | null => {
        const value: unknown = Reflect.get(fields, key)
        return typeof value === 'string' && !value.includes('{{') ? value : null
    }
    switch (authType) {
        case 'none':
            return {}
        case 'basic': {
            const username = read('username')
            const password = read('password')
            return isNil(username) || isNil(password) ? null : { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
        }
        case 'header': {
            const name = read('headerName')
            const value = read('headerValue')
            return isNil(name) || isNil(value) ? null : { [name.toLowerCase()]: value }
        }
        default:
            return null
    }
}

const WEBHOOK_CONNECTOR = '@fema-ipaas/connector-webhook'
const CATCH_WEBHOOK_TRIGGER = 'catch_webhook'
const WEBHOOK_RESPONSE_ACTIONS = ['return_response', 'return_response_and_wait_for_next_webhook']
const SUBFLOWS_CONNECTOR = '@fema-ipaas/connector-subflows'
const CALLABLE_TRIGGER = 'callableWorkflow'
const SUBFLOW_RESPONSE_ACTION = 'returnResponse'

type ConnectorActionRef = {
    tenantId: string
    connectorName: string
    actionName: string
}

type LoadedAction = {
    props: Record<string, PropLike>
    needsAuth: boolean
}

type FactsParams = {
    tenantId: string
    projectId: string
    tools: McpServiceTool[]
}

type ToolFacts = {
    sourceProblems: Map<string, { level: McpServiceIssueLevel, code: McpServiceIssueCode }>
    expectedParams: Map<string, McpToolParam[]>
    connectorsNeedingAuth: string[]
}

export type WorkflowTarget = {
    workflowId: string
    kind: McpToolTriggerKind
    headers: Record<string, string>
    enabled: boolean
}
