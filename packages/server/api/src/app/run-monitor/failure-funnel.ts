import { RunEnvironment } from '@fema-ipaas/shared'
import { databaseConnection } from '../database/database-connection'
import { runMonitorUtils } from './run-monitor-utils'

export const failureFunnel = {
    async count({ projectIds, workflowIds, from, to }: FailureFunnelParams): Promise<FailureFunnelCounts> {
        if (projectIds.length === 0) {
            return { failures: 0, issues: 0 }
        }
        const rows: { failures: string, issues: string }[] = await databaseConnection().query(
            `SELECT COUNT(*) AS failures, COUNT(DISTINCT e."issueId") AS issues FROM "execution" e
            WHERE e."projectId" = ANY($1::varchar[])
                AND (cardinality($2::varchar[]) = 0 OR e."workflowId" = ANY($2::varchar[]))
                AND e.environment = '${RunEnvironment.PRODUCTION}'
                AND e."archivedAt" IS NULL
                AND e."issueId" IS NOT NULL AND e."rerunOfExecutionId" IS NULL
                AND NOT (e.status = ANY($5::varchar[]))
                AND e.created >= $3 AND e.created <= $4`,
            [projectIds, workflowIds, new Date(from).toISOString(), new Date(to).toISOString(), runMonitorUtils.nonFailureStatuses],
        )
        return {
            failures: Number(rows[0]?.failures ?? 0),
            issues: Number(rows[0]?.issues ?? 0),
        }
    },
}

type FailureFunnelParams = {
    projectIds: string[]
    workflowIds: string[]
    from: number
    to: number
}

export type FailureFunnelCounts = {
    failures: number
    issues: number
}
