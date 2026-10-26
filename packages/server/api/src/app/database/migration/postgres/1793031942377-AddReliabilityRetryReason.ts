import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddReliabilityRetryReason1793031942377 implements Migration {
    name = 'AddReliabilityRetryReason1793031942377'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "run_reliability_event"
            ADD "reason" character varying
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "run_reliability_event" DROP COLUMN "reason"
        `)
    }

}
