import { WorkflowTrigger } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { workflowTransferTables } from '../../src/app/project-workspace/workflow-transfer-tables'

const NOW = '2026-10-03T00:00:00.000Z'

function triggerWithMapping(fields: unknown[]): WorkflowTrigger {
    return WorkflowTrigger.parse({
        name: 'trigger',
        valid: true,
        displayName: 'Trigger',
        type: 'EMPTY',
        lastUpdatedDate: NOW,
        settings: {},
        nextAction: {
            name: 'step_1',
            valid: true,
            displayName: 'Map',
            type: 'CONNECTOR',
            lastUpdatedDate: NOW,
            settings: {
                propertySettings: {},
                connectorName: '@fema-ipaas/connector-data-mapper',
                connectorVersion: '0.0.1',
                actionName: 'map_fields',
                input: { mapping: { fields } },
            },
        },
    })
}

describe('workflowTransferTables.referencedTableIds', () => {
    it('collects each looked-up table once, including nested per-item rows', () => {
        const trigger = triggerWithMapping([
            { id: 'a', target: 'dept', transforms: [{ type: 'LOOKUP', arg: 'mt_1' }] },
            { id: 'b', target: 'city', transforms: [{ type: 'TRIM' }, { type: 'LOOKUP', arg: 'mt_2' }] },
            { id: 'c', target: 'again', transforms: [{ type: 'LOOKUP', arg: 'mt_1' }] },
            { id: 'd', target: 'list', transforms: [], each: [{ id: 'e', target: 'x', transforms: [{ type: 'LOOKUP', arg: 'mt_3' }] }] },
        ])

        expect(workflowTransferTables.referencedTableIds(trigger).sort()).toEqual(['mt_1', 'mt_2', 'mt_3'])
    })

    it('ignores lookups without a table and other transforms', () => {
        const trigger = triggerWithMapping([{ id: 'a', target: 'dept', transforms: [{ type: 'LOOKUP' }, { type: 'UPPER' }] }])

        expect(workflowTransferTables.referencedTableIds(trigger)).toEqual([])
    })
})

describe('workflowTransferTables.withoutLookupTables', () => {
    it('drops the table id but keeps the lookup so the user picks a table again', () => {
        const trigger = triggerWithMapping([{ id: 'a', target: 'dept', source: '{{trigger.dept}}', transforms: [{ type: 'LOOKUP', arg: 'mt_1' }] }])

        const stripped = workflowTransferTables.withoutLookupTables(trigger)

        expect(workflowTransferTables.referencedTableIds(stripped)).toEqual([])
        expect(JSON.stringify(stripped)).toContain('"type":"LOOKUP"')
        expect(JSON.stringify(stripped)).toContain('{{trigger.dept}}')
        expect(JSON.stringify(trigger)).toContain('mt_1')
    })
})
