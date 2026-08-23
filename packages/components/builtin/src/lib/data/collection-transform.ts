import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const collectionTransformComponent = createComponent({
    type: 'data/collection-transform',
    displayName: 'Collection Transform',
    description: 'Reshape a list — pick a field, sort, deduplicate, slice, aggregate',
    category: FlowComponentCategory.DATA,
    icon: 'list',
    props: {
        operation: Property.StaticDropdown({
            displayName: 'Operation',
            required: true,
            defaultValue: 'pluck',
            options: {
                options: [
                    { label: 'Pick a field from each item', value: 'pluck' },
                    { label: 'Sort', value: 'sort' },
                    { label: 'Remove duplicates', value: 'unique' },
                    { label: 'Take the first N', value: 'take' },
                    { label: 'Group by a field', value: 'group_by' },
                    { label: 'Count', value: 'count' },
                    { label: 'Sum a field', value: 'sum' },
                    { label: 'Join into text', value: 'join' },
                ],
            },
        }),
        items: Property.Json({
            displayName: 'Items',
            required: true,
        }),
        field: Property.ShortText({
            displayName: 'Field',
            description: 'Property to pick, sort, group or sum by',
            required: false,
        }),
        limit: Property.Number({
            displayName: 'Count',
            description: 'Used by Take the first N',
            required: false,
        }),
        separator: Property.ShortText({
            displayName: 'Separator',
            description: 'Used by Join into text',
            required: false,
        }),
        descending: Property.Checkbox({
            displayName: 'Descending',
            description: 'Used by Sort',
            required: false,
        }),
    },
    async run(context) {
        const items = context.input.items
        if (!Array.isArray(items)) {
            throw new Error('Items must be a list')
        }
        const field = typeof context.input.field === 'string' && context.input.field.length > 0
            ? context.input.field
            : undefined

        switch (String(context.input.operation)) {
            case 'pluck':
                return { result: items.map((item) => fieldOf(item, field)) }
            case 'sort':
                return { result: sorted(items, field, context.input.descending === true) }
            case 'unique':
                return { result: unique(items, field) }
            case 'take':
                return { result: items.slice(0, Math.max(0, Number(context.input.limit ?? items.length))) }
            case 'group_by':
                return { result: groupBy(items, field) }
            case 'count':
                return { result: items.length }
            case 'sum':
                return { result: items.reduce((total: number, item) => total + numberOf(fieldOf(item, field)), 0) }
            case 'join':
                return { result: items.map((item) => String(fieldOf(item, field))).join(String(context.input.separator ?? ', ')) }
            default:
                throw new Error(`Unknown collection operation: ${String(context.input.operation)}`)
        }
    },
})

function fieldOf(item: unknown, field: string | undefined): unknown {
    if (field === undefined) {
        return item
    }
    if (typeof item !== 'object' || item === null) {
        return undefined
    }
    return Reflect.get(item, field)
}

function sorted(items: unknown[], field: string | undefined, descending: boolean): unknown[] {
    const copy = [...items]
    copy.sort((left, right) => compare(fieldOf(left, field), fieldOf(right, field)))
    return descending ? copy.reverse() : copy
}

function compare(left: unknown, right: unknown): number {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber
    }
    return String(left).localeCompare(String(right))
}

function unique(items: unknown[], field: string | undefined): unknown[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        const key = JSON.stringify(fieldOf(item, field)) ?? 'undefined'
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

function groupBy(items: unknown[], field: string | undefined): Record<string, unknown[]> {
    const groups: Record<string, unknown[]> = {}
    for (const item of items) {
        const key = String(fieldOf(item, field))
        groups[key] = [...(groups[key] ?? []), item]
    }
    return groups
}

function numberOf(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}
