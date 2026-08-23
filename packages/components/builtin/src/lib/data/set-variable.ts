import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

export const setVariableComponent = createComponent({
    type: 'data/set-variable',
    displayName: 'Set Variable',
    description: 'Name a value so later steps can reference it',
    category: FlowComponentCategory.DATA,
    icon: 'variable',
    props: {
        name: Property.ShortText({
            displayName: 'Name',
            description: 'How later steps refer to this value',
            required: true,
        }),
        value: Property.Json({
            displayName: 'Value',
            description: 'Any value — text, number, object or list',
            required: true,
        }),
    },
    async run(context) {
        return { [String(context.input.name)]: context.input.value }
    },
})
