import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const DebugVerification = z.object({
    verified: z.boolean(),
    executionId: Nullable(z.string()),
    verifiedAt: Nullable(z.string()),
    executedStepNames: z.array(z.string()),
})
export type DebugVerification = z.infer<typeof DebugVerification>
