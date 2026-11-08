import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

function todayUtc({ now }: { now: Date }): string {
    return dayjs(now).utc().format('YYYY-MM-DD')
}

function buildRecordAllQuery(): string {
    return `
        INSERT INTO tenant_usage_snapshot (id, "tenantId", date, "activeWorkflows")
        SELECT substr(md5(t.id || $1::text), 1, 21),
               t.id,
               $1::date,
               COALESCE(c.total, 0)::int
        FROM tenant t
        LEFT JOIN (
            SELECT p."tenantId" AS "tenantId", COUNT(*) AS total
            FROM workflow w
            INNER JOIN project p ON p.id = w."projectId"
            WHERE p.deleted IS NULL AND w.status = $2
            GROUP BY p."tenantId"
        ) c ON c."tenantId" = t.id
        ON CONFLICT ("tenantId", date) DO UPDATE
        SET "activeWorkflows" = EXCLUDED."activeWorkflows", updated = now()
    `
}

function buildRecordOneQuery(): string {
    return `
        INSERT INTO tenant_usage_snapshot (id, "tenantId", date, "activeWorkflows")
        SELECT substr(md5(t.id || $2::text), 1, 21),
               t.id,
               $2::date,
               (
                   SELECT COUNT(*)::int
                   FROM workflow w
                   INNER JOIN project p ON p.id = w."projectId"
                   WHERE p."tenantId" = t.id AND p.deleted IS NULL AND w.status = $3
               )
        FROM tenant t
        WHERE t.id = $1
        ON CONFLICT ("tenantId", date) DO UPDATE
        SET "activeWorkflows" = EXCLUDED."activeWorkflows", updated = now()
    `
}

export const tenantUsageSnapshotUtils = {
    todayUtc,
    buildRecordAllQuery,
    buildRecordOneQuery,
}
