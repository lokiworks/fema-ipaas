import { ApId, BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum NetworkAgentStatus {
    PENDING = 'PENDING',
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
    DISABLED = 'DISABLED',
}

export const NetworkAgent = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    workspaceId: Nullable(z.string()),
    displayName: z.string(),
    status: z.enum(NetworkAgentStatus),
    hostAllowlist: z.array(z.string()),
    cidrAllowlist: z.array(z.string()),
    lastSeenAt: Nullable(z.string()),
})

export const CreateNetworkAgentRequest = z.object({
    displayName: z.string().min(1, 'formErrors.required'),
    workspaceId: z.string().optional(),
    hostAllowlist: z.array(z.string()).default([]),
    cidrAllowlist: z.array(z.string()).default([]),
})

export const UpdateNetworkAgentRequest = z.object({
    displayName: z.string().min(1, 'formErrors.required').optional(),
    status: z.enum(NetworkAgentStatus).optional(),
    hostAllowlist: z.array(z.string()).optional(),
    cidrAllowlist: z.array(z.string()).optional(),
})

export const ListNetworkAgentsRequest = z.object({
    workspaceId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
})

export const NetworkAgentWithToken = NetworkAgent.extend({
    token: z.string(),
})

export const NetworkAgentIdParams = z.object({
    id: ApId,
})

export type NetworkAgent = z.infer<typeof NetworkAgent>
export type NetworkAgentWithToken = z.infer<typeof NetworkAgentWithToken>
export type CreateNetworkAgentRequest = z.infer<typeof CreateNetworkAgentRequest>
export type UpdateNetworkAgentRequest = z.infer<typeof UpdateNetworkAgentRequest>
export type ListNetworkAgentsRequest = z.infer<typeof ListNetworkAgentsRequest>
