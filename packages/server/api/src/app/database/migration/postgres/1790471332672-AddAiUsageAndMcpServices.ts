import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddAiUsageAndMcpServices1790471332672 implements Migration {
    name = 'AddAiUsageAndMcpServices1790471332672'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "ai_usage" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "workflowId" character varying(21),
                "executionId" character varying(21),
                "userId" character varying(21),
                "feature" character varying NOT NULL,
                "provider" character varying NOT NULL,
                "model" character varying NOT NULL,
                "inputTokens" integer NOT NULL,
                "outputTokens" integer NOT NULL,
                CONSTRAINT "PK_3dddab3a15520a9c3eba859195d" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_ai_usage_project_id_created" ON "ai_usage" ("projectId", "created")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_service" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "description" character varying NOT NULL,
                "enabled" boolean NOT NULL,
                "tools" jsonb NOT NULL,
                "tokenHash" character varying NOT NULL,
                "tokenHint" character varying NOT NULL,
                "lastUsedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_42d4818cf761efac216f009ff78" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_mcp_service_project_id" ON "mcp_service" ("projectId")
        `)
        await queryRunner.query(`
            ALTER TABLE "ai_usage"
            ADD CONSTRAINT "fk_ai_usage_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_service"
            ADD CONSTRAINT "fk_mcp_service_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "mcp_service" DROP CONSTRAINT "fk_mcp_service_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "ai_usage" DROP CONSTRAINT "fk_ai_usage_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_service_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_service"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_ai_usage_project_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "ai_usage"
        `)
    }
}
