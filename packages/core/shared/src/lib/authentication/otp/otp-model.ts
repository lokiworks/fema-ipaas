import { BaseModelSchema, EntityId } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { OtpType } from './otp-type'

export type OtpId = EntityId

export enum OtpState {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
}

export const OtpModel = z.object({
    ...BaseModelSchema,
    type: z.nativeEnum(OtpType),
    identityId: EntityId,
    value: z.string(),
    state: z.nativeEnum(OtpState),
    attempts: z.number(),
    version: z.number(),
})

export type OtpModel = z.infer<typeof OtpModel>
