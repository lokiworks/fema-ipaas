import { assertNotNullOrUndefined } from '@fema-ipaas/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { SystemJobData, SystemJobName } from '../../helper/system-jobs/common'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { executionRepo } from '../execution/execution-service'
import { WaitpointEntity } from '../execution/waitpoint/waitpoint-entity'
import { workflowVersionRepo } from '../workflow-version/workflow-version.service'
import { workflowExecutionCache } from './workflow-execution-cache'
import { workflowSideEffects } from './workflow-service-side-effects'
import { workflowRepo } from './workflow.repo'

const waitpointRepo = repoFactory(WaitpointEntity)

const BATCH_SIZE = 1000

export async function batchDeleteByWorkflowId(workflowId: string): Promise<void> {
    await waitpointRepo()
        .createQueryBuilder()
        .delete()
        .where('"executionId" IN (SELECT id FROM execution WHERE "workflowId" = :workflowId)', { workflowId })
        .execute()

    let deleted: number
    do {
        const result = await executionRepo()
            .createQueryBuilder()
            .delete()
            .where('id IN (SELECT id FROM execution WHERE "workflowId" = :workflowId LIMIT :limit)', { workflowId, limit: BATCH_SIZE })
            .execute()
        deleted = result.affected ?? 0
    } while (deleted > 0)

    await workflowRepo().update({ id: workflowId }, { publishedVersionId: null })

    do {
        const result = await workflowVersionRepo()
            .createQueryBuilder()
            .delete()
            .where('id IN (SELECT id FROM workflow_version WHERE "workflowId" = :workflowId LIMIT :limit)', { workflowId, limit: BATCH_SIZE })
            .execute()
        deleted = result.affected ?? 0
    } while (deleted > 0)
}

export const workflowBackgroundJobs = (log: FastifyBaseLogger) => ({

    deleteWorkflowHandler: async (data: SystemJobData<SystemJobName.DELETE_WORKFLOW>) => {
        const { workflow, preDeleteDone } = data
        const job = await systemJobsSchedule(log).getJob(`delete-workflow-${workflow.id}`)
        assertNotNullOrUndefined(job, 'job is required')

        const workflowExists = await workflowRepo().existsBy({ id: workflow.id })
        if (!workflowExists) {
            log.info({ workflow: { id: workflow.id } }, '[deleteWorkflowHandler] Workflow already deleted, skipping')
            return
        }

        if (!preDeleteDone) {
            await workflowSideEffects(log).preDelete({
                workflowToDelete: workflow,
            })
            await job.updateData({
                ...data,
                preDeleteDone: true,
            })
        }
        await batchDeleteByWorkflowId(workflow.id)
        await workflowRepo().delete({ id: workflow.id })
        await workflowExecutionCache(log).invalidate(workflow.id)
    },

})