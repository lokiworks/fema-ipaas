import { createHmac, timingSafeEqual } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'

function sign({ rawBody, secret }: SignParams): string {
    return `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(rawBody).digest('hex')}`
}

function verify({ rawBody, header, secret }: VerifyParams): boolean {
    if (isNil(header) || !header.startsWith(SIGNATURE_PREFIX)) {
        return false
    }
    const provided = header.slice(SIGNATURE_PREFIX.length).trim()
    if (!HEX_PATTERN.test(provided)) {
        return false
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest()
    const candidate = Buffer.from(provided, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

const SIGNATURE_PREFIX = 'sha256='
const HEX_PATTERN = /^[0-9a-fA-F]{64}$/

export const federationSignature = {
    sign,
    verify,
}

type SignParams = {
    rawBody: string
    secret: string
}

type VerifyParams = {
    rawBody: string
    header: string | undefined
    secret: string
}
