import { CodeAction, ExecutionStatus } from '@fema/shared'
import { codeExecutor } from '../../src/lib/handler/code-executor'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { buildCodeAction, generateMockEngineConstants } from './test-helper'

describe('code executor step-name path traversal', () => {
    it('fails a code step whose name traverses out of the code directory without executing it', async () => {
        const traversalName = '../../common/node_modules/bufferutil'
        const action: CodeAction = {
            ...buildCodeAction({ name: 'echo_step', input: {} }),
            name: traversalName,
        }

        const result = await codeExecutor.handle({
            action,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps[traversalName].status).toEqual('FAILED')
        expect(result.steps[traversalName].errorMessage).toContain('Invalid code step name')
    })
})
