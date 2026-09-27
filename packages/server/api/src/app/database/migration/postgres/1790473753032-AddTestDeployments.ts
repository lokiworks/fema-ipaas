import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddTestDeployments1790473753032 implements Migration {
    name = 'AddTestDeployments1790473753032'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD "testVersionId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD "testDeployedAt" TIMESTAMP WITH TIME ZONE
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow"
            ADD CONSTRAINT "fk_workflow_test_version" FOREIGN KEY ("testVersionId") REFERENCES "workflow_version"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP CONSTRAINT "fk_workflow_test_version"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP COLUMN "testDeployedAt"
        `)
        await queryRunner.query(`
            ALTER TABLE "workflow" DROP COLUMN "testVersionId"
        `)
    }
}
