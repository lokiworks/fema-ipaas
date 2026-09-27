import { ComponentHealthCheck, ComponentHealthReport, DiagnosticsBundle, GetDiagnosticsResponse, GetSystemHealthChecksResponse, PrincipalType, SetupChecklist, SetupStatus, SystemOverview, TenantMetricsHealthHistory, TenantMetricsLive, TenantMetricsReport, TenantMetricsReportRequest } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { componentHealthService } from './component-health.service'
import { healthMetricsService } from './health-metrics.service'
import { healthStatusService } from './health.service'
import { systemOverviewService } from './system-overview.service'

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

    app.get('/components', GetComponentHealthRequest, async (request): Promise<ComponentHealthReport> => {
        return componentHealthService(request.log).check({ tenantId: request.principal.tenant.id })
    })

    app.post('/backup-confirmation', ConfirmBackupRequest, async (request): Promise<ComponentHealthCheck> => {
        return componentHealthService(request.log).confirmBackup()
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

    app.get('/setup', GetSetupStatusRequest, async (request) => {
        return systemOverviewService(request.log).getSetupStatus()
    })

    app.get('/setup-checklist', GetSetupChecklistRequest, async (request) => {
        return systemOverviewService(request.log).getSetupChecklist({ tenantId: request.principal.tenant.id })
    })

    app.get('/overview', GetSystemOverviewRequest, async (request) => {
        return systemOverviewService(request.log).getOverview({ tenantId: request.principal.tenant.id })
    })

    app.get('/diagnostics-bundle', GetDiagnosticsBundleRequest, async (request) => {
        return systemOverviewService(request.log).getDiagnosticsBundle({ tenantId: request.principal.tenant.id })
    })
}

const GetComponentHealthRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        response: {
            [StatusCodes.OK]: ComponentHealthReport,
        },
    },
}

const ConfirmBackupRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        response: {
            [StatusCodes.OK]: ComponentHealthCheck,
        },
    },
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

const GetSystemOverviewRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['health'],
        description: 'Release, update check, infrastructure versions, encryption key source and optional services',
        response: {
            200: SystemOverview,
        },
    },
}

const GetDiagnosticsBundleRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['health'],
        description: 'Secret-free deployment summary to share when reporting a problem',
        response: {
            200: DiagnosticsBundle,
        },
    },
}

const GetSetupStatusRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        tags: ['health'],
        description: 'Installation checks, only filled in before the first account exists',
        response: {
            200: SetupStatus,
        },
    },
}

const GetSetupChecklistRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['health'],
        response: {
            200: SetupChecklist,
        },
    },
}
