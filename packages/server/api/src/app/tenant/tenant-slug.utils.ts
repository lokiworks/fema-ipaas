import { randomBytes } from 'node:crypto'
import { SAAS_LIMITS } from '@fema-ipaas/shared'

const MIN_LENGTH = 3
const MAX_LENGTH = 40
const RANDOM_SUFFIX_LENGTH = 6
const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const RESERVED_SLUGS: readonly string[] = [
    'www',
    'api',
    'app',
    'admin',
    'operator',
    'platform',
    'static',
    'assets',
    'sso',
    'login',
    'sign-in',
    'sign-up',
    't',
    'v1',
    'mail',
    'docs',
]

function isValid({ slug }: { slug: string }): boolean {
    const withinLength = slug.length >= MIN_LENGTH && slug.length <= MAX_LENGTH
    return withinLength && SAAS_LIMITS.slugPattern.test(slug) && !RESERVED_SLUGS.includes(slug)
}

function asciiBase({ name }: { name: string }): string {
    return name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_LENGTH - RANDOM_SUFFIX_LENGTH - 1)
        .replace(/-+$/g, '')
}

function randomSuffix(): string {
    const bytes = randomBytes(RANDOM_SUFFIX_LENGTH)
    return Array.from(bytes).map((byte) => RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length]).join('')
}

function candidates({ name }: { name: string }): string[] {
    const base = asciiBase({ name })
    const readable = base.length >= MIN_LENGTH && isValid({ slug: base }) ? [base] : []
    const prefix = base.length >= 1 ? `${base}-` : 't-'
    const randomised = Array.from({ length: CANDIDATE_COUNT }, () => `${prefix}${randomSuffix()}`)
    return [...readable, ...randomised]
}

function normalise({ slug }: { slug: string }): string {
    return slug.trim().toLowerCase()
}

export const tenantSlugUtils = {
    isValid,
    asciiBase,
    candidates,
    normalise,
    reserved: RESERVED_SLUGS,
}

const CANDIDATE_COUNT = 8
