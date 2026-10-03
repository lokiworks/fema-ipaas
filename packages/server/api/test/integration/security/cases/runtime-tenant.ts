import { Permission } from '@fema-ipaas/core-utils'
import { RunMonitorChartMode, RunMonitorMetric, RunMonitorRange } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { MatrixCase } from '../support/matrix'
import { runtimeChecks } from '../support/runtime-checks'
import { runtimeSeed } from '../support/runtime-seed'
import { seed } from '../support/seed'
import { Identity, World } from '../support/world'

const RECIPIENT: Identity = 'viewer'
const VIEW_CONFIG = { range: RunMonitorRange.LAST_7_DAYS, projectIds: [], workflowIds: [], metric: RunMonitorMetric.ALL, chartMode: RunMonitorChartMode.CHART }

async function dataInEveryScope({ world }: { world: World }): Promise<void> {
    await runtimeSeed.runsInEveryScope({ world })
    await runtimeSeed.issuesInEveryScope({ world })
    await Promise.all((['A', 'B', 'T2'] as const).map((scope) => seed.workflow({ world, scope })))
}

const visibilityCases: MatrixCase[] = [
    {
        id: 'GET /v1/home/summary',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await dataInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/home/summary', query: { since: dayjs().subtract(7, 'day').toISOString() } } }
        },
    },
    {
        id: 'GET /v1/global-search',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await dataInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/global-search', query: { query: 'sec' } } }
        },
    },
    {
        id: 'GET /v1/run-monitor/summary',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await dataInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/run-monitor/summary', query: { range: RunMonitorRange.LAST_7_DAYS } } }
        },
    },
    {
        id: 'GET /v1/run-monitor/ai-usage',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await dataInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/run-monitor/ai-usage', query: { range: RunMonitorRange.LAST_7_DAYS } } }
        },
    },
    {
        id: 'GET /v1/run-monitor/options',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await dataInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/run-monitor/options' } }
        },
    },
]

const notificationCases: MatrixCase[] = [
    {
        id: 'GET /v1/notifications',
        access: { type: 'authenticated' },
        forbiddenIds: ({ identity }) => runtimeSeed.othersMarkers({ identity, kind: 'notification' }),
        prepare: async ({ world }) => {
            await runtimeSeed.seedForEveryOwner({ world, kind: 'notification' })
            return { request: { method: 'GET', url: '/v1/notifications' } }
        },
    },
    {
        id: 'GET /v1/notifications/unread-count',
        access: { type: 'authenticated' },
        prepare: async ({ world }) => {
            await runtimeSeed.seedForEveryOwner({ world, kind: 'notification' })
            return { request: { method: 'GET', url: '/v1/notifications/unread-count' } }
        },
    },
    {
        id: 'POST /v1/notifications/:id/read',
        access: { type: 'authenticated' },
        expectOk: [204],
        prepare: async ({ world }) => {
            const id = await runtimeSeed.notificationFor({ world, identity: RECIPIENT })
            return { request: { method: 'POST', url: `/v1/notifications/${id}/read` }, state: { notificationId: id } }
        },
        afterAllowed: async ({ prepared, identity }) => {
            const notificationId = runtimeChecks.stateString({ prepared, key: 'notificationId' })
            expect(await runtimeChecks.column({ entity: 'notification', id: notificationId, name: 'read' })).toBe(identity === RECIPIENT)
        },
    },
    {
        id: 'POST /v1/notifications/read-all',
        access: { type: 'authenticated' },
        expectOk: [204],
        prepare: async ({ world }) => {
            const id = await runtimeSeed.notificationFor({ world, identity: RECIPIENT })
            return { request: { method: 'POST', url: '/v1/notifications/read-all' }, state: { notificationId: id } }
        },
        afterAllowed: async ({ prepared, identity }) => {
            const notificationId = runtimeChecks.stateString({ prepared, key: 'notificationId' })
            expect(await runtimeChecks.column({ entity: 'notification', id: notificationId, name: 'read' })).toBe(identity === RECIPIENT)
        },
    },
]

const monitorViewCases: MatrixCase[] = [
    {
        id: 'GET /v1/run-monitor/views',
        access: { type: 'authenticated' },
        forbiddenIds: ({ identity }) => runtimeSeed.othersMarkers({ identity, kind: 'view' }),
        prepare: async ({ world }) => {
            await runtimeSeed.seedForEveryOwner({ world, kind: 'view' })
            return { request: { method: 'GET', url: '/v1/run-monitor/views' } }
        },
    },
    {
        id: 'POST /v1/run-monitor/views',
        access: { type: 'authenticated' },
        expectOk: [201],
        prepare: async ({ world }) => {
            await runtimeSeed.clearMonitorViews()
            return { request: { method: 'POST', url: '/v1/run-monitor/views', body: { name: `new-${world.newId().slice(0, 12)}`, config: VIEW_CONFIG } } }
        },
    },
    {
        id: 'POST /v1/run-monitor/views/:id',
        access: { type: 'custom', allow: [RECIPIENT] },
        prepare: async ({ world }) => {
            const id = await runtimeSeed.monitorViewFor({ world, identity: RECIPIENT })
            return {
                request: { method: 'POST', url: `/v1/run-monitor/views/${id}`, body: { name: `renamed-${world.newId().slice(0, 8)}` } },
                state: { viewId: id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const viewId = runtimeChecks.stateString({ prepared, key: 'viewId' })
            expect(String(await runtimeChecks.column({ entity: 'run_monitor_view', id: viewId, name: 'name' }))).not.toContain('renamed')
        },
    },
    {
        id: 'DELETE /v1/run-monitor/views/:id',
        access: { type: 'custom', allow: [RECIPIENT] },
        expectOk: [204],
        prepare: async ({ world }) => {
            const id = await runtimeSeed.monitorViewFor({ world, identity: RECIPIENT })
            return { request: { method: 'DELETE', url: `/v1/run-monitor/views/${id}` }, state: { viewId: id } }
        },
        afterDenied: async ({ prepared }) => {
            const viewId = runtimeChecks.stateString({ prepared, key: 'viewId' })
            expect(await runtimeChecks.rowExists({ entity: 'run_monitor_view', where: { id: viewId } })).toBe(true)
        },
    },
]

const limitCases: MatrixCase[] = [
    {
        id: 'GET /v1/limits/instance',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/limits/instance' } }),
    },
    {
        id: 'GET /v1/limits/projects',
        access: { type: 'tenantAdminSelf' },
        prepare: async ({ world }) => {
            await seed.workflow({ world, scope: 'A' })
            await seed.workflow({ world, scope: 'T2' })
            return { request: { method: 'GET', url: '/v1/limits/projects' } }
        },
    },
    {
        id: 'POST /v1/limits/projects/:projectId',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => ({
            request: { method: 'POST', url: `/v1/limits/projects/${world.scopes[scope].project.id}`, body: { workflowsLimit: null, monthlyRunsLimit: 1 } },
            state: { projectId: world.scopes[scope].project.id },
        }),
        afterDenied: async ({ prepared }) => {
            const projectId = runtimeChecks.stateString({ prepared, key: 'projectId' })
            expect(await runtimeChecks.column({ entity: 'project', id: projectId, name: 'monthlyRunsLimit' })).toBeNull()
        },
        afterAllowed: async ({ prepared, world }) => {
            const projectId = runtimeChecks.stateString({ prepared, key: 'projectId' })
            expect(projectId).toBe(world.scopes.A.project.id)
            await runtimeChecks.reset({ entity: 'project', id: projectId, values: { monthlyRunsLimit: null } })
        },
    },
    {
        id: 'GET /v1/limits/project-usage',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/limits/project-usage', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
]

export const runtimeTenantCases: MatrixCase[] = [...visibilityCases, ...notificationCases, ...monitorViewCases, ...limitCases]
