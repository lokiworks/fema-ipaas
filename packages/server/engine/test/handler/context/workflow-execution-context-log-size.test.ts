import { WorkflowActionType, GenericStepOutput, LoopStepOutput, StepOutputStatus, StepOutputType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { WorkflowExecutorContext } from '../../../src/lib/handler/context/workflow-execution-context'
import { sizeofUtils } from '../../../src/lib/helper/sizeof'

function connectorStep(output: unknown): GenericStepOutput<WorkflowActionType.CONNECTOR, unknown> {
    return GenericStepOutput.create({
        type: WorkflowActionType.CONNECTOR,
        status: StepOutputStatus.SUCCEEDED,
        input: { key: 'value' },
    }).setOutput(output)
}

describe('WorkflowExecutorContext.logSizeBytes', () => {
    it('starts at the size of an empty steps record', () => {
        const ctx = WorkflowExecutorContext.empty()
        expect(ctx.logSizeBytes).toBe(sizeofUtils.recursiveSizeof(ctx.steps))
    })

    it('matches a full recursive walk across inserts, overwrites and nested loop steps', async () => {
        let ctx = WorkflowExecutorContext.empty()

        ctx = await ctx.upsertStep('trigger', connectorStep({ payload: 'x'.repeat(100) }))
        ctx = await ctx.upsertStep('trigger', connectorStep({ payload: 'tiny' }))

        let loopOutput = LoopStepOutput.init({ input: { items: [1, 2] } })
        ctx = await ctx.upsertStep('loop', loopOutput)

        for (let iteration = 0; iteration < 2; iteration++) {
            loopOutput = loopOutput.setItemAndIndex({ item: iteration, index: iteration + 1 }).addIteration()
            ctx = (await ctx.upsertStep('loop', loopOutput))
                .setCurrentPath(ctx.currentPath.loopIteration({ loopName: 'loop', iteration }))
            ctx = await ctx.upsertStep('inner', connectorStep({ nested: ['a', 'b', iteration] }))
            ctx = await ctx.upsertStep('inner', connectorStep({ nested: 'overwritten'.repeat(iteration + 1) }))
            ctx = ctx.setCurrentPath(ctx.currentPath.removeLast())
        }

        ctx = await ctx.upsertStep('last', connectorStep(undefined))

        expect(ctx.logSizeBytes).toBe(sizeofUtils.recursiveSizeof(ctx.steps))
    })

    it('counts the referenced size of sliced steps, not the ref payload', async () => {
        const sliced = new GenericStepOutput({
            type: WorkflowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: {},
            outputType: StepOutputType.SLICE,
            output: { fileId: 'file-1', size: 4_096, url: 'http://example.com/file-1' },
        })

        const ctx = await WorkflowExecutorContext.empty().upsertStep('echo_step', sliced)

        expect(ctx.logSizeBytes).toBe(sizeofUtils.recursiveSizeof(ctx.steps))
        expect(ctx.logSizeBytes).toBeGreaterThan(4_096)
    })
})
