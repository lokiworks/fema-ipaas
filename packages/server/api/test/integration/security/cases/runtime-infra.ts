import { generateId } from '@fema-ipaas/core-utils'
import dayjs from 'dayjs'
import { db } from '../../../helpers/db'
import { MatrixCase } from '../support/matrix'
import { runtimeChecks } from '../support/runtime-checks'
import { runtimeSeed } from '../support/runtime-seed'
import { Identity, Scope, World } from '../support/world'

const BLOCKED_WEBHOOK_URL = 'http://127.0.0.1/hook'
const ADMIN_IDENTITIES = ['tenantAdmin', 'projectAdmin', 'developer', 'operator', 'viewer', 'nonMember', 'foreignProjectAdmin', 'anonymous'] as const

function adminOf({ scope }: { scope: Scope }): Identity {
    return scope === 'T2' ? 'otherTenantAdmin' : 'tenantAdmin'
}

async function alertDataInBothTenants({ world, scope }: { world: World, scope: Scope }): Promise<{ channelId: string, policyId: string }> {
    const foreignScope: Scope = scope === 'T2' ? 'A' : 'T2'
    const channelId = await runtimeSeed.alertChannelFor({ world, identity: adminOf({ scope }), url: BLOCKED_WEBHOOK_URL })
    const policyId = await runtimeSeed.alertPolicyFor({ world, identity: adminOf({ scope }), channelId })
    const foreignChannelId = await runtimeSeed.alertChannelFor({ world, identity: adminOf({ scope: foreignScope }) })
    const foreignPolicyId = await runtimeSeed.alertPolicyFor({ world, identity: adminOf({ scope: foreignScope }), channelId: foreignChannelId })
    await runtimeSeed.alertRecord({ world, scope, policyId })
    await runtimeSeed.alertRecord({ world, scope: foreignScope, policyId: foreignPolicyId })
    return { channelId, policyId }
}

async function auditEventIn({ world, scope }: { world: World, scope: Scope }): Promise<void> {
    const info = world.scopes[scope]
    const now = dayjs().toISOString()
    await db.save('audit_event', {
        id: generateId(),
        created: now,
        updated: now,
        tenantId: info.tenant.id,
        projectId: info.project.id,
        projectDisplayName: info.project.displayName,
        userId: info.ownerId,
        userEmail: null,
        ip: null,
        action: 'workflow.created',
        data: {},
    })
}

const alertCases: MatrixCase[] = [
    {
        id: 'GET /v1/alerts/capabilities',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/alerts/capabilities' } }),
    },
    {
        id: 'GET /v1/alerts/channels',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await alertDataInBothTenants({ world, scope })
            return { request: { method: 'GET', url: '/v1/alerts/channels' } }
        },
    },
    {
        id: 'POST /v1/alerts/channels',
        access: { type: 'tenantAdminSelf' },
        expectOk: [201],
        prepare: async ({ world }) => ({
            request: { method: 'POST', url: '/v1/alerts/channels', body: { name: runtimeSeed.shortName({ world, prefix: 'sec-new' }), type: 'WEBHOOK', url: 'https://example.com/hook' } },
        }),
    },
    {
        id: 'POST /v1/alerts/channels/:id',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const { channelId } = await alertDataInBothTenants({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/alerts/channels/${channelId}`, body: { name: runtimeSeed.shortName({ world, prefix: 'renamed' }), type: 'WEBHOOK', url: BLOCKED_WEBHOOK_URL } },
                state: { channelId },
            }
        },
        afterDenied: async ({ prepared }) => {
            const channelId = runtimeChecks.stateString({ prepared, key: 'channelId' })
            expect(String(await runtimeChecks.column({ entity: 'notification_channel', id: channelId, name: 'name' }))).not.toContain('renamed')
        },
    },
    {
        id: 'DELETE /v1/alerts/channels/:id',
        access: { type: 'tenantAdmin' },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const channelId = await runtimeSeed.alertChannelFor({ world, identity: adminOf({ scope }), url: BLOCKED_WEBHOOK_URL })
            return { request: { method: 'DELETE', url: `/v1/alerts/channels/${channelId}` }, state: { channelId } }
        },
        afterDenied: async ({ prepared }) => {
            const channelId = runtimeChecks.stateString({ prepared, key: 'channelId' })
            expect(await runtimeChecks.rowExists({ entity: 'notification_channel', where: { id: channelId } })).toBe(true)
        },
    },
    {
        id: 'POST /v1/alerts/channels/:id/test',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const channelId = await runtimeSeed.alertChannelFor({ world, identity: adminOf({ scope }), url: BLOCKED_WEBHOOK_URL })
            return { request: { method: 'POST', url: `/v1/alerts/channels/${channelId}/test` } }
        },
    },
    {
        id: 'GET /v1/alerts/policies',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await alertDataInBothTenants({ world, scope })
            return { request: { method: 'GET', url: '/v1/alerts/policies' } }
        },
    },
    {
        id: 'POST /v1/alerts/policies',
        label: 'channel of another tenant is rejected with a validation error and nothing is created',
        access: { type: 'tenantAdmin' },
        identities: ADMIN_IDENTITIES,
        expectOk: [201],
        alsoDeniedWith: [409],
        prepare: async ({ world, scope }) => {
            const { channelId } = await alertDataInBothTenants({ world, scope })
            const body = runtimeSeed.policyBody({ world, channelId })
            return { request: { method: 'POST', url: '/v1/alerts/policies', body }, state: { policyName: String(body.name) } }
        },
        afterDenied: async ({ prepared }) => {
            const policyName = runtimeChecks.stateString({ prepared, key: 'policyName' })
            expect(await runtimeChecks.rowExists({ entity: 'alert_policy', where: { name: policyName } })).toBe(false)
        },
    },
    {
        id: 'POST /v1/alerts/policies/:id',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const { channelId, policyId } = await alertDataInBothTenants({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/alerts/policies/${policyId}`, body: { ...runtimeSeed.policyBody({ world, channelId }), name: runtimeSeed.shortName({ world, prefix: 'renamed' }) } },
                state: { policyId },
            }
        },
        afterDenied: async ({ prepared }) => {
            const policyId = runtimeChecks.stateString({ prepared, key: 'policyId' })
            expect(String(await runtimeChecks.column({ entity: 'alert_policy', id: policyId, name: 'name' }))).not.toContain('renamed')
        },
    },
    {
        id: 'DELETE /v1/alerts/policies/:id',
        access: { type: 'tenantAdmin' },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const { policyId } = await alertDataInBothTenants({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/alerts/policies/${policyId}` }, state: { policyId } }
        },
        afterDenied: async ({ prepared }) => {
            const policyId = runtimeChecks.stateString({ prepared, key: 'policyId' })
            expect(await runtimeChecks.rowExists({ entity: 'alert_policy', where: { id: policyId } })).toBe(true)
        },
    },
    {
        id: 'GET /v1/alerts/records',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await alertDataInBothTenants({ world, scope })
            return { request: { method: 'GET', url: '/v1/alerts/records' } }
        },
    },
    {
        id: 'GET /v1/alerts/records/stats',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world, scope }) => {
            await alertDataInBothTenants({ world, scope })
            return { request: { method: 'GET', url: '/v1/alerts/records/stats' } }
        },
    },
]

const auditCases: MatrixCase[] = [
    {
        id: 'GET /v1/audit-events',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world }) => {
            await auditEventIn({ world, scope: 'A' })
            await auditEventIn({ world, scope: 'B' })
            await auditEventIn({ world, scope: 'T2' })
            return { request: { method: 'GET', url: '/v1/audit-events', query: { limit: 100 } } }
        },
        forbiddenIds: ({ world, identity }) => (identity === 'otherTenantAdmin'
            ? [world.scopes.A.project.id, world.scopes.B.project.id, world.scopes.A.tenant.id]
            : [world.scopes.T2.project.id, world.scopes.T2.tenant.id]),
    },
    {
        id: 'POST /v1/audit-events/exports',
        access: { type: 'tenantAdminSelf' },
        expectOk: [204],
        prepare: async () => ({ request: { method: 'POST', url: '/v1/audit-events/exports', body: { rows: 1 } } }),
    },
]

export const runtimeAlertAuditCases: MatrixCase[] = [...alertCases, ...auditCases]
