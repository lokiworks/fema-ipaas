import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const filterComponent = createComponent({
    type: 'data/filter',
    displayName: 'Filter',
    description: 'Keep only the list items that match a condition',
    category: FlowComponentCategory.DATA,
    icon: 'filter',
    props: {
        items: Property.Json({
            displayName: 'Items',
            description: 'The list to filter',
            required: true,
        }),
        field: Property.ShortText({
            displayName: 'Field',
            description: 'Property on each item to test. Leave empty to test the item itself.',
            required: false,
        }),
        operator: Property.StaticDropdown({
            displayName: 'Condition',
            required: true,
            defaultValue: 'equals',
            options: {
                options: [
                    { label: 'Equals', value: 'equals' },
                    { label: 'Does not equal', value: 'not_equals' },
                    { label: 'Contains', value: 'contains' },
                    { label: 'Is empty', value: 'is_empty' },
                    { label: 'Is not empty', value: 'is_not_empty' },
                    { label: 'Greater than', value: 'greater_than' },
                    { label: 'Less than', value: 'less_than' },
                ],
            },
        }),
        value: Property.ShortText({
            displayName: 'Value',
            description: 'Ignored for the empty checks',
            required: false,
        }),
    },
    async run(context) {
        const items = context.input.items
        if (!Array.isArray(items)) {
            throw new Error('Items must be a list')
        }
        const field = context.input.field
        const operator = String(context.input.operator)
        const expected = context.input.value
        const kept = items.filter((item) => matches({ candidate: valueOf(item, field), operator, expected }))
        return { items: kept, count: kept.length, removed: items.length - kept.length }
    },
})

function valueOf(item: unknown, field: unknown): unknown {
    if (typeof field !== 'string' || field.length === 0) {
        return item
    }
    if (typeof item !== 'object' || item === null) {
        return undefined
    }
    return Reflect.get(item, field)
}

function matches({ candidate, operator, expected }: MatchParams): boolean {
    switch (operator) {
        case 'is_empty':
            return isEmpty(candidate)
        case 'is_not_empty':
            return !isEmpty(candidate)
        case 'equals':
            return String(candidate) === String(expected)
        case 'not_equals':
            return String(candidate) !== String(expected)
        case 'contains':
            return String(candidate).includes(String(expected))
        case 'greater_than':
            return toNumber(candidate) > toNumber(expected)
        case 'less_than':
            return toNumber(candidate) < toNumber(expected)
        default:
            throw new Error(`Unknown filter condition: ${operator}`)
    }
}

function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined || value === '') {
        return true
    }
    return Array.isArray(value) && value.length === 0
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        throw new Error(`Cannot compare "${String(value)}" as a number`)
    }
    return parsed
}

type MatchParams = {
    candidate: unknown
    operator: string
    expected: unknown
}
