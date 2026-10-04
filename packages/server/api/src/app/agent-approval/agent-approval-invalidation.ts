import { ProjectId, WorkflowId } from '@fema-ipaas/core-utils'
import { AgentApprovalInvalidReason, AgentApprovalStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { repoFactory } from '../core/db/repo-factory'
import { AgentApprovalEntity } from './agent-approval.entity'

const approvalRepo = repoFactory(AgentApprovalEntity)

export const agentApprovalInvalidation = {
    async invalidateForWorkflow({ workflowId, projectId }: { workflowId: WorkflowId, projectId: ProjectId }): Promise<number> {
        const result = await approvalRepo()
            .createQueryBuilder()
            .update()
            .set({
                status: AgentApprovalStatus.INVALIDATED,
                invalidReason: AgentApprovalInvalidReason.WORKFLOW_DELETED,
                decidedAt: dayjs().toISOString(),
            })
            .where({ workflowId, projectId, status: AgentApprovalStatus.PENDING })
            .execute()
        return result.affected ?? 0
    },

    async invalidateForRun({ approvalId, projectId }: { approvalId: string, projectId: ProjectId }): Promise<void> {
        await approvalRepo()
            .createQueryBuilder()
            .update()
            .set({
                status: AgentApprovalStatus.INVALIDATED,
                invalidReason: AgentApprovalInvalidReason.RUN_DELETED,
                decidedAt: dayjs().toISOString(),
            })
            .where({ id: approvalId, projectId, status: AgentApprovalStatus.PENDING })
            .execute()
    },
}
