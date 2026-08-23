import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateConnectorBlueprint1787900000004 implements MigrationInterface {
    name = 'CreateConnectorBlueprint1787900000004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "connector_blueprint" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "definition" jsonb NOT NULL,
                CONSTRAINT "PK_connector_blueprint" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX "idx_connector_blueprint_tenant" ON "connector_blueprint" ("tenantId")')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX "idx_connector_blueprint_tenant"')
        await queryRunner.query('DROP TABLE "connector_blueprint"')
    }
}
