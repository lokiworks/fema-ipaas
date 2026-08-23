import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const textTransformComponent = createComponent({
    type: 'data/text-transform',
    displayName: 'Text Transform',
    description: 'Change a piece of text — case, trim, replace, split, slug',
    category: FlowComponentCategory.DATA,
    icon: 'type',
    props: {
        operation: Property.StaticDropdown({
            displayName: 'Operation',
            required: true,
            defaultValue: 'replace',
            options: {
                options: [
                    { label: 'Replace', value: 'replace' },
                    { label: 'Split', value: 'split' },
                    { label: 'Concatenate', value: 'concat' },
                    { label: 'Trim', value: 'trim' },
                    { label: 'Upper case', value: 'upper' },
                    { label: 'Lower case', value: 'lower' },
                    { label: 'Slugify', value: 'slugify' },
                    { label: 'Default when empty', value: 'default' },
                ],
            },
        }),
        text: Property.LongText({
            displayName: 'Text',
            required: true,
        }),
        find: Property.ShortText({
            displayName: 'Find / Separator',
            description: 'What to replace, or what to split and join on',
            required: false,
        }),
        replaceWith: Property.ShortText({
            displayName: 'Replace with / Append / Fallback',
            required: false,
        }),
    },
    async run(context) {
        const text = String(context.input.text ?? '')
        const find = String(context.input.find ?? '')
        const replaceWith = String(context.input.replaceWith ?? '')
        switch (String(context.input.operation)) {
            case 'replace':
                return { result: find.length === 0 ? text : text.split(find).join(replaceWith) }
            case 'split':
                return { result: text.split(find.length === 0 ? ',' : find) }
            case 'concat':
                return { result: `${text}${replaceWith}` }
            case 'trim':
                return { result: text.trim() }
            case 'upper':
                return { result: text.toUpperCase() }
            case 'lower':
                return { result: text.toLowerCase() }
            case 'slugify':
                return { result: slugify(text) }
            case 'default':
                return { result: text.trim().length === 0 ? replaceWith : text }
            default:
                throw new Error(`Unknown text operation: ${String(context.input.operation)}`)
        }
    },
})

function slugify(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}
