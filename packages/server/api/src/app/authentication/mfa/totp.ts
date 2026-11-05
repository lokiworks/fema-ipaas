import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function generateSecret(): string {
    return base32Encode({ bytes: randomBytes(SECRET_BYTES) })
}

function codeAtStep({ secret, step }: CodeAtStepParams): string {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(step))
    const digest = createHmac('sha1', base32Decode({ value: secret })).update(counter).digest()
    const offset = digest[digest.length - 1] & 0x0f
    const binary = ((digest[offset] & 0x7f) << 24)
        | (digest[offset + 1] << 16)
        | (digest[offset + 2] << 8)
        | digest[offset + 3]
    return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

function stepAt({ nowMs }: StepAtParams): number {
    return Math.floor(nowMs / 1000 / PERIOD_SECONDS)
}

function matchStep({ secret, code, nowMs }: MatchStepParams): number | null {
    if (!CODE_PATTERN.test(code)) {
        return null
    }
    const current = stepAt({ nowMs })
    for (const drift of ALLOWED_DRIFT) {
        const step = current + drift
        if (step >= 0 && codesEqual({ left: codeAtStep({ secret, step }), right: code })) {
            return step
        }
    }
    return null
}

function buildOtpauthUrl({ issuer, account, secret }: BuildOtpauthUrlParams): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
    const query = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(DIGITS),
        period: String(PERIOD_SECONDS),
    })
    return `otpauth://totp/${label}?${query.toString()}`
}

function base32Encode({ bytes }: Base32EncodeParams): string {
    let bits = 0
    let accumulator = 0
    let output = ''
    for (const byte of bytes) {
        accumulator = (accumulator << 8) | byte
        bits += 8
        while (bits >= 5) {
            output += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31]
            bits -= 5
        }
        accumulator &= (1 << bits) - 1
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31]
    }
    return output
}

function base32Decode({ value }: Base32DecodeParams): Buffer {
    const cleaned = value.replace(/=+$/u, '').replace(/\s+/gu, '').toUpperCase()
    const bytes: number[] = []
    let bits = 0
    let accumulator = 0
    for (const character of cleaned) {
        const index = BASE32_ALPHABET.indexOf(character)
        if (index === -1) {
            throw new Error('invalid base32 character')
        }
        accumulator = (accumulator << 5) | index
        bits += 5
        if (bits >= 8) {
            bytes.push((accumulator >>> (bits - 8)) & 0xff)
            bits -= 8
            accumulator &= (1 << bits) - 1
        }
    }
    return Buffer.from(bytes)
}

function codesEqual({ left, right }: CodesEqualParams): boolean {
    const leftBuffer = Buffer.from(left, 'utf8')
    const rightBuffer = Buffer.from(right, 'utf8')
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const SECRET_BYTES = 20
const DIGITS = 6
const PERIOD_SECONDS = 30
const ALLOWED_DRIFT = [0, -1, 1]
const CODE_PATTERN = /^\d{6}$/

export const totp = {
    generateSecret,
    codeAtStep,
    stepAt,
    matchStep,
    buildOtpauthUrl,
    base32Encode,
    base32Decode,
}

type CodeAtStepParams = {
    secret: string
    step: number
}

type StepAtParams = {
    nowMs: number
}

type MatchStepParams = {
    secret: string
    code: string
    nowMs: number
}

type BuildOtpauthUrlParams = {
    issuer: string
    account: string
    secret: string
}

type Base32EncodeParams = {
    bytes: Uint8Array
}

type Base32DecodeParams = {
    value: string
}

type CodesEqualParams = {
    left: string
    right: string
}
