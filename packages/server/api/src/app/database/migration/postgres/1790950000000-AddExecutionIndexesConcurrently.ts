import { QueryRunner } from 'typeorm'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { DatabaseType } from '../../database-type'
import { Migration } from '../../migration'

const isPGlite = system.get(AppSystemProp.DB_TYPE) === DatabaseType.PGLITE
const createIndex = isPGlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX CONCURRENTLY IF NOT EXISTS'

export class AddExecutionIndexesConcurrently1790950000000 implements Migration {
    name = 'AddExecutionIndexesConcurrently1790950000000'
    breaking = false
    release = '0.89.0'
    transaction = false

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`${createIndex} "idx_execution_issue_id" ON "execution" ("issueId")`)
        await queryRunner.query(`${createIndex} "idx_run_raw_state_purge" ON "execution" ("finishTime") WHERE "displayLogsFileId" IS NOT NULL AND "logsFileId" IS NOT NULL`)
        await queryRunner.query(`${createIndex} "idx_execution_rerun_of_execution_id" ON "execution" ("rerunOfExecutionId")`)
        await queryRunner.query(`${createIndex} "idx_execution_verification_candidates" ON "execution" ("projectId", "finishTime", "id") WHERE "environment" = 'PRODUCTION' AND "status" = 'SUCCEEDED' AND "businessKey" IS NOT NULL AND "archivedAt" IS NULL`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS "idx_execution_verification_candidates"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_execution_rerun_of_execution_id"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_run_raw_state_purge"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_execution_issue_id"')
    }
}
