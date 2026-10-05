import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'
import { secretStrength } from '../../../../src/app/helper/secret-strength'

const randomJwtSecret = randomBytes(32).toString('hex')
const randomEncryptionKey = randomBytes(16).toString('hex')

describe('secretStrength.assess', () => {
    it('accepts what tools/deploy.sh generates', () => {
        expect(secretStrength.assess({ jwtSecret: randomJwtSecret, encryptionKey: randomEncryptionKey })).toEqual([])
    })

    it('accepts secrets that are not set explicitly', () => {
        expect(secretStrength.assess({ jwtSecret: undefined, encryptionKey: undefined })).toEqual([])
    })

    it('rejects a short JWT secret', () => {
        const problems = secretStrength.assess({ jwtSecret: 'e2e-slot-1-secret', encryptionKey: randomEncryptionKey })
        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain('FEMA_JWT_SECRET must be at least 32 characters')
    })

    it('rejects the sequential key that dev scripts use', () => {
        const problems = secretStrength.assess({ jwtSecret: randomJwtSecret, encryptionKey: '0123456789abcdef0123456789abcdef' })
        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain('FEMA_ENCRYPTION_KEY looks like a placeholder')
    })

    it('rejects a single repeated character and a repeated word', () => {
        expect(secretStrength.assess({ jwtSecret: 'a'.repeat(64), encryptionKey: undefined })).toHaveLength(1)
        expect(secretStrength.assess({ jwtSecret: 'changemechangemechangemechangeme', encryptionKey: undefined })).toHaveLength(1)
        expect(secretStrength.assess({ jwtSecret: undefined, encryptionKey: 'x'.repeat(32) })).toHaveLength(1)
    })

    it('reports both secrets when both are weak', () => {
        expect(secretStrength.assess({ jwtSecret: 'secret', encryptionKey: '00000000000000000000000000000000' }).length).toBeGreaterThanOrEqual(3)
    })
})
