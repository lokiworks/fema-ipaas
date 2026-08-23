import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { batchDeleteByFlowId } from '../flows/flow/flow.jobs'
import { flowRepo } from '../flows/flow/flow.repo'
import { folderRepo } from '../flows/folder/folder.service'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
import { projectRepo } from './project-repo'

export const projectBackgroundJobs = (log: FastifyBaseLogger) => ({

    hardDeleteProjectHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_PROJECT>) => {
        const { projectId } = data
        const stillDeleted = await projectRepo().findOne({
            where: { id: projectId },
            withDeleted: true,
        })
        if (stillDeleted === null || stillDeleted.deleted === null) {
            log.info({ project: { id: projectId } }, '[hardDeleteProjectHandler] Project restored or already gone, skipping')
            return
        }

        const flows = await flowRepo().find({ where: { projectId }, select: ['id'], withDeleted: true })
        for (const flow of flows) {
            await batchDeleteByFlowId(flow.id)
            await flowRepo().delete({ id: flow.id })
        }
        await folderRepo().delete({ projectId })
        await connectionsRepo().delete({ projectIds: ArrayContains([projectId]) })
        await projectRepo().delete({ id: projectId })

        log.info({ project: { id: projectId }, flowCount: flows.length }, '[hardDeleteProjectHandler] Project permanently deleted')
    },

})
