import { BaseModel, BaseModelSchema, Metadata, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user'

export const VARIABLE_NAME_REGEX = /^[a-zA-Z0-9_]+$/
export const VARIABLE_NAME_MAX_LENGTH = 64

export type VariableId = string

export type VariableValue = {
    secret_text: string
}

export type Variable = BaseModel<VariableId> & {
    name: string
    projectId: string
    tenantId: string
    ownerId: string | null
    owner: UserWithMetaInformation | null
    metadata: Metadata | null
    value: VariableValue
    hasTestValue: boolean
}

export const VariableWithoutSensitiveData = z.object({
    ...BaseModelSchema,
    name: z.string(),
    projectId: z.string(),
    tenantId: z.string(),
    ownerId: Nullable(z.string()),
    owner: Nullable(UserWithMetaInformation),
    metadata: Nullable(Metadata),
    hasTestValue: z.boolean(),
}).describe('A project-scoped encrypted variable that workflows can reference via {{variables[\'NAME\']}}.')
export type VariableWithoutSensitiveData = z.infer<typeof VariableWithoutSensitiveData>
