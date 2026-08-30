import {
    LoopOnItemsAction,
    RouterAction,
    RouterExecutionType,
    WORKFLOW_CANVAS_STEP_HEIGHT,
    WORKFLOW_CANVAS_STEP_WIDTH,
    workflowCanvasUtils,
    WorkflowActionType,
    WorkflowTrigger,
    WorkflowTriggerType,
} from '../../src'

describe('canvas nesting layout', () => {
    it('keeps a router\'s branch children clear of each other', () => {
        const positions = workflowCanvasUtils.computeStepPositions(triggerWith(router()))
        expectNoOverlaps(positions)
    })

    it('keeps a loop\'s child clear of the steps around it', () => {
        const positions = workflowCanvasUtils.computeStepPositions(triggerWith(loop()))
        expectNoOverlaps(positions)
    })

    it('keeps a loop nested inside a router branch clear of everything', () => {
        const nested = router()
        nested.children[0] = loop()
        const positions = workflowCanvasUtils.computeStepPositions(triggerWith(nested))
        expectNoOverlaps(positions)
    })
})

function expectNoOverlaps(positions: Map<string, { x: number, y: number }>): void {
    const boxes = [...positions.entries()].map(([name, position]) => ({ name, ...position }))
    expect(boxes.length).toBeGreaterThan(1)
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]
            const b = boxes[j]
            const overlaps =
                Math.abs(a.x - b.x) < WORKFLOW_CANVAS_STEP_WIDTH &&
                Math.abs(a.y - b.y) < WORKFLOW_CANVAS_STEP_HEIGHT
            expect(overlaps, `${a.name} overlaps ${b.name}`).toBe(false)
        }
    }
}

function code(name: string): LoopOnItemsAction['firstLoopAction'] {
    return {
        name,
        valid: true,
        displayName: name,
        type: WorkflowActionType.CODE,
        settings: { sourceCode: { code: '', packageJson: '{}' }, input: {} },
    } as LoopOnItemsAction['firstLoopAction']
}

function loop(): LoopOnItemsAction {
    return {
        name: 'loop',
        valid: true,
        displayName: 'loop',
        type: WorkflowActionType.LOOP_ON_ITEMS,
        settings: { items: '', inputUiInfo: {} },
        firstLoopAction: code('inside_loop'),
        nextAction: code('after_loop'),
    } as LoopOnItemsAction
}

function router(): RouterAction {
    return {
        name: 'router',
        valid: true,
        displayName: 'router',
        type: WorkflowActionType.ROUTER,
        settings: {
            branches: [
                { branchName: 'a', branchType: 'CONDITION', conditions: [] },
                { branchName: 'b', branchType: 'FALLBACK' },
            ],
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            inputUiInfo: {},
        },
        children: [code('branch_a'), code('branch_b')],
        nextAction: code('after_router'),
    } as unknown as RouterAction
}

function triggerWith(firstAction: unknown): WorkflowTrigger {
    return {
        name: 'trigger',
        valid: true,
        displayName: 'trigger',
        type: WorkflowTriggerType.EMPTY,
        settings: {},
        nextAction: firstAction,
    } as WorkflowTrigger
}
