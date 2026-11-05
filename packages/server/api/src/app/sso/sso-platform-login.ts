import { isNil } from '@fema-ipaas/core-utils'
import {
    PlatformLoginAppKind,
    SsoLoginErrorCode,
    SsoMatchBy,
    TenantRole,
    UserIdentityProvider,
    UserStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { signupNames } from '../authentication/lib/signup-names'
import { distributedLock } from '../database/redis-connections'
import { ExternalIdentityRecord, externalIdentityService } from '../federation/external-identity.service'
import { instanceSettingsStore } from '../operator/instance-settings.store'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { PlatformLoginAppRuntime } from './platform-login-apps.service'
import { ssoConfigService } from './sso-config.service'
import { SsoLoginError } from './sso-errors'
import { PlatformProfile, RuntimePolicy } from './sso-runtime'
import { ssoUserResolver } from './sso-user-resolver'

async function login({ log, kind, platform, app, ip }: LoginParams): Promise<PlatformLoginResult> {
    const { profile, issuer, enterpriseKey } = platform
    const binding = await externalIdentityService(log).findBinding({ issuer, subject: profile.subject })
    const boundTenantId = await ssoConfigService(log).findTenantIdByPlatformBinding({ kind, enterpriseKey })
    const policy = policyFor({ kind, issuer })
    if (!isNil(binding)) {
        if (!isNil(boundTenantId) && boundTenantId !== binding.tenantId) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'The account is bound to a tenant that does not own this enterprise' })
        }
        return resolveIn({ log, tenantId: binding.tenantId, policy, platform, binding, ip })
    }
    if (!isNil(boundTenantId)) {
        return resolveIn({ log, tenantId: boundTenantId, policy, platform, binding: null, ip })
    }
    return signUpTenant({ log, kind, platform, app, policy, ip })
}

async function bind({ log, kind, platform, tenantId, actorUserId }: BindParams): Promise<void> {
    const actor = isNil(actorUserId) ? null : await userService(log).get({ id: actorUserId })
    if (isNil(actor) || actor.tenantId !== tenantId || actor.tenantRole !== TenantRole.ADMIN || actor.status !== UserStatus.ACTIVE) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED, detail: 'Only a tenant administrator can bind an enterprise' })
    }
    const holder = await ssoConfigService(log).findTenantIdByPlatformBinding({ kind, enterpriseKey: platform.enterpriseKey })
    if (!isNil(holder) && holder !== tenantId) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'This enterprise is already bound to another tenant' })
    }
    const existing = await externalIdentityService(log).findBinding({ issuer: platform.issuer, subject: platform.profile.subject })
    if (!isNil(existing) && (existing.tenantId !== tenantId || existing.userId !== actor.id)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'This account is already bound to another user' })
    }
    await ssoConfigService(log).addPlatformBinding({
        tenantId,
        kind,
        enterpriseKey: platform.enterpriseKey,
        enterpriseName: platform.profile.enterpriseName ?? platform.enterpriseKey,
    })
    await externalIdentityService(log).bindToUser({
        tenantId,
        issuer: platform.issuer,
        subject: platform.profile.subject,
        identityId: actor.identityId,
        userId: actor.id,
        email: platform.profile.email,
        displayName: ssoUserResolver.displayNameOf({ profile: platform.profile }),
    })
}

async function resolveIn({ log, tenantId, policy, platform, binding, ip }: ResolveInParams): Promise<PlatformLoginResult> {
    await ssoUserResolver.assertProfileAllowed({ log, policy, profile: platform.profile, tenantId, binding })
    const resolved = await ssoUserResolver.resolve({ log, policy, profile: platform.profile, tenantId, binding, ip })
    return { userId: resolved.userId, tenantId, createdTenant: false }
}

async function signUpTenant({ log, kind, platform, app, policy, ip }: SignUpParams): Promise<PlatformLoginResult> {
    const selfSignupOpen = app.allowSelfSignup && (await instanceSettingsStore.get()).tenantSelfSignup
    if (!selfSignupOpen) {
        throw new SsoLoginError({
            code: SsoLoginErrorCode.USER_NOT_PROVISIONED,
            detail: 'This enterprise is not bound to a tenant yet and creating tenants by sign-in is turned off',
        })
    }
    return distributedLock(log).runExclusive({
        key: `platform-signup-${kind}-${platform.enterpriseKey}`,
        timeoutInSeconds: 60,
        fn: async () => {
            const boundTenantId = await ssoConfigService(log).findTenantIdByPlatformBinding({ kind, enterpriseKey: platform.enterpriseKey })
            if (!isNil(boundTenantId)) {
                return resolveIn({ log, tenantId: boundTenantId, policy, platform, binding: null, ip })
            }
            const identity = await ssoUserResolver.ensureIdentity({ log, policy, profile: platform.profile })
            const name = platform.profile.enterpriseName ?? signupNames.tenantNameFromPerson({
                firstName: platform.profile.givenName.length > 0 ? platform.profile.givenName : platform.profile.fullName,
                email: platform.profile.email,
            })
            const provisioned = await tenantService(log).provisionTenant({ identityId: identity.id, name })
            await ssoConfigService(log).addPlatformBinding({
                tenantId: provisioned.tenant.id,
                kind,
                enterpriseKey: platform.enterpriseKey,
                enterpriseName: platform.profile.enterpriseName ?? name,
            })
            await ssoUserResolver.bindUser({
                log,
                policy,
                profile: platform.profile,
                tenantId: provisioned.tenant.id,
                identityId: identity.id,
                userId: provisioned.ownerUserId,
            })
            log.info({ tenant: { id: provisioned.tenant.id }, kind }, '[ssoPlatformLogin] tenant created from a platform sign-in')
            return { userId: provisioned.ownerUserId, tenantId: provisioned.tenant.id, createdTenant: true }
        },
    })
}

function policyFor({ kind, issuer }: { kind: PlatformLoginAppKind, issuer: string }): RuntimePolicy {
    return {
        issuer,
        matchBy: SsoMatchBy.SUBJECT,
        allowedDomains: [],
        autoCreateUsers: false,
        defaultRole: TenantRole.MEMBER,
        roleMapping: null,
        defaultProject: null,
        requireVerifiedEmail: false,
        userProvider: USER_PROVIDER_BY_KIND[kind],
        federated: false,
    }
}

const USER_PROVIDER_BY_KIND: Record<PlatformLoginAppKind, UserIdentityProvider> = {
    FEISHU: UserIdentityProvider.FEISHU,
    WECOM: UserIdentityProvider.WECOM,
    DINGTALK: UserIdentityProvider.DINGTALK,
}

export const ssoPlatformLogin = {
    login,
    bind,
    policyFor,
}

export type PlatformLoginResult = {
    userId: string
    tenantId: string
    createdTenant: boolean
}

type LoginParams = {
    log: FastifyBaseLogger
    kind: PlatformLoginAppKind
    platform: PlatformProfile
    app: PlatformLoginAppRuntime
    ip: string | undefined
}

type BindParams = {
    log: FastifyBaseLogger
    kind: PlatformLoginAppKind
    platform: PlatformProfile
    tenantId: string
    actorUserId: string | null
}

type ResolveInParams = {
    log: FastifyBaseLogger
    tenantId: string
    policy: RuntimePolicy
    platform: PlatformProfile
    binding: ExternalIdentityRecord | null
    ip: string | undefined
}

type SignUpParams = {
    log: FastifyBaseLogger
    kind: PlatformLoginAppKind
    platform: PlatformProfile
    app: PlatformLoginAppRuntime
    policy: RuntimePolicy
    ip: string | undefined
}
