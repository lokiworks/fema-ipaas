import { Permission } from '@fema-ipaas/core-utils'
import { ConnectionScope, ConnectionSharePermission, ConnectionStatus, ConnectionType } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { integrationsSeed } from '../support/integrations-seed'
import { MatrixCase, MatrixHookParams, PreparedRequest } from '../support/matrix'
import { Identity, Scope, securityWorld, World, WorldRequest } from '../support/world'
import { EVERY_TENANT_USER, Exposure, EXPOSURES, integrationsCommon, Need } from './integrations-common'

function exposureCases({ id, need, request, expectOk, identities, afterDenied, afterAllowed, connectionOptions }: ExposureCaseParams): MatrixCase[] {
    return EXPOSURES.map((exposure) => ({
        id,
        label: `${exposure} connection`,
        access: { type: 'custom', allow: integrationsCommon.allowedFor({ exposure, need }) },
        crossScope: true,
        ...(expectOk === undefined ? {} : { expectOk }),
        ...(identities === undefined ? {} : { identities }),
        prepare: async ({ world, scope }) => {
            const connection = await integrationsSeed.connection({
                world,
                scope,
                projectMembersPermission: integrationsCommon.exposurePermission({ exposure }),
                ...(connectionOptions ?? {}),
            })
            const built = await request({ world, scope, connectionId: connection.id, exposure })
            return { request: built.request, state: { connectionId: connection.id, displayName: connection.displayName, exposure, ...(built.state ?? {}) } }
        },
        ...(afterDenied === undefined ? {} : { afterDenied }),
        ...(afterAllowed === undefined ? {} : { afterAllowed }),
    }))
}

async function expectConnectionUntouched({ prepared }: MatrixHookParams): Promise<void> {
    const stored = await db.findOneBy<{ displayName: string, projectMembersPermission: string | null }>('connection', { id: String(prepared.state?.connectionId) })
    expect(stored?.displayName).toBe(String(prepared.state?.displayName))
}

async function expectShareExists({ prepared }: MatrixHookParams): Promise<void> {
    const share = await db.findOneBy<{ permission: string }>('connection_share', { connectionId: String(prepared.state?.connectionId), userId: String(prepared.state?.targetUserId) })
    expect(share?.permission).toBe(ConnectionSharePermission.USE)
}

async function expectNoShare({ prepared }: MatrixHookParams): Promise<void> {
    const share = await db.findOneBy('connection_share', { connectionId: String(prepared.state?.connectionId), userId: String(prepared.state?.targetUserId) })
    expect(share).toBeNull()
}

async function seedShare({ world, scope, connectionId }: { world: World, scope: Scope, connectionId: string }): Promise<string> {
    const targetUserId = String(world.actors.nonMember.userId)
    await integrationsSeed.share({ world, scope, connectionId, userId: targetUserId, permission: ConnectionSharePermission.USE })
    return targetUserId
}

function noAuthBody({ world, scope, externalId }: { world: World, scope: Scope, externalId: string }): Record<string, unknown> {
    return {
        externalId,
        displayName: 'sec-upsert',
        connectorName: integrationsSeed.CONNECTOR_NAME,
        projectId: world.scopes[scope].project.id,
        type: ConnectionType.NO_AUTH,
        value: { type: ConnectionType.NO_AUTH },
        connectorVersion: '0.0.0',
    }
}

function selfListCase({ id, url }: { id: string, url: string }): MatrixCase {
    return {
        id,
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async ({ world, scope }) => {
            await integrationsSeed.connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            return { request: { method: 'GET', url } }
        },
    }
}

function post({ url, body }: { url: string, body?: unknown }): WorldRequest {
    return { method: 'POST', url, ...(body === undefined ? {} : { body }) }
}

const shareRequest = (kind: 'add' | 'update' | 'remove') => async ({ world, scope, connectionId }: RequestParams): Promise<Built> => {
    if (kind === 'add') {
        const targetUserId = String(world.actors.nonMember.userId)
        return { request: post({ url: `/v1/connections/${connectionId}/shares`, body: { userIds: [targetUserId], permission: ConnectionSharePermission.USE } }), state: { targetUserId } }
    }
    const targetUserId = await seedShare({ world, scope, connectionId })
    if (kind === 'update') {
        return { request: post({ url: `/v1/connections/${connectionId}/shares/${targetUserId}`, body: { permission: ConnectionSharePermission.EDIT } }), state: { targetUserId } }
    }
    return { request: { method: 'DELETE', url: `/v1/connections/${connectionId}/shares/${targetUserId}` }, state: { targetUserId } }
}

const connectionReadCases: MatrixCase[] = [
    {
        id: 'GET /v1/connections',
        access: { type: 'project', permission: Permission.READ_CONNECTION },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const visible = await integrationsSeed.connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            const hidden = await integrationsSeed.connection({ world, scope, projectMembersPermission: null })
            return { request: { method: 'GET', url: '/v1/connections', query: { projectId: world.scopes[scope].project.id } }, state: { visible: visible.id, hidden: hidden.id } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            expect(response.text).toContain(String(prepared.state?.visible))
            if (identity !== 'tenantAdmin') {
                expect(response.text).not.toContain(String(prepared.state?.hidden))
            }
            expect(response.text).not.toContain(integrationsSeed.SECRET_MARKER)
        },
    },
    {
        id: 'GET /v1/connections/owners',
        access: { type: 'project', permission: Permission.READ_CONNECTION },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({ request: { method: 'GET', url: '/v1/connections/owners', query: { projectId: world.scopes[scope].project.id } } }),
    },
    ...exposureCases({
        id: 'GET /v1/connections/:id',
        need: 'see',
        request: async ({ connectionId }) => ({ request: { method: 'GET', url: `/v1/connections/${connectionId}` } }),
        afterAllowed: async ({ response }) => {
            expect(response.text).not.toContain(integrationsSeed.SECRET_MARKER)
        },
    }),
    ...exposureCases({
        id: 'GET /v1/connections/:id/detail',
        need: 'see',
        request: async ({ connectionId }) => ({ request: { method: 'GET', url: `/v1/connections/${connectionId}/detail` } }),
        afterAllowed: async ({ response }) => {
            expect(response.text).not.toContain(integrationsSeed.SECRET_MARKER)
        },
    }),
    selfListCase({ id: 'GET /v1/connections/accessible', url: '/v1/connections/accessible' }),
    selfListCase({ id: 'GET /v1/connections/share-candidates', url: '/v1/connections/share-candidates' }),
]

const connectionWriteCases: MatrixCase[] = [
    {
        id: 'POST /v1/connections',
        label: 'new connection',
        access: { type: 'project', permission: Permission.WRITE_CONNECTION },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const externalId = `sec-new-${world.newId().toLowerCase()}`
            return { request: post({ url: '/v1/connections', body: noAuthBody({ world, scope, externalId }) }), state: { externalId } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('connection', { externalId: String(prepared.state?.externalId) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/connections',
        label: 'overwrite an existing private connection',
        access: { type: 'custom', allow: ['tenantAdmin'] },
        expectOk: [201],
        identities: ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin', 'nonMember', 'foreignProjectAdmin'],
        prepare: async ({ world, scope }) => {
            const existing = await integrationsSeed.connection({ world, scope, projectMembersPermission: null, type: ConnectionType.NO_AUTH })
            return {
                request: post({ url: '/v1/connections', body: { ...noAuthBody({ world, scope, externalId: existing.externalId }), displayName: 'sec-hijacked' } }),
                state: { connectionId: existing.id, displayName: existing.displayName },
            }
        },
        afterDenied: expectConnectionUntouched,
    },
    ...exposureCases({
        id: 'POST /v1/connections/:id',
        need: 'manage',
        expectOk: [200],
        request: async ({ connectionId }) => ({ request: post({ url: `/v1/connections/${connectionId}`, body: { displayName: 'sec-renamed' } }) }),
        afterDenied: expectConnectionUntouched,
    }),
    ...exposureCases({
        id: 'DELETE /v1/connections/:id',
        need: 'owner',
        expectOk: [204],
        request: async ({ connectionId }) => ({ request: { method: 'DELETE', url: `/v1/connections/${connectionId}` } }),
        afterDenied: expectConnectionUntouched,
    }),
    ...exposureCases({
        id: 'POST /v1/connections/:id/revalidate',
        need: 'see',
        expectOk: [200],
        connectionOptions: { type: ConnectionType.NO_AUTH },
        request: async ({ connectionId }) => ({ request: post({ url: `/v1/connections/${connectionId}/revalidate` }) }),
    }),
    ...EXPOSURES.map((exposure): MatrixCase => ({
        id: 'POST /v1/connections/:id/remind-reauth',
        label: `${exposure} connection owned by someone else`,
        crossScope: true,
        access: { type: 'custom', allow: exposure === 'private' ? [] : integrationsCommon.allowedFor({ exposure, need: 'see' }) },
        expectOk: [200],
        prepare: async ({ world, scope }) => {
            const stranger = await securityWorld.createTenantMember({ tenantId: world.scopes[scope].tenant.id })
            const connection = await integrationsSeed.connection({
                world,
                scope,
                ownerId: stranger.id,
                status: ConnectionStatus.ERROR,
                projectMembersPermission: integrationsCommon.exposurePermission({ exposure }),
            })
            return { request: post({ url: `/v1/connections/${connection.id}/remind-reauth` }), state: { connectionId: connection.id, displayName: connection.displayName } }
        },
    })),
    ...exposureCases({
        id: 'POST /v1/connections/:id/shares',
        need: 'manage',
        expectOk: [200],
        request: shareRequest('add'),
        afterDenied: expectNoShare,
    }),
    ...exposureCases({
        id: 'POST /v1/connections/:id/shares/:userId',
        need: 'manage',
        expectOk: [200],
        request: shareRequest('update'),
        afterDenied: expectShareExists,
    }),
    ...exposureCases({
        id: 'DELETE /v1/connections/:id/shares/:userId',
        need: 'manage',
        expectOk: [200],
        request: shareRequest('remove'),
        afterDenied: expectShareExists,
    }),
    ...exposureCases({
        id: 'POST /v1/connections/:id/access',
        need: 'manage',
        expectOk: [200],
        request: async ({ world, scope, connectionId, exposure }) => ({
            request: post({
                url: `/v1/connections/${connectionId}/access`,
                body: { allProjects: false, projectIds: [world.scopes[scope].project.id], projectMembersPermission: integrationsCommon.exposurePermission({ exposure }) },
            }),
        }),
        afterDenied: async ({ prepared }) => {
            const stored = await db.findOneBy<{ projectIds: string[] }>('connection', { id: String(prepared.state?.connectionId) })
            expect(stored?.projectIds).toHaveLength(1)
        },
    }),
    ...exposureCases({
        id: 'POST /v1/connections/:id/access-impact',
        need: 'manage',
        expectOk: [200],
        request: async ({ world, scope, connectionId }) => ({
            request: post({ url: `/v1/connections/${connectionId}/access-impact`, body: { allProjects: false, projectIds: [world.scopes[scope].project.id] } }),
        }),
    }),
    {
        id: 'POST /v1/connections/oauth2/authorization-url',
        access: { type: 'custom', allow: [] },
        identities: ['anonymous'],
        prepare: async () => ({
            request: post({ url: '/v1/connections/oauth2/authorization-url', body: { connectorName: integrationsSeed.CONNECTOR_NAME, clientId: 'sec', redirectUrl: 'https://example.com/redirect' } }),
        }),
    },
    {
        id: 'POST /v1/connections/replace',
        label: 'both connections visible to every member',
        access: { type: 'project', permission: Permission.WRITE_CONNECTION },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const source = await integrationsSeed.connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            const target = await integrationsSeed.connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            return {
                request: post({ url: '/v1/connections/replace', body: { projectId: world.scopes[scope].project.id, sourceConnectionId: source.id, targetConnectionId: target.id } }),
                state: { connectionId: source.id, displayName: source.displayName },
            }
        },
        afterDenied: expectConnectionUntouched,
    },
    {
        id: 'POST /v1/connections/replace',
        label: 'connections private to the owner',
        access: { type: 'custom', allow: ['tenantAdmin'] },
        expectOk: [204],
        identities: ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin', 'nonMember', 'foreignProjectAdmin'],
        prepare: async ({ world, scope }) => {
            const source = await integrationsSeed.connection({ world, scope, projectMembersPermission: null })
            const target = await integrationsSeed.connection({ world, scope, projectMembersPermission: null })
            return {
                request: post({ url: '/v1/connections/replace', body: { projectId: world.scopes[scope].project.id, sourceConnectionId: source.id, targetConnectionId: target.id, deleteSourceConnection: true } }),
                state: { connectionId: source.id, displayName: source.displayName },
            }
        },
        afterDenied: expectConnectionUntouched,
    },
]

const globalAndTenantCases: MatrixCase[] = [
    {
        id: 'GET /v1/global-connections',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/global-connections' } }),
    },
    {
        id: 'POST /v1/global-connections',
        access: { type: 'tenantAdmin' },
        expectOk: [201],
        prepare: async ({ world, scope }) => ({
            request: post({
                url: '/v1/global-connections',
                body: {
                    displayName: 'sec-global',
                    connectorName: integrationsSeed.CONNECTOR_NAME,
                    scope: 'TENANT',
                    projectIds: [world.scopes[scope].project.id],
                    type: ConnectionType.NO_AUTH,
                    value: { type: ConnectionType.NO_AUTH },
                    connectorVersion: '0.0.0',
                },
            }),
        }),
    },
    {
        id: 'POST /v1/global-connections/:id',
        access: { type: 'tenantAdmin' },
        expectOk: [200],
        prepare: async ({ world, scope }) => {
            const connection = await integrationsSeed.connection({ world, scope, scopeType: ConnectionScope.TENANT })
            return { request: post({ url: `/v1/global-connections/${connection.id}`, body: { displayName: 'sec-global-renamed' } }), state: { connectionId: connection.id, displayName: connection.displayName } }
        },
        afterDenied: expectConnectionUntouched,
    },
    {
        id: 'DELETE /v1/global-connections/:id',
        access: { type: 'tenantAdmin' },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const connection = await integrationsSeed.connection({ world, scope, scopeType: ConnectionScope.TENANT })
            return { request: { method: 'DELETE', url: `/v1/global-connections/${connection.id}` }, state: { connectionId: connection.id, displayName: connection.displayName } }
        },
        afterDenied: expectConnectionUntouched,
    },
    {
        id: 'GET /v1/tenant-connections',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await integrationsSeed.connection({ world, scope })
            return { request: { method: 'GET', url: '/v1/tenant-connections' } }
        },
        afterAllowed: async ({ response }) => {
            expect(response.text).not.toContain(integrationsSeed.SECRET_MARKER)
        },
    },
    {
        id: 'GET /v1/tenant-connections/owners',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await integrationsSeed.connection({ world, scope })
            return { request: { method: 'GET', url: '/v1/tenant-connections/owners' } }
        },
    },
]

const replacementCases: MatrixCase[] = [
    {
        id: 'GET /v1/connection-replacements',
        access: { type: 'project', permission: Permission.READ_CONNECTION },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await integrationsSeed.connectionReplacement({ world, scope })
            return { request: { method: 'GET', url: '/v1/connection-replacements', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'POST /v1/connection-replacements',
        access: { type: 'project', permission: Permission.WRITE_PROJECT },
        prepare: async ({ world, scope }) => {
            const source = await integrationsSeed.connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            const target = await integrationsSeed.connection({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
            return {
                request: post({ url: '/v1/connection-replacements', body: { projectId: world.scopes[scope].project.id, sourceConnectionId: source.id, targetConnectionId: target.id } }),
                state: { sourceId: source.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('connection_replacement', { sourceConnectionId: String(prepared.state?.sourceId) })).toBeNull()
        },
    },
    {
        id: 'DELETE /v1/connection-replacements/:id',
        access: { type: 'project', permission: Permission.WRITE_PROJECT },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const replacement = await integrationsSeed.connectionReplacement({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/connection-replacements/${replacement.id}` }, state: { replacementId: replacement.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('connection_replacement', { id: String(prepared.state?.replacementId) })).not.toBeNull()
        },
    },
]

export const integrationsConnectionCases: MatrixCase[] = [
    ...connectionReadCases,
    ...connectionWriteCases,
    ...globalAndTenantCases,
    ...replacementCases,
]

type RequestParams = {
    world: World
    scope: Scope
    connectionId: string
    exposure: Exposure
}

type Built = Pick<PreparedRequest, 'request' | 'state'>

type ExposureCaseParams = {
    id: string
    need: Need
    request: (params: RequestParams) => Promise<Built>
    expectOk?: readonly number[]
    identities?: readonly Identity[]
    afterDenied?: (params: MatrixHookParams) => Promise<void>
    afterAllowed?: (params: MatrixHookParams) => Promise<void>
    connectionOptions?: { type?: ConnectionType, status?: ConnectionStatus }
}
