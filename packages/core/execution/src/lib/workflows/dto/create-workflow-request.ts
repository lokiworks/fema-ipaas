import { z } from 'zod'
import { Metadata } from '@fema-ipaas/core-utils'

export const CreateWorkflowRequest = z.object({
    displayName: z.string(),
    /**If folderId is provided, folderName is ignored */
    folderId: z.string().optional(),
    folderName: z.string().optional(),
    workspaceId: z.string(),
    templateId: z.string().optional(),
    metadata: z.optional(Metadata),
})

export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequest>
