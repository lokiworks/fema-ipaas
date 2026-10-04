import { OptionalServiceKind } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { MatrixCase } from '../support/matrix'

const WORKER_ACTION_OK = [200, 204, 409]

const healthCases: MatrixCase[] = [
    {
        id: 'GET /v1/health/system',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/system' } }),
    },
    {
        id: 'GET /v1/health/components',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/components' } }),
    },
    {
        id: 'POST /v1/health/backup-confirmation',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'POST', url: '/v1/health/backup-confirmation' } }),
    },
    {
        id: 'POST /v1/health/services/check',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'POST', url: '/v1/health/services/check', body: { kind: OptionalServiceKind.OBJECT_STORAGE } } }),
    },
    {
        id: 'GET /v1/health/run-metrics',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({
            request: {
                method: 'GET',
                url: '/v1/health/run-metrics',
                query: { createdAfter: dayjs().subtract(7, 'day').toISOString(), createdBefore: dayjs().toISOString() },
            },
        }),
    },
    {
        id: 'GET /v1/health/queue-metrics',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({
            request: {
                method: 'GET',
                url: '/v1/health/queue-metrics',
                query: { createdAfter: dayjs().subtract(7, 'day').toISOString(), createdBefore: dayjs().toISOString() },
            },
        }),
    },
    {
        id: 'GET /v1/health/history',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/history' } }),
    },
    {
        id: 'GET /v1/health/diagnostics',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/diagnostics' } }),
    },
    {
        id: 'GET /v1/health/setup-checklist',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/setup-checklist' } }),
    },
    {
        id: 'GET /v1/health/overview',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/overview' } }),
    },
    {
        id: 'GET /v1/health/diagnostics-bundle',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/health/diagnostics-bundle' } }),
    },
]

const backupCases: MatrixCase[] = [
    {
        id: 'GET /v1/backups/overview',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'GET', url: '/v1/backups/overview' } }),
    },
    {
        id: 'GET /v1/backups',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'GET', url: '/v1/backups' } }),
    },
    {
        id: 'GET /v1/backups/settings',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'GET', url: '/v1/backups/settings' } }),
    },
    {
        id: 'GET /v1/backups/:id/restore-precheck',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: [200, 404],
        prepare: async ({ world }) => ({ request: { method: 'GET', url: `/v1/backups/${world.newId()}/restore-precheck` } }),
    },
    {
        id: 'DELETE /v1/backups/:id',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: [204, 404],
        prepare: async ({ world }) => ({ request: { method: 'DELETE', url: `/v1/backups/${world.newId()}` } }),
    },
    {
        id: 'GET /v1/service-settings',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'GET', url: '/v1/service-settings' } }),
    },
    {
        id: 'DELETE /v1/service-settings/:kind',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: [200, 400],
        prepare: async () => ({ request: { method: 'DELETE', url: '/v1/service-settings/CONNECTOR_REGISTRY' } }),
    },
    {
        id: 'POST /v1/backups',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: [201, 400],
        prepare: async () => ({ request: { method: 'POST', url: '/v1/backups', body: {} } }),
    },
    {
        id: 'POST /v1/backups/settings',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({
            request: {
                method: 'POST',
                url: '/v1/backups/settings',
                body: { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false },
            },
        }),
    },
    {
        id: 'POST /v1/service-settings',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: [200, 400],
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/service-settings', body: { kind: 'CONNECTOR_REGISTRY', config: { url: 'http://127.0.0.1:1/registry' } } },
        }),
    },
    {
        id: 'POST /v1/service-settings/test',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/service-settings/test', body: { draft: { kind: 'CONNECTOR_REGISTRY', config: { url: 'http://127.0.0.1:1/registry' } } } },
        }),
    },
]

const encryptionCases: MatrixCase[] = [
    {
        id: 'GET /v1/encryption/status',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/encryption/status' } }),
    },
    {
        id: 'POST /v1/encryption/rotate',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        prepare: async () => ({ request: { method: 'POST', url: '/v1/encryption/rotate' } }),
    },
]

const workerCases: MatrixCase[] = [
    {
        id: 'GET /v1/worker-machines',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/worker-machines' } }),
    },
    {
        id: 'GET /v1/worker-machines/fleet',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/worker-machines/fleet' } }),
    },
    {
        id: 'GET /v1/worker-machines/worker-groups',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/worker-machines/worker-groups' } }),
    },
    {
        id: 'GET /v1/worker-machines/queue-metrics',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/worker-machines/queue-metrics' } }),
    },
    {
        id: 'GET /v1/worker-machines/queue-metrics/prometheus/:queueName?',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/worker-machines/queue-metrics/prometheus/workerJobs' } }),
    },
    {
        id: 'POST /v1/worker-machines/:id/drain',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: WORKER_ACTION_OK,
        prepare: async ({ world }) => ({ request: { method: 'POST', url: `/v1/worker-machines/${world.newId()}/drain` } }),
    },
    {
        id: 'POST /v1/worker-machines/:id/resume',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: WORKER_ACTION_OK,
        prepare: async ({ world }) => ({ request: { method: 'POST', url: `/v1/worker-machines/${world.newId()}/resume` } }),
    },
    {
        id: 'DELETE /v1/worker-machines/:id',
        access: { type: 'tenantAdmin' },
        crossScope: false,
        expectOk: WORKER_ACTION_OK,
        prepare: async ({ world }) => ({ request: { method: 'DELETE', url: `/v1/worker-machines/${world.newId()}` } }),
    },
]

export const runtimePlatformCases: MatrixCase[] = [...healthCases, ...backupCases, ...encryptionCases, ...workerCases]
