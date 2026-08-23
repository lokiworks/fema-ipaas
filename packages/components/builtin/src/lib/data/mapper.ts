import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const mapperComponent = createComponent({
    type: 'data/mapper',
    displayName: 'Mapper',
    description: 'Build a new object by naming each field and where its value comes from',
    category: FlowComponentCategory.DATA,
    icon: 'arrow-left-right',
    props: {
        mapping: Property.Object({
            displayName: 'Mapping',
            description: 'Each key becomes a field on the output; each value is the expression that fills it',
            required: true,
        }),
    },
    async run(context) {
        const mapping = context.input.mapping
        if (!isRecord(mapping)) {
            throw new Error('Mapping must be an object of field name to value')
        }
        return mapping
    },
})

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
