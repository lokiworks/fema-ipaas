import { EntityId, Permission, SeekPage } from '@fema-ipaas/core-utils'
import {
    ListRunLogsRequestQuery,
    PrincipalType,
    RerunRunLogsRequestBody,
    RerunRunLogsResponse,
    RunLogDetail,
    RunLogRow,
    RunLogScope,
    TerminateRunLogRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { networkUtils } from '../helper/network-utils'
import { ExecutionEntity } from '../workflows/execution/execution-entity'
import { runLogService } from './run-log.service'

export const runLogController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRunLogsRequest, async (request): Promise<SeekPage<RunLogRow>> => {
        return runLogService(request.log).list({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            query: request.query,
        })
    })

    app.get('/scope', ScopeRequest, async (request): Promise<RunLogScope> => {
        return runLogService(request.log).scope({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/rerun', RerunRequest, async (request): Promise<RerunRunLogsResponse> => {
        return runLogService(request.log).rerun({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            executionIds: request.body.executionIds,
            strategy: request.body.strategy,
            ip: networkUtils.clientIp(request),
        })
    })

    app.get('/:id', DetailRequest, async (request): Promise<RunLogDetail> => {
        return runLogService(request.log).detail({
            id: request.params.id,
            projectId: request.projectId,
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/:id/terminate', TerminateRequest, async (request, reply) => {
        await runLogService(request.log).terminate({
            id: request.params.id,
            projectId: request.projectId,
            tenantId: request.principal.tenant.id,
            stopChildRuns: request.body.stopChildRuns,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const IdParams = z.object({ id: EntityId })

const ListRunLogsRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: {
        tags: ['run-logs'],
        description: 'List runs across the projects the current user is a member of, within each project log retention',
        querystring: ListRunLogsRequestQuery,
        response: { [StatusCodes.OK]: SeekPage(RunLogRow) },
    },
}

const ScopeRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: {
        tags: ['run-logs'],
        response: { [StatusCodes.OK]: RunLogScope },
    },
}

const RerunRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: {
        tags: ['run-logs'],
        body: RerunRunLogsRequestBody,
        response: { [StatusCodes.OK]: RerunRunLogsResponse },
    },
}

const DetailRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.READ_RUN, {
            type: ProjectResourceType.TABLE,
            tableName: ExecutionEntity,
        }),
    },
    schema: {
        tags: ['run-logs'],
        params: IdParams,
        response: { [StatusCodes.OK]: RunLogDetail },
    },
}

const TerminateRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.WRITE_RUN, {
            type: ProjectResourceType.TABLE,
            tableName: ExecutionEntity,
        }),
    },
    schema: {
        tags: ['run-logs'],
        params: IdParams,
        body: TerminateRunLogRequestBody,
    },
}
