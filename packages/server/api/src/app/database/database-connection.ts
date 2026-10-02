import { isNil } from '@fema-ipaas/core-utils'
import {
    DataSource,
    EntitySchema,
} from 'typeorm'
import { PersonalAccessTokenEntity } from '../account/personal-access-token.entity'
import { AgentApprovalEntity } from '../agent-approval/agent-approval.entity'
import { AiUsageEntity } from '../ai/ai-usage.entity'
import { AlertPolicyEntity, AlertRecordEntity, NotificationChannelEntity } from '../alert/alert.entity'
import { AuditEventEntity } from '../audit/audit-event.entity'
import { OtpEntity } from '../authentication/otp/otp-entity'
import { UserIdentityEntity } from '../authentication/user-identity/user-identity-entity'
import { ConnectionShareEntity } from '../connection/connection-share.entity'
import { ConnectionEntity } from '../connection/connection.entity'
import { ConnectorBlueprintVersionEntity } from '../connectors/blueprint/connector-blueprint-version.entity'
import { ConnectorBlueprintEntity } from '../connectors/blueprint/connector-blueprint.entity'
import { ConnectorDemandEntity } from '../connectors/demand/connector-demand.entity'
import { ConnectorMetadataEntity } from '../connectors/metadata/connector-metadata-entity'
import { DataStoreEntity } from '../data-store/data-store.entity'
import { FileEntity } from '../file/file.entity'
import { FlagEntity } from '../flags/flag.entity'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { IssueActivityEntity, IssueEntity } from '../issue/issue.entity'
import { MappingTableEntity } from '../mapping-table/mapping-table.entity'
import { McpServerEntity } from '../mcp-server/mcp-server.entity'
import { McpServiceEntity, McpServiceMemberEntity, McpServiceUsageEntity } from '../mcp-service/mcp-service.entity'
import { NotificationEntity } from '../notification/notification.entity'
import { DataErasureRequestEntity } from '../privacy/data-erasure.entity'
import { PrivacySettingsEntity } from '../privacy/privacy-settings.entity'
import { ProjectEntity } from '../project/project-entity'
import { ProjectMemberEntity } from '../project/project-member.entity'
import { ConnectionReplacementEntity, WorkflowReleaseEntity } from '../release/release.entity'
import { RunMonitorViewEntity } from '../run-monitor/run-monitor-view.entity'
import { SolutionEntity, SolutionInstallEntity, SolutionVersionEntity } from '../solution/solution.entity'
import { StoreEntryEntity } from '../store-entry/store-entry-entity'
import { TemplateEntity } from '../template/template.entity'
import { TenantEntity } from '../tenant/tenant.entity'
import { ModuleAccessRequestEntity } from '../tenant-access/module-access-request.entity'
import { AppEventRoutingEntity } from '../trigger/app-event-routing/app-event-routing.entity'
import { DedupedEventEntity } from '../trigger/deduped-event/deduped-event.entity'
import { HolidayCalendarEntity } from '../trigger/holiday-calendar/holiday-calendar.entity'
import { TriggerEventEntity } from '../trigger/trigger-events/trigger-event.entity'
import { TriggerSourceEntity } from '../trigger/trigger-source/trigger-source-entity'
import { UserEntity } from '../user/user-entity'
import { UserInvitationEntity } from '../user-invitations/user-invitation.entity'
import { VariableEntity } from '../variable/variable.entity'
import { ExecutionEntity } from '../workflows/execution/execution-entity'
import { WaitpointEntity } from '../workflows/execution/waitpoint/waitpoint-entity'
import { FolderEntity } from '../workflows/folder/folder.entity'
import { WorkflowEntity } from '../workflows/workflow/workflow.entity'
import { WorkflowVersionEntity } from '../workflows/workflow-version/workflow-version-entity'
import { DatabaseType } from './database-type'
import { createPGliteDataSource } from './pglite-connection'
import { createPostgresDataSource } from './postgres-connection'

const databaseType = system.get(AppSystemProp.DB_TYPE)

function getEntities(): EntitySchema<unknown>[] {
    return [
        TriggerEventEntity,
        AppEventRoutingEntity,
        FileEntity,
        FlagEntity,
        WorkflowEntity,
        WorkflowVersionEntity,
        ExecutionEntity,
        AuditEventEntity,
        ConnectorBlueprintEntity,
        ConnectorBlueprintVersionEntity,
        ProjectEntity,
        ProjectMemberEntity,
        StoreEntryEntity,
        UserEntity,
        ConnectionEntity,
        VariableEntity,
        FolderEntity,
        ConnectorMetadataEntity,
        TenantEntity,
        UserInvitationEntity,
        UserIdentityEntity,
        TriggerSourceEntity,
        WaitpointEntity,
        OtpEntity,
        TemplateEntity,
        IssueEntity,
        IssueActivityEntity,
        NotificationChannelEntity,
        AlertPolicyEntity,
        AlertRecordEntity,
        PrivacySettingsEntity,
        WorkflowReleaseEntity,
        ConnectionReplacementEntity,
        MappingTableEntity,
        DataStoreEntity,
        AiUsageEntity,
        RunMonitorViewEntity,
        AgentApprovalEntity,
        DataErasureRequestEntity,
        McpServiceEntity,
        McpServiceMemberEntity,
        McpServiceUsageEntity,
        McpServerEntity,
        ConnectionShareEntity,
        ConnectorDemandEntity,
        ModuleAccessRequestEntity,
        NotificationEntity,
        PersonalAccessTokenEntity,
        DedupedEventEntity,
        HolidayCalendarEntity,
        SolutionEntity,
        SolutionVersionEntity,
        SolutionInstallEntity,
    ]
}

export const commonProperties = {
    subscribers: [],
    entities: getEntities(),
}

const DB_GLOBAL_KEY = '__AP_DB_CONNECTION__'

function getPersistedConnection(): DataSource | null {
    return ((globalThis as Record<string, unknown>)[DB_GLOBAL_KEY] as DataSource) ?? null
}

function setPersistedConnection(ds: DataSource | null): void {
    (globalThis as Record<string, unknown>)[DB_GLOBAL_KEY] = ds
}

const createDataSource = (): DataSource => {
    switch (databaseType) {
        case DatabaseType.PGLITE:
            return createPGliteDataSource()
        case DatabaseType.POSTGRES:
        default:
            return createPostgresDataSource()
    }
}

export const databaseConnection = (): DataSource => {
    const existing = getPersistedConnection()
    if (!isNil(existing)) {
        return existing
    }
    const ds = createDataSource()
    setPersistedConnection(ds)
    return ds
}

export function resetDatabaseConnection(): void {
    setPersistedConnection(null)
}
