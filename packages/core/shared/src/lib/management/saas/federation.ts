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

export enum FederationEventType {
    MEMBER_REMOVED = 'MEMBER_REMOVED',
    MEMBER_RESTORED = 'MEMBER_RESTORED',
    TENANT_SUSPENDED = 'TENANT_SUSPENDED',
    TENANT_RESUMED = 'TENANT_RESUMED',
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

export const FederationEvent = z.object({
    id: z.string().min(1).max(200),
    type: z.enum(FederationEventType),
    issuer: z.string().min(1).max(500),
    externalTenantId: z.string().min(1).max(200),
    subject: z.string().max(200).optional(),
    occurredAt: z.string(),
})
export type FederationEvent = z.infer<typeof FederationEvent>

export const FEDERATION_LIMITS = {
    signatureHeader: 'x-fema-signature',
    eventDedupeTtlSeconds: 7 * 24 * 60 * 60,
    defaultSessionRecheckMinutes: 15,
    federatedSessionHours: 8,
}
