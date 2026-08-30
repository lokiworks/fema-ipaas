import { CreateWaitpointHook, CreateWaitpointParams, CreateWaitpointResult, RunContext, StopHookParams } from '@fema-ipaas/connector-sdk'
import { isNil } from '@fema-ipaas/core-utils'
import { PausedWorkflowTimeoutError } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { waitpointClient } from '../connector-context/waitpoint-client'
import { HookResponse } from '../utils'

export function buildRunContext({ runtime, stepName, hooks, pending }: BuildRunContextParams): RunContext {
    return {
        id: runtime.executionId,
        stop: (request?: StopHookParams) => {
            hooks.hookResponse = { ...hooks.hookResponse, type: 'stopped', response: request ?? { response: {} } }
        },
        respond: (request?: StopHookParams) => {
            hooks.hookResponse = { ...hooks.hookResponse, type: 'respond', response: request ?? { response: {} } }
        },
        createWaitpoint: createWaitpointHook({ runtime, stepName, hooks, pending }),
        waitForWaitpoint: () => {
            assertCanSuspend(runtime)
            hooks.hookResponse = { ...hooks.hookResponse, type: 'paused' }
        },
    }
}

function createWaitpointHook({ runtime, stepName, hooks, pending }: BuildRunContextParams): CreateWaitpointHook {
    return (params: CreateWaitpointParams) => {
        const created = createWaitpoint({ runtime, stepName, hooks, params })
        pending.push(created)
        return created
    }
}

async function createWaitpoint({ runtime, stepName, hooks, params }: CreateWaitpointInternalParams): Promise<CreateWaitpointResult> {
    assertCanSuspend(runtime)
    assertDelayWithinTimeout(params.resumeDateTime)
    if (!isNil(params.responseToSend)) {
        hooks.hookResponse = { ...hooks.hookResponse, responseToSend: params.responseToSend }
    }
    const result = await waitpointClient.create({
        apiUrl: runtime.internalApiUrl,
        engineToken: runtime.engineToken,
        executionId: runtime.executionId,
        projectId: runtime.projectId,
        stepName,
        type: params.type,
        version: params.version ?? 'V1',
        resumeDateTime: params.resumeDateTime,
        responseToSend: params.responseToSend,
        workerHandlerId: runtime.workerHandlerId,
        httpRequestId: runtime.httpRequestId,
    })
    return {
        ...result,
        buildResumeUrl: ({ queryParams, sync }) => {
            const url = new URL(`${result.resumeUrl}${sync ? '/sync' : ''}`)
            url.search = new URLSearchParams(queryParams).toString()
            return url.toString()
        },
    }
}

function assertCanSuspend(runtime: SuspendableRuntime): void {
    if (runtime.actionRunMode) {
        throw new Error('This action pauses the run (waitpoint) and can only run inside a workflow, not as a action run.')
    }
}

function assertDelayWithinTimeout(resumeDateTime?: string): void {
    if (isNil(resumeDateTime)) {
        return
    }
    if (dayjs(resumeDateTime).diff(dayjs(), 'days') > FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS) {
        throw new PausedWorkflowTimeoutError(undefined, FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS)
    }
}

const FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS = Number(process.env.FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS)

type CreateWaitpointInternalParams = Omit<BuildRunContextParams, 'pending'> & {
    params: CreateWaitpointParams
}

export type SuspendableRuntime = {
    internalApiUrl: string
    publicApiUrl: string
    engineToken: string
    projectId: string
    executionId: string
    actionRunMode: boolean
    workerHandlerId?: string
    httpRequestId?: string
}

export type BuildRunContextParams = {
    runtime: SuspendableRuntime
    stepName: string
    hooks: { hookResponse: HookResponse }
    pending: Promise<unknown>[]
}
