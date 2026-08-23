import { ExecutionStatus, WorkflowTriggerType, WorkflowVersionState, GenericStepOutput, StepOutputStatus } from '@fema/shared'
import { vi } from 'vitest'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { buildCodeAction, buildMockBeginExecuteWorkflowOperation, buildSimpleLoopAction, generateMockEngineConstants } from './test-helper'

vi.mock('../../src/lib/helper/execution-progress-reporter', () => ({
    executionProgressReporter: {
        sendUpdate: vi.fn().mockResolvedValue(undefined),
        backup: vi.fn().mockResolvedValue(undefined),
        init: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('../../src/lib/core/connector/trigger-runner', () => ({
    triggerRunner: {
        executeOnStart: vi.fn().mockResolvedValue(undefined),
    },
}))

describe('workflow executor log size exceeded', () => {

    describe('with small log size limit', () => {
        let freshExecutor: typeof workflowExecutor
        let FreshContext: typeof WorkflowExecutorContext

        beforeAll(async () => {
            process.env.FEMA_MAX_EXECUTION_LOG_SIZE_MB = '0.0001'
            vi.resetModules()
            const executorModule = await import('../../src/lib/handler/workflow-executor')
            const contextModule = await import('../../src/lib/handler/context/workflow-execution-context')
            freshExecutor = executorModule.workflowExecutor
            FreshContext = contextModule.WorkflowExecutorContext
        })

        beforeEach(() => {
            vi.clearAllMocks()
        })

        it('should return LOG_SIZE_EXCEEDED verdict when log size exceeds limit', async () => {
            const action = buildCodeAction({
                name: 'echo_step',
                input: {
                    'key': 'x'.repeat(10000),
                },
            })

            const result = await freshExecutor.execute({
                action,
                executionState: FreshContext.empty(),
                constants: generateMockEngineConstants(),
            })

            expect(result.verdict.status).toBe(ExecutionStatus.LOG_SIZE_EXCEEDED)
        })

        it('should set failedStep to the step that caused log size to exceed', async () => {
            const action = buildCodeAction({
                name: 'echo_step',
                input: {
                    'key': 'x'.repeat(10000),
                },
            })

            const result = await freshExecutor.execute({
                action,
                executionState: FreshContext.empty(),
                constants: generateMockEngineConstants(),
            })

            expect(result.verdict.status).toBe(ExecutionStatus.LOG_SIZE_EXCEEDED)
            expect(result.verdict.failedStep).toEqual(expect.objectContaining({
                name: 'echo_step',
            }))
        })

        it('should return LOG_SIZE_EXCEEDED verdict when terminal loop action exceeds log size limit', async () => {
            const loopAction = buildSimpleLoopAction({
                name: 'loop',
                loopItems: '{{ [1, 2, 3] }}',
                firstLoopAction: buildCodeAction({
                    name: 'echo_step',
                    input: { key: 'x'.repeat(10000) },
                }),
            })

            const result = await freshExecutor.execute({
                action: loopAction,
                executionState: FreshContext.empty(),
                constants: generateMockEngineConstants(),
            })

            expect(result.verdict.status).toBe(ExecutionStatus.LOG_SIZE_EXCEEDED)
        })

        it('should return LOG_SIZE_EXCEEDED verdict when trigger output exceeds log size limit', async () => {
            const triggerName = 'trigger'
            const trigger = {
                name: triggerName,
                displayName: 'Test Trigger',
                type: WorkflowTriggerType.EMPTY as const,
                valid: true,
                settings: {},
                lastUpdatedDate: '2024-01-01T00:00:00Z',
                nextAction: buildCodeAction({
                    name: 'echo_step',
                    input: { key: 'value' },
                }),
            }

            const executionState = await FreshContext.empty().upsertStep(triggerName, GenericStepOutput.create({
                type: WorkflowTriggerType.EMPTY,
                status: StepOutputStatus.SUCCEEDED,
                input: {},
            }).setOutput({ data: 'x'.repeat(10000) }))

            const result = await freshExecutor.executeFromTrigger({
                executionState,
                constants: generateMockEngineConstants(),
                input: buildMockBeginExecuteWorkflowOperation({
                    workflowVersion: {
                        id: 'workflowVersionId',
                        created: '2024-01-01T00:00:00Z',
                        updated: '2024-01-01T00:00:00Z',
                        workflowId: 'workflowId',
                        displayName: 'Test Workflow',
                        trigger,
                        updatedBy: null,
                        valid: true,
                        schemaVersion: null,
                        agentIds: [],
                        state: WorkflowVersionState.DRAFT,
                        connectionIds: [],
                        backupFiles: null,
                        notes: [],
                    },
                }),
            })

            expect(result.verdict.status).toBe(ExecutionStatus.LOG_SIZE_EXCEEDED)
        })
    })

    it('should not throw when log size is within limit', async () => {
        const action = buildCodeAction({
            name: 'echo_step',
            input: {
                'key': 'small value',
            },
        })

        const result = await workflowExecutor.execute({
            action,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.steps.echo_step.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('should not throw for loop actions when log size is within limit', async () => {
        const loopAction = buildSimpleLoopAction({
            name: 'loop',
            loopItems: '{{ [1, 2, 3] }}',
            firstLoopAction: buildCodeAction({
                name: 'echo_step',
                input: { key: 'value' },
            }),
        })

        const result = await workflowExecutor.execute({
            action: loopAction,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
    })
})
