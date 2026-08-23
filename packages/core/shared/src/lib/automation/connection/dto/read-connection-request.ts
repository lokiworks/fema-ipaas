import { OptionalArrayFromQuery } from '@fema/core-utils'
import { z } from 'zod'
import { ProjectType } from '../../../management/project/project'
import { ConnectionScope, ConnectionStatus, ConnectionWithoutSensitiveData } from '../connection'

export const ListConnectionsRequestQuery = z.object({
    cursor: z.string().optional(),
    projectId: z.string(),
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

export const ListGlobalConnectionsRequestQuery = ListConnectionsRequestQuery.omit({ projectId: true })
export type ListGlobalConnectionsRequestQuery = z.infer<typeof ListGlobalConnectionsRequestQuery>

export const ListConnectionOwnersRequestQuery = z.object({
    projectId: z.string(),
})
export type ListConnectionOwnersRequestQuery = z.infer<typeof ListConnectionOwnersRequestQuery>

export const ListPlatformConnectionsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    displayName: z.string().optional(),
    connectorName: z.string().optional(),
    scope: z.nativeEnum(ConnectionScope).optional(),
    status: OptionalArrayFromQuery(z.nativeEnum(ConnectionStatus)),
    projectIds: OptionalArrayFromQuery(z.string()),
    ownerIds: OptionalArrayFromQuery(z.string()),
})
export type ListPlatformConnectionsRequestQuery = z.infer<typeof ListPlatformConnectionsRequestQuery>

export const PlatformConnectionProjectInfo = z.object({
    id: z.string(),
    displayName: z.string(),
    type: z.nativeEnum(ProjectType),
})
export type PlatformConnectionProjectInfo = z.infer<typeof PlatformConnectionProjectInfo>

export const PlatformConnectionsListItem = ConnectionWithoutSensitiveData.extend({
    projects: z.array(PlatformConnectionProjectInfo),
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
