import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddPersonalDataHashes1791204000000 implements Migration {
    name = 'AddPersonalDataHashes1791204000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "execution" ADD COLUMN IF NOT EXISTS "searchHashes" character varying array NOT NULL DEFAULT '{}'
        `)
        await queryRunner.query(`
            ALTER TABLE "data_erasure_request"
                ADD COLUMN IF NOT EXISTS "valueHash" character varying,
                ADD COLUMN IF NOT EXISTS "confirmedById" character varying(21),
                ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP WITH TIME ZONE,
                ADD COLUMN IF NOT EXISTS "counts" jsonb
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "data_erasure_request"
                DROP COLUMN IF EXISTS "counts",
                DROP COLUMN IF EXISTS "confirmedAt",
                DROP COLUMN IF EXISTS "confirmedById",
                DROP COLUMN IF EXISTS "valueHash"
        `)
        await queryRunner.query('ALTER TABLE "execution" DROP COLUMN IF EXISTS "searchHashes"')
    }
}
