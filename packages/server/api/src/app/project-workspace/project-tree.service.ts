import { isNil, ProjectId } from '@fema-ipaas/core-utils'
import { ProjectTree, ProjectTreeWorkflow, WorkflowOperationStatus, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { folderRepo } from '../workflows/folder/folder.service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'

export const projectTreeService = (_log: FastifyBaseLogger) => ({
    async getTree({ projectId }: { projectId: ProjectId }): Promise<ProjectTree> {
        const [folders, rows] = await Promise.all([
            folderRepo().find({ where: { projectId }, order: { displayOrder: 'ASC', displayName: 'ASC' } }),
            listWorkflowRows({ projectId }),
        ])
        return {
            folders,
            workflows: rows.map(toTreeWorkflow),
        }
    },
})

async function listWorkflowRows({ projectId }: { projectId: ProjectId }): Promise<WorkflowRow[]> {
    return workflowRepo().query(
        `SELECT w.id, w."folderId", w.status, w."publishedVersionId", w."testVersionId", w.updated, w."ownerId", w.metadata,
                lv.id AS "latestVersionId", lv."displayName", lv.state
         FROM workflow w
         JOIN LATERAL (
             SELECT v.id, v."displayName", v.state
             FROM workflow_version v
             WHERE v."workflowId" = w.id
             ORDER BY v.created DESC
             LIMIT 1
         ) lv ON true
         WHERE w."projectId" = $1 AND w."operationStatus" != $2
         ORDER BY lower(lv."displayName") ASC`,
        [projectId, WorkflowOperationStatus.DELETING],
    )
}

function descriptionOf(metadata: unknown): string | null {
    if (typeof metadata !== 'object' || metadata === null || !('description' in metadata)) {
        return null
    }
    return typeof metadata.description === 'string' && metadata.description.length > 0 ? metadata.description : null
}

function toTreeWorkflow(row: WorkflowRow): ProjectTreeWorkflow {
    const deployed = !isNil(row.publishedVersionId) || !isNil(row.testVersionId)
    return {
        id: row.id,
        displayName: row.displayName,
        folderId: row.folderId,
        status: row.status,
        published: !isNil(row.publishedVersionId),
        hasUnpublishedChanges: deployed && row.state === WorkflowVersionState.DRAFT,
        updated: new Date(row.updated).toISOString(),
        ownerId: row.ownerId,
        description: descriptionOf(row.metadata),
    }
}

type WorkflowRow = {
    id: string
    folderId: string | null
    status: WorkflowStatus
    publishedVersionId: string | null
    testVersionId: string | null
    updated: string | Date
    ownerId: string | null
    metadata: unknown
    latestVersionId: string
    displayName: string
    state: WorkflowVersionState
}
