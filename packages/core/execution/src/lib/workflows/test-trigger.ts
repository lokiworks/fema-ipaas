import { z } from 'zod'
import { EntityId } from '@fema-ipaas/core-utils'

export enum TriggerTestStrategy {
    SIMULATION = 'SIMULATION',
    TEST_FUNCTION = 'TEST_FUNCTION',
}

export const TestTriggerRequestBody = z.object({
    projectId: EntityId,
    workflowId: EntityId,
    workflowVersionId: EntityId,
    testStrategy: z.nativeEnum(TriggerTestStrategy),
})

export type TestTriggerRequestBody = z.infer<typeof TestTriggerRequestBody>


export const CancelTestTriggerRequestBody = z.object({
    projectId: EntityId,
    workflowId: EntityId,
})

export type CancelTestTriggerRequestBody = z.infer<typeof CancelTestTriggerRequestBody>
