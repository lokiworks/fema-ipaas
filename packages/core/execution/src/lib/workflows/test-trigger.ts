import { z } from 'zod'
import { ApId } from '@fema-ipaas/core-utils'

export enum TriggerTestStrategy {
    SIMULATION = 'SIMULATION',
    TEST_FUNCTION = 'TEST_FUNCTION',
}

export const TestTriggerRequestBody = z.object({
    workspaceId: ApId,
    workflowId: ApId,
    workflowVersionId: ApId,
    testStrategy: z.nativeEnum(TriggerTestStrategy),
})

export type TestTriggerRequestBody = z.infer<typeof TestTriggerRequestBody>


export const CancelTestTriggerRequestBody = z.object({
    workspaceId: ApId,
    workflowId: ApId,
})

export type CancelTestTriggerRequestBody = z.infer<typeof CancelTestTriggerRequestBody>
