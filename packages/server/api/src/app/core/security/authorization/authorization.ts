import { WorkspaceId } from '@fema-ipaas/core-utils'
import { NoneAuthorization, PublicRoute, RouteKind, TenantAuthorization, UnscopedAuthorization, WorkspaceAuthorization } from './common'

export type WorkspaceAuthorizationConfig = Omit<WorkspaceAuthorization, 'workspaceResource'> & {
    workspaceId: WorkspaceId | undefined
}

type AuthorizationRuleConfig =
    | TenantAuthorization
    | WorkspaceAuthorizationConfig
    | UnscopedAuthorization
    | NoneAuthorization

type AuthorizationRouteAccess = {
    kind: RouteKind.AUTHENTICATED
    authorization: AuthorizationRuleConfig
}

export type AuthorizationRouteSecurity = AuthorizationRouteAccess | PublicRoute
