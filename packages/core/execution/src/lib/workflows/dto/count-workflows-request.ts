import { z } from 'zod'

export const CountWorkflowsRequest = z.object({
    projectId: z.string(),
    folderId: z.string().optional(),
})

export type CountWorkflowsRequest = z.infer<typeof CountWorkflowsRequest>
