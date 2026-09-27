import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
    ApplicationError,
    ErrorCode,
    generateId,
    isNil,
    McpService,
    McpServiceWithToken,
    McpToolCandidate,
    McpToolTriggerKind,
    ProjectId,
    UpsertMcpServiceRequestBody,
    WorkflowStatus,
    workflowStructureUtil,
    WorkflowTriggerType,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { McpServiceEntity, McpServiceSchema } from './mcp-service.entity'

export const mcpServiceRepo = repoFactory(McpServiceEntity)

export const mcpServiceService = (log: FastifyBaseLogger) => ({
    async list({ projectId }: { projectId: ProjectId }): Promise<McpService[]> {
        const services = await mcpServiceRepo().find({ where: { projectId }, order: { created: 'ASC' } })
        return services.map(toModel)
    },

    async getOneOrThrow({ id, projectId }: ServiceRef): Promise<McpService> {
        return toModel(await findOrThrow({ id, projectId }))
    },

    async candidates({ projectId }: { projectId: ProjectId }): Promise<McpToolCandidate[]> {
        const published = await publishedWebhookWorkflows({ projectId })
        return published.map(({ workflowId, enabled, version }) => ({
            workflowId,
            displayName: version.displayName,
            triggerKind: McpToolTriggerKind.WEBHOOK,
            enabled,
            respondsWithData: respondsWithData(version),
        }))
    },

    async create({ request }: { request: UpsertMcpServiceRequestBody }): Promise<McpServiceWithToken> {
        await assertToolsAllowed({ projectId: request.projectId, request })
        const id = generateId()
        const token = newToken()
        await mcpServiceRepo().save({
            id,
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            projectId: request.projectId,
            name: request.name.trim(),
            description: request.description,
            enabled: request.enabled,
            tools: request.tools,
            tokenHash: hashOf(token),
            tokenHint: token.slice(-TOKEN_HINT_LENGTH),
            lastUsedAt: null,
        })
        log.info({ project: { id: request.projectId }, mcpService: { id } }, '[mcpServiceService#create] MCP service created')
        return { ...(await this.getOneOrThrow({ id, projectId: request.projectId })), token }
    },

    async update({ id, request }: { id: string, request: UpsertMcpServiceRequestBody }): Promise<McpService> {
        const existing = await findOrThrow({ id, projectId: request.projectId })
        await assertToolsAllowed({ projectId: request.projectId, request })
        await mcpServiceRepo().save({
            ...existing,
            name: request.name.trim(),
            description: request.description,
            enabled: request.enabled,
            tools: request.tools,
        })
        return this.getOneOrThrow({ id, projectId: request.projectId })
    },

    async rotateToken({ id, projectId }: ServiceRef): Promise<McpServiceWithToken> {
        await findOrThrow({ id, projectId })
        const token = newToken()
        await mcpServiceRepo().update({ id, projectId }, { tokenHash: hashOf(token), tokenHint: token.slice(-TOKEN_HINT_LENGTH) })
        return { ...(await this.getOneOrThrow({ id, projectId })), token }
    },

    async delete({ id, projectId }: ServiceRef): Promise<void> {
        await findOrThrow({ id, projectId })
        await mcpServiceRepo().delete({ id, projectId })
    },

    async authenticate({ id, authorization }: { id: string, authorization: string | undefined }): Promise<McpServiceSchema | null> {
        const token = tokenFromHeader(authorization)
        const service = isNil(token) ? null : await mcpServiceRepo().findOneBy({ id })
        if (isNil(service) || isNil(token) || !service.enabled || !hashesMatch({ stored: service.tokenHash, candidate: hashOf(token) })) {
            return null
        }
        if (isNil(service.lastUsedAt) || dayjs(service.lastUsedAt).isBefore(dayjs().subtract(LAST_USED_RESOLUTION_MINUTES, 'minute'))) {
            await mcpServiceRepo().update({ id: service.id }, { lastUsedAt: dayjs().toISOString() })
        }
        return service
    },

    async resolveTool({ service, toolName }: { service: McpServiceSchema, toolName: string }): Promise<ResolvedTool | null> {
        const tool = service.tools.find((candidate) => candidate.name === toolName)
        if (isNil(tool)) {
            return null
        }
        const [match] = await publishedWebhookWorkflows({ projectId: service.projectId, workflowIds: [tool.workflowId] })
        if (isNil(match)) {
            return null
        }
        return { workflowId: match.workflowId, enabled: match.enabled, headers: authHeadersOf(match.version) ?? {} }
    },
})

async function findOrThrow({ id, projectId }: ServiceRef): Promise<McpServiceSchema> {
    const service = await mcpServiceRepo().findOneBy({ id, projectId })
    if (isNil(service)) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'McpService' } })
    }
    return service
}

async function assertToolsAllowed({ projectId, request }: { projectId: ProjectId, request: UpsertMcpServiceRequestBody }): Promise<void> {
    const workflowIds = [...new Set(request.tools.map((tool) => tool.workflowId))]
    if (workflowIds.length === 0) {
        return
    }
    const allowed = await publishedWebhookWorkflows({ projectId, workflowIds })
    const missing = workflowIds.filter((workflowId) => !allowed.some((candidate) => candidate.workflowId === workflowId))
    if (missing.length > 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'Only published workflows that start with a Webhook trigger can be MCP tools' },
        })
    }
}

async function publishedWebhookWorkflows({ projectId, workflowIds }: { projectId: ProjectId, workflowIds?: string[] }): Promise<PublishedWorkflow[]> {
    const workflows = await workflowRepo().find({
        where: { projectId, ...(isNil(workflowIds) ? {} : { id: In(workflowIds) }) },
        select: ['id', 'status', 'publishedVersionId'],
    })
    const published = workflows.flatMap((workflow) => (isNil(workflow.publishedVersionId) ? [] : [{ workflow, versionId: workflow.publishedVersionId }]))
    if (published.length === 0) {
        return []
    }
    const versions = await workflowVersionRepo().find({ where: { id: In(published.map((item) => item.versionId)) } })
    return published.flatMap(({ workflow, versionId }) => {
        const version = versions.find((candidate) => candidate.id === versionId)
        if (isNil(version) || !isWebhookTriggered(version) || isNil(authHeadersOf(version))) {
            return []
        }
        return [{ workflowId: workflow.id, enabled: workflow.status === WorkflowStatus.ENABLED, version }]
    })
}

function isWebhookTriggered(version: WorkflowVersion): boolean {
    const trigger = version.trigger
    return trigger.type === WorkflowTriggerType.CONNECTOR
        && trigger.settings.connectorName === WEBHOOK_CONNECTOR
        && trigger.settings.triggerName === CATCH_WEBHOOK_TRIGGER
}

function respondsWithData(version: WorkflowVersion): boolean {
    return workflowStructureUtil.getAllSteps(version.trigger).some((step) => 'actionName' in step.settings
        && step.settings.connectorName === WEBHOOK_CONNECTOR
        && RESPONSE_ACTIONS.includes(String(step.settings.actionName)))
}

function authHeadersOf(version: WorkflowVersion): Record<string, string> | null {
    const input: Record<string, unknown> = version.trigger.settings?.input ?? {}
    const authType = input.authType ?? 'none'
    const fields = typeof input.authFields === 'object' && !isNil(input.authFields) ? input.authFields : {}
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

function newToken(): string {
    return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`
}

function hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

function hashesMatch({ stored, candidate }: { stored: string, candidate: string }): boolean {
    const left = Buffer.from(stored, 'utf8')
    const right = Buffer.from(candidate, 'utf8')
    return left.length === right.length && timingSafeEqual(left, right)
}

function tokenFromHeader(authorization: string | undefined): string | null {
    const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '')
    return isNil(match) ? null : match[1].trim()
}

function toModel(service: McpServiceSchema): McpService {
    return {
        id: service.id,
        created: service.created,
        updated: service.updated,
        projectId: service.projectId,
        name: service.name,
        description: service.description,
        enabled: service.enabled,
        tools: service.tools,
        tokenHint: service.tokenHint,
        lastUsedAt: service.lastUsedAt,
    }
}

const WEBHOOK_CONNECTOR = '@fema-ipaas/connector-webhook'
const CATCH_WEBHOOK_TRIGGER = 'catch_webhook'
const RESPONSE_ACTIONS = ['return_response', 'return_response_and_wait_for_next_webhook']
const TOKEN_PREFIX = 'mcp_'
const TOKEN_BYTES = 32
const TOKEN_HINT_LENGTH = 4
const LAST_USED_RESOLUTION_MINUTES = 5

type ServiceRef = {
    id: string
    projectId: ProjectId
}

type PublishedWorkflow = {
    workflowId: string
    enabled: boolean
    version: WorkflowVersion
}

export type ResolvedTool = {
    workflowId: string
    enabled: boolean
    headers: Record<string, string>
}
