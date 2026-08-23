import { BaseModelSchema } from '@fema-ipaas/core-utils'
import { z } from 'zod'

const KnowledgeBaseFile = z.object({
    ...BaseModelSchema,
    workspaceId: z.string(),
    fileId: z.string(),
    displayName: z.string(),
})

export type KnowledgeBaseFile = z.infer<typeof KnowledgeBaseFile>
