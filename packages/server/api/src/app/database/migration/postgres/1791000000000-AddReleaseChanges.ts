import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddReleaseChanges1791000000000 implements Migration {
    name = 'AddReleaseChanges1791000000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "release_change" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "workflowId" character varying(21),
                "action" character varying NOT NULL,
                "actorId" character varying(21) NOT NULL,
                "fromVersionId" character varying(21),
                "toVersionId" character varying(21),
                "restoredVersionId" character varying(21),
                "note" text,
                "comment" text,
                "approverIds" character varying array NOT NULL,
                "releaseId" character varying(21),
                "environmentsEnabled" boolean,
                CONSTRAINT "PK_9bf10d06a2e227b3886f872ff34" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_release_change_project_id_created" ON "release_change" ("projectId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_release_change_workflow_id_created" ON "release_change" ("workflowId", "created")
        `)
        await queryRunner.query(`
            ALTER TABLE "release_change"
            ADD CONSTRAINT "fk_release_change_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            INSERT INTO "release_change" (
                "id", "created", "updated", "projectId", "workflowId", "action", "actorId",
                "fromVersionId", "toVersionId", "restoredVersionId", "note", "comment", "approverIds", "releaseId", "environmentsEnabled"
            )
            SELECT
                audit."id",
                audit."created",
                audit."created",
                audit."projectId",
                audit."data"->'workflow'->>'id',
                CASE audit."action"
                    WHEN 'release.deployed_to_test' THEN 'DEPLOYED_TO_TEST'
                    WHEN 'release.requested' THEN 'REQUESTED'
                    WHEN 'release.approved' THEN 'APPROVED'
                    WHEN 'release.rejected' THEN 'REJECTED'
                    WHEN 'release.withdrawn' THEN 'WITHDRAWN'
                    WHEN 'release.rolled_back' THEN 'ROLLED_BACK'
                    ELSE 'ENVIRONMENTS_UPDATED'
                END,
                audit."userId",
                audit."data"->>'previousVersionId',
                CASE WHEN audit."action" = 'release.rolled_back' THEN NULL ELSE audit."data"->>'versionId' END,
                CASE WHEN audit."action" = 'release.rolled_back' THEN audit."data"->>'versionId' ELSE NULL END,
                audit."data"->>'note',
                audit."data"->>'comment',
                COALESCE(ARRAY(SELECT jsonb_array_elements_text(audit."data"->'approverIds')), ARRAY[]::character varying[]),
                audit."data"->>'releaseId',
                (audit."data"->>'environmentsEnabled')::boolean
            FROM "audit_event" audit
            INNER JOIN "project" ON "project"."id" = audit."projectId"
            WHERE audit."userId" IS NOT NULL
            AND audit."action" IN (
                'release.deployed_to_test', 'release.requested', 'release.approved', 'release.rejected',
                'release.withdrawn', 'release.rolled_back', 'release.environments.updated'
            )
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "release_change" DROP CONSTRAINT "fk_release_change_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_release_change_workflow_id_created"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_release_change_project_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "release_change"
        `)
    }
}
