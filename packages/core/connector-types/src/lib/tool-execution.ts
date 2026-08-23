import { z } from 'zod'

export enum ExecutionToolStatus {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export enum FieldControlMode {
    AGENT_DECIDE = 'agent-decide',
    CHOOSE_YOURSELF = 'choose-yourself',
    LEAVE_EMPTY = 'leave-empty',
}

export const PredefinedInputField = z.object({
    mode: z.enum(FieldControlMode),
    value: z.unknown(),
})
export type PredefinedInputField = z.infer<typeof PredefinedInputField>

export const PredefinedInputsStructure = z.object({
    auth: z.optional(z.string()),
    fields: z.record(z.string(), PredefinedInputField),
})
export type PredefinedInputsStructure = z.infer<typeof PredefinedInputsStructure>
