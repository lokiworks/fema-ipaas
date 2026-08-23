import { createSign, generateKeyPairSync } from 'node:crypto'
import { ApplicationError } from '@fema-ipaas/core-utils'
import { connectorIntegrity } from '../../../../src/app/connectors/integrity/connector-integrity'

function reasonOf(run: () => void): string {
    try {
        run()
    }
    catch (error) {
        if (error instanceof ApplicationError && 'message' in error.error.params) {
            return String(error.error.params.message)
        }
        return String(error)
    }
    throw new Error('expected the call to throw, but it returned')
}

const ARCHIVE = Buffer.from('connector-archive-contents')
const TAMPERED = Buffer.from('connector-archive-contents-tampered')

function keyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    return {
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKey,
    }
}

function sign(archive: Buffer, privateKey: ReturnType<typeof keyPair>['privateKey']): string {
    const signer = createSign('RSA-SHA256')
    signer.update(archive)
    signer.end()
    return signer.sign(privateKey).toString('base64')
}

const trusted = keyPair()
const untrusted = keyPair()

function withKeys(keys: string[], run: () => void): void {
    if (keys.length === 0) {
        delete process.env.FEMA_CONNECTOR_SIGNING_KEYS
    }
    else {
        process.env.FEMA_CONNECTOR_SIGNING_KEYS = keys.map((key) => key.replace(/\n/g, '\\n')).join(',')
    }
    try {
        run()
    }
    finally {
        delete process.env.FEMA_CONNECTOR_SIGNING_KEYS
    }
}

describe('connectorIntegrity checksums', () => {
    it('returns the archive hash when no checksum is declared', () => {
        expect(connectorIntegrity.assertChecksumMatches({ archive: ARCHIVE }))
            .toBe(connectorIntegrity.checksumOf(ARCHIVE))
    })

    it('accepts a matching declared checksum', () => {
        const checksum = connectorIntegrity.checksumOf(ARCHIVE)
        expect(connectorIntegrity.assertChecksumMatches({ archive: ARCHIVE, expected: checksum })).toBe(checksum)
    })

    it('rejects a checksum that does not match the bytes', () => {
        const checksum = connectorIntegrity.checksumOf(ARCHIVE)
        expect(reasonOf(() => connectorIntegrity.assertChecksumMatches({ archive: TAMPERED, expected: checksum })))
            .toMatch(/checksum mismatch/)
    })
})

describe('connectorIntegrity signatures', () => {
    it('does not require a signature when no signing key is configured', () => {
        withKeys([], () => {
            expect(connectorIntegrity.signatureRequired()).toBe(false)
            expect(() => connectorIntegrity.assertSignatureValid({ archive: ARCHIVE })).not.toThrow()
        })
    })

    it('requires a signature once a signing key is configured', () => {
        withKeys([trusted.publicKey], () => {
            expect(connectorIntegrity.signatureRequired()).toBe(true)
            expect(reasonOf(() => connectorIntegrity.assertSignatureValid({ archive: ARCHIVE })))
                .toMatch(/requires connector packages to be signed/)
        })
    })

    it('accepts a signature made by a trusted key', () => {
        withKeys([trusted.publicKey], () => {
            expect(() => connectorIntegrity.assertSignatureValid({
                archive: ARCHIVE,
                signature: sign(ARCHIVE, trusted.privateKey),
            })).not.toThrow()
        })
    })

    it('rejects a signature made by an untrusted key', () => {
        withKeys([trusted.publicKey], () => {
            expect(reasonOf(() => connectorIntegrity.assertSignatureValid({
                archive: ARCHIVE,
                signature: sign(ARCHIVE, untrusted.privateKey),
            }))).toMatch(/does not match any configured signing key/)
        })
    })

    it('rejects a valid signature over different bytes', () => {
        withKeys([trusted.publicKey], () => {
            expect(reasonOf(() => connectorIntegrity.assertSignatureValid({
                archive: TAMPERED,
                signature: sign(ARCHIVE, trusted.privateKey),
            }))).toMatch(/does not match any configured signing key/)
        })
    })

    it('accepts a signature from any one of several trusted keys', () => {
        withKeys([untrusted.publicKey, trusted.publicKey], () => {
            expect(() => connectorIntegrity.assertSignatureValid({
                archive: ARCHIVE,
                signature: sign(ARCHIVE, trusted.privateKey),
            })).not.toThrow()
        })
    })

    it('treats a malformed key as untrusted rather than crashing', () => {
        withKeys(['-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----'], () => {
            expect(reasonOf(() => connectorIntegrity.assertSignatureValid({
                archive: ARCHIVE,
                signature: sign(ARCHIVE, trusted.privateKey),
            }))).toMatch(/does not match any configured signing key/)
        })
    })
})
