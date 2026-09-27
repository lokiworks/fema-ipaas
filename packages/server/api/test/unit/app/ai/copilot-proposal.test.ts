import {
    CopilotChangeKind,
    CopilotProposal,
    WorkflowActionType,
    workflowOperations,
    WorkflowOperationType,
    workflowStructureUtil,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
} from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { CatalogConnector, copilotProposal } from '../../../../src/app/ai/copilot-proposal'

const DATE = '2026-05-02T00:00:00.000Z'

function version(): WorkflowVersion {
    return {
        id: 'v1',
        created: DATE,
        updated: DATE,
        workflowId: 'w1',
        updatedBy: null,
        displayName: 'Flow',
        valid: true,
        agentIds: [],
        connectionIds: [],
        state: WorkflowVersionState.DRAFT,
        notes: [],
        schemaVersion: null,
        backupFiles: null,
        graph: null,
        publishNote: null,
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.CONNECTOR,
            valid: true,
            displayName: 'Webhook',
            lastUpdatedDate: DATE,
            settings: {
                connectorName: '@fema-ipaas/connector-webhook',
                connectorVersion: '0.0.1',
                triggerName: 'catch',
                input: {},
                propertySettings: {},
            },
            nextAction: {
                name: 'step_1',
                type: WorkflowActionType.CONNECTOR,
                valid: true,
                displayName: 'Send message',
                lastUpdatedDate: DATE,
                settings: {
                    connectorName: '@fema-ipaas/connector-feishu',
                    connectorVersion: '0.0.1',
                    actionName: 'send_message',
                    input: { text: 'hi' },
                    propertySettings: {},
                    errorHandlingOptions: undefined,
                },
            },
        },
    }
}

const catalog: CatalogConnector[] = [
    {
        name: '@fema-ipaas/connector-feishu',
        displayName: '飞书',
        auth: { displayName: 'Token' },
        suggestedActions: [
            {
                name: 'send_message',
                displayName: '发送消息',
                props: {
                    text: { displayName: '内容' },
                    chat: { displayName: '群' },
                },
            },
        ],
    },
]

function build(changes: unknown[]): CopilotProposal {
    const draft = copilotProposal.parseDraft(JSON.stringify({ summary: '改好了', changes }))
    if (draft === null) {
        throw new Error('draft did not parse')
    }
    return copilotProposal.build({
        draft,
        version: version(),
        catalog,
        connectorVersions: new Map([['@fema-ipaas/connector-feishu', '0.3.0']]),
        connections: [{ externalId: 'feishu-conn', connectorName: '@fema-ipaas/connector-feishu' }],
    })
}

describe('copilotProposal', () => {
    it('turns an add request into an ADD_ACTION marked for review', () => {
        const proposal = build([{ type: 'ADD_STEP', after: 'step_1', connector: '@fema-ipaas/connector-feishu', action: 'send_message', displayName: '通知', input: { text: '{{trigger.body}}', bogus: 1, auth: 'x' } }])
        expect(proposal.rejected).toEqual([])
        expect(proposal.changes).toEqual([{ kind: CopilotChangeKind.ADD_STEP, stepName: 'step_2', displayName: '通知', detail: '飞书 · 发送消息' }])
        const operation = proposal.operations[0]
        expect(operation.type).toBe(WorkflowOperationType.ADD_ACTION)
        const applied = workflowOperations.apply(version(), operation)
        const added = workflowStructureUtil.getStepOrThrow('step_2', applied.trigger)
        expect(added.settings.pendingReview).toBe(true)
        expect(added.settings.input).toEqual({ text: '{{trigger.body}}', auth: '{{connections[\'feishu-conn\']}}' })
    })

    it('merges input updates, renames and deletes existing steps', () => {
        const proposal = build([
            { type: 'UPDATE_INPUT', step: 'step_1', input: { chat: 'ops' } },
            { type: 'RENAME_STEP', step: 'step_1', displayName: '通知值班群' },
        ])
        const applied = proposal.operations.reduce((current, operation) => workflowOperations.apply(current, operation), version())
        const step = workflowStructureUtil.getStepOrThrow('step_1', applied.trigger)
        expect(step.displayName).toBe('通知值班群')
        expect(step.settings.input).toEqual({ text: 'hi', chat: 'ops' })
        expect(step.settings.pendingReview).toBe(true)
        expect(proposal.affectedStepNames).toEqual(['step_1'])
    })

    it('rejects changes it cannot validate and keeps the rest', () => {
        const proposal = build([
            { type: 'DELETE_STEP', step: 'trigger' },
            { type: 'ADD_STEP', after: 'step_9', connector: '@fema-ipaas/connector-feishu', action: 'send_message' },
            { type: 'ADD_STEP', after: 'step_1', connector: '@fema-ipaas/connector-gone', action: 'x' },
            { type: 'UPDATE_INPUT', step: 'step_1', input: { unknown: 1 } },
            { type: 'DELETE_STEP', step: 'step_1' },
        ])
        expect(proposal.rejected).toHaveLength(4)
        expect(proposal.changes.map((change) => change.kind)).toEqual([CopilotChangeKind.DELETE_STEP])
        expect(proposal.operations).toEqual([{ type: WorkflowOperationType.DELETE_ACTION, request: { names: ['step_1'] } }])
    })

    it('returns null for answers that are not JSON', () => {
        expect(copilotProposal.parseDraft('抱歉，我做不到')).toBeNull()
    })
})
