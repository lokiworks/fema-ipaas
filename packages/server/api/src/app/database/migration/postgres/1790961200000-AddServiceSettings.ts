import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddServiceSettings1790961200000 implements Migration {
    name = 'AddServiceSettings1790961200000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "service_setting" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "kind" character varying NOT NULL,
                "values" jsonb NOT NULL,
                "secrets" jsonb,
                "updatedBy" character varying(21),
                CONSTRAINT "PK_bf4654c506cce9a83232815f4a5" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_service_setting_tenant_id_kind" ON "service_setting" ("tenantId", "kind")
        `)
        await queryRunner.query(`
            ALTER TABLE "service_setting"
            ADD CONSTRAINT "fk_service_setting_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "service_setting"`)
    }
}
