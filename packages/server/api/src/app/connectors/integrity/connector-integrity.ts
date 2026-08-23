import { createHash, createVerify } from 'node:crypto'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

const SIGNATURE_ALGORITHM = 'RSA-SHA256'

export const connectorIntegrity = {
    checksumOf(archive: Buffer): string {
        return createHash('sha256').update(archive).digest('hex')
    },

    assertChecksumMatches({ archive, expected }: AssertChecksumParams): string {
        const actual = connectorIntegrity.checksumOf(archive)
        if (!isNil(expected) && expected !== actual) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Connector archive checksum mismatch: expected ${expected}, got ${actual}`,
                },
            })
        }
        return actual
    },

    signingKeys(): string[] {
        const raw = system.get(AppSystemProp.CONNECTOR_SIGNING_KEYS)
        if (isNil(raw) || raw.trim().length === 0) {
            return []
        }
        return raw
            .split(',')
            .map((key) => key.trim().replace(/\\n/g, '\n'))
            .filter((key) => key.length > 0)
    },

    signatureRequired(): boolean {
        return connectorIntegrity.signingKeys().length > 0
    },

    assertSignatureValid({ archive, signature }: AssertSignatureParams): void {
        const keys = connectorIntegrity.signingKeys()
        if (keys.length === 0) {
            return
        }
        if (isNil(signature) || signature.trim().length === 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'This instance requires connector packages to be signed, but no signature was supplied',
                },
            })
        }
        const accepted = keys.some((key) => verifyWith({ archive, signature, publicKey: key }))
        if (!accepted) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Connector signature does not match any configured signing key',
                },
            })
        }
    },
}

function verifyWith({ archive, signature, publicKey }: VerifyWithParams): boolean {
    try {
        const verifier = createVerify(SIGNATURE_ALGORITHM)
        verifier.update(archive)
        verifier.end()
        return verifier.verify(publicKey, Buffer.from(signature, 'base64'))
    }
    catch {
        return false
    }
}

type AssertChecksumParams = {
    archive: Buffer
    expected?: string
}

type AssertSignatureParams = {
    archive: Buffer
    signature?: string
}

type VerifyWithParams = {
    archive: Buffer
    signature: string
    publicKey: string
}
