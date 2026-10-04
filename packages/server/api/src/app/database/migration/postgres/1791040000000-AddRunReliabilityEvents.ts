import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddRunReliabilityEvents1791040000000 implements Migration {
    name = 'AddRunReliabilityEvents1791040000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "run_reliability_event" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "executionId" character varying(21) NOT NULL,
                "kind" character varying NOT NULL,
                "eventKey" character varying NOT NULL,
                "stepName" character varying,
                "connectorName" character varying,
                "limitUnit" character varying,
                "errorCode" character varying,
                "waitSeconds" integer,
                "gapSeconds" integer,
                CONSTRAINT "pk_run_reliability_event_id" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_run_reliability_event_event_key" ON "run_reliability_event" ("eventKey")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_reliability_event_execution_id_kind" ON "run_reliability_event" ("executionId", "kind")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_reliability_event_project_id_kind_created" ON "run_reliability_event" ("projectId", "kind", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_reliability_event_workflow_id_created" ON "run_reliability_event" ("workflowId", "created")
        `)
        await queryRunner.query(`
            ALTER TABLE "run_reliability_event"
            ADD CONSTRAINT "fk_run_reliability_event_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "run_reliability_event"
            ADD CONSTRAINT "fk_run_reliability_event_workflow_id" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "run_reliability_event" DROP CONSTRAINT "fk_run_reliability_event_workflow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "run_reliability_event" DROP CONSTRAINT "fk_run_reliability_event_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "idx_run_reliability_event_workflow_id_created"
        `)
        await queryRunner.query(`
            DROP INDEX "idx_run_reliability_event_project_id_kind_created"
        `)
        await queryRunner.query(`
            DROP INDEX "idx_run_reliability_event_execution_id_kind"
        `)
        await queryRunner.query(`
            DROP INDEX "idx_run_reliability_event_event_key"
        `)
        await queryRunner.query(`
            DROP TABLE "run_reliability_event"
        `)
    }
}
