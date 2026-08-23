import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddConnectorRegistryTrust1787900000003 implements MigrationInterface {
    name = 'AddConnectorRegistryTrust1787900000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "connector_metadata" ADD COLUMN "source" character varying')
        await queryRunner.query('ALTER TABLE "connector_metadata" ADD COLUMN "checksum" character varying')
        await queryRunner.query(`
            UPDATE "connector_metadata"
            SET "source" = CASE
                WHEN "connectorType" = 'OFFICIAL' THEN 'OFFICIAL'
                ELSE 'PRIVATE'
            END
        `)
        await queryRunner.query('ALTER TABLE "connector_metadata" ALTER COLUMN "source" SET NOT NULL')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "connector_metadata" DROP COLUMN "checksum"')
        await queryRunner.query('ALTER TABLE "connector_metadata" DROP COLUMN "source"')
    }
}
