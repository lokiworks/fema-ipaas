import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
import { folderRepo } from '../workflows/folder/folder.service'
import { batchDeleteByWorkflowId } from '../workflows/workflow/workflow.jobs'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
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

        const workflows = await workflowRepo().find({ where: { projectId }, select: ['id'], withDeleted: true })
        for (const workflow of workflows) {
            await batchDeleteByWorkflowId(workflow.id)
            await workflowRepo().delete({ id: workflow.id })
        }
        await folderRepo().delete({ projectId })
        await connectionsRepo().delete({ projectIds: ArrayContains([projectId]) })
        await projectRepo().delete({ id: projectId })

        log.info({ project: { id: projectId }, workflowCount: workflows.length }, '[hardDeleteProjectHandler] Project permanently deleted')
    },

})
