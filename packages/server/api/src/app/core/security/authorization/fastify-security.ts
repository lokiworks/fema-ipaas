import { Permission } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { AuthorizationType, NoneAuthorization, ProjectAuthorization, ProjectResource, PublicRoute, RouteKind, TenantAuthorization, UnscopedAuthorization } from './common'

type FastifySecurityAuthorization =
    | TenantAuthorization
    | ProjectAuthorization
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
     * @param projectResource - Optional resource configuration for extracting projectId from the request
     * @returns Security configuration for public tenant routes
     */
    publicTenant: (allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.ENGINE | PrincipalType.SERVICE)[], projectResource?: ProjectResource) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.TENANT,
                allowedPrincipals,
                adminOnly: false,
                projectResource,
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
     * Creates a security configuration for project-scoped routes.
     *
     * **Pre-check:**
     * - Extract projectId from the request based on projectResource
     *   - ProjectTableResource: uses a db table to get projectId of the entity with id specified in the request body, query or param
     *   - ProjectQueryResource: gets projectId from the query string
     *   - ProjectBodyResource: gets projectId from the request body
     *   - ProjectParamResource: gets projectId from the request param
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     * - User with principal.id must be member of project with the extracted projectId
     * - If permission is provided, user with principal.id must have the permission on the project with the extracted projectId
     *
     * **Effects:**
     * - projectId field is available on the request object (request.projectId)
     *
     * @param allowedPrincipals - Array of allowed principal types (USER, SERVICE, or ENGINE)
     * @param permission - Optional permission required for access
     * @param projectResource - Resource configuration for extracting projectId from the request
     * @returns Security configuration for project-scoped routes
     */
    project: (allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.SERVICE | PrincipalType.ENGINE)[], permission: Permission | undefined, projectResource: ProjectResource) => {
        return {
            kind: RouteKind.AUTHENTICATED,
            authorization: {
                type: AuthorizationType.PROJECT,
                allowedPrincipals,
                permission,
                projectResource,
            },
        } as const
    },
    
    /**
     * Creates a security configuration for unscoped routes that do not require tenantId or projectId.
     *
     * Mainly used for routes that do not require tenantId or projectId appended on the request object.
     * This is useful when we need a route that allows Worker principal + other principals because the
     * worker principal token does not contain tenantId or projectId.
     *
     * **Conditions for access:**
     * - Principal type of token must be one of the allowedPrincipals
     *
     * **Effects:**
     * - No effects (tenantId and projectId are not available on the request object)
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
     * - projectId field is available on the request.principal because the engine principal token contains projectId
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
