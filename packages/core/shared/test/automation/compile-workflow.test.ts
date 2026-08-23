import { WorkflowActionType, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, workflowCompiler } from '../../src/index'

function version(trigger: WorkflowVersion['trigger']): WorkflowVersion {
    return {
        id: 'v1',
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-01T00:00:00Z',
        workflowId: 'f1',
        displayName: 'Test',
        trigger,
        updatedBy: null,
        valid: true,
        schemaVersion: '23',
        agentIds: [],
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        backupFiles: null,
        notes: [],
        graph: null,
    }
}

const baseAction = {
    valid: true,
    skip: false,
    lastUpdatedDate: '2026-01-01T00:00:00Z',
}

function codeAction(name: string, nextAction?: WorkflowVersion['trigger']['nextAction']) {
    return {
        ...baseAction,
        name,
        displayName: name,
        type: WorkflowActionType.CODE as const,
        settings: { sourceCode: { code: '', packageJson: '{}' }, input: {} },
        nextAction,
    }
}

function emptyTrigger(nextAction?: WorkflowVersion['trigger']['nextAction']): WorkflowVersion['trigger'] {
    return {
        ...baseAction,
        name: 'trigger',
        displayName: 'Trigger',
        type: WorkflowTriggerType.EMPTY,
        settings: {},
        nextAction,
    }
}

describe('workflowCompiler', () => {
    it('uses the trigger as the entry node', () => {
        const plan = workflowCompiler.compile(version(emptyTrigger()))
        expect(plan.entry).toBe('trigger')
        expect(plan.nodes.trigger.kind).toBe('TRIGGER')
    })

    it('turns a linear chain into next edges', () => {
        const plan = workflowCompiler.compile(version(emptyTrigger(codeAction('a', codeAction('b')))))
        expect(plan.nodes.trigger.next).toEqual(['a'])
        expect(plan.nodes.a.next).toEqual(['b'])
        expect(plan.nodes.b.next).toEqual([])
    })

    it('records every step as a node, including nested ones', () => {
        const plan = workflowCompiler.compile(version(emptyTrigger({
            ...baseAction,
            name: 'fan_out',
            displayName: 'Parallel',
            type: WorkflowActionType.PARALLEL,
            settings: { branches: [{ branchName: 'L' }, { branchName: 'R' }] },
            children: [codeAction('left'), codeAction('right')],
            nextAction: codeAction('join'),
        })))
        expect(Object.keys(plan.nodes).sort()).toEqual(['fan_out', 'join', 'left', 'right', 'trigger'])
    })

    it('gives a parallel one child slot per branch', () => {
        const plan = workflowCompiler.compile(version(emptyTrigger({
            ...baseAction,
            name: 'fan_out',
            displayName: 'Parallel',
            type: WorkflowActionType.PARALLEL,
            settings: { branches: [{ branchName: 'L' }, { branchName: 'R' }] },
            children: [codeAction('left'), null],
        })))
        expect(plan.nodes.fan_out.children).toEqual({ branch_0: ['left'], branch_1: [] })
    })

    it('gives a loop a single loop slot', () => {
        const plan = workflowCompiler.compile(version(emptyTrigger({
            ...baseAction,
            name: 'each',
            displayName: 'Loop',
            type: WorkflowActionType.LOOP_ON_ITEMS,
            settings: { items: '{{ trigger.items }}' },
            firstLoopAction: codeAction('inner'),
        })))
        expect(plan.nodes.each.children).toEqual({ loop: ['inner'] })
    })

    it('records who each node depends on', () => {
        const plan = workflowCompiler.compile(version(emptyTrigger({
            ...baseAction,
            name: 'fan_out',
            displayName: 'Parallel',
            type: WorkflowActionType.PARALLEL,
            settings: { branches: [{ branchName: 'L' }, { branchName: 'R' }] },
            children: [codeAction('left'), codeAction('right')],
            nextAction: codeAction('join'),
        })))
        expect(plan.dependencies.fan_out).toEqual(['trigger'])
        expect(plan.dependencies.left).toEqual(['fan_out'])
        expect(plan.dependencies.right).toEqual(['fan_out'])
        expect(plan.dependencies.join).toEqual(['fan_out'])
        expect(plan.dependencies.trigger).toEqual([])
    })

    it('does not revisit a step that appears twice', () => {
        const shared = codeAction('shared')
        const plan = workflowCompiler.compile(version(emptyTrigger({
            ...baseAction,
            name: 'fan_out',
            displayName: 'Parallel',
            type: WorkflowActionType.PARALLEL,
            settings: { branches: [{ branchName: 'L' }, { branchName: 'R' }] },
            children: [shared, shared],
        })))
        expect(Object.keys(plan.nodes).sort()).toEqual(['fan_out', 'shared', 'trigger'])
    })

    it('merges join edges into dependencies without touching next edges', () => {
        const base = version(emptyTrigger(codeAction('a', codeAction('b'))))
        const plan = workflowCompiler.compile({ ...base, graph: { joinEdges: [{ from: 'trigger', to: 'b' }] } })

        expect(plan.dependencies.b).toContain('a')
        expect(plan.dependencies.b).toContain('trigger')
        expect(plan.nodes.a.next).toEqual(['b'])
    })

    it('drops a join edge whose endpoint is not in the plan', () => {
        const base = version(emptyTrigger(codeAction('a')))
        const plan = workflowCompiler.compile({ ...base, graph: { joinEdges: [{ from: 'ghost', to: 'a' }] } })

        expect(plan.dependencies.a).toEqual(['trigger'])
    })

    it('does not duplicate a join edge that repeats an existing dependency', () => {
        const base = version(emptyTrigger(codeAction('a')))
        const plan = workflowCompiler.compile({ ...base, graph: { joinEdges: [{ from: 'trigger', to: 'a' }] } })

        expect(plan.dependencies.a).toEqual(['trigger'])
    })
})
