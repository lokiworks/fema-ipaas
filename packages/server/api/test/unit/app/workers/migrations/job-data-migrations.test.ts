import { ExecuteWorkflowJobData, ExecutionType, WorkflowTriggerType, PollingJobData, ResumeReason, RunEnvironment, StreamStepProgress, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../src/app/workflows/workflow-version/workflow-version.service', () => ({
    workflowVersionService: () => ({
        getOne: vi.fn().mockResolvedValue({ workflowId: 'workflow-1' }),
    }),
    workflowVersionRepo: () => ({}),
}))

const { jobMigrations } = await import('../../../../../src/app/workers/migrations/job-data-migrations')

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

const LATEST = 10

function baseWorkflowJob(overrides: Partial<ExecuteWorkflowJobData> = {}): ExecuteWorkflowJobData {
    return {
        jobType: WorkerJobType.EXECUTE_WORKFLOW,
        schemaVersion: 6,
        workspaceId: 'proj-1',
        platformId: 'plat-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'fv-1',
        runId: 'run-1',
        environment: RunEnvironment.PRODUCTION,
        executionType: ExecutionType.BEGIN,
        streamStepProgress: StreamStepProgress.NONE,
        payload: { type: 'inline', value: {} },
        logsFileId: 'file-1',
        ...overrides,
    }
}

function basePollingJob(overrides: Partial<PollingJobData> = {}): PollingJobData {
    return {
        jobType: WorkerJobType.EXECUTE_POLLING,
        schemaVersion: 6,
        workspaceId: 'proj-1',
        platformId: 'plat-1',
        workflowVersionId: 'fv-1',
        workflowId: 'workflow-1',
        triggerType: WorkflowTriggerType.CONNECTOR,
        ...overrides,
    }
}

describe('jobMigrations v6 → v7 (dropLogsUploadUrl)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('strips logsUploadUrl from EXECUTE_WORKFLOW at v6 and bumps to latest', async () => {
        const legacy = {
            ...baseWorkflowJob({ schemaVersion: 6 }),
            logsUploadUrl: 'https://old-api.example.com/v1/executions/logs?token=ABC',
        }

        const migrated = await jobMigrations(mockLog).apply(legacy) as ExecuteWorkflowJobData & Record<string, unknown>

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.logsUploadUrl).toBeUndefined()
        // Other identifying fields preserved
        expect(migrated.runId).toBe('run-1')
        expect(migrated.logsFileId).toBe('file-1')
    })

    it('passes through non-EXECUTE_WORKFLOW jobs at v6 without mutating shape, bumps to latest', async () => {
        const job = basePollingJob({ schemaVersion: 6 })

        const migrated = await jobMigrations(mockLog).apply(job)

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.jobType).toBe(WorkerJobType.EXECUTE_POLLING)
        expect((migrated as PollingJobData).triggerType).toBe(WorkflowTriggerType.CONNECTOR)
    })

    it('is a no-op for jobs already at the latest schemaVersion', async () => {
        const job = baseWorkflowJob({ schemaVersion: LATEST })

        const migrated = await jobMigrations(mockLog).apply(job)

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.runId).toBe('run-1')
    })
})

describe('jobMigrations v7 → v8 (backfillRequiredExecuteWorkflowFields)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('maps legacy progressUpdateType=TEST_WORKFLOW to streamStepProgress=WEBSOCKET', async () => {
        const legacy = {
            ...baseWorkflowJob({ schemaVersion: 7 }),
            streamStepProgress: undefined,
            progressUpdateType: 'TEST_WORKFLOW',
        } as Record<string, unknown>

        const migrated = await jobMigrations(mockLog).apply(legacy) as ExecuteWorkflowJobData

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.streamStepProgress).toBe(StreamStepProgress.WEBSOCKET)
    })

    it('maps legacy progressUpdateType=WEBHOOK_RESPONSE to streamStepProgress=WEBSOCKET', async () => {
        const legacy = {
            ...baseWorkflowJob({ schemaVersion: 7 }),
            streamStepProgress: undefined,
            progressUpdateType: 'WEBHOOK_RESPONSE',
        } as Record<string, unknown>

        const migrated = await jobMigrations(mockLog).apply(legacy) as ExecuteWorkflowJobData

        expect(migrated.streamStepProgress).toBe(StreamStepProgress.WEBSOCKET)
    })

    it('falls back to streamStepProgress=NONE for unknown legacy progressUpdateType', async () => {
        const legacy = {
            ...baseWorkflowJob({ schemaVersion: 7 }),
            streamStepProgress: undefined,
            progressUpdateType: undefined,
        } as Record<string, unknown>

        const migrated = await jobMigrations(mockLog).apply(legacy) as ExecuteWorkflowJobData

        expect(migrated.streamStepProgress).toBe(StreamStepProgress.NONE)
    })

    it('renames legacy synchronousHandlerId to workerHandlerId', async () => {
        const legacy = {
            ...baseWorkflowJob({ schemaVersion: 7 }),
            workerHandlerId: undefined,
            synchronousHandlerId: 'handler-7',
        } as Record<string, unknown>

        const migrated = await jobMigrations(mockLog).apply(legacy) as ExecuteWorkflowJobData

        expect(migrated.workerHandlerId).toBe('handler-7')
    })

    it('preserves an explicit workerHandlerId / streamStepProgress already set', async () => {
        const job = baseWorkflowJob({
            schemaVersion: 7,
            workerHandlerId: 'explicit-handler',
            streamStepProgress: StreamStepProgress.WEBSOCKET,
        })

        const migrated = await jobMigrations(mockLog).apply(job) as ExecuteWorkflowJobData

        expect(migrated.workerHandlerId).toBe('explicit-handler')
        expect(migrated.streamStepProgress).toBe(StreamStepProgress.WEBSOCKET)
    })

    it('only bumps schemaVersion for non-EXECUTE_WORKFLOW jobs at v7', async () => {
        const job = basePollingJob({ schemaVersion: 7 })

        const migrated = await jobMigrations(mockLog).apply(job)

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.jobType).toBe(WorkerJobType.EXECUTE_POLLING)
    })
})

describe('jobMigrations v9 → v10 (addResumeReason)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('classifies inline-null payload as RETRY (the only legacy producer of that shape)', async () => {
        const job = baseWorkflowJob({
            schemaVersion: 9,
            executionType: ExecutionType.RESUME,
            payload: { type: 'inline', value: null },
        })

        const migrated = await jobMigrations(mockLog).apply(job) as ExecuteWorkflowJobData

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.resumeReason).toBe(ResumeReason.RETRY)
    })

    it('classifies inline payload with a real body as WAITPOINT', async () => {
        const job = baseWorkflowJob({
            schemaVersion: 9,
            executionType: ExecutionType.RESUME,
            payload: { type: 'inline', value: { body: { action: 'approve' }, headers: {}, queryParams: {} } },
        })

        const migrated = await jobMigrations(mockLog).apply(job) as ExecuteWorkflowJobData

        expect(migrated.resumeReason).toBe(ResumeReason.WAITPOINT)
    })

    it('classifies ref payload as WAITPOINT (offloaded payloads were never produced by retry)', async () => {
        const job = baseWorkflowJob({
            schemaVersion: 9,
            executionType: ExecutionType.RESUME,
            payload: { type: 'ref', fileId: 'offloaded-payload-1' },
        })

        const migrated = await jobMigrations(mockLog).apply(job) as ExecuteWorkflowJobData

        expect(migrated.resumeReason).toBe(ResumeReason.WAITPOINT)
    })

    it('only bumps schemaVersion for BEGIN execution (resumeReason is meaningless for BEGIN)', async () => {
        const job = baseWorkflowJob({
            schemaVersion: 9,
            executionType: ExecutionType.BEGIN,
        })

        const migrated = await jobMigrations(mockLog).apply(job) as ExecuteWorkflowJobData

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.resumeReason).toBeUndefined()
    })

    it('only bumps schemaVersion for non-EXECUTE_WORKFLOW jobs at v9', async () => {
        const job = basePollingJob({ schemaVersion: 9 })

        const migrated = await jobMigrations(mockLog).apply(job)

        expect(migrated.schemaVersion).toBe(LATEST)
        expect(migrated.jobType).toBe(WorkerJobType.EXECUTE_POLLING)
        expect('resumeReason' in migrated).toBe(false)
    })
})
