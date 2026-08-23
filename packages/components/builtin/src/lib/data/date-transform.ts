import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const dateTransformComponent = createComponent({
    type: 'data/date-transform',
    displayName: 'Date Transform',
    description: 'Format a date, shift it, or measure the gap between two',
    category: FlowComponentCategory.DATA,
    icon: 'calendar',
    props: {
        operation: Property.StaticDropdown({
            displayName: 'Operation',
            required: true,
            defaultValue: 'format',
            options: {
                options: [
                    { label: 'Now', value: 'now' },
                    { label: 'Format', value: 'format' },
                    { label: 'Add', value: 'add' },
                    { label: 'Subtract', value: 'subtract' },
                    { label: 'Difference', value: 'difference' },
                    { label: 'Extract parts', value: 'parts' },
                ],
            },
        }),
        date: Property.ShortText({
            displayName: 'Date',
            description: 'ISO 8601 or any parseable date',
            required: false,
        }),
        otherDate: Property.ShortText({
            displayName: 'Second date',
            description: 'Used by Difference',
            required: false,
        }),
        amount: Property.Number({
            displayName: 'Amount',
            description: 'Used by Add and Subtract',
            required: false,
        }),
        unit: Property.StaticDropdown({
            displayName: 'Unit',
            required: false,
            defaultValue: 'days',
            options: {
                options: [
                    { label: 'Seconds', value: 'seconds' },
                    { label: 'Minutes', value: 'minutes' },
                    { label: 'Hours', value: 'hours' },
                    { label: 'Days', value: 'days' },
                ],
            },
        }),
    },
    async run(context) {
        const operation = String(context.input.operation)
        if (operation === 'now') {
            return { result: new Date().toISOString() }
        }
        const date = parseOrThrow(context.input.date, 'Date')
        switch (operation) {
            case 'format':
                return { result: date.toISOString() }
            case 'add':
                return { result: shift(date, amountOf(context.input.amount), unitMs(context.input.unit)).toISOString() }
            case 'subtract':
                return { result: shift(date, -amountOf(context.input.amount), unitMs(context.input.unit)).toISOString() }
            case 'difference': {
                const other = parseOrThrow(context.input.otherDate, 'Second date')
                const diffMs = Math.abs(other.getTime() - date.getTime())
                return {
                    milliseconds: diffMs,
                    seconds: Math.floor(diffMs / 1000),
                    minutes: Math.floor(diffMs / 60000),
                    hours: Math.floor(diffMs / 3600000),
                    days: Math.floor(diffMs / 86400000),
                }
            }
            case 'parts':
                return {
                    year: date.getUTCFullYear(),
                    month: date.getUTCMonth() + 1,
                    day: date.getUTCDate(),
                    hour: date.getUTCHours(),
                    minute: date.getUTCMinutes(),
                    second: date.getUTCSeconds(),
                    dayOfWeek: date.getUTCDay(),
                }
            default:
                throw new Error(`Unknown date operation: ${operation}`)
        }
    },
})

function parseOrThrow(value: unknown, label: string): Date {
    const parsed = new Date(String(value ?? ''))
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${label} could not be parsed: "${String(value)}". Use ISO format, e.g. 2026-08-05T14:30:00Z.`)
    }
    return parsed
}

function amountOf(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        throw new Error(`Amount must be a number, got "${String(value)}"`)
    }
    return parsed
}

function unitMs(unit: unknown): number {
    switch (String(unit ?? 'days')) {
        case 'seconds': return 1000
        case 'minutes': return 60 * 1000
        case 'hours': return 60 * 60 * 1000
        case 'days': return 24 * 60 * 60 * 1000
        default: throw new Error(`Unknown unit: ${String(unit)}`)
    }
}

function shift(date: Date, amount: number, unitInMs: number): Date {
    return new Date(date.getTime() + amount * unitInMs)
}
