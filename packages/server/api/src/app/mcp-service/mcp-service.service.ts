import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import {
    ApplicationError,
    connectionAccessUtils,
    ConnectionPermission,
    ConnectionStatus,
    CreateMcpServiceRequestBody,
    ErrorCode,
    generateId,
    isNil,
    ListMcpServicesRequestQuery,
    MCP_API_KEY_PREFIX,
    MCP_API_KEY_RANDOM_LENGTH,
    McpAvailabilityMode,
    McpCredentialMode,
    McpService,
    McpServiceApiKey,
    McpServiceIssue,
    McpServiceIssueCode,
    McpServiceIssueLevel,
    McpServiceIssues,
    McpServiceListTab,
    McpServiceMembership,
    McpServiceRelease,
    McpServiceStatus,
    McpServiceTool,
    mcpServiceUtils,
    McpToolParam,
    McpToolSourceType,
    McpWorkflowToolCandidate,
    Permission,
    PrincipalType,
    ProjectId,
    PublishMcpServiceRequestBody,
    TenantModule,
    UpdateMcpServiceAvailabilityRequestBody,
    UpdateMcpServiceConnectionsRequestBody,
    UpdateMcpServiceInfoRequestBody,
    UpdateMcpServiceToolsRequestBody,
    UserStatus,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionAccessService } from '../connection/connection-access.service'
import { connectionAvailability } from '../connection/connection-service/connection-availability'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { repoFactory } from '../core/db/repo-factory'
import { databaseConnection } from '../database/database-connection'
import { encryptUtils } from '../helper/encryption'
import { projectAccess } from '../project/project-access'
import { projectRepo } from '../project/project-repo'
import { tenantAccessUtils } from '../tenant-access/tenant-access.utils'
import { userRepo } from '../user/user-service'
import { McpServiceEntity, McpServiceMemberEntity, McpServiceMemberSchema, McpServiceSchema, McpServiceUsageEntity } from './mcp-service.entity'
import { mcpToolModel } from './mcp-tool-model'
import { mcpToolSources } from './mcp-tool-sources'

export const mcpServiceRepo = repoFactory(McpServiceEntity)
export const mcpServiceMemberRepo = repoFactory(McpServiceMemberEntity)
export const mcpServiceUsageRepo = repoFactory(McpServiceUsageEntity)

export const mcpServiceService = (log: FastifyBaseLogger) => ({
    async list({ tenantId, userId, query }: ListParams): Promise<McpService[]> {
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const builder = mcpServiceRepo()
            .createQueryBuilder('service')
            .innerJoin('project', 'project', 'project.id = service."projectId"')
            .where('project."tenantId" = :tenantId AND project.deleted IS NULL', { tenantId })
        const membership = 'EXISTS (SELECT 1 FROM "mcp_service_member" "viewer_member" WHERE "viewer_member"."serviceId" = service.id AND "viewer_member"."userId" = :userId)'
        switch (query.tab ?? McpServiceListTab.ALL) {
            case McpServiceListTab.MINE:
                builder.andWhere('service."ownerId" = :userId', { userId })
                break
            case McpServiceListTab.OBTAINED:
                builder.andWhere(`${membership} AND (service."ownerId" IS NULL OR service."ownerId" <> :userId)`, { userId })
                break
            default:
                builder.andWhere(`(service."ownerId" = :userId OR service."projectId" = ANY(:memberProjectIds) OR ${membership} OR (service.listed = true AND (service.availability->>'mode' = 'ALL' OR service.availability->'userIds' ? :userId)))`, { userId, memberProjectIds })
        }
        if (!isNil(query.search) && query.search.trim().length > 0) {
            builder.andWhere('(service.name ILIKE :search OR service.key ILIKE :search OR service.description ILIKE :search)', { search: `%${query.search.trim()}%` })
        }
        const services = await builder.orderBy('service.created', 'DESC').getMany()
        return toModels({ log, services, userId, tenantId })
    },

    async get({ tenantId, userId, id }: ServiceRef): Promise<McpService> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        const [model] = await toModels({ log, services: [service], userId, tenantId })
        return model
    },

    async create({ tenantId, userId, request }: CreateParams): Promise<McpService> {
        const key = request.key.trim()
        const taken = await mcpServiceRepo().existsBy({ key })
        if (taken) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'This service identifier is already used' } })
        }
        const id = generateId()
        const legacyToken = newKey()
        await mcpServiceRepo().save({
            id,
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            projectId: request.projectId,
            name: request.name.trim(),
            description: request.description.trim(),
            enabled: true,
            tools: [],
            tokenHash: hashOf(legacyToken),
            tokenHint: legacyToken.slice(-TOKEN_HINT_LENGTH),
            lastUsedAt: null,
            key,
            ownerId: userId,
            publishedTools: null,
            releases: [],
            draftChanged: false,
            listed: false,
            credentialMode: McpCredentialMode.DEVELOPER,
            fixedConnections: {},
            availability: { mode: McpAvailabilityMode.ALL, userIds: [] },
        })
        await ensureMembership({ serviceId: id, userId })
        log.info({ project: { id: request.projectId }, mcpService: { id } }, '[mcpServiceService#create] MCP service created')
        return this.get({ tenantId, userId, id })
    },

    async updateInfo({ tenantId, userId, id, request }: UpdateParams<UpdateMcpServiceInfoRequestBody>): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        await mcpServiceRepo().save({ ...service, name: request.name.trim(), description: request.description.trim() })
        return this.get({ tenantId, userId, id })
    },

    async updateTools({ tenantId, userId, id, request }: UpdateParams<UpdateMcpServiceToolsRequestBody>): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        await assertToolSourcesAllowed({ log, service, tenantId, tools: request.tools })
        await mcpServiceRepo().save({ ...service, tools: request.tools, draftChanged: service.releases.length > 0 })
        return this.get({ tenantId, userId, id })
    },

    async updateConnections({ tenantId, userId, id, request }: UpdateParams<UpdateMcpServiceConnectionsRequestBody>): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        if (request.credentialMode === McpCredentialMode.DEVELOPER) {
            await assertConnectionsUsable({ log, tenantId, projectId: service.projectId, userId, connections: request.fixedConnections, requireOwner: false })
        }
        await mcpServiceRepo().save({
            ...service,
            credentialMode: request.credentialMode,
            fixedConnections: request.credentialMode === McpCredentialMode.DEVELOPER ? request.fixedConnections : {},
            draftChanged: service.releases.length > 0,
        })
        return this.get({ tenantId, userId, id })
    },

    async updateAvailability({ tenantId, userId, id, request }: UpdateParams<UpdateMcpServiceAvailabilityRequestBody>): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        const members = unique(request.availability.userIds)
        const known = members.length === 0 ? 0 : await userRepo().countBy({ id: In(members), tenantId })
        if (known !== members.length) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Some selected members do not exist' } })
        }
        await mcpServiceRepo().save({ ...service, availability: { mode: request.availability.mode, userIds: members } })
        return this.get({ tenantId, userId, id })
    },

    async issues({ tenantId, userId, id }: ServiceRef): Promise<McpServiceIssues> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        const issues = await computeIssues({ log, tenantId, service })
        return { issues, canPublish: mcpToolModel.canPublish(issues), nextVersion: mcpServiceUtils.nextVersion(service.releases) }
    },

    async publish({ tenantId, userId, id, request }: UpdateParams<PublishMcpServiceRequestBody>): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        const issues = await computeIssues({ log, tenantId, service })
        if (!mcpToolModel.canPublish(issues)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Fix the errors found by the service check before publishing' } })
        }
        const tools = mcpToolModel.normalizeTools(service.tools)
        const publisher = await userRepo().findOne({ where: { id: userId }, relations: { identity: true } })
        const release: McpServiceRelease = {
            version: mcpServiceUtils.nextVersion(service.releases),
            publishedAt: dayjs().toISOString(),
            publisherId: userId,
            publisherName: isNil(publisher?.identity) ? null : `${publisher.identity.firstName} ${publisher.identity.lastName}`.trim(),
            note: request.note.trim(),
            toolNames: tools.map((tool) => tool.name),
        }
        await mcpServiceRepo().save({
            ...service,
            publishedTools: tools,
            releases: [release, ...service.releases].slice(0, MAX_RELEASES),
            draftChanged: false,
            enabled: service.releases.length === 0 ? true : service.enabled,
        })
        return this.get({ tenantId, userId, id })
    },

    async setStatus({ tenantId, userId, id, status }: ServiceRef & { status: McpServiceStatus.ENABLED | McpServiceStatus.PAUSED }): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        assertPublished(service)
        await mcpServiceRepo().save({ ...service, enabled: status === McpServiceStatus.ENABLED })
        return this.get({ tenantId, userId, id })
    },

    async setListed({ tenantId, userId, id, listed }: ServiceRef & { listed: boolean }): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        assertPublished(service)
        await mcpServiceRepo().save({ ...service, listed })
        return this.get({ tenantId, userId, id })
    },

    async transfer({ tenantId, userId, id, ownerId }: ServiceRef & { ownerId: string }): Promise<McpService> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        const target = await userRepo().findOneBy({ id: ownerId, tenantId })
        const allowed = !isNil(target) && target.status === UserStatus.ACTIVE
            && tenantAccessUtils.hasModule({ tenantRole: target.tenantRole, storedModules: target.modules ?? [], module: TenantModule.MCP_SERVICES })
        if (!allowed) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The new owner must be an active member with access to MCP services' } })
        }
        await mcpServiceRepo().save({ ...service, ownerId })
        await ensureMembership({ serviceId: id, userId: ownerId })
        return this.get({ tenantId, userId: ownerId, id })
    },

    async delete({ tenantId, userId, id }: ServiceRef): Promise<McpServiceSchema> {
        const service = await findEditableOrThrow({ log, tenantId, userId, id })
        await mcpServiceRepo().delete({ id: service.id })
        return service
    },

    async obtain({ tenantId, userId, id }: ServiceRef): Promise<McpServiceMembership> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        if (!mcpToolModel.isCallerAllowed({ availability: service.availability, userId, ownerId: service.ownerId })) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'This service is not available to you' } })
        }
        const memberOfProject = !isNil(await projectAccess(log).resolveRole({ userId, projectId: service.projectId }))
        if (!service.listed && !memberOfProject && service.ownerId !== userId) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'This service is not listed in the MCP market' } })
        }
        return toMembership(await ensureMembership({ serviceId: id, userId }))
    },

    async leave({ tenantId, userId, id }: ServiceRef): Promise<void> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        if (service.ownerId === userId) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The owner keeps access to the service' } })
        }
        await mcpServiceMemberRepo().delete({ serviceId: id, userId })
    },

    async membership({ tenantId, userId, id }: ServiceRef): Promise<McpServiceMembership | null> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        const member = service.ownerId === userId
            ? await ensureMembership({ serviceId: id, userId })
            : await mcpServiceMemberRepo().findOneBy({ serviceId: id, userId })
        return isNil(member) ? null : toMembership(member)
    },

    async myKey({ tenantId, userId, id }: ServiceRef): Promise<McpServiceApiKey> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        const member = await requireMembership({ service, userId })
        return { key: await encryptUtils.decryptString(member.tokenEncrypted), endpointPath: endpointPathOf(service) }
    },

    async resetMyKey({ tenantId, userId, id }: ServiceRef): Promise<McpServiceApiKey> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        const member = await requireMembership({ service, userId })
        const key = newKey()
        await mcpServiceMemberRepo().save({ ...member, tokenHash: hashOf(key), tokenHint: key.slice(-TOKEN_HINT_LENGTH), tokenEncrypted: await encryptUtils.encryptString(key) })
        return { key, endpointPath: endpointPathOf(service) }
    },

    async updateMyConnections({ tenantId, userId, id, connections }: ServiceRef & { connections: Record<string, string> }): Promise<McpServiceMembership> {
        const service = await findVisibleOrThrow({ log, tenantId, userId, id })
        const member = await requireMembership({ service, userId })
        await assertConnectionsUsable({ log, tenantId, projectId: service.projectId, userId, connections, requireOwner: service.credentialMode === McpCredentialMode.USER })
        const saved = await mcpServiceMemberRepo().save({ ...member, connections })
        return toMembership(saved)
    },

    async candidates({ projectId }: { projectId: ProjectId }): Promise<McpWorkflowToolCandidate[]> {
        return mcpToolSources(log).workflowCandidates({ projectId })
    },

    async connectorToolParams({ tenantId, connectorName, actionName }: { tenantId: string, connectorName: string, actionName: string }): Promise<McpToolParam[]> {
        const params = await mcpToolSources(log).connectorActionParams({ tenantId, connectorName, actionName })
        if (isNil(params)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'ConnectorAction', entityId: `${connectorName}/${actionName}` } })
        }
        return params
    },

    async authenticate({ route, authorization }: AuthenticateParams): Promise<AuthenticatedCaller | null> {
        const token = tokenFromHeader(authorization)
        if (isNil(token)) {
            return null
        }
        if (token.startsWith(MCP_API_KEY_PREFIX)) {
            const member = await mcpServiceMemberRepo().findOne({ where: { tokenHash: hashOf(token) }, relations: { service: true } })
            const service = member?.service
            if (isNil(member) || isNil(service) || !routeMatches({ route, service })) {
                return null
            }
            const user = await userRepo().findOne({ where: { id: member.userId }, relations: { identity: true } })
            if (isNil(user) || user.status !== UserStatus.ACTIVE || !mcpToolModel.isCallerAllowed({ availability: service.availability, userId: user.id, ownerId: service.ownerId })) {
                return null
            }
            await touch(service)
            return {
                service,
                member,
                user: {
                    id: user.id,
                    email: user.identity?.email ?? '',
                    name: isNil(user.identity) ? '' : `${user.identity.firstName} ${user.identity.lastName}`.trim(),
                },
            }
        }
        if (route.kind !== 'id') {
            return null
        }
        const service = await mcpServiceRepo().findOneBy({ id: route.value })
        if (isNil(service) || !hashesMatch({ stored: service.tokenHash, candidate: hashOf(token) })) {
            return null
        }
        await touch(service)
        return { service, member: null, user: null }
    },

    async recordCall({ serviceId, failed }: { serviceId: string, failed: boolean }): Promise<void> {
        await databaseConnection().query(RECORD_CALL_SQL, [generateId(), serviceId, failed ? 1 : 0])
    },
})

export const mcpServiceKeys = {
    newKey,
    hashOf,
    statusOf,
    isLegacy,
    endpointPathOf,
}

async function toModels({ log, services, userId, tenantId }: ToModelsParams): Promise<McpService[]> {
    if (services.length === 0) {
        return []
    }
    const ids = services.map((service) => service.id)
    const [memberships, usage, projects, owners] = await Promise.all([
        mcpServiceMemberRepo().find({ where: { serviceId: In(ids), userId }, select: ['serviceId'] }),
        databaseConnection().query(CALLS_7D_SQL, [ids]).then((rows: { serviceId: string, calls: string }[]) => new Map(rows.map((row) => [row.serviceId, Number(row.calls)]))),
        projectRepo().find({ where: { id: In(unique(services.map((service) => service.projectId))), tenantId }, select: ['id', 'displayName'] }),
        userRepo().find({ where: { id: In(unique(services.flatMap((service) => (isNil(service.ownerId) ? [] : [service.ownerId])))) }, relations: { identity: true } }),
    ])
    const legacyEditable = await Promise.all(services.filter((service) => isNil(service.ownerId)).map(async (service) => {
        const role = await projectAccess(log).resolveRole({ userId, projectId: service.projectId })
        return !isNil(role) && role.permissions.includes(Permission.WRITE_MCP_SERVICE) ? service.id : null
    }))
    return services.map((service) => {
        const owner = owners.find((candidate) => candidate.id === service.ownerId)
        return {
            id: service.id,
            created: service.created,
            updated: service.updated,
            projectId: service.projectId,
            projectDisplayName: projects.find((project) => project.id === service.projectId)?.displayName ?? null,
            key: service.key,
            name: service.name,
            description: service.description,
            ownerId: service.ownerId,
            ownerName: isNil(owner?.identity) ? null : `${owner.identity.firstName} ${owner.identity.lastName}`.trim() || owner.identity.email,
            status: statusOf(service),
            draftChanged: service.draftChanged,
            listed: service.listed,
            tools: mcpToolModel.normalizeTools(service.tools),
            publishedVersion: service.releases[0]?.version ?? null,
            releases: service.releases,
            credentialMode: service.credentialMode,
            fixedConnections: service.fixedConnections,
            availability: service.availability,
            lastUsedAt: isNil(service.lastUsedAt) ? null : dayjs(service.lastUsedAt).toISOString(),
            calls7d: usage.get(service.id) ?? 0,
            canEdit: service.ownerId === userId || legacyEditable.includes(service.id),
            obtained: memberships.some((membership) => membership.serviceId === service.id),
            legacy: isLegacy(service),
        }
    })
}

async function computeIssues({ log, tenantId, service }: { log: FastifyBaseLogger, tenantId: string, service: McpServiceSchema }): Promise<McpServiceIssue[]> {
    const tools = mcpToolModel.normalizeTools(service.tools)
    const facts = await mcpToolSources(log).facts({ tenantId, projectId: service.projectId, tools })
    const toolIssues = mcpToolModel.toolIssues({ tools, sourceProblems: facts.sourceProblems, expectedParams: facts.expectedParams })
    const connectionIssues = service.credentialMode === McpCredentialMode.DEVELOPER
        ? await fixedConnectionIssues({ log, tenantId, service, connectorNames: facts.connectorsNeedingAuth })
        : []
    return [...toolIssues, ...connectionIssues, ...mcpToolModel.availabilityIssues(service.availability)]
}

async function fixedConnectionIssues({ log, tenantId, service, connectorNames }: FixedIssuesParams): Promise<McpServiceIssue[]> {
    const issues = await Promise.all(connectorNames.map(async (connectorName): Promise<McpServiceIssue | null> => {
        const externalId = service.fixedConnections[connectorName]
        if (isNil(externalId)) {
            return mcpToolModel.issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.FIXED_CONNECTION_MISSING, tool: null, connectorName })
        }
        const connection = await connectionsRepo().findOneBy(connectionAvailability.whereAvailableIn({ projectId: service.projectId, where: { tenantId, externalId } }))
        const permission = isNil(connection) || isNil(service.ownerId)
            ? null
            : await connectionAccessService(log).permissionFor({ connection, principal: { id: service.ownerId, type: PrincipalType.USER, tenantId } })
        if (isNil(connection) || (!isNil(service.ownerId) && isNil(permission))) {
            return mcpToolModel.issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.FIXED_CONNECTION_NOT_USABLE, tool: null, connectorName })
        }
        if (connection.status !== ConnectionStatus.ACTIVE) {
            return mcpToolModel.issue({ level: McpServiceIssueLevel.WARNING, code: McpServiceIssueCode.FIXED_CONNECTION_BROKEN, tool: null, connectorName, detail: connection.displayName })
        }
        return null
    }))
    return issues.filter((candidate): candidate is McpServiceIssue => !isNil(candidate))
}

async function assertToolSourcesAllowed({ log, service, tenantId, tools }: { log: FastifyBaseLogger, service: McpServiceSchema, tenantId: string, tools: McpServiceTool[] }): Promise<void> {
    const workflowIds = unique(tools.flatMap((tool) => (tool.source.type === McpToolSourceType.WORKFLOW ? [tool.source.workflowId] : [])))
    const inProject = await mcpToolSources(log).workflowIdsInProject({ projectId: service.projectId, workflowIds })
    if (workflowIds.some((workflowId) => !inProject.includes(workflowId))) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Workflow tools must come from the project of the service' } })
    }
    const connectorNames = unique(tools.flatMap((tool) => (tool.source.type === McpToolSourceType.CONNECTOR_ACTION ? [tool.source.connectorName] : [])))
    const missing = await Promise.all(connectorNames.map(async (name) => {
        const metadata = await connectorMetadataService(log).get({ name, version: undefined, tenantId })
        return isNil(metadata) ? name : null
    }))
    const unknown = missing.filter((name): name is string => !isNil(name))
    if (unknown.length > 0) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: `Unknown connector: ${unknown.join(', ')}` } })
    }
}

async function assertConnectionsUsable({ log, tenantId, projectId, userId, connections, requireOwner }: AssertConnectionsParams): Promise<void> {
    const entries = Object.entries(connections)
    const problems = await Promise.all(entries.map(async ([connectorName, externalId]) => {
        const connection = await connectionsRepo().findOneBy(connectionAvailability.whereAvailableIn({ projectId, where: { tenantId, externalId, connectorName } }))
        if (isNil(connection)) {
            return connectorName
        }
        const permission = await connectionAccessService(log).permissionFor({ connection, principal: { id: userId, type: PrincipalType.USER, tenantId } })
        const allowed = requireOwner ? permission === ConnectionPermission.OWNER : connectionAccessUtils.canUse(permission)
        return allowed ? null : connectorName
    }))
    const rejected = problems.filter((name): name is string => !isNil(name))
    if (rejected.length > 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `These connections are not available to you in the project of the service: ${rejected.join(', ')}` },
        })
    }
}

async function findVisibleOrThrow({ log, tenantId, userId, id }: FindParams): Promise<McpServiceSchema> {
    const service = await mcpServiceRepo()
        .createQueryBuilder('service')
        .innerJoin('project', 'project', 'project.id = service."projectId"')
        .where('service.id = :id AND project."tenantId" = :tenantId', { id, tenantId })
        .getOne()
    if (isNil(service)) {
        throw notFound(id)
    }
    if (service.ownerId === userId) {
        return service
    }
    const [role, member] = await Promise.all([
        projectAccess(log).resolveRole({ userId, projectId: service.projectId }),
        mcpServiceMemberRepo().existsBy({ serviceId: id, userId }),
    ])
    const inMarket = service.listed && mcpToolModel.isCallerAllowed({ availability: service.availability, userId, ownerId: service.ownerId })
    if (isNil(role) && !member && !inMarket) {
        throw notFound(id)
    }
    return service
}

async function findEditableOrThrow({ log, tenantId, userId, id }: FindParams): Promise<McpServiceSchema> {
    const service = await findVisibleOrThrow({ log, tenantId, userId, id })
    if (service.ownerId === userId) {
        return service
    }
    if (isNil(service.ownerId)) {
        const role = await projectAccess(log).resolveRole({ userId, projectId: service.projectId })
        if (!isNil(role) && role.permissions.includes(Permission.WRITE_MCP_SERVICE)) {
            return service
        }
    }
    throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Only the owner can change this MCP service' } })
}

async function requireMembership({ service, userId }: { service: McpServiceSchema, userId: string }): Promise<McpServiceMemberSchema> {
    if (service.ownerId === userId) {
        return ensureMembership({ serviceId: service.id, userId })
    }
    const member = await mcpServiceMemberRepo().findOneBy({ serviceId: service.id, userId })
    if (isNil(member)) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Get the service first to receive your API key' } })
    }
    return member
}

async function ensureMembership({ serviceId, userId }: { serviceId: string, userId: string }): Promise<McpServiceMemberSchema> {
    const existing = await mcpServiceMemberRepo().findOneBy({ serviceId, userId })
    if (!isNil(existing)) {
        return existing
    }
    const key = newKey()
    const member: McpServiceMemberSchema = {
        id: generateId(),
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        serviceId,
        userId,
        tokenHash: hashOf(key),
        tokenHint: key.slice(-TOKEN_HINT_LENGTH),
        tokenEncrypted: await encryptUtils.encryptString(key),
        connections: {},
    }
    await mcpServiceMemberRepo().save(member)
    return member
}

function toMembership(member: McpServiceMemberSchema): McpServiceMembership {
    return {
        serviceId: member.serviceId,
        userId: member.userId,
        tokenHint: member.tokenHint,
        connections: member.connections,
        created: dayjs(member.created).toISOString(),
    }
}

function statusOf(service: McpServiceSchema): McpServiceStatus {
    if (isLegacy(service)) {
        return service.enabled ? McpServiceStatus.ENABLED : McpServiceStatus.PAUSED
    }
    if (service.releases.length === 0) {
        return McpServiceStatus.DRAFT
    }
    return service.enabled ? McpServiceStatus.ENABLED : McpServiceStatus.PAUSED
}

function isLegacy(service: Pick<McpServiceSchema, 'key' | 'releases'>): boolean {
    return isNil(service.key) && service.releases.length === 0
}

function assertPublished(service: McpServiceSchema): void {
    if (service.releases.length === 0 && !isLegacy(service)) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Publish the service first' } })
    }
}

function endpointPathOf(service: Pick<McpServiceSchema, 'id' | 'key'>): string {
    return isNil(service.key) ? `v1/mcp/${service.id}` : `mcp/${service.key}`
}

function routeMatches({ route, service }: { route: McpRoute, service: McpServiceSchema }): boolean {
    return route.kind === 'id' ? route.value === service.id : route.value === service.key
}

async function touch(service: McpServiceSchema): Promise<void> {
    if (isNil(service.lastUsedAt) || dayjs(service.lastUsedAt).isBefore(dayjs().subtract(LAST_USED_RESOLUTION_MINUTES, 'minute'))) {
        await mcpServiceRepo().update({ id: service.id }, { lastUsedAt: dayjs().toISOString() })
    }
}

function newKey(): string {
    const random = Array.from({ length: MCP_API_KEY_RANDOM_LENGTH }, () => KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]).join('')
    return `${MCP_API_KEY_PREFIX}${random}`
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

function unique(values: string[]): string[] {
    return [...new Set(values)]
}

function notFound(id: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'McpService' } })
}

const TOKEN_HINT_LENGTH = 4
const LAST_USED_RESOLUTION_MINUTES = 5
const MAX_RELEASES = 50
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

const RECORD_CALL_SQL = `INSERT INTO "mcp_service_usage" ("id", "created", "updated", "serviceId", "day", "calls", "failures")
VALUES ($1, now(), now(), $2, current_date, 1, $3)
ON CONFLICT ("serviceId", "day") DO UPDATE SET "calls" = "mcp_service_usage"."calls" + 1, "failures" = "mcp_service_usage"."failures" + EXCLUDED."failures", "updated" = now()`

const CALLS_7D_SQL = `SELECT "serviceId", SUM("calls") AS "calls" FROM "mcp_service_usage"
WHERE "serviceId" = ANY($1) AND "day" >= current_date - 6
GROUP BY "serviceId"`

type ListParams = {
    tenantId: string
    userId: string
    query: ListMcpServicesRequestQuery
}

type ServiceRef = {
    tenantId: string
    userId: string
    id: string
}

type UpdateParams<T> = ServiceRef & {
    request: T
}

type CreateParams = {
    tenantId: string
    userId: string
    request: CreateMcpServiceRequestBody
}

type FindParams = ServiceRef & {
    log: FastifyBaseLogger
}

type ToModelsParams = {
    log: FastifyBaseLogger
    services: McpServiceSchema[]
    userId: string
    tenantId: string
}

type FixedIssuesParams = {
    log: FastifyBaseLogger
    tenantId: string
    service: McpServiceSchema
    connectorNames: string[]
}

type AssertConnectionsParams = {
    log: FastifyBaseLogger
    tenantId: string
    projectId: string
    userId: string
    connections: Record<string, string>
    requireOwner: boolean
}

type AuthenticateParams = {
    route: McpRoute
    authorization: string | undefined
}

export type McpRoute = {
    kind: 'id' | 'key'
    value: string
}

export type AuthenticatedCaller = {
    service: McpServiceSchema
    member: McpServiceMemberSchema | null
    user: { id: string, email: string, name: string } | null
}
