import { ExecutionStatus } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildCodeAction, buildConnectorAction, generateMockEngineConstants } from './test-helper'

const WAITPOINT_PATH = '/v1/waitpoints'

describe('workflow with delay', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({
            [`POST ${WAITPOINT_PATH}`]: { id: 'mock-waitpoint-id', resumeUrl: 'http://localhost/resume' },
        })
    })

    afterEach(async () => {
        await engineApi.close()
    })

    it('delay-for pauses workflow and calls waitpointClient.create with DELAY type', async () => {
        const delayForWorkflow = buildConnectorAction({
            name: 'delay_step',
            connectorName: '@fema-ipaas/connector-delay',
            actionName: 'delayFor',
            input: {
                unit: 'seconds',
                delayFor: 60,
            },
            nextAction: buildCodeAction({
                name: 'echo_step',
                input: {},
            }),
        })

        const result = await workflowExecutor.execute({
            action: delayForWorkflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict).toEqual({
            status: ExecutionStatus.PAUSED,
        })
        expect(engineApi.requestsFor(WAITPOINT_PATH)[0].body).toEqual(
            expect.objectContaining({
                type: 'DELAY',
                resumeDateTime: expect.any(String),
            }),
        )
    })

    it('delay-for resumes successfully after pause', async () => {
        const delayForWorkflow = buildConnectorAction({
            name: 'delay_step',
            connectorName: '@fema-ipaas/connector-delay',
            actionName: 'delayFor',
            input: {
                unit: 'seconds',
                delayFor: 60,
            },
            nextAction: buildCodeAction({
                name: 'echo_step',
                input: {},
            }),
        })

        const pauseResult = await workflowExecutor.execute({
            action: delayForWorkflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        const resumeResult = await workflowExecutor.execute({
            action: delayForWorkflow,
            executionState: pauseResult.setVerdict({
                status: ExecutionStatus.RUNNING,
            }),
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                resumePayload: {
                    queryParams: {},
                    body: {},
                    headers: {},
                },
            }),
        })

        expect(resumeResult.verdict).toEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(resumeResult.steps.delay_step.output).toEqual(
            expect.objectContaining({ success: true }),
        )
    })

    it('delay-for uses setTimeout for short delays without pausing', async () => {
        const shortDelayWorkflow = buildConnectorAction({
            name: 'delay_step',
            connectorName: '@fema-ipaas/connector-delay',
            actionName: 'delayFor',
            input: {
                unit: 'seconds',
                delayFor: 1,
            },
        })

        const result = await workflowExecutor.execute({
            action: shortDelayWorkflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict).toEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(engineApi.requestsFor(WAITPOINT_PATH)).toHaveLength(0)
    })

    it('delay-until pauses workflow for future dates', async () => {
        const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        const delayUntilWorkflow = buildConnectorAction({
            name: 'delay_step',
            connectorName: '@fema-ipaas/connector-delay',
            actionName: 'delay_until',
            input: {
                delayUntilTimestamp: futureDate,
            },
            nextAction: buildCodeAction({
                name: 'echo_step',
                input: {},
            }),
        })

        const result = await workflowExecutor.execute({
            action: delayUntilWorkflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict).toEqual({
            status: ExecutionStatus.PAUSED,
        })
        expect(engineApi.requestsFor(WAITPOINT_PATH)[0].body).toEqual(
            expect.objectContaining({
                type: 'DELAY',
                resumeDateTime: expect.any(String),
            }),
        )
    })

    it('delay-until completes immediately for past dates', async () => {
        const pastDate = new Date(Date.now() - 60 * 1000).toISOString()
        const delayUntilWorkflow = buildConnectorAction({
            name: 'delay_step',
            connectorName: '@fema-ipaas/connector-delay',
            actionName: 'delay_until',
            input: {
                delayUntilTimestamp: pastDate,
            },
        })

        const result = await workflowExecutor.execute({
            action: delayUntilWorkflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict).toEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(engineApi.requestsFor(WAITPOINT_PATH)).toHaveLength(0)
    })
})
