import { isNil } from '@fema-ipaas/core-utils'
import { ConnectorUsageEntry, ConnectorWorkflowUsage } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectionAccessService } from '../../connection/connection-access.service'
import { databaseConnection } from '../../database/database-connection'

export const connectorUsageService = (log: FastifyBaseLogger) => ({
    async summary({ tenantId, userId }: UserRef): Promise<ConnectorUsageEntry[]> {
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const rows: UsageRow[] = await databaseConnection().query(USAGE_SQL, [tenantId])
        const byConnector = rows.reduce((acc, row) => {
            const current = acc.get(row.connectorName) ?? { connectorName: row.connectorName, myWorkflowCount: 0, tenantWorkflowCount: 0 }
            const count = Number(row.workflowCount)
            return new Map(acc).set(row.connectorName, {
                connectorName: row.connectorName,
                tenantWorkflowCount: current.tenantWorkflowCount + count,
                myWorkflowCount: current.myWorkflowCount + (memberProjectIds.includes(row.projectId) ? count : 0),
            })
        }, new Map<string, ConnectorUsageEntry>())
        return [...byConnector.values()]
    },

    async workflows({ tenantId, userId, connectorName }: UserRef & { connectorName: string }): Promise<ConnectorWorkflowUsage[]> {
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        if (memberProjectIds.length === 0) {
            return []
        }
        const rows: WorkflowRow[] = await databaseConnection().query(WORKFLOWS_SQL, [tenantId, memberProjectIds, connectorName])
        return rows.map((row) => ({
            workflowId: row.workflowId,
            displayName: row.displayName,
            projectId: row.projectId,
            projectDisplayName: isNil(row.projectDisplayName) ? '' : row.projectDisplayName,
        }))
    },
})

const LATEST_VERSION_JOIN = `JOIN LATERAL (
    SELECT v."trigger", v."displayName" FROM "workflow_version" v WHERE v."workflowId" = w."id" ORDER BY v."created" DESC LIMIT 1
) latest ON true`

const USAGE_SQL = `SELECT names.name AS "connectorName", w."projectId" AS "projectId", COUNT(DISTINCT w."id") AS "workflowCount"
FROM "workflow" w
JOIN "project" p ON p."id" = w."projectId" AND p."tenantId" = $1 AND p."deleted" IS NULL
${LATEST_VERSION_JOIN}
CROSS JOIN LATERAL (SELECT DISTINCT value #>> '{}' AS name FROM jsonb_path_query(latest."trigger", 'lax $.**.connectorName') AS value) names
WHERE names.name IS NOT NULL
GROUP BY names.name, w."projectId"`

const WORKFLOWS_SQL = `SELECT w."id" AS "workflowId", latest."displayName" AS "displayName", w."projectId" AS "projectId", p."displayName" AS "projectDisplayName"
FROM "workflow" w
JOIN "project" p ON p."id" = w."projectId" AND p."tenantId" = $1 AND p."deleted" IS NULL
${LATEST_VERSION_JOIN}
WHERE w."projectId" = ANY($2) AND jsonb_path_exists(latest."trigger", 'lax $.**.connectorName ? (@ == $name)', jsonb_build_object('name', $3::text))
ORDER BY latest."displayName" ASC
LIMIT 200`

type UserRef = {
    tenantId: string
    userId: string
}

type UsageRow = {
    connectorName: string
    projectId: string
    workflowCount: string
}

type WorkflowRow = {
    workflowId: string
    displayName: string
    projectId: string
    projectDisplayName: string | null
}
