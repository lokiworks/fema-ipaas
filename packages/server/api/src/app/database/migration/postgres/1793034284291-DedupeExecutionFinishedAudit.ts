import { QueryRunner } from 'typeorm'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { DatabaseType } from '../../database-type'
import { Migration } from '../../migration'

export class DedupeExecutionFinishedAudit1793034284291 implements Migration {
    name = 'DedupeExecutionFinishedAudit1793034284291'
    breaking = false
    release = '0.89.0'
    transaction = false

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "audit_event"
            ADD "eventKey" character varying
        `)
        await queryRunner.query(`
            ${system.get(AppSystemProp.DB_TYPE) === DatabaseType.PGLITE ? 'CREATE UNIQUE INDEX' : 'CREATE UNIQUE INDEX CONCURRENTLY'} "idx_audit_event_event_key" ON "audit_event" ("tenantId", "eventKey")
            WHERE "eventKey" IS NOT NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."idx_audit_event_event_key"
        `)
        await queryRunner.query(`
            ALTER TABLE "audit_event" DROP COLUMN "eventKey"
        `)
    }

}
