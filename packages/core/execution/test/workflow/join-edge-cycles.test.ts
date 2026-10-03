import {
    CodeAction,
    WorkflowAction,
    WorkflowActionType,
    workflowCompiler,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
} from '../../src'

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

function chain(joinEdges: { from: string, to: string }[]): WorkflowVersion {
    return {
        id: 'workflow-id',
        created: '2026-05-02T00:00:00.000Z',
        updated: '2026-05-02T00:00:00.000Z',
        workflowId: 'workflow-id',
        displayName: 'Chain',
        updatedBy: '',
        agentIds: [],
        notes: [],
        valid: true,
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        graph: { joinEdges },
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.EMPTY,
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: '2026-05-02T00:00:00.000Z',
            settings: {},
            nextAction: codeAction({
                name: 'step_1',
                nextAction: codeAction({ name: 'step_2', nextAction: codeAction({ name: 'step_3' }) }),
            }),
        },
    }
}

describe('workflowCompiler join edge cycles', () => {
    it('accepts waiting for a step that already runs earlier in the same chain', () => {
        expect(workflowCompiler.wouldCreateCycle({ workflowVersion: chain([]), edge: { from: 'step_1', to: 'step_3' } })).toBe(false)
    })

    it('rejects waiting for a step that comes after the waiting step', () => {
        expect(workflowCompiler.wouldCreateCycle({ workflowVersion: chain([]), edge: { from: 'step_3', to: 'step_1' } })).toBe(true)
    })

    it('rejects a step waiting for itself', () => {
        expect(workflowCompiler.wouldCreateCycle({ workflowVersion: chain([]), edge: { from: 'step_2', to: 'step_2' } })).toBe(true)
    })

    it('finds every edge that is part of a cycle saved before', () => {
        const version = chain([{ from: 'step_3', to: 'step_1' }, { from: 'step_1', to: 'step_3' }])
        expect(workflowCompiler.cyclicJoinEdges(version)).toEqual(version.graph?.joinEdges)
    })

    it('reports nothing when the saved edges only go forward', () => {
        expect(workflowCompiler.cyclicJoinEdges(chain([{ from: 'step_1', to: 'step_3' }]))).toEqual([])
    })

    it('ignores edges that point at steps which no longer exist', () => {
        expect(workflowCompiler.cyclicJoinEdges(chain([{ from: 'gone', to: 'step_1' }]))).toEqual([])
    })
})
