import { assertNotNullOrUndefined, isNil } from '@fema-ipaas/core-utils'
import { onCallService, UNKNOWN_VERSION, versionUtil } from '@fema-ipaas/server-utils'
import { ExecutionType, FileCompression, FileLocation, FileType, WorkerGroupScope, WorkerToApiContract, WorkflowOperationType, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { redisConnections } from '../../database/redis-connections'
import { fileService, getLocationForFile } from '../../file/file.service'
import { s3Helper } from '../../file/s3-helper'
import { signedFileTransport } from '../../file/signed-file-transport'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { dedupeService } from '../../trigger/dedupe-service'
import { triggerEventService } from '../../trigger/trigger-events/trigger-event.service'
import { triggerRunStats } from '../../trigger/trigger-run/trigger-run-stats'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { engineRunCallbackService } from '../../workflows/execution/engine-run-callback-service'
import { executionService } from '../../workflows/execution/execution-service'
import { preWarmWorkersService } from '../../workflows/pre-warm-workers'
import { workflowSideEffects } from '../../workflows/workflow/workflow-service-side-effects'
import { workflowService } from '../../workflows/workflow/workflow.service'
import { workflowVersionService } from '../../workflows/workflow-version/workflow-version.service'
import { workspaceService } from '../../workspace/workspace-service'
import { getTenantGroupQueueName, getWorkspaceGroupQueueName, QueueName, WorkerGroupAssignment } from '../job'
import { jobBroker } from '../job-queue/job-broker'
import { machineService } from '../machine/machine-service'

const getPollQueueName = (assignment: WorkerGroupAssignment | null): string => {
    if (isNil(assignment)) {
        return QueueName.WORKER_JOBS
    }
    return assignment.scope === WorkerGroupScope.WORKSPACE
        ? getWorkspaceGroupQueueName(assignment.id)
        : getTenantGroupQueueName(assignment.id)
}

let pagedForUnreadableAppVersion = false

function pageOnceForUnreadableAppVersion(log: FastifyBaseLogger, appVersion: string): void {
    if (pagedForUnreadableAppVersion) {
        return
    }
    pagedForUnreadableAppVersion = true
    onCallService(log, system.get(AppSystemProp.PAGE_ONCALL_WEBHOOK)).page({
        code: 'APP_VERSION_READ_FAILED',
        message: 'App could not read its release version from package.json (reported as 0.0.0); worker dispatch is gated and will NOT self-heal until the deployment is fixed (check cwd/packaging)',
        params: { appVersion },
    }).catch((pageError) => {
        log.error({ pageError }, '[workerRpc#poll] Failed to send on-call page for unreadable app version')
    })
}

export function createHandlers(log: FastifyBaseLogger, assignment: WorkerGroupAssignment | null = null, connectionId?: string): WorkerToApiContract {
    return {
        async poll(input) {
            log.info({ worker: { id: input.workerId }, workerGroup: assignment ?? undefined }, '[workerRpc#poll] Poll request received')
            await machineService(log).onConnection(input, assignment)
            const workerVersion = input.workerProps.version
            const appVersion = versionUtil.getCurrentRelease()
            if (!versionUtil.versionsAreCompatible({ versionA: workerVersion, versionB: appVersion })) {
                const versionUnreadable = workerVersion === UNKNOWN_VERSION || appVersion === UNKNOWN_VERSION
                if (versionUnreadable) {
                    log.error({ worker: { id: input.workerId }, workerVersion, appVersion }, '[workerRpc#poll] Withholding job — a release version could not be read from package.json (reported as 0.0.0); this will NOT self-heal on deploy completion, check the worker/app deployment (cwd/packaging)')
                }
                else {
                    log.warn({ worker: { id: input.workerId }, workerVersion, appVersion }, '[workerRpc#poll] Withholding job — worker version does not match app; worker will idle until upgraded')
                }
                if (appVersion === UNKNOWN_VERSION) {
                    pageOnceForUnreadableAppVersion(log, appVersion)
                }
                return null
            }
            const pollQueueName = getPollQueueName(assignment)
            const job = await jobBroker(log).poll(pollQueueName, connectionId)
            if (job) {
                log.info({ worker: { id: input.workerId }, job: { id: job.jobId, type: job.jobData.jobType } }, '[workerRpc#poll] Returning job to worker')
            }
            else {
                log.debug({ worker: { id: input.workerId } }, '[workerRpc#poll] No job available, returning null')
            }
            return job
        },

        async completeJob(input) {
            log.info({ job: { id: input.jobId }, status: input.status }, '[workerRpc#completeJob] Job completed by worker')
            await jobBroker(log).completeJob(input)
        },

        async uploadRunLog(input) {
            await engineRunCallbackService(log).uploadRunLog({ workspaceId: input.workspaceId, request: input })
        },

        async submitPayloads(input) {
            const { workflowVersionId, workspaceId, payloads, httpRequestId, streamStepProgress, environment, parentRunId, failParentOnFailure } = input

            const workflowVersion = await workflowVersionService(log).getOne(workflowVersionId)
            if (!workflowVersion) {
                return []
            }

            const tenantId = await workspaceService(log).getTenantId(workspaceId)
            const filterPayloads = await dedupeService.filterUniquePayloads(workflowVersionId, payloads)

            const creditsExhausted = false

            const executions = await Promise.all(
                filterPayloads.map((payload) =>
                    creditsExhausted
                        ? executionService(log).createQuotaExceededRun({
                            workflowVersion,
                            payload,
                            workspaceId,
                            environment,
                            parentRunId,
                            failParentOnFailure,
                            shouldExecuteTriggerOnRetry: false,
                        })
                        : executionService(log).start({
                            workflowId: workflowVersion.workflowId,
                            environment,
                            workflowVersionId,
                            payload,
                            workspaceId,
                            tenantId,
                            httpRequestId,
                            workerHandlerId: undefined,
                            executionType: ExecutionType.BEGIN,
                            streamStepProgress,
                            executeTrigger: false,
                            parentRunId,
                            failParentOnFailure,
                        }),
                ),
            )
            return executions
        },

        async savePayloads(input) {
            const { workflowId, workspaceId, payloads } = input
            const savePayloads = payloads.map((payload) =>
                rejectedPromiseHandler(triggerEventService(log).saveEvent({
                    workflowId,
                    payload,
                    workspaceId,
                }), log),
            )
            rejectedPromiseHandler(Promise.all(savePayloads), log)
            if (payloads.length > 0) {
                await triggerSourceService(log).disable({
                    workflowId,
                    workspaceId,
                    simulate: true,
                    ignoreError: true,
                })
            }
        },

        async getWorkflowVersion(input) {
            const workflowVersion = await workflowVersionService(log).getOne(input.versionId)
            if (isNil(workflowVersion)) {
                return null
            }
            const workflow = await workflowService(log).getOneById(workflowVersion.workflowId)
            if (isNil(workflow)) {
                return null
            }
            return workflowVersion
        },

        async getConnector(input) {
            return connectorMetadataService(log).get({
                name: input.name,
                version: input.version,
                workspaceId: input.workspaceId,
                tenantId: input.tenantId,
            })
        },

        async recordTriggerRun(input) {
            const redisConnection = await redisConnections.useExisting()
            await triggerRunStats(log, redisConnection).save(input)
        },

        async getPrewarmData(input) {
            return preWarmWorkersService(log).getPrewarmData(input)
        },

        async extendLock(input) {
            await jobBroker(log).extendLock(input)
        },

        async getConnectorArchive(input) {
            const { data } = await fileService(log).getDataOrThrow({
                fileId: input.archiveId,
                type: FileType.PACKAGE_ARCHIVE,
            })
            return data
        },

        async getWorkflowBundle(input) {
            // Two intentional lookups (not the redundant double-read): the metadata
            // read decides the transport, so S3-backed bundles never load their bytes
            // into app memory — the worker pulls them straight from S3 via a signed URL.
            const file = await fileService(log).getFile({
                fileId: input.workflowVersionId,
                workspaceId: input.workspaceId,
                type: FileType.WORKFLOW_BUNDLE,
            })
            if (isNil(file)) {
                return null
            }
            if (signedFileTransport.isEnabled(file)) {
                assertNotNullOrUndefined(file.s3Key, 's3Key')
                const url = await s3Helper(log).getS3SignedUrl(file.s3Key, file.fileName ?? file.id)
                return { kind: 'url', url }
            }
            const { data } = await fileService(log).getDataOrThrow({
                fileId: input.workflowVersionId,
                workspaceId: input.workspaceId,
                type: FileType.WORKFLOW_BUNDLE,
            })
            return { kind: 'inline', data }
        },

        async prepareWorkflowBundleUpload(input) {
            // Bundles are only worth persisting on S3-backed storage. On DB storage the
            // bundle would just bloat the database (and a null-data pre-save would throw),
            // so tell the worker to skip publishing and always build inline.
            if (getLocationForFile(FileType.WORKFLOW_BUNDLE) !== FileLocation.S3) {
                return { kind: 'skip' }
            }
            // S3 without signed URLs: the worker streams the bytes back via uploadWorkflowBundle.
            if (!signedFileTransport.shouldRedirectForType(FileType.WORKFLOW_BUNDLE)) {
                return { kind: 'inline' }
            }
            // Signed-PUT path: persist the row (data null) so the s3Key exists, then
            // hand back a signed PUT URL for a direct-to-S3 upload.
            const file = await fileService(log).save({
                fileId: input.workflowVersionId,
                workspaceId: input.workspaceId,
                tenantId: input.tenantId,
                type: FileType.WORKFLOW_BUNDLE,
                data: null,
                size: input.size,
                compression: FileCompression.NONE,
            })
            assertNotNullOrUndefined(file.s3Key, 's3Key')
            const url = await s3Helper(log).putS3SignedUrl({
                s3Key: file.s3Key,
                contentLength: input.size,
            })
            return { kind: 'url', url }
        },

        async uploadWorkflowBundle(input) {
            await fileService(log).save({
                fileId: input.workflowVersionId,
                workspaceId: input.workspaceId,
                tenantId: input.tenantId,
                type: FileType.WORKFLOW_BUNDLE,
                data: input.data,
                size: input.data.length,
                compression: FileCompression.NONE,
            })
        },

        async disableWorkflow(input) {
            const { workflowId, workspaceId } = input
            const workflow = await workflowService(log).getOneOrThrow({ id: workflowId, workspaceId })
            if (workflow.status === WorkflowStatus.DISABLED) {
                return
            }
            const tenantId = await workspaceService(log).getTenantId(workspaceId)
            const disabledWorkflow = await workflowService(log).update({
                id: workflowId,
                userId: null,
                workspaceId,
                tenantId,
                emitEvents: false,
                operation: {
                    type: WorkflowOperationType.CHANGE_STATUS,
                    request: { status: WorkflowStatus.DISABLED },
                },
            })
            workflowSideEffects(log).onDisabledByWorker({ workflow: disabledWorkflow, workspaceId, tenantId })
            log.info({ workflow: { id: workflowId }, workspace: { id: workspaceId } }, '[workerRpc#disableWorkflow] Workflow disabled by worker request')
        },

    }
}

