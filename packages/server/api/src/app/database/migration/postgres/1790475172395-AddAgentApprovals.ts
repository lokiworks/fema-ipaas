import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddAgentApprovals1790475172395 implements Migration {
    name = 'AddAgentApprovals1790475172395'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "agent_approval" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "executionId" character varying(21) NOT NULL,
                "stepName" character varying NOT NULL,
                "waitpointId" character varying(21) NOT NULL,
                "tool" character varying NOT NULL,
                "arguments" jsonb NOT NULL,
                "message" character varying NOT NULL,
                "status" character varying NOT NULL,
                "approverIds" character varying array NOT NULL,
                "decidedById" character varying(21),
                "decidedAt" TIMESTAMP WITH TIME ZONE,
                "comment" character varying,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_b6155951c0fa3a1dacc3a725e24" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_agent_approval_project_id_status" ON "agent_approval" ("projectId", "status")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_agent_approval_execution_id" ON "agent_approval" ("executionId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_agent_approval_status_expires_at" ON "agent_approval" ("status", "expiresAt")
        `)
        await queryRunner.query(`
            ALTER TABLE "agent_approval"
            ADD CONSTRAINT "fk_agent_approval_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "agent_approval" DROP CONSTRAINT "fk_agent_approval_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_agent_approval_status_expires_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_agent_approval_execution_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_agent_approval_project_id_status"
        `)
        await queryRunner.query(`
            DROP TABLE "agent_approval"
        `)
    }
}
