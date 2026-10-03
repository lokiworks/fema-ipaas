import { Permission } from '@fema-ipaas/core-utils'
import { ConnectionSharePermission, McpServerAuthType, McpServerTransport } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { integrationsSeed } from '../support/integrations-seed'
import { MatrixCase, MatrixHookParams, securityMatrix } from '../support/matrix'
import { Identity, Scope, securityWorld, World, WorldRequest } from '../support/world'
import { EVERY_TENANT_USER, Exposure, integrationsCommon, SAME_TENANT_IDENTITIES } from './integrations-common'

const OWNER_VARIANTS: OwnerVariant[] = [
    { label: 'owned by the tenant admin', owner: 'tenantAdmin' },
    { label: 'owned by the developer', owner: 'developer' },
]

const PROJECT_AUDIENCE: readonly Identity[] = ['tenantAdmin', 'projectAdmin', 'developer', 'operator', 'viewer']

function post({ url, body }: { url: string, body?: unknown }): WorldRequest {
    return { method: 'POST', url, ...(body === undefined ? {} : { body }) }
}

async function strangerId({ world, scope }: { world: World, scope: Scope }): Promise<string> {
    const stranger = await securityWorld.createTenantMember({ tenantId: world.scopes[scope].tenant.id })
    return stranger.id
}

function editCases({ id, request, expectOk, onlyDenied, published, afterDenied }: EditCaseParams): MatrixCase[] {
    return OWNER_VARIANTS.map((variant) => {
        const allowed: readonly Identity[] = [variant.owner]
        const considered: readonly Identity[] = SAME_TENANT_IDENTITIES.filter((identity) => identity !== 'tenantAdmin' || variant.owner === 'tenantAdmin')
        const everyone: readonly Identity[] = [...considered, 'otherTenantAdmin', 'anonymous']
        return {
            id,
            label: variant.label,
            access: { type: 'custom', allow: allowed },
            crossScope: true,
            ...(expectOk === undefined ? {} : { expectOk }),
            identities: onlyDenied === true ? everyone.filter((identity) => !allowed.includes(identity)) : everyone,
            prepare: async ({ world, scope }) => {
                const service = await integrationsSeed.mcpService({
                    world,
                    scope,
                    ...(variant.owner === 'tenantAdmin' ? {} : { ownerId: String(world.actors[variant.owner].userId) }),
                    published: published === true,
                })
                const built = request({ world, scope, serviceId: service.id })
                return { request: built.request, state: { serviceId: service.id, ...(built.state ?? {}) } }
            },
            ...(afterDenied === undefined ? {} : { afterDenied }),
        }
    })
}

function visibilityCases({ id, request, expectOk, withMembership, afterDenied }: VisibilityCaseParams): MatrixCase[] {
    const variants: VisibilityVariant[] = [
        { label: 'unlisted service of the project', listed: false, allowed: PROJECT_AUDIENCE },
        { label: 'service listed in the market', listed: true, allowed: SAME_TENANT_IDENTITIES },
    ]
    return variants.map((variant) => ({
        id,
        label: variant.label,
        access: { type: 'custom', allow: variant.allowed },
        crossScope: true,
        ...(variant.listed ? { forbiddenIds: integrationsCommon.selfTenantForbiddenIds } : {}),
        ...(expectOk === undefined ? {} : { expectOk }),
        prepare: async ({ world, scope }) => {
            const service = await integrationsSeed.mcpService({ world, scope, ownerId: await strangerId({ world, scope }), listed: variant.listed, published: variant.listed })
            if (withMembership === true) {
                await Promise.all(SAME_TENANT_IDENTITIES.map((identity) => integrationsSeed.mcpMember({ serviceId: service.id, userId: String(world.actors[identity].userId) })))
            }
            const built = request({ world, scope, serviceId: service.id })
            return { request: built.request, state: { serviceId: service.id, ...(built.state ?? {}) } }
        },
        ...(afterDenied === undefined ? {} : { afterDenied }),
    }))
}

async function expectServiceUntouched({ prepared }: MatrixHookParams): Promise<void> {
    const stored = await db.findOneBy<{ name: string, description: string, ownerId: string | null, listed: boolean, enabled: boolean }>('mcp_service', { id: String(prepared.state?.serviceId) })
    expect(stored).not.toBeNull()
    expect(stored?.description).toBe('security audit')
    expect(stored?.listed).toBe(false)
    expect(stored?.enabled).toBe(true)
}

function serverExposureCases({ id, need, request, expectOk, onlyDenied, afterDenied }: ServerCaseParams): MatrixCase[] {
    const exposures: Exposure[] = ['private', 'use', 'edit']
    return exposures.map((exposure) => {
        const allowed = integrationsCommon.allowedFor({ exposure, need })
        return {
            id,
            label: `${exposure} server`,
            access: { type: 'custom', allow: allowed },
            crossScope: true,
            ...(expectOk === undefined ? {} : { expectOk }),
            ...(onlyDenied === true ? { identities: integrationsCommon.deniedOnly({ allowed }) } : {}),
            prepare: async ({ world, scope }) => {
                const server = await integrationsSeed.mcpServer({ world, scope, projectMembersPermission: integrationsCommon.exposurePermission({ exposure }) })
                const built = request({ world, scope, serverId: server.id })
                return { request: built.request, state: { serverId: server.id, ...(built.state ?? {}) } }
            },
            ...(afterDenied === undefined ? {} : { afterDenied }),
        }
    })
}

async function expectServerExists({ prepared }: MatrixHookParams): Promise<void> {
    expect(await db.findOneBy('connection', { id: String(prepared.state?.serverId) })).not.toBeNull()
    expect(await db.findOneBy('mcp_server', { connectionId: String(prepared.state?.serverId) })).not.toBeNull()
}

const serverAuthNone = { type: McpServerAuthType.NONE }

const serviceBasicCases: MatrixCase[] = [
    {
        id: 'GET /v1/mcp-services',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async ({ world, scope }) => {
            const service = await integrationsSeed.mcpService({ world, scope, listed: false })
            return { request: { method: 'GET', url: '/v1/mcp-services' }, state: { serviceId: service.id } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            const seen = response.text.includes(String(prepared.state?.serviceId))
            const expected: readonly Identity[] = ['tenantAdmin', 'projectAdmin', 'developer', 'operator', 'viewer']
            expect(seen).toBe(expected.includes(identity))
        },
    },
    {
        id: 'GET /v1/mcp-services/candidates',
        access: { type: 'project', permission: Permission.READ_MCP_SERVICE },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({ request: { method: 'GET', url: '/v1/mcp-services/candidates', query: { projectId: world.scopes[scope].project.id } } }),
    },
    {
        id: 'GET /v1/mcp-services/connector-tool-params',
        access: { type: 'project', permission: Permission.READ_MCP_SERVICE },
        identities: integrationsCommon.deniedOnly({ allowed: securityMatrix.allowedIdentities({ access: { type: 'project', permission: Permission.READ_MCP_SERVICE } }) }),
        prepare: async ({ world, scope }) => ({
            request: { method: 'GET', url: '/v1/mcp-services/connector-tool-params', query: { projectId: world.scopes[scope].project.id, connectorName: integrationsSeed.CONNECTOR_NAME, actionName: 'send' } },
        }),
    },
    {
        id: 'POST /v1/mcp-services',
        access: { type: 'project', permission: Permission.WRITE_MCP_SERVICE },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const key = `sec-${world.newId().toLowerCase()}`
            return { request: post({ url: '/v1/mcp-services', body: { projectId: world.scopes[scope].project.id, name: 'sec', key, description: 'sec' } }), state: { key } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('mcp_service', { key: String(prepared.state?.key) })).toBeNull()
        },
    },
    ...visibilityCases({
        id: 'GET /v1/mcp-services/:id',
        request: ({ serviceId }) => ({ request: { method: 'GET', url: `/v1/mcp-services/${serviceId}` } }),
    }),
]

const serviceEditCases: MatrixCase[] = [
    ...editCases({ id: 'GET /v1/mcp-services/:id/issues', request: ({ serviceId }) => ({ request: { method: 'GET', url: `/v1/mcp-services/${serviceId}/issues` } }) }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/info',
        expectOk: [200],
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/info`, body: { name: 'sec-renamed', description: 'hijacked' } }) }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/tools',
        expectOk: [200],
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/tools`, body: { tools: [] } }) }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/connections',
        expectOk: [200],
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/connections`, body: { credentialMode: 'DEVELOPER', fixedConnections: {} } }) }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/availability',
        expectOk: [200],
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/availability`, body: { availability: { mode: 'ALL', userIds: [] } } }) }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/publish',
        onlyDenied: true,
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/publish`, body: { note: 'sec' } }) }),
        afterDenied: async ({ prepared }) => {
            const stored = await db.findOneBy<{ releases: unknown[] }>('mcp_service', { id: String(prepared.state?.serviceId) })
            expect(stored?.releases).toHaveLength(0)
        },
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/status',
        expectOk: [200],
        published: true,
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/status`, body: { status: 'PAUSED' } }) }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/listed',
        expectOk: [200],
        published: true,
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/listed`, body: { listed: true } }) }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/transfer',
        expectOk: [200],
        request: ({ world, serviceId }) => ({
            request: post({ url: `/v1/mcp-services/${serviceId}/transfer`, body: { ownerId: String(world.actors.projectAdmin.userId) } }),
            state: { newOwnerId: String(world.actors.projectAdmin.userId) },
        }),
        afterDenied: async ({ prepared }) => {
            const stored = await db.findOneBy<{ ownerId: string | null }>('mcp_service', { id: String(prepared.state?.serviceId) })
            expect(stored?.ownerId).not.toBeNull()
            expect(stored?.ownerId).not.toBe(prepared.state?.newOwnerId)
        },
    }),
    ...editCases({
        id: 'DELETE /v1/mcp-services/:id',
        expectOk: [204],
        request: ({ serviceId }) => ({ request: { method: 'DELETE', url: `/v1/mcp-services/${serviceId}` } }),
        afterDenied: expectServiceUntouched,
    }),
    ...editCases({
        id: 'POST /v1/mcp-services/:id/debug',
        onlyDenied: true,
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/debug`, body: { toolId: 'missing', arguments: {} } }) }),
    }),
]

const serviceMemberCases: MatrixCase[] = [
    ...visibilityCases({
        id: 'POST /v1/mcp-services/:id/obtain',
        expectOk: [200],
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/obtain` }) }),
    }),
    ...visibilityCases({
        id: 'DELETE /v1/mcp-services/:id/obtain',
        withMembership: true,
        expectOk: [204],
        request: ({ serviceId }) => ({ request: { method: 'DELETE', url: `/v1/mcp-services/${serviceId}/obtain` } }),
    }),
    ...visibilityCases({
        id: 'GET /v1/mcp-services/:id/membership',
        withMembership: true,
        request: ({ serviceId }) => ({ request: { method: 'GET', url: `/v1/mcp-services/${serviceId}/membership` } }),
    }),
    ...visibilityCases({
        id: 'GET /v1/mcp-services/:id/my-key',
        withMembership: true,
        request: ({ serviceId }) => ({ request: { method: 'GET', url: `/v1/mcp-services/${serviceId}/my-key` } }),
    }),
    ...visibilityCases({
        id: 'POST /v1/mcp-services/:id/my-key/reset',
        withMembership: true,
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/my-key/reset` }) }),
    }),
    ...visibilityCases({
        id: 'POST /v1/mcp-services/:id/my-connections',
        withMembership: true,
        request: ({ serviceId }) => ({ request: post({ url: `/v1/mcp-services/${serviceId}/my-connections`, body: { connections: {} } }) }),
    }),
]

const serverCases: MatrixCase[] = [
    {
        id: 'GET /v1/mcp-servers',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async ({ world, scope }) => {
            const server = await integrationsSeed.mcpServer({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            const hidden = await integrationsSeed.mcpServer({ world, scope, projectMembersPermission: null })
            return { request: { method: 'GET', url: '/v1/mcp-servers' }, state: { serverId: server.id, hiddenId: hidden.id } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            expect(response.text).not.toContain(integrationsSeed.SECRET_MARKER)
            if (identity !== 'tenantAdmin') {
                expect(response.text).not.toContain(String(prepared.state?.hiddenId))
            }
        },
    },
    ...serverExposureCases({ id: 'GET /v1/mcp-servers/:id', need: 'see', request: ({ serverId }) => ({ request: { method: 'GET', url: `/v1/mcp-servers/${serverId}` } }) }),
    ...serverExposureCases({ id: 'GET /v1/mcp-servers/:id/usage', need: 'see', request: ({ serverId }) => ({ request: { method: 'GET', url: `/v1/mcp-servers/${serverId}/usage` } }) }),
    ...serverExposureCases({
        id: 'DELETE /v1/mcp-servers/:id',
        need: 'owner',
        expectOk: [204],
        request: ({ serverId }) => ({ request: { method: 'DELETE', url: `/v1/mcp-servers/${serverId}` } }),
        afterDenied: expectServerExists,
    }),
    ...serverExposureCases({
        id: 'POST /v1/mcp-servers/:id',
        need: 'manage',
        onlyDenied: true,
        request: ({ world, scope, serverId }) => ({
            request: post({
                url: `/v1/mcp-servers/${serverId}`,
                body: {
                    projectId: world.scopes[scope].project.id,
                    displayName: 'sec-hijacked',
                    description: '',
                    url: 'https://mcp.example.com/sse',
                    transport: McpServerTransport.STREAMABLE_HTTP,
                    auth: serverAuthNone,
                    allProjects: false,
                    projectIds: [world.scopes[scope].project.id],
                    saveWithoutPassingTest: true,
                },
            }),
        }),
        afterDenied: expectServerExists,
    }),
    ...serverExposureCases({
        id: 'POST /v1/mcp-servers/:id/sync',
        need: 'manage',
        onlyDenied: true,
        request: ({ serverId }) => ({ request: post({ url: `/v1/mcp-servers/${serverId}/sync` }) }),
    }),
    ...serverExposureCases({
        id: 'POST /v1/mcp-servers/:id/tools/try',
        need: 'see',
        onlyDenied: true,
        request: ({ world, scope, serverId }) => ({
            request: post({ url: `/v1/mcp-servers/${serverId}/tools/try`, body: { projectId: world.scopes[scope].project.id, toolName: 'x', arguments: {} } }),
        }),
    }),
    {
        id: 'POST /v1/mcp-servers',
        access: { type: 'project', permission: Permission.WRITE_CONNECTION },
        crossScope: true,
        identities: integrationsCommon.deniedOnly({ allowed: securityMatrix.allowedIdentities({ access: { type: 'project', permission: Permission.WRITE_CONNECTION } }) }),
        prepare: async ({ world, scope }) => {
            const displayName = `sec-mcp-${world.newId().toLowerCase()}`
            return {
                request: post({
                    url: '/v1/mcp-servers',
                    body: {
                        projectId: world.scopes[scope].project.id,
                        displayName,
                        description: '',
                        url: 'https://mcp.example.com/sse',
                        transport: McpServerTransport.STREAMABLE_HTTP,
                        auth: serverAuthNone,
                        allProjects: false,
                        projectIds: [world.scopes[scope].project.id],
                        saveWithoutPassingTest: true,
                    },
                }),
                state: { displayName },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('connection', { displayName: String(prepared.state?.displayName) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/mcp-servers/test',
        access: { type: 'project', permission: Permission.WRITE_CONNECTION },
        crossScope: true,
        identities: integrationsCommon.deniedOnly({ allowed: securityMatrix.allowedIdentities({ access: { type: 'project', permission: Permission.WRITE_CONNECTION } }) }),
        prepare: async ({ world, scope }) => ({
            request: post({
                url: '/v1/mcp-servers/test',
                body: { projectId: world.scopes[scope].project.id, url: 'https://mcp.example.com/sse', transport: McpServerTransport.STREAMABLE_HTTP, auth: serverAuthNone },
            }),
        }),
    },
]

export const integrationsMcpCases: MatrixCase[] = [
    ...serviceBasicCases,
    ...serviceEditCases,
    ...serviceMemberCases,
    ...serverCases,
]



type OwnerVariant = {
    label: string
    owner: Identity
}

type RequestBuilder = (params: { world: World, scope: Scope, serviceId: string }) => { request: WorldRequest, state?: Record<string, unknown> }

type EditCaseParams = {
    id: string
    request: RequestBuilder
    expectOk?: readonly number[]
    onlyDenied?: boolean
    published?: boolean
    afterDenied?: (params: MatrixHookParams) => Promise<void>
}

type VisibilityCaseParams = {
    id: string
    request: RequestBuilder
    expectOk?: readonly number[]
    withMembership?: boolean
    afterDenied?: (params: MatrixHookParams) => Promise<void>
}

type VisibilityVariant = {
    label: string
    listed: boolean
    allowed: readonly Identity[]
}

type ServerCaseParams = {
    id: string
    need: 'see' | 'manage' | 'owner'
    request: (params: { world: World, scope: Scope, serverId: string }) => { request: WorldRequest, state?: Record<string, unknown> }
    expectOk?: readonly number[]
    onlyDenied?: boolean
    afterDenied?: (params: MatrixHookParams) => Promise<void>
}
