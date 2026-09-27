import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class DesignDocRolloutSchema1790501279466 implements Migration {
    name = 'DesignDocRolloutSchema1790501279466'
    breaking = true
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "store-entry" DROP CONSTRAINT "UQ_6f251cc141de0a8d84d7a4ac17d"
        `)
        await queryRunner.query(`
            CREATE TABLE "connector_blueprint_version" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "blueprintId" character varying(21) NOT NULL,
                "connectorName" character varying NOT NULL,
                "version" character varying(16) NOT NULL,
                "packageVersion" character varying(32) NOT NULL,
                "status" character varying NOT NULL,
                "canaryProjectIds" character varying array NOT NULL,
                "description" character varying NOT NULL,
                "publishedBy" character varying(21) NOT NULL,
                "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updates" jsonb NOT NULL,
                "definition" jsonb NOT NULL,
                CONSTRAINT "PK_aba57eebc70f5195544a79cf1d2" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_connector_blueprint_version_blueprint_version" ON "connector_blueprint_version" ("blueprintId", "version")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_connector_blueprint_version_tenant_connector" ON "connector_blueprint_version" ("tenantId", "connectorName")
        `)
        await queryRunner.query(`
            CREATE TABLE "data_store" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "description" character varying,
                "ttlDays" integer NOT NULL DEFAULT '30',
                "ownerId" character varying(21),
                CONSTRAINT "PK_61b58bd1a704026d686b73754a6" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_data_store_project_id_name" ON "data_store" ("projectId", "name")
        `)
        await queryRunner.query(`
            CREATE TABLE "run_monitor_view" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "config" jsonb NOT NULL,
                CONSTRAINT "PK_23e5bd8715211af990e4131d243" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_run_monitor_view_user_id_name" ON "run_monitor_view" ("userId", "name")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_monitor_view_tenant_id_user_id" ON "run_monitor_view" ("tenantId", "userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_service_member" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "serviceId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "tokenHash" character varying NOT NULL,
                "tokenHint" character varying NOT NULL,
                "tokenEncrypted" jsonb NOT NULL,
                "connections" jsonb NOT NULL DEFAULT '{}',
                CONSTRAINT "PK_d6efc5702a0e2a961507b14a4a7" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_service_member_service_user" ON "mcp_service_member" ("serviceId", "userId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_service_member_token_hash" ON "mcp_service_member" ("tokenHash")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_mcp_service_member_user_id" ON "mcp_service_member" ("userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_service_usage" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "serviceId" character varying(21) NOT NULL,
                "day" date NOT NULL,
                "calls" integer NOT NULL DEFAULT '0',
                "failures" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_f04cdb19cdba1255fe154fbbf79" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_service_usage_service_day" ON "mcp_service_usage" ("serviceId", "day")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_server" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "connectionId" character varying(21) NOT NULL,
                "description" character varying NOT NULL DEFAULT '',
                "url" character varying NOT NULL,
                "transport" character varying NOT NULL,
                "authType" character varying NOT NULL,
                "tools" jsonb NOT NULL DEFAULT '[]',
                "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
                "lastError" jsonb,
                CONSTRAINT "REL_9724524488070ba3ef24c49999" UNIQUE ("connectionId"),
                CONSTRAINT "PK_940f98ed91dd060f63e6fc5634e" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_server_connection_id" ON "mcp_server" ("connectionId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_mcp_server_tenant_id" ON "mcp_server" ("tenantId")
        `)
        await queryRunner.query(`
            CREATE TABLE "connection_share" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "connectionId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "permission" character varying NOT NULL,
                "createdBy" character varying(21),
                CONSTRAINT "PK_bea9132bba6e9c3c4766d03f4ca" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_connection_share_connection_user" ON "connection_share" ("connectionId", "userId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_connection_share_tenant_user" ON "connection_share" ("tenantId", "userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "connector_demand" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "requesterId" character varying(21),
                "appName" character varying NOT NULL,
                "capability" character varying NOT NULL,
                "status" character varying NOT NULL,
                CONSTRAINT "PK_56184694d6a82fa7c6465fc034b" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_connector_demand_tenant_created" ON "connector_demand" ("tenantId", "created")
        `)
        await queryRunner.query(`
            CREATE TABLE "module_access_request" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "module" character varying NOT NULL,
                "reason" character varying NOT NULL,
                "status" character varying NOT NULL,
                "decidedBy" character varying(21),
                "decidedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_cfb6400c4f524b8cba30ab4f9e5" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_module_access_request_tenant_status" ON "module_access_request" ("tenantId", "status")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_module_access_request_user" ON "module_access_request" ("userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "notification" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "recipientId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                "title" character varying NOT NULL,
                "body" character varying,
                "link" character varying,
                "actorName" character varying,
                "read" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_notification_recipient_created" ON "notification" ("recipientId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_notification_recipient_read" ON "notification" ("recipientId", "read")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_notification_created" ON "notification" ("created")
        `)
        await queryRunner.query(`
            CREATE TABLE "personal_access_token" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "tokenHash" character varying NOT NULL,
                "tokenHint" character varying NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE,
                "lastUsedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_4f29b258be0b657a3f81b75f0b7" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_personal_access_token_hash" ON "personal_access_token" ("tokenHash")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_personal_access_token_user" ON "personal_access_token" ("tenantId", "userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "deduped_event" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "workflowVersionId" character varying(21) NOT NULL,
                "keyHash" character varying NOT NULL,
                "keyPreview" character varying NOT NULL,
                "keyPath" character varying NOT NULL,
                "windowSeconds" integer NOT NULL,
                "firstExecutionId" character varying(21),
                CONSTRAINT "PK_449a5c525b5224ccb91bc7854dd" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_deduped_event_project_id_created" ON "deduped_event" ("projectId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_deduped_event_workflow_id_created" ON "deduped_event" ("workflowId", "created")
        `)
        await queryRunner.query(`
            CREATE TABLE "holiday_calendar" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "dates" jsonb NOT NULL,
                CONSTRAINT "PK_ab93ff20ee8d6d744896d9322a8" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_holiday_calendar_tenant_id" ON "holiday_calendar" ("tenantId")
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_version"
            ADD "publishNote" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD "rerunOfExecutionId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD "inPlaceRetryCount" integer NOT NULL DEFAULT '0'
        `)
        await queryRunner.query(`
            DELETE FROM "connector_blueprint"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "identifier" character varying(40) NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "connectorName" character varying NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "ownerId" character varying(21) NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "collaboratorIds" character varying array NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "publishedDefinition" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "authState" jsonb NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "authTestData" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "debugRecords" jsonb NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD "draftBuild" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD "description" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD "workflowsLimit" integer
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD "monthlyRunsLimit" integer
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry"
            ADD "dataStoreId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry"
            ADD "expiresAt" TIMESTAMP WITH TIME ZONE
        `)
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD "modules" character varying array NOT NULL DEFAULT '{}'
        `)
        await queryRunner.query(`
            UPDATE "user" SET "modules" = ARRAY['MCP_SERVICES']::character varying[] WHERE "tenantRole" <> 'ADMIN'
        `)
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD "notificationPreferences" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "connection"
            ADD "projectMembersPermission" character varying
        `)
        await queryRunner.query(`
            UPDATE "connection" SET "projectMembersPermission" = 'EDIT'
        `)
        await queryRunner.query(`
            ALTER TABLE "folder"
            ADD "parentId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant"
            ADD "welcomeText" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant"
            ADD "passwordMinLength" integer NOT NULL DEFAULT '10'
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant"
            ADD "sessionDurationDays" integer NOT NULL DEFAULT '7'
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant"
            ADD "moduleAccessSettings" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation"
            ADD "modules" character varying array
        `)
        await queryRunner.query(`
            ALTER TABLE "template"
            ADD "createdBy" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "template"
            ADD "visibility" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "template"
            ADD "usageCount" integer NOT NULL DEFAULT '0'
        `)
        await queryRunner.query(`
            ALTER TABLE "template"
            ADD "featured" boolean NOT NULL DEFAULT false
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_policy"
            ADD "capacityThresholdPercent" integer
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "key" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "ownerId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "publishedTools" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "releases" jsonb NOT NULL DEFAULT '[]'
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "draftChanged" boolean NOT NULL DEFAULT false
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "listed" boolean NOT NULL DEFAULT false
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "credentialMode" character varying NOT NULL DEFAULT 'DEVELOPER'
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "fixedConnections" jsonb NOT NULL DEFAULT '{}'
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD "availability" jsonb NOT NULL DEFAULT '{"mode":"ALL","userIds":[]}'
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_execution_rerun_of_execution_id" ON "execution" ("rerunOfExecutionId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_connector_blueprint_tenant_identifier" ON "connector_blueprint" ("tenantId", "identifier")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_store_entry_project_id_key" ON "store-entry" ("projectId", "key")
            WHERE "dataStoreId" IS NULL
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_store_entry_data_store_id_key" ON "store-entry" ("dataStoreId", "key")
            WHERE "dataStoreId" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_store_entry_expires_at" ON "store-entry" ("expiresAt")
            WHERE "expiresAt" IS NOT NULL
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_folder_project_id_display_name"
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_folder_project_id_display_name" ON "folder" ("projectId", "displayName") WHERE "parentId" IS NULL
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_folder_parent_id_display_name" ON "folder" ("parentId", "displayName")
            WHERE "parentId" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_service_key" ON "mcp_service" ("key")
            WHERE "key" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_mcp_service_owner_id" ON "mcp_service" ("ownerId")
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint"
            ADD CONSTRAINT "fk_connector_blueprint_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint_version"
            ADD CONSTRAINT "fk_connector_blueprint_version_blueprint_id" FOREIGN KEY ("blueprintId") REFERENCES "connector_blueprint"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry"
            ADD CONSTRAINT "fk_store_entry_data_store_id" FOREIGN KEY ("dataStoreId") REFERENCES "data_store"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "folder"
            ADD CONSTRAINT "fk_folder_parent_id" FOREIGN KEY ("parentId") REFERENCES "folder"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "data_store"
            ADD CONSTRAINT "fk_data_store_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "run_monitor_view"
            ADD CONSTRAINT "fk_run_monitor_view_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "run_monitor_view"
            ADD CONSTRAINT "fk_run_monitor_view_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD CONSTRAINT "fk_mcp_service_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service_member"
            ADD CONSTRAINT "fk_mcp_service_member_service_id" FOREIGN KEY ("serviceId") REFERENCES "mcp_service"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service_member"
            ADD CONSTRAINT "fk_mcp_service_member_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service_usage"
            ADD CONSTRAINT "fk_mcp_service_usage_service_id" FOREIGN KEY ("serviceId") REFERENCES "mcp_service"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_server"
            ADD CONSTRAINT "fk_mcp_server_connection_id" FOREIGN KEY ("connectionId") REFERENCES "connection"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_share"
            ADD CONSTRAINT "fk_connection_share_connection_id" FOREIGN KEY ("connectionId") REFERENCES "connection"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_share"
            ADD CONSTRAINT "fk_connection_share_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_demand"
            ADD CONSTRAINT "fk_connector_demand_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_demand"
            ADD CONSTRAINT "fk_connector_demand_requester_id" FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "module_access_request"
            ADD CONSTRAINT "fk_module_access_request_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "module_access_request"
            ADD CONSTRAINT "fk_module_access_request_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "notification"
            ADD CONSTRAINT "fk_notification_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "notification"
            ADD CONSTRAINT "fk_notification_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "notification"
            ADD CONSTRAINT "fk_notification_recipient_id" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "personal_access_token"
            ADD CONSTRAINT "fk_personal_access_token_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "personal_access_token"
            ADD CONSTRAINT "fk_personal_access_token_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "deduped_event"
            ADD CONSTRAINT "fk_deduped_event_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "deduped_event"
            ADD CONSTRAINT "fk_deduped_event_workflow_id" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "holiday_calendar"
            ADD CONSTRAINT "fk_holiday_calendar_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "holiday_calendar" DROP CONSTRAINT "fk_holiday_calendar_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "deduped_event" DROP CONSTRAINT "fk_deduped_event_workflow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "deduped_event" DROP CONSTRAINT "fk_deduped_event_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "personal_access_token" DROP CONSTRAINT "fk_personal_access_token_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "personal_access_token" DROP CONSTRAINT "fk_personal_access_token_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "notification" DROP CONSTRAINT "fk_notification_recipient_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "notification" DROP CONSTRAINT "fk_notification_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "notification" DROP CONSTRAINT "fk_notification_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "module_access_request" DROP CONSTRAINT "fk_module_access_request_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "module_access_request" DROP CONSTRAINT "fk_module_access_request_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_demand" DROP CONSTRAINT "fk_connector_demand_requester_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_demand" DROP CONSTRAINT "fk_connector_demand_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_share" DROP CONSTRAINT "fk_connection_share_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_share" DROP CONSTRAINT "fk_connection_share_connection_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_server" DROP CONSTRAINT "fk_mcp_server_connection_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service_usage" DROP CONSTRAINT "fk_mcp_service_usage_service_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service_member" DROP CONSTRAINT "fk_mcp_service_member_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service_member" DROP CONSTRAINT "fk_mcp_service_member_service_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP CONSTRAINT "fk_mcp_service_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "run_monitor_view" DROP CONSTRAINT "fk_run_monitor_view_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "run_monitor_view" DROP CONSTRAINT "fk_run_monitor_view_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "data_store" DROP CONSTRAINT "fk_data_store_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "folder" DROP CONSTRAINT "fk_folder_parent_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry" DROP CONSTRAINT "fk_store_entry_data_store_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint_version" DROP CONSTRAINT "fk_connector_blueprint_version_blueprint_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP CONSTRAINT "fk_connector_blueprint_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_key"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_folder_parent_id_display_name"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_folder_project_id_display_name"
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_folder_project_id_display_name" ON "folder" ("projectId", "displayName")
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_store_entry_expires_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_store_entry_data_store_id_key"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_store_entry_project_id_key"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connector_blueprint_tenant_identifier"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_execution_rerun_of_execution_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "availability"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "fixedConnections"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "credentialMode"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "listed"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "draftChanged"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "releases"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "publishedTools"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "ownerId"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP COLUMN "key"
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_policy" DROP COLUMN "capacityThresholdPercent"
        `)
        await queryRunner.query(`
            ALTER TABLE "template" DROP COLUMN "featured"
        `)
        await queryRunner.query(`
            ALTER TABLE "template" DROP COLUMN "usageCount"
        `)
        await queryRunner.query(`
            ALTER TABLE "template" DROP COLUMN "visibility"
        `)
        await queryRunner.query(`
            ALTER TABLE "template" DROP COLUMN "createdBy"
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation" DROP COLUMN "modules"
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant" DROP COLUMN "moduleAccessSettings"
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant" DROP COLUMN "sessionDurationDays"
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant" DROP COLUMN "passwordMinLength"
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant" DROP COLUMN "welcomeText"
        `)
        await queryRunner.query(`
            ALTER TABLE "folder" DROP COLUMN "parentId"
        `)
        await queryRunner.query(`
            ALTER TABLE "connection" DROP COLUMN "projectMembersPermission"
        `)
        await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "notificationPreferences"
        `)
        await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "modules"
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry" DROP COLUMN "expiresAt"
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry" DROP COLUMN "dataStoreId"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP COLUMN "monthlyRunsLimit"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP COLUMN "workflowsLimit"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP COLUMN "description"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "draftBuild"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "debugRecords"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "authTestData"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "authState"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "publishedDefinition"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "collaboratorIds"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "ownerId"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "connectorName"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_blueprint" DROP COLUMN "identifier"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP COLUMN "inPlaceRetryCount"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP COLUMN "rerunOfExecutionId"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_version" DROP COLUMN "publishNote"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_holiday_calendar_tenant_id"
        `)
        await queryRunner.query(`
            DROP TABLE "holiday_calendar"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_deduped_event_workflow_id_created"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_deduped_event_project_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "deduped_event"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_personal_access_token_user"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_personal_access_token_hash"
        `)
        await queryRunner.query(`
            DROP TABLE "personal_access_token"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_notification_created"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_notification_recipient_read"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_notification_recipient_created"
        `)
        await queryRunner.query(`
            DROP TABLE "notification"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_module_access_request_user"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_module_access_request_tenant_status"
        `)
        await queryRunner.query(`
            DROP TABLE "module_access_request"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connector_demand_tenant_created"
        `)
        await queryRunner.query(`
            DROP TABLE "connector_demand"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connection_share_tenant_user"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connection_share_connection_user"
        `)
        await queryRunner.query(`
            DROP TABLE "connection_share"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_server_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_server_connection_id"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_server"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_usage_service_day"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_service_usage"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_member_user_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_member_token_hash"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_member_service_user"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_service_member"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_monitor_view_tenant_id_user_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_monitor_view_user_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "run_monitor_view"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_data_store_project_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "data_store"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connector_blueprint_version_tenant_connector"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connector_blueprint_version_blueprint_version"
        `)
        await queryRunner.query(`
            DROP TABLE "connector_blueprint_version"
        `)
        await queryRunner.query(`
            ALTER TABLE "store-entry"
            ADD CONSTRAINT "UQ_6f251cc141de0a8d84d7a4ac17d" UNIQUE ("key", "projectId")
        `)
    }
}
