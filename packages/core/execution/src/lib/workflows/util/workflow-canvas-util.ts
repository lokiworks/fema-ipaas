import { CodeAction, WorkflowAction, WorkflowActionType, ConnectorAction } from '../actions/action'
import { WorkflowTrigger } from '../triggers/trigger'
import { workflowStructureUtil } from './workflow-structure-util'

export const WORKFLOW_CANVAS_STEP_HEIGHT = 52
export const WORKFLOW_CANVAS_STEP_WIDTH = 176
export const WORKFLOW_CANVAS_VSPACE = 60
export const WORKFLOW_CANVAS_ARC = 15
export const WORKFLOW_CANVAS_LOOP_VOFFSET = WORKFLOW_CANVAS_VSPACE * 1.5 + 2 * WORKFLOW_CANVAS_ARC // 120
export const WORKFLOW_CANVAS_ROUTER_VOFFSET = WORKFLOW_CANVAS_LOOP_VOFFSET + 30 // 150
export const WORKFLOW_CANVAS_HSPACE = 80

type Step = WorkflowAction | WorkflowTrigger

type CanvasBoundingBox = { minX: number, maxX: number, height: number }

function getWorkflowBoundingBox(step: Step | WorkflowAction | null | undefined, forBranch = false): CanvasBoundingBox {
    if (!step) {
        return forBranch
            ? { minX: 0, maxX: WORKFLOW_CANVAS_STEP_WIDTH, height: WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_VSPACE }
            : { minX: 0, maxX: WORKFLOW_CANVAS_STEP_WIDTH, height: 0 }
    }

    let withChildMinX = 0
    let withChildMaxX = WORKFLOW_CANVAS_STEP_WIDTH
    let withChildHeight = WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_VSPACE

    if (step.type === WorkflowActionType.LOOP_ON_ITEMS) {
        const childBoundingBox = getWorkflowBoundingBox(step.firstLoopAction, true)
        const childWidth = childBoundingBox.maxX - childBoundingBox.minX
        const childLeft = -childBoundingBox.minX + WORKFLOW_CANVAS_STEP_WIDTH / 2
        const childRight = childBoundingBox.maxX - WORKFLOW_CANVAS_STEP_WIDTH / 2
        const deltaLeftX = -(childWidth + WORKFLOW_CANVAS_STEP_WIDTH + WORKFLOW_CANVAS_HSPACE - WORKFLOW_CANVAS_STEP_WIDTH / 2 - childRight) / 2 - WORKFLOW_CANVAS_STEP_WIDTH / 2
        const childOffsetX = deltaLeftX + WORKFLOW_CANVAS_STEP_WIDTH + WORKFLOW_CANVAS_HSPACE + childLeft
        const subgraphEndY = WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_LOOP_VOFFSET + childBoundingBox.height + WORKFLOW_CANVAS_ARC + WORKFLOW_CANVAS_VSPACE
        withChildMinX = Math.min(0, deltaLeftX, childOffsetX + childBoundingBox.minX)
        withChildMaxX = Math.max(WORKFLOW_CANVAS_STEP_WIDTH, deltaLeftX + WORKFLOW_CANVAS_STEP_WIDTH, childOffsetX + childBoundingBox.maxX)
        withChildHeight = Math.max(WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_VSPACE, subgraphEndY)
    }
    else if (step.type === WorkflowActionType.ROUTER) {
        const children = step.children
        if (children.length > 0) {
            const childBoundingBoxes = children.map(c => getWorkflowBoundingBox(c, true))
            const merged = mergeBranchedChildBoundingBoxes(childBoundingBoxes)
            withChildMinX = merged.minX
            withChildMaxX = merged.maxX
            withChildHeight = merged.height
        }
    }
    else if (hasContinueOnFailureBranches(step)) {
        const branches = getContinueOnFailureBranchPair(step)
        const childBoundingBoxes = branches.map(b => getWorkflowBoundingBox(b, true))
        const merged = mergeBranchedChildBoundingBoxes(childBoundingBoxes)
        withChildMinX = merged.minX
        withChildMaxX = merged.maxX
        withChildHeight = merged.height
    }

    const nextBoundingBox = getWorkflowBoundingBox(step.nextAction, false)
    return {
        minX: Math.min(withChildMinX, nextBoundingBox.minX),
        maxX: Math.max(withChildMaxX, nextBoundingBox.maxX),
        height: withChildHeight + nextBoundingBox.height,
    }
}

function buildPositions({ step, offsetX, offsetY, positions }: {
    step: Step | WorkflowAction | null | undefined
    offsetX: number
    offsetY: number
    positions: Map<string, { x: number, y: number }>
}): void {
    if (!step) return

    positions.set(step.name, { x: offsetX + WORKFLOW_CANVAS_STEP_WIDTH / 2, y: offsetY })

    if (step.type === WorkflowActionType.LOOP_ON_ITEMS) {
        const childBoundingBox = getWorkflowBoundingBox(step.firstLoopAction, true)
        const childLeft = -childBoundingBox.minX + WORKFLOW_CANVAS_STEP_WIDTH / 2
        const childRight = childBoundingBox.maxX - WORKFLOW_CANVAS_STEP_WIDTH / 2
        const childWidth = childBoundingBox.maxX - childBoundingBox.minX
        const deltaLeftX = -(childWidth + WORKFLOW_CANVAS_STEP_WIDTH + WORKFLOW_CANVAS_HSPACE - WORKFLOW_CANVAS_STEP_WIDTH / 2 - childRight) / 2 - WORKFLOW_CANVAS_STEP_WIDTH / 2
        const childOffsetX = offsetX + deltaLeftX + WORKFLOW_CANVAS_STEP_WIDTH + WORKFLOW_CANVAS_HSPACE + childLeft
        const childOffsetY = offsetY + WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_LOOP_VOFFSET
        if (step.firstLoopAction) {
            buildPositions({ step: step.firstLoopAction, offsetX: childOffsetX, offsetY: childOffsetY, positions })
        }
        const subgraphEndY = WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_LOOP_VOFFSET + childBoundingBox.height + WORKFLOW_CANVAS_ARC + WORKFLOW_CANVAS_VSPACE
        buildPositions({ step: step.nextAction, offsetX, offsetY: offsetY + subgraphEndY, positions })
    }
    else if (step.type === WorkflowActionType.ROUTER) {
        const subgraphEndY = positionBranchedChildren({ children: step.children, offsetX, offsetY, positions })
        buildPositions({ step: step.nextAction, offsetX, offsetY: offsetY + subgraphEndY, positions })
    }
    else if (hasContinueOnFailureBranches(step)) {
        const subgraphEndY = positionBranchedChildren({ children: getContinueOnFailureBranchPair(step), offsetX, offsetY, positions })
        buildPositions({ step: step.nextAction, offsetX, offsetY: offsetY + subgraphEndY, positions })
    }
    else {
        buildPositions({ step: step.nextAction, offsetX, offsetY: offsetY + WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_VSPACE, positions })
    }
}

function computeRouterChildOffsets(
    boundingBoxes: ReadonlyArray<{ width: number, left: number, right: number }>,
    branchGap: number = WORKFLOW_CANVAS_HSPACE,
): number[] {
    if (boundingBoxes.length === 0) return []
    const totalWidth = boundingBoxes.reduce((sum, b) => sum + b.width, 0)
        + branchGap * (boundingBoxes.length - 1)
    let deltaLeftX = -(totalWidth - boundingBoxes[0].left - boundingBoxes[boundingBoxes.length - 1].right) / 2
        - boundingBoxes[0].left
    return boundingBoxes.map(b => {
        const x = deltaLeftX + b.left
        deltaLeftX += b.width + branchGap
        return x
    })
}

function mergeBranchedChildBoundingBoxes(
    childBoundingBoxes: CanvasBoundingBox[],
): { minX: number, maxX: number, height: number } {
    const offsets = computeRouterChildOffsets(childBoundingBoxes.map(boundingBoxToLayoutDimensions))
    let mergedMinX = 0
    let mergedMaxX = WORKFLOW_CANVAS_STEP_WIDTH
    let maxChildHeight = 0
    for (let i = 0; i < childBoundingBoxes.length; i++) {
        const bbox = childBoundingBoxes[i]
        const x = offsets[i]
        mergedMinX = Math.min(mergedMinX, x + bbox.minX)
        mergedMaxX = Math.max(mergedMaxX, x + bbox.maxX)
        maxChildHeight = Math.max(maxChildHeight, bbox.height)
    }
    const subgraphEndY = WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_ROUTER_VOFFSET + maxChildHeight + WORKFLOW_CANVAS_ARC + WORKFLOW_CANVAS_VSPACE
    return {
        minX: mergedMinX,
        maxX: mergedMaxX,
        height: Math.max(WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_VSPACE, subgraphEndY),
    }
}

function boundingBoxToLayoutDimensions(b: CanvasBoundingBox): { width: number, left: number, right: number } {
    return {
        width: b.maxX - b.minX,
        left: -b.minX + WORKFLOW_CANVAS_STEP_WIDTH / 2,
        right: b.maxX - WORKFLOW_CANVAS_STEP_WIDTH / 2,
    }
}

function positionBranchedChildren({ children, offsetX, offsetY, positions }: {
    children: ReadonlyArray<WorkflowAction | null | undefined>
    offsetX: number
    offsetY: number
    positions: Map<string, { x: number, y: number }>
}): number {
    let maxChildHeight = 0
    if (children.length > 0) {
        const childBoundingBoxes = children.map(c => getWorkflowBoundingBox(c, true))
        const offsets = computeRouterChildOffsets(childBoundingBoxes.map(boundingBoxToLayoutDimensions))
        const childOffsetY = offsetY + WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_ROUTER_VOFFSET
        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            if (child) {
                buildPositions({ step: child, offsetX: offsetX + offsets[i], offsetY: childOffsetY, positions })
            }
            maxChildHeight = Math.max(maxChildHeight, childBoundingBoxes[i].height)
        }
    }
    return WORKFLOW_CANVAS_STEP_HEIGHT + WORKFLOW_CANVAS_ROUTER_VOFFSET + maxChildHeight + WORKFLOW_CANVAS_ARC + WORKFLOW_CANVAS_VSPACE
}

function hasContinueOnFailureBranches(step: Step | WorkflowAction): step is CodeAction | ConnectorAction {
    if (step.type !== WorkflowActionType.CODE && step.type !== WorkflowActionType.CONNECTOR) {
        return false
    }
    return step.settings.errorHandlingOptions?.continueOnFailure?.value ?? false
}

function getContinueOnFailureBranchPair(step: CodeAction | ConnectorAction): (WorkflowAction | undefined)[] {
    const branches = step.continueOnFailureBranches
    return [branches?.onSuccess, branches?.onFailure]
}

function getStepBranchRelativeTo(ancestor: Step | WorkflowAction, targetStepName: string): 'on-success' | 'on-failure' | null {
    if (!hasContinueOnFailureBranches(ancestor)) {
        return null
    }
    const [onSuccess, onFailure] = getContinueOnFailureBranchPair(ancestor)
    if (onSuccess && workflowStructureUtil.getAllSteps(onSuccess).some((s) => s.name === targetStepName)) {
        return 'on-success'
    }
    if (onFailure && workflowStructureUtil.getAllSteps(onFailure).some((s) => s.name === targetStepName)) {
        return 'on-failure'
    }
    return null
}

export const workflowCanvasUtils = {
    /**
     * Compute canvas (x, y) positions for every step in a workflow.
     * Positions match the frontend canvas layout algorithm.
     */
    computeStepPositions(trigger: WorkflowTrigger): Map<string, { x: number, y: number }> {
        const positions = new Map<string, { x: number, y: number }>()
        buildPositions({ step: trigger, offsetX: 0, offsetY: 0, positions })
        return positions
    },
    hasContinueOnFailureBranches,
    getContinueOnFailureBranchPair,
    getStepBranchRelativeTo,
    computeRouterChildOffsets,
}
