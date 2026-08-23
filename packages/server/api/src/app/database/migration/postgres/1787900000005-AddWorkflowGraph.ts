import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkflowGraph1787900000005 implements MigrationInterface {
    name = 'AddWorkflowGraph1787900000005'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "workflow_version" ADD COLUMN "graph" jsonb')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "workflow_version" DROP COLUMN "graph"')
    }
}
