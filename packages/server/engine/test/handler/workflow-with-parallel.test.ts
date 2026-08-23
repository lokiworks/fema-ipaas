import { ExecutionStatus, StepOutputStatus } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildCodeAction, buildComponentAction, buildParallelAction, generateMockEngineConstants } from './test-helper'

const WAITPOINT_PATH = '/v1/waitpoints'

describe('workflow with parallel', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({
            [`POST ${WAITPOINT_PATH}`]: { id: 'mock-waitpoint-id', resumeUrl: 'http://localhost/resume' },
        })
    })

    afterEach(async () => {
        await engineApi.close()
    })

    function constants() {
        return generateMockEngineConstants({ internalApiUrl: engineApi.url })
    }

    it('runs every branch and continues to the next step', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Left', 'Right'],
            children: [
                buildCodeAction({ name: 'echo_step', input: {} }),
                buildCodeAction({ name: 'echo_step_1', input: {} }),
            ],
            nextAction: buildCodeAction({ name: 'echo_step_1', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: constants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('echo_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(result.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(result.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('records its own step output alongside the branch outputs', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Left', 'Right'],
            children: [
                buildCodeAction({ name: 'echo_step', input: {} }),
                buildCodeAction({ name: 'echo_step_1', input: {} }),
            ],
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: constants(),
        })

        expect(result.getStepOutput('fan_out')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('runs branches concurrently rather than one after another', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Slow A', 'Slow B'],
            children: [
                buildComponentAction({
                    name: 'slow_a',
                    componentType: 'runtime/delay',
                    input: { unit: 'seconds', amount: 1 },
                }),
                buildComponentAction({
                    name: 'slow_b',
                    componentType: 'runtime/delay',
                    input: { unit: 'seconds', amount: 1 },
                }),
            ],
        })

        const startedAt = Date.now()
        await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: constants(),
        })
        const elapsedMs = Date.now() - startedAt

        expect(elapsedMs).toBeLessThan(1800)
    })

    it('does not run the next step when a branch fails', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Ok', 'Broken'],
            children: [
                buildCodeAction({ name: 'echo_step', input: {} }),
                buildComponentAction({
                    name: 'broken_step',
                    componentType: 'runtime/does-not-exist',
                    input: {},
                }),
            ],
            nextAction: buildCodeAction({ name: 'echo_step_1', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: constants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.getStepOutput('echo_step_1')).toBeUndefined()
    })

    it('treats a parallel with no branches as a no-op rather than an error', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Left', 'Right'],
            children: [null, null],
            nextAction: buildCodeAction({ name: 'echo_step_1', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: constants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('propagates a pause from a branch so the run can resume', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Fast', 'Waiting'],
            children: [
                buildCodeAction({ name: 'echo_step', input: {} }),
                buildComponentAction({
                    name: 'waiting_step',
                    componentType: 'human/approval',
                    input: {},
                }),
            ],
            nextAction: buildCodeAction({ name: 'echo_step_1', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: constants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.PAUSED)
        expect(result.getStepOutput('echo_step_1')).toBeUndefined()
    })

    it('resumes without re-running branches that already finished', async () => {
        const workflow = buildParallelAction({
            name: 'fan_out',
            branches: ['Fast', 'Waiting'],
            children: [
                buildCodeAction({ name: 'echo_step', input: {} }),
                buildComponentAction({
                    name: 'waiting_step',
                    componentType: 'human/approval',
                    input: {},
                }),
            ],
            nextAction: buildCodeAction({ name: 'echo_step_1', input: {} }),
        })
        const engineConstants = constants()

        const paused = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: engineConstants,
        })
        expect(paused.verdict.status).toBe(ExecutionStatus.PAUSED)
        const finishedDuringFirstPass = paused.getStepOutput('echo_step')
        expect(finishedDuringFirstPass?.status).toBe(StepOutputStatus.SUCCEEDED)

        const resumed = await workflowExecutor.execute({
            action: workflow,
            executionState: paused.setVerdict({ status: ExecutionStatus.RUNNING }),
            constants: engineConstants,
        })

        expect(resumed.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(resumed.getStepOutput('waiting_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(resumed.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(resumed.getStepOutput('echo_step')).toEqual(finishedDuringFirstPass)
    })
})
