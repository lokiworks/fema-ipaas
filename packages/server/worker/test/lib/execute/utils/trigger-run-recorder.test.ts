import { EngineResponseStatus, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, LATEST_WORKFLOW_SCHEMA_VERSION, TriggerRunStatus, WorkerToApiContract } from '@fema-ipaas/shared'
import { describe, expect, it, vi } from 'vitest'
import { recordTriggerRun } from '../../../../src/lib/execute/utils/trigger-run-recorder'

function buildConnectorWorkflowVersion(connectorName: string): WorkflowVersion {
    return {
        id: 'fv1',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        workflowId: 'workflow1',
        displayName: 'Test Workflow',
        updatedBy: null,
        valid: true,
        schemaVersion: LATEST_WORKFLOW_SCHEMA_VERSION,
        agentIds: [],
        state: WorkflowVersionState.LOCKED,
        connectionIds: [],
        backupFiles: null,
        notes: [],
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.CONNECTOR,
            displayName: 'Trigger',
            valid: true,
            lastUpdatedDate: '2026-01-01T00:00:00.000Z',
            settings: {
                connectorName,
                connectorVersion: '0.0.1',
                propertySettings: {},
                input: {},
            },
        },
    } as unknown as WorkflowVersion
}

const log = { warn: vi.fn() } as unknown as Parameters<typeof recordTriggerRun>[0]['log']

describe('recordTriggerRun', () => {
    it('maps OK to COMPLETED', async () => {
        const recordTriggerRunRpc = vi.fn(async () => undefined)
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract

        await recordTriggerRun({ apiClient, log, workflowVersion: buildConnectorWorkflowVersion('@fema-ipaas/connector-slack'), tenantId: 'p1', status: EngineResponseStatus.OK })

        expect(recordTriggerRunRpc).toHaveBeenCalledWith({ tenantId: 'p1', connectorName: '@fema-ipaas/connector-slack', status: TriggerRunStatus.COMPLETED })
    })

    it('maps non-OK statuses to FAILED', async () => {
        const recordTriggerRunRpc = vi.fn(async () => undefined)
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract

        await recordTriggerRun({ apiClient, log, workflowVersion: buildConnectorWorkflowVersion('@fema-ipaas/connector-slack'), tenantId: 'p1', status: EngineResponseStatus.INTERNAL_ERROR })

        expect(recordTriggerRunRpc).toHaveBeenCalledWith({ tenantId: 'p1', connectorName: '@fema-ipaas/connector-slack', status: TriggerRunStatus.FAILED })
    })

    it('skips non-connector triggers', async () => {
        const recordTriggerRunRpc = vi.fn(async () => undefined)
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract
        const emptyTriggerWorkflowVersion = { ...buildConnectorWorkflowVersion('@fema-ipaas/connector-slack'), trigger: { type: WorkflowTriggerType.EMPTY, settings: {} } } as unknown as WorkflowVersion

        await recordTriggerRun({ apiClient, log, workflowVersion: emptyTriggerWorkflowVersion, tenantId: 'p1', status: EngineResponseStatus.OK })

        expect(recordTriggerRunRpc).not.toHaveBeenCalled()
    })

    it('never throws when the rpc fails', async () => {
        const recordTriggerRunRpc = vi.fn(async () => {
            throw new Error('rpc down')
        })
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract

        await expect(recordTriggerRun({ apiClient, log, workflowVersion: buildConnectorWorkflowVersion('@fema-ipaas/connector-slack'), tenantId: 'p1', status: EngineResponseStatus.OK })).resolves.toBeUndefined()
    })
})
