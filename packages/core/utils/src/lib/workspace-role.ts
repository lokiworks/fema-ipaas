import * as z from 'zod/mini'
import { BaseModelSchema, Nullable } from './base-model'

export const WorkspaceRole = z.object({
    ...BaseModelSchema,
    name: z.string(),
    permissions: z.array(z.string()),
    platformId: Nullable(z.string()),
    type: z.string(),
    userCount: z.optional(z.number()),
})

export type WorkspaceRole = z.infer<typeof WorkspaceRole>
