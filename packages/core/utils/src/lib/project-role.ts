import * as z from 'zod/mini'
import { BaseModelSchema, Nullable } from './base-model'

export const ProjectRole = z.object({
    ...BaseModelSchema,
    name: z.string(),
    permissions: z.array(z.string()),
    tenantId: Nullable(z.string()),
    type: z.string(),
    userCount: z.optional(z.number()),
})

export type ProjectRole = z.infer<typeof ProjectRole>
