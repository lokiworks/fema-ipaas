import { BranchCondition, BranchOperator, WorkflowAction, ExecutionStatus, RouterExecutionType } from '@fema/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { buildCodeAction, buildConnectorAction, buildRouterWithOneCondition, generateMockEngineConstants } from './test-helper'

function executeRouterActionWithOneCondition(children: WorkflowAction[], conditions: (BranchCondition | null)[], executionType: RouterExecutionType): Promise<WorkflowExecutorContext> {
    return workflowExecutor.execute({
        action: buildRouterWithOneCondition({
            children,
            conditions,
            executionType,
        }),
        executionState: WorkflowExecutorContext.empty(),
        constants: generateMockEngineConstants(),
    })
}
describe('router with branching different conditions', () => {
    it('should execute router with the first matching condition', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'data_mapper_1',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'test',
                caseSensitive: false,
            },
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'anything',
                caseSensitive: false,
            },
        ], RouterExecutionType.EXECUTE_FIRST_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper.output).toEqual({ 'key': 3 })
        expect(result.steps.data_mapper_1).toBeUndefined()
    })

    it('should execute router with the all matching conditions', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'data_mapper_1',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'test',
                caseSensitive: false,
            },
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'test',
                caseSensitive: false,
            },
        ], RouterExecutionType.EXECUTE_ALL_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper.output).toEqual({ 'key': 3 })
        expect(result.steps.data_mapper_1.output).toEqual({ 'key': 3 })
    })
    
    it('should execute router but no branch will match', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'data_mapper_1',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 5 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'abc',
                secondValue: 'test',
                caseSensitive: false,
            },
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'fasc',
                caseSensitive: false,
            },
        ], RouterExecutionType.EXECUTE_ALL_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        const routerOutput = result.steps.router.output as { branches: boolean[] }
        expect(routerOutput.branches).toEqual([
            {
                branchName: 'Test Branch',
                branchIndex: 1,
                evaluation: false,
            },
            {
                branchName: 'Test Branch',
                branchIndex: 2,
                evaluation: false,
            },
        ])
        expect(result.steps.data_mapper).toBeUndefined()
        expect(result.steps.data_mapper_1).toBeUndefined()
    })

    it('should execute fallback branch with first match execution type', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'data_mapper_1',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 5 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'fallback_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 10 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'abc',
                secondValue: 'test',
                caseSensitive: false,
            },
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'fasc',
                caseSensitive: false,
            },
            null, // Fallback branch
        ], RouterExecutionType.EXECUTE_FIRST_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper).toBeUndefined()
        expect(result.steps.data_mapper_1).toBeUndefined()
        expect(result.steps.fallback_mapper.output).toEqual({ 'key': 11 })
    })

    it('should execute fallback branch with all match execution type', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'data_mapper_1',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 5 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'fallback_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 10 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'abc',
                secondValue: 'test',
                caseSensitive: false,
            },
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'fasc',
                caseSensitive: false,
            },
            null, // Fallback branch
        ], RouterExecutionType.EXECUTE_ALL_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper).toBeUndefined()
        expect(result.steps.data_mapper_1).toBeUndefined()
        expect(result.steps.fallback_mapper.output).toEqual({ 'key': 11 })
    })

    it('should not execute fallback branch when there is a matching condition in EXECUTE_FIRST_MATCH mode', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'fallback_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 10 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'test',
                caseSensitive: false,
            },
            null, // Fallback branch
        ], RouterExecutionType.EXECUTE_FIRST_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper.output).toEqual({ 'key': 3 })
        expect(result.steps.fallback_mapper).toBeUndefined()
    })

    it('should not execute fallback branch when there is a matching condition in EXECUTE_ALL_MATCH mode', async () => {
        const result = await executeRouterActionWithOneCondition([
            buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'data_mapper_1',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 5 }}',
                    },
                },
            }),
            buildConnectorAction({
                name: 'fallback_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 10 }}',
                    },
                },
            }),
        ], [
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'test',
                caseSensitive: false,
            },
            {
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                firstValue: 'test',
                secondValue: 'test',
                caseSensitive: false,
            },
            null, // Fallback branch
        ], RouterExecutionType.EXECUTE_ALL_MATCH)

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper.output).toEqual({ 'key': 3 })
        expect(result.steps.data_mapper_1.output).toEqual({ 'key': 6 })
        expect(result.steps.fallback_mapper).toBeUndefined()
    })
    it('should skip router', async () => {
        const result = await workflowExecutor.execute({
            action: buildRouterWithOneCondition({ children: [
                buildConnectorAction({
                    name: 'data_mapper',
                    skip: true,
                    connectorName: '@fema/connector-data-mapper',
                    actionName: 'advanced_mapping',
                    input: {},
                }),
            ], conditions: [
                {
                    operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                    firstValue: 'test',
                    secondValue: 'test',
                    caseSensitive: false,
                },
            ], executionType: RouterExecutionType.EXECUTE_FIRST_MATCH, skip: true }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.router).toBeUndefined()
    })
    it('should skip router action in workflow', async () => {
        const router: WorkflowAction = {
            ...buildRouterWithOneCondition({ children: [
                buildConnectorAction({
                    name: 'data_mapper',
                    skip: true,
                    connectorName: '@fema/connector-data-mapper',
                    actionName: 'advanced_mapping',
                    input: {},
                }),
            ], conditions: [
                {
                    operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                    firstValue: 'test',
                    secondValue: 'test',
                    caseSensitive: false,
                },
            ], 
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH, 
            skip: true }),
            nextAction: {
                ...buildCodeAction({
                    name: 'echo_step',
                    skip: false,
                    input: {
                        'key': '{{ 1 + 2 }}',
                    },
                }),
                nextAction: undefined,
            },
        }
        const result = await workflowExecutor.execute({
            action: router, executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.router).toBeUndefined()
        expect(result.steps.echo_step.output).toEqual({ 'key': 3 })
    })
})
