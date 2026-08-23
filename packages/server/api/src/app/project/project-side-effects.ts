import { ActivepiecesError, ErrorCode, isNil, ProjectId } from '@activepieces/core-utils'
import { FlowStatus } from '@activepieces/core-execution'
import { Project, ProjectType, ProjectWithLimits } from '@activepieces/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { flowRepo } from '../flows/flow/flow.repo'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { projectRepo } from './project-repo'
import { projectService } from './project-service'

const HARD_DELETE_GRACE_PERIOD_DAYS = 7

export const projectSideEffects = (log: FastifyBaseLogger) => ({
    async enrich(project: Project): Promise<ProjectWithLimits> {
        const [totalFlows, activeFlows] = await Promise.all([
            flowRepo().countBy({ projectId: project.id }),
            flowRepo().countBy({ projectId: project.id, status: FlowStatus.ENABLED }),
        ])
        const { deleted: _deleted, ...rest } = project
        return {
            ...rest,
            analytics: {
                totalFlows,
                activeFlows,
            },
        }
    },

    async assertDeletable(projectId: ProjectId): Promise<void> {
        const activeFlows = await flowRepo().countBy({
            projectId,
            status: FlowStatus.ENABLED,
        })
        if (activeFlows > 0) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Project has ${activeFlows} enabled flow(s). Disable them before deleting the project.`,
                },
            })
        }
    },

    async scheduleHardDelete(projectId: ProjectId): Promise<void> {
        const platformId = await projectService(log).getPlatformId(projectId)
        const preDeletedFlowIds = await flowRepo()
            .createQueryBuilder('flow')
            .select('flow.id')
            .where({ projectId, deleted: IsNull() })
            .getMany()
            .then((flows) => flows.map((flow) => flow.id))

        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.HARD_DELETE_PROJECT,
                data: { projectId, platformId, preDeletedFlowIds },
                jobId: `hard-delete-project-${projectId}`,
            },
            schedule: {
                type: 'one-time',
                date: dayjs().add(HARD_DELETE_GRACE_PERIOD_DAYS, 'day'),
            },
        })
    },

    async deletePersonalProjectForUser({ userId, platformId }: DeletePersonalProjectParams): Promise<void> {
        const personalProjects = await projectRepo().findBy({
            ownerId: userId,
            platformId,
            type: ProjectType.PERSONAL,
        })
        for (const project of personalProjects) {
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
    platformId: string
}
