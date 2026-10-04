import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddIssueWorkflows1791030000000 implements Migration {
    name = 'AddIssueWorkflows1791030000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "issue_workflow" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "issueId" character varying(21) NOT NULL,
                "workflowId" character varying(21) NOT NULL,
                "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "pk_issue_workflow_id" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_issue_workflow_issue_id_workflow_id" ON "issue_workflow" ("issueId", "workflowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_issue_workflow_workflow_id" ON "issue_workflow" ("workflowId")
        `)
        await queryRunner.query(`
            ALTER TABLE "issue_workflow"
            ADD CONSTRAINT "fk_issue_workflow_issue_id" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "issue_workflow"
            ADD CONSTRAINT "fk_issue_workflow_workflow_id" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "issue_workflow" DROP CONSTRAINT "fk_issue_workflow_workflow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "issue_workflow" DROP CONSTRAINT "fk_issue_workflow_issue_id"
        `)
        await queryRunner.query(`
            DROP INDEX "idx_issue_workflow_workflow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "idx_issue_workflow_issue_id_workflow_id"
        `)
        await queryRunner.query(`
            DROP TABLE "issue_workflow"
        `)
    }
}
