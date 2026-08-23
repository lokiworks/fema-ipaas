import { ExecutionStatus, StepOutputStatus } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { executionPlanCursor } from '../../src/lib/handler/execution-plan-cursor'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildCodeAction, buildParallelAction, generateMockEngineConstants } from './test-helper'

describe('workflow with a join edge', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({})
    })

    afterEach(async () => {
        await engineApi.close()
    })

    function fanOut() {
        return buildParallelAction({
            name: 'fan_out',
            branches: ['Left', 'Right'],
            children: [
                buildCodeAction({ name: 'echo_step', input: {} }),
                buildCodeAction({ name: 'echo_step_1', input: {} }),
            ],
        })
    }

    it('adds a join edge as an extra dependency without changing next edges', () => {
        const plan = executionPlanCursor.forSubtree(fanOut(), {
            joinEdges: [{ from: 'echo_step', to: 'echo_step_1' }],
        })

        expect(plan.dependencies.echo_step_1).toContain('fan_out')
        expect(plan.dependencies.echo_step_1).toContain('echo_step')
        expect(plan.nodes.fan_out.next).toEqual([])
    })

    it('ignores a join edge naming a step that is not in the plan', () => {
        const plan = executionPlanCursor.forSubtree(fanOut(), {
            joinEdges: [{ from: 'ghost', to: 'echo_step_1' }],
        })

        expect(plan.dependencies.echo_step_1).toEqual(['fan_out'])
    })

    it('treats a single dependency as always met', () => {
        const plan = executionPlanCursor.forSubtree(fanOut())

        expect(executionPlanCursor.dependenciesMet({
            plan,
            nodeId: 'echo_step',
            hasCompleted: () => false,
        })).toBe(true)
    })

    it('holds a joined step until every dependency has completed', () => {
        const plan = executionPlanCursor.forSubtree(fanOut(), {
            joinEdges: [{ from: 'echo_step', to: 'echo_step_1' }],
        })

        expect(executionPlanCursor.dependenciesMet({
            plan,
            nodeId: 'echo_step_1',
            hasCompleted: (id) => id === 'fan_out',
        })).toBe(false)

        expect(executionPlanCursor.dependenciesMet({
            plan,
            nodeId: 'echo_step_1',
            hasCompleted: (id) => id === 'fan_out' || id === 'echo_step',
        })).toBe(true)
    })

    it('does not wait on the trigger, which has no step output of its own', () => {
        const plan = executionPlanCursor.forWorkflow({
            id: 'v1',
            created: '2026-01-01T00:00:00Z',
            updated: '2026-01-01T00:00:00Z',
            workflowId: 'f1',
            displayName: 'Test',
            trigger: {
                name: 'trigger',
                displayName: 'Trigger',
                type: 'EMPTY',
                valid: true,
                settings: {},
                lastUpdatedDate: '2026-01-01T00:00:00Z',
                nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
            },
            updatedBy: null,
            valid: true,
            schemaVersion: null,
            agentIds: [],
            state: 'DRAFT',
            connectionIds: [],
            backupFiles: null,
            notes: [],
            graph: { joinEdges: [{ from: 'trigger', to: 'echo_step' }] },
        } as never)

        expect(executionPlanCursor.dependenciesMet({
            plan,
            nodeId: 'echo_step',
            hasCompleted: () => false,
        })).toBe(true)
    })

    it('still runs a plain workflow when no graph is present', async () => {
        const result = await workflowExecutor.execute({
            action: buildCodeAction({
                name: 'echo_step',
                input: {},
                nextAction: buildCodeAction({ name: 'echo_step_1', input: {} }),
            }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('echo_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(result.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })
})
