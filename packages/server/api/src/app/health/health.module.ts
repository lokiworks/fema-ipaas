import { GetDiagnosticsResponse, GetSystemHealthChecksResponse, PrincipalType, TenantMetricsHealthHistory, TenantMetricsLive, TenantMetricsReport, TenantMetricsReportRequest } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { healthMetricsService } from './health-metrics.service'
import { healthStatusService } from './health.service'

export const healthModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(healthController, { prefix: '/v1/health' })
}

const healthController: FastifyPluginAsyncZod = async (app) => {
    app.get(
        '/',
        {
            config: {
                security: securityAccess.public(),
            },
        },
        async (_request, reply) => {
            const isHealthy = await healthStatusService(app.log).isHealthy()
            if (!isHealthy) {
                await reply.status(StatusCodes.SERVICE_UNAVAILABLE).send({ status: 'Unhealthy' })
                return
            }
            await reply.status(StatusCodes.OK).send({ status: 'Healthy' })
        },
    ),
    app.get('/system', GetSystemHealthChecks, async (request, reply) => {
        await reply.status(StatusCodes.OK).send(await healthStatusService(app.log).getSystemHealthChecks(request.principal.tenant.id))
    })

    app.get('/run-metrics', GetRunMetricsRequest, async (request) => {
        const { tenant } = request.principal
        const { createdAfter, createdBefore } = request.query
        return healthMetricsService(request.log).getRunMetrics(tenant.id, { createdAfter, createdBefore })
    })

    app.get('/queue-metrics', GetQueueMetricsRequest, async (request) => {
        const { tenant } = request.principal
        const { createdAfter, createdBefore } = request.query
        return healthMetricsService(request.log).getQueueMetrics(tenant.id, { createdAfter, createdBefore })
    })

    app.get('/history', GetHealthHistoryRequest, async (request) => {
        const { tenant } = request.principal
        return healthMetricsService(request.log).getHealthHistory(tenant.id)
    })

    app.get('/diagnostics', GetDiagnosticsRequest, async (request) => {
        return healthStatusService(app.log).getDiagnostics(request.principal.tenant.id)
    })
}

const GetSystemHealthChecks = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    response: {
        200: {
            description: 'System health checks',
            type: GetSystemHealthChecksResponse,
        },
    },
}

const GetRunMetricsRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['health'],
        querystring: TenantMetricsReportRequest,
        response: {
            200: TenantMetricsReport,
        },
    },
}

const GetQueueMetricsRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['health'],
        querystring: TenantMetricsReportRequest,
        response: {
            200: TenantMetricsLive,
        },
    },
}

const GetHealthHistoryRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['health'],
        response: {
            200: TenantMetricsHealthHistory,
        },
    },
}

const GetDiagnosticsRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['health'],
        description: 'Server-measured infra round-trip latency (db/redis/storage) + effective config',
        response: {
            200: GetDiagnosticsResponse,
        },
    },
}
