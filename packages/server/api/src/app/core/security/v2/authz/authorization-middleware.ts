import { isNil } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { AuthorizationRouteSecurity } from '../../authorization/authorization'
import { AuthorizationType, RouteKind, WorkspaceResourceType } from '../../authorization/common'
import { authorizeOrThrow } from './authorize'
import { workspaceIdExtractor } from './workspaceIdExtractor'


export const authorizationMiddleware = async (request: FastifyRequest): Promise<void> => {
    const security = request.routeOptions.config?.security
    const securityAccessRequest = await convertToSecurityAccessRequest(request)
    await authorizeOrThrow(request.principal, securityAccessRequest, request.log)

    const requestPath = request.routeOptions.config.url
    const bullmqRoute = requestPath.startsWith('/ui') || requestPath.startsWith('/api/ui')
    if (bullmqRoute) {
        return
    }
    if (!isNil(security) && security.kind === RouteKind.AUTHENTICATED && security.authorization.type === AuthorizationType.WORKSPACE) {
        // @ts-expect-error: explicit override for Fastify typing assignment
        request.workspaceId = securityAccessRequest.authorization.workspaceId
    }
}

export async function convertToSecurityAccessRequest(request: FastifyRequest): Promise<AuthorizationRouteSecurity> {
    const security = request.routeOptions.config?.security
    if (isNil(security) || security.kind === RouteKind.PUBLIC) {
        return {
            kind: RouteKind.PUBLIC,
        }
    }
    switch (security.authorization.type) {
        case AuthorizationType.WORKSPACE:
            return {
                kind: RouteKind.AUTHENTICATED,
                authorization: {
                    type: AuthorizationType.WORKSPACE,
                    allowedPrincipals: security.authorization.allowedPrincipals,
                    permission: security.authorization.permission,
                    workspaceId: await getWorkspaceIdFromRequest(request),
                },
            }
        case AuthorizationType.TENANT:
            return {
                kind: RouteKind.AUTHENTICATED,
                authorization: {
                    adminOnly: security.authorization.adminOnly,
                    nonEmbedUsersOnly: security.authorization.nonEmbedUsersOnly,
                    type: AuthorizationType.TENANT,
                    allowedPrincipals: security.authorization.allowedPrincipals,
                },
            }
        case AuthorizationType.UNSCOPED:
            return {
                kind: RouteKind.AUTHENTICATED,
                authorization: {
                    type: AuthorizationType.UNSCOPED,
                    allowedPrincipals: security.authorization.allowedPrincipals,
                },
            }
        case AuthorizationType.NONE:
            return {
                kind: RouteKind.AUTHENTICATED,
                authorization: {
                    type: AuthorizationType.NONE,
                    reason: security.authorization.reason,
                },
            }
    }
}

export async function getWorkspaceIdFromRequest(request: FastifyRequest): Promise<string | undefined> {
    if (request.principal.type === PrincipalType.ENGINE) {
        return request.principal.workspaceId
    }
    const security = request.routeOptions.config?.security
    if (!security) {
        return undefined
    }
    if (security.kind === RouteKind.PUBLIC) {
        return undefined
    }
    if (security.authorization.type !== AuthorizationType.WORKSPACE && security.authorization.type !== AuthorizationType.TENANT) {
        return undefined
    }
    const workspaceResource = security.authorization.workspaceResource
    if (isNil(workspaceResource)) {
        return undefined
    }

    switch (workspaceResource.type) {
        case WorkspaceResourceType.TABLE:
            return workspaceIdExtractor.fromTable(request, workspaceResource)
        case WorkspaceResourceType.QUERY:
            return workspaceIdExtractor.fromQuery(request, workspaceResource)
        case WorkspaceResourceType.BODY:
            return workspaceIdExtractor.fromBody(request, workspaceResource)
        case WorkspaceResourceType.PARAM:
            return workspaceIdExtractor.fromParam(request, workspaceResource)
    }
}
