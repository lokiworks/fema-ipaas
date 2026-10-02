import { isNil, UserId } from '@fema-ipaas/core-utils'
import {
    AgentApprovalStatus,
    ConnectionStatus,
    Execution,
    ExecutionStatus,
    FAILED_STATES,
    HOME_BROKEN_CONNECTIONS_LIMIT,
    HOME_FAILED_RUNS_LIMIT,
    HOME_TODO_LIMIT,
    HomeBrokenConnection,
    HomeFailedRun,
    HomeSummary,
    HomeTodo,
    HomeTodoType,
    RunEnvironment,
    TenantRole,
    WorkflowOperationStatus,
    WorkflowReleaseStatus,
} from '@fema-ipaas/shared'
import { ArrayContains, Brackets, In, MoreThan, SelectQueryBuilder } from 'typeorm'
import { agentApprovalRepo } from '../agent-approval/agent-approval.service'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { projectRepo } from '../project/project-repo'
import { workflowReleaseRepo } from '../release/workflow-release.service'
import { userRepo } from '../user/user-service'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { homeAggregation, HourlyBucketRow, ProjectStatusCountRow, WorkflowConnectionUsage } from './home-aggregation'

export const homeService = {
    async summary({ userId, tenantId, since }: SummaryParams): Promise<HomeSummary> {
        const from = homeAggregation.resolveSince({ since, now: new Date() })
        const projectIds = await accessibleProjectIds({ userId, tenantId })
        if (projectIds.length === 0) {
            return emptySummary(from)
        }
        const [statusRows, hourlyRows, failedRuns, brokenConnections, todos] = await Promise.all([
            runStatusCounts({ projectIds, from }),
            hourlyCounts({ projectIds, from }),
            latestFailedRuns({ projectIds, from }),
            brokenConnectionsFor({ projectIds, tenantId }),
            pendingTodos({ projectIds, userId }),
        ])
        const totals = homeAggregation.summarizeStatusCounts(statusRows)
        return {
            runs: {
                since: from.toISOString(),
                ...totals,
                hourly: homeAggregation.fillHourly(hourlyRows),
                byProject: homeAggregation.summarizeByProject(statusRows),
            },
            failedRuns,
            brokenConnections,
            todos: homeAggregation.latestTodos({ todos: todos.items, limit: HOME_TODO_LIMIT }),
            todoTotal: todos.total,
        }
    },
}

async function accessibleProjectIds({ userId, tenantId }: { userId: UserId, tenantId: string }): Promise<string[]> {
    const user = await userRepo().findOneBy({ id: userId, tenantId })
    if (isNil(user)) {
        return []
    }
    const query = projectRepo()
        .createQueryBuilder('project')
        .select('project.id', 'id')
        .where('project."tenantId" = :tenantId', { tenantId })
        .andWhere('project.deleted IS NULL')
    if (user.tenantRole !== TenantRole.ADMIN) {
        query.andWhere(new Brackets((qb) => {
            qb.where('project."ownerId" = :userId', { userId })
                .orWhere('project.id IN (SELECT pm."projectId" FROM project_member pm WHERE pm."userId" = :userId)', { userId })
        }))
    }
    const rows: { id: string }[] = await query.getRawMany()
    return rows.map((row) => row.id)
}

function productionRuns({ projectIds, from }: RunScope): SelectQueryBuilder<Execution> {
    return executionRepo()
        .createQueryBuilder('execution')
        .where('execution."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('execution.environment = :environment', { environment: RunEnvironment.PRODUCTION })
        .andWhere('execution."archivedAt" IS NULL')
        .andWhere('execution.created >= :from', { from: from.toISOString() })
}

async function runStatusCounts({ projectIds, from }: RunScope): Promise<ProjectStatusCountRow[]> {
    const rows: { projectId: string, status: ExecutionStatus, count: string }[] = await productionRuns({ projectIds, from })
        .select('execution."projectId"', 'projectId')
        .addSelect('execution.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('execution."projectId"')
        .addGroupBy('execution.status')
        .getRawMany()
    return rows.map((row) => ({ projectId: row.projectId, status: row.status, count: Number(row.count) }))
}

async function hourlyCounts({ projectIds, from }: RunScope): Promise<HourlyBucketRow[]> {
    const rows: { bucket: string, count: string }[] = await productionRuns({ projectIds, from })
        .select('FLOOR(EXTRACT(EPOCH FROM (execution.created - CAST(:from AS timestamptz))) / 3600)', 'bucket')
        .addSelect('COUNT(*)', 'count')
        .groupBy('bucket')
        .getRawMany()
    return rows.map((row) => ({ bucket: Number(row.bucket), count: Number(row.count) }))
}

async function latestFailedRuns({ projectIds, from }: RunScope): Promise<HomeFailedRun[]> {
    const rows: { id: string, projectId: string, workflowId: string, status: ExecutionStatus, created: Date | string, displayName: string | null }[] = await productionRuns({ projectIds, from })
        .andWhere('execution.status IN (:...failedStates)', { failedStates: FAILED_STATES })
        .andWhere(`NOT EXISTS (
            SELECT 1 FROM execution retry
            WHERE retry."rerunOfExecutionId" = COALESCE(execution."rerunOfExecutionId", execution.id)
            AND (retry.status = :retriedStatus OR retry.created > execution.created)
        )`, { retriedStatus: ExecutionStatus.SUCCEEDED })
        .leftJoin('workflow_version', 'version', 'version.id = execution."workflowVersionId"')
        .select('execution.id', 'id')
        .addSelect('execution."projectId"', 'projectId')
        .addSelect('execution."workflowId"', 'workflowId')
        .addSelect('execution.status', 'status')
        .addSelect('execution.created', 'created')
        .addSelect('version."displayName"', 'displayName')
        .orderBy('execution.created', 'DESC')
        .limit(HOME_FAILED_RUNS_LIMIT)
        .getRawMany()
    return rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        workflowId: row.workflowId,
        workflowDisplayName: row.displayName ?? row.workflowId,
        status: row.status,
        created: new Date(row.created).toISOString(),
    }))
}

async function brokenConnectionsFor({ projectIds, tenantId }: { projectIds: string[], tenantId: string }): Promise<HomeBrokenConnection[]> {
    const connections = await connectionsRepo()
        .createQueryBuilder('connection')
        .select(['connection.id', 'connection.externalId', 'connection.displayName', 'connection.connectorName', 'connection.status', 'connection.projectIds', 'connection.updated'])
        .where('connection."tenantId" = :tenantId', { tenantId })
        .andWhere('connection.status != :active', { active: ConnectionStatus.ACTIVE })
        .andWhere('connection."projectIds" && :projectIds::varchar[]', { projectIds })
        .orderBy('connection.updated', 'DESC')
        .limit(HOME_BROKEN_CONNECTIONS_LIMIT)
        .getMany()
    if (connections.length === 0) {
        return []
    }
    const usages = await workflowConnectionUsages({ projectIds, externalIds: connections.map((connection) => connection.externalId) })
    return connections.map((connection) => {
        const visibleProjectIds = connection.projectIds.filter((projectId) => projectIds.includes(projectId))
        return {
            id: connection.id,
            displayName: connection.displayName,
            connectorName: connection.connectorName,
            status: connection.status,
            projectId: visibleProjectIds[0],
            affectedWorkflowCount: homeAggregation.countAffectedWorkflows({ usages, externalId: connection.externalId, projectIds: visibleProjectIds }),
        }
    })
}

async function workflowConnectionUsages({ projectIds, externalIds }: { projectIds: string[], externalIds: string[] }): Promise<WorkflowConnectionUsage[]> {
    const latestVersion = workflowVersionRepo()
        .createQueryBuilder('fv_sub')
        .select('fv_sub.id')
        .where('fv_sub."workflowId" = workflow.id')
        .orderBy('fv_sub.created', 'DESC')
        .limit(1)
    const rows: { id: string, projectId: string, connectionIds: string[] | null }[] = await workflowRepo()
        .createQueryBuilder('workflow')
        .innerJoin('workflow_version', 'latest_version', `latest_version.id = (${latestVersion.getQuery()})`)
        .select('workflow.id', 'id')
        .addSelect('workflow."projectId"', 'projectId')
        .addSelect('latest_version."connectionIds"', 'connectionIds')
        .where('workflow."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('workflow."operationStatus" != :deleting', { deleting: WorkflowOperationStatus.DELETING })
        .andWhere('latest_version."connectionIds" && :externalIds::varchar[]', { externalIds })
        .getRawMany()
    return rows.map((row) => ({ workflowId: row.id, projectId: row.projectId, connectionIds: row.connectionIds ?? [] }))
}

async function pendingTodos({ projectIds, userId }: { projectIds: string[], userId: UserId }): Promise<{ items: HomeTodo[], total: number }> {
    const [releases, approvals] = await Promise.all([
        workflowReleaseRepo().find({
            where: { projectId: In(projectIds), status: WorkflowReleaseStatus.PENDING, approverIds: ArrayContains([userId]) },
            order: { created: 'DESC' },
            take: TODO_SCAN_LIMIT,
        }),
        agentApprovalRepo().find({
            where: { projectId: In(projectIds), status: AgentApprovalStatus.PENDING, approverIds: ArrayContains([userId]), expiresAt: MoreThan(new Date().toISOString()) },
            order: { created: 'DESC' },
            take: TODO_SCAN_LIMIT,
        }),
    ])
    const decidable = releases.filter((release) => homeAggregation.canDecideRelease({ approverIds: release.approverIds, requestedById: release.requestedById, userId }))
    const shownReleases = decidable.slice(0, HOME_TODO_LIMIT)
    const shownApprovals = approvals.slice(0, HOME_TODO_LIMIT)
    const [names, requesters] = await Promise.all([
        versionDisplayNames({
            releaseVersionIds: shownReleases.map((release) => release.workflowVersionId),
            workflowIds: shownApprovals.map((approval) => approval.workflowId),
        }),
        requesterNames(shownReleases.map((release) => release.requestedById)),
    ])
    const releaseTodos: HomeTodo[] = shownReleases.map((release) => ({
        type: HomeTodoType.RELEASE,
        id: release.id,
        projectId: release.projectId,
        workflowId: release.workflowId,
        workflowDisplayName: names.byVersionId.get(release.workflowVersionId) ?? release.workflowId,
        executionId: null,
        requesterName: requesters.get(release.requestedById) ?? null,
        subject: null,
        created: new Date(release.created).toISOString(),
    }))
    const approvalTodos: HomeTodo[] = shownApprovals.map((approval) => ({
        type: HomeTodoType.AGENT_APPROVAL,
        id: approval.id,
        projectId: approval.projectId,
        workflowId: approval.workflowId,
        workflowDisplayName: names.byWorkflowId.get(approval.workflowId) ?? approval.workflowId,
        executionId: approval.executionId,
        requesterName: null,
        subject: approval.tool,
        created: new Date(approval.created).toISOString(),
    }))
    return { items: [...releaseTodos, ...approvalTodos], total: decidable.length + approvals.length }
}

async function versionDisplayNames({ releaseVersionIds, workflowIds }: { releaseVersionIds: string[], workflowIds: string[] }): Promise<VersionNames> {
    const [byVersion, latestByWorkflow] = await Promise.all([
        releaseVersionIds.length === 0
            ? Promise.resolve([])
            : workflowVersionRepo().find({ where: { id: In(releaseVersionIds) }, select: ['id', 'displayName'] }),
        workflowIds.length === 0
            ? Promise.resolve([])
            : latestVersionNames(workflowIds),
    ])
    return {
        byVersionId: new Map(byVersion.map((version) => [version.id, version.displayName])),
        byWorkflowId: new Map(latestByWorkflow.map((row) => [row.workflowId, row.displayName])),
    }
}

async function latestVersionNames(workflowIds: string[]): Promise<{ workflowId: string, displayName: string }[]> {
    return workflowVersionRepo()
        .createQueryBuilder('version')
        .distinctOn(['version."workflowId"'])
        .select('version."workflowId"', 'workflowId')
        .addSelect('version."displayName"', 'displayName')
        .where('version."workflowId" IN (:...workflowIds)', { workflowIds: [...new Set(workflowIds)] })
        .orderBy('version."workflowId"')
        .addOrderBy('version.created', 'DESC')
        .getRawMany()
}

async function requesterNames(userIds: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(userIds)]
    if (unique.length === 0) {
        return new Map()
    }
    const rows: { id: string, firstName: string | null, lastName: string | null, email: string | null }[] = await userRepo()
        .createQueryBuilder('user')
        .leftJoin('user.identity', 'identity')
        .select('user.id', 'id')
        .addSelect('identity."firstName"', 'firstName')
        .addSelect('identity."lastName"', 'lastName')
        .addSelect('identity.email', 'email')
        .where('user.id IN (:...ids)', { ids: unique })
        .getRawMany()
    return new Map(rows.map((row) => [row.id, homeAggregation.displayName(row)]))
}

function emptySummary(from: Date): HomeSummary {
    return {
        runs: {
            since: from.toISOString(),
            total: 0,
            succeeded: 0,
            failedOrTimeout: 0,
            finished: 0,
            hourly: homeAggregation.fillHourly([]),
            byProject: [],
        },
        failedRuns: [],
        brokenConnections: [],
        todos: [],
        todoTotal: 0,
    }
}

const TODO_SCAN_LIMIT = 200

type SummaryParams = {
    userId: UserId
    tenantId: string
    since: string
}

type VersionNames = {
    byVersionId: Map<string, string>
    byWorkflowId: Map<string, string>
}

type RunScope = {
    projectIds: string[]
    from: Date
}
