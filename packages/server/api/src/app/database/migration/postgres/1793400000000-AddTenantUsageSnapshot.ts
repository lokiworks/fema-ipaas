import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddTenantUsageSnapshot1793400000000 implements Migration {
    name = 'AddTenantUsageSnapshot1793400000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "tenant_usage_snapshot" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "date" date NOT NULL,
                "activeWorkflows" integer NOT NULL,
                CONSTRAINT "pk_tenant_usage_snapshot" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_tenant_usage_snapshot_tenant_date" ON "tenant_usage_snapshot" ("tenantId", "date")
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant_usage_snapshot"
            ADD CONSTRAINT "fk_tenant_usage_snapshot_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "tenant_usage_snapshot"')
    }
}
