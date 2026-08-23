import { EngineResponseStatus, FlowTriggerType, FlowVersion, FlowVersionState, LATEST_FLOW_SCHEMA_VERSION, TriggerRunStatus, WorkerToApiContract } from '@fema/shared'
import { describe, expect, it, vi } from 'vitest'
import { recordTriggerRun } from '../../../../src/lib/execute/utils/trigger-run-recorder'

function buildConnectorFlowVersion(connectorName: string): FlowVersion {
    return {
        id: 'fv1',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        flowId: 'flow1',
        displayName: 'Test Flow',
        updatedBy: null,
        valid: true,
        schemaVersion: LATEST_FLOW_SCHEMA_VERSION,
        agentIds: [],
        state: FlowVersionState.LOCKED,
        connectionIds: [],
        backupFiles: null,
        notes: [],
        trigger: {
            name: 'trigger',
            type: FlowTriggerType.CONNECTOR,
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
    } as unknown as FlowVersion
}

const log = { warn: vi.fn() } as unknown as Parameters<typeof recordTriggerRun>[0]['log']

describe('recordTriggerRun', () => {
    it('maps OK to COMPLETED', async () => {
        const recordTriggerRunRpc = vi.fn(async () => undefined)
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract

        await recordTriggerRun({ apiClient, log, flowVersion: buildConnectorFlowVersion('@fema/connector-slack'), platformId: 'p1', status: EngineResponseStatus.OK })

        expect(recordTriggerRunRpc).toHaveBeenCalledWith({ platformId: 'p1', connectorName: '@fema/connector-slack', status: TriggerRunStatus.COMPLETED })
    })

    it('maps non-OK statuses to FAILED', async () => {
        const recordTriggerRunRpc = vi.fn(async () => undefined)
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract

        await recordTriggerRun({ apiClient, log, flowVersion: buildConnectorFlowVersion('@fema/connector-slack'), platformId: 'p1', status: EngineResponseStatus.INTERNAL_ERROR })

        expect(recordTriggerRunRpc).toHaveBeenCalledWith({ platformId: 'p1', connectorName: '@fema/connector-slack', status: TriggerRunStatus.FAILED })
    })

    it('skips non-connector triggers', async () => {
        const recordTriggerRunRpc = vi.fn(async () => undefined)
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract
        const emptyTriggerFlowVersion = { ...buildConnectorFlowVersion('@fema/connector-slack'), trigger: { type: FlowTriggerType.EMPTY, settings: {} } } as unknown as FlowVersion

        await recordTriggerRun({ apiClient, log, flowVersion: emptyTriggerFlowVersion, platformId: 'p1', status: EngineResponseStatus.OK })

        expect(recordTriggerRunRpc).not.toHaveBeenCalled()
    })

    it('never throws when the rpc fails', async () => {
        const recordTriggerRunRpc = vi.fn(async () => {
            throw new Error('rpc down')
        })
        const apiClient = { recordTriggerRun: recordTriggerRunRpc } as unknown as WorkerToApiContract

        await expect(recordTriggerRun({ apiClient, log, flowVersion: buildConnectorFlowVersion('@fema/connector-slack'), platformId: 'p1', status: EngineResponseStatus.OK })).resolves.toBeUndefined()
    })
})
