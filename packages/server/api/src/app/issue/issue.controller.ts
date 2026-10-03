import { EntityId, isNil, Permission, SeekPage } from '@fema-ipaas/core-utils'
import {
    AddIssueNoteRequestBody,
    AlertRecord,
    ApplicationEventName,
    BatchUpdateIssuesRequestBody,
    Execution,
    IssueActivity,
    IssueInsight,
    IssueKind,
    IssueOverview,
    IssueProjectQuery,
    IssueReplayRequestBody,
    IssueReplayResult,
    IssueSummary,
    IssueTrend,
    IssueTrendQuery,
    issueUtils,
    IssueWithSeverity,
    ListIssuesRequestQuery,
    PrincipalType,
    ReplayCheckResult,
    UpdateIssueRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { alertRecordService } from '../alert/alert-record.service'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { issueReplayService } from './issue-replay.service'
import { IssueEntity } from './issue.entity'
import { issueService } from './issue.service'

export const issueController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListIssuesRequest, async (request): Promise<SeekPage<IssueWithSeverity>> => {
        return issueService(request.log).list({ query: request.query, currentUserId: request.principal.id })
    })

    app.get('/overview', OverviewRequest, async (request): Promise<IssueOverview> => {
        return issueService(request.log).overview({ userId: request.principal.id, tenantId: request.principal.tenant.id, projectId: request.query.projectId })
    })

    app.get('/summary', SummaryRequest, async (request): Promise<IssueSummary> => {
        const summary = await issueService(request.log).summary({ projectId: request.projectId, currentUserId: request.principal.id, timezone: request.query.timezone })
        const alerts = await alertRecordService(request.log).stats({ tenantId: request.principal.tenant.id, projectId: request.projectId, timezone: request.query.timezone })
        return { ...summary, alertsLast7Days: alerts.alertsLast7Days }
    })

    app.post('/batch', BatchUpdateRequest, async (request, reply) => {
        await issueService(request.log).batchUpdate({
            ids: request.body.ids,
            projectId: request.projectId,
            request: request.body,
            actorId: request.principal.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/:id', GetIssueRequest, async (request): Promise<IssueWithSeverity> => {
        return issueService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
    })

    app.post('/:id', UpdateIssueRequest, async (request): Promise<IssueWithSeverity> => {
        return issueService(request.log).update({
            id: request.params.id,
            projectId: request.projectId,
            request: request.body,
            actorId: request.principal.id,
        })
    })

    app.get('/:id/activities', GetIssueRequest, async (request): Promise<IssueActivity[]> => {
        return issueService(request.log).listActivities({ id: request.params.id, projectId: request.projectId })
    })

    app.post('/:id/notes', AddNoteRequest, async (request): Promise<IssueActivity> => {
        return issueService(request.log).addNote({
            id: request.params.id,
            projectId: request.projectId,
            text: request.body.text,
            actorId: request.principal.id,
        })
    })

    app.get('/:id/executions', ListIssueExecutionsRequest, async (request): Promise<SeekPage<Execution>> => {
        return issueService(request.log).listExecutions({
            id: request.params.id,
            projectId: request.projectId,
            cursor: request.query.cursor,
            limit: request.query.limit,
        })
    })

    app.get('/:id/workflows', GetIssueRequest, async (request): Promise<string[]> => {
        return issueService(request.log).affectedWorkflowIds({ id: request.params.id, projectId: request.projectId })
    })

    app.get('/:id/trend', TrendRequest, async (request): Promise<IssueTrend> => {
        return issueService(request.log).trend({ id: request.params.id, projectId: request.projectId, granularity: request.query.granularity, timezone: request.query.timezone })
    })

    app.get('/:id/insight', GetIssueRequest, async (request): Promise<IssueInsight> => {
        const issue = await issueService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        const health = issue.kind === IssueKind.CONNECTION && !isNil(issue.connectionExternalId)
            ? await issueReplayService(request.log).connectionHealth({ externalId: issue.connectionExternalId, projectId: request.projectId })
            : { healthy: true, missing: false }
        return issueUtils.insightOf({ issue, connectionHealthy: health.healthy, connectionMissing: health.missing })
    })

    app.get('/:id/alerts', GetIssueRequest, async (request): Promise<AlertRecord[]> => {
        await issueService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        return alertRecordService(request.log).listForIssue({ tenantId: request.principal.tenant.id, issueId: request.params.id })
    })

    app.post('/:id/replay-check', ReplayCheckRequest, async (request): Promise<ReplayCheckResult> => {
        return issueReplayService(request.log).check({ id: request.params.id, projectId: request.projectId })
    })

    app.post('/:id/replay', ReplayRequest, async (request): Promise<IssueReplayResult> => {
        const issue = await issueService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        const result = await issueReplayService(request.log).replay({
            id: request.params.id,
            projectId: request.projectId,
            strategy: request.body.strategy,
            includeDataProblems: request.body.includeDataProblems ?? false,
            actorId: request.principal.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.ISSUE_REPLAYED,
            data: { issue: { id: issue.id, title: issue.title }, strategy: request.body.strategy, count: result.queued },
        })
        return result
    })
}

const IdParams = z.object({ id: EntityId })

const readIssue = securityAccess.project([PrincipalType.USER], Permission.READ_ISSUE, { type: ProjectResourceType.TABLE, tableName: IssueEntity })
const writeIssue = securityAccess.project([PrincipalType.USER], Permission.WRITE_ISSUE, { type: ProjectResourceType.TABLE, tableName: IssueEntity })

const ListIssuesRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.READ_ISSUE, { type: ProjectResourceType.QUERY }),
    },
    schema: {
        tags: ['issues'],
        querystring: ListIssuesRequestQuery,
        response: { [StatusCodes.OK]: SeekPage(IssueWithSeverity) },
    },
}

const OverviewRequest = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER]),
    },
    schema: {
        tags: ['issues'],
        querystring: z.object({ projectId: z.string().optional() }),
        response: { [StatusCodes.OK]: IssueOverview },
    },
}

const SummaryRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.READ_ISSUE, { type: ProjectResourceType.QUERY }),
    },
    schema: {
        tags: ['issues'],
        querystring: IssueProjectQuery,
        response: { [StatusCodes.OK]: IssueSummary },
    },
}

const BatchUpdateRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.WRITE_ISSUE, { type: ProjectResourceType.BODY }),
    },
    schema: {
        tags: ['issues'],
        body: BatchUpdateIssuesRequestBody,
    },
}

const GetIssueRequest = {
    config: { security: readIssue },
    schema: {
        tags: ['issues'],
        params: IdParams,
    },
}

const UpdateIssueRequest = {
    config: { security: writeIssue },
    schema: {
        tags: ['issues'],
        params: IdParams,
        body: UpdateIssueRequestBody,
        response: { [StatusCodes.OK]: IssueWithSeverity },
    },
}

const AddNoteRequest = {
    config: { security: writeIssue },
    schema: {
        tags: ['issues'],
        params: IdParams,
        body: AddIssueNoteRequestBody,
    },
}

const ListIssueExecutionsRequest = {
    config: { security: readIssue },
    schema: {
        tags: ['issues'],
        params: IdParams,
        querystring: z.object({
            cursor: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
    },
}

const TrendRequest = {
    config: { security: readIssue },
    schema: {
        tags: ['issues'],
        params: IdParams,
        querystring: IssueTrendQuery.omit({ projectId: true }),
        response: { [StatusCodes.OK]: IssueTrend },
    },
}

const ReplayCheckRequest = {
    config: { security: writeIssue },
    schema: {
        tags: ['issues'],
        params: IdParams,
        response: { [StatusCodes.OK]: ReplayCheckResult },
    },
}

const ReplayRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.WRITE_RUN, { type: ProjectResourceType.TABLE, tableName: IssueEntity }),
    },
    schema: {
        tags: ['issues'],
        params: IdParams,
        body: IssueReplayRequestBody,
        response: { [StatusCodes.OK]: IssueReplayResult },
    },
}
