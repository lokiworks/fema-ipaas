import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddIssuesAlertsAndPrivacy1790465349745 implements Migration {
    name = 'AddIssuesAlertsAndPrivacy1790465349745'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "issue" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "kind" character varying NOT NULL,
                "signature" character varying NOT NULL,
                "workflowId" character varying(21),
                "stepName" character varying,
                "stepDisplayName" character varying,
                "connectionExternalId" character varying,
                "errorCode" character varying,
                "title" character varying NOT NULL,
                "message" text NOT NULL,
                "status" character varying NOT NULL,
                "reopened" boolean NOT NULL DEFAULT false,
                "assigneeId" character varying(21),
                "mutedUntil" TIMESTAMP WITH TIME ZONE,
                "occurrences" integer NOT NULL DEFAULT '0',
                "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "resolvedAt" TIMESTAMP WITH TIME ZONE,
                "resolvedById" character varying(21),
                CONSTRAINT "PK_f80e086c249b9f3f3ff2fd321b7" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_issue_project_id_signature" ON "issue" ("projectId", "signature")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_issue_project_id_status_last_seen_at" ON "issue" ("projectId", "status", "lastSeenAt")
        `)
        await queryRunner.query(`
            CREATE TABLE "issue_activity" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "issueId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                "actorId" character varying(21),
                "data" jsonb NOT NULL,
                CONSTRAINT "PK_26d84c944cae6f3491dc2ade374" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_issue_activity_issue_id_created" ON "issue_activity" ("issueId", "created")
        `)
        await queryRunner.query(`
            CREATE TABLE "notification_channel" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "type" character varying NOT NULL,
                "target" character varying NOT NULL,
                "config" jsonb NOT NULL,
                "hasSecret" boolean NOT NULL DEFAULT false,
                "createdById" character varying(21),
                CONSTRAINT "PK_50b36f3daa5dd86f7e707740b23" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_notification_channel_tenant_id_name" ON "notification_channel" ("tenantId", "name")
        `)
        await queryRunner.query(`
            CREATE TABLE "alert_policy" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "projectIds" character varying array NOT NULL,
                "workflowIds" character varying array NOT NULL,
                "events" character varying array NOT NULL,
                "failureRate" jsonb,
                "groupWindowMinutes" integer NOT NULL,
                "quietHours" jsonb NOT NULL,
                "escalation" jsonb NOT NULL,
                "channelIds" character varying array NOT NULL,
                "updatedById" character varying(21),
                CONSTRAINT "PK_b0b3ec253683d480591596640fd" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_alert_policy_tenant_id_name" ON "alert_policy" ("tenantId", "name")
        `)
        await queryRunner.query(`
            CREATE TABLE "alert_record" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "policyId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "issueId" character varying(21),
                "kind" character varying NOT NULL,
                "channelIds" character varying array NOT NULL,
                "mergedCount" integer NOT NULL DEFAULT '1',
                "status" character varying NOT NULL,
                "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "sentAt" TIMESTAMP WITH TIME ZONE,
                "error" text,
                "summary" text NOT NULL,
                CONSTRAINT "PK_e7f70ff237b0fb5bc09e02cf0d5" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_alert_record_tenant_id_created" ON "alert_record" ("tenantId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_alert_record_policy_id_issue_id_created" ON "alert_record" ("policyId", "issueId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_alert_record_status_scheduled_at" ON "alert_record" ("status", "scheduledAt")
        `)
        await queryRunner.query(`
            CREATE TABLE "privacy_settings" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "logRetentionDays" integer NOT NULL,
                "payloadLevel" character varying NOT NULL,
                "rawPayloadRetentionDays" integer NOT NULL,
                "maskRules" jsonb NOT NULL,
                "rawViewRoles" character varying array NOT NULL,
                "requireRawViewReason" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_e31cc479f8c3267c86511223ea0" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_privacy_settings_tenant_id" ON "privacy_settings" ("tenantId")
        `)
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD "issueId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "issue"
            ADD CONSTRAINT "fk_issue_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "issue_activity"
            ADD CONSTRAINT "fk_issue_activity_issue_id" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "notification_channel"
            ADD CONSTRAINT "fk_notification_channel_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_policy"
            ADD CONSTRAINT "fk_alert_policy_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_record"
            ADD CONSTRAINT "fk_alert_record_policy_id" FOREIGN KEY ("policyId") REFERENCES "alert_policy"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "privacy_settings"
            ADD CONSTRAINT "fk_privacy_settings_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "privacy_settings" DROP CONSTRAINT "fk_privacy_settings_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_record" DROP CONSTRAINT "fk_alert_record_policy_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_policy" DROP CONSTRAINT "fk_alert_policy_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "notification_channel" DROP CONSTRAINT "fk_notification_channel_tenant_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "issue_activity" DROP CONSTRAINT "fk_issue_activity_issue_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "issue" DROP CONSTRAINT "fk_issue_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX IF EXISTS "public"."idx_execution_issue_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP COLUMN "issueId"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_privacy_settings_tenant_id"
        `)
        await queryRunner.query(`
            DROP TABLE "privacy_settings"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_alert_record_status_scheduled_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_alert_record_policy_id_issue_id_created"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_alert_record_tenant_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "alert_record"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_alert_policy_tenant_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "alert_policy"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_notification_channel_tenant_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "notification_channel"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_issue_activity_issue_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "issue_activity"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_issue_project_id_status_last_seen_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_issue_project_id_signature"
        `)
        await queryRunner.query(`
            DROP TABLE "issue"
        `)
    }
}
