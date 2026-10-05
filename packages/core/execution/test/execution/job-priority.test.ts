import { getDefaultJobPriority, JOB_PRIORITY, LATEST_JOB_DATA_SCHEMA_VERSION, RunEnvironment, WorkerJobType, WorkflowTriggerType } from '../../src'

describe('getDefaultJobPriority', () => {
    const polling = {
        projectId: 'p',
        tenantId: 't',
        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
        workflowVersionId: 'v',
        workflowId: 'w',
        triggerType: WorkflowTriggerType.CONNECTOR,
        jobType: WorkerJobType.EXECUTE_POLLING as const,
    }
    const runOf = (environment: RunEnvironment) => ({
        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
        projectId: 'p',
        tenantId: 't',
        environment,
        workflowId: 'w',
        runId: 'r',
        jobType: WorkerJobType.EXECUTE_WORKFLOW as const,
        workflowVersionId: 'v',
        payload: { type: 'inline' as const, value: null },
        streamStepProgress: undefined,
        logsFileId: 'l',
        logPrivacy: undefined,
        executionType: 'BEGIN' as const,
        executeTrigger: false,
        workerHandlerId: null,
    })

    it('lets a poll jump ahead of queued runs, so a backlog of runs never hides new events or departures', () => {
        const poll = JOB_PRIORITY[getDefaultJobPriority(polling)]
        const run = JOB_PRIORITY[getDefaultJobPriority(runOf(RunEnvironment.PRODUCTION))]
        expect(poll).toBeLessThan(run)
    })
})
