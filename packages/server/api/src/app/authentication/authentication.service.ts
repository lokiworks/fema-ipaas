import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import { AuthenticationResponse, FlagId, TenantWithoutSensitiveData, User, UserIdentity, UserIdentityProvider } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { flagService } from '../flags/flag.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { authenticationUtils } from './authentication-utils'
import { disposableEmail } from './lib/disposable-email'
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
            return authenticationUtils(log).getProjectAndToken({
                userId: user.id,
                tenantId,
                projectId: null,
            })
        }

        const hasInvitations = await userInvitationsService(log).hasAnyAcceptedInvitationsForEmail({ email: params.email })
        const isFederatedProvider = params.provider === UserIdentityProvider.GOOGLE || params.provider === UserIdentityProvider.JWT || params.provider === UserIdentityProvider.SAML
        const userIdentity = await userIdentityService(log).create({
            ...params,
            verified: hasInvitations || isFederatedProvider,
        })
        await sendVerificationOrAutoVerify(userIdentity, log)
        await flagService(log).save({ id: FlagId.USER_CREATED, value: true })
        await authenticationUtils(log).saveNewsLetterSubscriber(userIdentity)
        await userInvitationsService(log).provisionUserInvitation({ email: params.email })

        const preferredTenantId = await getPreferredTenantId(userIdentity.id, log)
        if (!isNil(preferredTenantId)) {
            const user = await userService(log).getOrCreateWithProject({
                identity: userIdentity,
                tenantId: preferredTenantId,
            })
            log.info({ email: params.email, provider: params.provider, preferredTenantId }, 'User signed up with invitation, returning preferred tenant token')
            const authResponse =  await authenticationUtils(log).getProjectAndToken({
                userId: user.id,
                tenantId: preferredTenantId,
                projectId: null,
            })
            await authenticationUtils(log).sendTelemetry({ identity: userIdentity, user, projectId: authResponse.projectId ?? '' })
            return authResponse
        }
        log.info({ email: params.email, provider: params.provider }, 'User signed up without tenant')
        return authenticationUtils(log).getOnboardingResponse({ identityId: userIdentity.id })

    },
    async signInWithPassword(params: SignInWithPasswordParams): Promise<AuthenticationResponse> {
        const identity = await userIdentityService(log).verifyIdentityPassword(params)
        const tenantId = isNil(params.predefinedTenantId) ? await getPreferredTenantId(identity.id, log) : params.predefinedTenantId

        if (isNil(tenantId)) { // always cloud
            log.info({ email: params.email }, 'User signed in without an active tenant on cloud, returning onboarding token')
            return authenticationUtils(log).getOnboardingResponse({ identityId: identity.id })
        }

        await authenticationUtils(log).assertEmailAuthIsEnabled({
            tenantId,
            provider: UserIdentityProvider.EMAIL,
        })
        await authenticationUtils(log).assertDomainIsAllowed({
            email: params.email,
            tenantId,
        })
        const user = await userService(log).getOneByIdentityAndTenant({
            identityId: identity.id,
            tenantId,
        })
        assertNotNullOrUndefined(user, 'User not found')
        log.info({ email: params.email, tenant: { id: tenantId } }, 'User signed in with password')
        return authenticationUtils(log).getProjectAndToken({
            userId: user.id,
            tenantId,
            projectId: null,
        })
    },
    async resolvePreferredTenantId({ identityId }: ResolvePreferredTenantIdParams): Promise<string | null> {
        return getPreferredTenantId(identityId, log)
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
        const tenants = await tenantService(log).listTenantsForIdentityWithAtleastProject({ identityId: params.identityId })
        const tenant = tenants.find((tenant) => tenant.id === params.tenantId)
        await assertUserCanSwitchToTenant(tenant)

        assertNotNullOrUndefined(tenant, 'Tenant not found')
        const user = await getUserForTenant(params.identityId, tenant, log)
        log.info({ user: { id: user.id }, tenant: { id: tenant.id } }, 'User switched tenant')
        return authenticationUtils(log).getProjectAndToken({
            userId: user.id,
            tenantId: tenant.id,
            projectId: null,
        })
    },
})

async function assertUserCanSwitchToTenant(tenant: TenantWithoutSensitiveData | undefined): Promise<void> {
    if (isNil(tenant)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'The user is not a member of the tenant',
            },
        })
    }
}

async function getUserForTenant(identityId: string, tenant: TenantWithoutSensitiveData, log: FastifyBaseLogger): Promise<User> {
    const user = await userService(log).getOneByIdentityAndTenant({
        identityId,
        tenantId: tenant.id,
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



type ResolvePreferredTenantIdParams = {
    identityId: string
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
