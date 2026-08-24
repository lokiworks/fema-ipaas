import { BaseModelSchema, EntityId } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const ConcurrencyPool = z.object({
    ...BaseModelSchema,
    tenantId: EntityId,
    key: z.string(),
    maxConcurrentJobs: z.number().int().positive(),
})
export type ConcurrencyPool = z.infer<typeof ConcurrencyPool>
