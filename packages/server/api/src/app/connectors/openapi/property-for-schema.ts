export const propertyForSchema = {
    render({ name, displayName, description, required, type, format, enumValues }: RenderParams): string {
        const common = `            displayName: ${JSON.stringify(displayName)},
            description: ${JSON.stringify(description)},
            required: ${required},`

        if (enumValues !== undefined && enumValues.length > 0) {
            const options = enumValues
                .map((value) => `                    { label: ${JSON.stringify(value)}, value: ${JSON.stringify(value)} },`)
                .join('\n')
            return `        ${JSON.stringify(name)}: Property.StaticDropdown({
${common}
            options: {
                options: [
${options}
                ],
            },
        }),`
        }

        return `        ${JSON.stringify(name)}: Property.${propertyKindFor({ type, format })}({
${common}
        }),`
    },
}

function propertyKindFor({ type, format }: { type: string, format?: string }): string {
    switch (type) {
        case 'integer':
        case 'number':
            return 'Number'
        case 'boolean':
            return 'Checkbox'
        case 'array':
            return 'Array'
        case 'object':
            return 'Object'
        case 'string':
            return stringKindFor(format)
        default:
            return 'ShortText'
    }
}

function stringKindFor(format: string | undefined): string {
    switch (format) {
        case 'date':
        case 'date-time':
            return 'DateTime'
        case 'password':
            return 'SecretText'
        case 'binary':
        case 'byte':
            return 'File'
        default:
            return 'ShortText'
    }
}

type RenderParams = {
    name: string
    displayName: string
    description: string
    required: boolean
    type: string
    format?: string
    enumValues?: string[]
}
