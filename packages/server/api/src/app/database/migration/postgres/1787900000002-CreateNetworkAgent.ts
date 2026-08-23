import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateNetworkAgent1787900000002 implements MigrationInterface {
    name = 'CreateNetworkAgent1787900000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "network_agent" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "workspaceId" character varying(21),
                "displayName" character varying NOT NULL,
                "status" character varying NOT NULL,
                "tokenHash" character varying NOT NULL,
                "hostAllowlist" character varying array NOT NULL DEFAULT '{}',
                "cidrAllowlist" character varying array NOT NULL DEFAULT '{}',
                "lastSeenAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_network_agent" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE UNIQUE INDEX "idx_network_agent_tenant_display_name" ON "network_agent" ("tenantId", "displayName")')
        await queryRunner.query(`
            ALTER TABLE "network_agent"
            ADD CONSTRAINT "fk_network_agent_workspace_id"
            FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query('ALTER TABLE "connection" ADD COLUMN "networkAgentId" character varying(21)')
        await queryRunner.query(`
            ALTER TABLE "connection"
            ADD CONSTRAINT "fk_connection_network_agent_id"
            FOREIGN KEY ("networkAgentId") REFERENCES "network_agent"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "connection" DROP CONSTRAINT "fk_connection_network_agent_id"')
        await queryRunner.query('ALTER TABLE "connection" DROP COLUMN "networkAgentId"')
        await queryRunner.query('ALTER TABLE "network_agent" DROP CONSTRAINT "fk_network_agent_workspace_id"')
        await queryRunner.query('DROP INDEX "idx_network_agent_tenant_display_name"')
        await queryRunner.query('DROP TABLE "network_agent"')
    }
}
