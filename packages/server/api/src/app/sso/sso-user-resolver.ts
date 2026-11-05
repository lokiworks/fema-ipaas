import { isNil } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import {
    ApplicationEventName,
    ExternalIdentityStatus,
    SsoLoginErrorCode,
    SsoMatchBy,
    User,
    UserIdentity,
    UserStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { isDomainAllowed } from '../authentication/authentication-utils'
import { signupNames } from '../authentication/lib/signup-names'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { ExternalIdentityRecord, externalIdentityService } from '../federation/external-identity.service'
import { applicationEvents } from '../helper/application-events'
import { projectMemberService } from '../project/project-member.service'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { SsoLoginError } from './sso-errors'
import { ssoProfile, SsoProfile } from './sso-profile'
import { RuntimePolicy } from './sso-runtime'

async function resolve({ log, policy, profile, tenantId, binding, ip }: ResolveParams): Promise<ResolvedUser> {
    assertBindingUsable({ binding, tenantId })
    const boundUser = await loadBoundUser({ log, binding, tenantId })
    if (!isNil(boundUser) && !isNil(binding)) {
        await signInUser({ log, user: boundUser, policy, profile, tenantId, ip })
        await externalIdentityService(log).touchLogin({ id: binding.id, tenantId, email: profile.email, displayName: displayNameOf({ profile }) })
        return { userId: boundUser.id, externalIdentityId: binding.id }
    }
    const matched = await matchByEmail({ log, policy, profile, tenantId })
    if (!isNil(matched)) {
        await signInUser({ log, user: matched.user, policy, profile, tenantId, ip })
        const bound = await bindUser({ log, policy, profile, tenantId, identityId: matched.identity.id, userId: matched.user.id })
        return { userId: matched.user.id, externalIdentityId: bound.id }
    }
    return createUser({ log, policy, profile, tenantId, binding, ip })
}

async function assertProfileAllowed({ log, policy, profile, tenantId, binding }: AssertProfileAllowedParams): Promise<void> {
    ssoProfile.assertUsable({
        profile,
        requireVerifiedEmail: policy.requireVerifiedEmail,
        requireEmail: policy.matchBy === SsoMatchBy.EMAIL && isNil(binding),
    })
    ssoProfile.assertDomainListed({ email: profile.email, allowedDomains: policy.allowedDomains })
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    if (!isDomainAllowed({ email: profile.email, enforce: tenant.enforceAllowedAuthDomains, allowedDomains: tenant.allowedAuthDomains })) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.DOMAIN_NOT_ALLOWED, detail: `The email domain of ${displayNameOf({ profile })} is not allowed to sign in to this tenant` })
    }
}

async function loadBoundUser({ log, binding, tenantId }: LoadBoundUserParams): Promise<User | null> {
    if (isNil(binding) || isNil(binding.userId)) {
        return null
    }
    const user = await userService(log).get({ id: binding.userId })
    return !isNil(user) && user.tenantId === tenantId ? user : null
}

async function matchByEmail({ log, policy, profile, tenantId }: MatchByEmailParams): Promise<EmailMatch | null> {
    if (policy.matchBy !== SsoMatchBy.EMAIL || !ssoProfile.hasEmail(profile)) {
        return null
    }
    const identity = await userIdentityService(log).getIdentityByEmail(profile.email)
    if (isNil(identity)) {
        return null
    }
    const user = await userService(log).getOneByIdentityAndTenant({ identityId: identity.id, tenantId })
    return isNil(user) ? null : { identity, user }
}

async function signInUser({ log, user, policy, profile, tenantId, ip }: SignInUserParams): Promise<void> {
    if (user.status === UserStatus.INACTIVE) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.USER_DISABLED, detail: `The account ${displayNameOf({ profile })} has been disabled` })
    }
    const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
    if (!identity.verified) {
        await userIdentityService(log).verifyAndDiscardPassword(identity.id)
    }
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    const shouldSync = policy.roleMapping?.syncOnLogin === true && tenant.ownerId !== user.id
    if (shouldSync) {
        const role = ssoProfile.resolveRole({ groups: profile.groups, roleMapping: policy.roleMapping, defaultRole: policy.defaultRole })
        if (role !== user.tenantRole) {
            await userService(log).update({ id: user.id, tenantId, tenantRole: role })
            applicationEvents(log).sendUserEvent({ tenantId, userId: user.id, ip }, {
                action: ApplicationEventName.TENANT_USER_ACCESS_CHANGED,
                data: { target: displayNameOf({ profile }), detail: `${role} (synced from ${policy.userProvider})` },
            })
        }
    }
    if (ssoProfile.hasEmail(profile)) {
        await userInvitationsService(log).provisionUserInvitation({ email: profile.email })
    }
}

async function createUser({ log, policy, profile, tenantId, binding, ip }: CreateUserParams): Promise<ResolvedUser> {
    const prebindRole = isNil(binding) || !isNil(binding.userId) ? null : binding.prebindRole
    const invited = ssoProfile.hasEmail(profile) && await userInvitationsService(log).hasAnyAcceptedInvitations({ tenantId, email: profile.email })
    if (isNil(prebindRole) && !policy.autoCreateUsers && !invited) {
        throw new SsoLoginError({
            code: SsoLoginErrorCode.USER_NOT_PROVISIONED,
            detail: `No account exists for ${displayNameOf({ profile })} in this tenant and automatic account creation is off`,
        })
    }
    const identity = await ensureIdentity({ log, policy, profile })
    const created = await userService(log).getOrCreateWithProject({ identity, tenantId })
    const role = prebindRole ?? ssoProfile.resolveRole({ groups: profile.groups, roleMapping: policy.roleMapping, defaultRole: policy.defaultRole })
    if (role !== created.tenantRole) {
        await userService(log).update({ id: created.id, tenantId, tenantRole: role })
    }
    if (!isNil(policy.defaultProject)) {
        await projectMemberService(log).upsert({ projectId: policy.defaultProject.projectId, userId: created.id, role: policy.defaultProject.role })
    }
    if (ssoProfile.hasEmail(profile)) {
        await userInvitationsService(log).provisionUserInvitation({ email: profile.email })
    }
    applicationEvents(log).sendUserEvent({ tenantId, userId: created.id, ip }, {
        action: ApplicationEventName.USER_SIGNED_UP,
        data: { source: 'sso' },
    })
    const bound = await bindUser({ log, policy, profile, tenantId, identityId: identity.id, userId: created.id })
    return { userId: created.id, externalIdentityId: bound.id }
}

async function ensureIdentity({ log, policy, profile }: EnsureIdentityParams): Promise<UserIdentity> {
    const byEmail = policy.matchBy === SsoMatchBy.EMAIL && ssoProfile.hasEmail(profile)
    const existing = byEmail ? await userIdentityService(log).getIdentityByEmail(profile.email) : null
    if (!isNil(existing)) {
        return existing.verified ? existing : userIdentityService(log).verifyAndDiscardPassword(existing.id)
    }
    const split = signupNames.splitFullName({ fullName: profile.fullName.length > 0 ? profile.fullName : profile.subject.slice(0, MAX_FALLBACK_NAME), email: profile.email })
    return userIdentityService(log).create({
        email: byEmail ? profile.email : null,
        contactEmail: byEmail || !ssoProfile.hasEmail(profile) ? null : profile.email,
        password: await cryptoUtils.generateRandomPassword(),
        firstName: profile.givenName.length > 0 ? profile.givenName : split.firstName,
        lastName: profile.familyName.length > 0 ? profile.familyName : split.lastName,
        trackEvents: false,
        newsLetter: false,
        provider: policy.userProvider,
        verified: true,
    })
}

async function bindUser({ log, policy, profile, tenantId, identityId, userId }: BindUserParams): Promise<ExternalIdentityRecord> {
    return externalIdentityService(log).bindToUser({
        tenantId,
        issuer: policy.issuer,
        subject: profile.subject,
        identityId,
        userId,
        email: profile.email,
        displayName: displayNameOf({ profile }),
    })
}

function assertBindingUsable({ binding, tenantId }: { binding: ExternalIdentityRecord | null, tenantId: string }): void {
    if (isNil(binding)) {
        return
    }
    if (binding.tenantId !== tenantId) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED, detail: 'This account belongs to a different tenant' })
    }
    if (binding.status === ExternalIdentityStatus.REVOKED) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.USER_DISABLED, detail: 'This account was removed at the identity provider' })
    }
}

function displayNameOf({ profile }: { profile: SsoProfile }): string {
    if (profile.fullName.length > 0) {
        return profile.fullName
    }
    return profile.email.length > 0 ? profile.email : profile.subject
}

const MAX_FALLBACK_NAME = 20

export const ssoUserResolver = {
    resolve,
    assertProfileAllowed,
    ensureIdentity,
    bindUser,
    assertBindingUsable,
    displayNameOf,
}

export type ResolvedUser = {
    userId: string
    externalIdentityId: string
}

type ResolveParams = {
    log: FastifyBaseLogger
    policy: RuntimePolicy
    profile: SsoProfile
    tenantId: string
    binding: ExternalIdentityRecord | null
    ip: string | undefined
}

type AssertProfileAllowedParams = {
    log: FastifyBaseLogger
    policy: RuntimePolicy
    profile: SsoProfile
    tenantId: string
    binding: ExternalIdentityRecord | null
}

type LoadBoundUserParams = {
    log: FastifyBaseLogger
    binding: ExternalIdentityRecord | null
    tenantId: string
}

type MatchByEmailParams = {
    log: FastifyBaseLogger
    policy: RuntimePolicy
    profile: SsoProfile
    tenantId: string
}

type EmailMatch = {
    identity: UserIdentity
    user: User
}

type SignInUserParams = {
    log: FastifyBaseLogger
    user: User
    policy: RuntimePolicy
    profile: SsoProfile
    tenantId: string
    ip: string | undefined
}

type CreateUserParams = ResolveParams

type EnsureIdentityParams = {
    log: FastifyBaseLogger
    policy: RuntimePolicy
    profile: SsoProfile
}

type BindUserParams = {
    log: FastifyBaseLogger
    policy: RuntimePolicy
    profile: SsoProfile
    tenantId: string
    identityId: string
    userId: string
}

