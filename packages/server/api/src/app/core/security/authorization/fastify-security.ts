import { Permission } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { AuthorizationType, NoneAuthorization, PublicRoute, RouteKind, TenantAuthorization, UnscopedAuthorization, WorkspaceAuthorization, WorkspaceResource } from './common'

type FastifySecurityAuthorization =
    | TenantAuthorization
    | WorkspaceAuthorization
    | UnscopedAuthorization
    | NoneAuthorization

type RouteAccessRequest = {
    kind: RouteKind.AUTHENTICATED
    authorization: FastifySecurityAuthorization
}
    
export type FastifyRouteSecurity = RouteAccessRequest | PublicRoute

export const securityAccess = {

    /**
     * Creates a security configuration that restricts access to tenant administrators only.
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     * - User with principal.id must be owner of the tenant with id principal.tenantId
     *
     * **Effects:**
     * - tenantId field is available on the request.principal (request.principal.tenantId)
     *
     * @param allowedPrincipals - Array of allowed principal types (USER, ENGINE, or SERVICE)
     * @returns Security configuration for tenant admin-only routes
     */
    tenantAdminOnly: (allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.ENGINE | PrincipalType.SERVICE)[]) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.TENANT,
                allowedPrincipals,
                adminOnly: true,
            },
        } as const
    },
    
    /**
     * Creates a security configuration that allows tenant administrators
     * and non-embed (non-JWT) identity provider users.
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     * - User must be a tenant admin OR have a non-JWT identity provider
     *
     * **Effects:**
     * - tenantId field is available on the request.principal (request.principal.tenantId)
     *
     * @param allowedPrincipals - Array of allowed principal types (USER, ENGINE, or SERVICE)
     * @returns Security configuration for admin or non-embed user routes
     */
    nonEmbedUsersOnly: (allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.ENGINE | PrincipalType.SERVICE)[]) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.TENANT,
                allowedPrincipals,
                adminOnly: false,
                nonEmbedUsersOnly: true,
            },
        } as const
    },

    /**
     * Creates a security configuration for public tenant routes.
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     *
     * **Effects:**
     * - tenantId field is available on the request.principal (request.principal.tenantId)
     *
     * @param allowedPrincipals - Array of allowed principal types (USER, ENGINE, or SERVICE)
     * @param workspaceResource - Optional resource configuration for extracting workspaceId from the request
     * @returns Security configuration for public tenant routes
     */
    publicTenant: (allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.ENGINE | PrincipalType.SERVICE)[], workspaceResource?: WorkspaceResource) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.TENANT,
                allowedPrincipals,
                adminOnly: false,
                workspaceResource,
            },
        } as const
    },
    
    /**
     * Creates a security configuration for public routes that require no authentication.
     *
     * **Conditions for access:**
     * - No authentication token required
     *
     * @returns Security configuration for public routes
     */
    public: () => {
        return {
            kind: RouteKind.PUBLIC,
        } as const
    },
    
    /**
     * Creates a security configuration for workspace-scoped routes.
     *
     * **Pre-check:**
     * - Extract workspaceId from the request based on workspaceResource
     *   - WorkspaceTableResource: uses a db table to get workspaceId of the entity with id specified in the request body, query or param
     *   - WorkspaceQueryResource: gets workspaceId from the query string
     *   - WorkspaceBodyResource: gets workspaceId from the request body
     *   - WorkspaceParamResource: gets workspaceId from the request param
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     * - User with principal.id must be member of workspace with the extracted workspaceId
     * - If permission is provided, user with principal.id must have the permission on the workspace with the extracted workspaceId
     *
     * **Effects:**
     * - workspaceId field is available on the request object (request.workspaceId)
     *
     * @param allowedPrincipals - Array of allowed principal types (USER, SERVICE, or ENGINE)
     * @param permission - Optional permission required for access
     * @param workspaceResource - Resource configuration for extracting workspaceId from the request
     * @returns Security configuration for workspace-scoped routes
     */
    workspace: (allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.SERVICE | PrincipalType.ENGINE)[], permission: Permission | undefined, workspaceResource: WorkspaceResource) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.WORKSPACE,
                allowedPrincipals,
                permission,
                workspaceResource,
            },
        } as const
    },
    
    /**
     * Creates a security configuration for unscoped routes that do not require tenantId or workspaceId.
     *
     * Mainly used for routes that do not require tenantId or workspaceId appended on the request object.
     * This is useful when we need a route that allows Worker principal + other principals because the
     * worker principal token does not contain tenantId or workspaceId.
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     *
     * **Effects:**
     * - No effects (tenantId and workspaceId are not available on the request object)
     *
     * @param allowedPrincipals - Array of allowed principal types
     * @returns Security configuration for unscoped routes
     */
    unscoped: <T extends readonly PrincipalType[]>(allowedPrincipals: T) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.UNSCOPED,
                allowedPrincipals,
            },
        } as const
    },
    
    /**
     * Creates a security configuration for routes that are only accessible to Engine principal.
     *
     * **Effects:**
     * - workspaceId field is available on the request.principal because the engine principal token contains workspaceId
     *
     * @returns Security configuration for engine-only routes
     */
    engine: () => {
        return securityAccess.unscoped([PrincipalType.ENGINE])
    },
    
    /**
     * Creates a security configuration for routes that are only accessible to Worker principal.
     *
     * @returns Security configuration for worker-only routes
     */
    worker: () => {
        return securityAccess.unscoped([PrincipalType.WORKER])
    },
}
