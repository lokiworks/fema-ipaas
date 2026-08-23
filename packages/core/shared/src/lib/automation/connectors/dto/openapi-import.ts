import { z } from 'zod'

export const ParseOpenApiRequest = z.object({
    document: z.string().min(1, 'formErrors.required'),
})

export const OpenApiAuthScheme = z.object({
    name: z.string(),
    type: z.string(),
    scheme: z.string().optional(),
    in: z.string().optional(),
    parameterName: z.string().optional(),
})

export const OpenApiOperation = z.object({
    operationId: z.string(),
    method: z.string(),
    path: z.string(),
    summary: z.string(),
    description: z.string(),
    parameters: z.array(z.object({
        name: z.string(),
        in: z.string(),
        required: z.boolean(),
        description: z.string(),
        type: z.string(),
    })),
    hasRequestBody: z.boolean(),
})

export const ParseOpenApiResponse = z.object({
    title: z.string(),
    version: z.string(),
    description: z.string(),
    servers: z.array(z.string()),
    authSchemes: z.array(OpenApiAuthScheme),
    operations: z.array(OpenApiOperation),
})

export const GenerateConnectorFromOpenApiRequest = z.object({
    document: z.string().min(1, 'formErrors.required'),
    connectorName: z.string().min(1, 'formErrors.required'),
    displayName: z.string().min(1, 'formErrors.required'),
    operationIds: z.array(z.string()).min(1, 'formErrors.required'),
})

export const GenerateConnectorFromOpenApiResponse = z.object({
    connectorName: z.string(),
    displayName: z.string(),
    baseUrl: z.string(),
    files: z.record(z.string(), z.string()),
})

export type ParseOpenApiRequest = z.infer<typeof ParseOpenApiRequest>
export type ParseOpenApiResponse = z.infer<typeof ParseOpenApiResponse>
export type OpenApiOperation = z.infer<typeof OpenApiOperation>
export type OpenApiAuthScheme = z.infer<typeof OpenApiAuthScheme>
export type GenerateConnectorFromOpenApiRequest = z.infer<typeof GenerateConnectorFromOpenApiRequest>
export type GenerateConnectorFromOpenApiResponse = z.infer<typeof GenerateConnectorFromOpenApiResponse>
