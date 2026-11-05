import { randomInt } from 'node:crypto'
import { LOGIN_METHOD_LIMITS } from '@fema-ipaas/shared'
import { encryptUtils } from '../../helper/encryption'

function generate(): string[] {
    return Array.from({ length: LOGIN_METHOD_LIMITS.recoveryCodeCount }, () => `${randomGroup()}-${randomGroup()}`)
}

function normalize({ code }: NormalizeParams): string {
    return code.toLowerCase().replace(/[^a-z0-9]/gu, '')
}

function looksLikeRecoveryCode({ code }: NormalizeParams): boolean {
    return !/^\d{6}$/u.test(code.trim()) && normalize({ code }).length === GROUP_LENGTH * 2
}

async function hash({ code }: NormalizeParams): Promise<string> {
    return encryptUtils.hmacString(`recovery:${normalize({ code })}`)
}

async function hashAll({ codes }: HashAllParams): Promise<string[]> {
    return Promise.all(codes.map((code) => hash({ code })))
}

async function consume({ stored, code }: ConsumeParams): Promise<string[] | null> {
    const candidate = await hash({ code })
    const index = stored.findIndex((entry) => encryptUtils.digestsMatch(entry, candidate))
    if (index === -1) {
        return null
    }
    return stored.filter((_, position) => position !== index)
}

function randomGroup(): string {
    return Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const GROUP_LENGTH = 5

export const recoveryCodes = {
    generate,
    normalize,
    looksLikeRecoveryCode,
    hash,
    hashAll,
    consume,
}

type NormalizeParams = {
    code: string
}

type HashAllParams = {
    codes: string[]
}

type ConsumeParams = {
    stored: string[]
    code: string
}
