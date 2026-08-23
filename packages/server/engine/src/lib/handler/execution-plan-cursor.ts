import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionNode, ExecutionPlan, WorkflowAction, WorkflowActionType, workflowCompiler, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'

// The Engine walks an ExecutionPlan, never `.nextAction`. When persistence moves to nodes and
// edges (design doc section 11) a second compiler absorbs the change and nothing here moves.
export const executionPlanCursor = {
    forSubtree(action: WorkflowAction): ExecutionPlan {
        return workflowCompiler.compile(syntheticVersionFor(action))
    },

    forWorkflow(workflowVersion: WorkflowVersion): ExecutionPlan {
        return workflowCompiler.compile(workflowVersion)
    },

    stepAt({ plan, nodeId }: CursorParams): WorkflowAction | null {
        const node: ExecutionNode | undefined = plan.nodes[nodeId]
        if (isNil(node) || node.kind !== 'ACTION') {
            return null
        }
        return node.step as WorkflowAction
    },

    nextOf({ plan, nodeId }: CursorParams): string | null {
        const node: ExecutionNode | undefined = plan.nodes[nodeId]
        if (isNil(node)) {
            return null
        }
        return node.next[0] ?? null
    },
}

function syntheticVersionFor(action: WorkflowAction): WorkflowVersion {
    return {
        id: SYNTHETIC_ID,
        created: EPOCH,
        updated: EPOCH,
        workflowId: SYNTHETIC_ID,
        displayName: SYNTHETIC_ID,
        trigger: {
            name: SYNTHETIC_TRIGGER_NAME,
            displayName: SYNTHETIC_TRIGGER_NAME,
            type: WorkflowTriggerType.EMPTY,
            valid: true,
            settings: {},
            lastUpdatedDate: EPOCH,
            nextAction: action,
        },
        updatedBy: null,
        valid: true,
        schemaVersion: null,
        agentIds: [],
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        backupFiles: null,
        notes: [],
    }
}

const SYNTHETIC_ID = 'plan-cursor'
const SYNTHETIC_TRIGGER_NAME = 'plan-cursor-entry'
const EPOCH = new Date(0).toISOString()

type CursorParams = {
    plan: ExecutionPlan
    nodeId: string
}

export { WorkflowActionType }
