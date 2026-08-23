import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { batchDeleteByFlowId } from '../flows/flow/flow.jobs'
import { flowRepo } from '../flows/flow/flow.repo'
import { folderRepo } from '../flows/folder/folder.service'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
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

        const flows = await flowRepo().find({ where: { workspaceId }, select: ['id'], withDeleted: true })
        for (const flow of flows) {
            await batchDeleteByFlowId(flow.id)
            await flowRepo().delete({ id: flow.id })
        }
        await folderRepo().delete({ workspaceId })
        await connectionsRepo().delete({ workspaceIds: ArrayContains([workspaceId]) })
        await workspaceRepo().delete({ id: workspaceId })

        log.info({ workspace: { id: workspaceId }, flowCount: flows.length }, '[hardDeleteWorkspaceHandler] Workspace permanently deleted')
    },

})
