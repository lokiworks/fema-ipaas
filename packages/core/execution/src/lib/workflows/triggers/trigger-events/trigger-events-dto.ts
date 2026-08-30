import { WorkflowId } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { EntityId } from '@fema-ipaas/core-utils'
import { Cursor } from '@fema-ipaas/core-utils'

export const ListTriggerEventsRequest = z.object({
    projectId: EntityId,
    workflowId: z.string(),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
})

export type ListTriggerEventsRequest = Omit<z.infer<typeof ListTriggerEventsRequest>, 'workflowId' | 'cursor'> & {
    workflowId: WorkflowId
    cursor: Cursor | undefined
}

export const SaveTriggerEventRequest = z.object({
    projectId: EntityId,
    workflowId: z.string(),
    mockData: z.unknown(),
})

export type SaveTriggerEventRequest = z.infer<typeof SaveTriggerEventRequest>
