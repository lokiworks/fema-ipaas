import {
    CodeAction,
    ParallelAction,
    StepLocationRelativeToParent,
    WorkflowAction,
    WorkflowActionType,
    workflowOperations,
    WorkflowOperationType,
    workflowStructureUtil,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
} from '../../src'
import { _getImportOperations } from '../../src/lib/workflows/operations/import-workflow'

function codeAction({ name, nextAction }: { name: string, nextAction?: WorkflowAction }): CodeAction {
    return {
        name,
        type: WorkflowActionType.CODE,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            sourceCode: { code: '', packageJson: '{}' },
            input: {},
            errorHandlingOptions: {},
        },
        nextAction,
    }
}

function parallelAction({ name, branchNames, children, nextAction }: {
    name: string
    branchNames: string[]
    children: (WorkflowAction | null)[]
    nextAction?: WorkflowAction
}): ParallelAction {
    return {
        name,
        type: WorkflowActionType.PARALLEL,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: { branches: branchNames.map((branchName) => ({ branchName })) },
        children,
        nextAction,
    }
}

function workflowWith(head: WorkflowAction): WorkflowVersion {
    return {
        id: 'workflow-id',
        created: '2026-05-02T00:00:00.000Z',
        updated: '2026-05-02T00:00:00.000Z',
        workflowId: 'workflow-id',
        displayName: 'Parallel workflow',
        updatedBy: '',
        agentIds: [],
        notes: [],
        valid: true,
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.EMPTY,
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: '2026-05-02T00:00:00.000Z',
            settings: {} as never,
            nextAction: head,
        },
    }
}

function parallelOf(version: WorkflowVersion): ParallelAction {
    return workflowStructureUtil.getActionOrThrow('step_1', version.trigger) as ParallelAction
}

describe('Parallel step operations', () => {
    it('visits every step inside parallel branches', () => {
        const version = workflowWith(parallelAction({
            name: 'step_1',
            branchNames: ['A', 'B'],
            children: [codeAction({ name: 'step_2', nextAction: codeAction({ name: 'step_3' }) }), codeAction({ name: 'step_4' })],
            nextAction: codeAction({ name: 'step_5' }),
        }))
        const names = workflowStructureUtil.getAllSteps(version.trigger).map((step) => step.name)
        expect(names).toEqual(['trigger', 'step_1', 'step_2', 'step_3', 'step_4', 'step_5'])
    })

    it('adds a step inside the chosen branch instead of after the parallel step', () => {
        const version = workflowWith(parallelAction({ name: 'step_1', branchNames: ['A', 'B'], children: [null, null] }))
        const after = workflowOperations.apply(version, {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH,
                branchIndex: 1,
                action: codeAction({ name: 'step_2' }),
            },
        })
        const parallel = parallelOf(after)
        expect(parallel.children.map((child) => child?.name ?? null)).toEqual([null, 'step_2'])
        expect(parallel.nextAction).toBeUndefined()
    })

    it('still adds a step after the parallel step', () => {
        const version = workflowWith(parallelAction({ name: 'step_1', branchNames: ['A', 'B'], children: [null, null] }))
        const after = workflowOperations.apply(version, {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                action: codeAction({ name: 'step_2' }),
            },
        })
        expect(parallelOf(after).nextAction?.name).toBe('step_2')
    })

    it('keeps branch steps when the workflow is rebuilt from import operations', () => {
        const parallel = parallelAction({
            name: 'step_1',
            branchNames: ['A', 'B'],
            children: [codeAction({ name: 'step_2' }), codeAction({ name: 'step_3', nextAction: codeAction({ name: 'step_4' }) })],
        })
        const operations = _getImportOperations(workflowWith(parallel).trigger)
        const rebuilt = operations.reduce(
            (version, operation) => workflowOperations.apply(version, operation),
            workflowWith(parallelAction({ name: 'step_1', branchNames: ['A', 'B'], children: [null, null] })),
        )
        const rebuiltParallel = parallelOf(rebuilt)
        expect(rebuiltParallel.children.map((child) => child?.name ?? null)).toEqual(['step_2', 'step_3'])
        expect(rebuiltParallel.children[1]?.nextAction?.name).toBe('step_4')
    })

    it('adds a branch with an empty slot at the requested index', () => {
        const version = workflowWith(parallelAction({
            name: 'step_1',
            branchNames: ['A', 'B'],
            children: [codeAction({ name: 'step_2' }), codeAction({ name: 'step_3' })],
        }))
        const after = workflowOperations.apply(version, {
            type: WorkflowOperationType.ADD_BRANCH,
            request: { stepName: 'step_1', branchIndex: 1, branchName: 'Middle' },
        })
        const parallel = parallelOf(after)
        expect(parallel.settings.branches.map((branch) => branch.branchName)).toEqual(['A', 'Middle', 'B'])
        expect(parallel.children.map((child) => child?.name ?? null)).toEqual(['step_2', null, 'step_3'])
    })

    it('deletes the chosen branch together with its steps', () => {
        const version = workflowWith(parallelAction({
            name: 'step_1',
            branchNames: ['A', 'B', 'C'],
            children: [codeAction({ name: 'step_2' }), codeAction({ name: 'step_3' }), codeAction({ name: 'step_4' })],
        }))
        const after = workflowOperations.apply(version, {
            type: WorkflowOperationType.DELETE_BRANCH,
            request: { stepName: 'step_1', branchIndex: 1 },
        })
        const parallel = parallelOf(after)
        expect(parallel.settings.branches.map((branch) => branch.branchName)).toEqual(['A', 'C'])
        expect(parallel.children.map((child) => child?.name ?? null)).toEqual(['step_2', 'step_4'])
    })

    it('keeps children aligned when the settings gain a branch', () => {
        const version = workflowWith(parallelAction({
            name: 'step_1',
            branchNames: ['A', 'B'],
            children: [codeAction({ name: 'step_2' }), null],
        }))
        const parallel = parallelOf(version)
        const after = workflowOperations.apply(version, {
            type: WorkflowOperationType.UPDATE_ACTION,
            request: {
                name: parallel.name,
                type: WorkflowActionType.PARALLEL,
                displayName: parallel.displayName,
                valid: true,
                settings: { branches: [...parallel.settings.branches, { branchName: 'C' }] },
            },
        })
        expect(parallelOf(after).children.map((child) => child?.name ?? null)).toEqual(['step_2', null, null])
    })

    it('deletes a step inside a parallel branch and promotes its next step', () => {
        const version = workflowWith(parallelAction({
            name: 'step_1',
            branchNames: ['A', 'B'],
            children: [codeAction({ name: 'step_2', nextAction: codeAction({ name: 'step_3' }) }), null],
        }))
        const after = workflowOperations.apply(version, {
            type: WorkflowOperationType.DELETE_ACTION,
            request: { names: ['step_2'] },
        })
        expect(parallelOf(after).children.map((child) => child?.name ?? null)).toEqual(['step_3', null])
    })
})
