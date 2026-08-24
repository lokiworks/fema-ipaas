import { BaseModelSchema } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum BlueprintAuthType {
    NONE = 'NONE',
    API_KEY = 'API_KEY',
    BEARER_TOKEN = 'BEARER_TOKEN',
    BASIC_AUTH = 'BASIC_AUTH',
    CUSTOM_AUTH = 'CUSTOM_AUTH',
}

export enum BlueprintHttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
}

export enum BlueprintFieldType {
    TEXT = 'TEXT',
    LONG_TEXT = 'LONG_TEXT',
    NUMBER = 'NUMBER',
    CHECKBOX = 'CHECKBOX',
    DROPDOWN = 'DROPDOWN',
    DATE_TIME = 'DATE_TIME',
    JSON = 'JSON',
    ARRAY = 'ARRAY',
    OBJECT = 'OBJECT',
    SECRET = 'SECRET',
}

export const BlueprintField = z.object({
    name: z.string().min(1, 'formErrors.required'),
    displayName: z.string().min(1, 'formErrors.required'),
    description: z.string().default(''),
    required: z.boolean().default(false),
    in: z.enum(['query', 'path', 'header', 'body']),
    type: z.enum(BlueprintFieldType).default(BlueprintFieldType.TEXT),
    options: z.array(z.string()).default([]),
})

export const BlueprintAction = z.object({
    name: z.string().min(1, 'formErrors.required'),
    displayName: z.string().min(1, 'formErrors.required'),
    description: z.string().default(''),
    method: z.enum(BlueprintHttpMethod),
    path: z.string().min(1, 'formErrors.required'),
    fields: z.array(BlueprintField).default([]),
})

export const BlueprintAuth = z.object({
    type: z.enum(BlueprintAuthType),
    parameterName: z.string().optional(),
    description: z.string().default(''),
})

export const ConnectorBlueprintDefinition = z.object({
    connectorName: z.string().min(1, 'formErrors.required'),
    displayName: z.string().min(1, 'formErrors.required'),
    description: z.string().default(''),
    logoUrl: z.string().default(''),
    categories: z.array(z.string()).default([]),
    documentationUrl: z.string().default(''),
    baseUrl: z.string().min(1, 'formErrors.required'),
    defaultHeaders: z.record(z.string(), z.string()).default({}),
    auth: BlueprintAuth,
    actions: z.array(BlueprintAction).default([]),
})

export const ConnectorBlueprint = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    definition: ConnectorBlueprintDefinition,
})

export const UpsertConnectorBlueprintRequest = z.object({
    id: z.string().optional(),
    definition: ConnectorBlueprintDefinition,
})

export const GenerateFromBlueprintResponse = z.object({
    connectorName: z.string(),
    displayName: z.string(),
    files: z.record(z.string(), z.string()),
})

export type BlueprintField = z.infer<typeof BlueprintField>
export type BlueprintFieldTypeValue = `${BlueprintFieldType}`
export type BlueprintAction = z.infer<typeof BlueprintAction>
export type BlueprintAuth = z.infer<typeof BlueprintAuth>
export type ConnectorBlueprintDefinition = z.infer<typeof ConnectorBlueprintDefinition>
export type ConnectorBlueprint = z.infer<typeof ConnectorBlueprint>
export type UpsertConnectorBlueprintRequest = z.infer<typeof UpsertConnectorBlueprintRequest>
export type GenerateFromBlueprintResponse = z.infer<typeof GenerateFromBlueprintResponse>
