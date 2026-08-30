import { ProjectId } from '@fema-ipaas/core-utils'
import { NoneAuthorization, ProjectAuthorization, PublicRoute, RouteKind, TenantAuthorization, UnscopedAuthorization } from './common'

export type ProjectAuthorizationConfig = Omit<ProjectAuthorization, 'projectResource'> & {
    projectId: ProjectId | undefined
}

type AuthorizationRuleConfig =
    | TenantAuthorization
    | ProjectAuthorizationConfig
    | UnscopedAuthorization
    | NoneAuthorization

type AuthorizationRouteAccess = {
    kind: RouteKind.AUTHENTICATED
    authorization: AuthorizationRuleConfig
}

export type AuthorizationRouteSecurity = AuthorizationRouteAccess | PublicRoute
