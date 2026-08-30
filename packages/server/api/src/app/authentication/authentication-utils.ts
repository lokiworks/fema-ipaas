import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { AuthenticationResponse, EndpointScope, PrincipalType, Project, ProjectType, RuntimeEnvironment, TelemetryEventName, Tenant, TenantRole, User, UserIdentity, UserIdentityProvider, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { telemetry } from '../helper/telemetry.utils'
import { projectService } from '../project/project-service'
import { TenantEntity } from '../tenant/tenant.entity'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { accessTokenManager } from './lib/access-token-manager'
import { userIdentityService } from './user-identity/user-identity-service'

// Its own repo rather than tenantService: tenant.service imports these helpers, and the cycle
// would leave one of the two modules half-initialised at require time.
const tenantRepo = repoFactory<Tenant>(TenantEntity)

export function isDomainAllowed({ email, enforce, allowedDomains }: IsDomainAllowedParams): boolean {
    if (!enforce) {
        return true
    }
    const domain = domainOf(email)
    if (isNil(domain)) {
        return false
    }
    return allowedDomains.some((allowedDomain) => allowedDomain.trim().toLowerCase() === domain)
}

function domainOf(email: string): string | null {
    const parts = email.trim().toLowerCase().split('@')
    if (parts.length !== 2 || parts[1].length === 0) {
        return null
    }
    return parts[1]
}

export const authenticationUtils = (log: FastifyBaseLogger) => ({
    async assertUserIsInvitedToTenantOrProject({
        email,
        tenantId,
    }: AssertUserIsInvitedToTenantOrProjectParams): Promise<void> {
        const isInvited = await userInvitationsService(log).hasAnyAcceptedInvitations({
            tenantId,
            email,

        })
        if (!isInvited) {
            throw new ApplicationError({
                code: ErrorCode.INVITATION_ONLY_SIGN_UP,
                params: {
                    message: 'User is not invited to the tenant',
                },
            })
        }
    },

    async getProjectAndToken(params: GetProjectAndTokenParams): Promise<AuthenticationResponse> {
        const user = await userService(log).getOneOrFail({ id: params.userId })
        const projects = await projectService(log).getAllForUser({
            tenantId: params.tenantId,
            userId: params.userId,
            isPrivileged: userService(log).isUserPrivileged(user),
        })
        const project = isNil(params.projectId)
            ? findPersonalProject(projects, params.userId) ?? projects?.[0]
            : projects.find((project) => project.id === params.projectId)
        if (isNil(project)) {
            throw new ApplicationError({
                code: ErrorCode.INVITATION_ONLY_SIGN_UP,
                params: {
                    message: 'No project found for user',
                },
            })
        }
        const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
        if (!identity.verified) {
            throw new ApplicationError({
                code: ErrorCode.EMAIL_IS_NOT_VERIFIED,
                params: {
                    email: identity.email,
                },
            })
        }
        if (user.status === UserStatus.INACTIVE) {
            throw new ApplicationError({
                code: ErrorCode.USER_IS_INACTIVE,
                params: {
                    email: identity.email,
                },
            })
        }
        const token = await accessTokenManager(log).generateToken({
            id: user.id,
            type: PrincipalType.USER,
            tenant: {
                id: params.tenantId,
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
            projectId: project.id,
        }
    },

    async getOnboardingResponse({ identityId }: GetOnboardingResponseParams): Promise<AuthenticationResponse> {
        const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
        if (!identity.verified) {
            throw new ApplicationError({
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
            tenantId: null,
            tenantRole: TenantRole.ADMIN,
            status: UserStatus.ACTIVE,
            externalId: null,
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: identity.email,
            trackEvents: identity.trackEvents,
            newsLetter: identity.newsLetter,
            verified: identity.verified,
            token,
            projectId: null,
        }
    },

    async assertDomainIsAllowed({ email, tenantId }: AssertDomainIsAllowedParams): Promise<void> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        if (isDomainAllowed({ email, enforce: tenant.enforceAllowedAuthDomains, allowedDomains: tenant.allowedAuthDomains })) {
            return
        }
        throw new ApplicationError({
            code: ErrorCode.DOMAIN_NOT_ALLOWED,
            params: { domain: domainOf(email) ?? email },
        })
    },

    async assertEmailAuthIsEnabled({ tenantId, provider }: AssertEmailAuthIsEnabledParams): Promise<void> {
        if (provider !== UserIdentityProvider.EMAIL) {
            return
        }
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        if (!tenant.emailAuthEnabled) {
            throw new ApplicationError({
                code: ErrorCode.EMAIL_AUTH_DISABLED,
                params: {},
            })
        }
    },

    async sendTelemetry({
        user,
        identity,
        projectId,
    }: SendTelemetryParams): Promise<void> {
        try {
            await telemetry(log).identify(identity, user)
            await telemetry(log).trackProject(projectId, {
                name: TelemetryEventName.SIGNED_UP,
                payload: {
                    userId: user.id,
                    projectId,
                },
            })
        }
        catch (e) {
            log.warn({ error: e }, '[authenticationUtils#sendTelemetry] Failed to send telemetry')
        }
    },

    async saveNewsLetterSubscriber(identity: UserIdentity): Promise<void> {
        const environment = system.get(AppSystemProp.ENVIRONMENT)
        if (environment !== RuntimeEnvironment.PRODUCTION) {
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
        const projectId = request.principal.type === PrincipalType.ENGINE ? request.principal.projectId : request.projectId
        assertNotNullOrUndefined(projectId, 'projectId')
        const project = await projectService(log).getOneOrThrow(projectId)
        return project.ownerId
    },
})

function findPersonalProject(projects: Project[], userId: string): Project | undefined {
    return projects.find((project) => project.ownerId === userId && project.type === ProjectType.PERSONAL)
}

type SendTelemetryParams = {
    identity: UserIdentity
    user: User
    projectId: string
}

type IsDomainAllowedParams = {
    email: string
    enforce: boolean
    allowedDomains: string[]
}

type AssertDomainIsAllowedParams = {
    email: string
    tenantId: string
}

type AssertEmailAuthIsEnabledParams = {
    tenantId: string
    provider: UserIdentityProvider
}

type AssertUserIsInvitedToTenantOrProjectParams = {
    email: string
    tenantId: string
}

type GetOnboardingResponseParams = {
    identityId: string
}

type GetProjectAndTokenParams = {
    userId: string
    tenantId: string
    projectId: string | null
    scope?: EndpointScope
}
