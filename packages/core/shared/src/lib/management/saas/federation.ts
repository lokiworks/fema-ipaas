import { DateOrString, EntityId, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { TenantRole } from '../../core/user/user'

export enum ExternalIdentityStatus {
    ACTIVE = 'ACTIVE',
    REVOKED = 'REVOKED',
}

export enum SsoMatchBy {
    EMAIL = 'EMAIL',
    SUBJECT = 'SUBJECT',
}

export const ExternalIdentity = z.object({
    id: EntityId,
    created: DateOrString,
    updated: DateOrString,
    issuer: z.string(),
    subject: z.string(),
    tenantId: EntityId,
    identityId: Nullable(EntityId),
    userId: Nullable(EntityId),
    prebindRole: Nullable(z.enum(TenantRole)),
    status: z.enum(ExternalIdentityStatus),
    lastVerifiedAt: Nullable(DateOrString),
})
export type ExternalIdentity = z.infer<typeof ExternalIdentity>

export const MEMBER_EVENT_TYPES = [
    'iam-identity.member.suspend',
    'iam-identity.member.activate',
    'iam-identity.member.remove',
    'iam-identity.member.restore',
] as const

export const MemberEventType = z.enum(MEMBER_EVENT_TYPES)
export type MemberEventType = z.infer<typeof MemberEventType>

export const MemberWebhookEvent = z.object({
    id: z.string().min(1).max(200),
    type: MemberEventType,
    tenantId: z.string().min(1).max(200),
    occurredAt: z.string().optional(),
    object: z.object({
        code: z.string().max(200).optional(),
        id: z.string().min(1).max(200),
    }),
})
export type MemberWebhookEvent = z.infer<typeof MemberWebhookEvent>

export const WebhookVerification = z.object({
    id: z.string().max(200).optional(),
    type: z.literal('webhook.verification'),
    challenge: z.string().min(1).max(500),
})
export type WebhookVerification = z.infer<typeof WebhookVerification>

export const FEDERATION_LIMITS = {
    signatureHeader: 'x-fema-signature',
    memberEventDedupeTtlSeconds: 24 * 60 * 60,
    defaultSessionRecheckMinutes: 15,
    federatedSessionHours: 8,
}
