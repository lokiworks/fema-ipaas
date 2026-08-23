import { EncryptedObject, encryptUtils } from '../../../../src/app/helper/encryption'

const CURRENT_KEY = '0123456789abcdef0123456789abcdef'
const RETIRED_KEY = 'fedcba9876543210fedcba9876543210'
const UNRELATED_KEY = 'aaaabbbbccccddddaaaabbbbccccdddd'

function useKeys({ current, retired }: { current: string, retired?: string }) {
    process.env.FEMA_ENCRYPTION_KEY = current
    if (retired === undefined) {
        delete process.env.FEMA_RETIRED_ENCRYPTION_KEYS
    }
    else {
        process.env.FEMA_RETIRED_ENCRYPTION_KEYS = retired
    }
}

describe('encryptUtils', () => {
    afterEach(() => {
        delete process.env.FEMA_ENCRYPTION_KEY
        delete process.env.FEMA_RETIRED_ENCRYPTION_KEYS
    })

    it('round-trips an object and stamps the key id', async () => {
        useKeys({ current: CURRENT_KEY })
        const encrypted = await encryptUtils.encryptObject({ token: 'secret-value' })
        expect(encrypted.keyId).toBeDefined()
        expect(encrypted.data).not.toContain('secret-value')
        await expect(encryptUtils.decryptObject(encrypted)).resolves.toEqual({ token: 'secret-value' })
    })

    it('decrypts data written by a key that has since been retired', async () => {
        useKeys({ current: RETIRED_KEY })
        const encrypted = await encryptUtils.encryptObject({ token: 'written-before-rotation' })

        useKeys({ current: CURRENT_KEY, retired: RETIRED_KEY })
        await expect(encryptUtils.decryptObject(encrypted)).resolves.toEqual({ token: 'written-before-rotation' })
    })

    it('decrypts legacy payloads that carry no key id', async () => {
        useKeys({ current: RETIRED_KEY })
        const { keyId, ...legacy } = await encryptUtils.encryptObject({ token: 'legacy' })
        expect(keyId).toBeDefined()

        useKeys({ current: CURRENT_KEY, retired: RETIRED_KEY })
        await expect(encryptUtils.decryptObject(legacy as EncryptedObject)).resolves.toEqual({ token: 'legacy' })
    })

    it('fails loudly when no configured key can decrypt', async () => {
        useKeys({ current: RETIRED_KEY })
        const encrypted = await encryptUtils.encryptObject({ token: 'unreachable' })

        useKeys({ current: UNRELATED_KEY })
        await expect(encryptUtils.decryptObject(encrypted)).rejects.toThrow()
    })

    it('reports whether a payload already uses the current key', async () => {
        useKeys({ current: RETIRED_KEY })
        const stale = await encryptUtils.encryptObject({ token: 'stale' })

        useKeys({ current: CURRENT_KEY, retired: RETIRED_KEY })
        expect(await encryptUtils.isEncryptedWithCurrentKey(stale)).toBe(false)

        const fresh = await encryptUtils.encryptObject({ token: 'fresh' })
        expect(await encryptUtils.isEncryptedWithCurrentKey(fresh)).toBe(true)
    })

    it('ignores blank entries in the retired key list', async () => {
        useKeys({ current: CURRENT_KEY, retired: `  ${RETIRED_KEY} , , ` })
        expect(encryptUtils.getRetiredEncryptionKeys()).toEqual([RETIRED_KEY])
    })
})
