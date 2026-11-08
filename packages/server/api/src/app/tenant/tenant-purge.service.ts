import { isNil, TenantId } from '@fema-ipaas/core-utils'
import { WorkflowStatus } from '@fema-ipaas/workflow-core'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, In } from 'typeorm'
import { PersonalAccessTokenEntity } from '../account/personal-access-token.entity'
import { AlertPolicyEntity, AlertRecordEntity, NotificationChannelEntity } from '../alert/alert.entity'
import { AuditEventEntity } from '../audit/audit-event.entity'
import { OtpEntity } from '../authentication/otp/otp-entity'
import { UserIdentityEntity } from '../authentication/user-identity/user-identity-entity'
import { BackupRecordEntity, BackupSettingsEntity } from '../backup/backup.entity'
import { ConnectionShareEntity } from '../connection/connection-share.entity'
import { ConnectionEntity } from '../connection/connection.entity'
import { ConnectorBlueprintVersionEntity } from '../connectors/blueprint/connector-blueprint-version.entity'
import { ConnectorBlueprintEntity } from '../connectors/blueprint/connector-blueprint.entity'
import { ConnectorDemandEntity } from '../connectors/demand/connector-demand.entity'
import { ConnectorMetadataEntity } from '../connectors/metadata/connector-metadata-entity'
import { purgeBatch } from '../core/db/purge-batch'
import { databaseConnection } from '../database/database-connection'
import { ExternalIdentityEntity } from '../federation/external-identity.entity'
import { fileService } from '../file/file.service'
import { McpServerEntity } from '../mcp-server/mcp-server.entity'
import { NotificationEntity } from '../notification/notification.entity'
import { TenantUsageSnapshotEntity } from '../platform/tenant-usage-snapshot.entity'
import { DataErasureRequestEntity } from '../privacy/data-erasure.entity'
import { PrivacySettingsEntity } from '../privacy/privacy-settings.entity'
import { ProjectAccessRequestEntity } from '../project/project-access-request.entity'
import { ProjectEntity } from '../project/project-entity'
import { projectPurgeService } from '../project/project-purge.service'
import { RunMonitorViewEntity } from '../run-monitor/run-monitor-view.entity'
import { ServiceSettingEntity } from '../service-settings/service-setting.entity'
import { SolutionEntity, SolutionInstallEntity, SolutionVersionEntity } from '../solution/solution.entity'
import { TemplateEntity } from '../template/template.entity'
import { ModuleAccessRequestEntity } from '../tenant-access/module-access-request.entity'
import { TenantDomainEntity } from '../tenant-domain/tenant-domain.entity'
import { HolidayCalendarEntity } from '../trigger/holiday-calendar/holiday-calendar.entity'
import { triggerSourceService } from '../trigger/trigger-source/trigger-source-service'
import { UserEntity } from '../user/user-entity'
import { UserInvitationEntity } from '../user-invitations/user-invitation.entity'
import { VariableEntity } from '../variable/variable.entity'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { TenantEntity } from './tenant.entity'

export const tenantPurgeService = (log: FastifyBaseLogger) => ({
    async purge({ tenantId }: { tenantId: TenantId }): Promise<void> {
        const projectIds = await purgeBatch.idsWhere({ entity: ProjectEntity, column: 'tenantId', value: tenantId })
        for (const projectId of projectIds) {
            await disableTriggers({ projectId, log })
            await projectPurgeService(log).purge({ projectId })
        }
        await purgeTenantData({ tenantId, log })
        await removeTenantAndMembers({ tenantId })
        log.info({ tenant: { id: tenantId }, projectCount: projectIds.length }, '[tenantPurgeService] Tenant permanently deleted')
    },
})

async function disableTriggers({ projectId, log }: { projectId: string, log: FastifyBaseLogger }): Promise<void> {
    const enabledWorkflows = await workflowRepo().find({ where: { projectId, status: WorkflowStatus.ENABLED }, withDeleted: true })
    for (const workflow of enabledWorkflows) {
        if (isNil(workflow.publishedVersionId)) {
            continue
        }
        await triggerSourceService(log).disable({ workflowId: workflow.id, projectId, simulate: false, ignoreError: true })
    }
}

async function purgeTenantData({ tenantId, log }: { tenantId: TenantId, log: FastifyBaseLogger }): Promise<void> {
    const solutionIds = await purgeBatch.idsWhere({ entity: SolutionEntity, column: 'tenantId', value: tenantId })
    await purgeBatch.deleteWhereIn({ entity: SolutionVersionEntity, column: 'solutionId', values: solutionIds })
    for (const entity of TENANT_OWNED_ENTITIES) {
        await purgeBatch.deleteWhere({ entity, column: 'tenantId', value: tenantId })
    }
    await fileService(log).deleteAllOf({ owner: { tenantId } })
}

async function removeTenantAndMembers({ tenantId }: { tenantId: TenantId }): Promise<void> {
    await databaseConnection().transaction(async (manager) => {
        const identityIds = await identitiesOnlyInTenant({ manager, tenantId })
        await manager.getRepository(TenantEntity).delete({ id: tenantId })
        await manager.getRepository(UserEntity).delete({ tenantId })
        if (identityIds.length > 0) {
            await manager.getRepository(OtpEntity).delete({ identityId: In(identityIds) })
            await manager.getRepository(UserIdentityEntity).delete({ id: In(identityIds) })
        }
        await manager.getRepository(UserIdentityEntity).update({ lastLoggedInTenantId: tenantId }, { lastLoggedInTenantId: null })
    })
}

async function identitiesOnlyInTenant({ manager, tenantId }: { manager: EntityManager, tenantId: TenantId }): Promise<string[]> {
    const rows = await manager.query<Array<{ identityId: string }>>(
        `SELECT DISTINCT member."identityId" AS "identityId"
         FROM "user" member
         INNER JOIN user_identity identity ON identity.id = member."identityId"
         WHERE member."tenantId" = $1
           AND identity."instanceRole" IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM "user" other
               WHERE other."identityId" = member."identityId" AND other."tenantId" IS DISTINCT FROM $1
           )`,
        [tenantId],
    )
    return rows.map((row) => row.identityId)
}

const TENANT_OWNED_ENTITIES = [
    ConnectorMetadataEntity,
    McpServerEntity,
    ConnectionShareEntity,
    ConnectionEntity,
    ConnectorBlueprintVersionEntity,
    ConnectorBlueprintEntity,
    SolutionInstallEntity,
    SolutionEntity,
    AlertRecordEntity,
    AlertPolicyEntity,
    NotificationChannelEntity,
    NotificationEntity,
    AuditEventEntity,
    BackupRecordEntity,
    BackupSettingsEntity,
    ConnectorDemandEntity,
    DataErasureRequestEntity,
    ExternalIdentityEntity,
    HolidayCalendarEntity,
    ModuleAccessRequestEntity,
    PersonalAccessTokenEntity,
    PrivacySettingsEntity,
    ProjectAccessRequestEntity,
    RunMonitorViewEntity,
    ServiceSettingEntity,
    TemplateEntity,
    TenantDomainEntity,
    TenantUsageSnapshotEntity,
    UserInvitationEntity,
    VariableEntity,
]
