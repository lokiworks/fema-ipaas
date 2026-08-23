import { z } from 'zod'


export const GetWorkflowTemplateRequestQuery = z.object({
    versionId: z.string().optional(),
})

export type GetWorkflowTemplateRequestQuery = z.infer<typeof GetWorkflowTemplateRequestQuery>
