import { WorkflowActionType, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { migrateV22AgentStepToThinClient } from '../../../../../src/app/workflows/workflow-version/migrations/migrate-v22-agent-step-to-thin-client'

function workflowWith(input: Record<string, unknown>, connectorVersion = '0.5.0'): WorkflowVersion {
    return {
        schemaVersion: '22',
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.EMPTY,
            settings: {},
            valid: true,
            displayName: 'Trigger',
            nextAction: {
                name: 'step_1',
                type: WorkflowActionType.CONNECTOR,
                displayName: 'Run Agent',
                valid: true,
                settings: { connectorName: '@fema-ipaas/connector-ai', connectorVersion, actionName: 'run_agent', input },
            },
        },
    } as unknown as WorkflowVersion
}

function agentStep(migrated: WorkflowVersion) {
    const step = (migrated.trigger as unknown as { nextAction: { settings: { connectorVersion: string, input: Record<string, unknown> } } }).nextAction
    return step.settings
}

describe('migrateV22AgentStepToThinClient', () => {
    it('moves the pinned connection to an id and the step to the thin client together', async () => {
        const migrated = await migrateV22AgentStepToThinClient.migrate(workflowWith({
            prompt: 'do a thing',
            agentTools: [{ type: 'CONNECTOR', toolName: 'send', connectorMetadata: { connectorName: '@fema-ipaas/connector-gmail', predefinedInput: { auth: '{{connections[\'my-gmail\']}}' } } }],
        }))

        const settings = agentStep(migrated)
        expect(settings.connectorVersion).toBe('0.6.0')
        expect(settings.input.agentTools).toEqual([
            expect.objectContaining({ connectorMetadata: expect.objectContaining({ predefinedInput: { auth: 'my-gmail' } }) }),
        ])
        expect(migrated.schemaVersion).toBe('23')
    })

    it('never rewrites a connection without also moving the version, since the old path cannot read an id', async () => {
        const migrated = await migrateV22AgentStepToThinClient.migrate(workflowWith({
            prompt: 'do a thing',
            agentTools: [{ type: 'CONNECTOR', toolName: 'send', connectorMetadata: { predefinedInput: { auth: '{{connections[\'my-gmail\']}}' } } }],
        }))

        const settings = agentStep(migrated)
        const auth = (settings.input.agentTools as Array<{ connectorMetadata: { predefinedInput: { auth: string } } }>)[0].connectorMetadata.predefinedInput.auth
        expect(auth === 'my-gmail' && settings.connectorVersion === '0.6.0').toBe(true)
    })

    it('gives a step with no max steps the default the prop carries', async () => {
        const migrated = await migrateV22AgentStepToThinClient.migrate(workflowWith({ prompt: 'do a thing' }))

        expect(agentStep(migrated).input.maxSteps).toBe(20)
    })

    it('keeps a max steps the author already chose', async () => {
        const migrated = await migrateV22AgentStepToThinClient.migrate(workflowWith({ prompt: 'do a thing', maxSteps: 75 }))

        expect(agentStep(migrated).input.maxSteps).toBe(75)
    })

    it('leaves an already-migrated connection alone', async () => {
        const migrated = await migrateV22AgentStepToThinClient.migrate(workflowWith({
            agentTools: [{ type: 'CONNECTOR', connectorMetadata: { predefinedInput: { auth: 'already-an-id' } } }],
        }))

        const auth = (agentStep(migrated).input.agentTools as Array<{ connectorMetadata: { predefinedInput: { auth: string } } }>)[0].connectorMetadata.predefinedInput.auth
        expect(auth).toBe('already-an-id')
    })

    it('does not touch a step that is not the agent', async () => {
        const workflow = workflowWith({ prompt: 'x' })
        const notAgent = JSON.parse(JSON.stringify(workflow))
        notAgent.trigger.nextAction.settings.connectorName = '@fema-ipaas/connector-gmail'

        const migrated = await migrateV22AgentStepToThinClient.migrate(notAgent)

        expect(agentStep(migrated).connectorVersion).toBe('0.5.0')
    })
})
