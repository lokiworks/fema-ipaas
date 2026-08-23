import { z } from 'zod'
import * as zMini from 'zod/mini'
import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { ApId } from '@fema-ipaas/core-utils'
import { Metadata } from '@fema-ipaas/core-utils'
import { TriggerSource, WebhookHandshakeConfiguration } from '@fema-ipaas/connector-types'
import { WorkflowVersion } from './workflow-version'

type WorkflowId = ApId
export enum WorkflowStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

export enum WorkflowOperationStatus {
    NONE = 'NONE',
    DELETING = 'DELETING',
    /** @deprecated No longer set — status changes are now synchronous via distributed lock */
    ENABLING = 'ENABLING',
    /** @deprecated No longer set — status changes are now synchronous via distributed lock */
    DISABLING = 'DISABLING',
}

export const WorkflowCreatorType = {
    MCP: 'MCP',
    AGENT: 'AGENT',
} as const
export type WorkflowCreatorType = typeof WorkflowCreatorType[keyof typeof WorkflowCreatorType]

export const WorkflowCreator = z.discriminatedUnion('type', [
    z.object({ type: z.literal(WorkflowCreatorType.MCP), id: ApId }),
    z.object({ type: z.literal(WorkflowCreatorType.AGENT), id: ApId }),
])
export type WorkflowCreator = z.infer<typeof WorkflowCreator>

export const workflowExecutionStateKey = (workflowId: WorkflowId) => `workflow-execution-state:${workflowId}`

export type WorkflowExecutionState = {
    exists: false
} | {
    exists: true
    handshakeConfiguration: WebhookHandshakeConfiguration | undefined
    workflow: Workflow
    tenantId: string
}
export const Workflow = z.object({
    ...BaseModelSchema,
    workspaceId: z.string(),
    externalId: z.string(),
    ownerId: Nullable(z.string()),
    folderId: Nullable(z.string()),
    status: z.nativeEnum(WorkflowStatus),
    publishedVersionId: Nullable(z.string()),
    metadata: Nullable(Metadata),
    /** @deprecated Only DELETING is actively used — ENABLING/DISABLING are no longer set */
    operationStatus: z.nativeEnum(WorkflowOperationStatus),
    timeSavedPerRun: Nullable(z.number()),
    templateId: Nullable(z.string()),
    createdBy: Nullable(WorkflowCreator),
})

export type Workflow = z.infer<typeof Workflow>
export const PopulatedWorkflow = Workflow.extend({
    version: WorkflowVersion,
    triggerSource: zMini.optional(zMini.pick(TriggerSource, { schedule: true })),
})

export type PopulatedWorkflow = z.infer<typeof PopulatedWorkflow>


export const PopulatedTriggerSource = zMini.extend(TriggerSource, {
    workflow: Workflow,
})
export type PopulatedTriggerSource = z.infer<typeof PopulatedTriggerSource>
