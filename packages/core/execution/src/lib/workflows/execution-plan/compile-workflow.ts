import { WorkflowAction, WorkflowActionType } from '../actions/action'
import { WorkflowTrigger } from '../triggers/trigger'
import { WorkflowVersion } from '../workflow-version'
import { ExecutionNode, ExecutionPlan } from './execution-plan'
import { WorkflowJoinEdge } from './workflow-graph'

export const workflowCompiler = {
    compile(workflowVersion: WorkflowVersion): ExecutionPlan {
        const nodes: Record<string, ExecutionNode> = {}
        visitTrigger(workflowVersion.trigger, nodes)
        const joinEdges = (workflowVersion.graph?.joinEdges ?? []).filter(
            (edge) => nodes[edge.from] !== undefined && nodes[edge.to] !== undefined,
        )
        return {
            entry: workflowVersion.trigger.name,
            nodes,
            dependencies: withJoinEdges(buildDependencies(nodes), joinEdges),
        }
    },
}

function withJoinEdges(dependencies: Record<string, string[]>, joinEdges: WorkflowJoinEdge[]): Record<string, string[]> {
    const merged = { ...dependencies }
    for (const edge of joinEdges) {
        const existing = merged[edge.to] ?? []
        merged[edge.to] = existing.includes(edge.from) ? existing : [...existing, edge.from]
    }
    return merged
}

function visitTrigger(trigger: WorkflowTrigger, nodes: Record<string, ExecutionNode>): void {
    nodes[trigger.name] = {
        id: trigger.name,
        kind: 'TRIGGER',
        step: trigger,
        next: nextIds(trigger.nextAction),
        children: {},
    }
    visitAction(trigger.nextAction, nodes)
}

function visitAction(action: WorkflowAction | undefined, nodes: Record<string, ExecutionNode>): void {
    if (action === undefined || nodes[action.name] !== undefined) {
        return
    }
    const children = childrenOf(action)
    nodes[action.name] = {
        id: action.name,
        kind: 'ACTION',
        step: action,
        next: nextIds(action.nextAction),
        children: Object.fromEntries(
            Object.entries(children).map(([slot, child]) => [slot, nextIds(child)]),
        ),
    }
    visitAction(action.nextAction, nodes)
    for (const child of Object.values(children)) {
        visitAction(child, nodes)
    }
}

function childrenOf(action: WorkflowAction): Record<string, WorkflowAction | undefined> {
    switch (action.type) {
        case WorkflowActionType.LOOP_ON_ITEMS:
            return { loop: action.firstLoopAction }
        case WorkflowActionType.ROUTER:
        case WorkflowActionType.PARALLEL:
            return Object.fromEntries(
                action.children.map((child, index) => [`branch_${index}`, child ?? undefined]),
            )
        case WorkflowActionType.CODE:
        case WorkflowActionType.COMPONENT:
        case WorkflowActionType.CONNECTOR:
            return {
                ...(action.continueOnFailureBranches?.onSuccess === undefined ? {} : { onSuccess: action.continueOnFailureBranches.onSuccess }),
                ...(action.continueOnFailureBranches?.onFailure === undefined ? {} : { onFailure: action.continueOnFailureBranches.onFailure }),
            }
    }
}

function nextIds(action: WorkflowAction | undefined): string[] {
    return action === undefined ? [] : [action.name]
}

function buildDependencies(nodes: Record<string, ExecutionNode>): Record<string, string[]> {
    const dependencies: Record<string, string[]> = Object.fromEntries(
        Object.keys(nodes).map((id) => [id, []]),
    )
    for (const node of Object.values(nodes)) {
        const outgoing = [...node.next, ...Object.values(node.children).flat()]
        for (const target of outgoing) {
            if (dependencies[target] !== undefined) {
                dependencies[target] = [...dependencies[target], node.id]
            }
        }
    }
    return dependencies
}
