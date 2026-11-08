import { describe, expect, it } from 'vitest'
import { tenantUsageSnapshotUtils } from '../../../../src/app/platform/tenant-usage-snapshot.utils'

describe('tenant usage snapshot utils', () => {
    describe('today', () => {
        it('is the calendar day in UTC', () => {
            expect(tenantUsageSnapshotUtils.todayUtc({ now: new Date('2026-11-08T10:00:00Z') })).toBe('2026-11-08')
        })

        it('rolls over at midnight UTC and not at midnight of the server', () => {
            expect(tenantUsageSnapshotUtils.todayUtc({ now: new Date('2026-11-08T23:59:59Z') })).toBe('2026-11-08')
            expect(tenantUsageSnapshotUtils.todayUtc({ now: new Date('2026-11-09T00:00:00Z') })).toBe('2026-11-09')
            expect(tenantUsageSnapshotUtils.todayUtc({ now: new Date('2026-11-08T23:30:00-05:00') })).toBe('2026-11-09')
        })
    })

    describe('recording every tenant', () => {
        const sql = tenantUsageSnapshotUtils.buildRecordAllQuery()

        it('writes one row per tenant and day and overwrites the row of the same day', () => {
            expect(sql).toContain('INSERT INTO tenant_usage_snapshot')
            expect(sql).toContain('ON CONFLICT ("tenantId", date) DO UPDATE')
        })

        it('records tenants without any enabled workflow as zero', () => {
            expect(sql).toContain('FROM tenant t')
            expect(sql).toContain('LEFT JOIN')
            expect(sql).toContain('COALESCE(c.total, 0)')
        })

        it('ignores workflows of deleted projects and takes the day and status as parameters', () => {
            expect(sql).toContain('p.deleted IS NULL')
            expect(sql).toContain('$1::date')
            expect(sql).toContain('w.status = $2')
        })
    })

    describe('recording one tenant', () => {
        const sql = tenantUsageSnapshotUtils.buildRecordOneQuery()

        it('is limited to the tenant that is passed in', () => {
            expect(sql).toContain('WHERE t.id = $1')
            expect(sql).toContain('p."tenantId" = t.id')
        })

        it('upserts the row of the given day', () => {
            expect(sql).toContain('ON CONFLICT ("tenantId", date) DO UPDATE')
            expect(sql).toContain('$2::date')
            expect(sql).toContain('w.status = $3')
        })
    })
})
