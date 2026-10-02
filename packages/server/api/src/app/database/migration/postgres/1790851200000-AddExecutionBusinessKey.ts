import { QueryRunner } from 'typeorm'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { DatabaseType } from '../../database-type'
import { Migration } from '../../migration'

const isPGlite = system.get(AppSystemProp.DB_TYPE) === DatabaseType.PGLITE

export class AddExecutionBusinessKey1790851200000 implements Migration {
    name = 'AddExecutionBusinessKey1790851200000'
    breaking = false
    release = '0.89.0'
    transaction = false

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "execution" ADD COLUMN IF NOT EXISTS "businessKey" character varying
        `)
        await queryRunner.query(isPGlite
            ? `CREATE INDEX IF NOT EXISTS "idx_execution_project_business_key" ON "execution" ("projectId", "businessKey")`
            : `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_execution_project_business_key" ON "execution" ("projectId", "businessKey")`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(isPGlite
            ? `DROP INDEX IF EXISTS "idx_execution_project_business_key"`
            : `DROP INDEX CONCURRENTLY IF EXISTS "idx_execution_project_business_key"`)
        await queryRunner.query(`ALTER TABLE "execution" DROP COLUMN IF EXISTS "businessKey"`)
    }
}
