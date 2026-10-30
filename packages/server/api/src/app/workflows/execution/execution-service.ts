import { ApplicationError, Cursor, ErrorCode, ExecutionId, generateId, isNil, ProjectId, SeekPage, TenantId, WorkflowId, WorkflowVersionId } from '@fema-ipaas/core-utils'
import { dayjsUtil, wideEvent } from '@fema-ipaas/server-utils'
import { ConnectionHealthSummary, ConnectorUsageSummary, ExecuteWorkflowJobData, Execution, ExecutionCountByStatus, ExecutionStatus, ExecutionType, ExecutionWithRetryError, ExecutioOutputFile, FileType, isExecutionStateTerminal, JobPayload, LATEST_JOB_DATA_SCHEMA_VERSION, LogSliceRef, PopulatedWorkflow, RecentlyEditedWorkflow, ResumeReason, RunConcurrencyTicket, RunEnvironment, RunInternalError, SampleDataFileType, StepOutput, StepOutputStatus, StepOutputType, StreamStepProgress, WorkerJobType, WorkflowRetryStrategy, workflowStructureUtil } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { ArrayContains, In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm'
import { restoreMaintenance } from '../../backup/maintenance'
import { connectionsRepo } from '../../connection/connection-service/connection-service'
import { repoFactory } from '../../core/db/repo-factory'
import { distributedLock } from '../../database/redis-connections'
import { fileService, getEffectiveExecutionDataRetentionDays } from '../../file/file.service'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { Order } from '../../helper/pagination/paginator'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { runQuota } from '../../limits/run-quota.service'
import { privacyService } from '../../privacy/privacy.service'
import { projectService } from '../../project/project-service'
import { workflowConcurrencyQueue } from '../../workers/job-queue/interceptors/workflow-concurrency-interceptor'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { payloadOffloader } from '../../workers/payload-offloader'
import { sampleDataService } from '../step-run/sample-data.service'
import { workflowRepo } from '../workflow/workflow.repo'
import { workflowService } from '../workflow/workflow.service'
import { workflowVersionService } from '../workflow-version/workflow-version.service'
import { ExecutionEntity } from './execution-entity'
import { executionSideEffects } from './execution-side-effects'
import { runsMetadataQueue } from './executions-queue'
import { runEnvironmentUtils } from './run-environment'
import { runWorkflowSnapshot } from './run-workflow-snapshot'
import { waitpointService } from './waitpoint/waitpoint-service'

const CANCELLABLE_STATUSES: ExecutionStatus[] = [ExecutionStatus.PAUSED, ExecutionStatus.QUEUED]


export const WEBHOOK_TIMEOUT_MS = system.getNumberOrThrow(AppSystemProp.WEBHOOK_TIMEOUT_SECONDS) * 1000
export const executionRepo = repoFactory<Execution>(ExecutionEntity)

export const executionService = (log: FastifyBaseLogger) => ({
    async upsert({ id, projectId }: { id: ExecutionId, projectId: ProjectId }): Promise<Execution> {
        const existingExecution = await executionRepo().findOneBy({ id, projectId })
        if (isNil(existingExecution)) {
            return executionRepo().save({ id, projectId })
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
            projectId: params.projectId,
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

        if (params.excludeStepTests) {
            query = query.andWhere({
                stepNameToTest: IsNull(),
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
    async retry({ executionId, strategy, projectId }: RetryParams): Promise<Execution> {
        const oldExecution = await executionService(log).getOnePopulatedOrThrow({
            id: executionId,
            projectId,
        })
        log.info({ execution: { id: executionId }, workflow: { id: oldExecution.workflowId }, strategy }, 'Workflow run retry initiated')
        if (isNil(oldExecution.logsFileId) && !isNil(oldExecution.displayLogsFileId)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'The original run data has passed its retention period, so this run cannot be rerun.' },
            })
        }

        const project = await projectService(log).getOneOrThrow(oldExecution.projectId)
        const retentionDays = getEffectiveExecutionDataRetentionDays(project.executionDataRetentionDays)
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
                    projectId: oldExecution.projectId,
                }, {
                    status: ExecutionStatus.QUEUED,
                    startTime: dayjsUtil().toISOString(),
                    finishTime: null,
                    inPlaceRetryCount: () => '"inPlaceRetryCount" + 1',
                })
                const updatedExecution = await findExecutionOrThrow(oldExecution.id)
                const tenantId = await projectService(log).getTenantId(updatedExecution.projectId)
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
                    tenantId: await projectService(log).getTenantId(oldExecution.projectId),
                    executionType: ExecutionType.BEGIN,
                    streamStepProgress: StreamStepProgress.NONE,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                    executeTrigger: triggerFailed,
                    environment: oldExecution.environment,
                    workflowVersionId: latestWorkflowVersion.id,
                    projectId: oldExecution.projectId,
                    failParentOnFailure: oldExecution.failParentOnFailure,
                    parentRunId: oldExecution.parentRunId,
                    rerunOfExecutionId: oldExecution.rerunOfExecutionId ?? oldExecution.id,
                    businessKey: oldExecution.businessKey,
                })
            }
        }
    },
    async cancel({ projectId, tenantId, executionIds, excludeExecutionIds, status, workflowId, createdAfter, createdBefore, includeChildRuns = true }: CancelParams): Promise<void> {
        const filteredStatus = status ?? CANCELLABLE_STATUSES
        const executions = await filterExecutionsAndApplyFilters({
            projectId,
            executionIds,
            status: filteredStatus,
            workflowId,
            createdAfter,
            createdBefore,
            excludeExecutionIds,
        })
        const cancelParentExecutions = await Promise.allSettled(executions.map(execution => cancelSingleRun(log, execution, tenantId)))
        const childWorkflows = includeChildRuns ? await getAllChildRuns(executions.map(execution => execution.id)) : []
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
    async countCancellableChildRuns({ executionId }: { executionId: ExecutionId }): Promise<number> {
        const children = await getAllChildRuns([executionId])
        return children.length
    },
    async bulkArchive(params: BulkArchiveActionParams): Promise<void> {
        const filteredExecutions = await filterExecutionsAndApplyFilters(params)
        await executionRepo().update({
            id: In(filteredExecutions.map(execution => execution.id)),
            projectId: params.projectId,
        }, {
            archivedAt: new Date().toISOString(),
        })
    },
    async bulkRetry(params: BulkRetryParams): Promise<ExecutionWithRetryError[]> {
        const filteredExecutions = await filterExecutionsAndApplyFilters(params)
        const limit = pLimit(10)
        const results = await Promise.allSettled(
            filteredExecutions.map(execution =>
                limit(() => this.retry({ executionId: execution.id, strategy: params.strategy, projectId: params.projectId })),
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
        projectId,
        workflowVersionId,
        parentRunId,
        failParentOnFailure,
        tenantId,
        stepNameToTest,
        environment,
        concurrency,
        rerunOfExecutionId,
        businessKey,
        executionId,
    }: StartParams): Promise<Execution> {
        await restoreMaintenance.assertAvailable()
        const reserved = executionId ? await executionRepo().findOneBy({ id: executionId, projectId }) : null
        if (reserved && (reserved.status !== ExecutionStatus.QUEUED || await jobQueue(log).hasExecutionJob({ executionId: reserved.id, projectId, tenantId }))) return reserved
        const countsTowardQuota = !reserved && environment === RunEnvironment.PRODUCTION && executionType === ExecutionType.BEGIN
        const quota = countsTowardQuota ? await runQuota(log).admit({ projectId }) : null
        if (!isNil(quota) && !quota.allowed) {
            return runQuota(log).recordRejectedRun({ projectId, workflowId, workflowVersionId, parentRunId, failParentOnFailure, verdict: quota })
        }
        const newExecution = await queueOrCreateInstantly({
            projectId,
            workflowVersionId,
            parentRunId,
            workflowId,
            failParentOnFailure,
            stepNameToTest,
            environment,
            rerunOfExecutionId,
            businessKey,
            executionId,
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
            concurrency,
            retainCompleted: Boolean(executionId),
        }, log)

        await executionSideEffects(log).onStart({ execution: newExecution, tenantId })
        log.info({ execution: { id: newExecution.id }, workflow: { id: workflowId }, project: { id: projectId }, executionType }, 'Workflow run started')
        return newExecution
    },


    async test({ projectId, workflowVersionId, parentRunId, stepNameToTest, triggeredBy, payload, environment }: TestParams): Promise<Execution> {
        const workflowVersion = await workflowVersionService(log).getOneOrThrow(workflowVersionId)
        await workflowService(log).getOneOrThrow({ id: workflowVersion.workflowId, projectId })
        const tenantId = await projectService(log).getTenantId(projectId)
        const workflowSnapshotFileId = await runWorkflowSnapshot(log).capture({ projectId, tenantId, workflowVersion })

        const triggerPayload = payload !== undefined
            ? payload
            : await sampleDataService(log).getOrReturnEmpty({
                projectId,
                workflowVersion,
                stepName: workflowVersion.trigger.name,
                type: SampleDataFileType.OUTPUT,
            })
        const execution = await queueOrCreateInstantly({
            projectId,
            workflowId: workflowVersion.workflowId,
            workflowVersionId: workflowVersion.id,
            environment: environment ?? RunEnvironment.TESTING,
            parentRunId,
            failParentOnFailure: undefined,
            stepNameToTest,
            triggeredBy,
            workflowSnapshotFileId,
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
            sampleData: !isNil(stepNameToTest) ? await sampleDataService(log).getSampleDataForWorkflow(projectId, workflowVersion, SampleDataFileType.OUTPUT) : undefined,
        }, log)
    },
    async startManualTrigger({ projectId, workflowVersionId, triggeredBy }: StartManualTriggerParams): Promise<Execution> {
        const workflowVersion = await workflowVersionService(log).getOneOrThrow(workflowVersionId)
        const workflow = await workflowService(log).getOneOrThrow({ id: workflowVersion.workflowId, projectId })
        runEnvironmentUtils.assertManualTriggerAllowed({
            workflowVersionId: workflowVersion.id,
            publishedVersionId: workflow.publishedVersionId,
            workflowStatus: workflow.status,
        })
        const triggerPayload = {}
        const tenantId = await projectService(log).getTenantId(projectId)
        const environment = runEnvironmentUtils.forManualTrigger({
            workflowVersionId: workflowVersion.id,
            publishedVersionId: workflow.publishedVersionId,
        })
        const workflowSnapshotFileId = await runWorkflowSnapshot(log).capture({ projectId, tenantId, workflowVersion })

        const execution = await queueOrCreateInstantly({
            projectId,
            workflowId: workflowVersion.workflowId,
            workflowVersionId: workflowVersion.id,
            environment,
            parentRunId: undefined,
            failParentOnFailure: undefined,
            stepNameToTest: undefined,
            triggeredBy,
            workflowSnapshotFileId,
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
            ...(params.projectId ? { projectId: params.projectId } : {}),
        }).getOne()

        return execution
    },
    async getRunWorkflow({ projectId, id }: GetRunWorkflowParams): Promise<PopulatedWorkflow> {
        const execution = await this.getOneOrThrow({ projectId, id })
        const reference = await executionRepo().createQueryBuilder('execution')
            .select('execution.workflowSnapshotFileId', 'fileId')
            .where({ id: execution.id, projectId })
            .getRawOne<{ fileId: string | null }>()
        const snapshot = isNil(reference?.fileId)
            ? null
            : await runWorkflowSnapshot(log).read({ projectId, fileId: reference.fileId })
        if (isNil(snapshot)) {
            return workflowService(log).getOnePopulatedOrThrow({
                id: execution.workflowId,
                projectId,
                versionId: execution.workflowVersionId,
            })
        }
        const workflow = await workflowService(log).getOneOrThrow({ id: execution.workflowId, projectId })
        return { ...workflow, version: snapshot }
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
    async readStateSteps({ logsFileId, projectId }: { logsFileId: string, projectId: string }): Promise<Record<string, StepOutput> | null> {
        const stateFile = await readLogsFile(log, logsFileId, projectId)
        return stateFile?.executionState.steps ?? null
    },
    async getStepsOrNull({ execution }: { execution: Execution }): Promise<Record<string, StepOutput> | null> {
        if (isNil(execution.logsFileId)) {
            return null
        }
        const stateFile = await readLogsFile(log, execution.logsFileId, execution.projectId)
        return stateFile?.executionState.steps ?? null
    },
    async getDisplayStepsOrNull({ execution }: { execution: Execution }): Promise<Record<string, StepOutput> | null> {
        if (isNil(execution.displayLogsFileId)) {
            return null
        }
        const displayFile = await readLogsFile(log, execution.displayLogsFileId, execution.projectId)
        return displayFile?.executionState.steps ?? null
    },
    async countByStatus(params: CountByStatusParams): Promise<ExecutionCountByStatus[]> {
        let query = executionRepo().createQueryBuilder('execution')
            .select('execution.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where({
                projectId: params.projectId,
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
    async dailyTrend(params: DailyTrendParams): Promise<ExecutionDailyTrendRow[]> {
        const results = await executionRepo().createQueryBuilder('execution')
            .select('date_trunc(\'day\', execution.created)', 'day')
            .addSelect('execution.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where({
                projectId: params.projectId,
                environment: RunEnvironment.PRODUCTION,
                archivedAt: IsNull(),
            })
            .andWhere('execution.created >= :createdAfter', { createdAfter: params.createdAfter })
            .groupBy('date_trunc(\'day\', execution.created)')
            .addGroupBy('execution.status')
            .orderBy('date_trunc(\'day\', execution.created)', 'ASC')
            .getRawMany()
        return results.map((row: { day: Date, status: ExecutionStatus, count: string }) => ({
            day: dayjsUtil(row.day.toISOString()).toISOString(),
            status: row.status,
            count: parseInt(row.count, 10),
        }))
    },
    async topFailingWorkflows(params: TopFailingWorkflowsParams): Promise<FailingWorkflowSummaryRow[]> {
        const results = await executionRepo().createQueryBuilder('execution')
            .select('execution.workflowId', 'workflowId')
            .addSelect('COUNT(*)', 'count')
            .addSelect('MAX(execution.created)', 'lastFailure')
            .where({
                projectId: params.projectId,
                environment: RunEnvironment.PRODUCTION,
                archivedAt: IsNull(),
            })
            .andWhere('execution.status IN (:...failedStatuses)', { failedStatuses: FAILED_STATUSES })
            .andWhere('execution.created >= :createdAfter', { createdAfter: params.createdAfter })
            .groupBy('execution.workflowId')
            .orderBy('COUNT(*)', 'DESC')
            .limit(params.limit)
            .getRawMany()
        if (results.length === 0) {
            return []
        }
        const workflows = await workflowRepo().createQueryBuilder('workflow')
            .leftJoin('workflow_version', 'version', 'version.id = workflow."publishedVersionId"')
            .select('workflow.id', 'id')
            .addSelect('version.displayName', 'displayName')
            .where('workflow.id IN (:...workflowIds)', { workflowIds: results.map((row: { workflowId: string }) => row.workflowId) })
            .getRawMany()
        const displayNameById = new Map(workflows.map((workflow: { id: string, displayName: string | null }) => [workflow.id, workflow.displayName]))
        return results.map((row: { workflowId: string, count: string, lastFailure: Date }) => ({
            workflowId: row.workflowId,
            displayName: displayNameById.get(row.workflowId) ?? row.workflowId,
            count: parseInt(row.count, 10),
            lastFailure: dayjsUtil(row.lastFailure.toISOString()).toISOString(),
        }))
    },
    async connectionHealth(params: ProjectScopedParams): Promise<ConnectionHealthSummary[]> {
        const results = await connectionsRepo().createQueryBuilder('connection')
            .select('connection.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where(':projectId = ANY(connection."projectIds")', { projectId: params.projectId })
            .groupBy('connection.status')
            .getRawMany()
        return results.map((row: { status: string, count: string }) => ({
            status: row.status,
            count: parseInt(row.count, 10),
        }))
    },
    async topConnectors(params: LimitedProjectScopedParams): Promise<ConnectorUsageSummary[]> {
        const results = await connectionsRepo().createQueryBuilder('connection')
            .select('connection.connectorName', 'connectorName')
            .addSelect('COUNT(*)', 'count')
            .where(':projectId = ANY(connection."projectIds")', { projectId: params.projectId })
            .groupBy('connection.connectorName')
            .orderBy('COUNT(*)', 'DESC')
            .limit(params.limit)
            .getRawMany()
        return results.map((row: { connectorName: string, count: string }) => ({
            connectorName: row.connectorName,
            count: parseInt(row.count, 10),
        }))
    },
    async recentlyEditedWorkflows(params: LimitedProjectScopedParams): Promise<RecentlyEditedWorkflow[]> {
        const results = await workflowRepo().createQueryBuilder('workflow')
            .innerJoin('workflow_version', 'version', 'version."workflowId" = workflow.id')
            .select('workflow.id', 'workflowId')
            .addSelect('MAX(version.updated)', 'updated')
            .where('workflow."projectId" = :projectId', { projectId: params.projectId })
            .groupBy('workflow.id')
            .orderBy('MAX(version.updated)', 'DESC')
            .limit(params.limit)
            .getRawMany()
        if (results.length === 0) {
            return []
        }
        const names = await workflowRepo().createQueryBuilder('workflow')
            .innerJoin('workflow_version', 'version', 'version."workflowId" = workflow.id')
            .select('workflow.id', 'id')
            .addSelect('version.displayName', 'displayName')
            .addSelect('version.updated', 'updated')
            .where('workflow.id IN (:...workflowIds)', { workflowIds: results.map((row: { workflowId: string }) => row.workflowId) })
            .orderBy('version.updated', 'DESC')
            .getRawMany()
        const displayNameById = new Map<string, string>()
        for (const row of names as { id: string, displayName: string | null }[]) {
            if (!displayNameById.has(row.id) && !isNil(row.displayName)) {
                displayNameById.set(row.id, row.displayName)
            }
        }
        return results.map((row: { workflowId: string, updated: Date }) => ({
            workflowId: row.workflowId,
            displayName: displayNameById.get(row.workflowId) ?? row.workflowId,
            updated: dayjsUtil(row.updated.toISOString()).toISOString(),
        }))
    },
    async getOneForDisplayOrThrow(params: GetOneParams): Promise<Execution> {
        const execution = await this.getOneOrThrow(params)
        if (isNil(execution.displayLogsFileId)) {
            return this.getOnePopulatedOrThrow(params)
        }
        const [displayFile, rawFile] = await Promise.all([
            readLogsFile(log, execution.displayLogsFileId, execution.projectId),
            execution.status === ExecutionStatus.INTERNAL_ERROR && !isNil(execution.logsFileId)
                ? readLogsFile(log, execution.logsFileId, execution.projectId)
                : Promise.resolve(null),
        ])
        return {
            ...execution,
            steps: displayFile?.executionState.steps ?? {},
            internalError: rawFile?.internalError,
        }
    },
    async getOnePopulatedOrThrow(params: GetOneParams): Promise<Execution> {
        const execution = await this.getOneOrThrow(params)
        let steps = {}
        let internalError: RunInternalError | undefined = undefined
        if (!isNil(execution.logsFileId)) {
            const stateFile = await readLogsFile(log, execution.logsFileId, execution.projectId)
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
            await jobQueue(log).removeAllExecutionJobs({ executionId: execution.id, tenantId, projectId: execution.projectId })
            await waitpointService(log).deleteByExecutionId(execution.id)
            await runsMetadataQueue(log).add({
                id: execution.id,
                projectId: execution.projectId,
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
        projectId: params.projectId,
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
    const logsFileId = params.execution.logsFileId ?? generateId()
    const sensitiveStepNames = await sensitiveStepNamesOf({ log, workflowVersionId: params.execution.workflowVersionId })
    const logPrivacy = await privacyService(log).logPrivacyFor({
        tenantId: params.tenantId,
        displayLogsFileId: params.execution.displayLogsFileId ?? generateId(),
        sensitiveStepNames,
    })

    let jobPayload: JobPayload = { type: 'inline', value: null }
    if (!isNil(params.payloadFileId)) {
        jobPayload = { type: 'ref', fileId: params.payloadFileId }
    }
    else if (!isNil(params.payload) && isNil(params.workerHandlerId)) {
        jobPayload = await payloadOffloader.offloadPayload(log, params.payload, params.execution.projectId, params.tenantId, { executionId: params.execution.id })
    }
    else if (!isNil(params.payload)) {
        jobPayload = await payloadOffloader.maybeOffloadPayload(log, params.payload, params.execution.projectId, params.tenantId)
    }

    const commonJobData = {
        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
        workerHandlerId: params.workerHandlerId ?? null,
        projectId: params.execution.projectId,
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
        logPrivacy,
        concurrency: params.concurrency,
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
    const jobId = params.jobId ?? params.execution.id
    await workflowConcurrencyQueue.register({ jobId, jobData: data, log })
    await jobQueue(log).add({
        id: jobId,
        type: JobType.ONE_TIME,
        data,
        retainCompleted: params.retainCompleted,
    })
    return params.execution
}

async function sensitiveStepNamesOf({ log, workflowVersionId }: { log: FastifyBaseLogger, workflowVersionId: WorkflowVersionId }): Promise<string[]> {
    const version = await workflowVersionService(log).getOne(workflowVersionId)
    return isNil(version) ? [] : workflowStructureUtil.getSensitiveStepNames(version.trigger)
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
        projectId: execution.projectId,
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

async function readLogsFile(log: FastifyBaseLogger, logsFileId: string, projectId: string): Promise<ExecutioOutputFile | null> {
    const result = await fileService(log).getDataOrUndefined({
        projectId,
        fileId: logsFileId,
        type: FileType.EXECUTION_LOG,
    })
    if (isNil(result)) {
        return null
    }
    return JSON.parse(result.data.toString('utf-8'))
}

async function queueOrCreateInstantly(params: CreateParams, log: FastifyBaseLogger): Promise<Execution> {
    const now = new Date().toISOString()
    const execution: Execution = {
        id: params.executionId ?? generateId(),
        projectId: params.projectId,
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
        rerunOfExecutionId: params.rerunOfExecutionId,
        businessKey: params.businessKey,
    }
    const row = isNil(params.workflowSnapshotFileId) ? execution : { ...execution, workflowSnapshotFileId: params.workflowSnapshotFileId }
    if (params.executionId) return executionRepo().save(row)
    switch (params.environment) {
        case RunEnvironment.TESTING:
            return executionRepo().save(row)
        case RunEnvironment.PRODUCTION:
            await runsMetadataQueue(log).add(execution)
            return execution
    }
}

export function isOutsideRetentionWindow(createdTime: string, retentionDays: number): boolean {
    if (!createdTime) return false
    return dayjsUtil(createdTime).add(retentionDays, 'day').isBefore(dayjsUtil())
}

type CreateParams = {
    executionId?: string
    projectId: ProjectId
    workflowVersionId: WorkflowVersionId
    triggeredBy?: string
    parentRunId?: ExecutionId
    failParentOnFailure: boolean | undefined
    stepNameToTest?: string
    workflowId: WorkflowId
    environment: RunEnvironment
    rerunOfExecutionId?: ExecutionId
    businessKey?: string | null
    workflowSnapshotFileId?: string | null
}

type ListParams = {
    projectId: ProjectId
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
    excludeStepTests?: boolean
    environment?: RunEnvironment
}

type GetOneParams = {
    id: ExecutionId
    projectId: ProjectId | undefined
}

type ResolveStepOutputParams = {
    step: StepOutput | undefined
    execution: Execution
    log: FastifyBaseLogger
}

type AddToQueueParamsCommon = {
    retainCompleted?: boolean
    execution: Execution
    tenantId: TenantId
    payload?: unknown
    payloadFileId?: string
    workerHandlerId: string | undefined
    httpRequestId: string | undefined
    streamStepProgress: StreamStepProgress
    sampleData?: Record<string, unknown>
    jobId?: string
    concurrency?: RunConcurrencyTicket
}

export type AddToQueueParams = AddToQueueParamsCommon & (
    | { executionType: ExecutionType.BEGIN, executeTrigger: boolean }
    | { executionType: ExecutionType.RESUME, resumeReason: ResumeReason }
)


type StartParams = {
    executionId?: string
    workflowId: WorkflowId
    payload: unknown
    tenantId: TenantId
    environment: RunEnvironment
    workflowVersionId: WorkflowVersionId
    projectId: ProjectId
    parentRunId?: ExecutionId
    failParentOnFailure: boolean | undefined
    stepNameToTest?: string
    executeTrigger: boolean
    executionType: ExecutionType.BEGIN
    workerHandlerId: string | undefined
    httpRequestId: string | undefined
    streamStepProgress: StreamStepProgress
    sampleData?: Record<string, unknown>
    concurrency?: RunConcurrencyTicket
    rerunOfExecutionId?: ExecutionId
    businessKey?: string | null
}



type GetRunWorkflowParams = {
    projectId: ProjectId
    id: ExecutionId
}

type TestParams = {
    projectId: ProjectId
    workflowVersionId: WorkflowVersionId
    triggeredBy?: string
    parentRunId?: ExecutionId
    stepNameToTest?: string
    payload?: unknown
    environment?: RunEnvironment
}

type StartManualTriggerParams = {
    projectId: ProjectId
    workflowVersionId: WorkflowVersionId
    triggeredBy: string
}
type RetryParams = {
    executionId: ExecutionId
    strategy: WorkflowRetryStrategy
    projectId: ProjectId
}

type CancelParams = {
    projectId: ProjectId
    tenantId: TenantId
    executionIds?: ExecutionId[]
    excludeExecutionIds?: ExecutionId[]
    status?: ExecutionStatus[]
    workflowId?: WorkflowId[]
    createdAfter?: string
    createdBefore?: string
    includeChildRuns?: boolean
}

type BulkRetryParams = {
    projectId: ProjectId
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
    projectId: ProjectId
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
    projectId: ProjectId
    createdAfter?: string
    createdBefore?: string
}

type FilterExecutionsAndApplyFiltersParams = {
    projectId: ProjectId
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

type ExecutionDailyTrendRow = {
    day: string
    status: ExecutionStatus
    count: number
}

type FailingWorkflowSummaryRow = {
    workflowId: string
    displayName: string
    count: number
    lastFailure: string
}

const FAILED_STATUSES = [
    ExecutionStatus.FAILED,
    ExecutionStatus.INTERNAL_ERROR,
    ExecutionStatus.TIMEOUT,
    ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
]

type DailyTrendParams = {
    projectId: string
    createdAfter: string
}

type TopFailingWorkflowsParams = {
    projectId: string
    createdAfter: string
    limit: number
}

type ProjectScopedParams = {
    projectId: string
}

type LimitedProjectScopedParams = {
    projectId: string
    limit: number
}
