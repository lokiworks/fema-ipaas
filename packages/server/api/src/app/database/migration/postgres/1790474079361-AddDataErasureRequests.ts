import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddDataErasureRequests1790474079361 implements Migration {
    name = 'AddDataErasureRequests1790474079361'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "data_erasure_request" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "kind" character varying NOT NULL,
                "valueHint" character varying NOT NULL,
                "subjectHint" character varying,
                "reason" character varying NOT NULL,
                "requestedById" character varying(21) NOT NULL,
                "status" character varying NOT NULL,
                "scannedRuns" integer NOT NULL,
                "matchedRuns" integer NOT NULL,
                "erasedRuns" integer NOT NULL,
                "matchedWorkflows" jsonb NOT NULL,
                "matchedExecutionIds" character varying array NOT NULL,
                "firstMatchAt" TIMESTAMP WITH TIME ZONE,
                "lastMatchAt" TIMESTAMP WITH TIME ZONE,
                "finishedAt" TIMESTAMP WITH TIME ZONE,
                "error" character varying,
                "valueEncrypted" jsonb,
                CONSTRAINT "PK_808621854502e5e17e92024a7b6" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_data_erasure_request_tenant_id_created" ON "data_erasure_request" ("tenantId", "created")
        `)
        await queryRunner.query(`
            ALTER TABLE "data_erasure_request"
            ADD CONSTRAINT "fk_data_erasure_request_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "data_erasure_request" DROP CONSTRAINT "fk_data_erasure_request_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_data_erasure_request_tenant_id_created"
        `)
        await queryRunner.query(`
            DROP TABLE "data_erasure_request"
        `)
    }
}
