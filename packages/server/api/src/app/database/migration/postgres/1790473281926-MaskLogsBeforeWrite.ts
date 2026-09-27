import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class MaskLogsBeforeWrite1790473281926 implements Migration {
    name = 'MaskLogsBeforeWrite1790473281926'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD "displayLogsFileId" character varying(21)
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_raw_state_purge" ON "execution" ("finishTime")
            WHERE "displayLogsFileId" IS NOT NULL
                AND "logsFileId" IS NOT NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_raw_state_purge"
        `)
        await queryRunner.query(`
            ALTER TABLE "execution" DROP COLUMN "displayLogsFileId"
        `)
    }
}
