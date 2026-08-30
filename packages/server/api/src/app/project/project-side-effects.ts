import { ApplicationError, ErrorCode, isNil, ProjectId } from '@fema-ipaas/core-utils'
import { Project, ProjectType, ProjectWithLimits, Tenant } from '@fema-ipaas/shared'
import { WorkflowStatus } from '@fema-ipaas/workflow-core'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { TenantEntity } from '../tenant/tenant.entity'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { projectRepo } from './project-repo'
import { projectService } from './project-service'

const tenantRepo = repoFactory<Tenant>(TenantEntity)

const HARD_DELETE_GRACE_PERIOD_DAYS = 7

export const projectSideEffects = (log: FastifyBaseLogger) => ({
    async enrich(project: Project): Promise<ProjectWithLimits> {
        const [totalWorkflows, activeWorkflows] = await Promise.all([
            workflowRepo().countBy({ projectId: project.id }),
            workflowRepo().countBy({ projectId: project.id, status: WorkflowStatus.ENABLED }),
        ])
        const { deleted: _deleted, ...rest } = project
        return {
            ...rest,
            analytics: {
                totalWorkflows,
                activeWorkflows,
            },
        }
    },

    async assertDeletable(projectId: ProjectId): Promise<void> {
        const activeWorkflows = await workflowRepo().countBy({
            projectId,
            status: WorkflowStatus.ENABLED,
        })
        if (activeWorkflows > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Project has ${activeWorkflows} enabled workflow(s). Disable them before deleting the project.`,
                },
            })
        }
    },

    async scheduleHardDelete(projectId: ProjectId): Promise<void> {
        const tenantId = await projectService(log).getTenantId(projectId)
        const preDeletedWorkflowIds = await workflowRepo()
            .find({ where: { projectId }, select: ['id'] })
            .then((workflows) => workflows.map((workflow) => workflow.id))

        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.HARD_DELETE_PROJECT,
                data: { projectId, tenantId, preDeletedWorkflowIds },
                jobId: `hard-delete-project-${projectId}`,
            },
            schedule: {
                type: 'one-time',
                date: dayjs().add(HARD_DELETE_GRACE_PERIOD_DAYS, 'day'),
            },
        })
    },

    async deletePersonalProjectForUser({ userId, tenantId }: DeletePersonalProjectParams): Promise<void> {
        const personalProjects = await projectRepo().findBy({
            ownerId: userId,
            tenantId,
            type: ProjectType.PERSONAL,
        })
        if (personalProjects.length === 0) {
            return
        }
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        for (const project of personalProjects) {
            await projectRepo().update({ id: project.id }, { ownerId: tenant.ownerId })
            await projectRepo().softDelete({ id: project.id })
            await this.scheduleHardDelete(project.id)
        }
    },

    async cancelHardDelete(projectId: ProjectId): Promise<void> {
        const job = await systemJobsSchedule(log).getJob(`hard-delete-project-${projectId}`)
        if (isNil(job)) {
            return
        }
        await job.remove()
    },
})

type DeletePersonalProjectParams = {
    userId: string
    tenantId: string
}
