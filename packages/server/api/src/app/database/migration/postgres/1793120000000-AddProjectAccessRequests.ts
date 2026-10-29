import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddProjectAccessRequests1793120000000 implements Migration {
    name = 'AddProjectAccessRequests1793120000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "project_access_request" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "reason" character varying,
                "status" character varying NOT NULL,
                "decidedBy" character varying(21),
                "decidedAt" TIMESTAMP WITH TIME ZONE,
                "grantedRole" character varying,
                CONSTRAINT "PK_d64d2951d34477e5f974f30ffdf" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_access_request_tenant_status" ON "project_access_request" ("tenantId", "status")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_access_request_project_status" ON "project_access_request" ("projectId", "status")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_access_request_user" ON "project_access_request" ("userId")
        `)
        await queryRunner.query(`
            ALTER TABLE "project_access_request"
            ADD CONSTRAINT "fk_project_access_request_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "project_access_request"
            ADD CONSTRAINT "fk_project_access_request_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "project_access_request"
            ADD CONSTRAINT "fk_project_access_request_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "project_access_request" DROP CONSTRAINT "fk_project_access_request_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_access_request" DROP CONSTRAINT "fk_project_access_request_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_access_request" DROP CONSTRAINT "fk_project_access_request_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_access_request_user"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_access_request_project_status"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_access_request_tenant_status"
        `)
        await queryRunner.query(`
            DROP TABLE "project_access_request"
        `)
    }
}
