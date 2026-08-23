import { z } from 'zod'

export const CreateMCPServerFromStepParams = z.object({
    workflowId: z.string(),
    workflowVersionId: z.string(),
    stepName: z.string(),
})
export type CreateMCPServerFromStepParams = z.infer<typeof CreateMCPServerFromStepParams>
