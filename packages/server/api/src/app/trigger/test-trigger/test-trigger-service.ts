import { isNil, WorkflowId, WorkflowVersionId, WorkspaceId } from '@fema-ipaas/core-utils'
import { TriggerTestStrategy } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock } from '../../database/redis-connections'
import { workflowService } from '../../workflows/workflow/workflow.service'
import { triggerEventService } from '../trigger-events/trigger-event.service'
import { triggerSourceService } from '../trigger-source/trigger-source-service'

const lockKey: (workflowId: WorkflowId) => string = (workflowId) => `${workflowId}-test-trigger`

export const testTriggerService = (log: FastifyBaseLogger) => {
    return {
        async test(params: TestParams): Promise<unknown> {
            const { testStrategy, ...executeParams } = params
            log.info('[testTriggerService#test] Starting test trigger')
            return distributedLock(log).runExclusive({
                key: lockKey(executeParams.workflowId),
                timeoutInSeconds: 120,
                fn: async () => {
                    log.info('[testTriggerService#test] Acquired lock')
                    const populatedWorkflow = await workflowService(log).getOnePopulatedOrThrow({
                        id: executeParams.workflowId,
                        workspaceId: executeParams.workspaceId,
                        versionId: executeParams.workflowVersionId,
                    })

                    switch (testStrategy) {
                        case TriggerTestStrategy.SIMULATION: {
                            const exists = await triggerSourceService(log).existsByWorkflowId({
                                workflowId: executeParams.workflowId,
                                simulate: true,
                            })
                            log.info({
                                exists,
                            }, '[testTriggerService#test] Trigger source exists')
                            if (exists) {
                                await triggerSourceService(log).disable({
                                    workflowId: executeParams.workflowId,
                                    workspaceId: executeParams.workspaceId,
                                    simulate: true,
                                    ignoreError: true,
                                })
                                return
                            }
                            await triggerSourceService(log).enable({
                                workflowVersion: populatedWorkflow.version,
                                workspaceId: executeParams.workspaceId,
                                simulate: true,
                            })
                            return
                        }
                        case TriggerTestStrategy.TEST_FUNCTION: {
                            return triggerEventService(log).test({
                                workflow: populatedWorkflow,
                                workspaceId: executeParams.workspaceId,
                            })
                        }
                    }
                },
            })
        },
        async cancel(params: CancelParams): Promise<void> {
            const { workflowId, workspaceId } = params
            return distributedLock(log).runExclusive({
                key: lockKey(workflowId),
                timeoutInSeconds: 120,
                fn: async () => {
                    const trigger = await triggerSourceService(log).getByWorkflowId({
                        workflowId,
                        workspaceId,
                        simulate: true,
                    })
                    if (isNil(trigger)) {
                        return
                    }
                    return triggerSourceService(log).disable({
                        workflowId,
                        simulate: true,
                        workspaceId,
                        ignoreError: false,
                    })
                },
            })
        },
    }
}


type TestParams = {
    workflowId: WorkflowId
    workflowVersionId: WorkflowVersionId
    workspaceId: WorkspaceId
    testStrategy: TriggerTestStrategy
}

type CancelParams = {
    workflowId: WorkflowId
    workspaceId: WorkspaceId
}