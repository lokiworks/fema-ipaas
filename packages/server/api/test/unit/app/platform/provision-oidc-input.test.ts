import { ProvisionOidcInput } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'

const base = { issuer: 'https://iam.example.com', clientId: 'ipaas', clientSecret: 'secret' }

describe('provision oidc input', () => {
    it('does not require a session recheck interval', () => {
        expect(ProvisionOidcInput.safeParse(base).success).toBe(true)
    })

    it('accepts an interval from 5 minutes to a day', () => {
        expect(ProvisionOidcInput.safeParse({ ...base, sessionRecheckMinutes: 5 }).success).toBe(true)
        expect(ProvisionOidcInput.safeParse({ ...base, sessionRecheckMinutes: 1440 }).success).toBe(true)
    })

    it('rejects an interval that is too short, too long or not a whole number', () => {
        expect(ProvisionOidcInput.safeParse({ ...base, sessionRecheckMinutes: 4 }).success).toBe(false)
        expect(ProvisionOidcInput.safeParse({ ...base, sessionRecheckMinutes: 1441 }).success).toBe(false)
        expect(ProvisionOidcInput.safeParse({ ...base, sessionRecheckMinutes: 10.5 }).success).toBe(false)
    })
})
