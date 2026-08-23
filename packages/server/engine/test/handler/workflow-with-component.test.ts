import { ExecutionStatus, StepOutputStatus } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildCodeAction, buildComponentAction, generateMockEngineConstants } from './test-helper'

const WAITPOINT_PATH = '/v1/waitpoints'

describe('workflow with flow component', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({
            [`POST ${WAITPOINT_PATH}`]: { id: 'mock-waitpoint-id', resumeUrl: 'http://localhost/resume' },
        })
    })

    afterEach(async () => {
        await engineApi.close()
    })

    it('runs a short delay inline without creating a waitpoint', async () => {
        const workflow = buildComponentAction({
            name: 'delay_step',
            componentType: 'runtime/delay',
            input: { unit: 'seconds', amount: 0 },
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('delay_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(engineApi.requestsFor(WAITPOINT_PATH)).toHaveLength(0)
    })

    it('pauses on a long delay and creates a DELAY waitpoint', async () => {
        const workflow = buildComponentAction({
            name: 'delay_step',
            componentType: 'runtime/delay',
            input: { unit: 'minutes', amount: 5 },
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict).toEqual({ status: ExecutionStatus.PAUSED })
        expect(engineApi.requestsFor(WAITPOINT_PATH)[0].body).toEqual(
            expect.objectContaining({ type: 'DELAY', resumeDateTime: expect.any(String) }),
        )
    })

    it('resumes a paused delay and continues to the next step', async () => {
        const workflow = buildComponentAction({
            name: 'delay_step',
            componentType: 'runtime/delay',
            input: { unit: 'minutes', amount: 5 },
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        })
        const constants = generateMockEngineConstants({ internalApiUrl: engineApi.url })

        const paused = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants,
        })
        const resumed = await workflowExecutor.execute({
            action: workflow,
            executionState: paused.setVerdict({ status: ExecutionStatus.RUNNING }),
            constants,
        })

        expect(resumed.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(resumed.getStepOutput('delay_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(resumed.getStepOutput('echo_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('stop ends the run without executing the next step', async () => {
        const workflow = buildComponentAction({
            name: 'stop_step',
            componentType: 'runtime/stop',
            input: {},
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(result.getStepOutput('echo_step')).toBeUndefined()
    })

    it('fails the step when the component type is unknown', async () => {
        const workflow = buildComponentAction({
            name: 'ghost_step',
            componentType: 'runtime/does-not-exist',
            input: {},
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.getStepOutput('ghost_step')?.status).toBe(StepOutputStatus.FAILED)
    })
})
