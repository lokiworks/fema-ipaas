import { describe, expect, it } from 'vitest'
import { tenantLimitsUtils } from '../../../../src/app/tenant/tenant-limits.utils'

const NO_LIMITS = { usersLimit: null, projectsLimit: null, activeWorkflowsLimit: null, concurrentExecutionsLimit: null, workerGroupId: null }

describe('tenant limits utils', () => {
    it('treats a missing limit on one side as unlimited on that side', () => {
        expect(tenantLimitsUtils.stricter({ first: null, second: null })).toBeNull()
        expect(tenantLimitsUtils.stricter({ first: 5, second: null })).toBe(5)
        expect(tenantLimitsUtils.stricter({ first: undefined, second: 7 })).toBe(7)
    })

    it('takes the stricter of the tenant limit and the instance limit', () => {
        expect(tenantLimitsUtils.stricter({ first: 5, second: 3 })).toBe(3)
        expect(tenantLimitsUtils.stricter({ first: 2, second: 9 })).toBe(2)
    })

    it('resolves every limit against the instance limits', () => {
        const effective = tenantLimitsUtils.effective({
            row: { ...NO_LIMITS, usersLimit: 10, projectsLimit: 4, workerGroupId: 'gold' },
            system: { ...NO_LIMITS, usersLimit: 5, activeWorkflowsLimit: 100, concurrentExecutionsLimit: 8 },
        })

        expect(effective).toEqual({
            usersLimit: 5,
            projectsLimit: 4,
            activeWorkflowsLimit: 100,
            concurrentExecutionsLimit: 8,
            workerGroupId: 'gold',
        })
    })

    it('is reached when the current count meets the limit and never when there is no limit', () => {
        expect(tenantLimitsUtils.isReached({ limit: 3, current: 2 })).toBe(false)
        expect(tenantLimitsUtils.isReached({ limit: 3, current: 3 })).toBe(true)
        expect(tenantLimitsUtils.isReached({ limit: 0, current: 0 })).toBe(true)
        expect(tenantLimitsUtils.isReached({ limit: null, current: 1000 })).toBe(false)
    })
})
