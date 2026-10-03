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

export const runtimePlatformCases: MatrixCase[] = [...healthCases, ...encryptionCases, ...workerCases]
