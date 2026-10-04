import { createHmac, hkdfSync } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { encryptUtils } from './encryption'

export const searchableHash = {
    digest,
    normalize,
    extractIdentifiers,
    identifiersOfRun,
    async forStorage({ kind, value }: IdentifierInput): Promise<string | null> {
        const secret = await encryptUtils.getEncryptionKey()
        const normalized = normalize({ kind, value })
        return isNil(secret) || isNil(normalized) ? null : digest({ secret, kind, value: normalized })
    },
    async forLookup({ kind, value }: IdentifierInput): Promise<string[]> {
        const normalized = normalize({ kind, value })
        if (isNil(normalized)) {
            return []
        }
        const current = await encryptUtils.getEncryptionKey()
        const secrets = [...(isNil(current) ? [] : [current]), ...encryptUtils.getRetiredEncryptionKeys()]
        return [...new Set(secrets.map((secret) => digest({ secret, kind, value: normalized })))]
    },
    async hashesOfRun({ steps, businessKey }: { steps: unknown, businessKey: string | null | undefined }): Promise<string[]> {
        const identifiers = identifiersOfRun({ steps, businessKey })
        const hashes = await Promise.all(identifiers.map((identifier) => searchableHash.forStorage(identifier)))
        return [...new Set(hashes.filter((hash): hash is string => !isNil(hash)))]
    },
    async lookupHashes({ text }: { text: string }): Promise<string[]> {
        const trimmed = text.trim()
        const candidates: IdentifierInput[] = [
            { kind: IdentifierKind.KEY, value: trimmed },
            { kind: IdentifierKind.PHONE, value: trimmed },
            { kind: IdentifierKind.EMAIL, value: trimmed },
        ]
        const hashes = await Promise.all(candidates.map((candidate) => searchableHash.forLookup(candidate)))
        return [...new Set(hashes.flat())]
    },
}

function digest({ secret, kind, value }: { secret: string, kind: IdentifierKind, value: string }): string {
    return createHmac('sha256', subKeyOf({ secret })).update(`${kind}\u0000${value}`).digest('hex')
}

function normalize({ kind, value }: IdentifierInput): string | null {
    const trimmed = value.trim()
    switch (kind) {
        case IdentifierKind.PHONE: {
            const digits = trimmed.replace(/[\s-]/g, '').replace(/^(?:\+|00)?86(?=1\d{10}$)/, '')
            return PHONE_EXACT.test(digits) ? digits : null
        }
        case IdentifierKind.EMAIL:
            return EMAIL_EXACT.test(trimmed) ? trimmed.toLowerCase() : null
        case IdentifierKind.KEY:
            return trimmed.length === 0 || trimmed.length > MAX_KEY_LENGTH ? null : trimmed.toLowerCase()
    }
}

function extractIdentifiers({ text }: { text: string }): IdentifierInput[] {
    const phones = [...text.matchAll(PHONE_SCAN)].map((match) => ({ kind: IdentifierKind.PHONE, value: match[0] }))
    const emails = [...text.matchAll(EMAIL_SCAN)].map((match) => ({ kind: IdentifierKind.EMAIL, value: match[0] }))
    return [...phones, ...emails]
}

function identifiersOfRun({ steps, businessKey }: { steps: unknown, businessKey: string | null | undefined }): IdentifierInput[] {
    const key: IdentifierInput[] = isNil(businessKey) || businessKey.length === 0 ? [] : [{ kind: IdentifierKind.KEY, value: businessKey }]
    const fromSteps = isNil(steps) ? [] : extractIdentifiers({ text: JSON.stringify(steps) })
    const unique = new Map([...key, ...fromSteps].flatMap((identifier) => {
        const normalized = normalize(identifier)
        return isNil(normalized) ? [] : [[`${identifier.kind}:${normalized}`, identifier] as const]
    }))
    return [...unique.values()].slice(0, MAX_IDENTIFIERS_PER_RUN)
}

function subKeyOf({ secret }: { secret: string }): Buffer {
    const cached = subKeys.get(secret)
    if (!isNil(cached)) {
        return cached
    }
    const derived = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'binary'), Buffer.alloc(0), KEY_CONTEXT, KEY_LENGTH_BYTES))
    subKeys.set(secret, derived)
    return derived
}

const KEY_CONTEXT = 'fema:searchable-hash:v1'
const KEY_LENGTH_BYTES = 32
const MAX_KEY_LENGTH = 200
const MAX_IDENTIFIERS_PER_RUN = 200
const PHONE_EXACT = /^1[3-9]\d{9}$/
const EMAIL_EXACT = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const PHONE_SCAN = /(?<!\d)(?:(?:\+|00)?86[\s-]?)?(?:1[3-9]\d{9}|1[3-9]\d[\s-]\d{4}[\s-]\d{4})(?!\d)/g
const EMAIL_SCAN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g
const subKeys = new Map<string, Buffer>()

export enum IdentifierKind {
    PHONE = 'phone',
    EMAIL = 'email',
    KEY = 'key',
}

export type IdentifierInput = {
    kind: IdentifierKind
    value: string
}
