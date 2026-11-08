import { isNil, ProjectId, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import { WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../database/database-connection'
import { projectRepo } from '../project/project-repo'
import { tenantUsageSnapshotUtils } from './tenant-usage-snapshot.utils'

export const tenantUsageSnapshotService = (log: FastifyBaseLogger) => ({
    async recordAll(): Promise<void> {
        const today = tenantUsageSnapshotUtils.todayUtc({ now: new Date() })
        await databaseConnection().query(tenantUsageSnapshotUtils.buildRecordAllQuery(), [today, WorkflowStatus.ENABLED])
        log.info({ date: today }, '[tenantUsageSnapshot] recorded the enabled workflow count of every tenant')
    },

    async recordTenant({ tenantId }: { tenantId: TenantId }): Promise<void> {
        const today = tenantUsageSnapshotUtils.todayUtc({ now: new Date() })
        await databaseConnection().query(tenantUsageSnapshotUtils.buildRecordOneQuery(), [tenantId, today, WorkflowStatus.ENABLED])
    },

    async recordForProject({ projectId }: { projectId: ProjectId }): Promise<void> {
        const project = await projectRepo().findOne({ where: { id: projectId }, select: ['id', 'tenantId'] })
        if (isNil(project)) {
            return
        }
        const { error } = await tryCatch(() => this.recordTenant({ tenantId: project.tenantId }))
        if (!isNil(error)) {
            log.warn({ tenant: { id: project.tenantId }, error: String(error) }, '[tenantUsageSnapshot] could not record the snapshot after a workflow status change')
        }
    },
})
