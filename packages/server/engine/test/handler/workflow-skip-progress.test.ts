import { WorkflowAction, ExecutionStatus, StepOutputStatus, StreamStepProgress, UpdateRunProgressRequest } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

const { updateRunProgressMock } = vi.hoisted(() => ({
    updateRunProgressMock: vi.fn<(params: { apiUrl: string, engineToken: string, request: UpdateRunProgressRequest }) => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/api/engine-run-api', () => ({
    engineRunApi: {
        updateRunProgress: updateRunProgressMock,
        updateStepProgress: vi.fn(),
        uploadRunLog: vi.fn(),
        sendWorkflowResponse: vi.fn(),
    },
}))

import { workflowExecutor } from '../../src/lib/handler/workflow-executor'

describe('workflowExecutor — progress events with skipped neighbours', () => {
    beforeEach(() => {
        updateRunProgressMock.mockClear()
    })

    it('streams SUCCEEDED for the step preceding skipped steps before the next executed step runs', async () => {
        const workflow = buildMapper({
            name: 'first',
            mapping: { key: '{{ 1 + 2 }}' },
            nextAction: buildMapper({
                name: 'skipped_a',
                skip: true,
                nextAction: buildMapper({
                    name: 'skipped_b',
                    skip: true,
                    nextAction: buildMapper({
                        name: 'second',
                        mapping: { doubled: '{{ 2 + 2 }}' },
                    }),
                }),
            }),
        })

        const result = await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ streamStepProgress: StreamStepProgress.WEBSOCKET }),
        })

        expect(result.verdict).toStrictEqual({ status: ExecutionStatus.RUNNING })

        const finalStatus = lastStatusByStep()
        expect(finalStatus.first).toBe(StepOutputStatus.SUCCEEDED)
        expect(finalStatus.second).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('streams SUCCEEDED for the last executed step even when it is followed by skipped steps', async () => {
        const workflow = buildMapper({
            name: 'only',
            mapping: { key: '{{ 7 + 3 }}' },
            nextAction: buildMapper({ name: 'trailing_skip', skip: true }),
        })

        await workflowExecutor.execute({
            action: workflow,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ streamStepProgress: StreamStepProgress.WEBSOCKET }),
        })

        expect(lastStatusByStep().only).toBe(StepOutputStatus.SUCCEEDED)
    })
})

const lastStatusByStep = (): Record<string, StepOutputStatus> => {
    const result: Record<string, StepOutputStatus> = {}
    for (const [{ request }] of updateRunProgressMock.mock.calls) {
        if (request.step) {
            result[request.step.name] = request.step.output.status
        }
    }
    return result
}

const buildMapper = ({ name, mapping, skip, nextAction }: {
    name: string
    mapping?: Record<string, unknown>
    skip?: boolean
    nextAction?: WorkflowAction
}): WorkflowAction => ({
    ...buildConnectorAction({
        name,
        input: { mapping: mapping ?? {} },
        skip,
        connectorName: '@fema-ipaas/connector-data-mapper',
        actionName: 'advanced_mapping',
    }),
    nextAction,
})
