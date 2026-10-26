import { describe, expect, it } from 'vitest'
import { blockedUntilMarker } from '../src/lib/blocked-until'
import { fixOwnerMarker } from '../src/lib/fix-owner'

describe('fixOwnerMarker', () => {
    it('replaces the owner while preserving the blocked-until marker', () => {
        const until = new Date('2030-01-01T00:00:00Z')
        const original = blockedUntilMarker.attach({ message: 'failure', until })
        const first = fixOwnerMarker.attach({ message: original, owner: 'TARGET_ADMIN' })
        const second = fixOwnerMarker.attach({ message: first, owner: 'SOURCE_DATA_OWNER' })
        expect(fixOwnerMarker.parse(second)).toBe('SOURCE_DATA_OWNER')
        expect(blockedUntilMarker.parse(second)).toEqual(until)
        expect(fixOwnerMarker.strip(second)).toBe(original)
        expect(second.match(/fix-owner/g)).toHaveLength(1)
    })

    it('accepts only known owners and uses the final marker', () => {
        expect(fixOwnerMarker.parse(null)).toBeNull()
        expect(fixOwnerMarker.parse('[fix-owner=unknown]')).toBeNull()
        expect(fixOwnerMarker.parse('[fix-owner=WAIT]\n[fix-owner=MAPPING_OWNER]')).toBe('MAPPING_OWNER')
    })
})
