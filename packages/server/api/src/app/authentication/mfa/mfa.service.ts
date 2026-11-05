import { ApplicationError, ErrorCode, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { LOGIN_METHOD_LIMITS, MfaEnrollStartResponse, TenantMfaPolicy, UserIdentity } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock, distributedStore } from '../../database/redis-connections'
import { EncryptedObject, encryptUtils } from '../../helper/encryption'
import { identityContact } from '../../helper/identity-contact'
import { authTicket } from '../lib/auth-ticket'
import { redisCounter } from '../lib/redis-counter'
import { tenantLookup } from '../lib/tenant-lookup'
import { userIdentityService } from '../user-identity/user-identity-service'
import { recoveryCodes } from './recovery-codes'
import { totp } from './totp'

export const mfaService = (log: FastifyBaseLogger) => ({
    async assertSessionMayStart({ identity, tenantId }: GateParams): Promise<void> {
        if (identity.mfaEnabled) {
            throw new ApplicationError({
                code: ErrorCode.MFA_REQUIRED,
                params: { challengeToken: await issueChallenge({ identityId: identity.id, tenantId, enrollment: false }) },
            })
        }
        if (isNil(tenantId)) {
            return
        }
        const tenant = await tenantLookup.find({ tenantId })
        if (tenant?.mfaPolicy === TenantMfaPolicy.REQUIRED) {
            throw new ApplicationError({
                code: ErrorCode.MFA_ENROLLMENT_REQUIRED,
                params: { challengeToken: await issueChallenge({ identityId: identity.id, tenantId, enrollment: true }) },
            })
        }
    },

    async isRequiredByAnyTenant({ tenantIds }: RequiredByAnyTenantParams): Promise<boolean> {
        const tenants = await Promise.all(tenantIds.map((tenantId) => tenantLookup.find({ tenantId })))
        return tenants.some((tenant) => tenant?.mfaPolicy === TenantMfaPolicy.REQUIRED)
    },

    async resolveChallenge({ challengeToken, enrollment }: ResolveChallengeParams): Promise<MfaChallenge> {
        const challenge = await authTicket.peek<MfaChallenge>({ purpose: CHALLENGE_PURPOSE, token: challengeToken })
        if (isNil(challenge) || challenge.enrollment !== enrollment) {
            throw invalidCode()
        }
        return challenge
    },

    async verifyChallenge({ challengeToken, code }: VerifyChallengeParams): Promise<MfaChallenge> {
        const challenge = await this.resolveChallenge({ challengeToken, enrollment: false })
        await this.spendAttempt({ challengeToken })
        const accepted = await this.verifyCode({ identityId: challenge.identityId, code })
        if (!accepted) {
            throw invalidCode()
        }
        const consumed = await authTicket.consume<MfaChallenge>({ purpose: CHALLENGE_PURPOSE, token: challengeToken })
        if (isNil(consumed)) {
            throw invalidCode()
        }
        return consumed
    },

    async spendAttempt({ challengeToken }: SpendAttemptParams): Promise<void> {
        const attempts = await redisCounter.increment({
            key: `${authTicket.keyOf({ purpose: CHALLENGE_PURPOSE, token: challengeToken })}:attempts`,
            ttlSeconds: LOGIN_METHOD_LIMITS.mfaChallengeTtlSeconds,
        })
        if (attempts > LOGIN_METHOD_LIMITS.mfaMaxChallengeAttempts) {
            await authTicket.discard({ purpose: CHALLENGE_PURPOSE, token: challengeToken })
            throw invalidCode()
        }
    },

    async finishChallenge({ challengeToken }: SpendAttemptParams): Promise<MfaChallenge> {
        const consumed = await authTicket.consume<MfaChallenge>({ purpose: CHALLENGE_PURPOSE, token: challengeToken })
        if (isNil(consumed)) {
            throw invalidCode()
        }
        return consumed
    },

    async verifyCode({ identityId, code }: VerifyCodeParams): Promise<boolean> {
        const failureKey = failureBudgetKey({ identityId })
        if (await redisCounter.read({ key: failureKey }) >= LOGIN_METHOD_LIMITS.mfaIdentityFailureBudget) {
            log.warn({ identityId }, '[mfa] identity failure budget exhausted')
            return false
        }
        const accepted = await acceptCode({ log, identityId, code })
        if (accepted) {
            await redisCounter.reset({ key: failureKey })
            return true
        }
        await redisCounter.increment({ key: failureKey, ttlSeconds: FAILURE_WINDOW_SECONDS })
        return false
    },

    async startEnrollment({ identity, tenantId }: StartEnrollmentParams): Promise<MfaEnrollStartResponse> {
        if (identity.mfaEnabled) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'mfaAlreadyEnabled' },
            })
        }
        const secret = totp.generateSecret()
        const encrypted = await encryptUtils.encryptString(secret)
        await distributedStore.put(pendingEnrollmentKey({ identityId: identity.id }), encrypted, PENDING_ENROLLMENT_TTL_SECONDS)
        const issuer = await issuerName({ tenantId })
        return {
            secret,
            otpauthUrl: totp.buildOtpauthUrl({ issuer, account: identityContact.of(identity) || identity.id, secret }),
        }
    },

    async confirmEnrollment({ identityId, code }: ConfirmEnrollmentParams): Promise<string[]> {
        const failureKey = failureBudgetKey({ identityId })
        if (await redisCounter.read({ key: failureKey }) >= LOGIN_METHOD_LIMITS.mfaIdentityFailureBudget) {
            throw invalidCode()
        }
        const pending = await distributedStore.get<EncryptedObject>(pendingEnrollmentKey({ identityId }))
        if (isNil(pending)) {
            throw invalidCode()
        }
        const secret = await encryptUtils.decryptString(pending)
        const step = totp.matchStep({ secret, code, nowMs: Date.now() })
        if (isNil(step)) {
            await redisCounter.increment({ key: failureKey, ttlSeconds: FAILURE_WINDOW_SECONDS })
            throw invalidCode()
        }
        const codes = recoveryCodes.generate()
        await userIdentityService(log).enableMfa({
            id: identityId,
            mfaSecret: JSON.stringify(await encryptUtils.encryptString(secret)),
            mfaRecoveryCodes: await recoveryCodes.hashAll({ codes }),
        })
        await distributedStore.delete(pendingEnrollmentKey({ identityId }))
        return codes
    },

    async disable({ identityId, code }: VerifyCodeParams): Promise<void> {
        const accepted = await this.verifyCode({ identityId, code })
        if (!accepted) {
            throw invalidCode()
        }
        await userIdentityService(log).disableMfa({ id: identityId })
    },

    async regenerateRecoveryCodes({ identityId }: IdentityIdParams): Promise<string[]> {
        const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
        if (!identity.mfaEnabled) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'mfaNotEnabled' },
            })
        }
        const codes = recoveryCodes.generate()
        await userIdentityService(log).setRecoveryCodes({ id: identityId, mfaRecoveryCodes: await recoveryCodes.hashAll({ codes }) })
        return codes
    },

    async adminReset({ identityId }: IdentityIdParams): Promise<void> {
        await userIdentityService(log).disableMfa({ id: identityId })
        await distributedStore.delete(pendingEnrollmentKey({ identityId }))
        await redisCounter.reset({ key: failureBudgetKey({ identityId }) })
    },

    async recoveryCodesRemaining({ identityId }: IdentityIdParams): Promise<number> {
        const secrets = await userIdentityService(log).getMfaSecrets({ id: identityId })
        return secrets.mfaRecoveryCodes.length
    },
})

async function issueChallenge({ identityId, tenantId, enrollment }: MfaChallenge): Promise<string> {
    return authTicket.issue<MfaChallenge>({
        purpose: CHALLENGE_PURPOSE,
        payload: { identityId, tenantId, enrollment },
        ttlSeconds: LOGIN_METHOD_LIMITS.mfaChallengeTtlSeconds,
    })
}

async function acceptCode({ log, identityId, code }: AcceptCodeParams): Promise<boolean> {
    const secrets = await userIdentityService(log).getMfaSecrets({ id: identityId })
    if (isNil(secrets.mfaSecret)) {
        return false
    }
    const trimmed = code.trim()
    if (recoveryCodes.looksLikeRecoveryCode({ code: trimmed })) {
        return acceptRecoveryCode({ log, identityId, code: trimmed })
    }
    const { data: secret, error } = await tryCatch(async () => encryptUtils.decryptString(EncryptedObject.parse(JSON.parse(secrets.mfaSecret ?? ''))))
    if (!isNil(error) || isNil(secret)) {
        log.error({ error, identityId }, '[mfa] stored secret could not be decrypted')
        return false
    }
    const step = totp.matchStep({ secret, code: trimmed, nowMs: Date.now() })
    if (isNil(step)) {
        return false
    }
    return markStepUsed({ identityId, step })
}

async function acceptRecoveryCode({ log, identityId, code }: AcceptCodeParams): Promise<boolean> {
    return distributedLock(log).runExclusive({
        key: `mfa-recovery-${identityId}`,
        timeoutInSeconds: 15,
        fn: async () => {
            const { mfaRecoveryCodes } = await userIdentityService(log).getMfaSecrets({ id: identityId })
            const remaining = await recoveryCodes.consume({ stored: mfaRecoveryCodes, code })
            if (isNil(remaining)) {
                return false
            }
            await userIdentityService(log).setRecoveryCodes({ id: identityId, mfaRecoveryCodes: remaining })
            log.info({ identityId, remaining: remaining.length }, '[mfa] recovery code used')
            return true
        },
    })
}

async function markStepUsed({ identityId, step }: MarkStepUsedParams): Promise<boolean> {
    return distributedStore.putIfAbsent(`totp-used:${identityId}:${step}`, '1', USED_STEP_TTL_SECONDS)
}

async function issuerName({ tenantId }: IssuerNameParams): Promise<string> {
    if (isNil(tenantId)) {
        return LOGIN_METHOD_LIMITS.totpIssuerFallback
    }
    const tenant = await tenantLookup.find({ tenantId })
    return tenant?.name ?? LOGIN_METHOD_LIMITS.totpIssuerFallback
}

function invalidCode(): ApplicationError {
    return new ApplicationError({ code: ErrorCode.INVALID_MFA_CODE, params: {} })
}

function failureBudgetKey({ identityId }: IdentityIdParams): string {
    return `mfa-failures:${identityId}`
}

function pendingEnrollmentKey({ identityId }: IdentityIdParams): string {
    return `mfa-enroll-pending:${identityId}`
}

const CHALLENGE_PURPOSE = 'mfa-challenge'
const FAILURE_WINDOW_SECONDS = 15 * 60
const PENDING_ENROLLMENT_TTL_SECONDS = 10 * 60
const USED_STEP_TTL_SECONDS = 120

export const mfaInternals = {
    issueChallenge,
}

type IdentityIdParams = {
    identityId: string
}

type MfaChallenge = {
    identityId: string
    tenantId: string | null
    enrollment: boolean
}

type GateParams = {
    identity: UserIdentity
    tenantId: string | null
}

type RequiredByAnyTenantParams = {
    tenantIds: string[]
}

type ResolveChallengeParams = {
    challengeToken: string
    enrollment: boolean
}

type SpendAttemptParams = {
    challengeToken: string
}

type VerifyChallengeParams = SpendAttemptParams & {
    code: string
}

type VerifyCodeParams = IdentityIdParams & {
    code: string
}

type StartEnrollmentParams = {
    identity: UserIdentity
    tenantId: string | null
}

type ConfirmEnrollmentParams = VerifyCodeParams

type AcceptCodeParams = VerifyCodeParams & {
    log: FastifyBaseLogger
}

type MarkStepUsedParams = IdentityIdParams & {
    step: number
}

type IssuerNameParams = {
    tenantId: string | null
}
