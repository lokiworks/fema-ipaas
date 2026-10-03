import { generateId } from '@fema-ipaas/core-utils'
import { blueprintFactory, ConnectionScope, ConnectionSharePermission, ConnectionStatus, ConnectionType, ConnectorDemandStatus, MCP_CONNECTOR_NAME, McpServerAuthType, McpServerTransport, TenantModule } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { blueprintAuthState } from '../../../../src/app/connectors/blueprint/connector-blueprint-common'
import { encryptUtils } from '../../../../src/app/helper/encryption'
import { db } from '../../../helpers/db'
import { Identity, Scope, World } from './world'

const CONNECTOR_NAME = '@fema-ipaas/connector-slack'
const AI_CONNECTOR = '@fema-ipaas/connector-ai'
const SECRET_MARKER = 'sec-integrations-secret-marker'

async function connection({ world, scope, ownerId, projectMembersPermission, projectIds, scopeType, preSelectForNewProjects, status, type, connectorName, displayName, value: valueOverride }: ConnectionParams): Promise<SeededConnection> {
    const info = world.scopes[scope]
    const id = generateId()
    const externalId = `ext-${id.toLowerCase()}`
    const resolvedType = type ?? ConnectionType.SECRET_TEXT
    const value = valueOverride ?? (resolvedType === ConnectionType.NO_AUTH
        ? { type: ConnectionType.NO_AUTH }
        : { type: ConnectionType.SECRET_TEXT, secret_text: SECRET_MARKER })
    const row = {
        id,
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId: info.tenant.id,
        projectIds: projectIds ?? [info.project.id],
        connectorName: connectorName ?? CONNECTOR_NAME,
        displayName: displayName ?? `sec-conn-${id}`,
        type: resolvedType,
        scope: scopeType ?? ConnectionScope.PROJECT,
        status: status ?? ConnectionStatus.ACTIVE,
        ownerId: ownerId === undefined ? info.ownerId : ownerId,
        value: await encryptUtils.encryptObject(value),
        metadata: {},
        externalId,
        connectorVersion: '0.0.0',
        preSelectForNewProjects: preSelectForNewProjects ?? false,
        projectMembersPermission: projectMembersPermission ?? null,
    }
    await db.save('connection', row)
    return { id, externalId, projectId: info.project.id, ownerId: row.ownerId, displayName: row.displayName }
}

async function aiModel({ world, scope, ownerId, projectMembersPermission }: { world: World, scope: Scope, ownerId?: string | null, projectMembersPermission?: ConnectionSharePermission | null }): Promise<SeededConnection> {
    return connection({
        world,
        scope,
        ...(ownerId === undefined ? {} : { ownerId }),
        projectMembersPermission: projectMembersPermission ?? null,
        connectorName: AI_CONNECTOR,
        type: ConnectionType.CUSTOM_AUTH,
        value: { type: ConnectionType.CUSTOM_AUTH, props: { provider: 'OPENAI_COMPATIBLE', apiKey: SECRET_MARKER, model: 'sec-model', baseUrl: 'http://127.0.0.1:9' } },
    })
}

async function share({ world, scope, connectionId, userId, permission }: { world: World, scope: Scope, connectionId: string, userId: string, permission: ConnectionSharePermission }): Promise<void> {
    await db.save('connection_share', {
        id: generateId(),
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId: world.scopes[scope].tenant.id,
        connectionId,
        userId,
        permission,
        createdBy: world.scopes[scope].ownerId,
    })
}

async function grantModules({ world, modules }: { world: World, modules: TenantModule[] }): Promise<void> {
    const identities: Identity[] = ['projectAdmin', 'developer', 'operator', 'viewer', 'nonMember', 'foreignProjectAdmin']
    await Promise.all(identities.map((identity) => db.update('user', String(world.actors[identity].userId), { modules })))
}

async function mcpService({ world, scope, ownerId, listed, availability, published }: McpServiceParams): Promise<SeededMcpService> {
    const info = world.scopes[scope]
    const id = generateId()
    const key = `sec-${id.toLowerCase()}`
    const resolvedOwner = ownerId === undefined ? info.ownerId : ownerId
    await db.save('mcp_service', {
        id,
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        projectId: info.project.id,
        name: `sec-service-${id}`,
        description: 'security audit',
        enabled: true,
        tools: [],
        tokenHash: generateId(),
        tokenHint: '1234',
        lastUsedAt: null,
        key,
        ownerId: resolvedOwner,
        publishedTools: published === true ? [] : null,
        releases: published === true ? [{ version: '1.0', publishedAt: dayjs().toISOString(), publisherId: resolvedOwner ?? info.ownerId, publisherName: null, note: 'seed', toolNames: [] }] : [],
        draftChanged: false,
        listed: listed ?? false,
        credentialMode: 'DEVELOPER',
        fixedConnections: {},
        availability: availability ?? { mode: 'ALL', userIds: [] },
    })
    return { id, key, projectId: info.project.id, ownerId: resolvedOwner }
}

async function mcpMember({ serviceId, userId }: { serviceId: string, userId: string }): Promise<{ key: string }> {
    const key = `ap_mcp_${generateId()}`
    await db.save('mcp_service_member', {
        id: generateId(),
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        serviceId,
        userId,
        tokenHash: generateId(),
        tokenHint: key.slice(-4),
        tokenEncrypted: await encryptUtils.encryptString(key),
        connections: {},
    })
    return { key }
}

async function mcpServer({ world, scope, ownerId, projectMembersPermission }: McpServerParams): Promise<SeededConnection> {
    const info = world.scopes[scope]
    const seeded = await connection({
        world,
        scope,
        ownerId,
        projectMembersPermission: projectMembersPermission === undefined ? ConnectionSharePermission.USE : projectMembersPermission,
        connectorName: MCP_CONNECTOR_NAME,
        type: ConnectionType.CUSTOM_AUTH,
    })
    await db.save('mcp_server', {
        id: generateId(),
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId: info.tenant.id,
        connectionId: seeded.id,
        description: 'security audit',
        url: 'https://mcp.example.com/sse',
        transport: McpServerTransport.STREAMABLE_HTTP,
        authType: McpServerAuthType.BEARER,
        tools: [],
        lastSyncedAt: null,
        lastError: null,
    })
    return seeded
}

async function blueprint({ world, scope, ownerId, collaboratorIds }: BlueprintParams): Promise<SeededBlueprint> {
    const info = world.scopes[scope]
    const id = generateId()
    const identifier = `sec_${id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`
    const definition = blueprintFactory.definition({ displayName: 'Security audit', description: 'audit', iconColor: '#000000', baseUrl: '' })
    const resolvedOwner = ownerId ?? info.ownerId
    await db.save('connector_blueprint', {
        id,
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId: info.tenant.id,
        identifier,
        connectorName: `@fema-ipaas/connector-${identifier.replace(/_/g, '-')}`,
        ownerId: resolvedOwner,
        collaboratorIds: collaboratorIds ?? [],
        definition,
        publishedDefinition: null,
        authState: blueprintAuthState.empty(),
        authTestData: null,
        debugRecords: [],
        draftBuild: null,
    })
    return { id, identifier, ownerId: resolvedOwner, definition }
}

async function blueprintVersion({ world, scope, blueprintId, publishedBy }: { world: World, scope: Scope, blueprintId: string, publishedBy: string }): Promise<{ id: string }> {
    const info = world.scopes[scope]
    const stored = await db.findOneByOrFail<{ connectorName: string, definition: unknown }>('connector_blueprint', { id: blueprintId })
    const id = generateId()
    await db.save('connector_blueprint_version', {
        id,
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId: info.tenant.id,
        blueprintId,
        connectorName: stored.connectorName,
        version: '1.0',
        packageVersion: '1.0.0',
        status: 'CANARY',
        canaryProjectIds: [info.project.id],
        description: 'seed',
        publishedBy,
        publishedAt: dayjs().toISOString(),
        updates: [],
        definition: stored.definition,
    })
    return { id }
}

async function connectionReplacement({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string, sourceId: string, targetId: string, projectId: string }> {
    const source = await connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
    const target = await connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
    const id = generateId()
    await db.save('connection_replacement', {
        id,
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        projectId: world.scopes[scope].project.id,
        sourceConnectionId: source.id,
        targetConnectionId: target.id,
    })
    return { id, sourceId: source.id, targetId: target.id, projectId: world.scopes[scope].project.id }
}

async function connectorDemand({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string }> {
    const id = generateId()
    await db.save('connector_demand', {
        id,
        created: dayjs().toISOString(),
        updated: dayjs().toISOString(),
        tenantId: world.scopes[scope].tenant.id,
        requesterId: world.scopes[scope].ownerId,
        appName: 'sec-app',
        capability: 'sec-capability',
        status: ConnectorDemandStatus.OPEN,
    })
    return { id }
}

export const integrationsSeed = {
    connection,
    aiModel,
    share,
    grantModules,
    mcpService,
    mcpMember,
    mcpServer,
    blueprint,
    blueprintVersion,
    connectionReplacement,
    connectorDemand,
    SECRET_MARKER,
    CONNECTOR_NAME,
    AI_CONNECTOR,
}

export type SeededConnection = {
    id: string
    externalId: string
    projectId: string
    ownerId: string | null
    displayName: string
}

export type SeededMcpService = {
    id: string
    key: string
    projectId: string
    ownerId: string | null
}

export type SeededBlueprint = {
    id: string
    identifier: string
    ownerId: string
    definition: unknown
}

type ConnectionParams = {
    world: World
    scope: Scope
    ownerId?: string | null
    projectMembersPermission?: ConnectionSharePermission | null
    projectIds?: string[]
    scopeType?: ConnectionScope
    preSelectForNewProjects?: boolean
    status?: ConnectionStatus
    type?: ConnectionType
    connectorName?: string
    displayName?: string
    value?: Record<string, unknown>
}

type McpServiceParams = {
    world: World
    scope: Scope
    ownerId?: string | null
    listed?: boolean
    availability?: { mode: string, userIds: string[] }
    published?: boolean
}

type McpServerParams = {
    world: World
    scope: Scope
    ownerId?: string | null
    projectMembersPermission?: ConnectionSharePermission | null
}

type BlueprintParams = {
    world: World
    scope: Scope
    ownerId?: string
    collaboratorIds?: string[]
}
