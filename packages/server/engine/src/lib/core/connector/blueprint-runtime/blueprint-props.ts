import { ConnectorAuthProperty, DropdownState, InputProperty, InputPropertyMap, Property } from '@fema-ipaas/connector-sdk'
import {
    blueprintExpression,
    BlueprintInput,
    BlueprintInputControl,
    BlueprintOptionsSource,
    blueprintTemplate,
    BlueprintValueType,
    isNil,
} from '@fema-ipaas/core-utils'

export const blueprintProps = {
    build({ inputs, auth, loadOptions }: BuildParams): InputPropertyMap {
        const always = inputs.filter((input) => input.visibleIf.trim().length === 0)
        const conditional = inputs.filter((input) => input.visibleIf.trim().length > 0)
        const base: InputPropertyMap = Object.fromEntries(always.map((input) => [input.key, propertyOf({ input, auth, loadOptions })]))
        if (conditional.length === 0) {
            return base
        }
        const refreshers = [...new Set(conditional.flatMap((input) => blueprintExpression.references(input.visibleIf)))]
            .filter((key) => always.some((input) => input.key === key))
        return {
            ...base,
            [CONDITIONAL_GROUP_KEY]: Property.DynamicProperties({
                displayName: 'More inputs',
                required: false,
                refreshers,
                auth,
                props: async (propsValue) => {
                    const values = plainValues(propsValue)
                    return Object.fromEntries(conditional
                        .filter((input) => blueprintExpression.evaluate({ expression: input.visibleIf, values }))
                        .map((input) => [input.key, propertyOf({ input, auth, loadOptions })]))
                },
            }),
        }
    },
    flatten(propsValue: Record<string, unknown>): Record<string, unknown> {
        const group = propsValue[CONDITIONAL_GROUP_KEY]
        const rest = Object.fromEntries(Object.entries(propsValue).filter(([key]) => key !== CONDITIONAL_GROUP_KEY && key !== AUTH_KEY))
        return isRecord(group) ? { ...rest, ...group } : rest
    },
    validate({ inputs, values }: { inputs: BlueprintInput[], values: Record<string, unknown> }): string[] {
        return inputs
            .filter((input) => blueprintExpression.evaluate({ expression: input.visibleIf, values }))
            .flatMap((input) => {
                const value = values[input.key]
                const empty = isNil(value) || (typeof value === 'string' && value.trim().length === 0)
                if (empty) {
                    return input.required && input.control !== BlueprintInputControl.SWITCH ? [`${input.label} is required`] : []
                }
                if (input.pattern.length > 0 && input.control === BlueprintInputControl.TEXT && !safeTest({ pattern: input.pattern, value: blueprintTemplate.stringify(value) })) {
                    return [input.patternMessage.length > 0 ? `${input.label}: ${input.patternMessage}` : `${input.label} has an invalid format`]
                }
                return []
            })
    },
}

function propertyOf({ input, auth, loadOptions }: { input: BlueprintInput, auth: ConnectorAuthProperty | undefined, loadOptions: OptionsLoader }): InputProperty {
    const common = { displayName: input.label, description: input.hint.length > 0 ? input.hint : undefined, required: input.control === BlueprintInputControl.SWITCH ? false : input.required }
    switch (input.control) {
        case BlueprintInputControl.SWITCH:
            return Property.Checkbox({ ...common, defaultValue: false })
        case BlueprintInputControl.CODE:
            return Property.Json(common)
        case BlueprintInputControl.DROPDOWN:
            if (input.optionsSource === BlueprintOptionsSource.OPERATION && !isNil(input.optionsOperation)) {
                const operationKey = input.optionsOperation
                return Property.Dropdown({
                    ...common,
                    auth,
                    refreshers: [],
                    options: async (propsValue) => loadOptions({ input, operationKey, auth: propsValue.auth }),
                })
            }
            return Property.StaticDropdown({ ...common, options: { options: input.options.map((option) => ({ label: option, value: option })) } })
        case BlueprintInputControl.TEXT:
            return input.type === BlueprintValueType.NUMBER ? Property.Number(common) : Property.ShortText(common)
    }
}

function plainValues(propsValue: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(propsValue).filter(([key]) => key !== AUTH_KEY))
}

function safeTest({ pattern, value }: { pattern: string, value: string }): boolean {
    try {
        return new RegExp(pattern).test(value)
    }
    catch {
        return true
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const AUTH_KEY = 'auth'

export const CONDITIONAL_GROUP_KEY = '__conditional_inputs'

export type OptionsLoader = (params: { input: BlueprintInput, operationKey: string, auth: unknown }) => Promise<DropdownState<unknown>>

type BuildParams = {
    inputs: BlueprintInput[]
    auth: ConnectorAuthProperty | undefined
    loadOptions: OptionsLoader
}
