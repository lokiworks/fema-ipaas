import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import { AuthenticationResponse, FlagId, LOGIN_METHOD_LIMITS, TenantMembershipOption, TenantStatus, User, UserIdentity, UserIdentityProvider, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { flagService } from '../flags/flag.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { authenticationUtils } from './authentication-utils'
import { authTicket } from './lib/auth-ticket'
import { disposableEmail } from './lib/disposable-email'
import { tenantLookup } from './lib/tenant-lookup'
import { mfaService } from './mfa/mfa.service'
import { userIdentityService } from './user-identity/user-identity-service'

export const authenticationService = (log: FastifyBaseLogger) => ({
    async signUp(params: SignUpParams): Promise<AuthenticationResponse> {
        if (params.provider === UserIdentityProvider.EMAIL) {
            await disposableEmail.assertMaySignUp({ email: params.email, log })
        }
        const tenantId = params.tenantId

        if (!isNil(tenantId)) {
            await authenticationUtils(log).assertEmailAuthIsEnabled({
                tenantId,
                provider: params.provider,
            })
            await authenticationUtils(log).assertDomainIsAllowed({
                email: params.email,
                tenantId,
            })
            if (params.provider === UserIdentityProvider.EMAIL) {
                await authenticationUtils(log).assertPasswordMeetsPolicy({ password: params.password, tenantIds: [tenantId] })
            }
            if (system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) !== 'true') {
                await authenticationUtils(log).assertUserIsInvitedToTenantOrProject({
                    email: params.email,
                    tenantId,
                })
            }
            const userIdentity = await userIdentityService(log).create({
                ...params,
                verified: true,
            })
            const user = await userService(log).getOrCreateWithProject({
                identity: userIdentity,
                tenantId,
            })
            await userInvitationsService(log).provisionUserInvitation({ email: params.email })

            log.info({ email: params.email, tenant: { id: tenantId } }, 'User signed up to existing tenant')
            return issueSession({ log, identity: userIdentity, tenantId, userId: user.id })
        }

        const hasInvitations = await userInvitationsService(log).hasAnyAcceptedInvitationsForEmail({ email: params.email })
        if (!hasInvitations && system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) !== 'true') {
            await tenantService(log).assertOnboardingAllowed()
        }
        const isFederatedProvider = params.provider === UserIdentityProvider.GOOGLE || params.provider === UserIdentityProvider.JWT || params.provider === UserIdentityProvider.SAML
        const userIdentity = await userIdentityService(log).create({
            ...params,
            verified: hasInvitations || isFederatedProvider,
        })
        await sendVerificationOrAutoVerify(userIdentity, log)
        await flagService(log).save({ id: FlagId.USER_CREATED, value: true })
        await userInvitationsService(log).provisionUserInvitation({ email: params.email })

        const preferredTenantId = await getPreferredTenantId(userIdentity.id, log)
        if (!isNil(preferredTenantId)) {
            const user = await userService(log).getOrCreateWithProject({
                identity: userIdentity,
                tenantId: preferredTenantId,
            })
            log.info({ email: params.email, provider: params.provider, preferredTenantId }, 'User signed up with invitation, returning preferred tenant token')
            const authResponse = await issueSession({ log, identity: userIdentity, tenantId: preferredTenantId, userId: user.id })
            await authenticationUtils(log).sendTelemetry({ identity: userIdentity, user, projectId: authResponse.projectId ?? '' })
            return authResponse
        }
        log.info({ email: params.email, provider: params.provider }, 'User signed up without tenant')
        return authenticationUtils(log).getOnboardingResponse({ identityId: userIdentity.id })

    },
    async signInWithPassword(params: SignInWithPasswordParams): Promise<AuthenticationResponse> {
        if (!isNil(params.predefinedTenantId)) {
            await assertTenantAcceptsPasswordSignIn({ tenantId: params.predefinedTenantId, email: params.email, log })
        }
        const identity = await userIdentityService(log).verifyIdentityPassword(params)
        log.info({ identityId: identity.id, tenantId: params.predefinedTenantId }, 'User verified with password')
        return this.completeLogin({ identity, requestedTenantId: params.predefinedTenantId, method: LoginChannel.PASSWORD })
    },
    async completeLogin({ identity, requestedTenantId, method }: CompleteLoginParams): Promise<AuthenticationResponse> {
        const tenantId = isNil(requestedTenantId)
            ? await pickTenantForIdentity({ log, identity, method })
            : requestedTenantId
        if (isNil(tenantId)) {
            log.info({ identityId: identity.id }, 'User signed in without an active tenant, returning onboarding token')
            await mfaService(log).assertSessionMayStart({ identity, tenantId: null })
            return authenticationUtils(log).getOnboardingResponse({ identityId: identity.id })
        }
        await tenantLookup.assertActive({ tenantId })
        await assertLoginChannelAllowed({ log, identity, tenantId, method })
        const user = await userService(log).getOneByIdentityAndTenant({
            identityId: identity.id,
            tenantId,
        })
        assertNotNullOrUndefined(user, 'User not found')
        log.info({ identityId: identity.id, tenant: { id: tenantId } }, 'User signed in')
        return issueSession({ log, identity, tenantId, userId: user.id })
    },
    async completeAfterMfa({ identityId, tenantId }: CompleteAfterMfaParams): Promise<AuthenticationResponse> {
        if (isNil(tenantId)) {
            return authenticationUtils(log).getOnboardingResponse({ identityId })
        }
        const user = await userService(log).getOneByIdentityAndTenant({ identityId, tenantId })
        assertNotNullOrUndefined(user, 'User not found')
        return authenticationUtils(log).getProjectAndToken({
            userId: user.id,
            tenantId,
            projectId: null,
        })
    },
    async resolvePreferredTenantId({ identityId }: ResolvePreferredTenantIdParams): Promise<string | null> {
        return getPreferredTenantId(identityId, log)
    },
    async listSelectableTenants({ identityId }: ListSelectableTenantsParams): Promise<TenantMembershipOption[]> {
        const memberships = await userService(log).getByIdentityId({ identityId })
        const options = await Promise.all(memberships.map(async (membership): Promise<TenantMembershipOption | null> => {
            if (isNil(membership.tenantId) || membership.status === UserStatus.INACTIVE) {
                return null
            }
            const tenant = await tenantLookup.find({ tenantId: membership.tenantId })
            if (isNil(tenant) || tenant.status !== TenantStatus.ACTIVE) {
                return null
            }
            return {
                tenantId: tenant.id,
                slug: tenant.slug,
                name: tenant.name,
                logoIconUrl: tenant.logoIconUrl,
                role: membership.tenantRole,
                status: tenant.status,
            }
        }))
        return options.filter((option): option is TenantMembershipOption => !isNil(option))
    },
    async selectTenant({ selectionToken, tenantId }: SelectTenantParams): Promise<AuthenticationResponse> {
        const selection = await authTicket.consume<TenantSelection>({ purpose: SELECTION_PURPOSE, token: selectionToken })
        if (isNil(selection)) {
            throw new ApplicationError({
                code: ErrorCode.AUTHENTICATION,
                params: { message: 'The tenant selection has expired, sign in again' },
            })
        }
        const options = await this.listSelectableTenants({ identityId: selection.identityId })
        if (!options.some((option) => option.tenantId === tenantId)) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'The user is not a member of the tenant' },
            })
        }
        const identity = await userIdentityService(log).getOneOrFail({ id: selection.identityId })
        return this.completeLogin({ identity, requestedTenantId: tenantId, method: selection.method })
    },
    async readTenantSelection({ selectionToken }: ReadTenantSelectionParams): Promise<TenantSelection | null> {
        return authTicket.peek<TenantSelection>({ purpose: SELECTION_PURPOSE, token: selectionToken })
    },
    async federatedAuthn(params: FederatedAuthnParams): Promise<AuthenticationResponse> {
        const tenantId = isNil(params.predefinedTenantId) ? await getPreferredTenantIdForFederatedAuthn(params.email, log) : params.predefinedTenantId
        const userIdentity = await userIdentityService(log).getIdentityByEmail(params.email)

        if (isNil(tenantId)) { // always cloud
            if (!isNil(userIdentity)) {
                return authenticationUtils(log).getOnboardingResponse({ identityId: userIdentity.id })
            }
            return authenticationService(log).signUp({
                email: params.email,
                firstName: params.firstName,
                lastName: params.lastName,
                newsLetter: params.newsLetter,
                trackEvents: params.trackEvents,
                provider: params.provider,
                tenantId: null,
                password: await cryptoUtils.generateRandomPassword(),
                imageUrl: params.imageUrl,
            })
        }

        if (isNil(userIdentity)) {
            return authenticationService(log).signUp({
                email: params.email,
                firstName: params.firstName,
                lastName: params.lastName,
                newsLetter: params.newsLetter,
                trackEvents: params.trackEvents,
                provider: params.provider,
                tenantId,
                password: await cryptoUtils.generateRandomPassword(),
                imageUrl: params.imageUrl,
            })
        }
        const user = await userService(log).getOrCreateWithProject({
            identity: userIdentity,
            tenantId,
        })
        await userInvitationsService(log).provisionUserInvitation({ email: params.email })
        return authenticationUtils(log).getProjectAndToken({
            userId: user.id,
            tenantId,
            projectId: null,
        })
    },
    async switchTenant(params: SwitchTenantParams): Promise<AuthenticationResponse> {
        await tenantLookup.assertActive({ tenantId: params.tenantId })
        const tenants = await tenantService(log).listTenantsForIdentityWithAtleastProject({ identityId: params.identityId })
        const tenant = tenants.find((tenant) => tenant.id === params.tenantId)
        await assertUserCanSwitchToTenant(tenant)

        assertNotNullOrUndefined(tenant, 'Tenant not found')
        const user = await getUserForTenant(params.identityId, tenant.id, log)
        log.info({ user: { id: user.id }, tenant: { id: tenant.id } }, 'User switched tenant')
        return authenticationUtils(log).getProjectAndToken({
            userId: user.id,
            tenantId: tenant.id,
            projectId: null,
        })
    },
})

async function issueSession({ log, identity, tenantId, userId }: IssueSessionParams): Promise<AuthenticationResponse> {
    await mfaService(log).assertSessionMayStart({ identity, tenantId })
    return authenticationUtils(log).getProjectAndToken({
        userId,
        tenantId,
        projectId: null,
    })
}

async function pickTenantForIdentity({ log, identity, method }: PickTenantParams): Promise<string | null> {
    const memberships = await userService(log).getByIdentityId({ identityId: identity.id })
    const activeMemberships = memberships.filter((membership) => !isNil(membership.tenantId) && membership.status !== UserStatus.INACTIVE)
    if (activeMemberships.length === 0) {
        return null
    }
    const candidates = await Promise.all(activeMemberships.map(async (membership) => {
        const tenantId = membership.tenantId ?? ''
        const { error } = await tryCatch(async () => {
            await tenantLookup.assertActive({ tenantId })
            await assertLoginChannelAllowed({ log, identity, tenantId, method })
        })
        return { tenantId, error }
    }))
    const allowed = candidates.filter((candidate) => isNil(candidate.error))
    if (allowed.length === 0) {
        throw candidates[0].error
    }
    if (allowed.length === 1) {
        return allowed[0].tenantId
    }
    const selectionToken = await authTicket.issue<TenantSelection>({
        purpose: SELECTION_PURPOSE,
        payload: { identityId: identity.id, method },
        ttlSeconds: LOGIN_METHOD_LIMITS.selectionTokenTtlSeconds,
    })
    throw new ApplicationError({
        code: ErrorCode.TENANT_SELECTION_REQUIRED,
        params: { selectionToken },
    })
}

async function assertLoginChannelAllowed({ log, identity, tenantId, method }: LoginChannelParams): Promise<void> {
    if (method === LoginChannel.SMS) {
        const tenant = await tenantLookup.findOrFail({ tenantId })
        if (!tenant.phoneAuthEnabled) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Phone sign-in is disabled for this tenant' },
            })
        }
        return
    }
    await assertTenantAcceptsPasswordSignIn({ tenantId, email: identity.email ?? '', log })
}

async function assertTenantAcceptsPasswordSignIn({ tenantId, email, log }: AssertTenantAcceptsPasswordParams): Promise<void> {
    await authenticationUtils(log).assertEmailAuthIsEnabled({ tenantId, provider: UserIdentityProvider.EMAIL })
    await authenticationUtils(log).assertDomainIsAllowed({ email, tenantId })
}

async function assertUserCanSwitchToTenant(tenant: unknown): Promise<void> {
    if (isNil(tenant)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'The user is not a member of the tenant',
            },
        })
    }
}

async function getUserForTenant(identityId: string, tenantId: string, log: FastifyBaseLogger): Promise<User> {
    const user = await userService(log).getOneByIdentityAndTenant({
        identityId,
        tenantId,
    })
    if (isNil(user)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User is not member of the tenant',
            },
        })
    }
    return user
}

async function sendVerificationOrAutoVerify(userIdentity: UserIdentity, log: FastifyBaseLogger): Promise<void> {
    await userIdentityService(log).verify(userIdentity.id)
}

async function getPreferredTenantIdForFederatedAuthn(email: string, log: FastifyBaseLogger): Promise<string | null> {
    const identity = await userIdentityService(log).getIdentityByEmail(email)
    if (isNil(identity)) {
        return null
    }
    return getPreferredTenantId(identity.id, log)
}

async function getPreferredTenantId(_identityId: string, _log: FastifyBaseLogger): Promise<string | null> {
    return null
}

const SELECTION_PURPOSE = 'tenant-selection'

export enum LoginChannel {
    PASSWORD = 'PASSWORD',
    EMAIL_CODE = 'EMAIL_CODE',
    SMS = 'SMS',
}

export type TenantSelection = {
    identityId: string
    method: LoginChannel
}

type AssertTenantAcceptsPasswordParams = {
    tenantId: string
    email: string
    log: FastifyBaseLogger
}

type ResolvePreferredTenantIdParams = {
    identityId: string
}

type ListSelectableTenantsParams = {
    identityId: string
}

type SelectTenantParams = {
    selectionToken: string
    tenantId: string
}

type ReadTenantSelectionParams = {
    selectionToken: string
}

type CompleteLoginParams = {
    identity: UserIdentity
    requestedTenantId: string | null
    method: LoginChannel
}

type CompleteAfterMfaParams = {
    identityId: string
    tenantId: string | null
}

type IssueSessionParams = {
    log: FastifyBaseLogger
    identity: UserIdentity
    tenantId: string
    userId: string
}

type PickTenantParams = {
    log: FastifyBaseLogger
    identity: UserIdentity
    method: LoginChannel
}

type LoginChannelParams = PickTenantParams & {
    tenantId: string
}

type FederatedAuthnParams = {
    email: string
    firstName: string
    lastName: string
    newsLetter: boolean
    trackEvents: boolean
    provider: UserIdentityProvider
    predefinedTenantId: string | null
    imageUrl?: string
}

type SignUpParams = {
    email: string
    firstName: string
    lastName: string
    password: string
    tenantId: string | null
    trackEvents: boolean
    newsLetter: boolean
    provider: UserIdentityProvider
    imageUrl?: string
}

type SignInWithPasswordParams = {
    email: string
    password: string
    predefinedTenantId: string | null
}

type SwitchTenantParams = {
    identityId: string
    tenantId: string
}
