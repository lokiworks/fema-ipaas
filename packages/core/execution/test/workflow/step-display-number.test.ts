import {
    ConnectorAction,
    LoopOnItemsAction,
    stepDisplayNumberUtil,
    StepLocationRelativeToParent,
    WorkflowAction,
    WorkflowActionType,
    workflowOperations,
    WorkflowOperationType,
    workflowStructureUtil,
    WorkflowTrigger,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
} from '../../src'

function connectorAction({ name, connector, displayNumber, nextAction }: { name: string, connector: string, displayNumber?: string, nextAction?: WorkflowAction }): ConnectorAction {
    return {
        name,
        type: WorkflowActionType.CONNECTOR,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            connectorName: connector,
            connectorVersion: '0.0.1',
            actionName: 'send',
            input: {},
            propertySettings: {},
            errorHandlingOptions: undefined,
            ...(displayNumber ? { displayNumber } : {}),
        },
        nextAction,
    }
}

function loopAction({ name, firstLoopAction, nextAction }: { name: string, firstLoopAction?: WorkflowAction, nextAction?: WorkflowAction }): LoopOnItemsAction {
    return {
        name,
        type: WorkflowActionType.LOOP_ON_ITEMS,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: { items: '{{trigger.items}}' },
        firstLoopAction,
        nextAction,
    }
}

function trigger(nextAction?: WorkflowAction): WorkflowTrigger {
    return {
        name: 'trigger',
        type: WorkflowTriggerType.CONNECTOR,
        valid: true,
        displayName: 'Webhook',
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            connectorName: '@fema-ipaas/connector-webhook',
            connectorVersion: '0.0.1',
            triggerName: 'catch',
            input: {},
            propertySettings: {},
        },
        nextAction,
    }
}

function version(root: WorkflowTrigger): WorkflowVersion {
    return {
        id: 'v1',
        created: '2026-05-02T00:00:00.000Z',
        updated: '2026-05-02T00:00:00.000Z',
        workflowId: 'w1',
        updatedBy: null,
        displayName: 'Test',
        trigger: root,
        valid: true,
        agentIds: [],
        connectionIds: [],
        state: WorkflowVersionState.DRAFT,
        notes: [],
        schemaVersion: null,
        backupFiles: null,
    }
}

describe('stepDisplayNumberUtil', () => {
    it('derives prefixes from the connector and the node kind', () => {
        const root = trigger(loopAction({ name: 'step_1', firstLoopAction: connectorAction({ name: 'step_2', connector: '@fema-ipaas/connector-feishu' }) }))
        expect(stepDisplayNumberUtil.computeNumbers(root)).toEqual({
            trigger: 'webhook-trigger-1',
            step_1: 'loop-1',
            step_2: 'feishu-1',
        })
    })

    it('numbers steps of the same prefix in tree order', () => {
        const root = trigger(connectorAction({
            name: 'step_1',
            connector: '@fema-ipaas/connector-feishu',
            nextAction: connectorAction({ name: 'step_2', connector: '@fema-ipaas/connector-feishu' }),
        }))
        expect(stepDisplayNumberUtil.computeNumbers(root)['step_2']).toBe('feishu-2')
    })

    it('keeps stored numbers and continues after the highest one', () => {
        const root = trigger(connectorAction({
            name: 'step_1',
            connector: '@fema-ipaas/connector-feishu',
            displayNumber: 'feishu-7',
            nextAction: connectorAction({ name: 'step_2', connector: '@fema-ipaas/connector-feishu' }),
        }))
        expect(stepDisplayNumberUtil.computeNumbers(root)).toMatchObject({ step_1: 'feishu-7', step_2: 'feishu-8' })
    })

    it('renumbers duplicates and numbers whose prefix no longer matches', () => {
        const root = trigger(connectorAction({
            name: 'step_1',
            connector: '@fema-ipaas/connector-feishu',
            displayNumber: 'feishu-1',
            nextAction: connectorAction({
                name: 'step_2',
                connector: '@fema-ipaas/connector-feishu',
                displayNumber: 'feishu-1',
                nextAction: connectorAction({ name: 'step_3', connector: '@fema-ipaas/connector-slack', displayNumber: 'feishu-9' }),
            }),
        }))
        expect(stepDisplayNumberUtil.computeNumbers(root)).toMatchObject({ step_1: 'feishu-1', step_2: 'feishu-2', step_3: 'slack-1' })
    })

    it('is deterministic for workflows saved without numbers', () => {
        const root = trigger(connectorAction({ name: 'step_1', connector: '@fema-ipaas/connector-feishu' }))
        expect(stepDisplayNumberUtil.computeNumbers(root)).toEqual(stepDisplayNumberUtil.computeNumbers(root))
    })

    it('keeps a number when the step moves', () => {
        const initial = workflowOperations.apply(version(trigger(connectorAction({
            name: 'step_1',
            connector: '@fema-ipaas/connector-feishu',
            nextAction: connectorAction({ name: 'step_2', connector: '@fema-ipaas/connector-feishu' }),
        }))), {
            type: WorkflowOperationType.UPDATE_TRIGGER,
            request: { ...trigger(), nextAction: undefined },
        })
        const before = workflowStructureUtil.getStepOrThrow('step_2', initial.trigger).settings.displayNumber
        const moved = workflowOperations.apply(initial, {
            type: WorkflowOperationType.MOVE_ACTION,
            request: { name: 'step_2', newParentStep: 'trigger', stepLocationRelativeToNewParent: StepLocationRelativeToParent.AFTER },
        })
        expect(before).toBe('feishu-2')
        expect(workflowStructureUtil.getStepOrThrow('step_2', moved.trigger).settings.displayNumber).toBe('feishu-2')
        expect(workflowStructureUtil.getStepOrThrow('step_1', moved.trigger).settings.displayNumber).toBe('feishu-1')
    })

    it('assigns the next free number to an added step and keeps it on update', () => {
        const base = version(trigger(connectorAction({ name: 'step_1', connector: '@fema-ipaas/connector-feishu' })))
        const added = workflowOperations.apply(base, {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                action: connectorAction({ name: 'step_2', connector: '@fema-ipaas/connector-feishu' }),
            },
        })
        const step = workflowStructureUtil.getStepOrThrow('step_2', added.trigger)
        expect(step.settings.displayNumber).toBe('feishu-2')
        const updated = workflowOperations.apply(added, {
            type: WorkflowOperationType.UPDATE_ACTION,
            request: { ...connectorAction({ name: 'step_2', connector: '@fema-ipaas/connector-feishu' }), displayName: 'Renamed' },
        })
        expect(workflowStructureUtil.getStepOrThrow('step_2', updated.trigger).settings.displayNumber).toBe('feishu-2')
    })

    it('gives pasted copies new numbers', () => {
        const base = workflowOperations.apply(version(trigger(connectorAction({ name: 'step_1', connector: '@fema-ipaas/connector-feishu' }))), {
            type: WorkflowOperationType.DUPLICATE_ACTION,
            request: { stepName: 'step_1' },
        })
        const numbers = workflowStructureUtil.getAllSteps(base.trigger).map((step) => step.settings.displayNumber)
        expect(numbers).toEqual(['webhook-trigger-1', 'feishu-1', 'feishu-2'])
    })
})
