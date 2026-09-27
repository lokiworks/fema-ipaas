import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { RunQuotaScope, runQuotaUtils } from '../../../../src/app/limits/run-quota-utils'

describe('runQuotaUtils.decide', () => {
    it('allows runs below both limits', () => {
        expect(runQuotaUtils.decide({ projectUsed: 10, projectLimit: 100, instanceUsed: 10, instanceLimit: 1000 })).toEqual({ allowed: true })
    })

    it('rejects when the project limit is reached', () => {
        expect(runQuotaUtils.decide({ projectUsed: 100, projectLimit: 100, instanceUsed: 10, instanceLimit: 1000 }))
            .toEqual({ allowed: false, scope: RunQuotaScope.PROJECT, used: 100, limit: 100 })
    })

    it('ignores the project limit when the project inherits the instance limit', () => {
        expect(runQuotaUtils.decide({ projectUsed: 5000, projectLimit: null, instanceUsed: 5000, instanceLimit: 10000 })).toEqual({ allowed: true })
    })

    it('rejects when the instance limit is reached', () => {
        expect(runQuotaUtils.decide({ projectUsed: 1, projectLimit: null, instanceUsed: 1000, instanceLimit: 1000 }))
            .toEqual({ allowed: false, scope: RunQuotaScope.INSTANCE, used: 1000, limit: 1000 })
    })
})

describe('runQuotaUtils month helpers', () => {
    it('keys counters by calendar month', () => {
        const date = dayjs('2026-09-27T10:00:00')
        expect(runQuotaUtils.monthOf(date)).toBe('2026-09')
        expect(runQuotaUtils.monthStartOf('2026-09')).toBe(dayjs('2026-09-01T00:00:00').toISOString())
        expect(runQuotaUtils.monthStart(date)).toBe(dayjs('2026-09-01T00:00:00').toISOString())
    })
})

describe('runQuotaUtils capacity thresholds', () => {
    it('computes usage ratios and threshold crossings', () => {
        expect(runQuotaUtils.usageRatio({ used: 45, limit: 100 })).toBe(0.45)
        expect(runQuotaUtils.usageRatio({ used: 45, limit: null })).toBeNull()
        expect(runQuotaUtils.crossedThreshold({ used: 80, limit: 100, thresholdPercent: 80 })).toBe(true)
        expect(runQuotaUtils.crossedThreshold({ used: 79, limit: 100, thresholdPercent: 80 })).toBe(false)
        expect(runQuotaUtils.crossedThreshold({ used: 79, limit: null, thresholdPercent: 50 })).toBe(false)
    })

    it('explains a rejection without upgrade wording', () => {
        const message = runQuotaUtils.rejectionMessage({ allowed: false, scope: RunQuotaScope.PROJECT, used: 100000, limit: 100000 })
        expect(message).toContain('100,000')
        expect(message).toContain('this project')
        expect(message.toLowerCase()).not.toContain('upgrade')
        expect(runQuotaUtils.rejectionMessage({ allowed: true })).toBe('')
    })
})
