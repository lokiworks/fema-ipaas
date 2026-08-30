import { OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
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

export const ListTenantConnectionsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    displayName: z.string().optional(),
    connectorName: z.string().optional(),
    scope: z.nativeEnum(ConnectionScope).optional(),
    status: OptionalArrayFromQuery(z.nativeEnum(ConnectionStatus)),
    projectIds: OptionalArrayFromQuery(z.string()),
    ownerIds: OptionalArrayFromQuery(z.string()),
})
export type ListTenantConnectionsRequestQuery = z.infer<typeof ListTenantConnectionsRequestQuery>

export const TenantConnectionProjectInfo = z.object({
    id: z.string(),
    displayName: z.string(),
    type: z.nativeEnum(ProjectType),
})
export type TenantConnectionProjectInfo = z.infer<typeof TenantConnectionProjectInfo>

export const TenantConnectionsListItem = ConnectionWithoutSensitiveData.extend({
    projects: z.array(TenantConnectionProjectInfo),
})
export type TenantConnectionsListItem = z.infer<typeof TenantConnectionsListItem>

export const TenantConnectionOwner = z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
})
export type TenantConnectionOwner = z.infer<typeof TenantConnectionOwner>

export const TenantConnectionOwnersResponse = z.object({
    data: z.array(TenantConnectionOwner),
    truncated: z.boolean(),
})
export type TenantConnectionOwnersResponse = z.infer<typeof TenantConnectionOwnersResponse>

export const MAX_TENANT_CONNECTION_OWNERS = 1000
