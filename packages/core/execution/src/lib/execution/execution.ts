import { z } from 'zod'
import { ErrorCode } from '@fema-ipaas/core-utils'
import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { blockedUntilMarker, isNil, truncateString, tryParseFriendlyConnectorError } from '@fema-ipaas/core-utils'
import { ExecutionState, RunInternalError } from './state/execution-output'
import { ExecutionStatus } from './state/workflow-execution'

export const FAILED_STEP_MESSAGE_MAX_LENGTH = 700

export function truncateFailedStepMessage(
    failedStep: FailedStep | undefined,
): FailedStep | undefined {
    if (isNil(failedStep) || isNil(failedStep.message) || failedStep.message.length <= FAILED_STEP_MESSAGE_MAX_LENGTH) {
        return failedStep
    }
    return { ...failedStep, message: shortenFailedStepMessage(failedStep.message) }
}

function shortenFailedStepMessage(message: string): string {
    const friendly = tryParseFriendlyConnectorError(message)
    if (isNil(friendly)) {
        return truncateKeepingBlockedUntil({ value: message, maxLength: FAILED_STEP_MESSAGE_MAX_LENGTH })
    }
    const { raw: _raw, responseBody: _responseBody, responseHeaders: _responseHeaders, requestBody: _requestBody, ...summary } = friendly
    const compact = JSON.stringify({
        ...summary,
        message: truncateKeepingBlockedUntil({ value: summary.message, maxLength: FRIENDLY_SUMMARY_MESSAGE_MAX_LENGTH }),
    })
    return compact.length <= FAILED_STEP_MESSAGE_MAX_LENGTH
        ? compact
        : truncateKeepingBlockedUntil({ value: summary.message, maxLength: FAILED_STEP_MESSAGE_MAX_LENGTH })
}

function truncateKeepingBlockedUntil({ value, maxLength }: { value: string, maxLength: number }): string {
    const until = blockedUntilMarker.parse(value)
    if (isNil(until)) {
        return truncateString({ value, maxLength })
    }
    return blockedUntilMarker.attach({ message: truncateString({ value: blockedUntilMarker.strip(value), maxLength: maxLength - BLOCKED_UNTIL_MARKER_RESERVE }), until })
}

const FRIENDLY_SUMMARY_MESSAGE_MAX_LENGTH = 400
const BLOCKED_UNTIL_MARKER_RESERVE = 50

export const PARENT_RUN_ID_HEADER = 'ap-parent-run-id'
export const FAIL_PARENT_ON_FAILURE_HEADER = 'ap-fail-parent-on-failure'
export const RAW_PAYLOAD_HEADER = 'ap-raw-payload'

export enum RunEnvironment {
    PRODUCTION = 'PRODUCTION',
    TESTING = 'TESTING',
}

export enum WorkflowRetryStrategy {
    ON_LATEST_VERSION = 'ON_LATEST_VERSION',
    FROM_FAILED_STEP = 'FROM_FAILED_STEP',
}

export type WorkflowRetryPayload = {
    strategy: WorkflowRetryStrategy
}

export const FailedStep = z.object({
    name: z.string(),
    displayName: z.string(),
    message: z.string().optional(),
})
export type FailedStep = z.infer<typeof FailedStep>

export const TimelinePhase = z.object({
    name: z.enum(['QUEUE', 'PROVISION', 'BOOT', 'RUN']),
    durationMs: z.number(),
})
export type TimelinePhase = z.infer<typeof TimelinePhase>

// One leg per execution attempt; legs.length > 1 means the run paused and resumed.
export const RunTimeline = z.object({
    legs: z.array(z.array(TimelinePhase)),
})
export type RunTimeline = z.infer<typeof RunTimeline>

export const Execution = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    workflowId: z.string(),
    parentRunId: z.string().optional(),
    failParentOnFailure: z.boolean(),
    triggeredBy: z.string().optional(),
    tags: z.array(z.string()).optional(),
    workflowVersionId: z.string(),
    workflowVersion: z.object({
        displayName: z.string().optional(),
    }).optional(),
    logsFileId: Nullable(z.string()),
    displayLogsFileId: Nullable(z.string()),
    status: z.nativeEnum(ExecutionStatus),
    startTime: z.string().nullish(),
    finishTime: z.string().nullish(),
    timeline: RunTimeline.nullish(),
    environment: z.nativeEnum(RunEnvironment),
    // The steps data may be missing if the workflow has not started yet,
    // or if the run is older than FEMA_EXECUTION_DATA_RETENTION_DAYS and its execution data has been purged.
    steps: Nullable(z.record(z.string(), z.unknown())),
    failedStep: FailedStep.optional(),
    stepNameToTest: z.string().optional(),
    archivedAt: Nullable(z.string()),
    stepsCount: z.number().optional(),
    issueId: Nullable(z.string()),
    rerunOfExecutionId: z.string().nullish(),
    businessKey: z.string().nullish(),
    inPlaceRetryCount: z.number().optional(),
    privacyMaskedFields: z.number().optional(),
    payloadRedacted: z.boolean().optional(),
    // Populated only for tenant admins on INTERNAL_ERROR runs; stripped from the response otherwise.
    internalError: RunInternalError.optional(),
})

export type Execution = z.infer<typeof Execution> & ExecutionState

export type ExecutionWithRetryError = Execution & {
    error?: { errorCode: ErrorCode, errorMessage: string }
}
