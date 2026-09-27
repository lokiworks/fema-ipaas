import { isNil } from '@fema-ipaas/core-utils'
import { NotificationType, WorkflowRelease, WorkflowReleaseStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { notificationService } from '../notification/notification.service'
import { projectService } from '../project/project-service'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'

export const releaseSideEffects = (log: FastifyBaseLogger) => ({
    async onRequested({ release }: { release: WorkflowRelease }): Promise<void> {
        if (release.status !== WorkflowReleaseStatus.PENDING) {
            return
        }
        await notificationService(log).notify({
            tenantId: await projectService(log).getTenantId(release.projectId),
            projectId: release.projectId,
            recipientIds: release.approverIds,
            type: NotificationType.RELEASE_REQUESTED,
            title: await workflowName(release.workflowVersionId),
            body: release.note,
            link: releaseLink(release),
            actorId: release.requestedById,
        })
    },

    async onDecided({ release }: { release: WorkflowRelease }): Promise<void> {
        const type = release.status === WorkflowReleaseStatus.DEPLOYED
            ? NotificationType.RELEASE_APPROVED
            : release.status === WorkflowReleaseStatus.REJECTED ? NotificationType.RELEASE_REJECTED : null
        if (isNil(type)) {
            return
        }
        await notificationService(log).notify({
            tenantId: await projectService(log).getTenantId(release.projectId),
            projectId: release.projectId,
            recipientIds: [release.requestedById],
            type,
            title: await workflowName(release.workflowVersionId),
            body: release.comment,
            link: releaseLink(release),
            actorId: release.decidedById,
        })
    },

    async onRolledBack({ projectId, workflowId, versionId, approverIds, actorId }: OnRolledBackParams): Promise<void> {
        await notificationService(log).notify({
            tenantId: await projectService(log).getTenantId(projectId),
            projectId,
            recipientIds: approverIds,
            type: NotificationType.RELEASE_ROLLED_BACK,
            title: await workflowName(versionId),
            link: `/projects/${projectId}/workflows/${workflowId}`,
            actorId,
        })
    },
})

async function workflowName(versionId: string): Promise<string> {
    const version = await workflowVersionRepo().findOne({ where: { id: versionId }, select: ['id', 'displayName'] })
    return version?.displayName ?? ''
}

function releaseLink(release: WorkflowRelease): string {
    return `/projects/${release.projectId}/releases/${release.id}`
}

type OnRolledBackParams = {
    projectId: string
    workflowId: string
    versionId: string
    approverIds: string[]
    actorId: string
}
