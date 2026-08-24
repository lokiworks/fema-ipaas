import { ApplicationError, EntityId, ErrorCode, isNil, omit, Permission, SeekPage } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { BulkActionOnRunsRequestBody, BulkArchiveActionOnRunsRequestBody, BulkCancelWorkflowRequestBody, CountExecutionsByStatusRequest, CountExecutionsByStatusResponse, Execution, ListExecutionsRequestQuery, PrincipalType, RetryWorkflowRequestBody, RunEnvironment, RunInternalErrorSource, SERVICE_KEY_SECURITY_OPENAPI, TenantRole, WorkspaceOverviewRequest, WorkspaceOverviewResponse } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { userService } from '../../user/user-service'
import { ExecutionEntity } from './execution-entity'
import { executionService } from './execution-service'

const DEFAULT_PAGING_LIMIT = 10

export const executionController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request) => {
        return executionService(request.log).list({
            workspaceId: request.query.workspaceId,
            workflowId: request.query.workflowId,
            tags: request.query.tags,
            status: request.query.status,
            failedStepName: request.query.failedStepName,
            failedStepMessage: request.query.failedStepMessage,
            cursor: request.query.cursor ?? null,
            limit: Number(request.query.limit ?? DEFAULT_PAGING_LIMIT),
            createdAfter: request.query.createdAfter,
            createdBefore: request.query.createdBefore,
            executionIds: request.query.executionIds,
            includeArchived: request.query.includeArchived,
            environment: RunEnvironment.PRODUCTION,
        })
    })

    app.get('/count-by-status', CountByStatusRouteConfig, async (request) => {
        const data = await executionService(request.log).countByStatus({
            workspaceId: request.query.workspaceId,
            createdAfter: request.query.createdAfter,
            createdBefore: request.query.createdBefore,
        })
        return { data }
    })

    app.get('/overview', WorkspaceOverviewRouteConfig, async (request) => {
        const { workspaceId, days } = request.query
        const createdAfter = dayjsUtil().subtract(days, 'day').toISOString()
        const [countByStatus, dailyTrend, topFailingWorkflows, connectionHealth, topConnectors, recentlyEditedWorkflows] = await Promise.all([
            executionService(request.log).countByStatus({ workspaceId, createdAfter }),
            executionService(request.log).dailyTrend({ workspaceId, createdAfter }),
            executionService(request.log).topFailingWorkflows({ workspaceId, createdAfter, limit: TOP_FAILING_WORKFLOWS_LIMIT }),
            executionService(request.log).connectionHealth({ workspaceId }),
            executionService(request.log).topConnectors({ workspaceId, limit: OVERVIEW_LIST_LIMIT }),
            executionService(request.log).recentlyEditedWorkflows({ workspaceId, limit: OVERVIEW_LIST_LIMIT }),
        ])
        return { countByStatus, dailyTrend, topFailingWorkflows, connectionHealth, topConnectors, recentlyEditedWorkflows }
    })

    app.get(
        '/:id',
        GetRequest,
        async (request, reply) => {
            const execution = await executionService(request.log).getOnePopulatedOrThrow({
                workspaceId: request.workspaceId,
                id: request.params.id,
            })
            const internalErrorEnabled = execution.internalError?.source === RunInternalErrorSource.ENGINE || true
            const canViewInternalError = internalErrorEnabled && await isRequesterTenantAdmin(request)
            await reply.send(canViewInternalError ? execution : omit(execution, ['internalError']))
        },
    )

    app.post('/:id/retry', RetryWorkflowRequest, async (req) => {
        const execution = await executionService(req.log).retry({
            executionId: req.params.id,
            strategy: req.body.strategy,
            workspaceId: req.body.workspaceId,
        })

        if (isNil(execution)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'execution',
                    entityId: req.params.id,
                    message: 'Workflow run not found',
                },
            })
        }
        return execution
    })

    app.post('/cancel', BulkCancelWorkflowRequest, async (req) => {
        return executionService(req.log).cancel({
            workspaceId: req.workspaceId,
            tenantId: req.principal.tenant.id,
            executionIds: req.body.executionIds,
            excludeExecutionIds: req.body.excludeExecutionIds,
            status: req.body.status,
            workflowId: req.body.workflowId,
            createdAfter: req.body.createdAfter,
            createdBefore: req.body.createdBefore,
        })
    })

    app.post('/retry', BulkRetryWorkflowRequest, async (req) => {
        return executionService(req.log).bulkRetry({
            workspaceId: req.workspaceId,
            executionIds: req.body.executionIds,
            excludeExecutionIds: req.body.excludeExecutionIds,
            strategy: req.body.strategy,
            status: req.body.status,
            workflowId: req.body.workflowId,
            createdAfter: req.body.createdAfter,
            createdBefore: req.body.createdBefore,
            failedStepName: req.body.failedStepName,
            failedStepMessage: req.body.failedStepMessage,
        })
    })

    app.post('/archive', ArchiveExecutionRequest, async (req) => {
        return executionService(req.log).bulkArchive({
            workspaceId: req.workspaceId,
            executionIds: req.body.executionIds,
            excludeExecutionIds: req.body.excludeExecutionIds,
            status: req.body.status,
            workflowId: req.body.workflowId,
            createdAfter: req.body.createdAfter,
            createdBefore: req.body.createdBefore,
            failedStepName: req.body.failedStepName,
            failedStepMessage: req.body.failedStepMessage,
        })
    })

}

async function isRequesterTenantAdmin(request: FastifyRequest): Promise<boolean> {
    if (request.principal.type !== PrincipalType.USER) {
        return false
    }
    const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
    return user.tenantRole === TenantRole.ADMIN
}

const ExecutionFilteredWithNoSteps = Execution.omit({ steps: true })

const ListRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_RUN, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['executions'],
        description: 'List Workflow Runs',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListExecutionsRequestQuery,
        response: {
            [StatusCodes.OK]: SeekPage(ExecutionFilteredWithNoSteps),
        },
    },
}

const GetRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_RUN, {
                type: WorkspaceResourceType.TABLE,
                tableName: ExecutionEntity,
            }),
    },
    schema: {
        tags: ['executions'],
        description: 'Get Workflow Run',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({
            id: EntityId,
        }),
        response: {
            [StatusCodes.OK]: Execution,
        },
    },
}

const RetryWorkflowRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_RUN, {
                type: WorkspaceResourceType.TABLE,
                tableName: ExecutionEntity,
            }),
    },
    schema: {
        params: z.object({
            id: EntityId,
        }),
        body: RetryWorkflowRequestBody,
    },
}

const BulkCancelWorkflowRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_RUN, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        tags: ['executions'],
        description: 'Cancel multiple paused/queued workflow runs',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: BulkCancelWorkflowRequestBody,
    },
}

const ArchiveExecutionRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_RUN, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        body: BulkArchiveActionOnRunsRequestBody,
    },
}

const TOP_FAILING_WORKFLOWS_LIMIT = 5
const OVERVIEW_LIST_LIMIT = 5

const WorkspaceOverviewRouteConfig = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_RUN, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['executions'],
        description: 'Workspace run overview',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: WorkspaceOverviewRequest,
        response: {
            [StatusCodes.OK]: WorkspaceOverviewResponse,
        },
    },
}

const CountByStatusRouteConfig = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_RUN, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['executions'],
        description: 'Count Workflow Runs by Status',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: CountExecutionsByStatusRequest,
        response: {
            [StatusCodes.OK]: CountExecutionsByStatusResponse,
        },
    },
}

const BulkRetryWorkflowRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        body: BulkActionOnRunsRequestBody,
    },
}


