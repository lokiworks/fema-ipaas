import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionNode, ExecutionPlan, WorkflowAction, WorkflowActionType, workflowCompiler, WorkflowGraph, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'

// The Engine walks an ExecutionPlan, never `.nextAction`. When persistence moves to nodes and
// edges (design doc section 11) a second compiler absorbs the change and nothing here moves.
export const executionPlanCursor = {
    forSubtree(action: WorkflowAction, graph?: WorkflowGraph | null): ExecutionPlan {
        return workflowCompiler.compile(syntheticVersionFor(action, graph))
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

    // A node reached by more than one path must not run until every path has arrived. Without
    // this, the first branch to finish would drag the join step along and the other branch's
    // output would be missing from it.
    dependenciesMet({ plan, nodeId, hasCompleted }: DependenciesMetParams): boolean {
        const required = plan.dependencies[nodeId] ?? []
        if (required.length <= 1) {
            return true
        }
        return required.every((dependency) => {
            const node = plan.nodes[dependency]
            return isNil(node) || node.kind === 'TRIGGER' || hasCompleted(dependency)
        })
    },

    nextOf({ plan, nodeId }: CursorParams): string | null {
        const node: ExecutionNode | undefined = plan.nodes[nodeId]
        if (isNil(node)) {
            return null
        }
        return node.next[0] ?? null
    },
}

function syntheticVersionFor(action: WorkflowAction, graph?: WorkflowGraph | null): WorkflowVersion {
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
        graph: graph ?? null,
    }
}

const SYNTHETIC_ID = 'plan-cursor'
const SYNTHETIC_TRIGGER_NAME = 'plan-cursor-entry'
const EPOCH = new Date(0).toISOString()

type CursorParams = {
    plan: ExecutionPlan
    nodeId: string
}

type DependenciesMetParams = CursorParams & {
    hasCompleted: (nodeId: string) => boolean
}

export { WorkflowActionType }
