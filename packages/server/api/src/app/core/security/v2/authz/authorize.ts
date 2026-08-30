import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { Principal, PrincipalType, TenantRole, UserIdentityProvider } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../../../authentication/user-identity/user-identity-service'
import { projectAccess } from '../../../../project/project-access'
import { userService } from '../../../../user/user-service'
import { AuthorizationRouteSecurity, ProjectAuthorizationConfig } from '../../authorization/authorization'
import { AuthorizationType, RouteKind } from '../../authorization/common'

export const authorizeOrThrow = async (principal: Principal, security: AuthorizationRouteSecurity, log: FastifyBaseLogger): Promise<void> => {
    if (security.kind === RouteKind.PUBLIC) {
        return
    }
    switch (security.authorization.type) {
        case AuthorizationType.PROJECT:
            await assertPrinicpalIsOneOf(security.authorization.allowedPrincipals, principal.type)
            await assertAccessToProject(principal, security.authorization, log)
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


async function assertAccessToProject(principal: Principal, projectSecurity: ProjectAuthorizationConfig, log: FastifyBaseLogger): Promise<void> {
    if (isNil(projectSecurity.projectId)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'Project ID is required',
            },
        })
    }
    await projectAccess(log).assertPrincipalCanAccessProject({
        principal,
        projectId: projectSecurity.projectId,
        permission: projectSecurity.permission,
    })
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