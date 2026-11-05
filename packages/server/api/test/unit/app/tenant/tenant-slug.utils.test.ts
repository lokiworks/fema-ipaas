import { describe, expect, it } from 'vitest'
import { tenantSlugUtils } from '../../../../src/app/tenant/tenant-slug.utils'

describe('tenant slug utils', () => {
    it('accepts lowercase letters, digits and inner hyphens', () => {
        expect(tenantSlugUtils.isValid({ slug: 'acme' })).toBe(true)
        expect(tenantSlugUtils.isValid({ slug: 'acme-hr-2' })).toBe(true)
    })

    it('rejects slugs that are too short, too long, malformed or reserved', () => {
        expect(tenantSlugUtils.isValid({ slug: 'ab' })).toBe(false)
        expect(tenantSlugUtils.isValid({ slug: 'a'.repeat(41) })).toBe(false)
        expect(tenantSlugUtils.isValid({ slug: '-acme' })).toBe(false)
        expect(tenantSlugUtils.isValid({ slug: 'acme-' })).toBe(false)
        expect(tenantSlugUtils.isValid({ slug: 'Acme' })).toBe(false)
        expect(tenantSlugUtils.isValid({ slug: 'api' })).toBe(false)
        expect(tenantSlugUtils.isValid({ slug: 'operator' })).toBe(false)
    })

    it('derives an ascii base from the tenant name', () => {
        expect(tenantSlugUtils.asciiBase({ name: 'Acme Corp.' })).toBe('acme-corp')
        expect(tenantSlugUtils.asciiBase({ name: '  --Hello__World--  ' })).toBe('hello-world')
    })

    it('has no ascii base for a name that is entirely Chinese', () => {
        expect(tenantSlugUtils.asciiBase({ name: '北森科技' })).toBe('')
    })

    it('offers the readable slug first and random fallbacks that are all valid', () => {
        const candidates = tenantSlugUtils.candidates({ name: 'Acme Corp' })

        expect(candidates[0]).toBe('acme-corp')
        expect(candidates.length).toBeGreaterThan(2)
        expect(candidates.every((candidate) => tenantSlugUtils.isValid({ slug: candidate }))).toBe(true)
        expect(new Set(candidates).size).toBe(candidates.length)
    })

    it('falls back to random slugs when the name has nothing usable', () => {
        const candidates = tenantSlugUtils.candidates({ name: '北森科技' })

        expect(candidates.every((candidate) => candidate.startsWith('t-'))).toBe(true)
        expect(candidates.every((candidate) => tenantSlugUtils.isValid({ slug: candidate }))).toBe(true)
    })

    it('does not offer a reserved word as the readable slug', () => {
        const candidates = tenantSlugUtils.candidates({ name: 'API' })

        expect(candidates).not.toContain('api')
        expect(candidates.every((candidate) => tenantSlugUtils.isValid({ slug: candidate }))).toBe(true)
    })

    it('normalises case and surrounding whitespace', () => {
        expect(tenantSlugUtils.normalise({ slug: '  AcMe ' })).toBe('acme')
    })
})
