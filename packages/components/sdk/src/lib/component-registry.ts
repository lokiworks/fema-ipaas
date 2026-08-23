import { isNil } from '@fema-ipaas/core-utils'
import { AnyFlowComponentDefinition, FlowComponentMetadata, toComponentMetadata } from './component'

export function buildComponentRegistry(components: AnyFlowComponentDefinition[]): ComponentRegistry {
    const byType = new Map<string, AnyFlowComponentDefinition>()
    for (const component of components) {
        if (byType.has(component.type)) {
            throw new Error(`Duplicate flow component type: ${component.type}`)
        }
        byType.set(component.type, component)
    }
    return {
        list: () => [...byType.values()],
        listMetadata: () => [...byType.values()].map(toComponentMetadata),
        get: (type: string) => byType.get(type) ?? null,
        getOrThrow: (type: string) => {
            const component = byType.get(type)
            if (isNil(component)) {
                throw new Error(`Flow component not found: ${type}`)
            }
            return component
        },
    }
}

export type ComponentRegistry = {
    list(): AnyFlowComponentDefinition[]
    listMetadata(): FlowComponentMetadata[]
    get(type: string): AnyFlowComponentDefinition | null
    getOrThrow(type: string): AnyFlowComponentDefinition
}
