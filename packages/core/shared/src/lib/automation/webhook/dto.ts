import { ApId } from '@fema/core-utils'
import { z } from 'zod'

export const WebhookUrlParams = z.object({
    workflowId: ApId,
})

export type WebhookUrlParams = z.infer<typeof WebhookUrlParams>
