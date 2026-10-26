import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddReconciliation1793033278791 implements Migration {
    name = 'AddReconciliation1793033278791'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "reconciliation_rule" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "source" jsonb NOT NULL,
                "target" jsonb NOT NULL,
                "scope" jsonb NOT NULL,
                "expectations" jsonb NOT NULL,
                "repair" jsonb NOT NULL,
                "cron" character varying NOT NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "maxRepairsPerRun" integer NOT NULL DEFAULT '20',
                CONSTRAINT "PK_c5dbecc376931759226cf7b79e3" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_reconciliation_rule_project" ON "reconciliation_rule" ("projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "reconciliation_run" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "ruleId" character varying(21) NOT NULL,
                "status" character varying NOT NULL,
                "startedAt" TIMESTAMP WITH TIME ZONE,
                "finishedAt" TIMESTAMP WITH TIME ZONE,
                "sourceCount" integer NOT NULL DEFAULT '0',
                "targetCount" integer NOT NULL DEFAULT '0',
                "matchedCount" integer NOT NULL DEFAULT '0',
                "differenceCount" integer NOT NULL DEFAULT '0',
                "repairedCount" integer NOT NULL DEFAULT '0',
                "error" text,
                CONSTRAINT "PK_4fa08b87bbb63890254c8cdcb57" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_reconciliation_run_rule_created" ON "reconciliation_run" ("projectId", "ruleId", "created")
        `)
        await queryRunner.query(`
            CREATE TABLE "reconciliation_difference" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "ruleId" character varying(21) NOT NULL,
                "businessKey" character varying NOT NULL,
                "aspect" character varying NOT NULL,
                "kind" character varying NOT NULL,
                "expected" jsonb,
                "actual" jsonb,
                "status" character varying NOT NULL,
                "firstSeenRunId" character varying(21) NOT NULL,
                "lastSeenRunId" character varying(21) NOT NULL,
                "repairExecutionId" character varying(21),
                "resolvedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_279c86d6b788934930d19700e0d" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_reconciliation_difference_open" ON "reconciliation_difference" ("ruleId", "businessKey", "aspect")
            WHERE status IN ('OPEN', 'REPAIRING')
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_reconciliation_difference_project_rule" ON "reconciliation_difference" ("projectId", "ruleId")
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_rule"
            ADD CONSTRAINT "FK_896ad1678e5eebdaf8ab0f33b87" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_rule"
            ADD CONSTRAINT "FK_9986a8181bfb317daf388aa7708" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_run"
            ADD CONSTRAINT "FK_ff98182156da9380ea6481313db" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_run"
            ADD CONSTRAINT "FK_ae26ee0ce3ace4ea3f869868636" FOREIGN KEY ("ruleId") REFERENCES "reconciliation_rule"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_difference"
            ADD CONSTRAINT "FK_fb6f41d58f9e4a7b3cbb5326759" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_difference"
            ADD CONSTRAINT "FK_5781d4f43f920fcb54b73b02edf" FOREIGN KEY ("ruleId") REFERENCES "reconciliation_rule"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "reconciliation_difference" DROP CONSTRAINT "FK_5781d4f43f920fcb54b73b02edf"
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_difference" DROP CONSTRAINT "FK_fb6f41d58f9e4a7b3cbb5326759"
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_run" DROP CONSTRAINT "FK_ae26ee0ce3ace4ea3f869868636"
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_run" DROP CONSTRAINT "FK_ff98182156da9380ea6481313db"
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_rule" DROP CONSTRAINT "FK_9986a8181bfb317daf388aa7708"
        `)
        await queryRunner.query(`
            ALTER TABLE "reconciliation_rule" DROP CONSTRAINT "FK_896ad1678e5eebdaf8ab0f33b87"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_reconciliation_difference_project_rule"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_reconciliation_difference_open"
        `)
        await queryRunner.query(`
            DROP TABLE "reconciliation_difference"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_reconciliation_run_rule_created"
        `)
        await queryRunner.query(`
            DROP TABLE "reconciliation_run"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_reconciliation_rule_project"
        `)
        await queryRunner.query(`
            DROP TABLE "reconciliation_rule"
        `)
    }

}
