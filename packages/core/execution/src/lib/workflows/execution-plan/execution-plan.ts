import { WorkflowAction } from '../actions/action'
import { WorkflowTrigger } from '../triggers/trigger'

export type ExecutionNodeKind = 'TRIGGER' | 'ACTION'

export type ExecutionNode = {
    id: string
    kind: ExecutionNodeKind
    step: WorkflowAction | WorkflowTrigger
    next: string[]
    children: Record<string, string[]>
}

export type ExecutionPlan = {
    entry: string
    nodes: Record<string, ExecutionNode>
    dependencies: Record<string, string[]>
}
