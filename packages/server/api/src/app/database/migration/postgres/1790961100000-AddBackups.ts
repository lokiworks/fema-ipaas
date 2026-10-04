import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddBackups1790961100000 implements Migration {
    name = 'AddBackups1790961100000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "backup_record" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "status" character varying NOT NULL,
                "trigger" character varying NOT NULL,
                "engine" character varying NOT NULL,
                "appVersion" character varying NOT NULL,
                "schemaVersion" character varying,
                "databaseVersion" character varying,
                "fileName" character varying,
                "sizeBytes" bigint,
                "checksum" character varying,
                "keyFingerprint" character varying,
                "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "finishedAt" TIMESTAMP WITH TIME ZONE,
                "error" character varying,
                "note" character varying,
                "createdBy" character varying(21),
                "counts" jsonb,
                "uploadedToObjectStorage" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_a2d36e4ea5bad8682367c6ca2dc" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_backup_record_tenant_id_started_at" ON "backup_record" ("tenantId", "startedAt")
        `)
        await queryRunner.query(`
            ALTER TABLE "backup_record"
            ADD CONSTRAINT "fk_backup_record_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            CREATE TABLE "backup_settings" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "enabled" boolean NOT NULL,
                "frequency" character varying NOT NULL,
                "weekday" integer NOT NULL,
                "hour" integer NOT NULL,
                "keep" integer NOT NULL,
                "uploadToObjectStorage" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_bae1cf1091b1f856098097f9510" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_backup_settings_tenant_id" ON "backup_settings" ("tenantId")
        `)
        await queryRunner.query(`
            ALTER TABLE "backup_settings"
            ADD CONSTRAINT "fk_backup_settings_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "backup_settings"')
        await queryRunner.query('DROP TABLE "backup_record"')
    }
}
