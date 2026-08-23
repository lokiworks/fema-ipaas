import { isNil } from '@fema/core-utils'
import { WorkflowActionType } from '../../workflows/actions/action'
import { WorkflowTriggerType } from '../../workflows/triggers/trigger'

export enum StepOutputStatus {
    FAILED = 'FAILED',
    PAUSED = 'PAUSED',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED',
    SUCCEEDED = 'SUCCEEDED',
}

type BaseStepOutputParams<T extends WorkflowActionType | WorkflowTriggerType, OUTPUT> = {
    type: T
    status: StepOutputStatus
    input: unknown
    output?: OUTPUT
    outputType?: StepOutputType
    duration?: number
    errorMessage?: string
}

export class GenericStepOutput<T extends WorkflowActionType | WorkflowTriggerType, OUTPUT> {
    type: T
    status: StepOutputStatus
    input: unknown
    output?: OUTPUT
    outputType?: StepOutputType
    duration?: number
    errorMessage?: string

    constructor(step: BaseStepOutputParams<T, OUTPUT>) {
        this.type = step.type
        this.status = step.status
        this.input = step.input
        this.output = step.output
        this.outputType = step.outputType
        this.duration = step.duration
        this.errorMessage = step.errorMessage
    }

    setOutput(output: OUTPUT): GenericStepOutput<T, OUTPUT> {
        return new GenericStepOutput<T, OUTPUT>({
            ...this,
            output,
        })
    }

    setStatus(status: StepOutputStatus): GenericStepOutput<T, OUTPUT> {
        return new GenericStepOutput<T, OUTPUT>({
            ...this,
            status,
        })
    }

    setErrorMessage(errorMessage: string): GenericStepOutput<T, OUTPUT> {
        return new GenericStepOutput<T, OUTPUT>({
            ...this,
            errorMessage,
        })
    }

    setDuration(duration: number): GenericStepOutput<T, OUTPUT> {
        return new GenericStepOutput<T, OUTPUT>({
            ...this,
            duration,
        })
    }

    static create<T extends WorkflowActionType | WorkflowTriggerType, OUTPUT>({
        input,
        type,
        status,
        output,
    }: {
        input: unknown
        type: T
        status: StepOutputStatus
        output?: OUTPUT
    }): GenericStepOutput<T, OUTPUT> {
        return new GenericStepOutput<T, OUTPUT>({
            input,
            type,
            status,
            output,
        })
    }
}

export enum StepOutputType {
    SLICE = 'slice',
}

/**
 * Payload stored in `StepOutput.output` when the host step has `outputType: StepOutputType.SLICE`.
 * Distinguished structurally by the step's `outputType` field, so the ref itself
 * carries no marker.
 */
export type LogSliceRef = {
    fileId: string
    size: number
    url: string
}

export const EXECUTION_LOG_MANIFEST_V2 = 2

export type BaseStepOutput = GenericStepOutput<WorkflowActionType | WorkflowTriggerType, unknown>

export type StepOutput =
  | GenericStepOutput<WorkflowActionType.LOOP_ON_ITEMS, LoopStepResult>
  | GenericStepOutput<WorkflowActionType.ROUTER, unknown>
  | GenericStepOutput<
  | Exclude<WorkflowActionType, WorkflowActionType.LOOP_ON_ITEMS | WorkflowActionType.ROUTER>
  | WorkflowTriggerType,
  unknown
  >

type BranchResult = {
    branchName: string
    branchIndex: number
    evaluation: boolean
}

type RouterStepResult = {
    branches: BranchResult[]
}

export class RouterStepOutput extends GenericStepOutput<
WorkflowActionType.ROUTER,
RouterStepResult
> {
    static init({ input }: { input: unknown }): RouterStepOutput {
        return new RouterStepOutput({
            type: WorkflowActionType.ROUTER,
            input,
            status: StepOutputStatus.SUCCEEDED,
        })
    }
}

export type LoopStepResult = {
    item: unknown
    index: number
    iterations: Record<string, StepOutput>[]
}

export class LoopStepOutput extends GenericStepOutput<
WorkflowActionType.LOOP_ON_ITEMS,
LoopStepResult
> {
    constructor(
        step: BaseStepOutputParams<WorkflowActionType.LOOP_ON_ITEMS, LoopStepResult>,
    ) {
        super(step)
        this.output = step.output ?? {
            item: undefined,
            index: 0,
            iterations: [],
        }
    }

    static init({ input }: { input: unknown }): LoopStepOutput {
        return new LoopStepOutput({
            type: WorkflowActionType.LOOP_ON_ITEMS,
            input,
            status: StepOutputStatus.SUCCEEDED,
        })
    }

    setIterations(iterations: Record<string, StepOutput>[]): LoopStepOutput {
        return new LoopStepOutput({
            ...this,
            output: {
                ...this.output,
                iterations,
            },
        })
    }

    hasIteration(iteration: number): boolean {
        return !isNil(this.output?.iterations[iteration])
    }

    setItemAndIndex({
        item,
        index,
    }: {
        item: unknown
        index: number
    }): LoopStepOutput {
        return new LoopStepOutput({
            ...this,
            output: {
                item,
                index,
                iterations: this.output?.iterations ?? [],
            },
        })
    }

    addIteration(): LoopStepOutput {
        return new LoopStepOutput({
            ...this,
            output: {
                item: this.output?.item,
                index: this.output?.index,
                iterations: [...(this.output?.iterations ?? []), {}],
            },
        })
    }
}
