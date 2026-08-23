import { z } from 'zod'

// The action tree stays the editing model. A join edge expresses the one thing the tree cannot:
// a step that waits for two or more steps sitting on otherwise unrelated paths. Storing only the
// extra edges keeps every existing workflow valid without a rewriting migration.
export const WorkflowJoinEdge = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
})

export const WorkflowGraph = z.object({
    joinEdges: z.array(WorkflowJoinEdge),
})

export type WorkflowJoinEdge = z.infer<typeof WorkflowJoinEdge>
export type WorkflowGraph = z.infer<typeof WorkflowGraph>

export const EMPTY_WORKFLOW_GRAPH: WorkflowGraph = { joinEdges: [] }
