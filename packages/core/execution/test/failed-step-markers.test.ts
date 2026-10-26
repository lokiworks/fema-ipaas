import { describe, expect, it } from 'vitest'
import { blockedUntilMarker, fixOwnerMarker } from '@fema-ipaas/core-utils'
import { FAILED_STEP_MESSAGE_MAX_LENGTH, truncateFailedStepMessage } from '../src/lib/execution/execution'

describe('failed step message markers', () => {
    it('preserves both machine-readable markers after truncation', () => {
        const until = new Date('2030-01-01T00:00:00Z')
        const message = fixOwnerMarker.attach({ message: blockedUntilMarker.attach({ message: 'x'.repeat(2000), until }), owner: 'SOURCE_DATA_OWNER' })
        const result = truncateFailedStepMessage({ name: 's1', displayName: 'Create', message })
        expect(result?.message?.length).toBeLessThanOrEqual(FAILED_STEP_MESSAGE_MAX_LENGTH)
        expect(fixOwnerMarker.parse(result?.message)).toBe('SOURCE_DATA_OWNER')
        expect(blockedUntilMarker.parse(result?.message)).toEqual(until)
    })
})
