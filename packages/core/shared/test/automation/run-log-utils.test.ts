import {
    ExecutionStatus,
    RerunEligibilityInput,
    RunEnvironment,
    RunLogConditionField,
    RunLogConditionState,
    RunLogDurationOperator,
    runLogFilterUtils,
    RunLogMatch,
    RunLogTimeRange,
    RunLogType,
    RunRerunBlockReason,
    runRerunUtils,
} from '../../src'

describe('runLogFilterUtils.parseSearchParams', () => {
    it('defaults to run logs of the last 24 hours with no conditions', () => {
        const { state, ignoredParams } = runLogFilterUtils.parseSearchParams({ params: new URLSearchParams(), presetProjectId: null })
        expect(state.type).toBe(RunLogType.RUN)
        expect(state.match).toBe(RunLogMatch.ALL)
        expect(state.time).toBe(RunLogTimeRange.HOURS_24)
        expect(state.conditions).toEqual([])
        expect(ignoredParams).toEqual([])
    })

    it('widens the default time to 30 days for a run deep link', () => {
        const { state } = runLogFilterUtils.parseSearchParams({ params: new URLSearchParams('run=abc'), presetProjectId: null })
        expect(state.time).toBe(RunLogTimeRange.DAYS_30)
    })

    it('keeps legacy links working', () => {
        const params = new URLSearchParams('workflowId=wf1&status=FAILED&status=TIMEOUT&createdAfter=2026-09-01T00:00:00.000Z&failedStepMessage=boom&executionIds=r1')
        const { state } = runLogFilterUtils.parseSearchParams({ params, presetProjectId: null })
        expect(state.customRange).toEqual({ createdAfter: '2026-09-01T00:00:00.000Z', createdBefore: null })
        expect(state.runIds).toEqual(['r1'])
        expect(state.conditions).toEqual([
            { field: RunLogConditionField.WORKFLOW, values: ['wf1'] },
            { field: RunLogConditionField.STATUS, values: [ExecutionStatus.FAILED, ExecutionStatus.TIMEOUT] },
            { field: RunLogConditionField.CONTENT, text: 'boom' },
        ])
    })

    it('reports and drops invalid parameters', () => {
        const params = new URLSearchParams('time=2y&status=NOPE&durationSeconds=-3&type=weird')
        const { state, ignoredParams } = runLogFilterUtils.parseSearchParams({ params, presetProjectId: null })
        expect(state.time).toBe(RunLogTimeRange.HOURS_24)
        expect(state.type).toBe(RunLogType.RUN)
        expect(state.conditions).toEqual([])
        expect(ignoredParams).toEqual(['type', 'time', 'status', 'durationSeconds'])
    })

    it('presets the project condition in project mode unless all projects were chosen', () => {
        const preset = runLogFilterUtils.parseSearchParams({ params: new URLSearchParams(), presetProjectId: 'p1' })
        expect(preset.state.conditions).toEqual([{ field: RunLogConditionField.PROJECT, values: ['p1'] }])
        const all = runLogFilterUtils.parseSearchParams({ params: new URLSearchParams('allProjects=true'), presetProjectId: 'p1' })
        expect(all.state.conditions).toEqual([])
    })
})

describe('runLogFilterUtils.effective', () => {
    it('ignores incomplete conditions and counts them', () => {
        const result = runLogFilterUtils.effective({
            match: RunLogMatch.ANY,
            conditions: [
                { field: RunLogConditionField.WORKFLOW, values: [] },
                { field: RunLogConditionField.CONTENT, text: '  ' },
                { field: RunLogConditionField.DURATION, operator: RunLogDurationOperator.GTE, seconds: 'abc' },
                { field: RunLogConditionField.STATUS, values: [ExecutionStatus.FAILED] },
            ],
        })
        expect(result.complete).toEqual([{ field: RunLogConditionField.STATUS, values: [ExecutionStatus.FAILED] }])
        expect(result.incompleteCount).toBe(3)
        expect(result.match).toBe(RunLogMatch.ALL)
    })

    it('keeps match any when more than one condition is complete', () => {
        const result = runLogFilterUtils.effective({
            match: RunLogMatch.ANY,
            conditions: [
                { field: RunLogConditionField.CONTENT, text: 'x' },
                { field: RunLogConditionField.DURATION, operator: RunLogDurationOperator.LTE, seconds: '1.5' },
            ],
        })
        expect(result.match).toBe(RunLogMatch.ANY)
    })

    it('classifies condition completeness', () => {
        expect(runLogFilterUtils.conditionState({ field: RunLogConditionField.DURATION, operator: RunLogDurationOperator.GTE, seconds: '' })).toBe(RunLogConditionState.EMPTY)
        expect(runLogFilterUtils.conditionState({ field: RunLogConditionField.DURATION, operator: RunLogDurationOperator.GTE, seconds: '-1' })).toBe(RunLogConditionState.INVALID)
        expect(runLogFilterUtils.conditionState({ field: RunLogConditionField.DURATION, operator: RunLogDurationOperator.GTE, seconds: '10' })).toBe(RunLogConditionState.COMPLETE)
    })
})

describe('runLogFilterUtils round trip', () => {
    it('writes complete conditions to the URL and reads them back', () => {
        const state = {
            type: RunLogType.ALL,
            match: RunLogMatch.ANY,
            time: RunLogTimeRange.DAYS_7,
            customRange: null,
            runIds: [],
            conditions: [
                { field: RunLogConditionField.PROJECT, values: ['p1', 'p2'] },
                { field: RunLogConditionField.CONNECTOR, values: ['@scope/connector-slack'] },
                { field: RunLogConditionField.WORKFLOW, values: [] },
                { field: RunLogConditionField.DURATION, operator: RunLogDurationOperator.LTE, seconds: '30' },
            ],
        }
        const params = runLogFilterUtils.writeSearchParams({ state, base: new URLSearchParams('view=runs&cursor=abc&run=r9'), presetProjectId: null })
        expect(params.get('cursor')).toBeNull()
        expect(params.get('view')).toBe('runs')
        expect(params.get('run')).toBe('r9')
        const parsed = runLogFilterUtils.parseSearchParams({ params, presetProjectId: null })
        expect(parsed.state).toEqual({
            ...state,
            conditions: state.conditions.filter((condition) => condition.field !== RunLogConditionField.WORKFLOW),
        })
    })

    it('marks all projects when the preset project condition was removed', () => {
        const state = { ...runLogFilterUtils.defaultState({ runDeepLink: false, presetProjectId: null }) }
        const params = runLogFilterUtils.writeSearchParams({ state, base: new URLSearchParams(), presetProjectId: 'p1' })
        expect(params.get('allProjects')).toBe('true')
    })

    it('builds the list query from complete conditions only', () => {
        const query = runLogFilterUtils.toListQuery({
            state: {
                type: RunLogType.DEBUG,
                match: RunLogMatch.ANY,
                time: RunLogTimeRange.MINUTES_15,
                customRange: null,
                runIds: [],
                conditions: [
                    { field: RunLogConditionField.CONTENT, text: ' key-1 ' },
                    { field: RunLogConditionField.STATUS, values: [] },
                ],
            },
        })
        expect(query).toMatchObject({ type: RunLogType.DEBUG, match: RunLogMatch.ALL, time: RunLogTimeRange.MINUTES_15, content: 'key-1' })
        expect(query.status).toBeUndefined()
    })
})

describe('runRerunUtils.blockReason', () => {
    const eligible: RerunEligibilityInput = {
        environment: RunEnvironment.PRODUCTION,
        deduped: false,
        workflowExists: true,
        parentRunId: null,
        status: ExecutionStatus.FAILED,
        inPlaceRetryCount: 0,
        chainRerunStatuses: [],
        canWrite: true,
        workflowPublished: true,
        workflowEnabled: true,
    }

    it('allows a failed production run', () => {
        expect(runRerunUtils.blockReason(eligible)).toBeNull()
        expect(runRerunUtils.blockReason({ ...eligible, status: ExecutionStatus.TIMEOUT })).toBeNull()
    })

    it.each([
        [{ environment: RunEnvironment.TESTING }, RunRerunBlockReason.DEBUG_RUN],
        [{ deduped: true }, RunRerunBlockReason.DEDUPED],
        [{ workflowExists: false }, RunRerunBlockReason.WORKFLOW_DELETED],
        [{ parentRunId: 'parent' }, RunRerunBlockReason.SUBFLOW_RUN],
        [{ chainRerunStatuses: [ExecutionStatus.FAILED, ExecutionStatus.SUCCEEDED] }, RunRerunBlockReason.RERUN_SUCCEEDED],
        [{ inPlaceRetryCount: 1, status: ExecutionStatus.SUCCEEDED }, RunRerunBlockReason.RERUN_SUCCEEDED],
        [{ chainRerunStatuses: [ExecutionStatus.RUNNING] }, RunRerunBlockReason.RERUN_IN_PROGRESS],
        [{ inPlaceRetryCount: 2, status: ExecutionStatus.QUEUED }, RunRerunBlockReason.RERUN_IN_PROGRESS],
        [{ status: ExecutionStatus.SUCCEEDED }, RunRerunBlockReason.NOT_FAILED],
        [{ status: ExecutionStatus.RUNNING }, RunRerunBlockReason.NOT_FAILED],
        [{ canWrite: false }, RunRerunBlockReason.VIEW_ONLY],
        [{ workflowPublished: false }, RunRerunBlockReason.NO_PUBLISHED_VERSION],
        [{ workflowEnabled: false }, RunRerunBlockReason.WORKFLOW_STOPPED],
    ])('blocks %o with %s', (override, reason) => {
        expect(runRerunUtils.blockReason({ ...eligible, ...override })).toBe(reason)
    })

    it('does not block on failed earlier reruns of the same trigger', () => {
        expect(runRerunUtils.blockReason({ ...eligible, chainRerunStatuses: [ExecutionStatus.FAILED, ExecutionStatus.TIMEOUT] })).toBeNull()
    })
})

describe('runRerunUtils.fromFailedStepBlockReason', () => {
    it('inherits the run block reason', () => {
        expect(runRerunUtils.fromFailedStepBlockReason({ runBlockReason: RunRerunBlockReason.VIEW_ONLY, hasFailedStep: true, rawDataAvailable: true })).toBe(RunRerunBlockReason.VIEW_ONLY)
    })

    it('needs a recorded failed step and raw data', () => {
        expect(runRerunUtils.fromFailedStepBlockReason({ runBlockReason: null, hasFailedStep: false, rawDataAvailable: true })).toBe(RunRerunBlockReason.NO_FAILED_STEP)
        expect(runRerunUtils.fromFailedStepBlockReason({ runBlockReason: null, hasFailedStep: true, rawDataAvailable: false })).toBe(RunRerunBlockReason.RAW_DATA_EXPIRED)
        expect(runRerunUtils.fromFailedStepBlockReason({ runBlockReason: null, hasFailedStep: true, rawDataAvailable: true })).toBeNull()
    })
})
