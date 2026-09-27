import { EntityId, Permission } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ApplicationEventName,
    InstanceLimitKey,
    InstanceLimitsResponse,
    PrincipalType,
    ProjectLimitsListResponse,
    ProjectLimitsUsage,
    ProjectWorkspaceQuery,
    UpdateProjectLimitsRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { projectRepo } from '../project/project-repo'
import { instanceConcurrency } from '../workers/job-queue/interceptors/instance-concurrency-interceptor'
import { instanceLimits } from './instance-limits'
import { projectLimitsService } from './project-limits.service'
import { runQuotaUtils } from './run-quota-utils'
import { runQuota } from './run-quota.service'

export const limitsController: FastifyPluginAsyncZod = async (app) => {
    app.get('/instance', InstanceRequest, async (request): Promise<InstanceLimitsResponse> => {
        const [running, runsThisMonth] = await Promise.all([
            instanceConcurrency.currentlyRunning(),
            runQuota(request.log).instanceUsageThisMonth(),
        ])
        const now = dayjsUtil()
        return {
            limits: instanceLimits.describe({
                resolved: instanceLimits.current(),
                usage: {
                    [InstanceLimitKey.CONCURRENT_RUNS]: running,
                    [InstanceLimitKey.RUNS_PER_MONTH]: runsThisMonth,
                },
            }),
            monthStart: runQuotaUtils.monthStart(now),
            monthEnd: now.endOf('month').toISOString(),
            runsThisMonth,
        }
    })

    app.get('/projects', ProjectsRequest, async (request): Promise<ProjectLimitsListResponse> => {
        return projectLimitsService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/projects/:projectId', UpdateRequest, async (request): Promise<ProjectLimitsUsage> => {
        const updated = await projectLimitsService(request.log).update({
            tenantId: request.principal.tenant.id,
            projectId: request.params.projectId,
            request: request.body,
        })
        const project = await projectRepo().findOne({ where: { id: request.params.projectId }, select: ['id', 'displayName'] })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PROJECT_LIMITS_UPDATED,
            data: {
                target: project?.displayName ?? request.params.projectId,
                detail: `workflows=${request.body.workflowsLimit ?? 'inherit'}, monthlyRuns=${request.body.monthlyRunsLimit ?? 'inherit'}`,
            },
        })
        return updated
    })

    app.get('/project-usage', ProjectUsageRequest, async (request): Promise<ProjectLimitsUsage> => {
        return projectLimitsService(request.log).usage({ projectId: request.projectId })
    })
}

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])

const InstanceRequest = {
    config: { security: adminOnly },
    schema: { tags: ['limits'], response: { 200: InstanceLimitsResponse } },
}

const ProjectsRequest = {
    config: { security: adminOnly },
    schema: { tags: ['limits'], response: { 200: ProjectLimitsListResponse } },
}

const UpdateRequest = {
    config: { security: adminOnly },
    schema: {
        tags: ['limits'],
        params: z.object({ projectId: EntityId }),
        body: UpdateProjectLimitsRequestBody,
        response: { 200: ProjectLimitsUsage },
    },
}

const ProjectUsageRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['limits'], querystring: ProjectWorkspaceQuery, response: { 200: ProjectLimitsUsage } },
}
