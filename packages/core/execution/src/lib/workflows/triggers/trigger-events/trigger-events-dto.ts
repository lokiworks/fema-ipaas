import { WorkflowId } from '@fema/core-utils'
import { z } from 'zod'
import { ApId } from '@fema/core-utils'
import { Cursor } from '@fema/core-utils'

export const ListTriggerEventsRequest = z.object({
    workspaceId: ApId,
    workflowId: z.string(),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
})

export type ListTriggerEventsRequest = Omit<z.infer<typeof ListTriggerEventsRequest>, 'workflowId' | 'cursor'> & {
    workflowId: WorkflowId
    cursor: Cursor | undefined
}

export const SaveTriggerEventRequest = z.object({
    workspaceId: ApId,
    workflowId: z.string(),
    mockData: z.unknown(),
})

export type SaveTriggerEventRequest = z.infer<typeof SaveTriggerEventRequest>
