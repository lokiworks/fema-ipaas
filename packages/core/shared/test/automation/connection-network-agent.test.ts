import { describe, expect, it } from 'vitest'
import { ConnectionType, UpdateConnectionValueRequestBody, UpsertConnectionRequestBody } from '../../src/index'

const secretTextRequest = (extra: Record<string, unknown>) => ({
    externalId: 'erp',
    displayName: 'ERP',
    connectorName: '@fema-ipaas/connector-http',
    workspaceId: 'workspace-1',
    type: ConnectionType.SECRET_TEXT,
    value: { type: ConnectionType.SECRET_TEXT, secret_text: 'token' },
    ...extra,
})

describe('binding a connection to a network agent', () => {
    it('accepts an agent id on create', () => {
        const parsed = UpsertConnectionRequestBody.parse(secretTextRequest({ networkAgentId: 'agent-1' }))
        expect(parsed.networkAgentId).toBe('agent-1')
    })

    it('accepts null to go back to reaching the system directly', () => {
        const parsed = UpdateConnectionValueRequestBody.parse({ displayName: 'ERP', networkAgentId: null })
        expect(parsed.networkAgentId).toBeNull()
    })

    it('leaves the binding untouched when the field is absent', () => {
        const parsed = UpsertConnectionRequestBody.parse(secretTextRequest({}))
        expect(parsed.networkAgentId).toBeUndefined()
    })
})
