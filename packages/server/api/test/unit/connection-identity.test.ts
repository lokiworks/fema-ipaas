import { ConnectionStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { connectionIdentityUtils } from '../../src/app/connection/connection-service/connection-identity'

describe('connectionIdentityUtils.sameAccountError', () => {
    it('allows a first-time connect', () => {
        expect(connectionIdentityUtils.sameAccountError({ existingStatus: undefined, existingIdentifier: undefined, resolvedIdentifier: 'a@x.com' })).toBeNull()
    })

    it('allows filling in a placeholder connection', () => {
        expect(connectionIdentityUtils.sameAccountError({ existingStatus: ConnectionStatus.MISSING, existingIdentifier: 'a@x.com', resolvedIdentifier: 'b@x.com' })).toBeNull()
    })

    it('allows reauthorizing as the same account regardless of case', () => {
        expect(connectionIdentityUtils.sameAccountError({ existingStatus: ConnectionStatus.EXPIRED, existingIdentifier: 'A@x.com ', resolvedIdentifier: 'a@X.com' })).toBeNull()
    })

    it('rejects reauthorizing as a different account and names both', () => {
        const message = connectionIdentityUtils.sameAccountError({ existingStatus: ConnectionStatus.EXPIRED, existingIdentifier: 'a@x.com', resolvedIdentifier: 'b@x.com' })
        expect(message).toContain('a@x.com')
        expect(message).toContain('b@x.com')
    })

    it('does not block when either side could not be resolved', () => {
        expect(connectionIdentityUtils.sameAccountError({ existingStatus: ConnectionStatus.ACTIVE, existingIdentifier: undefined, resolvedIdentifier: 'b@x.com' })).toBeNull()
        expect(connectionIdentityUtils.sameAccountError({ existingStatus: ConnectionStatus.ACTIVE, existingIdentifier: 'a@x.com', resolvedIdentifier: undefined })).toBeNull()
    })
})
