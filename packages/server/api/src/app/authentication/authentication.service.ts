import { assertNotNullOrUndefined, ErrorCode, isNil, PlatformError } from '@fema/core-utils'
import { cryptoUtils } from '@fema/server-utils'
import { ApFlagId, AuthenticationResponse, PlatformWithoutSensitiveData, User, UserIdentity, UserIdentityProvider } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { flagService } from '../flags/flag.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { platformService } from '../platform/platform.service'
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
        const platformId = params.platformId

        if (!isNil(platformId)) {
            await authenticationUtils(log).assertEmailAuthIsEnabled({
                platformId,
                provider: params.provider,
            })
            await authenticationUtils(log).assertDomainIsAllowed({
                email: params.email,
                platformId,
            })
            if (system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) !== 'true') {
                await authenticationUtils(log).assertUserIsInvitedToPlatformOrWorkspace({
                    email: params.email,
                    platformId,
                })
            }
            const userIdentity = await userIdentityService(log).create({
                ...params,
                verified: true,
            })
            const user = await userService(log).getOrCreateWithWorkspace({
                identity: userIdentity,
                platformId,
            })
            await userInvitationsService(log).provisionUserInvitation({ email: params.email })

            log.info({ email: params.email, platform: { id: platformId } }, 'User signed up to existing platform')
            return authenticationUtils(log).getWorkspaceAndToken({
                userId: user.id,
                platformId,
                workspaceId: null,
            })
        }

        const hasInvitations = await userInvitationsService(log).hasAnyAcceptedInvitationsForEmail({ email: params.email })
        const isFederatedProvider = params.provider === UserIdentityProvider.GOOGLE || params.provider === UserIdentityProvider.JWT || params.provider === UserIdentityProvider.SAML
        const userIdentity = await userIdentityService(log).create({
            ...params,
            verified: hasInvitations || isFederatedProvider,
        })
        await sendVerificationOrAutoVerify(userIdentity, log)
        await flagService(log).save({ id: ApFlagId.USER_CREATED, value: true })
        await authenticationUtils(log).saveNewsLetterSubscriber(userIdentity)
        await userInvitationsService(log).provisionUserInvitation({ email: params.email })

        const preferredPlatformId = await getPreferredPlatformId(userIdentity.id, log)
        if (!isNil(preferredPlatformId)) {
            const user = await userService(log).getOrCreateWithWorkspace({
                identity: userIdentity,
                platformId: preferredPlatformId,
            })
            log.info({ email: params.email, provider: params.provider, preferredPlatformId }, 'User signed up with invitation, returning preferred platform token')
            const authResponse =  await authenticationUtils(log).getWorkspaceAndToken({
                userId: user.id,
                platformId: preferredPlatformId,
                workspaceId: null,
            })
            await authenticationUtils(log).sendTelemetry({ identity: userIdentity, user, workspaceId: authResponse.workspaceId ?? '' })
            return authResponse
        }
        log.info({ email: params.email, provider: params.provider }, 'User signed up without platform')
        return authenticationUtils(log).getOnboardingResponse({ identityId: userIdentity.id })

    },
    async signInWithPassword(params: SignInWithPasswordParams): Promise<AuthenticationResponse> {
        const identity = await userIdentityService(log).verifyIdentityPassword(params)
        const platformId = isNil(params.predefinedPlatformId) ? await getPreferredPlatformId(identity.id, log) : params.predefinedPlatformId

        if (isNil(platformId)) { // always cloud
            log.info({ email: params.email }, 'User signed in without an active platform on cloud, returning onboarding token')
            return authenticationUtils(log).getOnboardingResponse({ identityId: identity.id })
        }

        await authenticationUtils(log).assertEmailAuthIsEnabled({
            platformId,
            provider: UserIdentityProvider.EMAIL,
        })
        await authenticationUtils(log).assertDomainIsAllowed({
            email: params.email,
            platformId,
        })
        const user = await userService(log).getOneByIdentityAndPlatform({
            identityId: identity.id,
            platformId,
        })
        assertNotNullOrUndefined(user, 'User not found')
        log.info({ email: params.email, platform: { id: platformId } }, 'User signed in with password')
        return authenticationUtils(log).getWorkspaceAndToken({
            userId: user.id,
            platformId,
            workspaceId: null,
        })
    },
    async resolvePreferredPlatformId({ identityId }: ResolvePreferredPlatformIdParams): Promise<string | null> {
        return getPreferredPlatformId(identityId, log)
    },
    async federatedAuthn(params: FederatedAuthnParams): Promise<AuthenticationResponse> {
        const platformId = isNil(params.predefinedPlatformId) ? await getPreferredPlatformIdForFederatedAuthn(params.email, log) : params.predefinedPlatformId
        const userIdentity = await userIdentityService(log).getIdentityByEmail(params.email)

        if (isNil(platformId)) { // always cloud
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
                platformId: null,
                password: await cryptoUtils.generateRandomPassword(),
                imageUrl: params.imageUrl,
            })
        }

        if (params.provider == UserIdentityProvider.SAML) {
            await authenticationUtils(log).assertEmailMatchesSsoDomain({
                email: params.email,
                platformId,
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
                platformId,
                password: await cryptoUtils.generateRandomPassword(),
                imageUrl: params.imageUrl,
            })
        }
        const user = await userService(log).getOrCreateWithWorkspace({
            identity: userIdentity,
            platformId,
        })
        await userInvitationsService(log).provisionUserInvitation({ email: params.email })
        return authenticationUtils(log).getWorkspaceAndToken({
            userId: user.id,
            platformId,
            workspaceId: null,
        })
    },
    async switchPlatform(params: SwitchPlatformParams): Promise<AuthenticationResponse> {
        const platforms = await platformService(log).listPlatformsForIdentityWithAtleastWorkspace({ identityId: params.identityId })
        const platform = platforms.find((platform) => platform.id === params.platformId)
        await assertUserCanSwitchToPlatform(platform)

        assertNotNullOrUndefined(platform, 'Platform not found')
        const user = await getUserForPlatform(params.identityId, platform, log)
        log.info({ user: { id: user.id }, platform: { id: platform.id } }, 'User switched platform')
        return authenticationUtils(log).getWorkspaceAndToken({
            userId: user.id,
            platformId: platform.id,
            workspaceId: null,
        })
    },
})

async function assertUserCanSwitchToPlatform(platform: PlatformWithoutSensitiveData | undefined): Promise<void> {
    if (isNil(platform)) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'The user is not a member of the platform',
            },
        })
    }
}

async function getUserForPlatform(identityId: string, platform: PlatformWithoutSensitiveData, log: FastifyBaseLogger): Promise<User> {
    const user = await userService(log).getOneByIdentityAndPlatform({
        identityId,
        platformId: platform.id,
    })
    if (isNil(user)) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User is not member of the platform',
            },
        })
    }
    return user
}

async function sendVerificationOrAutoVerify(userIdentity: UserIdentity, log: FastifyBaseLogger): Promise<void> {
    await userIdentityService(log).verify(userIdentity.id)
}

async function getPreferredPlatformIdForFederatedAuthn(email: string, log: FastifyBaseLogger): Promise<string | null> {
    const identity = await userIdentityService(log).getIdentityByEmail(email)
    if (isNil(identity)) {
        return null
    }
    return getPreferredPlatformId(identity.id, log)
}

async function getPreferredPlatformId(_identityId: string, _log: FastifyBaseLogger): Promise<string | null> {
    return null
}



type ResolvePreferredPlatformIdParams = {
    identityId: string
}

type FederatedAuthnParams = {
    email: string
    firstName: string
    lastName: string
    newsLetter: boolean
    trackEvents: boolean
    provider: UserIdentityProvider
    predefinedPlatformId: string | null
    imageUrl?: string
}

type SignUpParams = {
    email: string
    firstName: string
    lastName: string
    password: string
    platformId: string | null
    trackEvents: boolean
    newsLetter: boolean
    provider: UserIdentityProvider
    imageUrl?: string
}

type SignInWithPasswordParams = {
    email: string
    password: string
    predefinedPlatformId: string | null
}

type SwitchPlatformParams = {
    identityId: string
    platformId: string
}
