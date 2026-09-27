import { z } from 'zod'
import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'

export type FolderId = string

export const Folder = z.object({
    ...BaseModelSchema,
    id: z.string(),
    projectId: z.string(),
    displayName: z.string(),
    displayOrder: z.number(),
    externalId: Nullable(z.string()),
    parentId: Nullable(z.string()),
})

export const FOLDER_NAME_MAX_LENGTH = 50
export const FOLDER_MAX_DEPTH = 3
export const FOLDER_LIMIT_PER_PROJECT = 100

export const UncategorizedFolderId = 'NULL'
export type Folder = z.infer<typeof Folder>

export type FolderDto = Folder & { numberOfWorkflows: number }

