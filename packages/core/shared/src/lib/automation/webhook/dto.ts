import { EntityId } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const WebhookUrlParams = z.object({
    workflowId: EntityId,
})

export type WebhookUrlParams = z.infer<typeof WebhookUrlParams>
