import { Connector, ConnectorAuthProperty, createConnector } from '@fema-ipaas/connector-sdk'
import { ConnectorBlueprintManifest } from '@fema-ipaas/core-utils'
import { blueprintActions } from './blueprint-actions'
import { blueprintAuth } from './blueprint-auth'
import { blueprintTriggers } from './blueprint-triggers'

export const blueprintRuntime = {
    install(): void {
        Reflect.set(globalThis, BLUEPRINT_RUNTIME_GLOBAL, { build: (raw: unknown) => blueprintRuntime.build(raw) })
    },
    build(raw: unknown): Connector<ConnectorAuthProperty | undefined> {
        const manifest = ConnectorBlueprintManifest.parse(raw)
        const definition = manifest.definition
        const auth = blueprintAuth.property(definition)
        const actions = definition.operations.map((operation) => blueprintActions.build({ definition, operation, auth }))
        const devkitActions = manifest.draft
            ? [blueprintActions.authTest({ definition, auth }), ...definition.operations.map((operation) => blueprintActions.debug({ definition, operation, auth }))]
            : []
        return createConnector({
            displayName: definition.displayName,
            description: definition.description,
            logoUrl: manifest.logoUrl,
            authors: [],
            auth,
            actions: [...actions, ...devkitActions],
            triggers: definition.triggers.map((trigger) => blueprintTriggers.build({ definition, trigger, auth })),
            categories: [],
        })
    },
}

export const BLUEPRINT_RUNTIME_GLOBAL = '__femaConnectorBlueprintRuntime'
