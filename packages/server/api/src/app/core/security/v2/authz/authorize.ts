import { ErrorCode, isNil, PlatformError } from '@fema/core-utils'
import { PlatformRole, Principal, PrincipalType, UserIdentityProvider } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../../../authentication/user-identity/user-identity-service'
import { userService } from '../../../../user/user-service'
import { workspaceAccess } from '../../../../workspace/workspace-access'
import { AuthorizationRouteSecurity, WorkspaceAuthorizationConfig } from '../../authorization/authorization'
import { AuthorizationType, RouteKind } from '../../authorization/common'

export const authorizeOrThrow = async (principal: Principal, security: AuthorizationRouteSecurity, log: FastifyBaseLogger): Promise<void> => {
    if (security.kind === RouteKind.PUBLIC) {
        return
    }
    switch (security.authorization.type) {
        case AuthorizationType.WORKSPACE:
            await assertPrinicpalIsOneOf(security.authorization.allowedPrincipals, principal.type)
            await assertAccessToWorkspace(principal, security.authorization, log)
            break
        case AuthorizationType.PLATFORM:
            await assertPrinicpalIsOneOf(security.authorization.allowedPrincipals, principal.type)
            if (security.authorization.adminOnly) {
                await assertPlatformIsOwnedByCurrentPrincipal(principal, log)
            }
            if (security.authorization.nonEmbedUsersOnly) {
                await assertNonEmbedOrAdmin(principal, log)
            }
            break
        case AuthorizationType.UNSCOPED:
            await assertPrinicpalIsOneOf(security.authorization.allowedPrincipals, principal.type)
            break
        case AuthorizationType.NONE:
            break
    }
}


async function assertNonEmbedOrAdmin(principal: Principal, log: FastifyBaseLogger): Promise<void> {
    if (principal.type === PrincipalType.SERVICE) {
        return
    }
    const user = await userService(log).getOneOrFail({ id: principal.id })
    if (user.platformRole === PlatformRole.ADMIN) {
        return
    }
    const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
    if (identity.provider === UserIdentityProvider.JWT) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'Embed users are not allowed to access this resource.',
            },
        })
    }
    if (isNil(user.platformId)) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User is not associated with a platform.',
            },
        })
    }
    throw new PlatformError({
        code: ErrorCode.AUTHORIZATION,
        params: {
            message: 'User does not have invite permission.',
        },
    })
}

async function assertPlatformIsOwnedByCurrentPrincipal(principal: Principal, log: FastifyBaseLogger): Promise<void> {
    if (principal.type === PrincipalType.SERVICE) {
        return
    }
    const user = await userService(log).getOneOrFail({ id: principal.id })
    if (user.platformRole !== PlatformRole.ADMIN) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User is not an admin/owner of the platform.',
            },
        })
    }
}


async function assertAccessToWorkspace(principal: Principal, workspaceSecurity: WorkspaceAuthorizationConfig, log: FastifyBaseLogger): Promise<void> {
    if (isNil(workspaceSecurity.workspaceId)) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'Workspace ID is required',
            },
        })
    }
    await workspaceAccess(log).assertPrincipalCanAccessWorkspace({ principal, workspaceId: workspaceSecurity.workspaceId })
}


async function assertPrinicpalIsOneOf< T extends readonly PrincipalType[]>(allowedPrincipals: T, currentPrincipal: PrincipalType): Promise<void> {
    if (!allowedPrincipals.includes(currentPrincipal)) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'principal is not allowed for this route',
            },
        })
    }
}