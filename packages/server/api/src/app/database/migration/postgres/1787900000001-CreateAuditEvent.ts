import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAuditEvent1787900000001 implements MigrationInterface {
    name = 'CreateAuditEvent1787900000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "audit_event" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "workspaceId" character varying(21),
                "workspaceDisplayName" character varying,
                "userId" character varying(21),
                "userEmail" character varying,
                "ip" character varying,
                "action" character varying NOT NULL,
                "data" jsonb NOT NULL,
                CONSTRAINT "PK_audit_event" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX "idx_audit_event_tenant_created" ON "audit_event" ("tenantId", "created")')
        await queryRunner.query('CREATE INDEX "idx_audit_event_workspace_action" ON "audit_event" ("workspaceId", "action")')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX "idx_audit_event_workspace_action"')
        await queryRunner.query('DROP INDEX "idx_audit_event_tenant_created"')
        await queryRunner.query('DROP TABLE "audit_event"')
    }
}
