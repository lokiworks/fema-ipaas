import { isNil } from '@fema-ipaas/core-utils'
import { PlatformUsageQuery, PlatformUsageResponse, TenantUsageDay } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../database/database-connection'
import { PlatformCaller } from './platform-auth'
import { platformClientUtils } from './platform-client.utils'
import { platformUsageUtils } from './platform-usage.utils'
import { tenantUsageSnapshotUtils } from './tenant-usage-snapshot.utils'

export const platformUsageService = (_log: FastifyBaseLogger) => ({
    async query({ query, caller }: { query: PlatformUsageQuery, caller: PlatformCaller }): Promise<PlatformUsageResponse> {
        platformUsageUtils.assertRange({ from: query.from, to: query.to })
        const { sql, params } = platformUsageUtils.buildQuery({
            from: query.from,
            to: query.to,
            today: tenantUsageSnapshotUtils.todayUtc({ now: new Date() }),
            tenantId: query.tenantId ?? null,
            issuer: isNil(caller.issuer) ? null : platformClientUtils.normalizeIssuer({ issuer: caller.issuer }),
        })
        const rows = await databaseConnection().query<TenantUsageDay[]>(sql, params)
        return {
            data: rows.map((row) => ({
                tenantId: row.tenantId,
                date: row.date,
                executions: Number(row.executions),
                failedExecutions: Number(row.failedExecutions),
                activeWorkflows: Number(row.activeWorkflows),
                activeWorkflowsExact: row.activeWorkflowsExact,
            })),
        }
    },
})
