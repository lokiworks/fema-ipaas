import { assertNotNullOrUndefined, ErrorCode, isNil, PlatformError } from '@fema/core-utils'
import { ApEnvironment, AuthenticationResponse, EndpointScope, PlatformRole, PrincipalType, TelemetryEventName, User, UserIdentity, UserIdentityProvider, UserStatus, Workspace, WorkspaceType } from '@fema/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { telemetry } from '../helper/telemetry.utils'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { workspaceService } from '../workspace/workspace-service'
import { accessTokenManager } from './lib/access-token-manager'
import { userIdentityService } from './user-identity/user-identity-service'

export const authenticationUtils = (log: FastifyBaseLogger) => ({
    async assertUserIsInvitedToPlatformOrWorkspace({
        email,
        platformId,
    }: AssertUserIsInvitedToPlatformOrWorkspaceParams): Promise<void> {
        const isInvited = await userInvitationsService(log).hasAnyAcceptedInvitations({
            platformId,
            email,

        })
        if (!isInvited) {
            throw new PlatformError({
                code: ErrorCode.INVITATION_ONLY_SIGN_UP,
                params: {
                    message: 'User is not invited to the platform',
                },
            })
        }
    },

    async getWorkspaceAndToken(params: GetWorkspaceAndTokenParams): Promise<AuthenticationResponse> {
        const user = await userService(log).getOneOrFail({ id: params.userId })
        const workspaces = await workspaceService(log).getAllForUser({
            platformId: params.platformId,
            userId: params.userId,
            isPrivileged: userService(log).isUserPrivileged(user),
        })
        const workspace = isNil(params.workspaceId)
            ? findPersonalWorkspace(workspaces, params.userId) ?? workspaces?.[0]
            : workspaces.find((workspace) => workspace.id === params.workspaceId)
        if (isNil(workspace)) {
            throw new PlatformError({
                code: ErrorCode.INVITATION_ONLY_SIGN_UP,
                params: {
                    message: 'No workspace found for user',
                },
            })
        }
        const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
        if (!identity.verified) {
            throw new PlatformError({
                code: ErrorCode.EMAIL_IS_NOT_VERIFIED,
                params: {
                    email: identity.email,
                },
            })
        }
        if (user.status === UserStatus.INACTIVE) {
            throw new PlatformError({
                code: ErrorCode.USER_IS_INACTIVE,
                params: {
                    email: identity.email,
                },
            })
        }
        const token = await accessTokenManager(log).generateToken({
            id: user.id,
            type: PrincipalType.USER,
            platform: {
                id: params.platformId,
            },
            tokenVersion: identity.tokenVersion,
        })
        return {
            ...user,
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: identity.email,
            trackEvents: identity.trackEvents,
            newsLetter: identity.newsLetter,
            verified: identity.verified,
            token,
            workspaceId: workspace.id,
        }
    },

    async getOnboardingResponse({ identityId }: GetOnboardingResponseParams): Promise<AuthenticationResponse> {
        const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
        if (!identity.verified) {
            throw new PlatformError({
                code: ErrorCode.EMAIL_IS_NOT_VERIFIED,
                params: {
                    email: identity.email,
                },
            })
        }

        const token = await accessTokenManager(log).generateToken({
            id: identity.id,
            type: PrincipalType.ONBOARDING,
            tokenVersion: identity.tokenVersion,
        })
        return {
            id: identity.id,
            platformId: null,
            platformRole: PlatformRole.ADMIN,
            status: UserStatus.ACTIVE,
            externalId: null,
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: identity.email,
            trackEvents: identity.trackEvents,
            newsLetter: identity.newsLetter,
            verified: identity.verified,
            token,
            workspaceId: null,
        }
    },

    async assertDomainIsAllowed(_params: AssertDomainIsAllowedParams): Promise<void> {
        return
    },

    async assertEmailMatchesSsoDomain(_params: AssertEmailMatchesSsoDomainParams): Promise<void> {
        return
    },

    async assertEmailAuthIsEnabled(_params: AssertEmailAuthIsEnabledParams): Promise<void> {
        return
    },

    async sendTelemetry({
        user,
        identity,
        workspaceId,
    }: SendTelemetryParams): Promise<void> {
        try {
            await telemetry(log).identify(identity, user)
            await telemetry(log).trackWorkspace(workspaceId, {
                name: TelemetryEventName.SIGNED_UP,
                payload: {
                    userId: user.id,
                    workspaceId,
                },
            })
        }
        catch (e) {
            log.warn({ error: e }, '[authenticationUtils#sendTelemetry] Failed to send telemetry')
        }
    },

    async saveNewsLetterSubscriber(identity: UserIdentity): Promise<void> {
        const environment = system.get(AppSystemProp.ENVIRONMENT)
        if (environment !== ApEnvironment.PRODUCTION) {
            return
        }
        try {
            const response = await fetch(
                'https://us-central1-fema-b3803.cloudfunctions.net/addContact',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: identity.email }),
                },
            )
            await response.json()
        }
        catch (error) {
            log.warn({ error }, '[authenticationUtils#saveNewsLetterSubscriber] Failed to save newsletter subscriber')
        }
    },
    async extractUserIdFromRequest(request: FastifyRequest): Promise<string> {
        if (request.principal.type === PrincipalType.USER) {
            return request.principal.id
        }
        // TODO currently it's same as api service, but it's better to get it from api key service, in case we introduced more admin users
        const workspaceId = request.principal.type === PrincipalType.ENGINE ? request.principal.workspaceId : request.workspaceId
        assertNotNullOrUndefined(workspaceId, 'workspaceId')
        const workspace = await workspaceService(log).getOneOrThrow(workspaceId)
        return workspace.ownerId
    },
})

function findPersonalWorkspace(workspaces: Workspace[], userId: string): Workspace | undefined {
    return workspaces.find((workspace) => workspace.ownerId === userId && workspace.type === WorkspaceType.PERSONAL)
}

type SendTelemetryParams = {
    identity: UserIdentity
    user: User
    workspaceId: string
}

type AssertDomainIsAllowedParams = {
    email: string
    platformId: string
}

type AssertEmailAuthIsEnabledParams = {
    platformId: string
    provider: UserIdentityProvider
}

type AssertEmailMatchesSsoDomainParams = {
    email: string
    platformId: string
}

type AssertUserIsInvitedToPlatformOrWorkspaceParams = {
    email: string
    platformId: string
}

type GetOnboardingResponseParams = {
    identityId: string
}

type GetWorkspaceAndTokenParams = {
    userId: string
    platformId: string
    workspaceId: string | null
    scope?: EndpointScope
}
