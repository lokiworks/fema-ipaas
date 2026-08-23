import { apId, Cursor, ErrorCode, FlowId, FlowRunId, FlowVersionId, isNil, PlatformError, PlatformId, SeekPage, WorkspaceId } from '@fema/core-utils'
import { apDayjs, wideEvent } from '@fema/server-utils'
import { ExecuteFlowJobData, ExecutionType, ExecutioOutputFile, FileCompression, FileType, FlowRetryStrategy, FlowRun, FlowRunCountByStatus, FlowRunStatus, FlowRunWithRetryError, FlowVersion, GenericStepOutput, isFlowRunStateTerminal, JobPayload, LATEST_JOB_DATA_SCHEMA_VERSION, logSerializer, LogSliceRef, ResumeReason, RunEnvironment, RunInternalError, SampleDataFileType, StepOutput, StepOutputStatus, StepOutputType, StreamStepProgress, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { ArrayContains, In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { distributedLock } from '../../database/redis-connections'
import { fileCompressor } from '../../file/file-compressor'
import { fileService, getEffectiveExecutionDataRetentionDays } from '../../file/file.service'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { Order } from '../../helper/pagination/paginator'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { payloadOffloader } from '../../workers/payload-offloader'
import { workspaceService } from '../../workspace/workspace-service'
import { flowService } from '../flow/flow.service'
import { flowVersionService } from '../flow-version/flow-version.service'
import { sampleDataService } from '../step-run/sample-data.service'
import { FlowRunEntity } from './flow-run-entity'
import { flowRunSideEffects } from './flow-run-side-effects'
import { runsMetadataQueue } from './flow-runs-queue'
import { waitpointService } from './waitpoint/waitpoint-service'

const CANCELLABLE_STATUSES: FlowRunStatus[] = [FlowRunStatus.PAUSED, FlowRunStatus.QUEUED]


export const WEBHOOK_TIMEOUT_MS = system.getNumberOrThrow(AppSystemProp.WEBHOOK_TIMEOUT_SECONDS) * 1000
export const flowRunRepo = repoFactory<FlowRun>(FlowRunEntity)

export const flowRunService = (log: FastifyBaseLogger) => ({
    async upsert({ id, workspaceId }: { id: FlowRunId, workspaceId: WorkspaceId }): Promise<FlowRun> {
        const existingFlowRun = await flowRunRepo().findOneBy({ id, workspaceId })
        if (isNil(existingFlowRun)) {
            return flowRunRepo().save({ id, workspaceId })
        }
        return existingFlowRun
    },
    async list(params: ListParams): Promise<SeekPage<FlowRun>> {
        const decodedCursor = paginationHelper.decodeCursor(params.cursor)
        const paginator = buildPaginator<FlowRun>({
            entity: FlowRunEntity,
            query: {
                limit: params.limit,
                orderBy: [
                    { field: 'created', order: Order.DESC },
                    { field: 'id', order: Order.DESC },
                ],
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })


        const whereClause: Record<string, unknown> = {
            workspaceId: params.workspaceId,
        }
        if (!isNil(params.environment)) {
            whereClause.environment = params.environment
        }
        let query = queryBuilderForFlowRun(flowRunRepo()).where(whereClause)

        if (!params.includeArchived) {
            query = query.andWhere({
                archivedAt: IsNull(),
            })
        }

        if (params.flowId) {
            query = query.andWhere({
                flowId: In(params.flowId),
            })
        }
        if (params.status) {
            query = query.andWhere({
                status: In(params.status),
            })
        }
        if (params.createdAfter) {
            query = query.andWhere('flow_run.created >= :createdAfter', {
                createdAfter: params.createdAfter,
            })
        }
        if (params.createdBefore) {
            query = query.andWhere('flow_run.created <= :createdBefore', {
                createdBefore: params.createdBefore,
            })
        }
        if (params.tags) {
            query = query.andWhere({ tags: ArrayContains(params.tags) })
        }

        if (!isNil(params.failedStepName)) {
            query = query.andWhere('flow_run."failedStep"->>\'name\' = :failedStepName', {
                failedStepName: params.failedStepName,
            })
        }
        if (!isNil(params.failedStepMessage)) {
            query = query.andWhere('flow_run."failedStep"->>\'message\' ILIKE :failedStepMessage', {
                failedStepMessage: `%${params.failedStepMessage}%`,
            })
        }
        if (params.flowRunIds) {
            query = query.andWhere({
                id: In(params.flowRunIds),
            })
        }

        const { data, cursor: newCursor } = await paginator.paginate(query)
        return paginationHelper.createPage<FlowRun>(data, newCursor)
    },
    async retry({ flowRunId, strategy, workspaceId }: RetryParams): Promise<FlowRun> {
        const oldFlowRun = await flowRunService(log).getOnePopulatedOrThrow({
            id: flowRunId,
            workspaceId,
        })
        log.info({ flowRun: { id: flowRunId }, flow: { id: oldFlowRun.flowId }, strategy }, 'Flow run retry initiated')

        const workspace = await workspaceService(log).getOneOrThrow(oldFlowRun.workspaceId)
        const retentionDays = getEffectiveExecutionDataRetentionDays(workspace.executionDataRetentionDays)
        if (
            isFlowRunStateTerminal({ status: oldFlowRun.status, ignoreInternalError: false }) &&
            isOutsideRetentionWindow(oldFlowRun.created, retentionDays)
        ) {
            throw new PlatformError({
                code: ErrorCode.FLOW_RUN_RETRY_OUTSIDE_RETENTION,
                params: {
                    flowRunId: oldFlowRun.id,
                    failedJobRetentionDays: retentionDays,
                },
            })
        }

        switch (strategy) {
            case FlowRetryStrategy.FROM_FAILED_STEP: {
                const flowVersion = await flowVersionService(log).getOneOrThrow(oldFlowRun.flowVersionId)
                const triggerStep = oldFlowRun.steps?.[flowVersion.trigger.name]
                const triggerFailed = triggerStep?.status === StepOutputStatus.FAILED
                const triggerPayload = triggerFailed
                    ? await resolveStepOutput({ step: triggerStep, flowRun: oldFlowRun, log })
                    : undefined

                await flowRunRepo().update({
                    id: oldFlowRun.id,
                    workspaceId: oldFlowRun.workspaceId,
                }, {
                    status: FlowRunStatus.QUEUED,
                    startTime: apDayjs().toISOString(),
                    finishTime: null,
                })
                const updatedFlowRun = await findFlowRunOrThrow(oldFlowRun.id)
                const platformId = await workspaceService(log).getPlatformId(updatedFlowRun.workspaceId)
                await flowRunSideEffects(log).onRetry({ flowRun: updatedFlowRun, platformId })
                if (triggerFailed) {
                    return addToQueue({
                        flowRun: updatedFlowRun,
                        platformId,
                        payload: triggerPayload,
                        streamStepProgress: StreamStepProgress.NONE,
                        executeTrigger: true,
                        executionType: ExecutionType.BEGIN,
                        workerHandlerId: undefined,
                        httpRequestId: undefined,
                    }, log)
                }
                return addToQueue({
                    flowRun: updatedFlowRun,
                    platformId,
                    streamStepProgress: StreamStepProgress.NONE,
                    executionType: ExecutionType.RESUME,
                    resumeReason: ResumeReason.RETRY,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                }, log)
            }
            case FlowRetryStrategy.ON_LATEST_VERSION: {
                const latestFlowVersion = await flowVersionService(log).getLatestLockedVersionOrThrow(
                    oldFlowRun.flowId,
                )
                const triggerStep = oldFlowRun.steps?.[latestFlowVersion.trigger.name]
                const triggerFailed = triggerStep?.status === StepOutputStatus.FAILED
                const payload = await resolveStepOutput({ step: triggerStep, flowRun: oldFlowRun, log })
                return this.start({
                    flowId: oldFlowRun.flowId,
                    payload,
                    platformId: await workspaceService(log).getPlatformId(oldFlowRun.workspaceId),
                    executionType: ExecutionType.BEGIN,
                    streamStepProgress: StreamStepProgress.NONE,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                    executeTrigger: triggerFailed,
                    environment: oldFlowRun.environment,
                    flowVersionId: latestFlowVersion.id,
                    workspaceId: oldFlowRun.workspaceId,
                    failParentOnFailure: oldFlowRun.failParentOnFailure,
                    parentRunId: oldFlowRun.parentRunId,
                })
            }
        }
    },
    async cancel({ workspaceId, platformId, flowRunIds, excludeFlowRunIds, status, flowId, createdAfter, createdBefore }: CancelParams): Promise<void> {
        const filteredStatus = status ?? CANCELLABLE_STATUSES
        const flowRuns = await filterFlowRunsAndApplyFilters({
            workspaceId,
            flowRunIds,
            status: filteredStatus,
            flowId,
            createdAfter,
            createdBefore,
            excludeFlowRunIds,
        })
        const cancelParentFlowRuns = await Promise.allSettled(flowRuns.map(flowRun => cancelSingleRun(log, flowRun, platformId)))
        const childFlows = await getAllChildRuns(flowRuns.map(flowRun => flowRun.id))
        log.info({
            flowRunsCount: flowRuns.length,
            childFlowCount: childFlows.length,
        }, 'Found cancellable descendant flows')

        const canceChildlPromises = await Promise.allSettled(childFlows.map(flowRun => cancelSingleRun(log, flowRun, platformId)))
        if (cancelParentFlowRuns.some(r => r.status === 'rejected')) {
            throw cancelParentFlowRuns.find(r => r.status === 'rejected')!.reason
        }
        if (canceChildlPromises.some(r => r.status === 'rejected')) {
            throw canceChildlPromises.find(r => r.status === 'rejected')!.reason
        }
    },
    async existsBy(runId: FlowRunId): Promise<boolean> {
        return flowRunRepo().existsBy({ id: runId })
    },
    async bulkArchive(params: BulkArchiveActionParams): Promise<void> {
        const filteredFlowRuns = await filterFlowRunsAndApplyFilters(params)
        await flowRunRepo().update({
            id: In(filteredFlowRuns.map(flowRun => flowRun.id)),
            workspaceId: params.workspaceId,
        }, {
            archivedAt: new Date().toISOString(),
        })
    },
    async bulkRetry(params: BulkRetryParams): Promise<FlowRunWithRetryError[]> {
        const filteredFlowRuns = await filterFlowRunsAndApplyFilters(params)
        const limit = pLimit(10)
        const results = await Promise.allSettled(
            filteredFlowRuns.map(flowRun =>
                limit(() => this.retry({ flowRunId: flowRun.id, strategy: params.strategy, workspaceId: params.workspaceId })),
            ),
        )
        return results.map((result, i) => {
            if (result.status === 'fulfilled') {
                return result.value
            }
            const error = result.reason instanceof PlatformError ? result.reason : undefined
            return {
                ...filteredFlowRuns[i],
                error: {
                    errorCode: error?.error.code ?? ErrorCode.INTERNAL_SERVER_ERROR,
                    errorMessage: error?.message ?? 'Internal server error',
                },
            }
        })
    },
    async start({
        flowId,
        payload,
        executeTrigger,
        executionType,
        workerHandlerId,
        streamStepProgress,
        httpRequestId,
        workspaceId,
        flowVersionId,
        parentRunId,
        failParentOnFailure,
        platformId,
        stepNameToTest,
        environment,
    }: StartParams): Promise<FlowRun> {
        const newFlowRun = await queueOrCreateInstantly({
            workspaceId,
            flowVersionId,
            parentRunId,
            flowId,
            failParentOnFailure,
            stepNameToTest,
            environment,
        }, log)

        wideEvent.set({
            flowRun: {
                id: newFlowRun.id,
                environment,
                executionType,
            },
            flow: { id: flowId },
        })

        await addToQueue({
            flowRun: newFlowRun,
            platformId,
            payload,
            executeTrigger,
            executionType,
            workerHandlerId,
            httpRequestId,
            streamStepProgress,
        }, log)

        await flowRunSideEffects(log).onStart({ flowRun: newFlowRun, platformId })
        log.info({ flowRun: { id: newFlowRun.id }, flow: { id: flowId }, workspace: { id: workspaceId }, executionType }, 'Flow run started')
        return newFlowRun
    },

    async createQuotaExceededRun({ flowVersion, payload, workspaceId, environment, parentRunId, failParentOnFailure, triggeredBy, shouldExecuteTriggerOnRetry }: CreateQuotaExceededRunParams): Promise<FlowRun> {
        const now = new Date().toISOString()
        const logsFileId = apId()
        await persistQuotaExceededTriggerLog({ log, flowVersion, workspaceId, payload, logsFileId, shouldExecuteTriggerOnRetry })
        const flowRun: FlowRun = {
            id: apId(),
            workspaceId,
            flowId: flowVersion.flowId,
            flowVersionId: flowVersion.id,
            environment,
            parentRunId,
            failParentOnFailure: failParentOnFailure ?? true,
            status: FlowRunStatus.QUOTA_EXCEEDED,
            created: now,
            updated: now,
            startTime: now,
            finishTime: now,
            logsFileId,
            tags: [],
            steps: {},
            triggeredBy,
        }
        await runsMetadataQueue(log).add(flowRun)
        log.info({ flowRun: { id: flowRun.id }, flow: { id: flowVersion.flowId }, workspace: { id: workspaceId } }, 'Flow run admitted as QUOTA_EXCEEDED')
        return flowRun
    },

    async test({ workspaceId, flowVersionId, parentRunId, stepNameToTest, triggeredBy }: TestParams): Promise<FlowRun> {
        const flowVersion = await flowVersionService(log).getOneOrThrow(flowVersionId)
        await flowService(log).getOneOrThrow({ id: flowVersion.flowId, workspaceId })

        const triggerPayload = await sampleDataService(log).getOrReturnEmpty({
            workspaceId,
            flowVersion,
            stepName: flowVersion.trigger.name,
            type: SampleDataFileType.OUTPUT,
        })
        const flowRun = await queueOrCreateInstantly({
            workspaceId,
            flowId: flowVersion.flowId,
            flowVersionId: flowVersion.id,
            environment: RunEnvironment.TESTING,
            parentRunId,
            failParentOnFailure: undefined,
            stepNameToTest,
            triggeredBy,
        }, log)
        return addToQueue({
            flowRun,
            payload: triggerPayload,
            executionType: ExecutionType.BEGIN,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            platformId: await workspaceService(log).getPlatformId(workspaceId),
            executeTrigger: false,
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            sampleData: !isNil(stepNameToTest) ? await sampleDataService(log).getSampleDataForFlow(workspaceId, flowVersion, SampleDataFileType.OUTPUT) : undefined,
        }, log)
    },
    async startManualTrigger({ workspaceId, flowVersionId, triggeredBy }: StartManualTriggerParams): Promise<FlowRun> {
        const flowVersion = await flowVersionService(log).getOneOrThrow(flowVersionId)
        await flowService(log).getOneOrThrow({ id: flowVersion.flowId, workspaceId })
        const triggerPayload = {}
        const platformId = await workspaceService(log).getPlatformId(workspaceId)

        const creditsExhausted = false
        if (creditsExhausted) {
            return this.createQuotaExceededRun({
                flowVersion,
                payload: triggerPayload,
                workspaceId,
                environment: RunEnvironment.PRODUCTION,
                parentRunId: undefined,
                failParentOnFailure: undefined,
                triggeredBy,
                shouldExecuteTriggerOnRetry: false,
            })
        }

        const flowRun = await queueOrCreateInstantly({
            workspaceId,
            flowId: flowVersion.flowId,
            flowVersionId: flowVersion.id,
            environment: RunEnvironment.PRODUCTION,
            parentRunId: undefined,
            failParentOnFailure: undefined,
            stepNameToTest: undefined,
            triggeredBy,
        }, log)
        return addToQueue({
            flowRun,
            payload: triggerPayload,
            executionType: ExecutionType.BEGIN,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            platformId,
            executeTrigger: false,
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            sampleData: undefined,
        }, log)
    },
    async getOne(params: GetOneParams): Promise<FlowRun | null> {
        const flowRun = await queryBuilderForFlowRun(flowRunRepo()).where({
            id: params.id,
            ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
        }).getOne()

        return flowRun
    },
    async getOneOrThrow(params: GetOneParams): Promise<FlowRun> {
        const flowRun = await this.getOne(params)

        if (isNil(flowRun)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'flow_run',
                    entityId: params.id,
                    message: 'Flow run not found',
                },
            })
        }

        return flowRun
    },
    async getStepsOrNull({ flowRun }: { flowRun: FlowRun }): Promise<Record<string, StepOutput> | null> {
        if (isNil(flowRun.logsFileId)) {
            return null
        }
        const stateFile = await readLogsFile(log, flowRun.logsFileId, flowRun.workspaceId)
        return stateFile?.executionState.steps ?? null
    },
    async countByStatus(params: CountByStatusParams): Promise<FlowRunCountByStatus[]> {
        let query = flowRunRepo().createQueryBuilder('flow_run')
            .select('flow_run.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where({
                workspaceId: params.workspaceId,
                environment: RunEnvironment.PRODUCTION,
                archivedAt: IsNull(),
            })
            .groupBy('flow_run.status')

        if (params.createdAfter) {
            query = query.andWhere('flow_run.created >= :createdAfter', { createdAfter: params.createdAfter })
        }
        if (params.createdBefore) {
            query = query.andWhere('flow_run.created <= :createdBefore', { createdBefore: params.createdBefore })
        }

        const results = await query.getRawMany()
        return results.map((r: { status: FlowRunStatus, count: string }) => ({ status: r.status, count: parseInt(r.count, 10) }))
    },
    async getOnePopulatedOrThrow(params: GetOneParams): Promise<FlowRun> {
        const flowRun = await this.getOneOrThrow(params)
        let steps = {}
        let internalError: RunInternalError | undefined = undefined
        if (!isNil(flowRun.logsFileId)) {
            const stateFile = await readLogsFile(log, flowRun.logsFileId, flowRun.workspaceId)
            if (!isNil(stateFile)) {
                steps = stateFile.executionState.steps
                internalError = stateFile.internalError
            }
        }
        return {
            ...flowRun,
            steps,
            internalError,
        }
    },
})


async function cancelSingleRun(log: FastifyBaseLogger, flowRun: FlowRun, platformId: string): Promise<void> {
    await distributedLock(log).runExclusive({
        key: `runs_metadata_${flowRun.id}`,
        timeoutInSeconds: 30,
        fn: async () => {
            await jobQueue(log).removeAllFlowRunJobs({ flowRunId: flowRun.id, platformId, workspaceId: flowRun.workspaceId })
            await waitpointService(log).deleteByFlowRunId(flowRun.id)
            await runsMetadataQueue(log).add({
                id: flowRun.id,
                workspaceId: flowRun.workspaceId,
                status: FlowRunStatus.CANCELED,
            })
        },
    })
    log.info({
        flowRun: { id: flowRun.id },
        flow: { id: flowRun.flowId },
    }, 'Flow run cancelled')
}

async function getAllChildRuns(parentRunIds: string[]): Promise<FlowRun[]> {
    if (parentRunIds.length === 0) {
        return []
    }

    const query = `
        WITH RECURSIVE descendants AS (
            SELECT *
            FROM flow_run
            WHERE "parentRunId" = ANY($1)
              AND status = ANY($2)

            UNION ALL

            SELECT f.*
            FROM flow_run f
            INNER JOIN descendants d ON f."parentRunId" = d.id
            WHERE f.status = ANY($2)
        )
        SELECT * FROM descendants;
    `

    const params = [
        parentRunIds,
        CANCELLABLE_STATUSES,
    ]

    const results = await flowRunRepo().query(query, params)
    return results as FlowRun[]
}


async function filterFlowRunsAndApplyFilters(
    params: FilterFlowRunsAndApplyFiltersParams,
): Promise<FlowRun[]> {
    let query = flowRunRepo().createQueryBuilder('flow_run').where({
        workspaceId: params.workspaceId,
        environment: RunEnvironment.PRODUCTION,
    })

    if (!isNil(params.flowRunIds) && params.flowRunIds.length > 0) {
        query = query.andWhere({
            id: In(params.flowRunIds),
        })
    }

    if (!isNil(params.archived)) {
        query = query.andWhere({
            archivedAt: params.archived ? Not(IsNull()) : IsNull(),
        })
    }

    if (params.flowId && params.flowId.length > 0) {
        query = query.andWhere({
            flowId: In(params.flowId),
        })
    }
    if (params.status && params.status.length > 0) {
        query = query.andWhere({
            status: In(params.status),
        })
    }
    if (params.createdAfter) {
        query = query.andWhere('flow_run.created >= :createdAfter', {
            createdAfter: params.createdAfter,
        })
    }
    if (params.createdBefore) {
        query = query.andWhere('flow_run.created <= :createdBefore', {
            createdBefore: params.createdBefore,
        })
    }
    if (params.excludeFlowRunIds && params.excludeFlowRunIds.length > 0) {
        query = query.andWhere({
            id: Not(In(params.excludeFlowRunIds)),
        })
    }

    if (params.failedStepName) {
        query = query.andWhere('flow_run.failedStepName = :failedStepName', {
            failedStepName: params.failedStepName,
        })
    }
    if (params.failedStepMessage) {
        query = query.andWhere('flow_run."failedStep"->>\'message\' ILIKE :failedStepMessage', {
            failedStepMessage: `%${params.failedStepMessage}%`,
        })
    }

    const flowRuns = await query.getMany()
    return flowRuns
}


export async function addToQueue(params: AddToQueueParams, log: FastifyBaseLogger): Promise<FlowRun> {
    const logsFileId = params.flowRun.logsFileId ?? apId()

    let jobPayload: JobPayload = { type: 'inline', value: null }
    if (!isNil(params.payload) && isNil(params.workerHandlerId)) {
        jobPayload = await payloadOffloader.offloadPayload(log, params.payload, params.flowRun.workspaceId, params.platformId)
    }
    else if (!isNil(params.payload)) {
        jobPayload = await payloadOffloader.maybeOffloadPayload(log, params.payload, params.flowRun.workspaceId, params.platformId)
    }

    const commonJobData = {
        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
        workerHandlerId: params.workerHandlerId ?? null,
        workspaceId: params.flowRun.workspaceId,
        platformId: params.platformId,
        environment: params.flowRun.environment,
        flowId: params.flowRun.flowId,
        runId: params.flowRun.id,
        jobType: WorkerJobType.EXECUTE_FLOW as const,
        flowVersionId: params.flowRun.flowVersionId,
        payload: jobPayload,
        httpRequestId: params.httpRequestId,
        streamStepProgress: params.streamStepProgress,
        stepNameToTest: params.flowRun.stepNameToTest ?? undefined,
        sampleData: params.sampleData,
        logsFileId,
    }
    const data: ExecuteFlowJobData = params.executionType === ExecutionType.RESUME
        ? {
            ...commonJobData,
            executionType: ExecutionType.RESUME,
            resumeReason: params.resumeReason,
        }
        : {
            ...commonJobData,
            executionType: ExecutionType.BEGIN,
            executeTrigger: params.executeTrigger,
        }
    await jobQueue(log).add({
        id: params.jobId ?? params.flowRun.id,
        type: JobType.ONE_TIME,
        data,
    })
    return params.flowRun
}

export async function findFlowRunOrThrow(flowRunId: FlowRunId): Promise<FlowRun> {
    const flowRun = await queryBuilderForFlowRun(flowRunRepo()).where({ id: flowRunId }).getOne()
    if (isNil(flowRun)) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'flow_run',
                entityId: flowRunId,
                message: 'Flow run not found',
            },
        })
    }
    return flowRun
}

function queryBuilderForFlowRun(repo: Repository<FlowRun>): SelectQueryBuilder<FlowRun> {
    return repo.createQueryBuilder('flow_run')
        .leftJoinAndSelect('flow_run.flowVersion', 'flowVersion')
        .addSelect(['"flowVersion"."displayName"'])
}

async function resolveStepOutput({ step, flowRun, log }: ResolveStepOutputParams): Promise<unknown> {
    if (isNil(step)) {
        return undefined
    }
    if (step.outputType !== StepOutputType.SLICE) {
        return step.output
    }
    const ref = step.output as LogSliceRef
    const file = await fileService(log).getDataOrUndefined({
        workspaceId: flowRun.workspaceId,
        fileId: ref.fileId,
        type: FileType.FLOW_RUN_LOG_SLICE,
    })
    if (isNil(file)) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'file',
                entityId: ref.fileId,
                message: `Trigger output was offloaded to storage but its slice file is missing; flow run ${flowRun.id} cannot be retried without the trigger payload`,
            },
        })
    }
    return JSON.parse(file.data.toString('utf-8'))
}

async function readLogsFile(log: FastifyBaseLogger, logsFileId: string, workspaceId: string): Promise<ExecutioOutputFile | null> {
    const result = await fileService(log).getDataOrUndefined({
        workspaceId,
        fileId: logsFileId,
        type: FileType.FLOW_RUN_LOG,
    })
    if (isNil(result)) {
        return null
    }
    return JSON.parse(result.data.toString('utf-8'))
}

async function persistQuotaExceededTriggerLog({ log, flowVersion, workspaceId, payload, logsFileId, shouldExecuteTriggerOnRetry }: PersistQuotaExceededTriggerLogParams): Promise<void> {
    const triggerStep = GenericStepOutput.create({
        input: {},
        type: flowVersion.trigger.type,
        status: shouldExecuteTriggerOnRetry ? StepOutputStatus.FAILED : StepOutputStatus.SUCCEEDED,
        output: payload,
    })
    const outputFile: ExecutioOutputFile = {
        executionState: {
            steps: { [flowVersion.trigger.name]: triggerStep },
            tags: [],
        },
    }
    const data = await fileCompressor.compress({
        data: await logSerializer.serialize(outputFile),
        compression: FileCompression.ZSTD,
    })
    const platformId = await workspaceService(log).getPlatformId(workspaceId)
    await fileService(log).save({
        fileId: logsFileId,
        workspaceId,
        platformId,
        type: FileType.FLOW_RUN_LOG,
        data,
        size: data.length,
        compression: FileCompression.ZSTD,
    })
}

async function queueOrCreateInstantly(params: CreateParams, log: FastifyBaseLogger): Promise<FlowRun> {
    const now = new Date().toISOString()
    const flowRun: FlowRun = {
        id: apId(),
        workspaceId: params.workspaceId,
        flowId: params.flowId,
        flowVersionId: params.flowVersionId,
        environment: params.environment,
        parentRunId: params.parentRunId,
        failParentOnFailure: params.failParentOnFailure ?? true,
        status: FlowRunStatus.QUEUED,
        stepNameToTest: params.stepNameToTest,
        created: now,
        updated: now,
        tags: [],
        steps: {},
        triggeredBy: params.triggeredBy,
    }
    switch (params.environment) {
        case RunEnvironment.TESTING:
            return flowRunRepo().save(flowRun)
        case RunEnvironment.PRODUCTION:
            await runsMetadataQueue(log).add(flowRun)
            return flowRun
    }
}

export function isOutsideRetentionWindow(createdTime: string, retentionDays: number): boolean {
    if (!createdTime) return false
    return apDayjs(createdTime).add(retentionDays, 'day').isBefore(apDayjs())
}

type CreateParams = {
    workspaceId: WorkspaceId
    flowVersionId: FlowVersionId
    triggeredBy?: string
    parentRunId?: FlowRunId
    failParentOnFailure: boolean | undefined
    stepNameToTest?: string
    flowId: FlowId
    environment: RunEnvironment
}

type ListParams = {
    workspaceId: WorkspaceId
    flowId: FlowId[] | undefined
    status: FlowRunStatus[] | undefined
    cursor: Cursor | null
    tags?: string[]
    limit: number
    createdAfter?: string
    createdBefore?: string
    failedStepName?: string
    failedStepMessage?: string
    flowRunIds?: FlowRunId[]
    includeArchived?: boolean
    environment?: RunEnvironment
}

type GetOneParams = {
    id: FlowRunId
    workspaceId: WorkspaceId | undefined
}

type ResolveStepOutputParams = {
    step: StepOutput | undefined
    flowRun: FlowRun
    log: FastifyBaseLogger
}

type AddToQueueParamsCommon = {
    flowRun: FlowRun
    platformId: PlatformId
    payload?: unknown
    workerHandlerId: string | undefined
    httpRequestId: string | undefined
    streamStepProgress: StreamStepProgress
    sampleData?: Record<string, unknown>
    jobId?: string
}

export type AddToQueueParams = AddToQueueParamsCommon & (
    | { executionType: ExecutionType.BEGIN, executeTrigger: boolean }
    | { executionType: ExecutionType.RESUME, resumeReason: ResumeReason }
)


type CreateQuotaExceededRunParams = {
    flowVersion: FlowVersion
    payload: unknown
    workspaceId: WorkspaceId
    environment: RunEnvironment
    parentRunId?: FlowRunId
    failParentOnFailure: boolean | undefined
    triggeredBy?: string
    shouldExecuteTriggerOnRetry: boolean
}

type PersistQuotaExceededTriggerLogParams = {
    log: FastifyBaseLogger
    flowVersion: FlowVersion
    workspaceId: WorkspaceId
    payload: unknown
    logsFileId: string
    shouldExecuteTriggerOnRetry: boolean
}

type StartParams = {
    flowId: FlowId
    payload: unknown
    platformId: PlatformId
    environment: RunEnvironment
    flowVersionId: FlowVersionId
    workspaceId: WorkspaceId
    parentRunId?: FlowRunId
    failParentOnFailure: boolean | undefined
    stepNameToTest?: string
    executeTrigger: boolean
    executionType: ExecutionType.BEGIN
    workerHandlerId: string | undefined
    httpRequestId: string | undefined
    streamStepProgress: StreamStepProgress
    sampleData?: Record<string, unknown>
}



type TestParams = {
    workspaceId: WorkspaceId
    flowVersionId: FlowVersionId
    triggeredBy?: string
    parentRunId?: FlowRunId
    stepNameToTest?: string
}

type StartManualTriggerParams = {
    workspaceId: WorkspaceId
    flowVersionId: FlowVersionId
    triggeredBy: string
}
type RetryParams = {
    flowRunId: FlowRunId
    strategy: FlowRetryStrategy
    workspaceId: WorkspaceId
}

type CancelParams = {
    workspaceId: WorkspaceId
    platformId: PlatformId
    flowRunIds?: FlowRunId[]
    excludeFlowRunIds?: FlowRunId[]
    status?: FlowRunStatus[]
    flowId?: FlowId[]
    createdAfter?: string
    createdBefore?: string
}

type BulkRetryParams = {
    workspaceId: WorkspaceId
    flowRunIds?: FlowRunId[]
    strategy: FlowRetryStrategy
    status?: FlowRunStatus[]
    flowId?: FlowId[]
    createdAfter?: string
    archived?: boolean
    createdBefore?: string
    excludeFlowRunIds?: FlowRunId[]
    failedStepName?: string
    failedStepMessage?: string
}

type BulkArchiveActionParams = {
    workspaceId: WorkspaceId
    flowRunIds?: FlowRunId[]
    status?: FlowRunStatus[]
    flowId?: FlowId[]
    createdAfter?: string
    archived?: boolean
    createdBefore?: string
    excludeFlowRunIds?: FlowRunId[]
    failedStepName?: string
    failedStepMessage?: string
}

type CountByStatusParams = {
    workspaceId: WorkspaceId
    createdAfter?: string
    createdBefore?: string
}

type FilterFlowRunsAndApplyFiltersParams = {
    workspaceId: WorkspaceId
    flowRunIds?: FlowRunId[]
    status?: FlowRunStatus[]
    archived?: boolean
    flowId?: FlowId[]
    createdAfter?: string
    createdBefore?: string
    excludeFlowRunIds?: FlowRunId[]
    failedStepName?: string
    failedStepMessage?: string
}
