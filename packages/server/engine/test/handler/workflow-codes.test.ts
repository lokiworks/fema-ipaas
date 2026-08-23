import { WorkflowAction, ExecutionStatus } from '@fema/shared'
import { codeExecutor } from '../../src/lib/handler/code-executor'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { buildCodeAction, generateMockEngineConstants } from './test-helper'

describe('codeExecutor', () => {

    it('should execute code that echo parameters action successfully', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({
                name: 'echo_step',
                input: {
                    'key': '{{ 1 + 2 }}',
                },
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.steps.echo_step.output).toEqual({ 'key': 3 })
    })

    it('should execute code from a nested action-run namespace, which is how fork mode reads it off the host filesystem', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({
                name: 'echo_action_run',
                input: {
                    'key': '{{ 1 + 2 }}',
                },
            }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ workflowVersionId: 'action-runs/plat-xyz_deadbeef' }),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.steps.echo_action_run.output).toEqual({ 'key': 3 })
    })

    it('should execute code a code that throws an error', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({
                name: 'runtime',
                input: {},
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.FAILED,
            failedStep: {
                name: 'runtime',
                displayName: 'Your Action Name',
                message: expect.stringContaining('Custom Runtime Error'),
            },
        })
        expect(result.steps.runtime.status).toEqual('FAILED')
        expect(result.steps.runtime.errorMessage).toContain('Custom Runtime Error')
    })

    it('should execute code that throws a system error and mark as FAILED', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({
                name: 'system_error',
                input: {},
            }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.FAILED,
            failedStep: {
                name: 'system_error',
                displayName: 'Your Action Name',
                message: expect.stringContaining('uv_os_homedir'),
            },
        })
        expect(result.steps.system_error.status).toEqual('FAILED')
        expect(result.steps.system_error.errorMessage).toContain('uv_os_homedir')
    })

    it('should mark step as FAILED when code calls process.exit()', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({ name: 'process_exit', input: {} }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.process_exit.status).toEqual('FAILED')
        expect(result.steps.process_exit.errorMessage).toContain('1')
    })

    it('should mark step as FAILED on unhandled promise rejection and include error in message', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({ name: 'unhandled_rejection', input: {} }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.unhandled_rejection.status).toEqual('FAILED')
        expect(result.verdict.failedStep?.message).toContain('Unhandled rejection from user code')
    })

    it('should mark step as FAILED when code throws inside setTimeout', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({ name: 'setTimeout_error', input: {} }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.setTimeout_error.status).toEqual('FAILED')
        expect(result.verdict.failedStep?.message).toContain('Unexpected token')
    })

    it('should execute code that requires an npm package successfully', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({ name: 'hello_world_npm', input: { name: 'World' } }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.steps.hello_world_npm.output).toEqual({ message: 'Hello, World!' })
    })

    it('should include stdout and stderr in errorMessage when code fails', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({ name: 'stdout_on_failure', input: {} }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.stdout_on_failure.errorMessage).toContain('Error after logging')
        expect(result.steps.stdout_on_failure.errorMessage).toContain('stdout line from user code')
        expect(result.steps.stdout_on_failure.errorMessage).toContain('stderr line from user code')
    })

    it('should skip code action', async () => {
        const result = await workflowExecutor.execute({
            action: buildCodeAction({
                name: 'echo_step',
                input: {},
                skip: true,
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.steps.echo_step).toBeUndefined()
    })
    it('should skip workflow action', async () => {
        const workflow: WorkflowAction = {
            ...buildCodeAction({
                name: 'echo_step',
                skip: true,
                input: {},
            }),
            nextAction: {
                ...buildCodeAction({
                    name: 'echo_step_1',
                    input: {
                        'key': '{{ 1 + 2 }}',
                    },
                }),
            },
        }
        const result = await workflowExecutor.execute({
            action: workflow, executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.steps.echo_step).toBeUndefined()
        expect(result.steps.echo_step_1.output).toEqual({ 'key': 3 })
    })
})
