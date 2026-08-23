import { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1787473797710 implements MigrationInterface {
    name = 'InitialSchema1787473797710'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE COLLATION IF NOT EXISTS en_natural (LOCALE = 'en-US-u-kn-true', PROVIDER = 'icu')
        `)
        await queryRunner.query(`
            CREATE TABLE "trigger_event" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflowId" character varying(21) NOT NULL,
                "workspaceId" character varying(21) NOT NULL,
                "sourceName" character varying NOT NULL,
                "fileId" character varying NOT NULL,
                CONSTRAINT "PK_79bbc8c2af95776e801c7eaab11" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_event_workspace_id_workflow_id" ON "trigger_event" ("workspaceId", "workflowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_event_workflow_id" ON "trigger_event" ("workflowId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_trigger_event_file_id" ON "trigger_event" ("fileId")
        `)
        await queryRunner.query(`
            CREATE TABLE "app_event_routing" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "appName" character varying NOT NULL,
                "workspaceId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "identifierValue" character varying NOT NULL,
                "event" character varying NOT NULL,
                CONSTRAINT "PK_2107df2b2faf9d50435f9d5acd7" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_app_event_routing_workflow_id" ON "app_event_routing" ("workflowId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_app_event_wf_ws_app_identifier_value_event" ON "app_event_routing" (
                "appName",
                "workspaceId",
                "workflowId",
                "identifierValue",
                "event"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_app_event_appName_identifier_event" ON "app_event_routing" ("appName", "identifierValue", "event")
        `)
        await queryRunner.query(`
            CREATE TABLE "file" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workspaceId" character varying(21),
                "tenantId" character varying(21),
                "data" bytea,
                "location" character varying NOT NULL,
                "fileName" character varying,
                "size" integer,
                "metadata" jsonb,
                "s3Key" character varying,
                "type" character varying NOT NULL DEFAULT 'UNKNOWN',
                "compression" character varying NOT NULL DEFAULT 'NONE',
                CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_file_workspace_id_type_created" ON "file" ("workspaceId", "type", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_file_type_created_desc" ON "file" ("type", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_file_tenant_id_null_workspace" ON "file" ("tenantId")
            WHERE "workspaceId" IS NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "flag" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "value" jsonb NOT NULL,
                CONSTRAINT "PK_17b74257294fdfd221178a132d4" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE TABLE "workflow" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workspaceId" character varying(21) NOT NULL,
                "folderId" character varying(21),
                "status" character varying NOT NULL DEFAULT 'DISABLED',
                "externalId" character varying NOT NULL,
                "publishedVersionId" character varying(21),
                "metadata" jsonb,
                "operationStatus" character varying NOT NULL DEFAULT 'NONE',
                "timeSavedPerRun" integer,
                "ownerId" character varying,
                "templateId" character varying,
                "createdBy" jsonb,
                CONSTRAINT "UQ_cb34ff661bf8a55e0d9f50d0986" UNIQUE ("publishedVersionId"),
                CONSTRAINT "REL_cb34ff661bf8a55e0d9f50d098" UNIQUE ("publishedVersionId"),
                CONSTRAINT "PK_eb5e4cc1a9ef2e94805b676751b" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_workspace_id" ON "workflow" ("workspaceId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_owner_id" ON "workflow" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_folder_id" ON "workflow" ("folderId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_workspace_id_status" ON "workflow" ("workspaceId", "status")
        `)
        await queryRunner.query(`
            CREATE TABLE "workflow_version" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflowId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                "schemaVersion" character varying,
                "trigger" jsonb,
                "connectionIds" character varying array NOT NULL,
                "agentIds" character varying array NOT NULL,
                "updatedBy" character varying,
                "valid" boolean NOT NULL,
                "state" character varying NOT NULL,
                "backupFiles" jsonb,
                "notes" jsonb NOT NULL,
                CONSTRAINT "PK_e61d12662fd18f475bba2e86b7d" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_version_workflow_id_created_desc" ON "workflow_version" ("workflowId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_version_schema_version" ON "workflow_version" ("schemaVersion")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_version_updated_by" ON "workflow_version" ("updatedBy")
        `)
        await queryRunner.query(`
            CREATE TABLE "execution" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workspaceId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "workflowVersionId" character varying(21) NOT NULL,
                "environment" character varying,
                "logsFileId" character varying(21),
                "parentRunId" character varying(21),
                "failParentOnFailure" boolean NOT NULL DEFAULT true,
                "status" character varying NOT NULL,
                "tags" character varying array,
                "startTime" TIMESTAMP WITH TIME ZONE,
                "triggeredBy" character varying,
                "finishTime" TIMESTAMP WITH TIME ZONE,
                "timeline" jsonb,
                "failedStep" jsonb,
                "archivedAt" character varying,
                "stepNameToTest" character varying,
                "stepsCount" integer NOT NULL DEFAULT '0',
                "pauseMetadata" jsonb,
                CONSTRAINT "PK_cc6684fedf29ec4c86db8448a2b" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_execution_ws_env_wf_status_created_archived" ON "execution" (
                "workspaceId",
                "environment",
                "workflowId",
                "status",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_workspace_id_environment_status_created_archived_at" ON "execution" (
                "workspaceId",
                "environment",
                "status",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_workspace_id_environment_created_archived_at" ON "execution" (
                "workspaceId",
                "environment",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_workspace_id_environment_created_status_archived_at" ON "execution" (
                "workspaceId",
                "environment",
                "created",
                "archivedAt",
                "status"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_execution_ws_env_wf_created_archived" ON "execution" (
                "workspaceId",
                "environment",
                "workflowId",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_workflow_id" ON "execution" ("workflowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_logs_file_id" ON "execution" ("logsFileId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_parent_run_id" ON "execution" ("parentRunId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_workflow_version_id" ON "execution" ("workflowVersionId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_triggered_by" ON "execution" ("triggeredBy")
        `)
        await queryRunner.query(`
            CREATE TABLE "workspace" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted" TIMESTAMP WITH TIME ZONE,
                "ownerId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                "type" character varying NOT NULL,
                "tenantId" character varying(21) NOT NULL,
                "externalId" character varying,
                "maxConcurrentJobs" integer,
                "icon" jsonb NOT NULL,
                "releasesEnabled" boolean NOT NULL DEFAULT false,
                "notifyWorkflowOwnerOnFailure" boolean NOT NULL DEFAULT false,
                "metadata" jsonb,
                "workerGroupId" character varying,
                "executionDataRetentionDays" integer,
                CONSTRAINT "PK_ca86b6f9b3be5fe26d307d09b49" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workspace_owner_id" ON "workspace" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_workspace_tenant_id_external_id" ON "workspace" ("tenantId", "externalId")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workspace_tenant_id" ON "workspace" ("tenantId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workspace_worker_group" ON "workspace" ("workerGroupId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workspace_execution_data_retention_days" ON "workspace" ("executionDataRetentionDays")
            WHERE "executionDataRetentionDays" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "store-entry" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "key" character varying(128) NOT NULL,
                "workspaceId" character varying(21) NOT NULL,
                "value" jsonb,
                CONSTRAINT "UQ_4c90692d05162626818309e5f43" UNIQUE ("workspaceId", "key"),
                CONSTRAINT "PK_afb44ca7c0b4606b19deb1680d6" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "status" character varying NOT NULL,
                "tenantRole" character varying NOT NULL,
                "identityId" character varying NOT NULL,
                "externalId" character varying,
                "tenantId" character varying,
                "lastActiveDate" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_tenant_id_email" ON "user" ("tenantId", "identityId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_tenant_id_external_id" ON "user" ("tenantId", "externalId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_user_identity_id" ON "user" ("identityId")
        `)
        await queryRunner.query(`
            CREATE TABLE "connection" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "displayName" character varying NOT NULL,
                "externalId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'ACTIVE',
                "tenantId" character varying NOT NULL,
                "connectorName" character varying NOT NULL,
                "ownerId" character varying,
                "workspaceIds" character varying array NOT NULL,
                "scope" character varying NOT NULL,
                "value" jsonb NOT NULL,
                "metadata" jsonb,
                "connectorVersion" character varying NOT NULL,
                "preSelectForNewWorkspaces" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_be611ce8b8cf439091c82a334b2" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_connection_tenant_id_and_external_id" ON "connection" ("tenantId", "externalId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_connection_owner_id" ON "connection" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE TABLE "variable" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "workspaceId" character varying NOT NULL,
                "tenantId" character varying NOT NULL,
                "ownerId" character varying,
                "value" jsonb NOT NULL,
                "metadata" jsonb,
                CONSTRAINT "PK_f4e200785984484787e6b47e6fb" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_variable_workspace_id_and_name" ON "variable" ("workspaceId", "name")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_variable_owner_id" ON "variable" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE TABLE "folder" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "displayName" character varying NOT NULL,
                "workspaceId" character varying(21) NOT NULL,
                "displayOrder" integer NOT NULL DEFAULT '0',
                "externalId" character varying,
                CONSTRAINT "PK_6278a41a706740c94c02e288df8" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_folder_workspace_id_display_name" ON "folder" ("workspaceId", "displayName")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_folder_workspace_id_external_id" ON "folder" ("workspaceId", "externalId")
            WHERE "externalId" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "connector_metadata" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "authors" character varying array NOT NULL,
                "displayName" character varying NOT NULL,
                "logoUrl" character varying NOT NULL,
                "workspaceUsage" integer NOT NULL DEFAULT '0',
                "description" character varying,
                "tenantId" character varying,
                "version" character varying COLLATE "en_natural" NOT NULL,
                "minimumSupportedRelease" character varying COLLATE "en_natural" NOT NULL,
                "maximumSupportedRelease" character varying COLLATE "en_natural" NOT NULL,
                "auth" json,
                "actions" json NOT NULL,
                "triggers" json NOT NULL,
                "connectorType" character varying NOT NULL,
                "categories" character varying array,
                "deprecated" boolean,
                "packageType" character varying NOT NULL,
                "archiveId" character varying(21),
                "i18n" json,
                CONSTRAINT "REL_e9363ff853aa5e7c268661fd33" UNIQUE ("archiveId"),
                CONSTRAINT "PK_c4b9358cd74cb75650f72629cc5" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_connector_metadata_name_tenant_id_version" ON "connector_metadata" ("name", "version", "tenantId")
        `)
        await queryRunner.query(`
            CREATE TABLE "tenant" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "ownerId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "primaryColor" character varying NOT NULL,
                "themeColors" jsonb,
                "logoIconUrl" character varying NOT NULL,
                "fullLogoUrl" character varying NOT NULL,
                "favIconUrl" character varying NOT NULL,
                "cloudAuthEnabled" boolean NOT NULL DEFAULT true,
                "googleAuthEnabled" boolean NOT NULL DEFAULT true,
                "allowedAuthDomains" character varying array NOT NULL,
                "allowedEmbedOrigins" character varying array NOT NULL DEFAULT '{}',
                "ssoDomain" character varying,
                "ssoDomainVerification" jsonb,
                "enforceAllowedAuthDomains" boolean NOT NULL,
                "emailAuthEnabled" boolean NOT NULL,
                "federatedAuthProviders" jsonb NOT NULL,
                "pinnedConnectors" character varying array NOT NULL,
                "connectorSelectorConfig" jsonb,
                CONSTRAINT "REL_feb05384c4e856435ed00355df" UNIQUE ("ownerId"),
                CONSTRAINT "PK_da8c6efd67bb301e810e56ac139" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_tenant_sso_domain" ON "tenant" ("ssoDomain")
            WHERE "ssoDomain" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "user_invitation" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "tenantRole" character varying,
                "email" character varying NOT NULL,
                "workspaceId" character varying,
                "status" character varying NOT NULL,
                "workspaceRoleId" character varying,
                CONSTRAINT "PK_41026b90b70299ac5dc0183351a" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_invitation_email_tenant_workspace" ON "user_invitation" ("email", "tenantId", "workspaceId")
        `)
        await queryRunner.query(`
            CREATE TABLE "user_identity" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "email" character varying NOT NULL,
                "password" character varying NOT NULL,
                "trackEvents" boolean,
                "newsLetter" boolean,
                "verified" boolean NOT NULL DEFAULT false,
                "firstName" character varying NOT NULL,
                "lastName" character varying NOT NULL,
                "tokenVersion" character varying,
                "provider" character varying NOT NULL,
                "imageUrl" character varying,
                "lastLoggedInTenantId" character varying(21),
                CONSTRAINT "UQ_7ad44f9fcbfc95e0a8436bbb029" UNIQUE ("email"),
                CONSTRAINT "PK_87b5856b206b5b77e6e2fa29508" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_identity_email" ON "user_identity" ("email")
        `)
        await queryRunner.query(`
            CREATE TABLE "trigger_source" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted" TIMESTAMP WITH TIME ZONE,
                "workflowId" character varying NOT NULL,
                "workflowVersionId" character varying NOT NULL,
                "triggerName" character varying NOT NULL,
                "workspaceId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "schedule" jsonb,
                "connectorName" character varying NOT NULL,
                "connectorVersion" character varying NOT NULL,
                "simulate" boolean NOT NULL,
                CONSTRAINT "PK_aaccba5b6e8aa2f14f108504508" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_trigger_workspace_id_workflow_id_simulate" ON "trigger_source" ("workspaceId", "workflowId", "simulate")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_trigger_workflow_id_simulate" ON "trigger_source" ("workflowId", "simulate")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_workflow_id" ON "trigger_source" ("workflowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_workspace_id" ON "trigger_source" ("workspaceId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_workflow_version_id" ON "trigger_source" ("workflowVersionId")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "waitpoint" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "executionId" character varying(21) NOT NULL,
                "workspaceId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                "status" character varying NOT NULL,
                "resumeDateTime" TIMESTAMP WITH TIME ZONE,
                "responseToSend" jsonb,
                "workerHandlerId" character varying,
                "httpRequestId" character varying,
                "version" character varying NOT NULL DEFAULT 'V0',
                "stepName" character varying NOT NULL DEFAULT '',
                "resumePayload" jsonb,
                CONSTRAINT "PK_f29902394112e903241ae633a13" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_waitpoint_execution_id_step_name" ON "waitpoint" ("executionId", "stepName")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_waitpoint_workspace_id" ON "waitpoint" ("workspaceId")
        `)
        await queryRunner.query(`
            CREATE TABLE "otp" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "type" character varying NOT NULL,
                "identityId" character varying(21) NOT NULL,
                "value" character varying NOT NULL,
                "state" character varying NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "version" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_32556d9d7b22031d7d0e1fd6723" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_otp_identity_id_type" ON "otp" ("identityId", "type")
        `)
        await queryRunner.query(`
            CREATE TABLE "template" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "summary" character varying NOT NULL,
                "description" character varying NOT NULL,
                "type" character varying NOT NULL,
                "tenantId" character varying,
                "status" character varying NOT NULL,
                "workflows" jsonb,
                "tables" jsonb,
                "tags" jsonb NOT NULL,
                "blogUrl" character varying,
                "metadata" jsonb,
                "author" character varying NOT NULL,
                "categories" character varying array NOT NULL,
                "connectors" character varying array NOT NULL,
                CONSTRAINT "PK_fbae2ac36bd9b5e1e793b957b7f" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_template_connectors" ON "template" ("connectors")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_template_categories" ON "template" ("categories")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_template_tenant_id" ON "template" ("tenantId")
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event"
            ADD CONSTRAINT "fk_trigger_event_workspace_id" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event"
            ADD CONSTRAINT "fk_trigger_event_file_id" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event"
            ADD CONSTRAINT "fk_trigger_event_workflow_id" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "file"
            ADD CONSTRAINT "fk_file_workspace_id" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD CONSTRAINT "fk_workflow_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD CONSTRAINT "fk_workflow_folder_id" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD CONSTRAINT "fk_workflow_workspace_id" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD CONSTRAINT "fk_workflow_published_version" FOREIGN KEY ("publishedVersionId") REFERENCES "workflow_version"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_version"
            ADD CONSTRAINT "fk_updated_by_user_workflow" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_version"
            ADD CONSTRAINT "fk_workflow_version_workflow" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_triggered_by_user_id" FOREIGN KEY ("triggeredBy") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_workspace_id" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_workflow_id" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_workflow_version_id" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_version"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_logs_file_id" FOREIGN KEY ("logsFileId") REFERENCES "file"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workspace"
            ADD CONSTRAINT "fk_workspace_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workspace"
            ADD CONSTRAINT "fk_workspace_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "FK_dea97e26c765a4cdb575957a146" FOREIGN KEY ("identityId") REFERENCES "user_identity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connection"
            ADD CONSTRAINT "fk_connection_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "variable"
            ADD CONSTRAINT "fk_variable_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "folder"
            ADD CONSTRAINT "fk_folder_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_metadata"
            ADD CONSTRAINT "fk_connector_metadata_file" FOREIGN KEY ("archiveId") REFERENCES "file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant"
            ADD CONSTRAINT "fk_tenant_user" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation"
            ADD CONSTRAINT "fk_user_invitation_workspace_id" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source"
            ADD CONSTRAINT "FK_b88de9d358a062aed69f2e1fcb2" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source"
            ADD CONSTRAINT "FK_1fabca1228850aad29b625c04e6" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "waitpoint"
            ADD CONSTRAINT "fk_waitpoint_workspace_id" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "otp"
            ADD CONSTRAINT "fk_otp_identity_id" FOREIGN KEY ("identityId") REFERENCES "user_identity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "template"
            ADD CONSTRAINT "fk_template_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP COLLATION IF EXISTS en_natural
        `)
        await queryRunner.query(`
            ALTER TABLE "template" DROP CONSTRAINT "fk_template_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "otp" DROP CONSTRAINT "fk_otp_identity_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "waitpoint" DROP CONSTRAINT "fk_waitpoint_workspace_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source" DROP CONSTRAINT "FK_1fabca1228850aad29b625c04e6"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source" DROP CONSTRAINT "FK_b88de9d358a062aed69f2e1fcb2"
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation" DROP CONSTRAINT "fk_user_invitation_workspace_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant" DROP CONSTRAINT "fk_tenant_user"
        `)
        await queryRunner.query(`
            ALTER TABLE "connector_metadata" DROP CONSTRAINT "fk_connector_metadata_file"
        `)
        await queryRunner.query(`
            ALTER TABLE "folder" DROP CONSTRAINT "fk_folder_workspace"
        `)
        await queryRunner.query(`
            ALTER TABLE "variable" DROP CONSTRAINT "fk_variable_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connection" DROP CONSTRAINT "fk_connection_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "user" DROP CONSTRAINT "FK_dea97e26c765a4cdb575957a146"
        `)
        await queryRunner.query(`
            ALTER TABLE "workspace" DROP CONSTRAINT "fk_workspace_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "workspace" DROP CONSTRAINT "fk_workspace_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP CONSTRAINT "fk_execution_logs_file_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP CONSTRAINT "fk_execution_workflow_version_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP CONSTRAINT "fk_execution_workflow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP CONSTRAINT "fk_execution_workspace_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP CONSTRAINT "fk_execution_triggered_by_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_version" DROP CONSTRAINT "fk_workflow_version_workflow"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_version" DROP CONSTRAINT "fk_updated_by_user_workflow"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP CONSTRAINT "fk_workflow_published_version"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP CONSTRAINT "fk_workflow_workspace_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP CONSTRAINT "fk_workflow_folder_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP CONSTRAINT "fk_workflow_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "file" DROP CONSTRAINT "fk_file_workspace_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event" DROP CONSTRAINT "fk_trigger_event_workflow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event" DROP CONSTRAINT "fk_trigger_event_file_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event" DROP CONSTRAINT "fk_trigger_event_workspace_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_template_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_template_categories"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_template_connectors"
        `)
        await queryRunner.query(`
            DROP TABLE "template"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_otp_identity_id_type"
        `)
        await queryRunner.query(`
            DROP TABLE "otp"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_waitpoint_workspace_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_waitpoint_execution_id_step_name"
        `)
        await queryRunner.query(`
            DROP TABLE "waitpoint"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_workflow_version_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_workspace_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_workflow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_workflow_id_simulate"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_workspace_id_workflow_id_simulate"
        `)
        await queryRunner.query(`
            DROP TABLE "trigger_source"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_identity_email"
        `)
        await queryRunner.query(`
            DROP TABLE "user_identity"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_invitation_email_tenant_workspace"
        `)
        await queryRunner.query(`
            DROP TABLE "user_invitation"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_tenant_sso_domain"
        `)
        await queryRunner.query(`
            DROP TABLE "tenant"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connector_metadata_name_tenant_id_version"
        `)
        await queryRunner.query(`
            DROP TABLE "connector_metadata"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_folder_workspace_id_external_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_folder_workspace_id_display_name"
        `)
        await queryRunner.query(`
            DROP TABLE "folder"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_variable_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_variable_workspace_id_and_name"
        `)
        await queryRunner.query(`
            DROP TABLE "variable"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connection_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connection_tenant_id_and_external_id"
        `)
        await queryRunner.query(`
            DROP TABLE "connection"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_identity_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_tenant_id_external_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_tenant_id_email"
        `)
        await queryRunner.query(`
            DROP TABLE "user"
        `)
        await queryRunner.query(`
            DROP TABLE "store-entry"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workspace_execution_data_retention_days"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workspace_worker_group"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workspace_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workspace_tenant_id_external_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workspace_owner_id"
        `)
        await queryRunner.query(`
            DROP TABLE "workspace"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_triggered_by"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_workflow_version_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_parent_run_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_logs_file_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_workflow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_execution_ws_env_wf_created_archived"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_workspace_id_environment_created_status_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_workspace_id_environment_created_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_workspace_id_environment_status_created_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_execution_ws_env_wf_status_created_archived"
        `)
        await queryRunner.query(`
            DROP TABLE "execution"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_version_updated_by"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_version_schema_version"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_version_workflow_id_created_desc"
        `)
        await queryRunner.query(`
            DROP TABLE "workflow_version"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_workspace_id_status"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_folder_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_workspace_id"
        `)
        await queryRunner.query(`
            DROP TABLE "workflow"
        `)
        await queryRunner.query(`
            DROP TABLE "flag"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_file_tenant_id_null_workspace"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_file_type_created_desc"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_file_workspace_id_type_created"
        `)
        await queryRunner.query(`
            DROP TABLE "file"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_event_appName_identifier_event"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_event_wf_ws_app_identifier_value_event"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_event_routing_workflow_id"
        `)
        await queryRunner.query(`
            DROP TABLE "app_event_routing"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_event_file_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_event_workflow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_event_workspace_id_workflow_id"
        `)
        await queryRunner.query(`
            DROP TABLE "trigger_event"
        `)
    }

}
