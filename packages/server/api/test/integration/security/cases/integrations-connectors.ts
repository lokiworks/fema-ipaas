import { BlueprintVersionAction, Permission } from '@fema-ipaas/core-utils'
import { ConnectorDemandStatus, ConnectorType, PackageType } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { createMockConnectorMetadata } from '../../../helpers/mocks'
import { integrationsSeed } from '../support/integrations-seed'
import { MatrixCase, MatrixHookParams } from '../support/matrix'
import { seed } from '../support/seed'
import { Identity, Scope, World, WorldRequest } from '../support/world'
import { EVERY_TENANT_USER, integrationsCommon } from './integrations-common'

function post({ url, body }: { url: string, body?: unknown }): WorldRequest {
    return { method: 'POST', url, ...(body === undefined ? {} : { body }) }
}

function blueprintCases({ id, need, request, expectOk, onlyDenied, afterDenied, withVersion, forbiddenIds }: BlueprintCaseParams): MatrixCase[] {
    return BLUEPRINT_VARIANTS.map((variant) => {
        const allowed = need === 'manage' ? variant.managers : variant.viewers
        return {
            id,
            label: variant.label,
            access: { type: 'custom', allow: allowed },
            crossScope: true,
            ...(forbiddenIds === undefined ? {} : { forbiddenIds }),
            ...(expectOk === undefined ? {} : { expectOk }),
            ...(onlyDenied === true ? { identities: integrationsCommon.deniedOnly({ allowed }) } : {}),
            prepare: async ({ world, scope }) => {
                const blueprint = await integrationsSeed.blueprint({
                    world,
                    scope,
                    ...(variant.ownerIdentity === null ? {} : { ownerId: String(world.actors[variant.ownerIdentity].userId) }),
                    collaboratorIds: variant.collaboratorIdentities.map((identity) => String(world.actors[identity].userId)),
                })
                const version = withVersion === true ? await integrationsSeed.blueprintVersion({ world, scope, blueprintId: blueprint.id, publishedBy: blueprint.ownerId }) : null
                const built = request({ world, scope, blueprintId: blueprint.id, versionId: version?.id ?? '', definition: blueprint.definition })
                return { request: built.request, state: { blueprintId: blueprint.id, ownerId: blueprint.ownerId, ...(built.state ?? {}) } }
            },
            ...(afterDenied === undefined ? {} : { afterDenied }),
        }
    })
}

async function expectBlueprintUntouched({ prepared }: MatrixHookParams): Promise<void> {
    const stored = await db.findOneBy<{ ownerId: string, collaboratorIds: string[] }>('connector_blueprint', { id: String(prepared.state?.blueprintId) })
    expect(stored).not.toBeNull()
    expect(stored?.ownerId).toBe(String(prepared.state?.ownerId))
}

const OPENAPI_DOCUMENT = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Sec audit', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    paths: { '/things': { get: { operationId: 'listThings', responses: { 200: { description: 'ok' } } } } },
})

const BLUEPRINT_VARIANTS: BlueprintVariant[] = [
    { label: 'owned by the tenant admin', ownerIdentity: null, collaboratorIdentities: [], viewers: ['tenantAdmin'], managers: ['tenantAdmin'] },
    { label: 'developer is a collaborator', ownerIdentity: null, collaboratorIdentities: ['developer'], viewers: ['tenantAdmin', 'developer'], managers: ['tenantAdmin'] },
    { label: 'owned by the developer', ownerIdentity: 'developer', collaboratorIdentities: [], viewers: ['tenantAdmin', 'developer'], managers: ['tenantAdmin', 'developer'] },
]

const blueprintCasesList: MatrixCase[] = [
    {
        id: 'GET /v1/connector-blueprints',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async ({ world, scope }) => {
            const blueprint = await integrationsSeed.blueprint({ world, scope })
            return { request: { method: 'GET', url: '/v1/connector-blueprints' }, state: { blueprintId: blueprint.id } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            if (identity !== 'tenantAdmin') {
                expect(response.text).not.toContain(String(prepared.state?.blueprintId))
            }
        },
    },
    {
        id: 'POST /v1/connector-blueprints',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async ({ world }) => ({
            request: post({
                url: '/v1/connector-blueprints',
                body: { displayName: 'Sec', identifier: `sec_${world.newId().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`, description: 'd', iconColor: '#000000', presetId: null },
            }),
        }),
    },
    {
        id: 'POST /v1/connector-blueprints/openapi/preview',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async () => ({ request: post({ url: '/v1/connector-blueprints/openapi/preview', body: { document: OPENAPI_DOCUMENT } }) }),
    },
    {
        id: 'POST /v1/connector-blueprints/openapi/import',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async ({ world }) => ({
            request: post({
                url: '/v1/connector-blueprints/openapi/import',
                body: { displayName: 'Sec', identifier: `sec_${world.newId().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`, description: 'd', iconColor: '#000000', document: OPENAPI_DOCUMENT },
            }),
        }),
    },
]

const blueprintByIdCases: MatrixCase[] = [
    ...blueprintCases({
        id: 'GET /v1/connector-blueprints/:id',
        need: 'view',
        request: ({ blueprintId }) => ({ request: { method: 'GET', url: `/v1/connector-blueprints/${blueprintId}` } }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id',
        need: 'view',
        request: ({ blueprintId, definition }) => ({ request: post({ url: `/v1/connector-blueprints/${blueprintId}`, body: { definition } }) }),
    }),
    ...blueprintCases({
        id: 'DELETE /v1/connector-blueprints/:id',
        need: 'manage',
        expectOk: [204],
        request: ({ blueprintId }) => ({ request: { method: 'DELETE', url: `/v1/connector-blueprints/${blueprintId}` } }),
        afterDenied: expectBlueprintUntouched,
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/collaborators',
        need: 'manage',
        request: ({ world, blueprintId }) => ({
            request: post({ url: `/v1/connector-blueprints/${blueprintId}/collaborators`, body: { collaboratorIds: [String(world.actors.projectAdmin.userId)] } }),
        }),
        afterDenied: async ({ prepared }) => {
            const stored = await db.findOneBy<{ collaboratorIds: string[] }>('connector_blueprint', { id: String(prepared.state?.blueprintId) })
            expect(stored?.collaboratorIds.length ?? 0).toBeLessThanOrEqual(1)
        },
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/owner',
        need: 'manage',
        request: ({ world, blueprintId }) => ({
            request: post({ url: `/v1/connector-blueprints/${blueprintId}/owner`, body: { ownerId: String(world.actors.projectAdmin.userId) } }),
        }),
        afterDenied: expectBlueprintUntouched,
    }),
    ...blueprintCases({
        id: 'GET /v1/connector-blueprints/:id/candidates',
        need: 'view',
        request: ({ blueprintId }) => ({ request: { method: 'GET', url: `/v1/connector-blueprints/${blueprintId}/candidates` } }),
    }),
    ...blueprintCases({
        id: 'GET /v1/connector-blueprints/:id/projects',
        need: 'view',
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        request: ({ blueprintId }) => ({ request: { method: 'GET', url: `/v1/connector-blueprints/${blueprintId}/projects` } }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/auth/test-data',
        need: 'view',
        onlyDenied: true,
        request: ({ blueprintId }) => ({ request: post({ url: `/v1/connector-blueprints/${blueprintId}/auth/test-data`, body: { values: {} } }) }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/auth/test',
        need: 'view',
        onlyDenied: true,
        request: ({ blueprintId }) => ({
            request: post({ url: `/v1/connector-blueprints/${blueprintId}/auth/test`, body: { kind: 'API', operationKey: null, projectId: null, code: null, redirectUrl: null, codeVerifier: null } }),
        }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/auth/publish',
        need: 'view',
        onlyDenied: true,
        request: ({ blueprintId }) => ({ request: post({ url: `/v1/connector-blueprints/${blueprintId}/auth/publish` }) }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/debug',
        need: 'view',
        onlyDenied: true,
        request: ({ blueprintId }) => ({ request: post({ url: `/v1/connector-blueprints/${blueprintId}/debug`, body: { operationKey: 'missing', input: {}, projectId: null } }) }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/debug-records',
        need: 'view',
        onlyDenied: true,
        request: ({ blueprintId }) => ({
            request: post({ url: `/v1/connector-blueprints/${blueprintId}/debug-records`, body: { operationKey: 'missing', input: {}, success: true, status: 200, durationMs: 1 } }),
        }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/publish',
        need: 'view',
        onlyDenied: true,
        request: ({ blueprintId }) => ({
            request: post({
                url: `/v1/connector-blueprints/${blueprintId}/publish`,
                body: { changeIds: ['x'], mode: 'NEW_VERSION', version: null, rollout: 'FULL', canaryProjectIds: [], description: 'sec' },
            }),
        }),
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/versions/:versionId/status',
        need: 'view',
        withVersion: true,
        onlyDenied: true,
        request: ({ blueprintId, versionId }) => ({
            request: post({ url: `/v1/connector-blueprints/${blueprintId}/versions/${versionId}/status`, body: { action: BlueprintVersionAction.STOP } }),
            state: { versionId },
        }),
        afterDenied: async ({ prepared }) => {
            const version = await db.findOneBy<{ status: string }>('connector_blueprint_version', { id: String(prepared.state?.versionId) })
            expect(version?.status).toBe('CANARY')
        },
    }),
    ...blueprintCases({
        id: 'POST /v1/connector-blueprints/:id/versions/:versionId/canary',
        need: 'view',
        withVersion: true,
        onlyDenied: true,
        request: ({ world, blueprintId, versionId }) => ({
            request: post({ url: `/v1/connector-blueprints/${blueprintId}/versions/${versionId}/canary`, body: { projectIds: [world.scopes.A.project.id] } }),
            state: { versionId },
        }),
    }),
]

const connectorCases: MatrixCase[] = [
    {
        id: 'POST /v1/connectors',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        identities: ['projectAdmin', 'developer', 'operator', 'viewer', 'nonMember', 'foreignProjectAdmin', 'anonymous'],
        prepare: async () => ({
            request: post({ url: '/v1/connectors', body: { packageType: PackageType.REGISTRY, scope: 'TENANT', connectorName: '@sec/connector-audit', connectorVersion: '0.0.1' } }),
        }),
        afterDenied: async () => {
            expect(await db.findOneBy('connector_metadata', { name: '@sec/connector-audit' })).toBeNull()
        },
    },
    {
        id: 'DELETE /v1/connectors/:id',
        access: { type: 'tenantAdmin' },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const metadata = createMockConnectorMetadata({ name: `@sec/connector-${world.newId().toLowerCase()}`, tenantId: world.scopes[scope].tenant.id, connectorType: ConnectorType.CUSTOM, packageType: PackageType.ARCHIVE })
            await db.save('connector_metadata', metadata)
            return { request: { method: 'DELETE', url: `/v1/connectors/${metadata.id}` }, state: { connectorId: metadata.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('connector_metadata', { id: String(prepared.state?.connectorId) })).not.toBeNull()
        },
    },
    {
        id: 'POST /v1/connectors/integrity/verify',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: post({ url: '/v1/connectors/integrity/verify' }) }),
    },
    {
        id: 'POST /v1/connectors/sync',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: post({ url: '/v1/connectors/sync' }) }),
    },
    {
        id: 'POST /v1/connectors/openapi/parse',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        prepare: async () => ({ request: post({ url: '/v1/connectors/openapi/parse', body: { document: OPENAPI_DOCUMENT } }) }),
    },
    {
        id: 'POST /v1/connectors/openapi/generate',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        prepare: async () => ({
            request: post({ url: '/v1/connectors/openapi/generate', body: { document: OPENAPI_DOCUMENT, operationIds: ['listThings'], connectorName: 'sec-audit', displayName: 'Sec audit' } }),
        }),
    },
    {
        id: 'POST /v1/connectors/options',
        access: { type: 'custom', allow: [] },
        identities: ['nonMember', 'foreignProjectAdmin', 'otherTenantAdmin', 'anonymous'],
        prepare: async ({ world, scope }) => ({
            request: post({
                url: '/v1/connectors/options',
                body: {
                    projectId: world.scopes[scope].project.id,
                    actionOrTriggerName: 'x',
                    propertyName: 'y',
                    workflowId: world.newId(),
                    workflowVersionId: world.newId(),
                    input: {},
                },
            }),
        }),
    },
]

const optionsRoleCases: MatrixCase[] = [
    {
        id: 'POST /v1/connectors/options',
        label: 'reading dropdown values with the workflow connections is an editing action',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        identities: ['operator', 'viewer'],
        crossScope: false,
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return {
                request: post({
                    url: '/v1/connectors/options',
                    body: {
                        projectId: world.scopes[scope].project.id,
                        actionOrTriggerName: 'x',
                        propertyName: 'y',
                        workflowId: workflow.id,
                        workflowVersionId: workflow.versionId,
                        input: {},
                    },
                }),
            }
        },
    },
]

const demandAndUsageCases: MatrixCase[] = [
    {
        id: 'POST /v1/connector-demands',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        expectOk: [201],
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async () => ({ request: post({ url: '/v1/connector-demands', body: { appName: 'sec-app', capability: 'sec-capability' } }) }),
    },
    {
        id: 'GET /v1/connector-demands',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await integrationsSeed.connectorDemand({ world, scope })
            return { request: { method: 'GET', url: '/v1/connector-demands' } }
        },
    },
    {
        id: 'POST /v1/connector-demands/:id',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const demand = await integrationsSeed.connectorDemand({ world, scope })
            return { request: post({ url: `/v1/connector-demands/${demand.id}`, body: { status: ConnectorDemandStatus.DONE } }), state: { demandId: demand.id } }
        },
        afterDenied: async ({ prepared }) => {
            const stored = await db.findOneBy<{ status: string }>('connector_demand', { id: String(prepared.state?.demandId) })
            expect(stored?.status).toBe(ConnectorDemandStatus.OPEN)
        },
    },
    {
        id: 'GET /v1/connector-usage',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async () => ({ request: { method: 'GET', url: '/v1/connector-usage' } }),
    },
    {
        id: 'GET /v1/connector-usage/workflows',
        access: { type: 'custom', allow: EVERY_TENANT_USER },
        forbiddenIds: integrationsCommon.selfTenantForbiddenIds,
        prepare: async () => ({ request: { method: 'GET', url: '/v1/connector-usage/workflows', query: { connectorName: integrationsSeed.CONNECTOR_NAME } } }),
    },
]

export const integrationsConnectorCases: MatrixCase[] = [
    ...blueprintCasesList,
    ...blueprintByIdCases,
    ...connectorCases,
    ...optionsRoleCases,
    ...demandAndUsageCases,
]

type BlueprintVariant = {
    label: string
    ownerIdentity: Identity | null
    collaboratorIdentities: Identity[]
    viewers: Identity[]
    managers: Identity[]
}

type BlueprintRequestParams = {
    world: World
    scope: Scope
    blueprintId: string
    versionId: string
    definition: unknown
}

type BlueprintCaseParams = {
    id: string
    need: 'view' | 'manage'
    request: (params: BlueprintRequestParams) => { request: WorldRequest, state?: Record<string, unknown> }
    expectOk?: readonly number[]
    onlyDenied?: boolean
    withVersion?: boolean
    afterDenied?: (params: MatrixHookParams) => Promise<void>
    forbiddenIds?: MatrixCase['forbiddenIds']
}
