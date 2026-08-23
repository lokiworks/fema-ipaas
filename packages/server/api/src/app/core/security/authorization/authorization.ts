import { WorkspaceId } from '@fema/core-utils'
import { NoneAuthorization, PlatformAuthorization, PublicRoute, RouteKind, UnscopedAuthorization, WorkspaceAuthorization } from './common'

export type WorkspaceAuthorizationConfig = Omit<WorkspaceAuthorization, 'workspaceResource'> & {
    workspaceId: WorkspaceId | undefined
}

type AuthorizationRuleConfig =
    | PlatformAuthorization
    | WorkspaceAuthorizationConfig
    | UnscopedAuthorization
    | NoneAuthorization

type AuthorizationRouteAccess = {
    kind: RouteKind.AUTHENTICATED
    authorization: AuthorizationRuleConfig
}

export type AuthorizationRouteSecurity = AuthorizationRouteAccess | PublicRoute
