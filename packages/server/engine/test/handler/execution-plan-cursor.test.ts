import { WorkflowActionType } from '@fema-ipaas/shared'
import { executionPlanCursor } from '../../src/lib/handler/execution-plan-cursor'
import { buildCodeAction, buildParallelAction } from './test-helper'

describe('executionPlanCursor', () => {
    it('walks a chain by node id without reading nextAction', () => {
        const chain = buildCodeAction({
            name: 'first',
            input: {},
            nextAction: buildCodeAction({ name: 'second', input: {} }),
        })
        const plan = executionPlanCursor.forSubtree(chain)

        expect(executionPlanCursor.stepAt({ plan, nodeId: 'first' })?.name).toBe('first')
        expect(executionPlanCursor.nextOf({ plan, nodeId: 'first' })).toBe('second')
        expect(executionPlanCursor.nextOf({ plan, nodeId: 'second' })).toBeNull()
    })

    it('returns null for a node that is not in the plan', () => {
        const plan = executionPlanCursor.forSubtree(buildCodeAction({ name: 'only', input: {} }))

        expect(executionPlanCursor.stepAt({ plan, nodeId: 'missing' })).toBeNull()
        expect(executionPlanCursor.nextOf({ plan, nodeId: 'missing' })).toBeNull()
    })

    it('does not hand back the synthetic entry as a step to execute', () => {
        const plan = executionPlanCursor.forSubtree(buildCodeAction({ name: 'only', input: {} }))
        const entry = executionPlanCursor.stepAt({ plan, nodeId: plan.entry })

        expect(entry).toBeNull()
        expect(plan.nodes[plan.entry].kind).toBe('TRIGGER')
    })

    it('includes nested branch steps as their own nodes', () => {
        const plan = executionPlanCursor.forSubtree(buildParallelAction({
            name: 'fan_out',
            branches: ['L', 'R'],
            children: [buildCodeAction({ name: 'left', input: {} }), null],
            nextAction: buildCodeAction({ name: 'join', input: {} }),
        }))

        expect(executionPlanCursor.stepAt({ plan, nodeId: 'left' })?.type).toBe(WorkflowActionType.CODE)
        expect(plan.nodes.fan_out.children).toEqual({ branch_0: ['left'], branch_1: [] })
        expect(executionPlanCursor.nextOf({ plan, nodeId: 'fan_out' })).toBe('join')
    })
})
