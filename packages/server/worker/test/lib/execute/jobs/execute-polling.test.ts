import { EngineResponseStatus, WorkerJobType, WorkflowActionType, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import type { PollingJobData, WorkflowVersion } from '@fema-ipaas/shared'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../src/lib/config/worker-settings', () => ({
    workerSettings: {
        getSettings: vi.fn().mockReturnValue({ TRIGGER_TIMEOUT_SECONDS: 60 }),
    },
}))

import { executePollingJob } from '../../../../src/lib/execute/jobs/execute-polling'
import { JobResultKind } from '../../../../src/lib/execute/types'

function workflowVersion(): WorkflowVersion {
    return {
        id: 'wv-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        workflowId: 'wf-1',
        displayName: 'Poll',
        trigger: {
            name: 'trigger',
            valid: true,
            displayName: 'Employee changed',
            lastUpdatedDate: '2024-01-01T00:00:00Z',
            type: WorkflowTriggerType.CONNECTOR,
            settings: { connectorName: '@fema-ipaas/connector-beisen', connectorVersion: '~0.3.0', triggerName: 'employee_changed', input: {}, propertySettings: {} },
            nextAction: {
                name: 'step_1',
                valid: true,
                displayName: 'Step',
                lastUpdatedDate: '2024-01-01T00:00:00Z',
                type: WorkflowActionType.CONNECTOR,
                settings: { connectorName: '@fema-ipaas/connector-feishu', connectorVersion: '~0.4.0', actionName: 'find_user', input: {}, propertySettings: {} },
            },
        },
        updatedBy: null,
        valid: true,
        schemaVersion: null,
        agentIds: [],
        state: WorkflowVersionState.LOCKED,
        connectionIds: [],
        backupFiles: null,
        notes: [],
    }
}

const data: PollingJobData = {
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    schemaVersion: 4,
    workflowVersionId: 'wv-1',
    workflowId: 'wf-1',
    triggerType: WorkflowTriggerType.CONNECTOR,
    jobType: WorkerJobType.EXECUTE_POLLING,
}

function contextOf({ submitPayloads }: { submitPayloads: () => Promise<unknown> }) {
    return {
        resolver: { resolve: vi.fn().mockResolvedValue({ kind: 'ready', workflowVersion: workflowVersion(), provision: {} }) },
        runtime: { execute: vi.fn().mockResolvedValue({ status: EngineResponseStatus.OK, response: { output: [{ recordInfo: { jobNumber: 'E1' } }] }, logs: '' }) },
        apiClient: { submitPayloads: vi.fn().mockImplementation(submitPayloads), recordTriggerRun: vi.fn().mockResolvedValue(undefined) },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        publicApiUrl: 'http://localhost',
        internalApiUrl: 'http://localhost',
        engineToken: 'token',
        workerIndex: 0,
    }
}

describe('executePollingJob', () => {
    it('reports the job as failed when the events could not be handed over, so the API rolls the cursor back', async () => {
        const ctx = contextOf({ submitPayloads: async () => { throw new Error('API went away') } })

        const result = await executePollingJob.execute(ctx as never, data)

        expect(result).toEqual({ kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.INTERNAL_ERROR })
    })

    it('completes the job normally when the events were handed over', async () => {
        const ctx = contextOf({ submitPayloads: async () => [] })

        const result = await executePollingJob.execute(ctx as never, data)

        expect(result.status).toBe(EngineResponseStatus.OK)
        expect(ctx.apiClient.submitPayloads).toHaveBeenCalledTimes(1)
    })
})
