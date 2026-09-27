import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../../form-errors'

export enum ConnectorDemandStatus {
    OPEN = 'OPEN',
    PLANNED = 'PLANNED',
    DONE = 'DONE',
    DECLINED = 'DECLINED',
}

export const CONNECTOR_DEMAND_APP_NAME_MAX_LENGTH = 30
export const CONNECTOR_DEMAND_CAPABILITY_MAX_LENGTH = 300

export const ConnectorDemandRequester = z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
})
export type ConnectorDemandRequester = z.infer<typeof ConnectorDemandRequester>

export const ConnectorDemand = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    requesterId: Nullable(z.string()),
    requester: Nullable(ConnectorDemandRequester),
    appName: z.string(),
    capability: z.string(),
    status: z.enum(ConnectorDemandStatus),
})
export type ConnectorDemand = z.infer<typeof ConnectorDemand>

export const CreateConnectorDemandRequestBody = z.object({
    appName: z.string().trim().min(1, formErrors.required).max(CONNECTOR_DEMAND_APP_NAME_MAX_LENGTH, 'connectorDemandAppNameTooLong'),
    capability: z.string().trim().min(1, formErrors.required).max(CONNECTOR_DEMAND_CAPABILITY_MAX_LENGTH, 'connectorDemandCapabilityTooLong'),
})
export type CreateConnectorDemandRequestBody = z.infer<typeof CreateConnectorDemandRequestBody>

export const UpdateConnectorDemandRequestBody = z.object({
    status: z.enum(ConnectorDemandStatus),
})
export type UpdateConnectorDemandRequestBody = z.infer<typeof UpdateConnectorDemandRequestBody>

export const ListConnectorDemandsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    status: z.enum(ConnectorDemandStatus).optional(),
})
export type ListConnectorDemandsRequestQuery = z.infer<typeof ListConnectorDemandsRequestQuery>

export const ConnectorUsageEntry = z.object({
    connectorName: z.string(),
    myWorkflowCount: z.number(),
    tenantWorkflowCount: z.number(),
})
export type ConnectorUsageEntry = z.infer<typeof ConnectorUsageEntry>

export const ConnectorUsageResponse = z.object({
    data: z.array(ConnectorUsageEntry),
})
export type ConnectorUsageResponse = z.infer<typeof ConnectorUsageResponse>

export const ConnectorWorkflowUsage = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    projectId: z.string(),
    projectDisplayName: z.string(),
})
export type ConnectorWorkflowUsage = z.infer<typeof ConnectorWorkflowUsage>

export const ListConnectorWorkflowsRequestQuery = z.object({
    connectorName: z.string(),
})
export type ListConnectorWorkflowsRequestQuery = z.infer<typeof ListConnectorWorkflowsRequestQuery>
