import { generateId, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { ActionRunStep, EngineResponse, EngineResponseStatus, ExecuteActionResponse, WorkerJobType, WorkflowActionType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService, getConnectorPackageWithoutArchive } from '../connectors/metadata/connector-metadata-service'
import { jobQueue } from '../workers/job-queue/job-queue'
import { userInteractionWatcher } from '../workers/user-interaction-watcher'

export const actionRunService = (log: FastifyBaseLogger) => ({
    async runConnectorAction({ tenantId, projectId, connectorName, actionName, input, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS }: RunConnectorActionParams): Promise<ActionRunOutcome> {
        const metadata = await connectorMetadataService(log).getOrThrow({ name: connectorName, version: undefined, tenantId })
        const connector = await getConnectorPackageWithoutArchive(log, tenantId, { connectorName, connectorVersion: metadata.version })
        const step = ActionRunStep.parse({
            name: STEP_NAME,
            type: WorkflowActionType.CONNECTOR,
            valid: true,
            displayName: actionName,
            lastUpdatedDate: dayjs().toISOString(),
            settings: {
                connectorName,
                connectorVersion: metadata.version,
                actionName,
                input,
                propertySettings: {},
                errorHandlingOptions: {},
            },
        })
        const requestId = generateId()
        const expiresAt = Date.now() + timeoutSeconds * 1000
        const started = Date.now()
        const { data: response, error } = await tryCatch(() => userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteActionResponse>>({
            jobType: WorkerJobType.EXECUTE_ACTION,
            projectId,
            tenantId,
            step,
            connector,
            expiresAt,
        }, log, requestId))
        const durationMs = Date.now() - started
        if (!isNil(error) || isNil(response)) {
            const neverStarted = await jobQueue(log).cancelAndReportNeverStarted({ jobId: requestId, tenantId, projectId, jobType: WorkerJobType.EXECUTE_ACTION })
            log.warn({ connector: { name: connectorName }, project: { id: projectId }, neverStarted }, '[actionRunService#runConnectorAction] Worker did not answer in time')
            return { status: ActionRunStatus.TIMEOUT, output: null, errorMessage: error?.message ?? 'The worker did not answer', neverStarted, durationMs }
        }
        return toOutcome({ response, durationMs })
    },
})

function toOutcome({ response, durationMs }: { response: EngineResponse<ExecuteActionResponse>, durationMs: number }): ActionRunOutcome {
    switch (response.status) {
        case EngineResponseStatus.OK:
            return {
                status: response.response.success ? ActionRunStatus.SUCCEEDED : ActionRunStatus.FAILED,
                output: response.response.output,
                errorMessage: response.response.success ? null : response.response.message ?? 'The action failed',
                neverStarted: false,
                durationMs,
            }
        case EngineResponseStatus.TIMEOUT:
            return {
                status: ActionRunStatus.TIMEOUT,
                output: null,
                errorMessage: 'The action did not finish in time',
                neverStarted: response.response?.neverStarted === true,
                durationMs,
            }
        default:
            return {
                status: ActionRunStatus.INTERNAL_ERROR,
                output: null,
                errorMessage: response.response?.message ?? 'The worker could not run the action',
                neverStarted: false,
                durationMs,
            }
    }
}

export enum ActionRunStatus {
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
    TIMEOUT = 'TIMEOUT',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
}

const STEP_NAME = 'step_1'
const DEFAULT_TIMEOUT_SECONDS = 120

type RunConnectorActionParams = {
    tenantId: string
    projectId: string
    connectorName: string
    actionName: string
    input: Record<string, unknown>
    timeoutSeconds?: number
}

export type ActionRunOutcome = {
    status: ActionRunStatus
    output: unknown
    errorMessage: string | null
    neverStarted: boolean
    durationMs: number
}
