import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const jsonTransformComponent = createComponent({
    type: 'data/json-transform',
    displayName: 'JSON Transform',
    description: 'Parse, stringify or read a path out of JSON',
    category: FlowComponentCategory.DATA,
    icon: 'braces',
    props: {
        operation: Property.StaticDropdown({
            displayName: 'Operation',
            required: true,
            defaultValue: 'parse',
            options: {
                options: [
                    { label: 'Parse text into JSON', value: 'parse' },
                    { label: 'Convert to JSON text', value: 'stringify' },
                    { label: 'Read a path', value: 'get_path' },
                    { label: 'Merge two objects', value: 'merge' },
                ],
            },
        }),
        value: Property.Json({
            displayName: 'Value',
            required: true,
        }),
        path: Property.ShortText({
            displayName: 'Path',
            description: 'Dot path such as data.items.0.name — used by Read a path',
            required: false,
        }),
        second: Property.Json({
            displayName: 'Second object',
            description: 'Used by Merge; its fields win on conflict',
            required: false,
        }),
    },
    async run(context) {
        const { operation, value, path, second } = context.input
        switch (String(operation)) {
            case 'parse':
                return { result: typeof value === 'string' ? JSON.parse(value) : value }
            case 'stringify':
                return { result: JSON.stringify(value) }
            case 'get_path':
                return { result: readPath(value, String(path ?? '')) }
            case 'merge':
                return { result: { ...asRecord(value), ...asRecord(second) } }
            default:
                throw new Error(`Unknown JSON operation: ${String(operation)}`)
        }
    },
})

function readPath(value: unknown, path: string): unknown {
    if (path.trim().length === 0) {
        return value
    }
    return path.split('.').reduce<unknown>((current, segment) => {
        if (current === null || current === undefined) {
            return undefined
        }
        if (Array.isArray(current)) {
            return current[Number(segment)]
        }
        if (typeof current === 'object') {
            return Reflect.get(current, segment)
        }
        return undefined
    }, value)
}

function asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {}
    }
    return { ...value }
}
