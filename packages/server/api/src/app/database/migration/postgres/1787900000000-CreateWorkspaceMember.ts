import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateWorkspaceMember1787900000000 implements MigrationInterface {
    name = 'CreateWorkspaceMember1787900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "workspace_member" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workspaceId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "role" character varying NOT NULL,
                CONSTRAINT "PK_workspace_member" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_workspace_member_workspace_user" ON "workspace_member" ("workspaceId", "userId")
        `)
        await queryRunner.query(`
            ALTER TABLE "workspace_member"
            ADD CONSTRAINT "fk_workspace_member_workspace_id"
            FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "workspace_member"
            ADD CONSTRAINT "fk_workspace_member_user_id"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "workspace_member" DROP CONSTRAINT "fk_workspace_member_user_id"')
        await queryRunner.query('ALTER TABLE "workspace_member" DROP CONSTRAINT "fk_workspace_member_workspace_id"')
        await queryRunner.query('DROP INDEX "idx_workspace_member_workspace_user"')
        await queryRunner.query('DROP TABLE "workspace_member"')
    }
}
