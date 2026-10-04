import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class SnapshotAgentApprovalWorkflowName1791010000000 implements Migration {
    name = 'SnapshotAgentApprovalWorkflowName1791010000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "agent_approval" ADD "workflowDisplayName" character varying NOT NULL DEFAULT ''
        `)
        await queryRunner.query(`
            ALTER TABLE "agent_approval" ADD "invalidReason" character varying
        `)
        await queryRunner.query(`
            UPDATE "agent_approval" SET "workflowDisplayName" = COALESCE((
                SELECT "workflow_version"."displayName" FROM "workflow_version"
                WHERE "workflow_version"."workflowId" = "agent_approval"."workflowId"
                ORDER BY "workflow_version"."created" DESC LIMIT 1
            ), '')
        `)
        await queryRunner.query(`
            UPDATE "agent_approval" SET "status" = 'INVALIDATED', "invalidReason" = 'WORKFLOW_DELETED', "decidedAt" = now()
            WHERE "status" = 'PENDING'
            AND NOT EXISTS (SELECT 1 FROM "workflow" WHERE "workflow"."id" = "agent_approval"."workflowId")
        `)
        await queryRunner.query(`
            UPDATE "agent_approval" SET "status" = 'INVALIDATED', "invalidReason" = 'RUN_DELETED', "decidedAt" = now()
            WHERE "status" = 'PENDING'
            AND NOT EXISTS (SELECT 1 FROM "execution" WHERE "execution"."id" = "agent_approval"."executionId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "agent_approval" SET "status" = 'EXPIRED' WHERE "status" = 'INVALIDATED'
        `)
        await queryRunner.query(`
            ALTER TABLE "agent_approval" DROP COLUMN "invalidReason"
        `)
        await queryRunner.query(`
            ALTER TABLE "agent_approval" DROP COLUMN "workflowDisplayName"
        `)
    }
}
