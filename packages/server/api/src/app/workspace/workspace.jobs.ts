import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
import { folderRepo } from '../workflows/folder/folder.service'
import { batchDeleteByWorkflowId } from '../workflows/workflow/workflow.jobs'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workspaceRepo } from './workspace-repo'

export const workspaceBackgroundJobs = (log: FastifyBaseLogger) => ({

    hardDeleteWorkspaceHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_WORKSPACE>) => {
        const { workspaceId } = data
        const stillDeleted = await workspaceRepo().findOne({
            where: { id: workspaceId },
            withDeleted: true,
        })
        if (stillDeleted === null || stillDeleted.deleted === null) {
            log.info({ workspace: { id: workspaceId } }, '[hardDeleteWorkspaceHandler] Workspace restored or already gone, skipping')
            return
        }

        const workflows = await workflowRepo().find({ where: { workspaceId }, select: ['id'], withDeleted: true })
        for (const workflow of workflows) {
            await batchDeleteByWorkflowId(workflow.id)
            await workflowRepo().delete({ id: workflow.id })
        }
        await folderRepo().delete({ workspaceId })
        await connectionsRepo().delete({ workspaceIds: ArrayContains([workspaceId]) })
        await workspaceRepo().delete({ id: workspaceId })

        log.info({ workspace: { id: workspaceId }, workflowCount: workflows.length }, '[hardDeleteWorkspaceHandler] Workspace permanently deleted')
    },

})
