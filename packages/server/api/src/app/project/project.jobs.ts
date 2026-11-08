import { FastifyBaseLogger } from 'fastify'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
import { projectPurgeService } from './project-purge.service'
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

        const { workflowCount } = await projectPurgeService(log).purge({ projectId })

        log.info({ project: { id: projectId }, workflowCount }, '[hardDeleteProjectHandler] Project permanently deleted')
    },

})
