import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddExecutionWorkflowSnapshotFile1793210000000 implements Migration {
    name = 'AddExecutionWorkflowSnapshotFile1793210000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD "workflowSnapshotFileId" character varying(21)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "execution" DROP COLUMN "workflowSnapshotFileId"
        `)
    }

}
