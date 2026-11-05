import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { isNil, tryCatchSync } from '@fema-ipaas/core-utils'
import { CaptchaChallenge, CaptchaSolution } from '@fema-ipaas/shared'

function deriveKey({ secret }: DeriveKeyParams): string {
    return createHmac('sha256', secret).update(KEY_PURPOSE).digest('hex')
}

function createChallenge({ key, nowSeconds, ttlSeconds, maxNumber }: CreateChallengeParams): CaptchaChallenge {
    const salt = `${randomBytes(12).toString('hex')}?expires=${nowSeconds + ttlSeconds}`
    const number = randomInt(0, maxNumber + 1)
    const challenge = sha256Hex(`${salt}${number}`)
    return {
        algorithm: 'SHA-256',
        challenge,
        salt,
        maxNumber,
        signature: sign({ key, salt, challenge }),
    }
}

function solve({ challenge }: SolveParams): CaptchaSolution | null {
    for (let number = 0; number <= challenge.maxNumber; number++) {
        if (sha256Hex(`${challenge.salt}${number}`) === challenge.challenge) {
            return {
                algorithm: 'SHA-256',
                challenge: challenge.challenge,
                salt: challenge.salt,
                number,
                signature: challenge.signature,
            }
        }
    }
    return null
}

function encodeSolution({ solution }: EncodeSolutionParams): string {
    return Buffer.from(JSON.stringify(solution), 'utf8').toString('base64url')
}

function decodeSolution({ token }: DecodeSolutionParams): CaptchaSolution | null {
    const { data: json, error } = tryCatchSync(() => JSON.parse(Buffer.from(token, 'base64url').toString('utf8')))
    if (!isNil(error)) {
        return null
    }
    const parsed = CaptchaSolution.safeParse(json)
    return parsed.success ? parsed.data : null
}

function verifySolution({ key, solution, nowSeconds, maxNumber }: VerifySolutionParams): VerifyResult {
    const expiresAt = expiryOf({ salt: solution.salt })
    if (isNil(expiresAt)) {
        return { ok: false, reason: 'malformed' }
    }
    const expectedSignature = sign({ key, salt: solution.salt, challenge: solution.challenge })
    if (!safeEqual({ left: expectedSignature, right: solution.signature })) {
        return { ok: false, reason: 'signature' }
    }
    if (expiresAt <= nowSeconds) {
        return { ok: false, reason: 'expired' }
    }
    if (!Number.isInteger(solution.number) || solution.number < 0 || solution.number > maxNumber) {
        return { ok: false, reason: 'number' }
    }
    if (!safeEqual({ left: sha256Hex(`${solution.salt}${solution.number}`), right: solution.challenge })) {
        return { ok: false, reason: 'work' }
    }
    return { ok: true, challenge: solution.challenge, expiresAt }
}

function expiryOf({ salt }: ExpiryOfParams): number | null {
    const match = EXPIRY_PATTERN.exec(salt)
    if (isNil(match)) {
        return null
    }
    return Number.parseInt(match[1], 10)
}

function sign({ key, salt, challenge }: SignParams): string {
    return createHmac('sha256', key).update(`${salt}:${challenge}`).digest('hex')
}

function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex')
}

function safeEqual({ left, right }: SafeEqualParams): boolean {
    const leftBuffer = Buffer.from(left, 'utf8')
    const rightBuffer = Buffer.from(right, 'utf8')
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const KEY_PURPOSE = 'fema-captcha-v1'
const EXPIRY_PATTERN = /\?expires=(\d{1,12})$/

export const captchaPow = {
    deriveKey,
    createChallenge,
    solve,
    encodeSolution,
    decodeSolution,
    verifySolution,
}

type DeriveKeyParams = {
    secret: string
}

type CreateChallengeParams = {
    key: string
    nowSeconds: number
    ttlSeconds: number
    maxNumber: number
}

type SolveParams = {
    challenge: CaptchaChallenge
}

type EncodeSolutionParams = {
    solution: CaptchaSolution
}

type DecodeSolutionParams = {
    token: string
}

type VerifySolutionParams = {
    key: string
    solution: CaptchaSolution
    nowSeconds: number
    maxNumber: number
}

type VerifyResult =
    | { ok: true, challenge: string, expiresAt: number }
    | { ok: false, reason: 'malformed' | 'signature' | 'expired' | 'number' | 'work' }

type ExpiryOfParams = {
    salt: string
}

type SignParams = {
    key: string
    salt: string
    challenge: string
}

type SafeEqualParams = {
    left: string
    right: string
}
