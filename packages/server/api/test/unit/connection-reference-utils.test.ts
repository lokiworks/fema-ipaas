import { describe, expect, it } from 'vitest'
import { connectionReferenceUtils } from '../../src/app/connection/connection-reference.service'

describe('connectionReferenceUtils.blockingMessage', () => {
    it('allows deleting a connection nothing refers to', () => {
        expect(connectionReferenceUtils.blockingMessage({ workflowCount: 0, mcpServiceCount: 0, environmentReplacementCount: 0 })).toBeNull()
    })

    it('blocks and names every kind of reference that is still in use', () => {
        const message = connectionReferenceUtils.blockingMessage({ workflowCount: 15, mcpServiceCount: 1, environmentReplacementCount: 2 })
        expect(message).toContain('15 workflows')
        expect(message).toContain('1 MCP services')
        expect(message).toContain('2 environment connection replacements')
    })

    it('blocks on an environment replacement alone', () => {
        expect(connectionReferenceUtils.blockingMessage({ workflowCount: 0, mcpServiceCount: 0, environmentReplacementCount: 1 })).not.toBeNull()
    })
})
