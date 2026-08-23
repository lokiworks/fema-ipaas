import { z } from 'zod'
import { STEP_NAME_REGEX } from '@fema-ipaas/core-utils'
import { VersionType } from '@fema-ipaas/connector-types'
import { CodeActionSettings, LoopOnItemsActionSettings, ConnectorActionSettings, RouterActionSettings } from '../actions/action'
import { PropertySettings } from '../properties'
import { SampleDataSetting } from '../sample-data'

export const AUTHENTICATION_PROPERTY_NAME = 'auth'


const connectorTriggerSettingsFields = {
    sampleData: SampleDataSetting.optional(),
    propertySettings: z.record(z.string(), PropertySettings),
    customLogoUrl: z.string().optional(),
    connectorName: z.string(),
    connectorVersion: VersionType,
    triggerName: z.string().optional(),
    input: z.record(z.string(), z.any()),
}

export const ConnectorTriggerSettings = z.object({
    ...connectorTriggerSettingsFields,
})

export type ConnectorTriggerSettings = z.infer<typeof ConnectorTriggerSettings>


export enum WorkflowTriggerType {
    EMPTY = 'EMPTY',
    CONNECTOR = 'CONNECTOR_TRIGGER',
}

const commonProps = {
    name: z.string().regex(STEP_NAME_REGEX),
    valid: z.boolean(),
    displayName: z.string(),
    nextAction: z.any().optional(),
    lastUpdatedDate: z.string(),
}


export const EmptyTrigger = z.object({
    ...commonProps,
    type: z.literal(WorkflowTriggerType.EMPTY),
    settings: z.any(),
})

export type EmptyTrigger = z.infer<typeof EmptyTrigger>


export const ConnectorTrigger = z.object({
    ...commonProps,
    type: z.literal(WorkflowTriggerType.CONNECTOR),
    settings: ConnectorTriggerSettings,
})

export type ConnectorTrigger = z.infer<typeof ConnectorTrigger>

export const WorkflowTrigger = z.union([
    ConnectorTrigger,
    EmptyTrigger,
])

export type WorkflowTrigger = z.infer<typeof WorkflowTrigger>


export type StepSettings =
  | CodeActionSettings
  | ConnectorActionSettings
  | ConnectorTriggerSettings
  | RouterActionSettings
  | LoopOnItemsActionSettings
