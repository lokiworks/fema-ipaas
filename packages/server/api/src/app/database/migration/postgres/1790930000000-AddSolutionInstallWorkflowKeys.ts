import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddSolutionInstallWorkflowKeys1790930000000 implements Migration {
    name = 'AddSolutionInstallWorkflowKeys1790930000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "solution_install"
            ADD "workflowKeys" character varying array
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "solution_install" DROP COLUMN "workflowKeys"
        `)
    }
}
