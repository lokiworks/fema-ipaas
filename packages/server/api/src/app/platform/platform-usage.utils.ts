import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ExecutionStatus, isFailedState, RunEnvironment, WorkflowStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const FAILED_STATUSES = Object.values(ExecutionStatus).filter((status) => isFailedState(status))
const MAX_RANGE_DAYS = 92

function assertRange({ from, to }: { from: string, to: string }): void {
    const start = dayjs(from, 'YYYY-MM-DD', true)
    const end = dayjs(to, 'YYYY-MM-DD', true)
    const ordered = start.isValid() && end.isValid() && !end.isBefore(start)
    if (!ordered) {
        throw invalid({ message: 'usageRangeInvalid' })
    }
    if (end.diff(start, 'day') + 1 > MAX_RANGE_DAYS) {
        throw invalid({ message: 'usageRangeTooLong' })
    }
}

function buildQuery({ from, to, tenantId, issuer }: BuildQueryParams): UsageQuery {
    const params: unknown[] = [from, to, FAILED_STATUSES, RunEnvironment.PRODUCTION, WorkflowStatus.ENABLED]
    const filters: string[] = []
    if (!isNil(tenantId)) {
        params.push(tenantId)
        filters.push(`t.id = $${params.length}`)
    }
    if (!isNil(issuer)) {
        params.push(issuer)
        filters.push(`regexp_replace(t."externalIssuer", '/+$', '') = $${params.length}`)
    }
    const where = filters.length === 0 ? '' : `WHERE ${filters.join(' AND ')}`
    const sql = `
        WITH scoped_tenants AS (
            SELECT t.id FROM tenant t ${where}
        ),
        days AS (
            SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
        ),
        runs AS (
            SELECT p."tenantId" AS "tenantId",
                   (e.created AT TIME ZONE 'UTC')::date AS day,
                   COUNT(*)::int AS executions,
                   COUNT(*) FILTER (WHERE e.status = ANY($3))::int AS "failedExecutions"
            FROM execution e
            INNER JOIN project p ON p.id = e."projectId"
            WHERE p."tenantId" IN (SELECT id FROM scoped_tenants)
              AND e.environment = $4
              AND e.created >= ($1::date::timestamp AT TIME ZONE 'UTC')
              AND e.created < (($2::date + 1)::timestamp AT TIME ZONE 'UTC')
            GROUP BY p."tenantId", (e.created AT TIME ZONE 'UTC')::date
        ),
        enabled AS (
            SELECT p."tenantId" AS "tenantId", (w.created AT TIME ZONE 'UTC')::date AS since
            FROM workflow w
            INNER JOIN project p ON p.id = w."projectId"
            WHERE p."tenantId" IN (SELECT id FROM scoped_tenants)
              AND p.deleted IS NULL
              AND w.status = $5
        )
        SELECT st.id AS "tenantId",
               to_char(d.day, 'YYYY-MM-DD') AS date,
               COALESCE(r.executions, 0)::int AS executions,
               COALESCE(r."failedExecutions", 0)::int AS "failedExecutions",
               (SELECT COUNT(*) FROM enabled en WHERE en."tenantId" = st.id AND en.since <= d.day)::int AS "activeWorkflows"
        FROM scoped_tenants st
        CROSS JOIN days d
        LEFT JOIN runs r ON r."tenantId" = st.id AND r.day = d.day
        ORDER BY st.id, d.day
    `
    return { sql, params }
}

function invalid({ message }: { message: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

export const platformUsageUtils = {
    assertRange,
    buildQuery,
    maxRangeDays: MAX_RANGE_DAYS,
}

type BuildQueryParams = {
    from: string
    to: string
    tenantId: string | null
    issuer: string | null
}

type UsageQuery = {
    sql: string
    params: unknown[]
}
