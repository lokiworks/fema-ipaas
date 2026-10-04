import { QueryRunner } from 'typeorm'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { DatabaseType } from '../../database-type'
import { Migration } from '../../migration'

const isPGlite = system.get(AppSystemProp.DB_TYPE) === DatabaseType.PGLITE
const createIndex = isPGlite ? 'CREATE INDEX IF NOT EXISTS' : 'CREATE INDEX CONCURRENTLY IF NOT EXISTS'

export class AddExecutionSearchHashesIndex1791204000001 implements Migration {
    name = 'AddExecutionSearchHashesIndex1791204000001'
    breaking = false
    release = '0.89.0'
    transaction = false

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`${createIndex} "idx_execution_search_hashes" ON "execution" USING GIN ("searchHashes")`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS "idx_execution_search_hashes"')
    }
}
