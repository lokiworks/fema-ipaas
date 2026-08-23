import { InputPropertyMap, OutputSchema, StaticPropsValue } from '@fema-ipaas/connector-sdk'
import { ComponentExecutionContext } from './component-context'

export function createComponent<Props extends InputPropertyMap>(
    definition: FlowComponentDefinition<Props>,
): FlowComponentDefinition<Props> {
    return definition
}

export function toComponentMetadata(definition: AnyFlowComponentDefinition): FlowComponentMetadata {
    const { run, ...metadata } = definition
    return metadata
}

export enum FlowComponentCategory {
    CONTROL = 'CONTROL',
    DATA = 'DATA',
    RUNTIME = 'RUNTIME',
    HUMAN = 'HUMAN',
}

export type FlowComponentDefinition<Props extends InputPropertyMap = InputPropertyMap> = {
    type: string
    displayName: string
    description: string
    category: FlowComponentCategory
    icon: string
    props: Props
    outputSchema?: OutputSchema
    run(context: ComponentExecutionContext<StaticPropsValue<Props>>): Promise<unknown>
}

export type AnyFlowComponentDefinition = FlowComponentDefinition<InputPropertyMap>

export type FlowComponentMetadata = Omit<AnyFlowComponentDefinition, 'run'>
