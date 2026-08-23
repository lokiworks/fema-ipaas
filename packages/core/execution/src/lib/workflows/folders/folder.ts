import { z } from 'zod'
import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'

export type FolderId = string

export const Folder = z.object({
    ...BaseModelSchema,
    id: z.string(),
    workspaceId: z.string(),
    displayName: z.string(),
    displayOrder: z.number(),
    externalId: Nullable(z.string()),
})

export const UncategorizedFolderId = 'NULL'
export type Folder = z.infer<typeof Folder>

export type FolderDto = Folder & { numberOfWorkflows: number }

