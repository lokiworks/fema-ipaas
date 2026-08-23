import { ErrorCode, isNil, PlatformError, WorkspaceId } from '@fema/core-utils'
import { Workspace, WorkspaceType, WorkspaceWithLimits } from '@fema/shared'
import { WorkflowStatus } from '@fema/workflow-core'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workspaceRepo } from './workspace-repo'
import { workspaceService } from './workspace-service'

const HARD_DELETE_GRACE_PERIOD_DAYS = 7

export const workspaceSideEffects = (log: FastifyBaseLogger) => ({
    async enrich(workspace: Workspace): Promise<WorkspaceWithLimits> {
        const [totalWorkflows, activeWorkflows] = await Promise.all([
            workflowRepo().countBy({ workspaceId: workspace.id }),
            workflowRepo().countBy({ workspaceId: workspace.id, status: WorkflowStatus.ENABLED }),
        ])
        const { deleted: _deleted, ...rest } = workspace
        return {
            ...rest,
            analytics: {
                totalWorkflows,
                activeWorkflows,
            },
        }
    },

    async assertDeletable(workspaceId: WorkspaceId): Promise<void> {
        const activeWorkflows = await workflowRepo().countBy({
            workspaceId,
            status: WorkflowStatus.ENABLED,
        })
        if (activeWorkflows > 0) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Workspace has ${activeWorkflows} enabled workflow(s). Disable them before deleting the workspace.`,
                },
            })
        }
    },

    async scheduleHardDelete(workspaceId: WorkspaceId): Promise<void> {
        const platformId = await workspaceService(log).getPlatformId(workspaceId)
        const preDeletedWorkflowIds = await workflowRepo()
            .createQueryBuilder('workflow')
            .select('workflow.id')
            .where({ workspaceId, deleted: IsNull() })
            .getMany()
            .then((workflows) => workflows.map((workflow) => workflow.id))

        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.HARD_DELETE_WORKSPACE,
                data: { workspaceId, platformId, preDeletedWorkflowIds },
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
