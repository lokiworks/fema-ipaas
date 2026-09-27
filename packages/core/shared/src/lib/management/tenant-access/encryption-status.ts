import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { EncryptionKeySource } from '../../core/health/system-overview'

export const EncryptionKeyStatus = z.object({
    algorithm: z.string(),
    source: z.enum(EncryptionKeySource),
    keyId: Nullable(z.string()),
    firstObservedAt: Nullable(z.string()),
    ageDays: Nullable(z.number()),
    rotationRecommended: z.boolean(),
    retiredKeys: z.number(),
    lastReencryptedAt: Nullable(z.string()),
})
export type EncryptionKeyStatus = z.infer<typeof EncryptionKeyStatus>

export const ENCRYPTION_KEY_ROTATION_DAYS = 90
