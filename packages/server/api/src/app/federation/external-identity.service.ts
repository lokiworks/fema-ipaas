import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import {
    ExternalIdentityStatus,
    ProvisionOidcInput,
    SSO_LIMITS,
    SsoMatchBy,
    StoredOidcSso,
    TenantRole,
    UserStatus,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { distributedLock } from '../database/redis-connections'
import { encryptUtils } from '../helper/encryption'
import { ssoScopeUtils } from '../sso/sso-scope-utils'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { userRepo } from '../user/user-service'
import { ExternalIdentityEntity, ExternalIdentitySchema } from './external-identity.entity'

export const externalIdentityRepo = repoFactory(ExternalIdentityEntity)

export const externalIdentityService = (log: FastifyBaseLogger) => ({
    async findBinding({ issuer, subject }: BindingKey): Promise<ExternalIdentityRecord | null> {
        return externalIdentityRepo().findOneBy({ issuer, subject })
    },

    async prebind({ tenantId, issuer, subject, role, email, displayName }: PrebindParams): Promise<ExternalIdentityRecord> {
        return withBindingLock({ log, issuer, subject, fn: async () => {
            const existing = await externalIdentityRepo().findOneBy({ issuer, subject })
            if (isNil(existing)) {
                return externalIdentityRepo().save({
                    id: generateId(),
                    issuer,
                    subject,
                    tenantId,
                    identityId: null,
                    userId: null,
                    prebindRole: role,
                    status: ExternalIdentityStatus.ACTIVE,
                    email: normalizeEmail(email),
                    displayName: displayName ?? null,
                    lastVerifiedAt: null,
                })
            }
            assertSameTenant({ existing, tenantId })
            if (!isNil(existing.userId)) {
                return existing
            }
            await externalIdentityRepo().update({ id: existing.id, tenantId }, {
                prebindRole: role,
                status: ExternalIdentityStatus.ACTIVE,
                email: normalizeEmail(email) ?? existing.email,
                displayName: displayName ?? existing.displayName,
            })
            return externalIdentityRepo().findOneByOrFail({ id: existing.id, tenantId })
        } })
    },

    async bindToUser({ tenantId, issuer, subject, identityId, userId, email, displayName }: BindToUserParams): Promise<ExternalIdentityRecord> {
        return withBindingLock({ log, issuer, subject, fn: async () => {
            const existing = await externalIdentityRepo().findOneBy({ issuer, subject })
            const now = dayjs().toISOString()
            if (isNil(existing)) {
                return externalIdentityRepo().save({
                    id: generateId(),
                    issuer,
                    subject,
                    tenantId,
                    identityId,
                    userId,
                    prebindRole: null,
                    status: ExternalIdentityStatus.ACTIVE,
                    email: normalizeEmail(email),
                    displayName: displayName ?? null,
                    lastVerifiedAt: now,
                })
            }
            assertSameTenant({ existing, tenantId })
            if (!isNil(existing.userId) && existing.userId !== userId) {
                throw new ApplicationError({
                    code: ErrorCode.VALIDATION,
                    params: { message: 'This external identity is already bound to another user' },
                })
            }
            await externalIdentityRepo().update({ id: existing.id, tenantId }, {
                identityId,
                userId,
                prebindRole: null,
                email: normalizeEmail(email) ?? existing.email,
                displayName: displayName ?? existing.displayName,
                lastVerifiedAt: now,
            })
            return externalIdentityRepo().findOneByOrFail({ id: existing.id, tenantId })
        } })
    },

    async touchLogin({ id, tenantId, email, displayName }: TouchLoginParams): Promise<void> {
        const existing = await externalIdentityRepo().findOneByOrFail({ id, tenantId })
        await externalIdentityRepo().update({ id, tenantId }, {
            email: normalizeEmail(email) ?? existing.email,
            displayName: displayName ?? existing.displayName,
            lastVerifiedAt: dayjs().toISOString(),
        })
    },

    async saveRefreshToken({ id, tenantId, refreshToken }: SaveRefreshTokenParams): Promise<void> {
        const encrypted = await encryptUtils.encryptString(refreshToken)
        await externalIdentityRepo().update({ id, tenantId }, { refreshToken: encrypted })
    },

    async markVerified({ id, tenantId }: { id: string, tenantId: string }): Promise<void> {
        await externalIdentityRepo().update({ id, tenantId }, { lastVerifiedAt: dayjs().toISOString() })
    },

    async revokeBySubject({ issuer, subject, tenantId }: ScopedBindingKey): Promise<RevokeResult> {
        return withBindingLock({ log, issuer, subject, fn: async () => {
            const binding = await externalIdentityRepo().findOneBy({ issuer, subject })
            if (isNil(binding) || (!isNil(tenantId) && binding.tenantId !== tenantId)) {
                return { found: false, tenantId: null, userId: null, alreadyRevoked: false }
            }
            const alreadyRevoked = binding.status === ExternalIdentityStatus.REVOKED
            await externalIdentityRepo().update({ id: binding.id, tenantId: binding.tenantId }, {
                status: ExternalIdentityStatus.REVOKED,
                refreshToken: null,
            })
            if (!isNil(binding.userId)) {
                await userRepo().update({ id: binding.userId, tenantId: binding.tenantId }, { status: UserStatus.INACTIVE })
            }
            log.info({ tenant: { id: binding.tenantId }, issuer, user: { id: binding.userId } }, '[externalIdentity] binding revoked')
            return { found: true, tenantId: binding.tenantId, userId: binding.userId ?? null, alreadyRevoked }
        } })
    },

    async restoreBySubject({ issuer, subject, tenantId }: ScopedBindingKey): Promise<RestoreResult> {
        return withBindingLock({ log, issuer, subject, fn: async () => {
            const binding = await externalIdentityRepo().findOneBy({ issuer, subject })
            if (isNil(binding) || (!isNil(tenantId) && binding.tenantId !== tenantId)) {
                return { found: false, tenantId: null, userId: null }
            }
            const wasRevoked = binding.status === ExternalIdentityStatus.REVOKED
            await externalIdentityRepo().update({ id: binding.id, tenantId: binding.tenantId }, { status: ExternalIdentityStatus.ACTIVE })
            if (wasRevoked && !isNil(binding.userId)) {
                await userRepo().update({ id: binding.userId, tenantId: binding.tenantId }, { status: UserStatus.ACTIVE })
            }
            log.info({ tenant: { id: binding.tenantId }, issuer, user: { id: binding.userId } }, '[externalIdentity] binding restored')
            return { found: true, tenantId: binding.tenantId, userId: binding.userId ?? null }
        } })
    },

    async rotateRefreshTokens(): Promise<number> {
        const rows = await externalIdentityRepo().createQueryBuilder('identity')
            .addSelect('identity.refreshToken')
            .where('identity."refreshToken" IS NOT NULL')
            .getMany()
        const outdated = await Promise.all(rows.map(async (row) => {
            const token = row.refreshToken
            return !isNil(token) && !(await encryptUtils.isEncryptedWithCurrentKey(token)) ? { row, token } : null
        }))
        const pending = outdated.filter((entry) => !isNil(entry))
        await Promise.all(pending.map(async ({ row, token }) => {
            const refreshToken = await encryptUtils.encryptString(await encryptUtils.decryptString(token))
            await externalIdentityRepo().update({ id: row.id, tenantId: row.tenantId }, { refreshToken })
        }))
        return pending.length
    },

    async listForTenant({ tenantId }: { tenantId: string }): Promise<ExternalIdentityRecord[]> {
        return externalIdentityRepo().find({ where: { tenantId }, order: { created: 'ASC', id: 'ASC' } })
    },

    async listForIdentity({ identityId }: { identityId: string }): Promise<ExternalIdentityRecord[]> {
        return externalIdentityRepo().find({ where: { identityId }, order: { created: 'ASC', id: 'ASC' } })
    },

    async upsertOidcConfigForProvisioning({ tenantId, oidc, eventSigningSecret }: UpsertOidcParams): Promise<void> {
        await distributedLock(log).runExclusive({
            key: `sso-settings-${tenantId}`,
            timeoutInSeconds: 30,
            fn: async () => {
                const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
                const previous = tenant.federatedAuthProviders.oidc ?? null
                const next = await buildProvisionedOidc({ oidc, eventSigningSecret, previous })
                await tenantRepo().update({ id: tenantId }, { federatedAuthProviders: { ...tenant.federatedAuthProviders, oidc: next } })
                log.info({ tenant: { id: tenantId }, issuer: oidc.issuer }, '[externalIdentity] OIDC configuration provisioned')
            },
        })
    },
})

async function buildProvisionedOidc({ oidc, eventSigningSecret, previous }: BuildProvisionedParams): Promise<StoredOidcSso> {
    const clientSecret = await encryptUtils.encryptString(oidc.clientSecret)
    const signing = isNil(eventSigningSecret) ? previous?.eventSigningSecret : await encryptUtils.encryptString(eventSigningSecret)
    return {
        enabled: true,
        displayName: oidc.displayName ?? previous?.displayName ?? DEFAULT_DISPLAY_NAME,
        allowedDomains: previous?.allowedDomains ?? [],
        autoCreateUsers: previous?.autoCreateUsers ?? false,
        defaultRole: previous?.defaultRole ?? TenantRole.MEMBER,
        roleMapping: previous?.roleMapping ?? null,
        defaultProject: previous?.defaultProject ?? null,
        verifiedAt: dayjs().toISOString(),
        lastLoginAt: previous?.lastLoginAt ?? null,
        issuer: oidc.issuer,
        clientId: oidc.clientId,
        clientSecret,
        scopes: ssoScopeUtils.ensureOpenid(oidc.scopes ?? SSO_LIMITS.defaultScopes),
        emailClaim: SSO_LIMITS.defaultEmailClaim,
        requireVerifiedEmail: false,
        matchBy: SsoMatchBy.SUBJECT,
        extraAuthParams: oidc.extraAuthParams ?? {},
        sessionRecheckMinutes: previous?.sessionRecheckMinutes ?? null,
        provisioned: true,
        ...(isNil(signing) ? {} : { eventSigningSecret: signing }),
    }
}

async function withBindingLock<T>({ log, issuer, subject, fn }: WithBindingLockParams<T>): Promise<T> {
    return distributedLock(log).runExclusive({
        key: `external-identity-${issuer}-${subject}`,
        timeoutInSeconds: 30,
        fn,
    })
}

function assertSameTenant({ existing, tenantId }: { existing: ExternalIdentityRecord, tenantId: string }): void {
    if (existing.tenantId !== tenantId) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'This external identity is already bound to another tenant' },
        })
    }
}

function normalizeEmail(email: string | null | undefined): string | null {
    const trimmed = email?.trim().toLowerCase() ?? ''
    return trimmed.length === 0 ? null : trimmed
}

const DEFAULT_DISPLAY_NAME = '单点登录'

export const externalIdentityUtils = {
    normalizeEmail,
}

export type ExternalIdentityRecord = Omit<ExternalIdentitySchema, 'tenant' | 'refreshToken'>

export type RevokeResult = {
    found: boolean
    tenantId: string | null
    userId: string | null
    alreadyRevoked: boolean
}

export type RestoreResult = {
    found: boolean
    tenantId: string | null
    userId: string | null
}

type BindingKey = {
    issuer: string
    subject: string
}

type ScopedBindingKey = BindingKey & {
    tenantId?: string
}

type PrebindParams = BindingKey & {
    tenantId: string
    role: TenantRole
    email?: string | null
    displayName?: string | null
}

type BindToUserParams = BindingKey & {
    tenantId: string
    identityId: string
    userId: string
    email?: string | null
    displayName?: string | null
}

type TouchLoginParams = {
    id: string
    tenantId: string
    email?: string | null
    displayName?: string | null
}

type SaveRefreshTokenParams = {
    id: string
    tenantId: string
    refreshToken: string
}

type UpsertOidcParams = {
    tenantId: string
    oidc: ProvisionOidcInput
    eventSigningSecret?: string
}

type BuildProvisionedParams = {
    oidc: ProvisionOidcInput
    eventSigningSecret: string | undefined
    previous: StoredOidcSso | null
}

type WithBindingLockParams<T> = BindingKey & {
    log: FastifyBaseLogger
    fn: () => Promise<T>
}

