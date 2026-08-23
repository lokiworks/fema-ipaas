import { ErrorCode, isNil, PlatformError, WorkspaceId } from '@fema/core-utils'
import { Workspace, WorkspaceType, WorkspaceWithLimits } from '@fema/shared'
import { FlowStatus } from '@fema/workflow-core'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { flowRepo } from '../flows/flow/flow.repo'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { workspaceRepo } from './workspace-repo'
import { workspaceService } from './workspace-service'

const HARD_DELETE_GRACE_PERIOD_DAYS = 7

export const workspaceSideEffects = (log: FastifyBaseLogger) => ({
    async enrich(workspace: Workspace): Promise<WorkspaceWithLimits> {
        const [totalFlows, activeFlows] = await Promise.all([
            flowRepo().countBy({ workspaceId: workspace.id }),
            flowRepo().countBy({ workspaceId: workspace.id, status: FlowStatus.ENABLED }),
        ])
        const { deleted: _deleted, ...rest } = workspace
        return {
            ...rest,
            analytics: {
                totalFlows,
                activeFlows,
            },
        }
    },

    async assertDeletable(workspaceId: WorkspaceId): Promise<void> {
        const activeFlows = await flowRepo().countBy({
            workspaceId,
            status: FlowStatus.ENABLED,
        })
        if (activeFlows > 0) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Workspace has ${activeFlows} enabled flow(s). Disable them before deleting the workspace.`,
                },
            })
        }
    },

    async scheduleHardDelete(workspaceId: WorkspaceId): Promise<void> {
        const platformId = await workspaceService(log).getPlatformId(workspaceId)
        const preDeletedFlowIds = await flowRepo()
            .createQueryBuilder('flow')
            .select('flow.id')
            .where({ workspaceId, deleted: IsNull() })
            .getMany()
            .then((flows) => flows.map((flow) => flow.id))

        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.HARD_DELETE_WORKSPACE,
                data: { workspaceId, platformId, preDeletedFlowIds },
                jobId: `hard-delete-workspace-${workspaceId}`,
            },
            schedule: {
                type: 'one-time',
                date: dayjs().add(HARD_DELETE_GRACE_PERIOD_DAYS, 'day'),
            },
        })
    },

    async deletePersonalWorkspaceForUser({ userId, platformId }: DeletePersonalWorkspaceParams): Promise<void> {
        const personalWorkspaces = await workspaceRepo().findBy({
            ownerId: userId,
            platformId,
            type: WorkspaceType.PERSONAL,
        })
        for (const workspace of personalWorkspaces) {
            await workspaceRepo().softDelete({ id: workspace.id })
            await this.scheduleHardDelete(workspace.id)
        }
    },

    async cancelHardDelete(workspaceId: WorkspaceId): Promise<void> {
        const job = await systemJobsSchedule(log).getJob(`hard-delete-workspace-${workspaceId}`)
        if (isNil(job)) {
            return
        }
        await job.remove()
    },
})

type DeletePersonalWorkspaceParams = {
    userId: string
    platformId: string
}
