import { isNil, ProjectId } from '@fema-ipaas/core-utils'
import { ProjectTree, ProjectTreeWorkflow, WorkflowOperationStatus, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { folderRepo } from '../workflows/folder/folder.service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { draftContentUtils } from './draft-content-utils'

export const projectTreeService = (_log: FastifyBaseLogger) => ({
    async getTree({ projectId }: { projectId: ProjectId }): Promise<ProjectTree> {
        const [folders, rows] = await Promise.all([
            folderRepo().find({ where: { projectId }, order: { displayOrder: 'ASC', displayName: 'ASC' } }),
            listWorkflowRows({ projectId }),
        ])
        const changedWorkflowIds = await findWorkflowIdsWithDraftChanges({ rows })
        return {
            folders,
            workflows: rows.map((row) => toTreeWorkflow({ row, hasDraftChanges: changedWorkflowIds.has(row.id) })),
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

async function findWorkflowIdsWithDraftChanges({ rows }: { rows: WorkflowRow[] }): Promise<Set<string>> {
    const candidates = rows.filter((row) => row.state === WorkflowVersionState.DRAFT && !isNil(baselineVersionId(row)))
    if (candidates.length === 0) {
        return new Set()
    }
    const versionIds = candidates.flatMap((row) => [row.latestVersionId, baselineVersionId(row)]).filter((id): id is string => !isNil(id))
    const versions = await workflowVersionRepo().find({
        where: { id: In(versionIds) },
        select: { id: true, displayName: true, trigger: true },
    })
    const versionById = new Map(versions.map((version) => [version.id, version]))
    const changed = candidates.filter((row) => {
        const draft = versionById.get(row.latestVersionId)
        const baselineId = baselineVersionId(row)
        const baseline = isNil(baselineId) ? undefined : versionById.get(baselineId)
        if (isNil(draft) || isNil(baseline)) {
            return true
        }
        return draftContentUtils.hasContentChanges({ before: baseline, after: draft })
    })
    return new Set(changed.map((row) => row.id))
}

function baselineVersionId(row: WorkflowRow): string | null {
    return row.testVersionId ?? row.publishedVersionId
}

function toTreeWorkflow({ row, hasDraftChanges }: { row: WorkflowRow, hasDraftChanges: boolean }): ProjectTreeWorkflow {
    return {
        id: row.id,
        displayName: row.displayName,
        folderId: row.folderId,
        status: row.status,
        published: !isNil(row.publishedVersionId),
        hasUnpublishedChanges: hasDraftChanges,
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
