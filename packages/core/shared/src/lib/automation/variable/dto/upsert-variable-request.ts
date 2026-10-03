import { Metadata } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { VARIABLE_NAME_MAX_LENGTH, VARIABLE_NAME_REGEX } from '../variable'

export const UpsertVariableRequestBody = z.object({
    projectId: z.string(),
    name: z.string().min(1, 'formErrors.required').max(VARIABLE_NAME_MAX_LENGTH, 'variableNameTooLong').regex(VARIABLE_NAME_REGEX, 'invalidVariableName'),
    value: z.string().min(1, 'formErrors.required'),
    testValue: z.string().min(1, 'formErrors.required').optional(),
    metadata: z.optional(Metadata),
})
export type UpsertVariableRequestBody = z.infer<typeof UpsertVariableRequestBody>

export const UpdateVariableRequestBody = z.object({
    value: z.string().min(1, 'formErrors.required').optional(),
    testValue: z.string().nullable().optional(),
    metadata: z.optional(Metadata),
})
export type UpdateVariableRequestBody = z.infer<typeof UpdateVariableRequestBody>
