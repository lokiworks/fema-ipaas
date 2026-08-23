import { apId, ApplicationError, Cursor, ErrorCode, ExecutionId, isNil, SeekPage, TenantId, WorkflowId, WorkflowVersionId, WorkspaceId } from '@fema/core-utils'
import { apDayjs, wideEvent } from '@fema/server-utils'
import { ExecuteWorkflowJobData, Execution, ExecutionCountByStatus, ExecutionStatus, ExecutionType, ExecutionWithRetryError, ExecutioOutputFile, FileCompression, FileType, GenericStepOutput, isExecutionStateTerminal, JobPayload, LATEST_JOB_DATA_SCHEMA_VERSION, logSerializer, LogSliceRef, ResumeReason, RunEnvironment, RunInternalError, SampleDataFileType, StepOutput, StepOutputStatus, StepOutputType, StreamStepProgress, WorkerJobType, WorkflowRetryStrategy, WorkflowVersion } from '@fema/shared'
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
import { sampleDataService } from '../step-run/sample-data.service'
import { workflowService } from '../workflow/workflow.service'
import { workflowVersionService } from '../workflow-version/workflow-version.service'
import { ExecutionEntity } from './execution-entity'
import { executionSideEffects } from './execution-side-effects'
import { runsMetadataQueue } from './executions-queue'
import { waitpointService } from './waitpoint/waitpoint-service'

const CANCELLABLE_STATUSES: ExecutionStatus[] = [ExecutionStatus.PAUSED, ExecutionStatus.QUEUED]


export const WEBHOOK_TIMEOUT_MS = system.getNumberOrThrow(AppSystemProp.WEBHOOK_TIMEOUT_SECONDS) * 1000
export const executionRepo = repoFactory<Execution>(ExecutionEntity)

export const executionService = (log: FastifyBaseLogger) => ({
    async upsert({ id, workspaceId }: { id: ExecutionId, workspaceId: WorkspaceId }): Promise<Execution> {
        const existingExecution = await executionRepo().findOneBy({ id, workspaceId })
        if (isNil(existingExecution)) {
            return executionRepo().save({ id, workspaceId })
        }
        return existingExecution
    },
    async list(params: ListParams): Promise<SeekPage<Execution>> {
        const decodedCursor = paginationHelper.decodeCursor(params.cursor)
        const paginator = buildPaginator<Execution>({
            entity: ExecutionEntity,
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
        let query = queryBuilderForExecution(executionRepo()).where(whereClause)

        if (!params.includeArchived) {
            query = query.andWhere({
                archivedAt: IsNull(),
            })
        }

        if (params.workflowId) {
            query = query.andWhere({
                workflowId: In(params.workflowId),
            })
        }
        if (params.status) {
            query = query.andWhere({
                status: In(params.status),
            })
        }
        if (params.createdAfter) {
            query = query.andWhere('execution.created >= :createdAfter', {
                createdAfter: params.createdAfter,
            })
        }
        if (params.createdBefore) {
            query = query.andWhere('execution.created <= :createdBefore', {
                createdBefore: params.createdBefore,
            })
        }
        if (params.tags) {
            query = query.andWhere({ tags: ArrayContains(params.tags) })
        }

        if (!isNil(params.failedStepName)) {
            query = query.andWhere('execution."failedStep"->>\'name\' = :failedStepName', {
                failedStepName: params.failedStepName,
            })
        }
        if (!isNil(params.failedStepMessage)) {
            query = query.andWhere('execution."failedStep"->>\'message\' ILIKE :failedStepMessage', {
                failedStepMessage: `%${params.failedStepMessage}%`,
            })
        }
        if (params.executionIds) {
            query = query.andWhere({
                id: In(params.executionIds),
            })
        }

        const { data, cursor: newCursor } = await paginator.paginate(query)
        return paginationHelper.createPage<Execution>(data, newCursor)
    },
    async retry({ executionId, strategy, workspaceId }: RetryParams): Promise<Execution> {
        const oldExecution = await executionService(log).getOnePopulatedOrThrow({
            id: executionId,
            workspaceId,
        })
        log.info({ execution: { id: executionId }, workflow: { id: oldExecution.workflowId }, strategy }, 'Workflow run retry initiated')

        const workspace = await workspaceService(log).getOneOrThrow(oldExecution.workspaceId)
        const retentionDays = getEffectiveExecutionDataRetentionDays(workspace.executionDataRetentionDays)
        if (
            isExecutionStateTerminal({ status: oldExecution.status, ignoreInternalError: false }) &&
            isOutsideRetentionWindow(oldExecution.created, retentionDays)
        ) {
            throw new ApplicationError({
                code: ErrorCode.EXECUTION_RETRY_OUTSIDE_RETENTION,
                params: {
                    executionId: oldExecution.id,
                    failedJobRetentionDays: retentionDays,
                },
            })
        }

        switch (strategy) {
            case WorkflowRetryStrategy.FROM_FAILED_STEP: {
                const workflowVersion = await workflowVersionService(log).getOneOrThrow(oldExecution.workflowVersionId)
                const triggerStep = oldExecution.steps?.[workflowVersion.trigger.name]
                const triggerFailed = triggerStep?.status === StepOutputStatus.FAILED
                const triggerPayload = triggerFailed
                    ? await resolveStepOutput({ step: triggerStep, execution: oldExecution, log })
                    : undefined

                await executionRepo().update({
                    id: oldExecution.id,
                    workspaceId: oldExecution.workspaceId,
                }, {
                    status: ExecutionStatus.QUEUED,
                    startTime: apDayjs().toISOString(),
                    finishTime: null,
                })
                const updatedExecution = await findExecutionOrThrow(oldExecution.id)
                const tenantId = await workspaceService(log).getTenantId(updatedExecution.workspaceId)
                await executionSideEffects(log).onRetry({ execution: updatedExecution, tenantId })
                if (triggerFailed) {
                    return addToQueue({
                        execution: updatedExecution,
                        tenantId,
                        payload: triggerPayload,
                        streamStepProgress: StreamStepProgress.NONE,
                        executeTrigger: true,
                        executionType: ExecutionType.BEGIN,
                        workerHandlerId: undefined,
                        httpRequestId: undefined,
                    }, log)
                }
                return addToQueue({
                    execution: updatedExecution,
                    tenantId,
                    streamStepProgress: StreamStepProgress.NONE,
                    executionType: ExecutionType.RESUME,
                    resumeReason: ResumeReason.RETRY,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                }, log)
            }
            case WorkflowRetryStrategy.ON_LATEST_VERSION: {
                const latestWorkflowVersion = await workflowVersionService(log).getLatestLockedVersionOrThrow(
                    oldExecution.workflowId,
                )
                const triggerStep = oldExecution.steps?.[latestWorkflowVersion.trigger.name]
                const triggerFailed = triggerStep?.status === StepOutputStatus.FAILED
                const payload = await resolveStepOutput({ step: triggerStep, execution: oldExecution, log })
                return this.start({
                    workflowId: oldExecution.workflowId,
                    payload,
                    tenantId: await workspaceService(log).getTenantId(oldExecution.workspaceId),
                    executionType: ExecutionType.BEGIN,
                    streamStepProgress: StreamStepProgress.NONE,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                    executeTrigger: triggerFailed,
                    environment: oldExecution.environment,
                    workflowVersionId: latestWorkflowVersion.id,
                    workspaceId: oldExecution.workspaceId,
                    failParentOnFailure: oldExecution.failParentOnFailure,
                    parentRunId: oldExecution.parentRunId,
                })
            }
        }
    },
    async cancel({ workspaceId, tenantId, executionIds, excludeExecutionIds, status, workflowId, createdAfter, createdBefore }: CancelParams): Promise<void> {
        const filteredStatus = status ?? CANCELLABLE_STATUSES
        const executions = await filterExecutionsAndApplyFilters({
            workspaceId,
            executionIds,
            status: filteredStatus,
            workflowId,
            createdAfter,
            createdBefore,
            excludeExecutionIds,
        })
        const cancelParentExecutions = await Promise.allSettled(executions.map(execution => cancelSingleRun(log, execution, tenantId)))
        const childWorkflows = await getAllChildRuns(executions.map(execution => execution.id))
        log.info({
            executionsCount: executions.length,
            childWorkflowCount: childWorkflows.length,
        }, 'Found cancellable descendant workflows')

        const canceChildlPromises = await Promise.allSettled(childWorkflows.map(execution => cancelSingleRun(log, execution, tenantId)))
        if (cancelParentExecutions.some(r => r.status === 'rejected')) {
            throw cancelParentExecutions.find(r => r.status === 'rejected')!.reason
        }
        if (canceChildlPromises.some(r => r.status === 'rejected')) {
            throw canceChildlPromises.find(r => r.status === 'rejected')!.reason
        }
    },
    async existsBy(runId: ExecutionId): Promise<boolean> {
        return executionRepo().existsBy({ id: runId })
    },
    async bulkArchive(params: BulkArchiveActionParams): Promise<void> {
        const filteredExecutions = await filterExecutionsAndApplyFilters(params)
        await executionRepo().update({
            id: In(filteredExecutions.map(execution => execution.id)),
            workspaceId: params.workspaceId,
        }, {
            archivedAt: new Date().toISOString(),
        })
    },
    async bulkRetry(params: BulkRetryParams): Promise<ExecutionWithRetryError[]> {
        const filteredExecutions = await filterExecutionsAndApplyFilters(params)
        const limit = pLimit(10)
        const results = await Promise.allSettled(
            filteredExecutions.map(execution =>
                limit(() => this.retry({ executionId: execution.id, strategy: params.strategy, workspaceId: params.workspaceId })),
            ),
        )
        return results.map((result, i) => {
            if (result.status === 'fulfilled') {
                return result.value
            }
            const error = result.reason instanceof ApplicationError ? result.reason : undefined
            return {
                ...filteredExecutions[i],
                error: {
                    errorCode: error?.error.code ?? ErrorCode.INTERNAL_SERVER_ERROR,
                    errorMessage: error?.message ?? 'Internal server error',
                },
            }
        })
    },
    async start({
        workflowId,
        payload,
        executeTrigger,
        executionType,
        workerHandlerId,
        streamStepProgress,
        httpRequestId,
        workspaceId,
        workflowVersionId,
        parentRunId,
        failParentOnFailure,
        tenantId,
        stepNameToTest,
        environment,
    }: StartParams): Promise<Execution> {
        const newExecution = await queueOrCreateInstantly({
            workspaceId,
            workflowVersionId,
            parentRunId,
            workflowId,
            failParentOnFailure,
            stepNameToTest,
            environment,
        }, log)

        wideEvent.set({
            execution: {
                id: newExecution.id,
                environment,
                executionType,
            },
            workflow: { id: workflowId },
        })

        await addToQueue({
            execution: newExecution,
            tenantId,
            payload,
            executeTrigger,
            executionType,
            workerHandlerId,
            httpRequestId,
            streamStepProgress,
        }, log)

        await executionSideEffects(log).onStart({ execution: newExecution, tenantId })
        log.info({ execution: { id: newExecution.id }, workflow: { id: workflowId }, workspace: { id: workspaceId }, executionType }, 'Workflow run started')
        return newExecution
    },

    async createQuotaExceededRun({ workflowVersion, payload, workspaceId, environment, parentRunId, failParentOnFailure, triggeredBy, shouldExecuteTriggerOnRetry }: CreateQuotaExceededRunParams): Promise<Execution> {
        const now = new Date().toISOString()
        const logsFileId = apId()
        await persistQuotaExceededTriggerLog({ log, workflowVersion, workspaceId, payload, logsFileId, shouldExecuteTriggerOnRetry })
        const execution: Execution = {
            id: apId(),
            workspaceId,
            workflowId: workflowVersion.workflowId,
            workflowVersionId: workflowVersion.id,
            environment,
            parentRunId,
            failParentOnFailure: failParentOnFailure ?? true,
            status: ExecutionStatus.QUOTA_EXCEEDED,
            created: now,
            updated: now,
            startTime: now,
            finishTime: now,
            logsFileId,
            tags: [],
            steps: {},
            triggeredBy,
        }
        await runsMetadataQueue(log).add(execution)
        log.info({ execution: { id: execution.id }, workflow: { id: workflowVersion.workflowId }, workspace: { id: workspaceId } }, 'Workflow run admitted as QUOTA_EXCEEDED')
        return execution
    },

    async test({ workspaceId, workflowVersionId, parentRunId, stepNameToTest, triggeredBy }: TestParams): Promise<Execution> {
        const workflowVersion = await workflowVersionService(log).getOneOrThrow(workflowVersionId)
        await workflowService(log).getOneOrThrow({ id: workflowVersion.workflowId, workspaceId })

        const triggerPayload = await sampleDataService(log).getOrReturnEmpty({
            workspaceId,
            workflowVersion,
            stepName: workflowVersion.trigger.name,
            type: SampleDataFileType.OUTPUT,
        })
        const execution = await queueOrCreateInstantly({
            workspaceId,
            workflowId: workflowVersion.workflowId,
            workflowVersionId: workflowVersion.id,
            environment: RunEnvironment.TESTING,
            parentRunId,
            failParentOnFailure: undefined,
            stepNameToTest,
            triggeredBy,
        }, log)
        return addToQueue({
            execution,
            payload: triggerPayload,
            executionType: ExecutionType.BEGIN,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            tenantId: await workspaceService(log).getTenantId(workspaceId),
            executeTrigger: false,
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            sampleData: !isNil(stepNameToTest) ? await sampleDataService(log).getSampleDataForWorkflow(workspaceId, workflowVersion, SampleDataFileType.OUTPUT) : undefined,
        }, log)
    },
    async startManualTrigger({ workspaceId, workflowVersionId, triggeredBy }: StartManualTriggerParams): Promise<Execution> {
        const workflowVersion = await workflowVersionService(log).getOneOrThrow(workflowVersionId)
        await workflowService(log).getOneOrThrow({ id: workflowVersion.workflowId, workspaceId })
        const triggerPayload = {}
        const tenantId = await workspaceService(log).getTenantId(workspaceId)

        const creditsExhausted = false
        if (creditsExhausted) {
            return this.createQuotaExceededRun({
                workflowVersion,
                payload: triggerPayload,
                workspaceId,
                environment: RunEnvironment.PRODUCTION,
                parentRunId: undefined,
                failParentOnFailure: undefined,
                triggeredBy,
                shouldExecuteTriggerOnRetry: false,
            })
        }

        const execution = await queueOrCreateInstantly({
            workspaceId,
            workflowId: workflowVersion.workflowId,
            workflowVersionId: workflowVersion.id,
            environment: RunEnvironment.PRODUCTION,
            parentRunId: undefined,
            failParentOnFailure: undefined,
            stepNameToTest: undefined,
            triggeredBy,
        }, log)
        return addToQueue({
            execution,
            payload: triggerPayload,
            executionType: ExecutionType.BEGIN,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            tenantId,
            executeTrigger: false,
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            sampleData: undefined,
        }, log)
    },
    async getOne(params: GetOneParams): Promise<Execution | null> {
        const execution = await queryBuilderForExecution(executionRepo()).where({
            id: params.id,
            ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
        }).getOne()

        return execution
    },
    async getOneOrThrow(params: GetOneParams): Promise<Execution> {
        const execution = await this.getOne(params)

        if (isNil(execution)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'execution',
                    entityId: params.id,
                    message: 'Workflow run not found',
                },
            })
        }

        return execution
    },
    async getStepsOrNull({ execution }: { execution: Execution }): Promise<Record<string, StepOutput> | null> {
        if (isNil(execution.logsFileId)) {
            return null
        }
        const stateFile = await readLogsFile(log, execution.logsFileId, execution.workspaceId)
        return stateFile?.executionState.steps ?? null
    },
    async countByStatus(params: CountByStatusParams): Promise<ExecutionCountByStatus[]> {
        let query = executionRepo().createQueryBuilder('execution')
            .select('execution.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where({
                workspaceId: params.workspaceId,
                environment: RunEnvironment.PRODUCTION,
                archivedAt: IsNull(),
            })
            .groupBy('execution.status')

        if (params.createdAfter) {
            query = query.andWhere('execution.created >= :createdAfter', { createdAfter: params.createdAfter })
        }
        if (params.createdBefore) {
            query = query.andWhere('execution.created <= :createdBefore', { createdBefore: params.createdBefore })
        }

        const results = await query.getRawMany()
        return results.map((r: { status: ExecutionStatus, count: string }) => ({ status: r.status, count: parseInt(r.count, 10) }))
    },
    async getOnePopulatedOrThrow(params: GetOneParams): Promise<Execution> {
        const execution = await this.getOneOrThrow(params)
        let steps = {}
        let internalError: RunInternalError | undefined = undefined
        if (!isNil(execution.logsFileId)) {
            const stateFile = await readLogsFile(log, execution.logsFileId, execution.workspaceId)
            if (!isNil(stateFile)) {
                steps = stateFile.executionState.steps
                internalError = stateFile.internalError
            }
        }
        return {
            ...execution,
            steps,
            internalError,
        }
    },
})


async function cancelSingleRun(log: FastifyBaseLogger, execution: Execution, tenantId: string): Promise<void> {
    await distributedLock(log).runExclusive({
        key: `runs_metadata_${execution.id}`,
        timeoutInSeconds: 30,
        fn: async () => {
            await jobQueue(log).removeAllExecutionJobs({ executionId: execution.id, tenantId, workspaceId: execution.workspaceId })
            await waitpointService(log).deleteByExecutionId(execution.id)
            await runsMetadataQueue(log).add({
                id: execution.id,
                workspaceId: execution.workspaceId,
                status: ExecutionStatus.CANCELED,
            })
        },
    })
    log.info({
        execution: { id: execution.id },
        workflow: { id: execution.workflowId },
    }, 'Workflow run cancelled')
}

async function getAllChildRuns(parentRunIds: string[]): Promise<Execution[]> {
    if (parentRunIds.length === 0) {
        return []
    }

    const query = `
        WITH RECURSIVE descendants AS (
            SELECT *
            FROM execution
            WHERE "parentRunId" = ANY($1)
              AND status = ANY($2)

            UNION ALL

            SELECT f.*
            FROM execution f
            INNER JOIN descendants d ON f."parentRunId" = d.id
            WHERE f.status = ANY($2)
        )
        SELECT * FROM descendants;
    `

    const params = [
        parentRunIds,
        CANCELLABLE_STATUSES,
    ]

    const results = await executionRepo().query(query, params)
    return results as Execution[]
}


async function filterExecutionsAndApplyFilters(
    params: FilterExecutionsAndApplyFiltersParams,
): Promise<Execution[]> {
    let query = executionRepo().createQueryBuilder('execution').where({
        workspaceId: params.workspaceId,
        environment: RunEnvironment.PRODUCTION,
    })

    if (!isNil(params.executionIds) && params.executionIds.length > 0) {
        query = query.andWhere({
            id: In(params.executionIds),
        })
    }

    if (!isNil(params.archived)) {
        query = query.andWhere({
            archivedAt: params.archived ? Not(IsNull()) : IsNull(),
        })
    }

    if (params.workflowId && params.workflowId.length > 0) {
        query = query.andWhere({
            workflowId: In(params.workflowId),
        })
    }
    if (params.status && params.status.length > 0) {
        query = query.andWhere({
            status: In(params.status),
        })
    }
    if (params.createdAfter) {
        query = query.andWhere('execution.created >= :createdAfter', {
            createdAfter: params.createdAfter,
        })
    }
    if (params.createdBefore) {
        query = query.andWhere('execution.created <= :createdBefore', {
            createdBefore: params.createdBefore,
        })
    }
    if (params.excludeExecutionIds && params.excludeExecutionIds.length > 0) {
        query = query.andWhere({
            id: Not(In(params.excludeExecutionIds)),
        })
    }

    if (params.failedStepName) {
        query = query.andWhere('execution.failedStepName = :failedStepName', {
            failedStepName: params.failedStepName,
        })
    }
    if (params.failedStepMessage) {
        query = query.andWhere('execution."failedStep"->>\'message\' ILIKE :failedStepMessage', {
            failedStepMessage: `%${params.failedStepMessage}%`,
        })
    }

    const executions = await query.getMany()
    return executions
}


export async function addToQueue(params: AddToQueueParams, log: FastifyBaseLogger): Promise<Execution> {
    const logsFileId = params.execution.logsFileId ?? apId()

    let jobPayload: JobPayload = { type: 'inline', value: null }
    if (!isNil(params.payload) && isNil(params.workerHandlerId)) {
        jobPayload = await payloadOffloader.offloadPayload(log, params.payload, params.execution.workspaceId, params.tenantId)
    }
    else if (!isNil(params.payload)) {
        jobPayload = await payloadOffloader.maybeOffloadPayload(log, params.payload, params.execution.workspaceId, params.tenantId)
    }

    const commonJobData = {
        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
        workerHandlerId: params.workerHandlerId ?? null,
        workspaceId: params.execution.workspaceId,
        tenantId: params.tenantId,
        environment: params.execution.environment,
        workflowId: params.execution.workflowId,
        runId: params.execution.id,
        jobType: WorkerJobType.EXECUTE_WORKFLOW as const,
        workflowVersionId: params.execution.workflowVersionId,
        payload: jobPayload,
        httpRequestId: params.httpRequestId,
        streamStepProgress: params.streamStepProgress,
        stepNameToTest: params.execution.stepNameToTest ?? undefined,
        sampleData: params.sampleData,
        logsFileId,
    }
    const data: ExecuteWorkflowJobData = params.executionType === ExecutionType.RESUME
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
        id: params.jobId ?? params.execution.id,
        type: JobType.ONE_TIME,
        data,
    })
    return params.execution
}

export async function findExecutionOrThrow(executionId: ExecutionId): Promise<Execution> {
    const execution = await queryBuilderForExecution(executionRepo()).where({ id: executionId }).getOne()
    if (isNil(execution)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'execution',
                entityId: executionId,
                message: 'Workflow run not found',
            },
        })
    }
    return execution
}

function queryBuilderForExecution(repo: Repository<Execution>): SelectQueryBuilder<Execution> {
    return repo.createQueryBuilder('execution')
        .leftJoinAndSelect('execution.workflowVersion', 'workflowVersion')
        .addSelect(['"workflowVersion"."displayName"'])
}

async function resolveStepOutput({ step, execution, log }: ResolveStepOutputParams): Promise<unknown> {
    if (isNil(step)) {
        return undefined
    }
    if (step.outputType !== StepOutputType.SLICE) {
        return step.output
    }
    const ref = step.output as LogSliceRef
    const file = await fileService(log).getDataOrUndefined({
        workspaceId: execution.workspaceId,
        fileId: ref.fileId,
        type: FileType.EXECUTION_LOG_SLICE,
    })
    if (isNil(file)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'file',
                entityId: ref.fileId,
                message: `Trigger output was offloaded to storage but its slice file is missing; workflow run ${execution.id} cannot be retried without the trigger payload`,
            },
        })
    }
    return JSON.parse(file.data.toString('utf-8'))
}

async function readLogsFile(log: FastifyBaseLogger, logsFileId: string, workspaceId: string): Promise<ExecutioOutputFile | null> {
    const result = await fileService(log).getDataOrUndefined({
        workspaceId,
        fileId: logsFileId,
        type: FileType.EXECUTION_LOG,
    })
    if (isNil(result)) {
        return null
    }
    return JSON.parse(result.data.toString('utf-8'))
}

async function persistQuotaExceededTriggerLog({ log, workflowVersion, workspaceId, payload, logsFileId, shouldExecuteTriggerOnRetry }: PersistQuotaExceededTriggerLogParams): Promise<void> {
    const triggerStep = GenericStepOutput.create({
        input: {},
        type: workflowVersion.trigger.type,
        status: shouldExecuteTriggerOnRetry ? StepOutputStatus.FAILED : StepOutputStatus.SUCCEEDED,
        output: payload,
    })
    const outputFile: ExecutioOutputFile = {
        executionState: {
            steps: { [workflowVersion.trigger.name]: triggerStep },
            tags: [],
        },
    }
    const data = await fileCompressor.compress({
        data: await logSerializer.serialize(outputFile),
        compression: FileCompression.ZSTD,
    })
    const tenantId = await workspaceService(log).getTenantId(workspaceId)
    await fileService(log).save({
        fileId: logsFileId,
        workspaceId,
        tenantId,
        type: FileType.EXECUTION_LOG,
        data,
        size: data.length,
        compression: FileCompression.ZSTD,
    })
}

async function queueOrCreateInstantly(params: CreateParams, log: FastifyBaseLogger): Promise<Execution> {
    const now = new Date().toISOString()
    const execution: Execution = {
        id: apId(),
        workspaceId: params.workspaceId,
        workflowId: params.workflowId,
        workflowVersionId: params.workflowVersionId,
        environment: params.environment,
        parentRunId: params.parentRunId,
        failParentOnFailure: params.failParentOnFailure ?? true,
        status: ExecutionStatus.QUEUED,
        stepNameToTest: params.stepNameToTest,
        created: now,
        updated: now,
        tags: [],
        steps: {},
        triggeredBy: params.triggeredBy,
    }
    switch (params.environment) {
        case RunEnvironment.TESTING:
            return executionRepo().save(execution)
        case RunEnvironment.PRODUCTION:
            await runsMetadataQueue(log).add(execution)
            return execution
    }
}

export function isOutsideRetentionWindow(createdTime: string, retentionDays: number): boolean {
    if (!createdTime) return false
    return apDayjs(createdTime).add(retentionDays, 'day').isBefore(apDayjs())
}

type CreateParams = {
    workspaceId: WorkspaceId
    workflowVersionId: WorkflowVersionId
    triggeredBy?: string
    parentRunId?: ExecutionId
    failParentOnFailure: boolean | undefined
    stepNameToTest?: string
    workflowId: WorkflowId
    environment: RunEnvironment
}

type ListParams = {
    workspaceId: WorkspaceId
    workflowId: WorkflowId[] | undefined
    status: ExecutionStatus[] | undefined
    cursor: Cursor | null
    tags?: string[]
    limit: number
    createdAfter?: string
    createdBefore?: string
    failedStepName?: string
    failedStepMessage?: string
    executionIds?: ExecutionId[]
    includeArchived?: boolean
    environment?: RunEnvironment
}

type GetOneParams = {
    id: ExecutionId
    workspaceId: WorkspaceId | undefined
}

type ResolveStepOutputParams = {
    step: StepOutput | undefined
    execution: Execution
    log: FastifyBaseLogger
}

type AddToQueueParamsCommon = {
    execution: Execution
    tenantId: TenantId
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
    workflowVersion: WorkflowVersion
    payload: unknown
    workspaceId: WorkspaceId
    environment: RunEnvironment
    parentRunId?: ExecutionId
    failParentOnFailure: boolean | undefined
    triggeredBy?: string
    shouldExecuteTriggerOnRetry: boolean
}

type PersistQuotaExceededTriggerLogParams = {
    log: FastifyBaseLogger
    workflowVersion: WorkflowVersion
    workspaceId: WorkspaceId
    payload: unknown
    logsFileId: string
    shouldExecuteTriggerOnRetry: boolean
}

type StartParams = {
    workflowId: WorkflowId
    payload: unknown
    tenantId: TenantId
    environment: RunEnvironment
    workflowVersionId: WorkflowVersionId
    workspaceId: WorkspaceId
    parentRunId?: ExecutionId
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
    workflowVersionId: WorkflowVersionId
    triggeredBy?: string
    parentRunId?: ExecutionId
    stepNameToTest?: string
}

type StartManualTriggerParams = {
    workspaceId: WorkspaceId
    workflowVersionId: WorkflowVersionId
    triggeredBy: string
}
type RetryParams = {
    executionId: ExecutionId
    strategy: WorkflowRetryStrategy
    workspaceId: WorkspaceId
}

type CancelParams = {
    workspaceId: WorkspaceId
    tenantId: TenantId
    executionIds?: ExecutionId[]
    excludeExecutionIds?: ExecutionId[]
    status?: ExecutionStatus[]
    workflowId?: WorkflowId[]
    createdAfter?: string
    createdBefore?: string
}

type BulkRetryParams = {
    workspaceId: WorkspaceId
    executionIds?: ExecutionId[]
    strategy: WorkflowRetryStrategy
    status?: ExecutionStatus[]
    workflowId?: WorkflowId[]
    createdAfter?: string
    archived?: boolean
    createdBefore?: string
    excludeExecutionIds?: ExecutionId[]
    failedStepName?: string
    failedStepMessage?: string
}

type BulkArchiveActionParams = {
    workspaceId: WorkspaceId
    executionIds?: ExecutionId[]
    status?: ExecutionStatus[]
    workflowId?: WorkflowId[]
    createdAfter?: string
    archived?: boolean
    createdBefore?: string
    excludeExecutionIds?: ExecutionId[]
    failedStepName?: string
    failedStepMessage?: string
}

type CountByStatusParams = {
    workspaceId: WorkspaceId
    createdAfter?: string
    createdBefore?: string
}

type FilterExecutionsAndApplyFiltersParams = {
    workspaceId: WorkspaceId
    executionIds?: ExecutionId[]
    status?: ExecutionStatus[]
    archived?: boolean
    workflowId?: WorkflowId[]
    createdAfter?: string
    createdBefore?: string
    excludeExecutionIds?: ExecutionId[]
    failedStepName?: string
    failedStepMessage?: string
}
