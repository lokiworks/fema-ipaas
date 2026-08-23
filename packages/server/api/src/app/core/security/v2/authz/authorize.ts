import { ApplicationError, ErrorCode, isNil } from '@fema/core-utils'
import { Principal, PrincipalType, TenantRole, UserIdentityProvider } from '@fema/shared'
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
        case AuthorizationType.TENANT:
            await assertPrinicpalIsOneOf(security.authorization.allowedPrincipals, principal.type)
            if (security.authorization.adminOnly) {
                await assertTenantIsOwnedByCurrentPrincipal(principal, log)
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
    if (user.tenantRole === TenantRole.ADMIN) {
        return
    }
    const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
    if (identity.provider === UserIdentityProvider.JWT) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'Embed users are not allowed to access this resource.',
            },
        })
    }
    if (isNil(user.tenantId)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User is not associated with a tenant.',
            },
        })
    }
    throw new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: {
            message: 'User does not have invite permission.',
        },
    })
}

async function assertTenantIsOwnedByCurrentPrincipal(principal: Principal, log: FastifyBaseLogger): Promise<void> {
    if (principal.type === PrincipalType.SERVICE) {
        return
    }
    const user = await userService(log).getOneOrFail({ id: principal.id })
    if (user.tenantRole !== TenantRole.ADMIN) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User is not an admin/owner of the tenant.',
            },
        })
    }
}


async function assertAccessToWorkspace(principal: Principal, workspaceSecurity: WorkspaceAuthorizationConfig, log: FastifyBaseLogger): Promise<void> {
    if (isNil(workspaceSecurity.workspaceId)) {
        throw new ApplicationError({
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
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'principal is not allowed for this route',
            },
        })
    }
}