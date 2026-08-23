import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionStatus, GenericStepOutput, ParallelAction, StepOutputStatus, WorkflowActionType } from '@fema-ipaas/shared'
import { BaseExecutor, failStep } from './base-executor'
import { EngineConstants } from './context/engine-constants'
import { WorkflowExecutorContext } from './context/workflow-execution-context'
import { workflowExecutor } from './workflow-executor'

export const parallelExecutor: BaseExecutor<ParallelAction> = {
    async handle({ action, executionState, constants }) {
        if (executionState.isCompleted({ stepName: action.name })) {
            return executionState
        }
        const stepStartTime = performance.now()
        const parallelOutput = GenericStepOutput.create({
            input: {},
            type: WorkflowActionType.PARALLEL,
            status: StepOutputStatus.SUCCEEDED,
        }).setOutput({
            branches: action.settings.branches.map((branch, index) => ({
                branchName: branch.branchName,
                branchIndex: index + 1,
            })),
        })

        const branches = action.children.filter((child) => !isNil(child))
        if (branches.length === 0) {
            return (await executionState.upsertStep(action.name, parallelOutput.setDuration(performance.now() - stepStartTime)))
                .incrementStepsExecuted()
        }

        if (!isNil(constants.stepNameToTest)) {
            return (await executionState.upsertStep(action.name, parallelOutput.setDuration(performance.now() - stepStartTime)))
                .incrementStepsExecuted()
        }

        const settled = await Promise.all(branches.map((branch) => runBranch({ branch, executionState, constants })))
        const failure = settled.find((result) => !isNil(result.error))
        if (!isNil(failure?.error)) {
            return failStep({
                action,
                executionState,
                stepOutput: parallelOutput.setStatus(StepOutputStatus.FAILED),
                error: failure.error,
                durationMs: performance.now() - stepStartTime,
            })
        }

        const merged = await mergeBranchResults({
            base: executionState,
            results: settled.map((result) => result.context).filter((context) => !isNil(context)),
        })
        // A paused branch has to leave the parallel step itself PAUSED. isCompleted() treats any
        // other status as done, so marking it SUCCEEDED here would make the resume skip the whole
        // node and strand the branch that was waiting.
        const status = merged.verdict.status === ExecutionStatus.PAUSED
            ? StepOutputStatus.PAUSED
            : StepOutputStatus.SUCCEEDED
        const withOutput = await merged.upsertStep(
            action.name,
            parallelOutput.setStatus(status).setDuration(performance.now() - stepStartTime),
        )
        return withOutput.incrementStepsExecuted()
    },
}

async function runBranch({ branch, executionState, constants }: RunBranchParams): Promise<BranchResult> {
    try {
        const context = await workflowExecutor.execute({
            action: branch,
            executionState,
            constants,
        })
        return { context }
    }
    catch (error) {
        return { error: error instanceof Error ? error : new Error(String(error)) }
    }
}

async function mergeBranchResults({ base, results }: MergeParams): Promise<WorkflowExecutorContext> {
    let merged = base
    for (const result of results) {
        for (const [stepName, stepOutput] of Object.entries(result.steps)) {
            // Identity, not presence. Every branch starts from the same base, so untouched steps
            // come back as the same object; anything a branch produced or changed is a new one.
            // Skipping on presence alone would drop a step a branch just moved off PAUSED.
            if (base.steps[stepName] === stepOutput) {
                continue
            }
            merged = await merged.upsertStep(stepName, stepOutput)
        }
        merged = merged.addTags([...result.tags])
    }
    const blocking = results.find((result) => result.verdict.status !== ExecutionStatus.RUNNING)
    if (!isNil(blocking)) {
        return merged.setVerdict(blocking.verdict)
    }
    return merged
}

type RunBranchParams = {
    branch: NonNullable<ParallelAction['children'][number]>
    executionState: WorkflowExecutorContext
    constants: EngineConstants
}

type BranchResult = {
    context?: WorkflowExecutorContext
    error?: Error
}

type MergeParams = {
    base: WorkflowExecutorContext
    results: WorkflowExecutorContext[]
}
