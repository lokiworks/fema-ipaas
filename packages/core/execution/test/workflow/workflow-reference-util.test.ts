import {
    ConnectorAction,
    WorkflowActionType,
    workflowReferenceUtil,
} from '../../src'

function connectorAction({ name, auth }: { name: string, auth?: string }): ConnectorAction {
    return {
        name,
        type: WorkflowActionType.CONNECTOR,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            connectorName: '@fema-ipaas/connector-feishu',
            connectorVersion: '0.0.1',
            actionName: 'send',
            input: {
                text: 'Hello {{trigger.body.name}}',
                ...(auth ? { auth } : {}),
            },
            propertySettings: {},
            errorHandlingOptions: undefined,
        },
    }
}

describe('workflowReferenceUtil.parseExpression', () => {
    it('reads the root and a mixed dot / bracket path', () => {
        expect(workflowReferenceUtil.parseExpression("step_1['output'].items[0].name")).toEqual([
            { root: 'step_1', path: ['output', 'items', '0', 'name'] },
        ])
    })

    it('finds every reference in a compound expression', () => {
        const roots = workflowReferenceUtil.parseExpression('step_1.output.a + step_2.output.b').map((reference) => reference.root)
        expect(roots).toEqual(['step_1', 'step_2'])
    })

    it('ignores identifiers inside string literals', () => {
        const roots = workflowReferenceUtil.parseExpression("concat('step_9', step_1.x)").map((reference) => reference.root)
        expect(roots).toEqual(['concat', 'step_1'])
    })
})

describe('workflowReferenceUtil.extractFromStep', () => {
    it('walks nested settings and keeps the original token', () => {
        const references = workflowReferenceUtil.extractFromStep(connectorAction({ name: 'step_1' }))
        expect(references).toEqual([{ root: 'trigger', path: ['body', 'name'], token: '{{trigger.body.name}}' }])
    })

    it('reads loop variables through the output wrapper', () => {
        expect(workflowReferenceUtil.stepOutputPath(['output', 'item', 'id'])).toEqual(['item', 'id'])
        expect(workflowReferenceUtil.stepOutputPath(['item'])).toEqual(['item'])
    })
})

describe('workflowReferenceUtil.stripUnavailableConnections', () => {
    it('clears connections the target project cannot use and marks the step invalid', () => {
        const result = workflowReferenceUtil.stripUnavailableConnections({
            actions: [
                { ...connectorAction({ name: 'step_1', auth: "{{connections['kept']}}" }), nextAction: connectorAction({ name: 'step_2', auth: "{{connections['gone']}}" }) },
            ],
            isAvailable: (externalId) => externalId === 'kept',
        })
        expect(result.clearedStepNames).toEqual(['step_2'])
        const second = result.actions[0].nextAction
        expect(second?.settings.input).not.toHaveProperty('auth')
        expect(second?.valid).toBe(false)
        expect(result.actions[0].settings.input).toHaveProperty('auth')
    })
})
