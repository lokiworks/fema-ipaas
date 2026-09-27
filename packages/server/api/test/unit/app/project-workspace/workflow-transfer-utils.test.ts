import { WorkflowTrigger, WorkflowTriggerType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { workflowTransferUtils } from '../../../../src/app/project-workspace/workflow-transfer-utils'

function trigger(): WorkflowTrigger {
    const parsed = WorkflowTrigger.parse({
        name: 'trigger',
        type: WorkflowTriggerType.CONNECTOR,
        valid: true,
        displayName: 'New row',
        lastUpdatedDate: '2026-01-01T00:00:00.000Z',
        settings: {
            connectorName: '@fema-ipaas/connector-demo',
            connectorVersion: '0.1.0',
            triggerName: 'new_row',
            input: { auth: '{{connections[\'tenant-conn\']}}', table: 'orders' },
            propertySettings: {},
        },
        nextAction: {
            name: 'step_1',
            type: 'CONNECTOR',
            valid: true,
            displayName: 'Send',
            lastUpdatedDate: '2026-01-01T00:00:00.000Z',
            settings: {
                connectorName: '@fema-ipaas/connector-demo',
                connectorVersion: '0.1.0',
                actionName: 'send',
                input: { auth: '{{connections[\'project-conn\']}}', tableId: 'old-table-id' },
                propertySettings: {},
                errorHandlingOptions: {},
            },
        },
    })
    return parsed
}

describe('workflowTransferUtils', () => {
    it('collects every referenced connection id', () => {
        expect(workflowTransferUtils.collectConnectionIds(trigger())).toEqual(['tenant-conn', 'project-conn'])
    })

    it('strips only the connections that are not available and counts them', () => {
        const result = workflowTransferUtils.stripUnavailableConnections({
            trigger: trigger(),
            isAvailable: (id) => id === 'tenant-conn',
        })
        expect(result.cleared).toBe(1)
        expect(workflowTransferUtils.collectConnectionIds(result.trigger)).toEqual(['tenant-conn'])
    })

    it('strips every connection when nothing is available, without touching the input', () => {
        const original = trigger()
        const result = workflowTransferUtils.stripUnavailableConnections({ trigger: original, isAvailable: () => false })
        expect(result.cleared).toBe(2)
        expect(workflowTransferUtils.collectConnectionIds(result.trigger)).toEqual([])
        expect(workflowTransferUtils.collectConnectionIds(original)).toEqual(['tenant-conn', 'project-conn'])
    })

    it('remaps copied resource ids in step inputs', () => {
        const remapped = workflowTransferUtils.remapIds({ trigger: trigger(), idMap: new Map([['old-table-id', 'new-table-id']]) })
        expect(JSON.stringify(remapped)).toContain('new-table-id')
        expect(JSON.stringify(remapped)).not.toContain('old-table-id')
    })
})
