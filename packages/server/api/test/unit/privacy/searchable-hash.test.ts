import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IdentifierKind, searchableHash } from '../../../src/app/helper/searchable-hash'

const SECRET = '0123456789abcdef0123456789abcdef'
const OTHER_SECRET = 'fedcba9876543210fedcba9876543210'
const PHONE = '13912345678'

describe('searchableHash.digest', () => {
    it('is stable for the same key and value, and always 64 hex characters', () => {
        const first = searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        const second = searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        expect(first).toBe(second)
        expect(first).toMatch(/^[0-9a-f]{64}$/)
    })

    it('does not contain the plain value or any readable part of it', () => {
        const hash = searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        expect(hash).not.toContain(PHONE)
        expect(hash).not.toContain(PHONE.slice(0, 7))
        expect(hash).not.toContain(PHONE.slice(-6))
    })

    it('gives a different hash under a different key, so a leaked table is useless without the key', () => {
        const left = searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        const right = searchableHash.digest({ secret: OTHER_SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        expect(left).not.toBe(right)
    })

    it('keeps the identifier kinds apart: the same text as a phone, an email and a key hashes differently', () => {
        const hashes = [IdentifierKind.PHONE, IdentifierKind.EMAIL, IdentifierKind.KEY].map((kind) => searchableHash.digest({ secret: SECRET, kind, value: PHONE }))
        expect(new Set(hashes).size).toBe(3)
    })

    it('cannot be reversed by guessing candidates without the key: a full mobile-number dictionary attack finds nothing', () => {
        const stored = searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        const dictionary = Array.from({ length: 10_000 }, (_, index) => `1391234${String(index).padStart(4, '0')}`)
        expect(dictionary).toContain(PHONE)
        const plainSha = dictionary.filter((candidate) => createHash('sha256').update(candidate).digest('hex') === stored)
        const plainShaWithKind = dictionary.filter((candidate) => createHash('sha256').update(`${IdentifierKind.PHONE}\u0000${candidate}`).digest('hex') === stored)
        const plainHmacWithRawKey = dictionary.filter((candidate) => createHmac('sha256', SECRET).update(`${IdentifierKind.PHONE}\u0000${candidate}`).digest('hex') === stored)
        const wrongKey = dictionary.filter((candidate) => searchableHash.digest({ secret: OTHER_SECRET, kind: IdentifierKind.PHONE, value: candidate }) === stored)
        expect([plainSha, plainShaWithKind, plainHmacWithRawKey, wrongKey].map((found) => found.length)).toEqual([0, 0, 0, 0])
    })

    it('is only as safe as the key: the same dictionary does recover the number once the key is known', () => {
        const stored = searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: PHONE })
        const dictionary = Array.from({ length: 10_000 }, (_, index) => `1391234${String(index).padStart(4, '0')}`)
        const recovered = dictionary.filter((candidate) => searchableHash.digest({ secret: SECRET, kind: IdentifierKind.PHONE, value: candidate }) === stored)
        expect(recovered).toEqual([PHONE])
    })
})

describe('searchableHash.normalize', () => {
    it('treats every way of writing a mobile number as the same number', () => {
        const writings = ['13912345678', '139 1234 5678', '139-1234-5678', '+8613912345678', '0086 139-1234-5678', ' 13912345678 ']
        expect(new Set(writings.map((value) => searchableHash.normalize({ kind: IdentifierKind.PHONE, value })))).toEqual(new Set([PHONE]))
    })

    it('rejects things that are not mobile numbers and emails', () => {
        expect(searchableHash.normalize({ kind: IdentifierKind.PHONE, value: '12345678901' })).toBeNull()
        expect(searchableHash.normalize({ kind: IdentifierKind.PHONE, value: '1391234567' })).toBeNull()
        expect(searchableHash.normalize({ kind: IdentifierKind.EMAIL, value: 'not-an-email' })).toBeNull()
        expect(searchableHash.normalize({ kind: IdentifierKind.KEY, value: '   ' })).toBeNull()
    })

    it('ignores case for emails and business keys', () => {
        expect(searchableHash.normalize({ kind: IdentifierKind.EMAIL, value: 'Wang.Lei@Example.COM' })).toBe('wang.lei@example.com')
        expect(searchableHash.normalize({ kind: IdentifierKind.KEY, value: 'XH20260918' })).toBe('xh20260918')
    })
})

describe('searchableHash.identifiersOfRun', () => {
    const steps = {
        trigger: { output: { body: { mobile: '139 1234 5678', contacts: [{ phone: '+8613812340001' }], email: 'Wang.Lei@example.com', note: 'order 13912345678901 is not a phone' } } },
        step_1: { input: { phone: '13912345678' } },
    }

    it('collects the business key, each distinct mobile number and email once, in their normalised form', () => {
        const identifiers = searchableHash.identifiersOfRun({ steps, businessKey: 'XH1' })
        const normalised = identifiers.map((identifier) => `${identifier.kind}:${searchableHash.normalize(identifier)}`).sort()
        expect(normalised).toEqual(['email:wang.lei@example.com', 'key:xh1', 'phone:13812340001', 'phone:13912345678'])
    })

    it('does not pick a mobile number out of the middle of a longer number', () => {
        const identifiers = searchableHash.identifiersOfRun({ steps: { a: '13912345678901' }, businessKey: null })
        expect(identifiers).toEqual([])
    })

    it('stops at a fixed number of identifiers so one huge run cannot bloat the row', () => {
        const many = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`k${index}`, `1391${String(index).padStart(7, '0')}`]))
        expect(searchableHash.identifiersOfRun({ steps: many, businessKey: null }).length).toBe(200)
    })
})
