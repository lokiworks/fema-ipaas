import { assertNotNullOrUndefined, isNil } from '@fema/core-utils'
import { apVersionUtil, onCallService, UNKNOWN_VERSION } from '@fema/server-utils'
import { ExecutionType, FileCompression, FileLocation, FileType, FlowOperationType, FlowStatus, WorkerGroupScope, WorkerToApiContract } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { redisConnections } from '../../database/redis-connections'
import { fileService, getLocationForFile } from '../../file/file.service'
import { s3Helper } from '../../file/s3-helper'
import { signedFileTransport } from '../../file/signed-file-transport'
import { flowSideEffects } from '../../flows/flow/flow-service-side-effects'
import { flowService } from '../../flows/flow/flow.service'
import { engineRunCallbackService } from '../../flows/flow-run/engine-run-callback-service'
import { flowRunService } from '../../flows/flow-run/flow-run-service'
import { flowVersionService } from '../../flows/flow-version/flow-version.service'
import { preWarmWorkersService } from '../../flows/pre-warm-workers'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { dedupeService } from '../../trigger/dedupe-service'
import { triggerEventService } from '../../trigger/trigger-events/trigger-event.service'
import { triggerRunStats } from '../../trigger/trigger-run/trigger-run-stats'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { workspaceService } from '../../workspace/workspace-service'
import { getPlatformGroupQueueName, getWorkspaceGroupQueueName, QueueName, WorkerGroupAssignment } from '../job'
import { jobBroker } from '../job-queue/job-broker'
import { machineService } from '../machine/machine-service'

const getPollQueueName = (assignment: WorkerGroupAssignment | null): string => {
    if (isNil(assignment)) {
        return QueueName.WORKER_JOBS
    }
    return assignment.scope === WorkerGroupScope.WORKSPACE
        ? getWorkspaceGroupQueueName(assignment.id)
        : getPlatformGroupQueueName(assignment.id)
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
            const appVersion = apVersionUtil.getCurrentRelease()
            if (!apVersionUtil.versionsAreCompatible({ versionA: workerVersion, versionB: appVersion })) {
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
            const { flowVersionId, workspaceId, payloads, httpRequestId, streamStepProgress, environment, parentRunId, failParentOnFailure } = input

            const flowVersion = await flowVersionService(log).getOne(flowVersionId)
            if (!flowVersion) {
                return []
            }

            const platformId = await workspaceService(log).getPlatformId(workspaceId)
            const filterPayloads = await dedupeService.filterUniquePayloads(flowVersionId, payloads)

            const creditsExhausted = false

            const flowRuns = await Promise.all(
                filterPayloads.map((payload) =>
                    creditsExhausted
                        ? flowRunService(log).createQuotaExceededRun({
                            flowVersion,
                            payload,
                            workspaceId,
                            environment,
                            parentRunId,
                            failParentOnFailure,
                            shouldExecuteTriggerOnRetry: false,
                        })
                        : flowRunService(log).start({
                            flowId: flowVersion.flowId,
                            environment,
                            flowVersionId,
                            payload,
                            workspaceId,
                            platformId,
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
            return flowRuns
        },

        async savePayloads(input) {
            const { flowId, workspaceId, payloads } = input
            const savePayloads = payloads.map((payload) =>
                rejectedPromiseHandler(triggerEventService(log).saveEvent({
                    flowId,
                    payload,
                    workspaceId,
                }), log),
            )
            rejectedPromiseHandler(Promise.all(savePayloads), log)
            if (payloads.length > 0) {
                await triggerSourceService(log).disable({
                    flowId,
                    workspaceId,
                    simulate: true,
                    ignoreError: true,
                })
            }
        },

        async getFlowVersion(input) {
            const flowVersion = await flowVersionService(log).getOne(input.versionId)
            if (isNil(flowVersion)) {
                return null
            }
            const flow = await flowService(log).getOneById(flowVersion.flowId)
            if (isNil(flow)) {
                return null
            }
            return flowVersion
        },

        async getConnector(input) {
            return connectorMetadataService(log).get({
                name: input.name,
                version: input.version,
                workspaceId: input.workspaceId,
                platformId: input.platformId,
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

        async getFlowBundle(input) {
            // Two intentional lookups (not the redundant double-read): the metadata
            // read decides the transport, so S3-backed bundles never load their bytes
            // into app memory — the worker pulls them straight from S3 via a signed URL.
            const file = await fileService(log).getFile({
                fileId: input.flowVersionId,
                workspaceId: input.workspaceId,
                type: FileType.FLOW_BUNDLE,
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
                fileId: input.flowVersionId,
                workspaceId: input.workspaceId,
                type: FileType.FLOW_BUNDLE,
            })
            return { kind: 'inline', data }
        },

        async prepareFlowBundleUpload(input) {
            // Bundles are only worth persisting on S3-backed storage. On DB storage the
            // bundle would just bloat the database (and a null-data pre-save would throw),
            // so tell the worker to skip publishing and always build inline.
            if (getLocationForFile(FileType.FLOW_BUNDLE) !== FileLocation.S3) {
                return { kind: 'skip' }
            }
            // S3 without signed URLs: the worker streams the bytes back via uploadFlowBundle.
            if (!signedFileTransport.shouldRedirectForType(FileType.FLOW_BUNDLE)) {
                return { kind: 'inline' }
            }
            // Signed-PUT path: persist the row (data null) so the s3Key exists, then
            // hand back a signed PUT URL for a direct-to-S3 upload.
            const file = await fileService(log).save({
                fileId: input.flowVersionId,
                workspaceId: input.workspaceId,
                platformId: input.platformId,
                type: FileType.FLOW_BUNDLE,
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

        async uploadFlowBundle(input) {
            await fileService(log).save({
                fileId: input.flowVersionId,
                workspaceId: input.workspaceId,
                platformId: input.platformId,
                type: FileType.FLOW_BUNDLE,
                data: input.data,
                size: input.data.length,
                compression: FileCompression.NONE,
            })
        },

        async disableFlow(input) {
            const { flowId, workspaceId } = input
            const flow = await flowService(log).getOneOrThrow({ id: flowId, workspaceId })
            if (flow.status === FlowStatus.DISABLED) {
                return
            }
            const platformId = await workspaceService(log).getPlatformId(workspaceId)
            const disabledFlow = await flowService(log).update({
                id: flowId,
                userId: null,
                workspaceId,
                platformId,
                emitEvents: false,
                operation: {
                    type: FlowOperationType.CHANGE_STATUS,
                    request: { status: FlowStatus.DISABLED },
                },
            })
            flowSideEffects(log).onDisabledByWorker({ flow: disabledFlow, workspaceId, platformId })
            log.info({ flow: { id: flowId }, workspace: { id: workspaceId } }, '[workerRpc#disableFlow] Flow disabled by worker request')
        },

    }
}

