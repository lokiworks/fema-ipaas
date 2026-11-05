import { beforeAll, describe, expect, it, vi } from 'vitest'
import { recoveryCodes } from '../../../../src/app/authentication/mfa/recovery-codes'
import { encryptUtils } from '../../../../src/app/helper/encryption'

beforeAll(() => {
    vi.spyOn(encryptUtils, 'getEncryptionKey').mockResolvedValue('0123456789abcdef0123456789abcdef')
})

describe('recoveryCodes', () => {
    it('generates ten distinct codes in the xxxxx-xxxxx shape', () => {
        const codes = recoveryCodes.generate()
        expect(codes).toHaveLength(10)
        expect(new Set(codes).size).toBe(10)
        codes.forEach((code) => expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/u))
    })

    it('tells recovery codes apart from authenticator codes', () => {
        expect(recoveryCodes.looksLikeRecoveryCode({ code: 'abcde-fghjk' })).toBe(true)
        expect(recoveryCodes.looksLikeRecoveryCode({ code: 'ABCDE FGHJK' })).toBe(true)
        expect(recoveryCodes.looksLikeRecoveryCode({ code: '123456' })).toBe(false)
    })

    it('stores only hashes, and a code spends itself exactly once', async () => {
        const codes = recoveryCodes.generate()
        const stored = await recoveryCodes.hashAll({ codes })
        expect(stored.some((entry) => codes.includes(entry))).toBe(false)

        const afterFirstUse = await recoveryCodes.consume({ stored, code: codes[3].toUpperCase().replace('-', ' ') })
        expect(afterFirstUse).toHaveLength(9)
        expect(afterFirstUse).not.toContain(stored[3])

        const secondUse = await recoveryCodes.consume({ stored: afterFirstUse ?? [], code: codes[3] })
        expect(secondUse).toBeNull()
    })

    it('rejects a code that was never issued', async () => {
        const stored = await recoveryCodes.hashAll({ codes: recoveryCodes.generate() })
        expect(await recoveryCodes.consume({ stored, code: 'zzzzz-zzzzz' })).toBeNull()
    })
})
