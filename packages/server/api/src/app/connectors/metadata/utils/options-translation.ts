import { isNil } from '@fema-ipaas/core-utils'
import { MAX_KEY_LENGTH_FOR_CORWDIN } from '@fema-ipaas/shared'

function translateOptionsResult({ result, i18n }: TranslateOptionsResultParams): unknown {
    if (isNil(i18n) || !isRecord(result) || !isRecord(result.options)) {
        return result
    }
    return { ...result, options: translateOptions({ options: result.options, i18n }) }
}

function translateOptions({ options, i18n }: { options: Record<string, unknown>, i18n: Record<string, string> }): Record<string, unknown> {
    if ('options' in options || 'placeholder' in options || 'disabled' in options) {
        return {
            ...options,
            ...(typeof options.placeholder === 'string' ? { placeholder: translateText({ text: options.placeholder, i18n }) } : {}),
        }
    }
    return Object.fromEntries(
        Object.entries(options).map(([name, property]) => [name, translateProperty({ property, i18n })]),
    )
}

function translateProperty({ property, i18n }: { property: unknown, i18n: Record<string, string> }): unknown {
    if (!isRecord(property)) {
        return property
    }
    return {
        ...property,
        ...(typeof property.displayName === 'string' ? { displayName: translateText({ text: property.displayName, i18n }) } : {}),
        ...(typeof property.description === 'string' ? { description: translateText({ text: property.description, i18n }) } : {}),
        ...(isRecord(property.options) && Array.isArray(property.options.options)
            ? { options: { ...property.options, options: property.options.options.map((option: unknown) => translateOption({ option, i18n })) } }
            : {}),
    }
}

function translateOption({ option, i18n }: { option: unknown, i18n: Record<string, string> }): unknown {
    if (!isRecord(option) || typeof option.label !== 'string') {
        return option
    }
    return { ...option, label: translateText({ text: option.label, i18n }) }
}

function translateText({ text, i18n }: { text: string, i18n: Record<string, string> }): string {
    return i18n[text.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)] ?? text
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const optionsTranslation = { translateOptionsResult }

type TranslateOptionsResultParams = {
    result: unknown
    i18n: Record<string, string> | undefined
}
