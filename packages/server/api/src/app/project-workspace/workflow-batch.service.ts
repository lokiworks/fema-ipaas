import { ApplicationError, ErrorCode, isNil, ProjectId, TenantId, tryCatch, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    BatchDeleteResponse,
    BatchPublishCheckItem,
    BatchPublishCheckResponse,
    BatchPublishCheckStatus,
    BatchPublishResponse,
    BatchPublishResultItem,
    ConnectionStatus,
    PopulatedWorkflow,
    WorkflowOperationType,
    WorkflowReleaseStatus,
    WorkflowStatus,
    WorkflowVersionState,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { lockService } from '../core/collaborative/lock/lock.service'
import { projectService } from '../project/project-service'
import { workflowReleaseRepo, workflowReleaseService } from '../release/workflow-release.service'
import { folderRepo } from '../workflows/folder/folder.service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowService } from '../workflows/workflow/workflow.service'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { batchCheckUtils, BatchTarget } from './batch-check-utils'

export const workflowBatchService = (log: FastifyBaseLogger) => ({
    async check({ projectId, workflowIds, tenantId, userId }: CheckParams): Promise<BatchPublishCheckResponse> {
        const target = await resolveTarget({ log, projectId })
        const workflows = await loadWorkflows({ log, projectId, workflowIds })
        const unhealthy = await unhealthyConnections({ tenantId, workflows })
        const locks = await Promise.all(workflows.map((workflow) => lockService(log).getLock({ resourceId: workflow.id })))
        return {
            target,
            items: workflows.map((workflow, index) => batchCheckUtils.classify({
                target,
                workflow: {
                    id: workflow.id,
                    displayName: workflow.version.displayName,
                    valid: workflow.version.valid,
                    latestVersionId: workflow.version.id,
                    latestVersionLocked: workflow.version.state === WorkflowVersionState.LOCKED,
                    publishedVersionId: workflow.publishedVersionId ?? null,
                    testVersionId: workflow.testVersionId ?? null,
                    unhealthyConnections: workflow.version.connectionIds.filter((id) => unhealthy.has(id)).length,
                    lockedByOther: !isNil(locks[index]) && locks[index]?.userId !== userId,
                },
            })),
        }
    },

    async publish({ projectId, workflowIds, description, userId, tenantId }: PublishParams): Promise<BatchPublishResponse> {
        const check = await this.check({ projectId, workflowIds, tenantId, userId })
        const results: BatchPublishResultItem[] = []
        for (const item of check.items) {
            results.push(await publishOne({ log, item, target: check.target, projectId, userId, tenantId, description }))
        }
        return { target: check.target, items: results }
    },

    async move({ projectId, workflowIds, folderId }: MoveParams): Promise<{ moved: number }> {
        if (!isNil(folderId)) {
            const folder = await folderRepo().findOneBy({ id: folderId, projectId })
            if (isNil(folder)) {
                throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'folderParentNotFound' } })
            }
        }
        const result = await workflowRepo().update({ projectId, id: In(workflowIds) }, { folderId })
        return { moved: result.affected ?? 0 }
    },

    async delete({ projectId, workflowIds, userId }: DeleteParams): Promise<BatchDeleteResponse> {
        const pending = await workflowReleaseRepo().findBy({ projectId, workflowId: In(workflowIds), status: WorkflowReleaseStatus.PENDING })
        await Promise.all(pending.map((release) => workflowReleaseRepo().update({ id: release.id, projectId }, {
            status: WorkflowReleaseStatus.WITHDRAWN,
            decidedById: userId,
            decidedAt: dayjsUtil().toISOString(),
            comment: WORKFLOW_DELETED_WITHDRAW_COMMENT,
        })))
        const workflows = await loadWorkflows({ log, projectId, workflowIds })
        for (const workflow of workflows) {
            await workflowService(log).delete({ id: workflow.id, projectId, previousWorkflow: workflow, userId })
        }
        return { deleted: workflows.length, withdrawnReleases: pending.length }
    },
})

async function resolveTarget({ log, projectId }: { log: FastifyBaseLogger, projectId: ProjectId }): Promise<BatchTarget> {
    const project = await projectService(log).getOneOrThrow(projectId)
    return project.releasesEnabled ? 'TEST' : 'PRODUCTION'
}

async function loadWorkflows({ log, projectId, workflowIds }: LoadParams): Promise<PopulatedWorkflow[]> {
    const unique = [...new Set(workflowIds)]
    const loaded = await Promise.all(unique.map((id) => workflowService(log).getOnePopulated({ id, projectId })))
    return loaded.filter((workflow): workflow is PopulatedWorkflow => !isNil(workflow))
}

async function unhealthyConnections({ tenantId, workflows }: { tenantId: TenantId, workflows: PopulatedWorkflow[] }): Promise<Set<string>> {
    const referenced = [...new Set(workflows.flatMap((workflow) => workflow.version.connectionIds))]
    if (referenced.length === 0) {
        return new Set()
    }
    const connections = await connectionsRepo().find({ where: { tenantId, externalId: In(referenced) }, select: ['externalId', 'status'] })
    const healthy = new Set(connections.filter((connection) => connection.status === ConnectionStatus.ACTIVE).map((connection) => connection.externalId))
    return new Set(referenced.filter((id) => !healthy.has(id)))
}

async function publishOne({ log, item, target, projectId, userId, tenantId, description }: PublishOneParams): Promise<BatchPublishResultItem> {
    const base = { workflowId: item.workflowId, displayName: item.displayName }
    if (item.status === BatchPublishCheckStatus.INVALID || item.status === BatchPublishCheckStatus.UNCHANGED) {
        return { ...base, success: false, error: item.reasons[0] ?? null }
    }
    const { data: versionId, error } = await tryCatch(async () => {
        if (target === 'TEST') {
            const deployed = await workflowReleaseService(log).deployToTest({ request: { projectId, workflowId: item.workflowId }, userId, tenantId })
            return deployed.versionId
        }
        const published = await workflowService(log).update({
            id: item.workflowId,
            projectId,
            tenantId,
            userId,
            operation: { type: WorkflowOperationType.LOCK_AND_PUBLISH, request: { status: WorkflowStatus.ENABLED } },
        })
        return published.publishedVersionId
    })
    if (error) {
        log.warn({ workflow: { id: item.workflowId }, project: { id: projectId }, error }, '[workflowBatchService#publish] Publish failed')
        return { ...base, success: false, error: error instanceof Error ? error.message : 'publishFailed' }
    }
    if (!isNil(versionId) && !isNil(description) && description.length > 0) {
        await workflowVersionRepo().update({ id: versionId, workflowId: item.workflowId }, { publishNote: description })
    }
    return { ...base, success: true, error: null }
}

const WORKFLOW_DELETED_WITHDRAW_COMMENT = 'Withdrawn automatically because the workflow was deleted'

type CheckParams = {
    projectId: ProjectId
    workflowIds: string[]
    tenantId: TenantId
    userId: UserId
}

type PublishParams = CheckParams & {
    description?: string
    userId: UserId
}

type MoveParams = {
    projectId: ProjectId
    workflowIds: string[]
    folderId: string | null | undefined
}

type DeleteParams = {
    projectId: ProjectId
    workflowIds: string[]
    userId: UserId
}

type LoadParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    workflowIds: string[]
}

type PublishOneParams = {
    log: FastifyBaseLogger
    item: BatchPublishCheckItem
    target: BatchTarget
    projectId: ProjectId
    userId: UserId
    tenantId: TenantId
    description?: string
}
