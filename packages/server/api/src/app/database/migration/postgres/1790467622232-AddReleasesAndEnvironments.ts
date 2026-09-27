import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddReleasesAndEnvironments1790467622232 implements Migration {
    name = 'AddReleasesAndEnvironments1790467622232'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "workflow_release" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "workflowVersionId" character varying(21) NOT NULL,
                "previousVersionId" character varying(21),
                "status" character varying NOT NULL,
                "note" text NOT NULL,
                "requestedById" character varying(21) NOT NULL,
                "approverIds" character varying array NOT NULL,
                "decidedById" character varying(21),
                "decidedAt" TIMESTAMP WITH TIME ZONE,
                "comment" text,
                CONSTRAINT "PK_70b2bf47c3910568d539a66ea08" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_release_project_id_created" ON "workflow_release" ("projectId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_release_workflow_id_status" ON "workflow_release" ("workflowId", "status")
        `)
        await queryRunner.query(`
            CREATE TABLE "connection_replacement" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "sourceConnectionId" character varying(21) NOT NULL,
                "targetConnectionId" character varying(21) NOT NULL,
                CONSTRAINT "PK_11793644f37cf2be1e4f197da68" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_connection_replacement_project_id_source" ON "connection_replacement" ("projectId", "sourceConnectionId")
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD "releaseApproverIds" character varying array NOT NULL DEFAULT '{}'
        `)
        await queryRunner.query(`
            ALTER TABLE "variable"
            ADD "testValue" jsonb
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_release"
            ADD CONSTRAINT "fk_workflow_release_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_replacement"
            ADD CONSTRAINT "fk_connection_replacement_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "connection_replacement" DROP CONSTRAINT "fk_connection_replacement_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow_release" DROP CONSTRAINT "fk_workflow_release_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "variable" DROP COLUMN "testValue"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP COLUMN "releaseApproverIds"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connection_replacement_project_id_source"
        `)
        await queryRunner.query(`
            DROP TABLE "connection_replacement"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_release_workflow_id_status"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_workflow_release_project_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "workflow_release"
        `)
    }
}
