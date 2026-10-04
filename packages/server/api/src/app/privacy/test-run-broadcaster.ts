import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import {
    LogPrivacy,
    logRedaction,
    PayloadLevel,
    SampleDataFileType,
    StepRunResponse,
    UpdateStepProgressRequest,
    WebsocketClientEvent,
    workflowStructureUtil,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { websocketService } from '../core/websockets.service'
import { projectService } from '../project/project-service'
import { executionRepo } from '../workflows/execution/execution-service'
import { sampleDataService } from '../workflows/step-run/sample-data.service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { privacyService } from './privacy.service'

export const testRunBroadcaster = (log: FastifyBaseLogger) => ({
    async stepResponse({ projectId, event, response, stepName }: StepResponseParams): Promise<void> {
        const context = await contextOf({ log, projectId, runId: response.runId, stepName })
        const viewsOf = ({ scope }: { scope: MaskScope }): StepRunResponse & { projectId: string } => {
            const masked = maskStep({ context, scope, stepName, input: response.input, output: response.output, errorText: response.standardError, consoleText: response.standardOutput })
            return {
                ...response,
                projectId,
                input: masked.input,
                output: masked.output,
                standardError: textOrEmpty(masked.errorText),
                standardOutput: textOrEmpty(masked.consoleText),
            }
        }
        await deliver({ log, context, projectId, event, views: { raw: { ...response, projectId }, viewer: () => viewsOf({ scope: 'LITERALS' }), masked: () => viewsOf({ scope: 'ALL' }) } })
    },

    async stepProgress({ projectId, request }: StepProgressParams): Promise<void> {
        const stepName = await testedStepNameOf({ projectId, runId: request.runId })
        const context = await contextOf({ log, projectId, runId: request.runId, stepName })
        const viewsOf = ({ scope }: { scope: MaskScope }): UpdateStepProgressRequest => {
            const masked = maskStep({ context, scope, stepName, input: undefined, output: request.output, errorText: undefined, consoleText: undefined })
            return { ...request, output: masked.output }
        }
        await deliver({ log, context, projectId, event: WebsocketClientEvent.TEST_STEP_PROGRESS, views: { raw: request, viewer: () => viewsOf({ scope: 'LITERALS' }), masked: () => viewsOf({ scope: 'ALL' }) } })
    },

    async runProgress({ projectId, request }: RunProgressParams): Promise<void> {
        const parsed = RunProgressShape.safeParse(request)
        if (!parsed.success) {
            log.warn({ project: { id: projectId } }, '[testRunBroadcaster#runProgress] Dropped a progress event with an unexpected shape')
            return
        }
        const { execution, step } = parsed.data
        const context = await contextOf({ log, projectId, runId: execution.id, stepName: step?.name })
        if (isNil(step)) {
            await deliver({ log, context, projectId, event: WebsocketClientEvent.UPDATE_RUN_PROGRESS, views: { raw: request, viewer: () => request, masked: () => request } })
            return
        }
        const liveOutputs = trackSensitiveOutput({ runId: execution.id, stepName: step.name, output: step.output, sensitive: context.stepIsSensitive })
        const liveContext = { ...context, sensitiveOutputs: { ...context.sensitiveOutputs, ...liveOutputs } }
        const viewsOf = ({ scope }: { scope: MaskScope }): unknown => {
            const masked = maskStep({ context: liveContext, scope, stepName: step.name, input: undefined, output: undefined, errorText: undefined, consoleText: undefined, wholeStep: step.output })
            return { ...parsed.data, step: { ...step, output: masked.wholeStep } }
        }
        await deliver({ log, context, projectId, event: WebsocketClientEvent.UPDATE_RUN_PROGRESS, views: { raw: request, viewer: () => viewsOf({ scope: 'LITERALS' }), masked: () => viewsOf({ scope: 'ALL' }) } })
    },
})

async function deliver({ log, context, projectId, event, views }: DeliverParams): Promise<void> {
    const sockets = await websocketService.socketsIn(projectId)
    const userIds = [...new Set(sockets.flatMap((socket) => isNil(socket.userId) ? [] : [socket.userId]))]
    const viewers = context.stepIsSensitive ? new Set<string>() : await privacyService(log).rawViewerIds({ tenantId: context.tenantId, userIds })
    const maskedView = views.masked()
    const viewerView = context.sensitiveStepNames.length === 0 ? views.raw : views.viewer()
    sockets.forEach((socket) => {
        const isViewer = !isNil(socket.userId) && viewers.has(socket.userId)
        websocketService.to(socket.id).emit(event, isViewer ? viewerView : maskedView)
    })
}

async function contextOf({ log, projectId, runId, stepName }: ContextParams): Promise<MaskContext> {
    const tenantId = await projectService(log).getTenantId(projectId)
    const settings = await privacyService(log).get({ tenantId })
    const execution = await executionRepo().findOne({ where: { id: runId, projectId }, select: ['workflowVersionId'] })
    const version = isNil(execution) ? null : await workflowVersionService(log).getOne(execution.workflowVersionId)
    const sensitiveStepNames = isNil(version) ? [] : workflowStructureUtil.getSensitiveStepNames(version.trigger)
    const sensitiveOutputs = isNil(version) ? {} : await sensitiveSampleOutputs({ log, projectId, version, sensitiveStepNames })
    return {
        tenantId,
        privacy: { payloadLevel: PayloadLevel.FULL, maskRules: settings.maskRules, displayLogsFileId: '', sensitiveStepNames },
        sensitiveStepNames,
        sensitiveOutputs,
        stepIsSensitive: !isNil(stepName) && sensitiveStepNames.includes(stepName),
    }
}

async function sensitiveSampleOutputs({ log, projectId, version, sensitiveStepNames }: SensitiveSampleParams): Promise<Record<string, unknown>> {
    const entries = await Promise.all(sensitiveStepNames.map(async (stepName) => {
        const { data } = await tryCatch(() => sampleDataService(log).getOrReturnEmpty({ projectId, workflowVersion: version, stepName, type: SampleDataFileType.OUTPUT }))
        const entry: [string, unknown] = [stepName, data]
        return entry
    }))
    return Object.fromEntries(entries)
}

async function testedStepNameOf({ projectId, runId }: { projectId: string, runId: string }): Promise<string | undefined> {
    const execution = await executionRepo().findOne({ where: { id: runId, projectId }, select: ['stepNameToTest'] })
    return execution?.stepNameToTest ?? undefined
}

function maskStep({ context, scope, stepName, input, output, errorText, consoleText, wholeStep }: MaskStepParams): MaskedStep {
    const currentKey = stepName ?? CURRENT_STEP_KEY
    const upstream = Object.fromEntries(Object.entries(context.sensitiveOutputs).map(([name, value]) => [name, { output: value }]))
    const current = isNil(wholeStep) ? { input, output, errorMessage: errorText } : wholeStep
    const { steps } = logRedaction.redactSteps({
        steps: { ...upstream, [currentKey]: current, [CONSOLE_KEY]: { errorMessage: consoleText } },
        privacy: scope === 'ALL' ? context.privacy : { ...context.privacy, maskRules: [] },
    })
    const maskedCurrent = MaskedStepShape.safeParse(steps[currentKey])
    const maskedConsole = MaskedStepShape.safeParse(steps[CONSOLE_KEY])
    return {
        input: maskedCurrent.success ? maskedCurrent.data.input : null,
        output: maskedCurrent.success ? maskedCurrent.data.output : null,
        errorText: maskedCurrent.success ? maskedCurrent.data.errorMessage : undefined,
        consoleText: maskedConsole.success ? maskedConsole.data.errorMessage : undefined,
        wholeStep: steps[currentKey],
    }
}

function trackSensitiveOutput({ runId, stepName, output, sensitive }: TrackParams): Record<string, unknown> {
    const known = liveSensitiveOutputs.get(runId) ?? {}
    if (!sensitive) {
        return known
    }
    const stepOutput = StepOutputShape.safeParse(output)
    const next = { ...known, [stepName]: stepOutput.success ? stepOutput.data.output : undefined }
    liveSensitiveOutputs.delete(runId)
    liveSensitiveOutputs.set(runId, next)
    const overflow = liveSensitiveOutputs.size - MAX_TRACKED_RUNS
    if (overflow > 0) {
        [...liveSensitiveOutputs.keys()].slice(0, overflow).forEach((oldest) => liveSensitiveOutputs.delete(oldest))
    }
    return next
}

function textOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

const CURRENT_STEP_KEY = '$step'
const CONSOLE_KEY = '$console'
const MAX_TRACKED_RUNS = 200
const liveSensitiveOutputs = new Map<string, Record<string, unknown>>()

const MaskedStepShape = z.looseObject({
    input: z.unknown(),
    output: z.unknown(),
    errorMessage: z.unknown(),
})

const StepOutputShape = z.looseObject({
    output: z.unknown(),
})

const RunProgressShape = z.looseObject({
    execution: z.looseObject({ id: z.string() }),
    step: z.looseObject({ name: z.string(), output: z.unknown() }).optional(),
})

type StepResponseParams = {
    projectId: string
    event: WebsocketClientEvent.TEST_STEP_PROGRESS | WebsocketClientEvent.TEST_STEP_FINISHED
    response: StepRunResponse
    stepName: string | undefined
}

type StepProgressParams = {
    projectId: string
    request: UpdateStepProgressRequest
}

type RunProgressParams = {
    projectId: string
    request: unknown
}

type ContextParams = {
    log: FastifyBaseLogger
    projectId: string
    runId: string
    stepName: string | undefined
}

type MaskContext = {
    tenantId: string
    privacy: LogPrivacy
    sensitiveStepNames: string[]
    sensitiveOutputs: Record<string, unknown>
    stepIsSensitive: boolean
}

type DeliverParams = {
    log: FastifyBaseLogger
    context: MaskContext
    projectId: string
    event: WebsocketClientEvent
    views: {
        raw: unknown
        viewer: () => unknown
        masked: () => unknown
    }
}

type TrackParams = {
    runId: string
    stepName: string
    output: unknown
    sensitive: boolean
}

type SensitiveSampleParams = {
    log: FastifyBaseLogger
    projectId: string
    version: NonNullable<Awaited<ReturnType<ReturnType<typeof workflowVersionService>['getOne']>>>
    sensitiveStepNames: string[]
}

type MaskScope = 'ALL' | 'LITERALS'

type MaskStepParams = {
    context: MaskContext
    scope: MaskScope
    stepName: string | undefined
    input: unknown
    output: unknown
    errorText: unknown
    consoleText: unknown
    wholeStep?: unknown
}

type MaskedStep = {
    input: unknown
    output: unknown
    errorText: unknown
    consoleText: unknown
    wholeStep: unknown
}
