import { WorkflowActionType, GenericStepOutput, StepOutputStatus, StepOutputType } from '@fema/shared'
import { describe, expect, it } from 'vitest'
import { WorkflowExecutorContext } from '../../../src/lib/handler/context/workflow-execution-context'

describe('WorkflowExecutorContext.upsertStep — outputType: StepOutputType.SLICE preservation', () => {
    it('keeps the slice discriminant when upserting an already-sliced step (RESUME restore)', async () => {
        const restored = new GenericStepOutput({
            type: WorkflowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: {},
            outputType: StepOutputType.SLICE,
            output: { fileId: 'file-1', size: 4_096, url: 'http://example.com/file-1' },
        })

        const ctx = WorkflowExecutorContext.empty()
        const next = await ctx.upsertStep('echo_step', restored)

        const stepOutput = next.steps.echo_step
        expect(stepOutput.outputType).toBe(StepOutputType.SLICE)
        // The ref must survive as the stored output so resolveStepOutput can fetch the
        // real payload on demand later.
        expect(stepOutput.output).toEqual({
            fileId: 'file-1',
            size: 4_096,
            url: 'http://example.com/file-1',
        })
    })
})
