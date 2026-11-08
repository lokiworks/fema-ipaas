import { ExecutionStatus, isFailedState, RunEnvironment, WorkflowStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { platformUsageUtils } from '../../../../src/app/platform/platform-usage.utils'

describe('platform usage utils', () => {
    describe('range', () => {
        it('accepts a range of ordered dates', () => {
            expect(() => platformUsageUtils.assertRange({ from: '2026-10-01', to: '2026-10-31' })).not.toThrow()
            expect(() => platformUsageUtils.assertRange({ from: '2026-10-05', to: '2026-10-05' })).not.toThrow()
        })

        it('rejects a reversed range or an impossible date', () => {
            expect(() => platformUsageUtils.assertRange({ from: '2026-10-31', to: '2026-10-01' })).toThrow()
            expect(() => platformUsageUtils.assertRange({ from: '2026-02-30', to: '2026-03-02' })).toThrow()
        })

        it('rejects a range longer than the maximum', () => {
            expect(() => platformUsageUtils.assertRange({ from: '2026-01-01', to: '2026-12-31' })).toThrow()
            expect(() => platformUsageUtils.assertRange({ from: '2026-01-01', to: '2026-04-02' })).not.toThrow()
            expect(() => platformUsageUtils.assertRange({ from: '2026-01-01', to: '2026-04-03' })).toThrow()
        })
    })

    describe('query', () => {
        it('aggregates every tenant in one statement without filters', () => {
            const { sql, params } = platformUsageUtils.buildQuery({ from: '2026-10-01', to: '2026-10-07', today: '2026-10-05', tenantId: null, issuer: null })

            expect(sql).not.toContain('WHERE t.')
            expect(params).toHaveLength(6)
            expect(params.slice(0, 2)).toEqual(['2026-10-01', '2026-10-07'])
            expect(params[3]).toBe(RunEnvironment.PRODUCTION)
            expect(params[4]).toBe(WorkflowStatus.ENABLED)
            expect(params[5]).toBe('2026-10-05')
        })

        it('passes the failed statuses as a single array parameter', () => {
            const { params } = platformUsageUtils.buildQuery({ from: '2026-10-01', to: '2026-10-07', today: '2026-10-05', tenantId: null, issuer: null })

            const failed = params[2]
            expect(Array.isArray(failed)).toBe(true)
            expect(failed).toEqual(Object.values(ExecutionStatus).filter((status) => isFailedState(status)))
        })

        it('filters by tenant and by issuer with numbered parameters in order', () => {
            const { sql, params } = platformUsageUtils.buildQuery({ from: '2026-10-01', to: '2026-10-07', today: '2026-10-05', tenantId: 'tenant-1', issuer: 'https://iam.example.com' })

            expect(params.slice(6)).toEqual(['tenant-1', 'https://iam.example.com'])
            expect(sql).toContain('t.id = $7')
            expect(sql).toContain('= $8')
        })

        it('reads the enabled workflow count from the snapshots and reports whether the value is exact', () => {
            const { sql } = platformUsageUtils.buildQuery({ from: '2026-10-01', to: '2026-10-07', today: '2026-10-05', tenantId: null, issuer: null })

            expect(sql).toContain('FROM tenant_usage_snapshot')
            expect(sql).toContain('"activeWorkflowsExact"')
            expect(sql).toContain('d.day >= $6::date')
            expect(sql).toContain('ORDER BY s.date DESC LIMIT 1')
        })

        it('never inlines caller input into the statement', () => {
            const { sql } = platformUsageUtils.buildQuery({ from: '2026-10-01', to: '2026-10-07', today: '2026-10-05', tenantId: "x'; DROP TABLE tenant; --", issuer: null })

            expect(sql).not.toContain('DROP TABLE')
        })
    })
})
