import { BranchOperator, ExecutionStatus, LoopStepOutput, RouterExecutionType, RouterStepOutput } from '@fema-ipaas/shared'
import { vi } from 'vitest'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { StepExecutionPath } from '../../src/lib/handler/context/step-execution-path'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildCodeAction, buildConnectorAction, buildRouterWithOneCondition, buildSimpleLoopAction, generateMockEngineConstants } from './test-helper'



const simplePauseWorkflow = buildConnectorAction({
    name: 'approval',
    connectorName: '@fema-ipaas/connector-approval',
    actionName: 'wait_for_approval',
    input: {},
    nextAction: buildCodeAction({
        name: 'echo_step',
        input: {},
    }),
})

const flawWithTwoPause = buildConnectorAction({
    name: 'approval',
    connectorName: '@fema-ipaas/connector-approval',
    actionName: 'wait_for_approval',
    input: {},
    nextAction: buildCodeAction({
        name: 'echo_step',
        input: {},
        nextAction: buildConnectorAction({
            name: 'approval-1',
            connectorName: '@fema-ipaas/connector-approval',
            actionName: 'wait_for_approval',
            input: {},
            nextAction: buildCodeAction({
                name: 'echo_step_1',
                input: {},
            }),
        }),

    }),
})


const pauseWorkflowWithLoopAndBranch = buildSimpleLoopAction({
    name: 'loop',
    loopItems: '{{ [false, true ] }}',
    firstLoopAction: buildRouterWithOneCondition({
        conditions: [
            {
                operator: BranchOperator.BOOLEAN_IS_TRUE,
                firstValue: '{{ loop.output.item }}',
            },
            
        ],
        executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
        children: [
            simplePauseWorkflow,
        ],
    }),
})

describe('workflow with pause', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({
            'POST /v1/waitpoints': { id: 'mock-waitpoint-id', resumeUrl: 'http://localhost/resume' },
        })
    })

    afterEach(async () => {
        await engineApi.close()
    })

    it('should pause and resume successfully with loops and branch', async () => {
        const pauseResult = await workflowExecutor.execute({
            action: pauseWorkflowWithLoopAndBranch,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url, stepNames: ['loop'] }),
        })
        expect(pauseResult.verdict).toEqual({
            status: ExecutionStatus.PAUSED,
        })
        expect(Object.keys(pauseResult.steps)).toEqual(['loop'])

        // Verify that the first iteration (true) triggered the branch condition
        const loopOutputBeforeResume = pauseResult.steps.loop as LoopStepOutput
        expect(loopOutputBeforeResume.output?.iterations.length).toBe(2)
        expect(loopOutputBeforeResume.output?.item).toBe(true)
        expect(Object.keys(loopOutputBeforeResume.output?.iterations[0] ?? {})).toContain('router')
        

        const resumeResultTwo = await workflowExecutor.execute({
            action: pauseWorkflowWithLoopAndBranch,
            executionState: pauseResult.setCurrentPath(StepExecutionPath.empty()).setVerdict({
                status: ExecutionStatus.RUNNING,
            }),
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                stepNames: ['loop'],
                resumePayload: {
                    queryParams: {
                        action: 'approve',
                    },
                    body: {},
                    headers: {},
                },
            }),
        })
        
        expect(resumeResultTwo.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        },
        )
        expect(Object.keys(resumeResultTwo.steps)).toEqual(['loop'])
        
        const loopOut = resumeResultTwo.steps.loop as LoopStepOutput
        expect(Object.keys(loopOut.output?.iterations[1] ?? {})).toEqual(['router', 'approval', 'echo_step'])
        expect((loopOut.output?.iterations[0].router as RouterStepOutput).output?.branches[0].evaluation).toBe(false)
        expect((loopOut.output?.iterations[1].router as RouterStepOutput).output?.branches[0].evaluation).toBe(true)
        

    })

    it('should pause and resume with two different steps in same workflow successfully', async () => {
        const pauseResult1 = await workflowExecutor.execute({
            action: flawWithTwoPause,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })
        const resumeResult1 = await workflowExecutor.execute({
            action: flawWithTwoPause,
            executionState: pauseResult1,
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                resumePayload: {
                    queryParams: {
                        action: 'approve',
                    },
                    body: {},
                    headers: {},
                },
            }),
        })
        expect(resumeResult1.verdict).toStrictEqual({
            status: ExecutionStatus.PAUSED,
        })
        const resumeResult2 = await workflowExecutor.execute({
            action: flawWithTwoPause,
            executionState: resumeResult1.setVerdict({
                status: ExecutionStatus.RUNNING,
            }),
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                resumePayload: {
                    queryParams: {
                        action: 'approve',
                    },
                    body: {},
                    headers: {},
                },
            }),
        })
        expect(resumeResult2.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })

    })


    it('should pause and resume successfully', async () => {
        const pauseResult = await workflowExecutor.execute({
            action: simplePauseWorkflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })
        expect(pauseResult.verdict).toStrictEqual({
            status: ExecutionStatus.PAUSED,
        })
        expect(await pauseResult.getStepView('approval')).toBeDefined()
        expect(await pauseResult.getStepView('echo_step')).toBeUndefined()

        const resumeResult = await workflowExecutor.execute({
            action: simplePauseWorkflow,
            executionState: pauseResult,
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                resumePayload: {
                    queryParams: {
                        action: 'approve',
                    },
                    body: {},
                    headers: {},
                },
            }),
        })
        expect(resumeResult.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(await resumeResult.getStepView('approval')).toEqual({
            output: { approved: true },
            error: undefined,
        })
        expect(await resumeResult.getStepView('echo_step')).toEqual({
            output: {},
            error: undefined,
        })
    })

    it('should pause at most one action when router has multiple branches with pause actions', async () => {
        const routerWithTwoPauseActions = buildRouterWithOneCondition({
            conditions: [
                {
                    operator: BranchOperator.BOOLEAN_IS_TRUE,
                    firstValue: 'true',
                },
                {
                    operator: BranchOperator.BOOLEAN_IS_TRUE,
                    firstValue: 'true',
                },
            ],
            executionType: RouterExecutionType.EXECUTE_ALL_MATCH,
            children: [
                buildConnectorAction({
                    name: 'approval_1',
                    connectorName: '@fema-ipaas/connector-approval',
                    actionName: 'wait_for_approval',
                    input: {},
                    nextAction: buildCodeAction({
                        name: 'echo_step',
                        input: {},
                    }),
                }),
                buildConnectorAction({
                    name: 'approval_2',
                    connectorName: '@fema-ipaas/connector-approval',
                    actionName: 'wait_for_approval',
                    input: {},
                    nextAction: buildCodeAction({
                        name: 'echo_step_1',
                        input: {},
                    }),
                }),
            ],
        })

        const result = await workflowExecutor.execute({
            action: routerWithTwoPauseActions,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.PAUSED,
        })

        const routerOutput = result.steps.router as RouterStepOutput
        expect(routerOutput).toBeDefined()
        expect(routerOutput.output).toBeDefined()
        
        const executedBranches = routerOutput.output?.branches?.filter((branch) => branch.evaluation === true)
        expect(executedBranches).toHaveLength(2)
        
        expect(result.steps.approval_1).toBeDefined()
        expect(result.steps.approval_1.status).toBe('PAUSED')
        expect(result.steps.approval_2).toBeUndefined()
        
        expect(Object.keys(result.steps)).toEqual(['router', 'approval_1'])
    })

})
