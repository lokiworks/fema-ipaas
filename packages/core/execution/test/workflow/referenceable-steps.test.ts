import {
    BranchExecutionType,
    CodeAction,
    LoopOnItemsAction,
    RouterAction,
    RouterExecutionType,
    WorkflowAction,
    WorkflowActionType,
    workflowStructureUtil,
    WorkflowTrigger,
    WorkflowTriggerType,
} from '../../src'

function code({ name, nextAction }: { name: string, nextAction?: WorkflowAction }): CodeAction {
    return {
        name,
        type: WorkflowActionType.CODE,
        valid: true,
        displayName: name,
        settings: { sourceCode: { code: '', packageJson: '{}' }, input: {} },
        nextAction,
    }
}

function router({ name, children, nextAction }: { name: string, children: (WorkflowAction | null)[], nextAction?: WorkflowAction }): RouterAction {
    return {
        name,
        type: WorkflowActionType.ROUTER,
        valid: true,
        displayName: name,
        settings: {
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            branches: [
                { branchName: '分支 1', branchType: BranchExecutionType.CONDITION, conditions: [[]] },
                { branchName: '否则', branchType: BranchExecutionType.FALLBACK },
            ],
        },
        children,
        nextAction,
    }
}

function loop({ name, firstLoopAction, nextAction }: { name: string, firstLoopAction?: WorkflowAction, nextAction?: WorkflowAction }): LoopOnItemsAction {
    return {
        name,
        type: WorkflowActionType.LOOP_ON_ITEMS,
        valid: true,
        displayName: name,
        settings: { items: '{{list.output}}' },
        firstLoopAction,
        nextAction,
    }
}

function triggerWith(nextAction: WorkflowAction): WorkflowTrigger {
    return {
        name: 'trigger',
        type: WorkflowTriggerType.EMPTY,
        valid: true,
        displayName: 'trigger',
        settings: {},
        nextAction,
    }
}

describe('workflowStructureUtil.findReferenceableSteps', () => {
    const flow = triggerWith(router({
        name: 'branch',
        children: [
            code({ name: 'list', nextAction: loop({ name: 'inner_loop', firstLoopAction: code({ name: 'inside_inner_loop' }) }) }),
            router({ name: 'nested', children: [code({ name: 'deep' }), null] }),
        ],
        nextAction: loop({ name: 'after_join', firstLoopAction: code({ name: 'in_loop' }) }),
    }))

    it('lets a step after the join reference steps inside each branch and says which branch they need', () => {
        const steps = workflowStructureUtil.findReferenceableSteps(flow, 'after_join')

        expect(steps.map((step) => step.name)).toEqual(['trigger', 'branch', 'list', 'inner_loop', 'nested', 'deep'])
        expect(steps.find((step) => step.name === 'trigger')?.onlyWhen).toEqual([])
        expect(steps.find((step) => step.name === 'list')?.onlyWhen).toEqual([
            { stepName: 'branch', kind: 'ROUTER_BRANCH', branchName: '分支 1' },
        ])
        expect(steps.find((step) => step.name === 'deep')?.onlyWhen).toEqual([
            { stepName: 'branch', kind: 'ROUTER_BRANCH', branchName: '否则' },
            { stepName: 'nested', kind: 'ROUTER_BRANCH', branchName: '分支 1' },
        ])
    })

    it('keeps loop bodies out because their output only exists per iteration', () => {
        const names = workflowStructureUtil.findReferenceableSteps(flow, 'in_loop').map((step) => step.name)

        expect(names).not.toContain('inside_inner_loop')
        expect(names).toContain('after_join')
    })

    it('does not expose a sibling branch to a step inside a branch', () => {
        const names = workflowStructureUtil.findReferenceableSteps(flow, 'deep').map((step) => step.name)

        expect(names).toEqual(['trigger', 'branch', 'nested'])
    })

    it('keeps findPathToStep limited to the steps that always run before the target', () => {
        const names = workflowStructureUtil.findPathToStep(flow, 'after_join').map((step) => step.name)

        expect(names).toEqual(['trigger', 'branch'])
    })
})
