import { Action, ConnectorAuthProperty, createAction, DropdownState } from '@fema-ipaas/connector-sdk'
import {
    BLUEPRINT_DEVKIT_ACTIONS,
    BlueprintAuthType,
    BlueprintOperation,
    blueprintOutput,
    blueprintTemplate,
    ConnectorBlueprintDefinition,
    isNil,
} from '@fema-ipaas/core-utils'
import { blueprintAuth } from './blueprint-auth'
import { blueprintHttp, BlueprintRequestError } from './blueprint-http'
import { blueprintProps, OptionsLoader } from './blueprint-props'

export const blueprintActions = {
    build({ definition, operation, auth }: BuildParams): Action {
        return createAction({
            name: operation.key,
            displayName: operation.name,
            description: operation.description.length > 0 ? operation.description : operation.name,
            auth,
            requireAuth: !isNil(auth),
            props: blueprintProps.build({ inputs: operation.inputs, auth, loadOptions: optionsLoader({ definition }) }),
            outputSchema: { fields: blueprintOutput.fields(operation.sample) },
            errorHandlingOptions: {
                continueOnFailure: { defaultValue: false },
                retryOnFailure: { defaultValue: false },
            },
            run: async (context) => {
                const values = blueprintProps.flatten(context.propsValue)
                const result = await blueprintActions.invoke({ definition, operation, values, authValue: context.auth })
                return result.body
            },
        })
    },
    async exchange({ definition, operation, values, authValue }: InvokeParams): Promise<InvokeResult> {
        const errors = blueprintProps.validate({ inputs: operation.inputs, values })
        if (errors.length > 0) {
            throw new BlueprintRequestError(errors.join('; '))
        }
        const credential = await blueprintAuth.resolve({ definition, value: authValue })
        const request = blueprintTemplate.resolveRequest(operation)
        const built = blueprintTemplate.buildRequest({
            baseUrl: definition.baseUrl,
            method: operation.method,
            path: operation.path,
            request,
            vars: { input: values, settings: values, authInput: credential.authInput, authData: credential.authData },
        })
        const auth = blueprintAuth.active(definition)
        const result = await blueprintHttp.execute({
            request: built,
            credential,
            plugin: auth?.plugin ?? null,
            status: operation.statusOverride ?? definition.status,
            timeoutSeconds: request.timeoutSeconds,
            followRedirect: request.followRedirect,
        })
        const tip = result.outcome.tip.length > 0 && result.outcome.tip !== result.outcome.message ? ` (${result.outcome.tip})` : ''
        return {
            body: result.body,
            status: result.status,
            durationMs: result.durationMs,
            requestText: result.requestText,
            log: result.log,
            success: result.outcome.success,
            errorMessage: result.outcome.success ? null : `${operation.name} failed with code ${result.outcome.code}: ${result.outcome.message ?? ''}${tip}`,
        }
    },
    async invoke(params: InvokeParams): Promise<InvokeResult> {
        const result = await blueprintActions.exchange(params)
        if (!result.success) {
            throw new BlueprintRequestError(result.errorMessage ?? `${params.operation.name} failed`)
        }
        return result
    },
    authTest({ definition, auth }: { definition: ConnectorBlueprintDefinition, auth: ConnectorAuthProperty | undefined }): Action {
        return createAction({
            name: BLUEPRINT_DEVKIT_ACTIONS.authTest,
            displayName: 'Connector devkit authentication test',
            description: 'Runs the authentication flow of a draft connector',
            auth,
            requireAuth: !isNil(auth),
            props: {},
            run: async (context) => {
                const started = Date.now()
                const active = blueprintAuth.active(definition)
                if (isNil(active)) {
                    return { user: null, token: false, durationMs: 0 }
                }
                const credential = await blueprintAuth.resolve({ definition, value: context.auth })
                const tokenOk = active.type === BlueprintAuthType.CLIENT_CREDENTIALS || active.type === BlueprintAuthType.AUTHORIZATION_CODE
                    ? !isNil(credential.apply) && credential.apply.value.length > (active.credentialPrefix.length)
                    : true
                if (!active.userFlow.enabled) {
                    return { user: null, token: tokenOk, durationMs: Date.now() - started }
                }
                const response = await blueprintAuth.runFlow({ definition, auth: active, step: active.userFlow, credential })
                const user = blueprintTemplate.stringify(blueprintTemplate.readPath({ source: response.body, path: active.userFlow.resultPath }))
                return { user: user.length > 0 ? user : null, token: tokenOk, durationMs: Date.now() - started }
            },
        })
    },
    debug({ definition, operation, auth }: BuildParams): Action {
        return createAction({
            name: `${BLUEPRINT_DEVKIT_ACTIONS.debugPrefix}${operation.key}`,
            displayName: `Debug ${operation.name}`,
            description: 'Runs a draft operation and returns the raw exchange',
            auth,
            requireAuth: !isNil(auth),
            props: blueprintProps.build({ inputs: operation.inputs.map((input) => ({ ...input, required: false, visibleIf: '' })), auth, loadOptions: optionsLoader({ definition }) }),
            run: async (context) => {
                const values = blueprintProps.flatten(context.propsValue)
                try {
                    const result = await blueprintActions.exchange({ definition, operation, values, authValue: context.auth })
                    return { success: result.success, status: result.status, durationMs: result.durationMs, request: result.requestText, response: result.body, log: result.log, errorMessage: result.errorMessage }
                }
                catch (error) {
                    return { success: false, status: 0, durationMs: 0, request: '', response: null, log: [], errorMessage: error instanceof Error ? error.message : String(error) }
                }
            },
        })
    },
}

function optionsLoader({ definition }: { definition: ConnectorBlueprintDefinition }): OptionsLoader {
    return async ({ input, operationKey, auth }): Promise<DropdownState<unknown>> => {
        const source = definition.operations.find((operation) => operation.key === operationKey)
        if (isNil(source)) {
            return { disabled: true, options: [], placeholder: `Operation ${operationKey} does not exist` }
        }
        if (!isNil(blueprintAuth.active(definition)) && isNil(auth)) {
            return { disabled: true, options: [], placeholder: 'Select a connection first' }
        }
        const result = await blueprintActions.invoke({ definition, operation: source, values: {}, authValue: auth })
        const items = blueprintTemplate.readPath({ source: result.body, path: input.optionsItemsPath })
        const list = Array.isArray(items) ? items : []
        return {
            disabled: false,
            options: list.map((item) => ({
                label: blueprintTemplate.stringify(blueprintTemplate.readPath({ source: item, path: input.optionsLabelPath })),
                value: blueprintTemplate.readPath({ source: item, path: input.optionsValuePath }),
            })),
        }
    }
}

type BuildParams = {
    definition: ConnectorBlueprintDefinition
    operation: BlueprintOperation
    auth: ConnectorAuthProperty | undefined
}

type InvokeParams = {
    definition: ConnectorBlueprintDefinition
    operation: BlueprintOperation
    values: Record<string, unknown>
    authValue: unknown
}

type InvokeResult = {
    body: unknown
    status: number
    durationMs: number
    requestText: string
    log: string[]
    success: boolean
    errorMessage: string | null
}
