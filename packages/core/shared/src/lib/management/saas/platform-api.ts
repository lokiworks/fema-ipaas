import { DateOrString, EntityId, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { TenantRole } from '../../core/user/user'
import { formErrors } from '../../form-errors'
import { TenantExternalRef, TenantLimitsUpdate, TenantOwnerInput, TenantStatus } from './tenancy'

export enum PlatformScope {
    TENANT_PROVISION = 'TENANT_PROVISION',
    TENANT_MEMBERS = 'TENANT_MEMBERS',
    USAGE_READ = 'USAGE_READ',
}

export enum PlatformClientKind {
    API_KEY = 'API_KEY',
    TRUSTED_ISSUER = 'TRUSTED_ISSUER',
}

export enum PlatformMemberStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    PENDING_BINDING = 'PENDING_BINDING',
    INVITED = 'INVITED',
}

const httpsUrl = z.string().trim().max(500, 'urlTooLong').regex(/^https?:\/\/\S+$/, 'invalidHttpUrl')
const scopes = z.array(z.enum(PlatformScope)).min(1, formErrors.required)
const stringMap = z.record(z.string().min(1).max(100), z.string().max(500))

export const PlatformClient = z.object({
    id: EntityId,
    created: DateOrString,
    updated: DateOrString,
    name: z.string(),
    kind: z.enum(PlatformClientKind),
    keyPrefix: Nullable(z.string()),
    issuer: Nullable(z.string()),
    allowedSubjects: z.array(z.string()),
    scopes: z.array(z.enum(PlatformScope)),
    lastUsedAt: Nullable(DateOrString),
    revokedAt: Nullable(DateOrString),
})
export type PlatformClient = z.infer<typeof PlatformClient>

export const CreatePlatformClientRequestBody = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal(PlatformClientKind.API_KEY),
        name: z.string().trim().min(1, formErrors.required).max(100),
        scopes,
    }),
    z.object({
        kind: z.literal(PlatformClientKind.TRUSTED_ISSUER),
        name: z.string().trim().min(1, formErrors.required).max(100),
        issuer: httpsUrl,
        allowedSubjects: z.array(z.string().trim().min(1).max(200)).min(1, formErrors.required).max(50),
        scopes,
    }),
])
export type CreatePlatformClientRequestBody = z.infer<typeof CreatePlatformClientRequestBody>

export const CreatePlatformClientResponse = z.object({
    client: PlatformClient,
    secret: Nullable(z.string()),
})
export type CreatePlatformClientResponse = z.infer<typeof CreatePlatformClientResponse>

export const ProvisionOidcInput = z.object({
    issuer: httpsUrl,
    clientId: z.string().min(1).max(300),
    clientSecret: z.string().min(1).max(2000),
    scopes: z.string().max(300).optional(),
    extraAuthParams: stringMap.optional(),
    displayName: z.string().max(20).optional(),
    sessionRecheckMinutes: z.number().int().min(5).max(1440).optional(),
})
export type ProvisionOidcInput = z.infer<typeof ProvisionOidcInput>

export const ProvisionConnectionInput = z.object({
    externalId: z.string().min(1).max(200),
    connectorName: z.string().min(1).max(200),
    displayName: z.string().min(1).max(200),
    auth: z.object({
        type: z.literal('OAUTH2_CLIENT_CREDENTIALS'),
        tokenUrl: httpsUrl,
        clientId: z.string().min(1).max(300),
        clientSecret: z.string().min(1).max(2000),
        scope: z.string().max(500).optional(),
        props: stringMap.optional(),
    }),
})
export type ProvisionConnectionInput = z.infer<typeof ProvisionConnectionInput>

export const ProvisionMemberEventsInput = z.object({
    connectionExternalId: z.string().min(1).max(200),
    apiUrl: httpsUrl,
    rotateSecret: z.boolean().optional(),
})
export type ProvisionMemberEventsInput = z.infer<typeof ProvisionMemberEventsInput>

export const ProvisionMemberEventsResult = z.object({
    subscriptionId: z.string(),
    endpoint: z.string(),
    reused: z.boolean(),
    withheldEvents: z.array(z.string()),
})
export type ProvisionMemberEventsResult = z.infer<typeof ProvisionMemberEventsResult>

export const ProvisionTenantRequestBody = z.object({
    externalRef: TenantExternalRef,
    name: z.string().trim().min(1, formErrors.required).max(100),
    slug: z.string().trim().toLowerCase().max(40).optional(),
    owner: TenantOwnerInput,
    oidc: ProvisionOidcInput.optional(),
    memberEvents: ProvisionMemberEventsInput.optional(),
    connections: z.array(ProvisionConnectionInput).max(20).optional(),
    limits: TenantLimitsUpdate.optional(),
})
export type ProvisionTenantRequestBody = z.infer<typeof ProvisionTenantRequestBody>

export const ProvisionTenantResponse = z.object({
    tenantId: EntityId,
    slug: z.string(),
    projectId: EntityId,
    created: z.boolean(),
    loginUrl: z.string(),
    ssoStartUrl: Nullable(z.string()),
    memberEvents: Nullable(ProvisionMemberEventsResult),
    connections: z.array(z.object({
        externalId: z.string(),
        connectionId: EntityId,
    })),
})
export type ProvisionTenantResponse = z.infer<typeof ProvisionTenantResponse>

export const PlatformTenant = z.object({
    id: EntityId,
    name: z.string(),
    slug: z.string(),
    status: z.enum(TenantStatus),
    externalRef: Nullable(TenantExternalRef),
    usersLimit: Nullable(z.number()),
    projectsLimit: Nullable(z.number()),
    activeWorkflowsLimit: Nullable(z.number()),
    concurrentExecutionsLimit: Nullable(z.number()),
    workerGroupId: Nullable(z.string()),
})
export type PlatformTenant = z.infer<typeof PlatformTenant>

export const PlatformUpdateTenantRequestBody = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    limits: TenantLimitsUpdate.optional(),
})
export type PlatformUpdateTenantRequestBody = z.infer<typeof PlatformUpdateTenantRequestBody>

export const PlatformAddMemberRequestBody = z.object({
    subject: z.string().min(1).max(200).optional(),
    email: z.string().trim().toLowerCase().email('invalidEmail').optional(),
    phone: z.string().trim().optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    role: z.enum(TenantRole),
}).refine((member) => member.subject !== undefined || member.email !== undefined || member.phone !== undefined, {
    message: 'tenantOwnerContactRequired',
})
export type PlatformAddMemberRequestBody = z.infer<typeof PlatformAddMemberRequestBody>

export const PlatformMember = z.object({
    userId: Nullable(EntityId),
    subject: Nullable(z.string()),
    email: Nullable(z.string()),
    phone: Nullable(z.string()),
    name: z.string(),
    role: z.enum(TenantRole),
    status: z.enum(PlatformMemberStatus),
    notified: z.boolean(),
})
export type PlatformMember = z.infer<typeof PlatformMember>

export const PlatformMemberRef = z.object({
    subject: z.string().min(1).max(200).optional(),
    userId: z.string().min(1).max(21).optional(),
})
export type PlatformMemberRef = z.infer<typeof PlatformMemberRef>

export const PlatformUsageQuery = z.object({
    tenantId: z.string().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type PlatformUsageQuery = z.infer<typeof PlatformUsageQuery>

export const TenantUsageDay = z.object({
    tenantId: EntityId,
    date: z.string(),
    executions: z.number(),
    failedExecutions: z.number(),
    activeWorkflows: z.number(),
    activeWorkflowsExact: z.boolean(),
})
export type TenantUsageDay = z.infer<typeof TenantUsageDay>

export const PlatformUsageResponse = z.object({
    data: z.array(TenantUsageDay),
})
export type PlatformUsageResponse = z.infer<typeof PlatformUsageResponse>

export const PLATFORM_API = {
    apiKeyPrefix: 'fpk_',
    basePath: '/v1/platform',
    memberEventsPathPrefix: '/v1/federation/members',
}
