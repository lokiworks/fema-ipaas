import { WorkflowActionType, WorkflowTrigger, WorkflowTriggerType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { workflowReferenceUtils } from '../../src/app/workflows/workflow/workflow-reference.service'

const DATE = '2026-05-02T00:00:00.000Z'

function callerWith({ connectorName, targetId }: { connectorName: string, targetId: string }): { version: { trigger: WorkflowTrigger } } {
    return {
        version: {
            trigger: {
                name: 'trigger',
                type: WorkflowTriggerType.EMPTY,
                valid: true,
                displayName: 'Trigger',
                lastUpdatedDate: DATE,
                settings: {},
                nextAction: {
                    name: 'step_1',
                    type: WorkflowActionType.CONNECTOR,
                    valid: true,
                    displayName: 'Call',
                    lastUpdatedDate: DATE,
                    settings: {
                        connectorName,
                        connectorVersion: '0.0.1',
                        actionName: 'callWorkflow',
                        input: { workflowId: targetId },
                        propertySettings: {},
                    },
                },
            },
        },
    }
}

describe('workflowReferenceUtils', () => {
    it('finds a workflow that calls the target through the subflows connector', () => {
        const candidate = callerWith({ connectorName: '@fema-ipaas/connector-subflows', targetId: 'target_ext' })
        expect(workflowReferenceUtils.callsSubflow({ candidate, target: { externalId: 'target_ext' } })).toBe(true)
    })

    it('ignores calls to other workflows and other connectors', () => {
        const other = callerWith({ connectorName: '@fema-ipaas/connector-subflows', targetId: 'someone_else' })
        const wrongConnector = callerWith({ connectorName: '@fema-ipaas/connector-feishu', targetId: 'target_ext' })
        expect(workflowReferenceUtils.callsSubflow({ candidate: other, target: { externalId: 'target_ext' } })).toBe(false)
        expect(workflowReferenceUtils.callsSubflow({ candidate: wrongConnector, target: { externalId: 'target_ext' } })).toBe(false)
    })

    it('builds no message when nothing references the workflow', () => {
        expect(workflowReferenceUtils.blockingMessage({ callerNames: [], mcpServiceNames: [] })).toBeNull()
    })

    it('names both callers and MCP services in the blocking message', () => {
        const message = workflowReferenceUtils.blockingMessage({ callerNames: ['Onboarding'], mcpServiceNames: ['HR tools'] })
        expect(message).toContain('Onboarding')
        expect(message).toContain('HR tools')
    })
})
