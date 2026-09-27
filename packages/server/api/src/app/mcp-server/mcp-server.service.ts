import { ApplicationError, ErrorCode, generateId, isNil, Permission, unique } from '@fema-ipaas/core-utils'
import {
    AccessibleConnection,
    AI_CONNECTOR_NAME,
    connectionAccessUtils,
    ConnectionPermission,
    ConnectionSharePermission,
    ConnectionStatus,
    ConnectionType,
    CustomAuthConnectionValue,
    MCP_CONNECTOR_NAME,
    McpServer,
    McpServerAuthInput,
    McpServerAuthType,
    McpServerProbeError,
    McpServerProbeFailure,
    McpServerProbeResult,
    McpServerSaveResponse,
    McpServerStatus,
    McpServerToolTrialResult,
    McpServerTransport,
    McpServerUsage,
    McpServerUsageItem,
    McpServerUsageKind,
    mcpServerUtils,
    McpServerWorkflowUsage,
    OAuth2GrantType,
    PrincipalType,
    SyncMcpServerToolsResponse,
    TestMcpServerRequestBody,
    TryMcpServerToolRequestBody,
    UpsertMcpServerRequestBody,
    workflowStructureUtil,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { actionRunService, ActionRunStatus } from '../action-run/action-run.service'
import { connectionAccessService, connectionScopeHelper } from '../connection/connection-access.service'
import { connectionReferenceService } from '../connection/connection-reference.service'
import { connectionService, connectionsRepo } from '../connection/connection-service/connection-service'
import { connectionShareService } from '../connection/connection-share.service'
import { ConnectionSchema } from '../connection/connection.entity'
import { repoFactory } from '../core/db/repo-factory'
import { encryptUtils } from '../helper/encryption'
import { projectAccess } from '../project/project-access'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { McpServerEntity, McpServerSchema } from './mcp-server.entity'

export const mcpServerRepo = repoFactory(McpServerEntity)

export const mcpServerService = (log: FastifyBaseLogger) => ({
    async list({ tenantId, userId, search }: ListParams): Promise<McpServer[]> {
        const page = await connectionShareService(log).listAccessible({
            tenantId,
            userId,
            query: { connectorName: MCP_CONNECTOR_NAME, limit: LIST_LIMIT },
        })
        const servers = await toModels({ log, tenantId, userId, connections: page.data })
        const needle = search?.trim().toLowerCase() ?? ''
        if (needle.length === 0) {
            return servers
        }
        return servers.filter((server) => [server.displayName, server.description, server.url, ...server.tools.flatMap((tool) => [tool.name, tool.title ?? '', tool.description])]
            .join(' ').toLowerCase().includes(needle))
    },

    async get({ tenantId, userId, id }: ServerRef): Promise<McpServer> {
        const connection = await findAccessibleOrThrow({ log, tenantId, userId, id })
        const [server] = await toModels({ log, tenantId, userId, connections: [connection] })
        return server
    },

    async test({ tenantId, principal, request }: TestParams): Promise<McpServerProbeResult> {
        await assertMemberOf({ log, principal, projectId: request.projectId })
        const existing = isNil(request.serverId) ? null : await loadManaged({ log, tenantId, principal, id: request.serverId })
        if (request.auth.type === McpServerAuthType.OAUTH2) {
            if (isNil(existing) || existing.connection.type !== ConnectionType.OAUTH2) {
                return { ok: false, error: { failure: McpServerProbeFailure.OAUTH_NOT_AUTHORIZED, detail: 'Authorize the server before testing it', host: mcpServerUtils.hostOf(request.url) } }
            }
            const projectId = await connectionAccessService(log).projectToActIn({ connection: existing.connection, principal })
            return probe({ log, tenantId, projectId, auth: referenceTo(existing.connection), url: request.url })
        }
        const storedToken = isNil(existing) ? null : await storedBearerToken(existing.connection)
        return probe({
            log,
            tenantId,
            projectId: request.projectId,
            auth: customAuthValue({ url: request.url, transport: request.transport, auth: request.auth, storedToken }),
            url: request.url,
        })
    },

    async create({ tenantId, principal, request }: CreateParams): Promise<McpServerSaveResponse> {
        await assertMemberOf({ log, principal, projectId: request.projectId })
        await assertCanPlace({ log, principal, allProjects: request.allProjects, projectIds: request.projectIds })
        await assertNameFree({ tenantId, displayName: request.displayName, exceptId: null })
        const scope = connectionScopeHelper.toScopeFields({ allProjects: request.allProjects, projectIds: request.projectIds })
        const externalId = `mcp-server-${generateId().toLowerCase()}`
        const isOAuth = request.auth.type === McpServerAuthType.OAUTH2
        const customProbe = isOAuth ? null : await probe({
            log,
            tenantId,
            projectId: request.projectId,
            auth: customAuthValue({ url: request.url, transport: request.transport, auth: request.auth, storedToken: null }),
            url: request.url,
        })
        if (!isNil(customProbe) && !customProbe.ok && request.saveWithoutPassingTest !== true) {
            throw testFailed(customProbe.error)
        }
        const saved = await connectionService(log).upsert({
            projectIds: scope.projectIds,
            ownerId: principal.id,
            tenantId,
            scope: scope.scope,
            preSelectForNewProjects: scope.preSelectForNewProjects,
            externalId,
            displayName: request.displayName,
            connectorName: MCP_CONNECTOR_NAME,
            type: isOAuth ? ConnectionType.OAUTH2 : ConnectionType.CUSTOM_AUTH,
            value: isOAuth ? oauthValue({ request }) : customAuthValue({ url: request.url, transport: request.transport, auth: request.auth, storedToken: null }),
            status: isNil(customProbe) || customProbe.ok ? ConnectionStatus.ACTIVE : ConnectionStatus.ERROR,
            skipEngineValidation: true,
        })
        await connectionsRepo().update({ id: saved.id, tenantId }, { projectMembersPermission: ConnectionSharePermission.USE })
        const connection = await connectionsRepo().findOneOrFail({ where: { id: saved.id, tenantId }, relations: { owner: { identity: true } } })
        const oauthProbe = isOAuth
            ? await probe({ log, tenantId, projectId: await connectionAccessService(log).projectToActIn({ connection, principal }), auth: referenceTo(connection), url: request.url })
            : null
        const result = customProbe ?? oauthProbe
        await mcpServerRepo().save({
            id: generateId(),
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            tenantId,
            connectionId: connection.id,
            description: request.description,
            url: request.url.trim(),
            transport: request.transport,
            authType: request.auth.type,
            tools: result?.ok === true ? result.tools : [],
            lastSyncedAt: result?.ok === true ? dayjs().toISOString() : null,
            lastError: isNil(result) || result.ok ? null : result.error,
        })
        await applyStatus({ connection, result })
        log.info({ connection: { id: connection.id }, mcpServer: { ok: result?.ok ?? null } }, '[mcpServerService#create] External MCP server added')
        return { server: await this.get({ tenantId, userId: principal.id, id: connection.id }), probe: result ?? null }
    },

    async update({ tenantId, principal, id, request }: UpdateParams): Promise<McpServerSaveResponse> {
        const { connection, row } = await loadManaged({ log, tenantId, principal, id })
        await assertNameFree({ tenantId, displayName: request.displayName, exceptId: connection.id })
        const nextScope = connectionScopeHelper.toScopeFields({ allProjects: request.allProjects, projectIds: request.projectIds, current: connection })
        const narrowing = await projectsLosingUsage({ log, tenantId, connection, next: { ...connection, ...nextScope } })
        if (narrowing.length > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Workflows in the projects you removed still use this server: ${narrowing.join(', ')}` },
            })
        }
        const addedProjects = request.projectIds.filter((projectId) => !connection.projectIds.includes(projectId))
        await assertCanPlace({ log, principal, allProjects: request.allProjects && !connectionAccessUtils.isAvailableToAllProjects(connection), projectIds: addedProjects })
        const settingsChanged = row.url !== request.url.trim() || row.transport !== request.transport || row.authType !== request.auth.type || hasNewSecret(request.auth)
        let result: McpServerProbeResult | null = null
        if (settingsChanged && request.auth.type !== McpServerAuthType.OAUTH2) {
            const storedToken = await storedBearerToken(connection)
            const value = customAuthValue({ url: request.url, transport: request.transport, auth: request.auth, storedToken })
            result = await probe({ log, tenantId, projectId: request.projectId, auth: value, url: request.url })
            if (!result.ok && request.saveWithoutPassingTest !== true) {
                throw testFailed(result.error)
            }
            await connectionsRepo().update({ id: connection.id, tenantId }, { value: await encryptUtils.encryptObject(value), type: ConnectionType.CUSTOM_AUTH })
        }
        if (settingsChanged && request.auth.type === McpServerAuthType.OAUTH2 && !isNil(request.auth.code)) {
            await connectionService(log).upsert({
                projectIds: connection.projectIds,
                ownerId: connection.ownerId ?? principal.id,
                tenantId,
                scope: connection.scope,
                preSelectForNewProjects: connection.preSelectForNewProjects,
                externalId: connection.externalId,
                displayName: request.displayName,
                connectorName: MCP_CONNECTOR_NAME,
                type: ConnectionType.OAUTH2,
                value: oauthValue({ request }),
                skipEngineValidation: true,
            })
        }
        if (settingsChanged && request.auth.type === McpServerAuthType.OAUTH2 && isNil(request.auth.code) && connection.type === ConnectionType.OAUTH2) {
            await rewriteOAuthTarget({ connection, url: request.url, transport: request.transport })
        }
        await connectionsRepo().update({ id: connection.id, tenantId }, { displayName: request.displayName, ...nextScope })
        const refreshed = await connectionsRepo().findOneOrFail({ where: { id: connection.id, tenantId }, relations: { owner: { identity: true } } })
        if (settingsChanged && request.auth.type === McpServerAuthType.OAUTH2) {
            result = await probe({ log, tenantId, projectId: await connectionAccessService(log).projectToActIn({ connection: refreshed, principal }), auth: referenceTo(refreshed), url: request.url })
        }
        await mcpServerRepo().save({
            ...row,
            description: request.description,
            url: request.url.trim(),
            transport: request.transport,
            authType: request.auth.type,
            ...(isNil(result) ? {} : result.ok
                ? { tools: result.tools, lastSyncedAt: dayjs().toISOString(), lastError: null }
                : { lastError: result.error }),
        })
        await applyStatus({ connection: refreshed, result })
        return { server: await this.get({ tenantId, userId: principal.id, id }), probe: result }
    },

    async sync({ tenantId, principal, id }: ManagedRef): Promise<SyncMcpServerToolsResponse> {
        const { connection, row } = await loadManaged({ log, tenantId, principal, id })
        const projectId = await connectionAccessService(log).projectToActIn({ connection, principal })
        const result = await probe({ log, tenantId, projectId, auth: referenceTo(connection), url: row.url })
        if (!result.ok) {
            await mcpServerRepo().save({ ...row, lastError: result.error })
            await applyStatus({ connection, result })
            return { server: await this.get({ tenantId, userId: principal.id, id }), probe: result, added: [], removed: [], removedInUse: [] }
        }
        const before = row.tools.map((tool) => tool.name)
        const after = result.tools.map((tool) => tool.name)
        const removed = before.filter((name) => !after.includes(name))
        const usage = removed.length === 0 ? null : await collectUsage({ log, tenantId, connection, url: row.url })
        const usedTools = unique((usage ?? []).flatMap((workflow) => workflow.items.map((item) => item.toolName)).filter((name): name is string => !isNil(name)))
        await mcpServerRepo().save({ ...row, tools: result.tools, lastSyncedAt: dayjs().toISOString(), lastError: null })
        await applyStatus({ connection, result })
        return {
            server: await this.get({ tenantId, userId: principal.id, id }),
            probe: result,
            added: after.filter((name) => !before.includes(name)),
            removed,
            removedInUse: removed.filter((name) => usedTools.includes(name)),
        }
    },

    async tryTool({ tenantId, principal, id, request }: TryToolParams): Promise<TryToolResult> {
        const connection = await findAccessibleOrThrow({ log, tenantId, userId: principal.id, id })
        await assertMemberOf({ log, principal, projectId: request.projectId })
        const projectId = connectionAccessUtils.isAvailableInProject({ connection, projectId: request.projectId })
            ? request.projectId
            : await connectionAccessService(log).projectToActIn({ connection, principal })
        const outcome = await actionRunService(log).runConnectorAction({
            tenantId,
            projectId,
            connectorName: MCP_CONNECTOR_NAME,
            actionName: CALL_TOOL_ACTION,
            input: { auth: referenceExpression(connection.externalId), tool: request.toolName, arguments: request.arguments },
        })
        const output = ToolOutput.safeParse(outcome.output)
        const result: McpServerToolTrialResult = {
            ok: outcome.status === ActionRunStatus.SUCCEEDED,
            isError: outcome.status !== ActionRunStatus.SUCCEEDED || (output.success && output.data.isError === true),
            text: output.success ? output.data.text ?? '' : '',
            structured: output.success ? output.data.structured ?? null : null,
            errorMessage: outcome.errorMessage,
            durationMs: outcome.durationMs,
        }
        return { result, connection }
    },

    async usage({ tenantId, userId, id }: ServerRef): Promise<McpServerUsage> {
        const connection = await findAccessibleOrThrow({ log, tenantId, userId, id })
        const row = await ensureRow({ connection })
        const workflows = await collectUsage({ log, tenantId, connection, url: row.url })
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const visible = workflows.filter((workflow) => memberProjectIds.includes(workflow.projectId))
        return { workflows: visible, hiddenWorkflowCount: workflows.length - visible.length }
    },

    async delete({ tenantId, principal, id }: ManagedRef): Promise<ConnectionSchema> {
        const { connection, row } = await loadManaged({ log, tenantId, principal, id, requireOwnerOrAdmin: true })
        const workflows = await collectUsage({ log, tenantId, connection, url: row.url })
        if (workflows.length > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `This MCP server is still used by ${workflows.length} workflow(s); remove those steps or agent tools first` },
            })
        }
        await connectionsRepo().delete({ id: connection.id, tenantId })
        return connection
    },
})

async function toModels({ log, tenantId, userId, connections }: ToModelsParams): Promise<McpServer[]> {
    if (connections.length === 0) {
        return []
    }
    const [rows, isAdmin] = await Promise.all([
        mcpServerRepo().find({ where: connections.map((connection) => ({ connectionId: connection.id, tenantId })) }),
        connectionAccessService(log).isTenantAdmin({ userId, tenantId }),
    ])
    const models = await Promise.all(connections.map(async (connection) => {
        const row = rows.find((candidate) => candidate.connectionId === connection.id) ?? await ensureRow({ connection })
        return toModel({ connection, row, isAdmin, userId })
    }))
    return models
}

function toModel({ connection, row, isAdmin, userId }: ToModelParams): McpServer {
    const permission = 'myPermission' in connection ? connection.myPermission : null
    const owner = connection.owner
    const connected = connection.status === ConnectionStatus.ACTIVE && isNil(row.lastError)
    return {
        id: connection.id,
        connectionId: connection.id,
        externalId: connection.externalId,
        created: dayjs(connection.created).toISOString(),
        updated: dayjs(connection.updated).toISOString(),
        displayName: connection.displayName,
        description: row.description,
        url: row.url,
        transport: row.transport,
        authType: row.authType,
        authConfigured: row.authType === McpServerAuthType.NONE || connection.status !== ConnectionStatus.MISSING,
        status: connected ? McpServerStatus.CONNECTED : McpServerStatus.ERROR,
        connectionStatus: connection.status,
        lastError: row.lastError,
        tools: row.tools,
        lastSyncedAt: isNil(row.lastSyncedAt) ? null : dayjs(row.lastSyncedAt).toISOString(),
        allProjects: 'allProjects' in connection ? connection.allProjects : false,
        projectIds: connection.projectIds,
        projects: 'projects' in connection ? connection.projects : [],
        ownerId: connection.ownerId ?? null,
        ownerName: isNil(owner) ? null : `${owner.firstName} ${owner.lastName}`.trim() || owner.email,
        myPermission: permission,
        canManage: isAdmin || connection.ownerId === userId || permission === ConnectionPermission.EDIT,
    }
}

async function ensureRow({ connection }: { connection: { id: string, tenantId?: string | null, type: ConnectionType } }): Promise<McpServerSchema> {
    const tenantId = connection.tenantId ?? ''
    const existing = await mcpServerRepo().findOneBy({ connectionId: connection.id, tenantId })
    if (!isNil(existing)) {
        return existing
    }
    const stored = await connectionsRepo().findOneByOrFail({ id: connection.id, tenantId })
    const value = await encryptUtils.decryptObject<unknown>(stored.value)
    const props = StoredProps.safeParse(value)
    const row: McpServerSchema = {
        id: generateId(),
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId,
        connectionId: connection.id,
        description: '',
        url: props.success ? props.data.props.url : '',
        transport: props.success && props.data.props.transport === McpServerTransport.SSE ? McpServerTransport.SSE : McpServerTransport.STREAMABLE_HTTP,
        authType: connection.type === ConnectionType.CUSTOM_AUTH
            ? (props.success && !isNil(props.data.props.token) && props.data.props.token.length > 0 && props.data.props.authType !== McpServerAuthType.NONE ? McpServerAuthType.BEARER : McpServerAuthType.NONE)
            : McpServerAuthType.OAUTH2,
        tools: [],
        lastSyncedAt: null,
        lastError: null,
    }
    await mcpServerRepo().save(row)
    return row
}

async function probe({ log, tenantId, projectId, auth, url }: ProbeParams): Promise<McpServerProbeResult> {
    const outcome = await actionRunService(log).runConnectorAction({
        tenantId,
        projectId,
        connectorName: MCP_CONNECTOR_NAME,
        actionName: TEST_SERVER_ACTION,
        input: { auth },
        timeoutSeconds: PROBE_TIMEOUT_SECONDS,
    })
    const parsed = McpServerProbeResult.safeParse(outcome.output)
    if (outcome.status === ActionRunStatus.SUCCEEDED && parsed.success) {
        return parsed.data
    }
    log.warn({ mcpServer: { host: mcpServerUtils.hostOf(url) }, status: outcome.status }, '[mcpServerService#probe] The worker could not test the MCP server')
    return {
        ok: false,
        error: {
            failure: McpServerProbeFailure.WORKER_UNAVAILABLE,
            detail: outcome.errorMessage ?? 'The worker could not run the connection test',
            host: mcpServerUtils.hostOf(url),
        },
    }
}

async function applyStatus({ connection, result }: { connection: Pick<ConnectionSchema, 'id' | 'tenantId'>, result: McpServerProbeResult | null }): Promise<void> {
    if (isNil(result)) {
        return
    }
    await connectionsRepo().update({ id: connection.id, tenantId: connection.tenantId }, { status: result.ok ? ConnectionStatus.ACTIVE : ConnectionStatus.ERROR })
}

async function collectUsage({ log, tenantId, connection, url }: CollectUsageParams): Promise<McpServerWorkflowUsage[]> {
    const reference = `connections['${connection.externalId}']`
    const builder = workflowVersionRepo()
        .createQueryBuilder('version')
        .innerJoin('workflow', 'workflow', 'workflow.id = version."workflowId"')
        .innerJoin('project', 'project', 'project.id = workflow."projectId"')
        .where('project."tenantId" = :tenantId', { tenantId })
        .andWhere('(version.id = workflow."publishedVersionId" OR version.id = (SELECT latest.id FROM workflow_version latest WHERE latest."workflowId" = workflow.id ORDER BY latest.created DESC LIMIT 1))')
        .andWhere('(version."connectionIds" && :externalIds OR version.trigger::text LIKE :referencePattern ESCAPE \'\\\' OR (:hasUrl AND version.trigger::text LIKE :urlPattern ESCAPE \'\\\'))', {
            externalIds: [connection.externalId],
            referencePattern: `%${escapeLike(reference)}%`,
            hasUrl: url.length > 0,
            urlPattern: `%${escapeLike(url)}%`,
        })
        .select(['version.id', 'version.workflowId', 'version.displayName', 'version.trigger'])
        .addSelect('workflow.projectId', 'projectId')
    const { entities, raw } = await builder.getRawAndEntities<{ projectId: string }>()
    const projects = await connectionReferenceService(log).projectRefs({ tenantId, projectIds: unique(raw.map((row) => row.projectId)) })
    const byWorkflow = new Map<string, McpServerWorkflowUsage>()
    entities.forEach((version, index) => {
        const projectId = raw[index]?.projectId ?? ''
        if (!connectionAccessUtils.isAvailableInProject({ connection, projectId })) {
            return
        }
        const items = usageItems({ version, externalId: connection.externalId, url })
        if (items.length === 0) {
            return
        }
        const current = byWorkflow.get(version.workflowId)
        const merged = [...(current?.items ?? []), ...items]
        byWorkflow.set(version.workflowId, {
            workflowId: version.workflowId,
            displayName: current?.displayName ?? version.displayName,
            projectId,
            projectDisplayName: projects.get(projectId)?.displayName ?? '',
            items: merged.filter((item, position) => merged.findIndex((other) => other.stepName === item.stepName && other.toolName === item.toolName && other.kind === item.kind) === position),
        })
    })
    return [...byWorkflow.values()]
}

function usageItems({ version, externalId, url }: { version: Pick<WorkflowVersion, 'trigger'>, externalId: string, url: string }): McpServerUsageItem[] {
    const reference = `connections['${externalId}']`
    return workflowStructureUtil.getAllSteps(version.trigger).flatMap((step): McpServerUsageItem[] => {
        const settings = step.settings
        if (!('connectorName' in settings)) {
            return []
        }
        const input: Record<string, unknown> = 'input' in settings && typeof settings.input === 'object' && !isNil(settings.input) ? settings.input : {}
        const inputText = JSON.stringify(input)
        if (settings.connectorName === MCP_CONNECTOR_NAME && typeof input['auth'] === 'string' && input['auth'].includes(reference)) {
            return [{ stepName: step.name, stepDisplayName: step.displayName, kind: McpServerUsageKind.STEP, toolName: typeof input['tool'] === 'string' ? input['tool'] : null }]
        }
        if (settings.connectorName === AI_CONNECTOR_NAME && (inputText.includes(reference) || (url.length > 0 && inputText.includes(url)))) {
            const allowed = Array.isArray(input['allowedTools']) ? input['allowedTools'].filter((name): name is string => typeof name === 'string') : []
            const names = allowed.length > 0 ? allowed : [null]
            return names.map((toolName) => ({ stepName: step.name, stepDisplayName: step.displayName, kind: McpServerUsageKind.AGENT, toolName }))
        }
        return []
    })
}

async function projectsLosingUsage({ log, tenantId, connection, next }: ProjectsLosingParams): Promise<string[]> {
    const row = await ensureRow({ connection })
    const workflows = await collectUsage({ log, tenantId, connection, url: row.url })
    return unique(workflows.filter((workflow) => !connectionAccessUtils.isAvailableInProject({ connection: next, projectId: workflow.projectId })).map((workflow) => workflow.displayName))
}

async function findAccessibleOrThrow({ log, tenantId, userId, id }: FindParams): Promise<AccessibleConnection> {
    const connection = await connectionsRepo().findOne({ where: { id, tenantId, connectorName: MCP_CONNECTOR_NAME }, relations: { owner: { identity: true } } })
    if (isNil(connection)) {
        throw notFound(id)
    }
    const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
    const [accessible] = await connectionShareService(log).enrich({ tenantId, userId, connections: [connection], memberProjectIds })
    if (isNil(accessible)) {
        throw notFound(id)
    }
    return accessible
}

async function loadManaged({ log, tenantId, principal, id, requireOwnerOrAdmin = false }: LoadManagedParams): Promise<{ connection: ConnectionSchema, row: McpServerSchema }> {
    const connection = await connectionsRepo().findOne({ where: { id, tenantId, connectorName: MCP_CONNECTOR_NAME }, relations: { owner: { identity: true } } })
    if (isNil(connection)) {
        throw notFound(id)
    }
    const isAdmin = await connectionAccessService(log).isTenantAdmin({ userId: principal.id, tenantId })
    const permission = await connectionAccessService(log).permissionFor({ connection, principal })
    const allowed = isAdmin || permission === ConnectionPermission.OWNER || (!requireOwnerOrAdmin && permission === ConnectionPermission.EDIT)
    if (!allowed) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Only the owner and tenant admins can change this MCP server' },
        })
    }
    return { connection, row: await ensureRow({ connection }) }
}

async function assertMemberOf({ log, principal, projectId }: { log: FastifyBaseLogger, principal: Principal, projectId: string }): Promise<void> {
    const role = await projectAccess(log).resolveRole({ userId: principal.id, projectId })
    if (isNil(role)) {
        throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'You are not a member of this project' } })
    }
}

async function assertCanPlace({ log, principal, allProjects, projectIds }: AssertCanPlaceParams): Promise<void> {
    const isAdmin = await connectionAccessService(log).isTenantAdmin({ userId: principal.id, tenantId: principal.tenantId })
    if (isAdmin) {
        return
    }
    if (allProjects) {
        throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Only tenant admins can make an MCP server available to all projects' } })
    }
    const roles = await Promise.all(projectIds.map((projectId) => projectAccess(log).resolveRole({ userId: principal.id, projectId })))
    if (roles.some((role) => isNil(role) || !role.permissions.includes(Permission.WRITE_CONNECTION))) {
        throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'You can only add MCP servers to projects you can edit' } })
    }
}

async function assertNameFree({ tenantId, displayName, exceptId }: { tenantId: string, displayName: string, exceptId: string | null }): Promise<void> {
    const clash = await connectionsRepo().findOneBy({ tenantId, connectorName: MCP_CONNECTOR_NAME, displayName: displayName.trim() })
    if (!isNil(clash) && clash.id !== exceptId) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'An MCP server with this name already exists' } })
    }
}

async function storedBearerToken(connection: ConnectionSchema): Promise<string | null> {
    if (connection.type !== ConnectionType.CUSTOM_AUTH) {
        return null
    }
    const value = StoredProps.safeParse(await encryptUtils.decryptObject<unknown>(connection.value))
    return value.success ? value.data.props.token ?? null : null
}

async function rewriteOAuthTarget({ connection, url, transport }: { connection: ConnectionSchema, url: string, transport: McpServerTransport }): Promise<void> {
    const stored = StoredOAuthValue.safeParse(await encryptUtils.decryptObject<unknown>(connection.value))
    if (!stored.success) {
        return
    }
    const next = { ...stored.data, props: { ...stored.data.props, url: url.trim(), transport } }
    await connectionsRepo().update({ id: connection.id, tenantId: connection.tenantId }, { value: await encryptUtils.encryptObject(next) })
}

function customAuthValue({ url, transport, auth, storedToken }: CustomAuthValueParams): CustomAuthConnectionValue {
    const token = auth.type === McpServerAuthType.BEARER ? (auth.token?.trim() || storedToken || '') : ''
    return {
        type: ConnectionType.CUSTOM_AUTH,
        props: {
            url: url.trim(),
            transport,
            authType: auth.type === McpServerAuthType.BEARER ? McpServerAuthType.BEARER : McpServerAuthType.NONE,
            ...(token.length > 0 ? { token } : {}),
        },
    }
}

function oauthValue({ request }: { request: UpsertMcpServerRequestBody }): {
    type: ConnectionType.OAUTH2
    client_id: string
    client_secret: string
    code: string
    code_challenge?: string
    redirect_url: string
    scope: string
    grant_type: OAuth2GrantType
    props: Record<string, string>
} {
    const auth = request.auth
    if (auth.type !== McpServerAuthType.OAUTH2 || isNil(auth.code) || isNil(auth.clientId) || isNil(auth.clientSecret) || isNil(auth.redirectUrl) || isNil(auth.authUrl) || isNil(auth.tokenUrl)) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Authorize the server with OAuth 2.0 before saving it' } })
    }
    return {
        type: ConnectionType.OAUTH2,
        client_id: auth.clientId,
        client_secret: auth.clientSecret,
        code: auth.code,
        ...(isNil(auth.codeVerifier) ? {} : { code_challenge: auth.codeVerifier }),
        redirect_url: auth.redirectUrl,
        scope: auth.scope ?? '',
        grant_type: OAuth2GrantType.AUTHORIZATION_CODE,
        props: {
            url: request.url.trim(),
            transport: request.transport,
            authUrl: auth.authUrl,
            tokenUrl: auth.tokenUrl,
        },
    }
}

function hasNewSecret(auth: McpServerAuthInput): boolean {
    if (auth.type === McpServerAuthType.BEARER) {
        return !isNil(auth.token) && auth.token.trim().length > 0
    }
    if (auth.type === McpServerAuthType.OAUTH2) {
        return !isNil(auth.code)
    }
    return false
}

function referenceTo(connection: Pick<ConnectionSchema, 'externalId'>): string {
    return referenceExpression(connection.externalId)
}

function referenceExpression(externalId: string): string {
    return `{{connections['${externalId}']}}`
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function testFailed(error: McpServerProbeError): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message: `MCP server test failed (${error.failure}): ${error.detail}` },
    })
}

function notFound(id: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'McpServer', entityId: id } })
}

const LIST_LIMIT = 500
const PROBE_TIMEOUT_SECONDS = 60
const TEST_SERVER_ACTION = 'test_server'
const CALL_TOOL_ACTION = 'call_tool'

const StoredProps = z.object({
    props: z.object({
        url: z.string(),
        transport: z.string().nullish(),
        authType: z.string().nullish(),
        token: z.string().nullish(),
    }),
})

const StoredOAuthValue = z.looseObject({
    props: z.record(z.string(), z.unknown()),
})

const ToolOutput = z.object({
    text: z.string().optional(),
    isError: z.boolean().optional(),
    structured: z.record(z.string(), z.unknown()).nullish(),
})

type Principal = {
    id: string
    type: PrincipalType
    tenantId: string
}

type ListParams = {
    tenantId: string
    userId: string
    search?: string
}

type ServerRef = {
    tenantId: string
    userId: string
    id: string
}

type ManagedRef = {
    tenantId: string
    principal: Principal
    id: string
}

type TestParams = {
    tenantId: string
    principal: Principal
    request: TestMcpServerRequestBody
}

type CreateParams = {
    tenantId: string
    principal: Principal
    request: UpsertMcpServerRequestBody
}

type UpdateParams = CreateParams & {
    id: string
}

type TryToolParams = {
    tenantId: string
    principal: Principal
    id: string
    request: TryMcpServerToolRequestBody
}

type TryToolResult = {
    result: McpServerToolTrialResult
    connection: AccessibleConnection
}

type ToModelsParams = {
    log: FastifyBaseLogger
    tenantId: string
    userId: string
    connections: AccessibleConnection[]
}

type ToModelParams = {
    connection: AccessibleConnection
    row: McpServerSchema
    isAdmin: boolean
    userId: string
}

type ProbeParams = {
    log: FastifyBaseLogger
    tenantId: string
    projectId: string
    auth: CustomAuthConnectionValue | string
    url: string
}

type CollectUsageParams = {
    log: FastifyBaseLogger
    tenantId: string
    connection: Pick<ConnectionSchema, 'externalId' | 'scope' | 'projectIds' | 'preSelectForNewProjects'>
    url: string
}

type ProjectsLosingParams = {
    log: FastifyBaseLogger
    tenantId: string
    connection: ConnectionSchema
    next: Pick<ConnectionSchema, 'scope' | 'projectIds' | 'preSelectForNewProjects'>
}

type FindParams = {
    log: FastifyBaseLogger
    tenantId: string
    userId: string
    id: string
}

type LoadManagedParams = {
    log: FastifyBaseLogger
    tenantId: string
    principal: Principal
    id: string
    requireOwnerOrAdmin?: boolean
}

type AssertCanPlaceParams = {
    log: FastifyBaseLogger
    principal: Principal
    allProjects: boolean
    projectIds: string[]
}

type CustomAuthValueParams = {
    url: string
    transport: McpServerTransport
    auth: McpServerAuthInput
    storedToken: string | null
}
