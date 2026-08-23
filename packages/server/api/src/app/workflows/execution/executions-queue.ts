import { apId, isNil, sanitizeObjectForPostgresql, spreadIfDefined } from '@fema-ipaas/core-utils'
import { Execution, ExecutionStatus, isExecutionStateTerminal, RunTimeline } from '@fema-ipaas/shared'
import { Queue, Worker } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock, distributedStore, redisConnections } from '../../database/redis-connections'
import { domainHelper } from '../../helper/domain-helper'
import { exceptionHandler } from '../../helper/exception-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { QueueName, redisMetadataKey, RunsMetadataJobData, RunsMetadataQueueConfig, runsMetadataQueueFactory, RunsMetadataUpsertData } from '../../workers/job'
import { workspaceService } from '../../workspace/workspace-service'
import { workflowService } from '../workflow/workflow.service'
import { executionRepo } from './execution-service'
import { executionSideEffects } from './execution-side-effects'
import { buildRunTimeline } from './run-timeline'
import { resumeService } from './waitpoint/resume-service'
import { waitpointService } from './waitpoint/waitpoint-service'
import { WaitpointStatus } from './waitpoint/waitpoint-types'

let runsMetadataWorker: Worker<RunsMetadataJobData> | undefined = undefined

const queue = runsMetadataQueueFactory({ createRedisConnection: redisConnections.create, distributedStore })

export const runsMetadataQueue = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        const queueName = QueueName.RUNS_METADATA

        const config: RunsMetadataQueueConfig = {
            redisFailedJobRetentionDays: system.getNumberOrThrow(AppSystemProp.REDIS_FAILED_JOB_RETENTION_DAYS),
            redisFailedJobRetentionMaxCount: system.getNumberOrThrow(AppSystemProp.REDIS_FAILED_JOB_RETENTION_MAX_COUNT),
        }
        await queue.init(config)
        runsMetadataWorker = new Worker<RunsMetadataJobData>(
            queueName,
            async (job) => {
                log.info({
                    job: { id: job.id },
                    execution: { id: job.data.runId },
                }, '[runsMetadataQueue#worker] Saving runs metadata')
                const key = redisMetadataKey(job.data.runId)
                await distributedLock(log).runExclusive({
                    key: `runs_metadata_${job.data.runId}`,
                    timeoutInSeconds: 30,
                    fn: async () => {
                        try {
                            await runsMetadataQueue(log).get().removeDeduplicationKey(job.data.runId)
                            const rawRunMetadata = await distributedStore.hgetJson<RunsMetadataUpsertData>(key)
                            if (isNil(rawRunMetadata) || Object.keys(rawRunMetadata).length === 0) {
                                log.info({
                                    job: { id: job.id },
                                    execution: { id: job.data.runId },
                                }, '[runsMetadataQueue#worker] Runs metadata not found, skipping job')
                                return
                            }
                            const runMetadata = sanitizeObjectForPostgresql(rawRunMetadata)

                            const existingExecution = await executionRepo().findOneBy({ id: job.data.runId })
                            let savedExecution: Execution
                            if (!isNil(existingExecution)) {
                                const timeline = buildTimeline({ existingExecution, runMetadata })
                                await executionRepo().update(job.data.runId, {
                                    ...spreadIfDefined('timeline', timeline),
                                    ...spreadIfDefined('workspaceId', runMetadata.workspaceId),
                                    ...spreadIfDefined('workflowId', runMetadata.workflowId),
                                    ...spreadIfDefined('workflowVersionId', runMetadata.workflowVersionId),
                                    ...spreadIfDefined('environment', runMetadata.environment),
                                    ...spreadIfDefined('startTime', runMetadata.startTime),
                                    ...spreadIfDefined('finishTime', runMetadata.finishTime),
                                    ...spreadIfDefined('status', runMetadata.status),
                                    ...spreadIfDefined('tags', runMetadata.tags),
                                    ...spreadIfDefined('failedStep', runMetadata.failedStep),
                                    ...spreadIfDefined('stepNameToTest', runMetadata.stepNameToTest),
                                    ...spreadIfDefined('parentRunId', runMetadata.parentRunId),
                                    ...spreadIfDefined('failParentOnFailure', runMetadata.failParentOnFailure),
                                    ...spreadIfDefined('logsFileId', runMetadata.logsFileId),
                                    ...spreadIfDefined('updated', runMetadata.updated),
                                    ...spreadIfDefined('stepsCount', runMetadata.stepsCount),
                                })
                                const updatedExecution = await executionRepo().findOneBy({ id: job.data.runId })
                                if (isNil(updatedExecution)) {
                                    log.info({
                                        job: { id: job.id },
                                        execution: { id: job.data.runId },
                                    }, '[runsMetadataQueue#worker] Workflow run was deleted during update, skipping job')
                                    return
                                }
                                savedExecution = updatedExecution
                            }
                            else {
                                const workflowId = runMetadata.workflowId
                                const workflowExists = !isNil(workflowId) && await workflowService(log).exists(workflowId)
                                if (!workflowExists) {
                                    log.info({
                                        job: { id: job.id },
                                        execution: { id: job.data.runId },
                                    }, '[runsMetadataQueue#worker] Workflow does not exist (deleted), skipping job')
                                    return
                                }
                                savedExecution = await executionRepo().save(runMetadata)
                            }

                            const parentRunId = savedExecution.parentRunId
                            const shouldMarkParentAsFailed = savedExecution.failParentOnFailure && !isNil(parentRunId) && ![ExecutionStatus.SUCCEEDED, ExecutionStatus.RUNNING, ExecutionStatus.PAUSED, ExecutionStatus.QUEUED].includes(savedExecution.status)
                            if (shouldMarkParentAsFailed) {
                                await markParentRunAsFailed({
                                    parentRunId,
                                    childRunId: savedExecution.id,
                                    workspaceId: savedExecution.workspaceId,
                                    log,
                                })
                            }

                            if (!isNil(runMetadata.requestId)) {
                                await distributedStore.deleteKeyIfFieldValueMatches(key, 'requestId', runMetadata.requestId)
                            }
                            if (!isNil(runMetadata.finishTime)) {
                                const tenantId = await workspaceService(log).getTenantId(savedExecution.workspaceId)
                                await executionSideEffects(log).onFinish({ execution: savedExecution, tenantId })
                            }

                            if (savedExecution.status === ExecutionStatus.PAUSED) {
                                const latestWaitpoint = await waitpointService(log).getByExecutionId(savedExecution.id)
                                const isPreCompleted = !isNil(latestWaitpoint)
                                    && latestWaitpoint.status === WaitpointStatus.COMPLETED
                                if (isPreCompleted) {
                                    await resumeService(log).resumeFromWaitpointWithoutLock({
                                        executionId: savedExecution.id,
                                        waitpointId: latestWaitpoint.id,
                                        resumePayload: latestWaitpoint.resumePayload,
                                    })
                                }
                            }
                        }
                        catch (error) {
                            log.error({
                                error,
                                data: job.data,
                            }, '[runsMetadataQueue#worker] Error saving runs metadata')
                            exceptionHandler.handle(error, log)
                            throw error
                        }
                    },
                })

            },
            {
                connection: await redisConnections.create(),
                concurrency: system.getNumberOrThrow(AppSystemProp.RUNS_METADATA_UPDATE_CONCURRENCY),
                autorun: true,
            },
        )

        await runsMetadataWorker.waitUntilReady()
    },

    async add(params: RunsMetadataUpsertData): Promise<void> {
        log.info({
            execution: { id: params.id },
            workspace: { id: params.workspaceId },
        }, '[runsMetadataQueue#add] Adding runs metadata to queue')
        await queue.add(params)
    },

    get(): Queue<RunsMetadataJobData> {
        return queue.get()
    },
    async close(): Promise<void> {
        if (queue.get()) {
            await queue.get().close()
        }

        if (runsMetadataWorker) {
            await runsMetadataWorker.close()
        }
    },

})

function buildTimeline({ existingExecution, runMetadata }: BuildTimelineParams): RunTimeline | undefined {
    return buildRunTimeline({
        existingTimeline: existingExecution.timeline,
        created: existingExecution.created,
        startTime: runMetadata.startTime ?? existingExecution.startTime,
        finishTime: runMetadata.finishTime ?? existingExecution.finishTime,
        provisionMs: runMetadata.provisionMs,
        bootMs: runMetadata.bootMs,
        runMs: runMetadata.runMs,
    })
}

export async function markParentRunAsFailed({
    parentRunId,
    childRunId,
    workspaceId,
    log,
}: MarkParentRunAsFailedParams): Promise<void> {
    const execution = await executionRepo().findOneBy({
        id: parentRunId,
        workspaceId,
    })

    if (isNil(execution) || isExecutionStateTerminal({ status: execution.status, ignoreInternalError: false })) {
        return
    }

    const childRunUrl = await domainHelper.getPublicUrl({ path: `/workspaces/${workspaceId}/runs/${childRunId}` })
    const errorPayload = {
        body: {
            status: 'error',
            data: {
                message: 'Subflow execution failed',
                link: childRunUrl,
            },
        },
        headers: {},
        queryParams: {},
    }

    const existingWaitpoint = await waitpointService(log).getByExecutionId(parentRunId)
    const result = await waitpointService(log).complete({
        executionId: parentRunId,
        workspaceId: execution.workspaceId,
        waitpointId: existingWaitpoint?.id ?? apId(),
        resumePayload: errorPayload,
    })

    if (result.completedExisting && !isNil(result.waitpoint)) {
        await resumeService(log).resumeFromWaitpoint({
            executionId: parentRunId,
            waitpointId: result.waitpoint.id,
            resumePayload: result.waitpoint.resumePayload,
        })
    }
}

type BuildTimelineParams = {
    existingExecution: Execution
    runMetadata: RunsMetadataUpsertData
}

type MarkParentRunAsFailedParams = {
    parentRunId: string
    childRunId: string
    workspaceId: string
    log: FastifyBaseLogger
}
