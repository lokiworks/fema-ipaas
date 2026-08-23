import { Permission } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'

export enum AuthorizationType {
    TENANT = 'TENANT',
    WORKSPACE = 'WORKSPACE',
    UNSCOPED = 'UNSCOPED',
    NONE = 'NONE',
}

export enum WorkspaceResourceType {
    TABLE = 'TABLE',
    QUERY = 'QUERY',
    BODY = 'BODY',
    PARAM = 'PARAM',
}

export enum RouteKind {
    AUTHENTICATED = 'AUTHENTICATED',
    PUBLIC = 'PUBLIC',
}

export enum EntitySourceType {
    PARAM = 'PARAM',
    QUERY = 'QUERY',
    BODY = 'BODY',
}

export type WorkspaceTableResource = {
    type: WorkspaceResourceType.TABLE
    tableName: EntitySchema<unknown>
    entitySourceType?: EntitySourceType // defaults to PARAM
    lookup?: {
        paramKey: string // defaults to id
        entityField: string
    }
}

export type WorkspaceQueryResource = {
    type: WorkspaceResourceType.QUERY
    queryKey?: string // defaults to workspaceId
}

export type WorkspaceBodyResource = {
    type: WorkspaceResourceType.BODY
    bodyKey?: string // defaults to workspaceId
}

export type WorkspaceParamResource = {
    type: WorkspaceResourceType.PARAM
    paramKey?: string // defaults to workspaceId
}

export type WorkspaceResource = WorkspaceTableResource | WorkspaceQueryResource | WorkspaceBodyResource | WorkspaceParamResource

export type TenantAuthorization = {
    type: AuthorizationType.TENANT
    adminOnly: boolean
    nonEmbedUsersOnly?: boolean
    allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.ENGINE | PrincipalType.SERVICE)[]
    workspaceResource?: WorkspaceResource
}

export type WorkspaceAuthorization = {
    type: AuthorizationType.WORKSPACE
    allowedPrincipals: readonly (PrincipalType.USER | PrincipalType.ENGINE | PrincipalType.SERVICE)[]
    workspaceResource: WorkspaceResource
    permission?: Permission
}

export type UnscopedAuthorization = {
    type: AuthorizationType.UNSCOPED
    allowedPrincipals: readonly PrincipalType[]
}

export type NoneAuthorization = {
    type: AuthorizationType.NONE
    reason: string
}

export type PublicRoute = {
    kind: RouteKind.PUBLIC
}