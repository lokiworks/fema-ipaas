import { BaseModelSchema, Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { ConnectionScope, ConnectionStatus, ConnectionWithoutSensitiveData } from './connection'

function strongestPermission(permissions: (ConnectionPermission | null | undefined)[]): ConnectionPermission | null {
    const ranked = permissions
        .filter((permission): permission is ConnectionPermission => permission !== null && permission !== undefined)
        .sort((left, right) => PERMISSION_RANK[right] - PERMISSION_RANK[left])
    return ranked[0] ?? null
}

function resolvePermission({ connection, userId, shares, memberProjectIds, writableProjectIds }: ResolvePermissionParams): ConnectionPermission | null {
    if (connection.ownerId === userId) {
        return ConnectionPermission.OWNER
    }
    const share = shares.find((candidate) => candidate.userId === userId && candidate.connectionId === connection.id)
    const availableToMember = isAvailableToAllProjects(connection)
        ? memberProjectIds.length > 0
        : connection.projectIds.some((projectId) => memberProjectIds.includes(projectId))
    const canEditHere = writableProjectIds === undefined || (isAvailableToAllProjects(connection)
        ? writableProjectIds.length > 0
        : connection.projectIds.some((projectId) => writableProjectIds.includes(projectId)))
    const memberPermission = availableToMember ? capForRole({ permission: toPermission(connection.projectMembersPermission), canEdit: canEditHere }) : null
    return strongestPermission([toPermission(share?.permission), memberPermission])
}

function capForRole({ permission, canEdit }: { permission: ConnectionPermission | null, canEdit: boolean }): ConnectionPermission | null {
    return permission === ConnectionPermission.EDIT && !canEdit ? ConnectionPermission.USE : permission
}

function canUse(permission: ConnectionPermission | null): boolean {
    return permission !== null
}

function canManage(permission: ConnectionPermission | null): boolean {
    return permission === ConnectionPermission.OWNER || permission === ConnectionPermission.EDIT
}

function isAvailableToAllProjects(connection: Pick<ConnectionWithoutSensitiveData, 'scope' | 'preSelectForNewProjects'>): boolean {
    return connection.scope === ConnectionScope.TENANT && connection.preSelectForNewProjects
}

function isAvailableInProject({ connection, projectId }: { connection: Pick<ConnectionWithoutSensitiveData, 'scope' | 'projectIds' | 'preSelectForNewProjects'>, projectId: string }): boolean {
    return isAvailableToAllProjects(connection) || connection.projectIds.includes(projectId)
}

function toPermission(value: ConnectionSharePermission | null | undefined): ConnectionPermission | null {
    switch (value) {
        case ConnectionSharePermission.EDIT:
            return ConnectionPermission.EDIT
        case ConnectionSharePermission.USE:
            return ConnectionPermission.USE
        default:
            return null
    }
}

export const connectionAccessUtils = {
    resolvePermission,
    strongestPermission,
    canUse,
    canManage,
    isAvailableInProject,
    isAvailableToAllProjects,
}

export enum ConnectionPermission {
    OWNER = 'OWNER',
    EDIT = 'EDIT',
    USE = 'USE',
}

export enum ConnectionSharePermission {
    EDIT = 'EDIT',
    USE = 'USE',
}

export enum ConnectionOwnershipFilter {
    ALL = 'ALL',
    MINE = 'MINE',
    SHARED = 'SHARED',
}

const PERMISSION_RANK: Record<ConnectionPermission, number> = {
    [ConnectionPermission.OWNER]: 3,
    [ConnectionPermission.EDIT]: 2,
    [ConnectionPermission.USE]: 1,
}

export const ConnectionShareUser = z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
})
export type ConnectionShareUser = z.infer<typeof ConnectionShareUser>

export const ListConnectionShareCandidatesRequestQuery = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
})
export type ListConnectionShareCandidatesRequestQuery = z.infer<typeof ListConnectionShareCandidatesRequestQuery>

export const ConnectionShare = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    connectionId: z.string(),
    userId: z.string(),
    permission: z.enum(ConnectionSharePermission),
    user: Nullable(ConnectionShareUser),
})
export type ConnectionShare = z.infer<typeof ConnectionShare>

export const AddConnectionSharesRequestBody = z.object({
    userIds: z.array(z.string()).min(1, 'connectionShareSelectMember').max(100, 'connectionShareTooManyMembers'),
    permission: z.enum(ConnectionSharePermission),
})
export type AddConnectionSharesRequestBody = z.infer<typeof AddConnectionSharesRequestBody>

export const UpdateConnectionShareRequestBody = z.object({
    permission: z.enum(ConnectionSharePermission),
})
export type UpdateConnectionShareRequestBody = z.infer<typeof UpdateConnectionShareRequestBody>

export const UpdateConnectionAccessRequestBody = z.object({
    allProjects: z.boolean(),
    projectIds: z.array(z.string()),
    projectMembersPermission: Nullable(z.enum(ConnectionSharePermission)),
}).refine((body) => body.allProjects || body.projectIds.length > 0, {
    message: 'connectionScopeProjectRequired',
    path: ['projectIds'],
})
export type UpdateConnectionAccessRequestBody = z.infer<typeof UpdateConnectionAccessRequestBody>

export const ConnectionProjectRef = z.object({
    id: z.string(),
    displayName: z.string(),
})
export type ConnectionProjectRef = z.infer<typeof ConnectionProjectRef>

export const AccessibleConnection = ConnectionWithoutSensitiveData.extend({
    myPermission: z.enum(ConnectionPermission),
    allProjects: z.boolean(),
    projects: z.array(ConnectionProjectRef),
    shareCount: z.number(),
    projectMembersPermission: Nullable(z.enum(ConnectionSharePermission)),
})
export type AccessibleConnection = z.infer<typeof AccessibleConnection>

export const ListAccessibleConnectionsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    search: z.string().optional(),
    connectorName: z.string().optional(),
    status: OptionalArrayFromQuery(z.enum(ConnectionStatus)),
    availableInProjectId: z.string().optional(),
    ownership: z.enum(ConnectionOwnershipFilter).optional(),
})
export type ListAccessibleConnectionsRequestQuery = z.infer<typeof ListAccessibleConnectionsRequestQuery>

export const ConnectionWorkflowReference = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    projectId: z.string(),
    projectDisplayName: z.string(),
})
export type ConnectionWorkflowReference = z.infer<typeof ConnectionWorkflowReference>

export const ConnectionMcpServiceReference = z.object({
    serviceId: z.string(),
    name: z.string(),
    projectId: z.string(),
})
export type ConnectionMcpServiceReference = z.infer<typeof ConnectionMcpServiceReference>

export const ConnectionProjectConfigReference = z.object({
    id: z.string(),
    projectId: z.string(),
    projectDisplayName: z.string(),
    role: z.enum(['SOURCE', 'TARGET']),
})
export type ConnectionProjectConfigReference = z.infer<typeof ConnectionProjectConfigReference>

export const ConnectionReferences = z.object({
    workflows: z.array(ConnectionWorkflowReference),
    hiddenWorkflowCount: z.number(),
    mcpServices: z.array(ConnectionMcpServiceReference),
    hiddenMcpServiceCount: z.number(),
    projectConfigs: z.array(ConnectionProjectConfigReference),
    hiddenProjectConfigCount: z.number(),
})
export type ConnectionReferences = z.infer<typeof ConnectionReferences>

export const RemindConnectionOwnerResponse = z.object({
    reminded: z.boolean(),
    ownerDisplayName: z.string(),
})
export type RemindConnectionOwnerResponse = z.infer<typeof RemindConnectionOwnerResponse>

export const ConnectionDetail = AccessibleConnection.extend({
    references: ConnectionReferences,
    shares: z.array(ConnectionShare),
})
export type ConnectionDetail = z.infer<typeof ConnectionDetail>

export const ConnectionScopeImpactRequestBody = z.object({
    allProjects: z.boolean(),
    projectIds: z.array(z.string()),
})
export type ConnectionScopeImpactRequestBody = z.infer<typeof ConnectionScopeImpactRequestBody>

export const ConnectionScopeImpact = z.object({
    lostWorkflows: z.array(ConnectionWorkflowReference),
    hiddenLostWorkflowCount: z.number(),
})
export type ConnectionScopeImpact = z.infer<typeof ConnectionScopeImpact>

type ResolvePermissionParams = {
    connection: Pick<ConnectionWithoutSensitiveData, 'id' | 'scope' | 'projectIds' | 'preSelectForNewProjects'> & {
        ownerId?: string | null
        projectMembersPermission?: ConnectionSharePermission | null
    }
    userId: string
    shares: Pick<ConnectionShare, 'connectionId' | 'userId' | 'permission'>[]
    memberProjectIds: string[]
    writableProjectIds?: string[]
}
