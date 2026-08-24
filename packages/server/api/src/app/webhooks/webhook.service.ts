import { assertNotNullOrUndefined, generateId, isNil, TenantId, WorkflowVersionId, WorkspaceId } from '@fema-ipaas/core-utils'
import { wideEvent } from '@fema-ipaas/server-utils'
import { EngineHttpResponse, EventPayload, Execution, ExecutionType, LATEST_JOB_DATA_SCHEMA_VERSION, RunEnvironment, StreamStepProgress, TriggerPayload, WorkerJobType, Workflow, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { pinoLogging } from '../helper/logger'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { triggerSourceService } from '../trigger/trigger-source/trigger-source-service'
import { engineResponseWatcher } from '../workers/engine-response-watcher'
import { jobQueue, JobType } from '../workers/job-queue/job-queue'
import { payloadOffloader } from '../workers/payload-offloader'
import { executionService } from '../workflows/execution/execution-service'
import { workflowExecutionCache } from '../workflows/workflow/workflow-execution-cache'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { webhookHandshake } from './webhook-handshake'

const WEBHOOK_TIMEOUT_MS = system.getNumberOrThrow(AppSystemProp.WEBHOOK_TIMEOUT_SECONDS) * 1000
const MAX_PAYLOAD_SIZE_BYTES = system.getNumberOrThrow(AppSystemProp.MAX_WEBHOOK_PAYLOAD_SIZE_MB) * 1024 * 1024

export enum WebhookWorkflowVersionToRun {
    LOCKED_FALL_BACK_TO_LATEST = 'locked_fall_back_to_latest',
    LATEST = 'latest',
}

export const webhookService = {
    async getWorkflowVersionIdToRun(type: WebhookWorkflowVersionToRun, workflow: Workflow): Promise<WorkflowVersionId> {
        if (type === WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST && !isNil(workflow.publishedVersionId)) {
            return workflow.publishedVersionId
        }

        const workflowVersionSchema = await workflowVersionRepo().createQueryBuilder()
            .select('id')
            .where({
                workflowId: workflow.id,
            })
            .orderBy('created', 'DESC')
            .getRawOne()
        assertNotNullOrUndefined(workflowVersionSchema, 'Workflow version not found')
        return workflowVersionSchema.id
    },

    async handleWebhook({
        logger,
        data,
        workflowId,
        async,
        saveSampleData,
        workflowVersionToRun,
        payload,
        execute,
        onRunCreated,
        parentRunId,
        failParentOnFailure,
        timeoutMs,
    }: HandleWebhookParams): Promise<EngineHttpResponse> {
        const webhookHeader = 'x-webhook-id'
        const webhookRequestId = generateId()
        wideEvent.set({
            workflow: { id: workflowId },
            webhook: {
                requestId: webhookRequestId,
                async,
                saveSampleData,
                execute,
            },
        })
        const pinoLogger = pinoLogging.createWebhookContextLog({ log: logger, webhookId: webhookRequestId, workflowId })
        const workflowExecutionResult = await workflowExecutionCache(pinoLogger).get({
            workflowId,
            simulate: saveSampleData,
        })

        if (!workflowExecutionResult.exists) {
            pinoLogger.info('Workflow not found, returning GONE')
            wideEvent.set({ webhook: { workflowFound: false } })
            return {
                status: StatusCodes.GONE,
                body: {},
                headers: {
                    [webhookHeader]: webhookRequestId,
                },
            }
        }
        const { workflow } = workflowExecutionResult

        // data() consumes the request body stream (streaming any file straight to storage), which
        // can only be read once. The handshake check and the payload resolution below both need it,
        // so memoize — a second call would stream an empty body and hand the run a 0-byte file URL.
        let resolvedDataPromise: Promise<EventPayload> | undefined
        const resolveData = (): Promise<EventPayload> => (resolvedDataPromise ??= data(workflow.workspaceId))

        wideEvent.set({
            webhook: {
                workflowFound: true,
            },
            workspace: { id: workflow.workspaceId },
            tenant: { id: workflowExecutionResult.tenantId },
        })
        const workflowVersionIdToRun = await webhookService.getWorkflowVersionIdToRun(workflowVersionToRun, workflow)
        wideEvent.set({ workflowVersion: { id: workflowVersionIdToRun } })

        // Handshake pings can arrive both during the publish window (when workflow.status is still
        // DISABLED before the transaction completes) and after the workflow is ENABLED (third-party
        // re-verification). Checking before the DISABLED guard handles both cases.
        if (!isNil(workflowExecutionResult.handshakeConfiguration)) {
            const response = await webhookHandshake.handleHandshakeRequest({
                payload: (payload ?? await resolveData()) as TriggerPayload,
                handshakeConfiguration: workflowExecutionResult.handshakeConfiguration,
                workflowId: workflow.id,
                workflowVersionId: workflowVersionIdToRun,
                workspaceId: workflow.workspaceId,
                logger: pinoLogger,
            })
            if (!isNil(response)) {
                logger.info({
                    workflow: { id: workflow.id },
                    workflowVersion: { id: workflowVersionIdToRun },
                    webhookRequestId,
                }, 'Handshake request completed')
                wideEvent.set({ webhook: { handshake: true } })
                return {
                    status: response.status,
                    body: response.body,
                    headers: response.headers ?? {},
                }
            }
        }

        if (workflow.status === WorkflowStatus.DISABLED && !saveSampleData) {
            pinoLogger.warn({ workflow: { id: workflowId } }, 'Webhook received for disabled workflow')
            wideEvent.set({ webhook: { workflowFound: false } })
            return {
                status: StatusCodes.NOT_FOUND,
                body: {},
                headers: {
                    [webhookHeader]: webhookRequestId,
                },
            }
        }

        pinoLogger.info('Adding webhook job to queue')

        const resolvedPayload = payload ?? await resolveData()

        const payloadSize = payloadOffloader.getPayloadSizeInBytes(resolvedPayload)
        if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
            pinoLogger.warn({ payloadSize, maxPayloadSizeBytes: MAX_PAYLOAD_SIZE_BYTES }, 'Webhook payload too large')
            wideEvent.set({ webhook: { payloadTooLarge: true } })
            return {
                status: StatusCodes.REQUEST_TOO_LONG,
                body: { message: 'Payload too large' },
                headers: {
                    [webhookHeader]: webhookRequestId,
                },
            }
        }

        if (async) {
            wideEvent.set({ webhook: { mode: 'async' } })
            return handleAsync({
                workflow,
                saveSampleData,
                tenantId: workflowExecutionResult.tenantId,
                workflowVersionIdToRun,
                payload: resolvedPayload,
                logger: pinoLogger,
                webhookRequestId,
                runEnvironment: workflowVersionToRun === WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST ? RunEnvironment.PRODUCTION : RunEnvironment.TESTING,
                webhookHeader,
                execute: workflow.status === WorkflowStatus.ENABLED && execute,
                parentRunId,
                failParentOnFailure,
            })
        }

        wideEvent.set({ webhook: { mode: 'sync' } })
        const workflowHttpResponse = await handleSync({
            payload: resolvedPayload,
            workspaceId: workflow.workspaceId,
            workflow,
            tenantId: workflowExecutionResult.tenantId,
            runEnvironment: workflowVersionToRun === WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST ? RunEnvironment.PRODUCTION : RunEnvironment.TESTING,
            logger: pinoLogger,
            webhookRequestId,
            workerHandlerId: engineResponseWatcher(pinoLogger).getServerId(),
            workflowVersionIdToRun,
            saveSampleData,
            workflowVersionToRun,
            onRunCreated,
            parentRunId,
            failParentOnFailure,
            timeoutMs,
        })
        return {
            status: workflowHttpResponse.status,
            body: workflowHttpResponse.body,
            headers: {
                ...workflowHttpResponse.headers,
                [webhookHeader]: webhookRequestId,
            },
        }
    },
}

async function handleAsync(params: AsyncWebhookParams): Promise<EngineHttpResponse> {
    const { workflow, logger, webhookRequestId, payload, workflowVersionIdToRun, webhookHeader, saveSampleData, execute, runEnvironment, parentRunId, failParentOnFailure, tenantId } = params

    const jobPayload = await payloadOffloader.offloadPayload(logger, payload, workflow.workspaceId, tenantId)

    await wideEvent.timed({
        name: 'webhookQueueAdd',
        fn: () => jobQueue(logger).add({
            id: webhookRequestId,
            type: JobType.ONE_TIME,
            data: {
                tenantId,
                workspaceId: workflow.workspaceId,
                schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                requestId: webhookRequestId,
                payload: jobPayload,
                jobType: WorkerJobType.EXECUTE_WEBHOOK,
                workflowId: workflow.id,
                saveSampleData,
                workflowVersionIdToRun,
                runEnvironment,
                execute,
                parentRunId,
                failParentOnFailure,
            },
        }),
    })
    logger.info('Async webhook request completed')
    wideEvent.set({ webhook: { queuedSuccessfully: true } })
    return {
        status: StatusCodes.OK,
        body: {},
        headers: {
            [webhookHeader]: webhookRequestId,
        },
    }
}

async function handleSync(params: SyncWebhookParams): Promise<EngineHttpResponse> {
    const { payload, workspaceId, workflow, logger, webhookRequestId, workerHandlerId, workflowVersionIdToRun, runEnvironment, saveSampleData, workflowVersionToRun, parentRunId, failParentOnFailure, tenantId, timeoutMs } = params

    if (saveSampleData) {
        rejectedPromiseHandler(savePayload({
            workflow,
            logger,
            webhookRequestId,
            payload,
            tenantId,
            workflowVersionIdToRun,
            runEnvironment,
            parentRunId,
            failParentOnFailure,
        }), logger)
    }

    const disabledWorkflow = workflow.status !== WorkflowStatus.ENABLED && workflowVersionToRun === WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST

    if (disabledWorkflow) {
        wideEvent.set({ webhook: { workflowDisabled: true } })
        return {
            status: StatusCodes.NOT_FOUND,
            body: {},
            headers: {},
        }
    }

    const creditsExhausted = false

    if (creditsExhausted) {
        const workflowVersion = await workflowVersionRepo().findOneBy({ id: workflowVersionIdToRun })
        assertNotNullOrUndefined(workflowVersion, 'workflowVersion')
        const quotaExceededRun = await executionService(logger).createQuotaExceededRun({
            workflowVersion,
            payload,
            workspaceId,
            environment: runEnvironment,
            parentRunId,
            failParentOnFailure,
            shouldExecuteTriggerOnRetry: true,
        })
        wideEvent.set({ execution: { id: quotaExceededRun.id }, webhook: { quotaExceeded: true } })
        return {
            status: StatusCodes.PAYMENT_REQUIRED,
            body: {},
            headers: {},
        }
    }

    const createdRun = await executionService(logger).start({
        tenantId,
        environment: runEnvironment,
        workflowId: workflow.id,
        workflowVersionId: workflowVersionIdToRun,
        payload,
        workerHandlerId,
        workspaceId,
        executeTrigger: true,
        httpRequestId: webhookRequestId,
        executionType: ExecutionType.BEGIN,
        streamStepProgress: StreamStepProgress.NONE,
        parentRunId,
        failParentOnFailure,
    })

    wideEvent.set({ execution: { id: createdRun.id } })
    params.onRunCreated?.(createdRun)

    const listenerResult = await engineResponseWatcher(logger).oneTimeListener<EngineHttpResponse>(webhookRequestId, true, timeoutMs ?? WEBHOOK_TIMEOUT_MS, {
        status: StatusCodes.REQUEST_TIMEOUT,
        body: {},
        headers: {},
    })
    return listenerResult
}

async function savePayload(params: Omit<AsyncWebhookParams, 'saveSampleData' | 'webhookHeader' | 'execute'>): Promise<void> {
    const { workflow, logger, webhookRequestId, payload, workflowVersionIdToRun, runEnvironment, parentRunId, failParentOnFailure, tenantId } = params
    await handleAsync({
        workflow,
        logger,
        webhookRequestId,
        payload,
        workflowVersionIdToRun,
        saveSampleData: true,
        runEnvironment,
        execute: false,
        webhookHeader: '',
        tenantId,
        parentRunId,
        failParentOnFailure,
    })
    await triggerSourceService(logger).disable({ workflowId: workflow.id, workspaceId: workflow.workspaceId, simulate: true, ignoreError: true })
}

type HandleWebhookParams = {
    workflowId: string
    async: boolean
    saveSampleData: boolean
    workflowVersionToRun: WebhookWorkflowVersionToRun
    data: (workspaceId: string) => Promise<EventPayload>
    logger: FastifyBaseLogger
    payload?: Record<string, unknown>
    execute: boolean
    onRunCreated?: (run: Execution) => void
    parentRunId?: string
    failParentOnFailure: boolean
    timeoutMs?: number
}

type AsyncWebhookParams = {
    workflow: Workflow
    logger: FastifyBaseLogger
    webhookRequestId: string
    tenantId: TenantId
    payload: unknown
    workflowVersionIdToRun: WorkflowVersionId
    webhookHeader: string
    saveSampleData: boolean
    runEnvironment: RunEnvironment
    execute: boolean
    parentRunId?: string
    failParentOnFailure: boolean
}

type SyncWebhookParams = {
    payload: unknown
    saveSampleData: boolean
    workspaceId: WorkspaceId
    runEnvironment: RunEnvironment
    tenantId: TenantId
    workflowVersionToRun: WebhookWorkflowVersionToRun
    workflow: Workflow
    logger: FastifyBaseLogger
    webhookRequestId: string
    workerHandlerId: string
    workflowVersionIdToRun: WorkflowVersionId
    onRunCreated?: (run: Execution) => void
    parentRunId?: string
    failParentOnFailure: boolean
    timeoutMs?: number
}
