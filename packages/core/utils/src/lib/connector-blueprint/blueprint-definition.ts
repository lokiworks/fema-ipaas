import * as z from 'zod/mini'

export enum BlueprintAuthType {
    AUTHORIZATION_CODE = 'AUTHORIZATION_CODE',
    CLIENT_CREDENTIALS = 'CLIENT_CREDENTIALS',
    API_KEY = 'API_KEY',
    BASIC_AUTH = 'BASIC_AUTH',
}

export enum BlueprintHttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
}

export enum BlueprintInputControl {
    TEXT = 'TEXT',
    DROPDOWN = 'DROPDOWN',
    CODE = 'CODE',
    SWITCH = 'SWITCH',
}

export enum BlueprintValueType {
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
    OBJECT = 'OBJECT',
    ARRAY = 'ARRAY',
}

export enum BlueprintOptionsSource {
    STATIC = 'STATIC',
    OPERATION = 'OPERATION',
}

export enum BlueprintBodyType {
    NONE = 'NONE',
    JSON = 'JSON',
    FORM_URLENCODED = 'FORM_URLENCODED',
    FORM_DATA = 'FORM_DATA',
}

export enum BlueprintAuthFieldControl {
    TEXT = 'TEXT',
    PASSWORD = 'PASSWORD',
    LONG_TEXT = 'LONG_TEXT',
    DROPDOWN = 'DROPDOWN',
}

export enum BlueprintCredentialLocation {
    HEADER = 'HEADER',
    QUERY = 'QUERY',
}

export enum BlueprintTriggerType {
    INSTANT = 'INSTANT',
    POLLING = 'POLLING',
}

export enum BlueprintPagination {
    NONE = 'NONE',
    PAGE = 'PAGE',
    CURSOR = 'CURSOR',
}

export enum BlueprintStatusUnmatched {
    SUCCESS = 'SUCCESS',
    FAIL = 'FAIL',
}

export const BlueprintKeyValue = z.object({
    key: z.string(),
    value: z.string(),
})

export const BlueprintRequestConfig = z.object({
    headers: z.array(BlueprintKeyValue),
    query: z.array(BlueprintKeyValue),
    bodyType: z.enum(BlueprintBodyType),
    body: z.string(),
    form: z.array(BlueprintKeyValue),
    timeoutSeconds: z.number(),
    followRedirect: z.boolean(),
})

export const BlueprintInput = z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(BlueprintValueType),
    control: z.enum(BlueprintInputControl),
    required: z.boolean(),
    hint: z.string(),
    options: z.array(z.string()),
    optionsSource: z.enum(BlueprintOptionsSource),
    optionsOperation: z.nullable(z.string()),
    optionsItemsPath: z.string(),
    optionsLabelPath: z.string(),
    optionsValuePath: z.string(),
    pattern: z.string(),
    patternMessage: z.string(),
    visibleIf: z.string(),
})

export const BlueprintStatusRule = z.object({
    code: z.string(),
    success: z.boolean(),
    retry: z.boolean(),
    tip: z.string(),
})

export const BlueprintStatusConfig = z.object({
    codePath: z.string(),
    messagePath: z.string(),
    unmatched: z.enum(BlueprintStatusUnmatched),
    rules: z.array(BlueprintStatusRule),
})

export const BlueprintOperation = z.object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    group: z.string(),
    method: z.enum(BlueprintHttpMethod),
    path: z.string(),
    inputs: z.array(BlueprintInput),
    request: z.nullable(BlueprintRequestConfig),
    sample: z.unknown(),
    statusOverride: z.nullable(BlueprintStatusConfig),
})

export const BlueprintEndpoint = z.object({
    enabled: z.boolean(),
    method: z.enum(BlueprintHttpMethod),
    path: z.string(),
    request: z.nullable(BlueprintRequestConfig),
})

export const BlueprintInstantTrigger = z.object({
    subscribe: BlueprintEndpoint,
    unsubscribe: BlueprintEndpoint,
    subscriptionIdPath: z.string(),
    handle: z.string(),
})

export const BlueprintPollingTrigger = z.object({
    method: z.enum(BlueprintHttpMethod),
    path: z.string(),
    request: z.nullable(BlueprintRequestConfig),
    intervalMinutes: z.number(),
    pagination: z.enum(BlueprintPagination),
    pageParam: z.string(),
    startPage: z.number(),
    cursorParam: z.string(),
    cursorPath: z.string(),
    hasMorePath: z.string(),
    maxPages: z.number(),
    listPath: z.string(),
    dedupeKey: z.string(),
    checkpointName: z.string(),
    checkpointItemPath: z.string(),
})

export const BlueprintTrigger = z.object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    type: z.enum(BlueprintTriggerType),
    inputs: z.array(BlueprintInput),
    sample: z.unknown(),
    instant: BlueprintInstantTrigger,
    polling: BlueprintPollingTrigger,
})

export const BlueprintAuthField = z.object({
    key: z.string(),
    label: z.string(),
    control: z.enum(BlueprintAuthFieldControl),
    required: z.boolean(),
    options: z.array(z.string()),
})

export const BlueprintAuthFlowStep = z.object({
    enabled: z.boolean(),
    method: z.enum(BlueprintHttpMethod),
    url: z.string(),
    config: z.string(),
    resultPath: z.string(),
})

export const BlueprintSigningPlugin = z.object({
    enabled: z.boolean(),
    code: z.string(),
})

export const BlueprintAuth = z.object({
    type: z.enum(BlueprintAuthType),
    enabled: z.boolean(),
    name: z.string(),
    description: z.string(),
    credentialLocation: z.enum(BlueprintCredentialLocation),
    credentialName: z.string(),
    credentialPrefix: z.string(),
    authorizeUrl: z.string(),
    tokenUrl: z.string(),
    scope: z.string(),
    pkce: z.boolean(),
    fields: z.array(BlueprintAuthField),
    tokenFlow: BlueprintAuthFlowStep,
    refreshFlow: BlueprintAuthFlowStep,
    userFlow: BlueprintAuthFlowStep,
    plugin: BlueprintSigningPlugin,
})

export const ConnectorBlueprintDefinition = z.object({
    displayName: z.string(),
    description: z.string(),
    iconColor: z.string(),
    helpUrl: z.string(),
    baseUrl: z.string(),
    auth: z.nullable(BlueprintAuth),
    status: BlueprintStatusConfig,
    groups: z.array(z.string()),
    operations: z.array(BlueprintOperation),
    triggers: z.array(BlueprintTrigger),
})

export const ConnectorBlueprintManifest = z.object({
    schemaVersion: z.number(),
    identifier: z.string(),
    connectorName: z.string(),
    packageVersion: z.string(),
    logoUrl: z.string(),
    draft: z.boolean(),
    definition: ConnectorBlueprintDefinition,
})

export type BlueprintKeyValue = z.infer<typeof BlueprintKeyValue>
export type BlueprintRequestConfig = z.infer<typeof BlueprintRequestConfig>
export type BlueprintInput = z.infer<typeof BlueprintInput>
export type BlueprintStatusRule = z.infer<typeof BlueprintStatusRule>
export type BlueprintStatusConfig = z.infer<typeof BlueprintStatusConfig>
export type BlueprintOperation = z.infer<typeof BlueprintOperation>
export type BlueprintEndpoint = z.infer<typeof BlueprintEndpoint>
export type BlueprintInstantTrigger = z.infer<typeof BlueprintInstantTrigger>
export type BlueprintPollingTrigger = z.infer<typeof BlueprintPollingTrigger>
export type BlueprintTrigger = z.infer<typeof BlueprintTrigger>
export type BlueprintAuthField = z.infer<typeof BlueprintAuthField>
export type BlueprintAuthFlowStep = z.infer<typeof BlueprintAuthFlowStep>
export type BlueprintSigningPlugin = z.infer<typeof BlueprintSigningPlugin>
export type BlueprintAuth = z.infer<typeof BlueprintAuth>
export type ConnectorBlueprintDefinition = z.infer<typeof ConnectorBlueprintDefinition>
export type ConnectorBlueprintManifest = z.infer<typeof ConnectorBlueprintManifest>
