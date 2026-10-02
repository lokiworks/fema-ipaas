import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionStatus, isExecutionStateTerminal, isFailedState, RunEnvironment } from '@fema-ipaas/workflow-core'
import {
    ListRunLogsRequestQuery,
    RunLogCondition,
    RunLogConditionField,
    RunLogConditionState,
    RunLogCustomRange,
    RunLogDurationOperator,
    RunLogFilterState,
    RunLogMatch,
    RunLogTimeRange,
    RunLogType,
    RunRerunBlockReason,
} from './run-log'

function conditionState(condition: RunLogCondition): RunLogConditionState {
    switch (condition.field) {
        case RunLogConditionField.PROJECT:
        case RunLogConditionField.WORKFLOW:
        case RunLogConditionField.STATUS:
        case RunLogConditionField.CONNECTOR:
            return condition.values.length > 0 ? RunLogConditionState.COMPLETE : RunLogConditionState.EMPTY
        case RunLogConditionField.CONTENT:
        case RunLogConditionField.BUSINESS_KEY:
            return condition.text.trim().length > 0 ? RunLogConditionState.COMPLETE : RunLogConditionState.EMPTY
        case RunLogConditionField.DURATION: {
            const text = condition.seconds.trim()
            if (text.length === 0) {
                return RunLogConditionState.EMPTY
            }
            return NON_NEGATIVE_NUMBER.test(text) ? RunLogConditionState.COMPLETE : RunLogConditionState.INVALID
        }
    }
}

function effective({ match, conditions }: Pick<RunLogFilterState, 'match' | 'conditions'>): EffectiveFilter {
    const complete = conditions.filter((condition) => conditionState(condition) === RunLogConditionState.COMPLETE)
    return {
        match: match === RunLogMatch.ANY && complete.length > 1 ? RunLogMatch.ANY : RunLogMatch.ALL,
        complete,
        incompleteCount: conditions.length - complete.length,
    }
}

function emptyCondition(field: RunLogConditionField): RunLogCondition {
    switch (field) {
        case RunLogConditionField.PROJECT:
            return { field, values: [] }
        case RunLogConditionField.WORKFLOW:
            return { field, values: [] }
        case RunLogConditionField.STATUS:
            return { field, values: [] }
        case RunLogConditionField.CONNECTOR:
            return { field, values: [] }
        case RunLogConditionField.CONTENT:
            return { field, text: '' }
        case RunLogConditionField.BUSINESS_KEY:
            return { field, text: '' }
        case RunLogConditionField.DURATION:
            return { field, operator: RunLogDurationOperator.GTE, seconds: '' }
    }
}

function defaultState({ runDeepLink, presetProjectId }: { runDeepLink: boolean, presetProjectId: string | null }): RunLogFilterState {
    return {
        type: RunLogType.RUN,
        match: RunLogMatch.ALL,
        time: runDeepLink ? RunLogTimeRange.DAYS_30 : RunLogTimeRange.HOURS_24,
        customRange: null,
        conditions: isNil(presetProjectId) ? [] : [{ field: RunLogConditionField.PROJECT, values: [presetProjectId] }],
        runIds: [],
    }
}

function parseSearchParams({ params, presetProjectId }: ParseSearchParamsInput): ParsedRunLogFilter {
    const type = readEnum({ raw: params.get(PARAM.TYPE), values: Object.values(RunLogType) })
    const match = readEnum({ raw: params.get(PARAM.MATCH), values: Object.values(RunLogMatch) })
    const time = readEnum({ raw: params.get(PARAM.TIME), values: Object.values(RunLogTimeRange) })
    const customRange = readCustomRange(params)
    const statuses = readList(params, PARAM.STATUS)
    const validStatuses = statuses.filter((status) => isExecutionStatus(status))
    const durationText = (params.get(PARAM.DURATION_SECONDS) ?? '').trim()
    const durationValid = durationText.length > 0 && NON_NEGATIVE_NUMBER.test(durationText)
    const durationOperator = readEnum({ raw: params.get(PARAM.DURATION_OPERATOR), values: Object.values(RunLogDurationOperator) })
    const content = (params.get(PARAM.CONTENT) ?? params.get(PARAM.LEGACY_FAILED_STEP_MESSAGE) ?? '').trim()
    const projectIds = readList(params, PARAM.PROJECT)
    const presetProject = projectIds.length === 0 && params.get(PARAM.ALL_PROJECTS) !== 'true' && !isNil(presetProjectId)
        ? [presetProjectId]
        : projectIds
    const conditions: RunLogCondition[] = [
        ...listCondition({ field: RunLogConditionField.PROJECT, values: presetProject }),
        ...listCondition({ field: RunLogConditionField.WORKFLOW, values: readList(params, PARAM.WORKFLOW) }),
        ...statusCondition(validStatuses),
        ...listCondition({ field: RunLogConditionField.CONNECTOR, values: readList(params, PARAM.CONNECTOR) }),
        ...contentCondition(content),
        ...businessKeyCondition((params.get(PARAM.BUSINESS_KEY) ?? '').trim()),
        ...durationCondition({ valid: durationValid, operator: durationOperator.value ?? RunLogDurationOperator.GTE, seconds: durationText }),
    ]
    const ignoredParams = [
        ...(type.invalid ? [PARAM.TYPE] : []),
        ...(match.invalid ? [PARAM.MATCH] : []),
        ...(time.invalid ? [PARAM.TIME] : []),
        ...(customRange.invalid ? [PARAM.CREATED_AFTER] : []),
        ...(validStatuses.length < statuses.length ? [PARAM.STATUS] : []),
        ...(durationText.length > 0 && !durationValid ? [PARAM.DURATION_SECONDS] : []),
        ...(durationOperator.invalid ? [PARAM.DURATION_OPERATOR] : []),
    ]
    const fallback = defaultState({ runDeepLink: !isNil(params.get(PARAM.RUN)), presetProjectId: null })
    return {
        state: {
            type: type.value ?? fallback.type,
            match: match.value ?? fallback.match,
            time: time.value ?? fallback.time,
            customRange: customRange.value,
            conditions,
            runIds: readList(params, PARAM.RUN_IDS),
        },
        ignoredParams,
    }
}

function writeSearchParams({ state, base, presetProjectId }: WriteSearchParamsInput): URLSearchParams {
    const kept = [...base.entries()].filter(([key]) => !FILTER_KEYS.includes(key))
    const { complete } = effective(state)
    const hasProject = complete.some((condition) => condition.field === RunLogConditionField.PROJECT)
    const entries: [string, string][] = [
        ...kept,
        ...(state.type === RunLogType.RUN ? [] : [entry({ key: PARAM.TYPE, value: state.type })]),
        ...(state.match === RunLogMatch.ANY ? [entry({ key: PARAM.MATCH, value: state.match })] : []),
        ...timeEntries(state),
        ...complete.flatMap((condition) => conditionEntries(condition)),
        ...(!hasProject && !isNil(presetProjectId) ? [entry({ key: PARAM.ALL_PROJECTS, value: 'true' })] : []),
        ...state.runIds.map((id): [string, string] => [PARAM.RUN_IDS, id]),
    ]
    return new URLSearchParams(entries)
}

function toListQuery({ state }: { state: RunLogFilterState }): ListRunLogsRequestQuery {
    const { match, complete } = effective(state)
    const byField = <F extends RunLogConditionField>(field: F): Extract<RunLogCondition, { field: F }> | undefined =>
        complete.find((condition): condition is Extract<RunLogCondition, { field: F }> => condition.field === field)
    const duration = byField(RunLogConditionField.DURATION)
    return {
        type: state.type,
        match,
        time: isNil(state.customRange) ? state.time : undefined,
        createdAfter: state.customRange?.createdAfter,
        createdBefore: state.customRange?.createdBefore ?? undefined,
        projectId: byField(RunLogConditionField.PROJECT)?.values,
        workflowId: byField(RunLogConditionField.WORKFLOW)?.values,
        status: byField(RunLogConditionField.STATUS)?.values,
        connector: byField(RunLogConditionField.CONNECTOR)?.values,
        content: byField(RunLogConditionField.CONTENT)?.text.trim(),
        businessKey: byField(RunLogConditionField.BUSINESS_KEY)?.text.trim(),
        durationOperator: duration?.operator,
        durationSeconds: isNil(duration) ? undefined : Number(duration.seconds.trim()),
        runIds: state.runIds.length > 0 ? state.runIds : undefined,
    }
}

function timeRangeMs(time: RunLogTimeRange): number {
    switch (time) {
        case RunLogTimeRange.MINUTES_15:
            return 15 * MINUTE_MS
        case RunLogTimeRange.MINUTES_30:
            return 30 * MINUTE_MS
        case RunLogTimeRange.HOURS_1:
            return 60 * MINUTE_MS
        case RunLogTimeRange.HOURS_24:
            return DAY_MS
        case RunLogTimeRange.DAYS_3:
            return 3 * DAY_MS
        case RunLogTimeRange.DAYS_7:
            return 7 * DAY_MS
        case RunLogTimeRange.DAYS_15:
            return 15 * DAY_MS
        case RunLogTimeRange.DAYS_30:
            return 30 * DAY_MS
    }
}

function blockReason(input: RerunEligibilityInput): RunRerunBlockReason | null {
    const settledByOwnRetry = input.inPlaceRetryCount > 0
    if (input.environment === RunEnvironment.TESTING) {
        return RunRerunBlockReason.DEBUG_RUN
    }
    if (input.deduped) {
        return RunRerunBlockReason.DEDUPED
    }
    if (!input.workflowExists) {
        return RunRerunBlockReason.WORKFLOW_DELETED
    }
    if (!isNil(input.parentRunId)) {
        return RunRerunBlockReason.SUBFLOW_RUN
    }
    if (input.chainRerunStatuses.includes(ExecutionStatus.SUCCEEDED) || (settledByOwnRetry && input.status === ExecutionStatus.SUCCEEDED)) {
        return RunRerunBlockReason.RERUN_SUCCEEDED
    }
    const inProgress = input.chainRerunStatuses.some((status) => !isExecutionStateTerminal({ status, ignoreInternalError: false }))
    if (inProgress || (settledByOwnRetry && !isExecutionStateTerminal({ status: input.status, ignoreInternalError: false }))) {
        return RunRerunBlockReason.RERUN_IN_PROGRESS
    }
    if (!isFailedState(input.status)) {
        return RunRerunBlockReason.NOT_FAILED
    }
    if (!input.canWrite) {
        return RunRerunBlockReason.VIEW_ONLY
    }
    if (!input.workflowPublished) {
        return RunRerunBlockReason.NO_PUBLISHED_VERSION
    }
    if (!input.workflowEnabled) {
        return RunRerunBlockReason.WORKFLOW_STOPPED
    }
    return null
}

function fromFailedStepBlockReason({ runBlockReason, hasFailedStep, rawDataAvailable }: FromFailedStepInput): RunRerunBlockReason | null {
    if (!isNil(runBlockReason)) {
        return runBlockReason
    }
    if (!hasFailedStep) {
        return RunRerunBlockReason.NO_FAILED_STEP
    }
    if (!rawDataAvailable) {
        return RunRerunBlockReason.RAW_DATA_EXPIRED
    }
    return null
}

function readEnum<T extends string>({ raw, values }: { raw: string | null, values: T[] }): { value: T | null, invalid: boolean } {
    if (isNil(raw) || raw.length === 0) {
        return { value: null, invalid: false }
    }
    const value = values.find((candidate) => candidate === raw)
    return isNil(value) ? { value: null, invalid: true } : { value, invalid: false }
}

function readList(params: URLSearchParams, key: string): string[] {
    const values = params.getAll(key).map((value) => value.trim()).filter((value) => value.length > 0)
    return [...new Set(values)]
}

function readCustomRange(params: URLSearchParams): { value: RunLogCustomRange | null, invalid: boolean } {
    const after = params.get(PARAM.CREATED_AFTER)
    if (isNil(after) || after.length === 0) {
        return { value: null, invalid: false }
    }
    if (Number.isNaN(Date.parse(after))) {
        return { value: null, invalid: true }
    }
    const before = params.get(PARAM.CREATED_BEFORE)
    const validBefore = !isNil(before) && !Number.isNaN(Date.parse(before)) ? before : null
    return { value: { createdAfter: after, createdBefore: validBefore }, invalid: false }
}

function isExecutionStatus(value: string): value is ExecutionStatus {
    return Object.values(ExecutionStatus).some((status) => status === value)
}

function listCondition({ field, values }: { field: RunLogConditionField.PROJECT | RunLogConditionField.WORKFLOW | RunLogConditionField.CONNECTOR, values: string[] }): RunLogCondition[] {
    return values.length > 0 ? [{ field, values }] : []
}

function statusCondition(values: ExecutionStatus[]): RunLogCondition[] {
    return values.length > 0 ? [{ field: RunLogConditionField.STATUS, values }] : []
}

function contentCondition(text: string): RunLogCondition[] {
    return text.length > 0 ? [{ field: RunLogConditionField.CONTENT, text }] : []
}

function businessKeyCondition(text: string): RunLogCondition[] {
    return text.length > 0 ? [{ field: RunLogConditionField.BUSINESS_KEY, text }] : []
}

function durationCondition({ valid, operator, seconds }: { valid: boolean, operator: RunLogDurationOperator, seconds: string }): RunLogCondition[] {
    return valid ? [{ field: RunLogConditionField.DURATION, operator, seconds }] : []
}

function entry({ key, value }: { key: string, value: string }): [string, string] {
    return [key, value]
}

function timeEntries(state: RunLogFilterState): [string, string][] {
    if (isNil(state.customRange)) {
        return [[PARAM.TIME, state.time]]
    }
    return [
        [PARAM.CREATED_AFTER, state.customRange.createdAfter],
        ...(isNil(state.customRange.createdBefore) ? [] : [entry({ key: PARAM.CREATED_BEFORE, value: state.customRange.createdBefore })]),
    ]
}

function conditionEntries(condition: RunLogCondition): [string, string][] {
    switch (condition.field) {
        case RunLogConditionField.PROJECT:
            return condition.values.map((value): [string, string] => [PARAM.PROJECT, value])
        case RunLogConditionField.WORKFLOW:
            return condition.values.map((value): [string, string] => [PARAM.WORKFLOW, value])
        case RunLogConditionField.STATUS:
            return condition.values.map((value): [string, string] => [PARAM.STATUS, value])
        case RunLogConditionField.CONNECTOR:
            return condition.values.map((value): [string, string] => [PARAM.CONNECTOR, value])
        case RunLogConditionField.CONTENT:
            return [[PARAM.CONTENT, condition.text.trim()]]
        case RunLogConditionField.BUSINESS_KEY:
            return [[PARAM.BUSINESS_KEY, condition.text.trim()]]
        case RunLogConditionField.DURATION:
            return [[PARAM.DURATION_OPERATOR, condition.operator], [PARAM.DURATION_SECONDS, condition.seconds.trim()]]
    }
}

const NON_NEGATIVE_NUMBER = /^\d+(\.\d+)?$/
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

const PARAM = {
    TYPE: 'type',
    MATCH: 'match',
    TIME: 'time',
    CREATED_AFTER: 'createdAfter',
    CREATED_BEFORE: 'createdBefore',
    PROJECT: 'projectId',
    ALL_PROJECTS: 'allProjects',
    WORKFLOW: 'workflowId',
    STATUS: 'status',
    CONNECTOR: 'connector',
    CONTENT: 'content',
    BUSINESS_KEY: 'businessKey',
    LEGACY_FAILED_STEP_MESSAGE: 'failedStepMessage',
    DURATION_OPERATOR: 'durationOperator',
    DURATION_SECONDS: 'durationSeconds',
    RUN_IDS: 'executionIds',
    RUN: 'run',
    CURSOR: 'cursor',
}

const FILTER_KEYS: string[] = [
    PARAM.TYPE,
    PARAM.MATCH,
    PARAM.TIME,
    PARAM.CREATED_AFTER,
    PARAM.CREATED_BEFORE,
    PARAM.PROJECT,
    PARAM.ALL_PROJECTS,
    PARAM.WORKFLOW,
    PARAM.STATUS,
    PARAM.CONNECTOR,
    PARAM.CONTENT,
    PARAM.BUSINESS_KEY,
    PARAM.LEGACY_FAILED_STEP_MESSAGE,
    PARAM.DURATION_OPERATOR,
    PARAM.DURATION_SECONDS,
    PARAM.RUN_IDS,
    PARAM.CURSOR,
]

type EffectiveFilter = {
    match: RunLogMatch
    complete: RunLogCondition[]
    incompleteCount: number
}

type ParseSearchParamsInput = {
    params: URLSearchParams
    presetProjectId: string | null
}

type WriteSearchParamsInput = {
    state: RunLogFilterState
    base: URLSearchParams
    presetProjectId: string | null
}

type FromFailedStepInput = {
    runBlockReason: RunRerunBlockReason | null
    hasFailedStep: boolean
    rawDataAvailable: boolean
}

export const runLogFilterUtils = {
    conditionState,
    effective,
    emptyCondition,
    defaultState,
    parseSearchParams,
    writeSearchParams,
    toListQuery,
    timeRangeMs,
    params: PARAM,
}

export const runRerunUtils = {
    blockReason,
    fromFailedStepBlockReason,
}

export type ParsedRunLogFilter = {
    state: RunLogFilterState
    ignoredParams: string[]
}

export type RerunEligibilityInput = {
    environment: RunEnvironment
    deduped: boolean
    workflowExists: boolean
    parentRunId: string | null | undefined
    status: ExecutionStatus
    inPlaceRetryCount: number
    chainRerunStatuses: ExecutionStatus[]
    canWrite: boolean
    workflowPublished: boolean
    workflowEnabled: boolean
}
