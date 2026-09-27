import { ConnectorAuth, ConnectorAuthProperty, CustomAuthProps, OAuth2Props, Property } from '@fema-ipaas/connector-sdk'
import {
    BlueprintAuth,
    BlueprintAuthField,
    BlueprintAuthFieldControl,
    BlueprintAuthFlowStep,
    BlueprintAuthType,
    BlueprintBodyType,
    BlueprintCredentialLocation,
    blueprintFactory,
    BlueprintHttpMethod,
    blueprintTemplate,
    BuiltRequest,
    ConnectorBlueprintDefinition,
    isNil,
} from '@fema-ipaas/core-utils'
import { BlueprintCredential, blueprintHttp, BlueprintRawResponse, BlueprintRequestError } from './blueprint-http'

export const blueprintAuth = {
    property(definition: ConnectorBlueprintDefinition): ConnectorAuthProperty | undefined {
        const auth = activeAuth(definition)
        if (isNil(auth)) {
            return undefined
        }
        const description = auth.description.trim().length > 0 ? auth.description : auth.name
        if (auth.type === BlueprintAuthType.AUTHORIZATION_CODE) {
            return ConnectorAuth.OAuth2({
                displayName: auth.name,
                description,
                required: true,
                authUrl: auth.authorizeUrl,
                tokenUrl: auth.tokenUrl,
                scope: auth.scope.split(/[\s,]+/).filter((scope) => scope.length > 0),
                pkce: auth.pkce,
                ...(auth.fields.length > 0 ? { props: oauthProps(auth.fields) } : {}),
            })
        }
        const identifier = auth.userFlow.enabled && auth.userFlow.resultPath.trim().length > 0
            ? { getConnectionIdentifier: async ({ auth: value }: { auth: unknown }) => identify({ definition, auth, value }) }
            : {}
        return ConnectorAuth.CustomAuth({
            displayName: auth.name,
            description,
            required: true,
            props: { ...fieldProps(blueprintFactory.autoAuthFields(auth.type)), ...fieldProps(auth.fields) },
            validate: async ({ auth: value }: { auth: unknown }) => validate({ definition, auth, value }),
            ...identifier,
        })
    },
    async resolve({ definition, value }: ResolveParams): Promise<BlueprintCredential> {
        const auth = activeAuth(definition)
        if (isNil(auth)) {
            return { authInput: {}, authData: {}, apply: null }
        }
        const authInput = inputOf(value)
        switch (auth.type) {
            case BlueprintAuthType.AUTHORIZATION_CODE: {
                const authData = oauthDataOf(value)
                return { authInput, authData, apply: tokenApply({ auth, token: blueprintTemplate.stringify(authData.access_token) }) }
            }
            case BlueprintAuthType.CLIENT_CREDENTIALS: {
                const response = await blueprintAuth.runFlow({ definition, auth, step: auth.tokenFlow, credential: { authInput, authData: {}, apply: null } })
                const authData = isRecord(response.body) ? response.body : {}
                const token = blueprintTemplate.stringify(blueprintTemplate.readPath({ source: authData, path: auth.tokenFlow.resultPath || 'access_token' }))
                if (token.length === 0) {
                    throw new BlueprintRequestError(`The token endpoint did not return ${auth.tokenFlow.resultPath || 'access_token'}`)
                }
                return { authInput, authData, apply: tokenApply({ auth, token }) }
            }
            case BlueprintAuthType.API_KEY:
                return { authInput, authData: {}, apply: tokenApply({ auth, token: blueprintTemplate.stringify(authInput.api_key) }) }
            case BlueprintAuthType.BASIC_AUTH: {
                const encoded = Buffer.from(`${blueprintTemplate.stringify(authInput.username)}:${blueprintTemplate.stringify(authInput.password)}`).toString('base64')
                return { authInput, authData: {}, apply: { location: BlueprintCredentialLocation.HEADER, name: 'Authorization', value: `Basic ${encoded}` } }
            }
        }
    },
    async runFlow({ definition, auth, step, credential }: RunFlowParams): Promise<BlueprintRawResponse> {
        const request = flowRequest({ definition, step, credential })
        const response = await blueprintHttp.send({ request, credential, plugin: auth.plugin, timeoutSeconds: FLOW_TIMEOUT_SECONDS, followRedirect: true })
        if (response.status < 200 || response.status >= 300) {
            throw new BlueprintRequestError(`${step.method} ${step.url} returned HTTP ${response.status}: ${blueprintTemplate.stringify(response.body).slice(0, 300)}`)
        }
        return response
    },
    active: activeAuth,
}

async function validate({ definition, auth, value }: FlowCheckParams): Promise<{ valid: true } | { valid: false, error: string }> {
    try {
        const credential = await blueprintAuth.resolve({ definition, value })
        if (auth.userFlow.enabled) {
            await blueprintAuth.runFlow({ definition, auth, step: auth.userFlow, credential })
        }
        return { valid: true }
    }
    catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) }
    }
}

async function identify({ definition, auth, value }: FlowCheckParams): Promise<string | undefined> {
    const credential = await blueprintAuth.resolve({ definition, value })
    const response = await blueprintAuth.runFlow({ definition, auth, step: auth.userFlow, credential })
    const name = blueprintTemplate.stringify(blueprintTemplate.readPath({ source: response.body, path: auth.userFlow.resultPath }))
    return name.length > 0 ? name : undefined
}

function flowRequest({ definition, step, credential }: { definition: ConnectorBlueprintDefinition, step: BlueprintAuthFlowStep, credential: BlueprintCredential }): BuiltRequest {
    const vars = { authInput: credential.authInput, authData: credential.authData }
    const rendered = step.config.trim().length === 0 ? '{}' : blueprintTemplate.renderJson({ template: step.config, vars })
    const config: unknown = JSON.parse(rendered)
    const parsed = isRecord(config) ? config : {}
    const body = parsed.body
    const form = parsed.bodyType === 'FORM'
    const url = blueprintTemplate.buildRequest({
        baseUrl: definition.baseUrl,
        method: step.method,
        path: step.url,
        request: { headers: [], query: [], bodyType: BlueprintBodyType.NONE, body: '', form: [], timeoutSeconds: FLOW_TIMEOUT_SECONDS, followRedirect: true },
        vars,
    }).url
    return {
        method: step.method,
        url,
        headers: isRecord(parsed.headers) ? stringRecord(parsed.headers) : {},
        query: isRecord(parsed.query) ? stringRecord(parsed.query) : {},
        bodyType: isNil(body) || step.method === BlueprintHttpMethod.GET ? BlueprintBodyType.NONE : form ? BlueprintBodyType.FORM_URLENCODED : BlueprintBodyType.JSON,
        body: isNil(body) || form ? null : typeof body === 'string' ? body : JSON.stringify(body),
        form: form && isRecord(body) ? stringRecord(body) : {},
    }
}

function tokenApply({ auth, token }: { auth: BlueprintAuth, token: string }): BlueprintCredential['apply'] {
    return {
        location: auth.credentialLocation,
        name: auth.credentialName,
        value: `${auth.credentialPrefix}${token}`,
    }
}

function fieldProps(fields: BlueprintAuthField[]): CustomAuthProps {
    return Object.fromEntries(fields.map((field) => [field.key, fieldProperty(field)]))
}

function oauthProps(fields: BlueprintAuthField[]): OAuth2Props {
    return Object.fromEntries(fields.map((field) => [field.key, oauthProperty(field)]))
}

function oauthProperty(field: BlueprintAuthField): OAuth2Props[string] {
    switch (field.control) {
        case BlueprintAuthFieldControl.PASSWORD:
            return ConnectorAuth.SecretText({ displayName: field.label, required: field.required })
        case BlueprintAuthFieldControl.DROPDOWN:
            return Property.StaticDropdown({ displayName: field.label, required: field.required, options: { options: field.options.map((option) => ({ label: option, value: option })) } })
        case BlueprintAuthFieldControl.LONG_TEXT:
        case BlueprintAuthFieldControl.TEXT:
            return Property.ShortText({ displayName: field.label, required: field.required })
    }
}

function fieldProperty(field: BlueprintAuthField): CustomAuthProps[string] {
    switch (field.control) {
        case BlueprintAuthFieldControl.PASSWORD:
            return ConnectorAuth.SecretText({ displayName: field.label, required: field.required })
        case BlueprintAuthFieldControl.LONG_TEXT:
            return Property.LongText({ displayName: field.label, required: field.required })
        case BlueprintAuthFieldControl.DROPDOWN:
            return Property.StaticDropdown({ displayName: field.label, required: field.required, options: { options: field.options.map((option) => ({ label: option, value: option })) } })
        case BlueprintAuthFieldControl.TEXT:
            return Property.ShortText({ displayName: field.label, required: field.required })
    }
}

function activeAuth(definition: ConnectorBlueprintDefinition): BlueprintAuth | null {
    return isNil(definition.auth) || !definition.auth.enabled ? null : definition.auth
}

function inputOf(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) {
        return {}
    }
    const props = value.props
    return isRecord(props) ? props : {}
}

function oauthDataOf(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) {
        return {}
    }
    const data = isRecord(value.data) ? value.data : {}
    return { ...data, access_token: value.access_token, refresh_token: value.refresh_token }
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, blueprintTemplate.stringify(entry)]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const FLOW_TIMEOUT_SECONDS = 30

type ResolveParams = {
    definition: ConnectorBlueprintDefinition
    value: unknown
}

type RunFlowParams = {
    definition: ConnectorBlueprintDefinition
    auth: BlueprintAuth
    step: BlueprintAuthFlowStep
    credential: BlueprintCredential
}

type FlowCheckParams = {
    definition: ConnectorBlueprintDefinition
    auth: BlueprintAuth
    value: unknown
}
