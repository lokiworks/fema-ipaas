import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApplicationError, ErrorCode } from '@fema/core-utils';
import { EngineResponseStatus, ExecutionType, WorkflowActionType, ExecutionStatus, WorkflowTriggerType, WorkflowVersionState, StreamStepProgress, RunEnvironment, WorkerJobType } from '@fema/shared';
import type { ExecuteWorkflowJobData, WorkflowVersion } from '@fema/shared'

vi.mock('../../../../src/lib/config/worker-settings', () => ({
    workerSettings: {
        getSettings: vi.fn().mockReturnValue({ WORKFLOW_TIMEOUT_SECONDS: 600 }),
    },
}))

import { executeWorkflowJob } from '../../../../src/lib/execute/jobs/execute-workflow'
import { JobResultKind } from '../../../../src/lib/execute/types'

function makeWorkflowVersion(): WorkflowVersion {
    return {
        id: 'fv-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        workflowId: 'workflow-1',
        displayName: 'Test Workflow',
        trigger: {
            name: 'trigger_1',
            valid: true,
            displayName: 'Gmail Trigger',
            lastUpdatedDate: '2024-01-01T00:00:00Z',
            type: WorkflowTriggerType.CONNECTOR,
            settings: {
                connectorName: '@fema/connector-gmail',
                connectorVersion: '~0.1.0',
                triggerName: 'new_email',
                input: {},
                propertySettings: {},
            },
            nextAction: {
                name: 'step_1',
                valid: true,
                displayName: 'Slack Action',
                lastUpdatedDate: '2024-01-01T00:00:00Z',
                type: WorkflowActionType.CONNECTOR,
                settings: {
                    connectorName: '@fema/connector-slack',
                    connectorVersion: '~0.2.0',
                    actionName: 'send_message',
                    input: {},
                    propertySettings: {},
                },
            },
        },
        updatedBy: null,
        valid: true,
        schemaVersion: null,
        agentIds: [],
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        backupFiles: null,
        notes: [],
    }
}

function makeResumeJobData(overrides?: Partial<ExecuteWorkflowJobData>): ExecuteWorkflowJobData {
    return {
        workspaceId: 'proj-1',
        tenantId: 'plat-1',
        jobType: WorkerJobType.EXECUTE_WORKFLOW,
        environment: RunEnvironment.PRODUCTION,
        schemaVersion: 4,
        workflowId: 'workflow-1',
        workflowVersionId: 'fv-1',
        runId: 'run-1',
        payload: { type: 'inline', value: {} },
        executionType: ExecutionType.RESUME,
        streamStepProgress: StreamStepProgress.NONE,
        logsUploadUrl: 'http://example.com/upload',
        logsFileId: 'logs-file-1',
        ...overrides,
    }
}

// The workflow handler now drives ctx.resolver.resolve(...) (which resolves the workflow + connectors and
// returns { kind, provision, workflowVersion }) followed by ctx.runtime.execute(...), so the test mocks
// the resolver and runtime directly.
function makeMockContext(opts?: { resolveResult?: unknown, apiOverrides?: Record<string, vi.Mock> }) {
    const resolver = {
        resolve: vi.fn().mockResolvedValue(
            opts?.resolveResult ?? {
                kind: 'ready',
                provision: { tenantId: 'plat-1', connectors: [], codes: [], publicApiUrl: 'http://localhost:3000/api/', engineToken: 'test-token' },
                workflowVersion: makeWorkflowVersion(),
            },
        ),
    }
    const runtime = {
        execute: vi.fn().mockResolvedValue({ status: 'OK' }),
    }
    return {
        log: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
        apiClient: {
            uploadRunLog: vi.fn(),
            ...opts?.apiOverrides,
        },
        resolver,
        runtime,
        workerIndex: 0,
        engineToken: 'test-token',
        internalApiUrl: 'http://localhost:3000',
        publicApiUrl: 'http://localhost:4200',
    } as any
}

describe('executeWorkflowJob', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('payload pass-through (no worker-side fetch)', () => {
        it('forwards the JobPayload ref unchanged to the engine for BEGIN', async () => {
            const ctx = makeMockContext()
            const data = makeResumeJobData({
                executionType: ExecutionType.BEGIN,
                payload: { type: 'ref', fileId: 'huge-file-1' },
            })

            await executeWorkflowJob.execute(ctx, data)

            const operation = ctx.runtime.execute.mock.calls[0][0].operation
            expect(operation.executionType).toBe(ExecutionType.BEGIN)
            expect(operation.triggerPayload).toEqual({ type: 'ref', fileId: 'huge-file-1' })
            expect(operation.executionState).toBeUndefined()
        })

        it('forwards the JobPayload ref unchanged to the engine for RESUME and never reads logsFileId', async () => {
            const ctx = makeMockContext()
            const data = makeResumeJobData({
                payload: { type: 'ref', fileId: 'resume-payload-1' },
                logsFileId: 'logs-file-1',
            })

            await executeWorkflowJob.execute(ctx, data)

            const operation = ctx.runtime.execute.mock.calls[0][0].operation
            expect(operation.executionType).toBe(ExecutionType.RESUME)
            expect(operation.resumePayload).toEqual({ type: 'ref', fileId: 'resume-payload-1' })
            expect(operation.logsFileId).toBe('logs-file-1')
            expect(operation.executionState).toBeUndefined()
        })
    })

    describe('RESUME validation', () => {
        it('still throws when logsFileId is missing for RESUME', async () => {
            const ctx = makeMockContext()
            const data = makeResumeJobData({ logsFileId: undefined as unknown as string })

            try {
                await executeWorkflowJob.execute(ctx, data)
                expect.fail('should have thrown')
            }
            catch (e) {
                expect(e).toBeInstanceOf(ApplicationError)
                expect((e as ApplicationError).error.code).toBe(ErrorCode.RESUME_LOGS_FILE_MISSING)
            }

            expect(ctx.apiClient.uploadRunLog).toHaveBeenCalledWith(
                expect.objectContaining({ status: ExecutionStatus.INTERNAL_ERROR }),
            )
        })
    })

    describe('missing connector handling', () => {
        it('marks run as FAILED and never runs the engine when the workflow version is not found', async () => {
            const ctx = makeMockContext({ resolveResult: { kind: 'workflow-not-found' } })
            const data = makeResumeJobData({ executionType: ExecutionType.BEGIN })

            const result = await executeWorkflowJob.execute(ctx, data)

            expect(result.kind).toBe(JobResultKind.FIRE_AND_FORGET)
            // Run is FAILED, but the job COMPLETES (OK) — a missing workflow must not fail+retry+page the job.
            expect(result.status).toBe(EngineResponseStatus.OK)

            expect(ctx.apiClient.uploadRunLog).toHaveBeenCalledWith(
                expect.objectContaining({ status: ExecutionStatus.FAILED }),
            )

            // No sandbox work happens for a missing workflow: provision returns early, run is never called.
            expect(ctx.runtime.execute).not.toHaveBeenCalled()
        })

        it('marks run as FAILED and completes the job (OK) when the workflow is disabled', async () => {
            const failedStep = { name: 'step_1', displayName: 'HTTP', message: 'The connector @fema/connector-http@1.0.0 is not installed' }
            const ctx = makeMockContext({ resolveResult: { kind: 'disabled', failedStep } })
            const data = makeResumeJobData({ executionType: ExecutionType.BEGIN })

            const result = await executeWorkflowJob.execute(ctx, data)

            expect(result.kind).toBe(JobResultKind.FIRE_AND_FORGET)
            expect(result.status).toBe(EngineResponseStatus.OK)
            expect(ctx.apiClient.uploadRunLog).toHaveBeenCalledWith(
                expect.objectContaining({ status: ExecutionStatus.FAILED, failedStep }),
            )
            expect(ctx.runtime.execute).not.toHaveBeenCalled()
        })
    })
})
