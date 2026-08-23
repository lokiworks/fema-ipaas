import { OptionalArrayFromQuery } from '@fema/core-utils'
import { z } from 'zod'
import { WorkspaceType } from '../../../management/workspace/workspace'
import { ConnectionScope, ConnectionStatus, ConnectionWithoutSensitiveData } from '../connection'

export const ListConnectionsRequestQuery = z.object({
    cursor: z.string().optional(),
    workspaceId: z.string(),
    scope: z.nativeEnum(ConnectionScope).optional(),
    connectorName: z.string().optional(),
    displayName: z.string().optional(),
    status: OptionalArrayFromQuery(z.nativeEnum(ConnectionStatus)),
    limit: z.coerce.number().optional(),
})

export type ListConnectionsRequestQuery = z.infer<
  typeof ListConnectionsRequestQuery
>

export const GetConnectionForWorkerRequestQuery = z.object({
    externalId: z.string(),
})
export type GetConnectionForWorkerRequestQuery = z.infer<
    typeof GetConnectionForWorkerRequestQuery
>

export const ListGlobalConnectionsRequestQuery = ListConnectionsRequestQuery.omit({ workspaceId: true })
export type ListGlobalConnectionsRequestQuery = z.infer<typeof ListGlobalConnectionsRequestQuery>

export const ListConnectionOwnersRequestQuery = z.object({
    workspaceId: z.string(),
})
export type ListConnectionOwnersRequestQuery = z.infer<typeof ListConnectionOwnersRequestQuery>

export const ListPlatformConnectionsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    displayName: z.string().optional(),
    connectorName: z.string().optional(),
    scope: z.nativeEnum(ConnectionScope).optional(),
    status: OptionalArrayFromQuery(z.nativeEnum(ConnectionStatus)),
    workspaceIds: OptionalArrayFromQuery(z.string()),
    ownerIds: OptionalArrayFromQuery(z.string()),
})
export type ListPlatformConnectionsRequestQuery = z.infer<typeof ListPlatformConnectionsRequestQuery>

export const PlatformConnectionWorkspaceInfo = z.object({
    id: z.string(),
    displayName: z.string(),
    type: z.nativeEnum(WorkspaceType),
})
export type PlatformConnectionWorkspaceInfo = z.infer<typeof PlatformConnectionWorkspaceInfo>

export const PlatformConnectionsListItem = ConnectionWithoutSensitiveData.extend({
    workspaces: z.array(PlatformConnectionWorkspaceInfo),
})
export type PlatformConnectionsListItem = z.infer<typeof PlatformConnectionsListItem>

export const PlatformConnectionOwner = z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
})
export type PlatformConnectionOwner = z.infer<typeof PlatformConnectionOwner>

export const PlatformConnectionOwnersResponse = z.object({
    data: z.array(PlatformConnectionOwner),
    truncated: z.boolean(),
})
export type PlatformConnectionOwnersResponse = z.infer<typeof PlatformConnectionOwnersResponse>

export const MAX_PLATFORM_CONNECTION_OWNERS = 1000
