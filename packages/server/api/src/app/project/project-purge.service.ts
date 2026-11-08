import { ProjectId } from '@fema-ipaas/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { AgentApprovalEntity } from '../agent-approval/agent-approval.entity'
import { AiUsageEntity } from '../ai/ai-usage.entity'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { purgeBatch } from '../core/db/purge-batch'
import { DataStoreEntity } from '../data-store/data-store.entity'
import { fileService } from '../file/file.service'
import { IssueActivityEntity, IssueEntity, IssueWorkflowEntity } from '../issue/issue.entity'
import { MappingTableEntity } from '../mapping-table/mapping-table.entity'
import { McpServiceEntity, McpServiceMemberEntity, McpServiceUsageEntity } from '../mcp-service/mcp-service.entity'
import { ReconciliationDifferenceEntity, ReconciliationRuleEntity, ReconciliationRunEntity } from '../reconciliation/reconciliation.entity'
import { ConnectionReplacementEntity, ReleaseChangeEntity, WorkflowReleaseEntity } from '../release/release.entity'
import { ReliabilityEventEntity } from '../reliability/reliability-event.entity'
import { SolutionInstallEntity } from '../solution/solution.entity'
import { StoreEntryEntity } from '../store-entry/store-entry-entity'
import { AppEventRoutingEntity } from '../trigger/app-event-routing/app-event-routing.entity'
import { DedupedEventEntity } from '../trigger/deduped-event/deduped-event.entity'
import { TriggerEventEntity } from '../trigger/trigger-events/trigger-event.entity'
import { TriggerSourceEntity } from '../trigger/trigger-source/trigger-source-entity'
import { UserInvitationEntity } from '../user-invitations/user-invitation.entity'
import { VariableEntity } from '../variable/variable.entity'
import { ExecutionEntity } from '../workflows/execution/execution-entity'
import { WaitpointEntity } from '../workflows/execution/waitpoint/waitpoint-entity'
import { folderRepo } from '../workflows/folder/folder.service'
import { batchDeleteByWorkflowId } from '../workflows/workflow/workflow.jobs'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { projectMemberRepo } from './project-member.repo'
import { projectRepo } from './project-repo'

export const projectPurgeService = (log: FastifyBaseLogger) => ({
    async purge({ projectId }: { projectId: ProjectId }): Promise<{ workflowCount: number }> {
        const workflows = await workflowRepo().find({ where: { projectId }, select: ['id'], withDeleted: true })
        for (const workflow of workflows) {
            await batchDeleteByWorkflowId(workflow.id)
            await workflowRepo().delete({ id: workflow.id })
        }
        await purgeMcpServices({ projectId })
        for (const entity of PROJECT_OWNED_ENTITIES) {
            await purgeBatch.deleteWhere({ entity, column: 'projectId', value: projectId })
        }
        await fileService(log).deleteAllOf({ owner: { projectId } })
        await projectMemberRepo().delete({ projectId })
        await folderRepo().delete({ projectId })
        await connectionsRepo().delete({ projectIds: ArrayContains([projectId]) })
        await projectRepo().delete({ id: projectId })
        return { workflowCount: workflows.length }
    },
})

async function purgeMcpServices({ projectId }: { projectId: ProjectId }): Promise<void> {
    const serviceIds = await purgeBatch.idsWhere({ entity: McpServiceEntity, column: 'projectId', value: projectId })
    await purgeBatch.deleteWhereIn({ entity: McpServiceMemberEntity, column: 'serviceId', values: serviceIds })
    await purgeBatch.deleteWhereIn({ entity: McpServiceUsageEntity, column: 'serviceId', values: serviceIds })
    await purgeBatch.deleteWhere({ entity: McpServiceEntity, column: 'projectId', value: projectId })
}

const PROJECT_OWNED_ENTITIES = [
    ExecutionEntity,
    WaitpointEntity,
    TriggerEventEntity,
    TriggerSourceEntity,
    AppEventRoutingEntity,
    DedupedEventEntity,
    ReliabilityEventEntity,
    ReconciliationDifferenceEntity,
    ReconciliationRunEntity,
    ReconciliationRuleEntity,
    IssueActivityEntity,
    IssueWorkflowEntity,
    IssueEntity,
    AgentApprovalEntity,
    AiUsageEntity,
    StoreEntryEntity,
    DataStoreEntity,
    MappingTableEntity,
    ReleaseChangeEntity,
    WorkflowReleaseEntity,
    ConnectionReplacementEntity,
    SolutionInstallEntity,
    UserInvitationEntity,
    VariableEntity,
]
