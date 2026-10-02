import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddSolutions1790921911539 implements Migration {
    name = 'AddSolutions1790921911539'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "solution" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21),
                "provider" character varying NOT NULL,
                "name" character varying NOT NULL,
                "summary" character varying NOT NULL,
                "category" character varying NOT NULL,
                "visibility" character varying NOT NULL,
                "sourceProjectId" character varying(21),
                "currentVersion" character varying NOT NULL,
                "createdBy" character varying(21),
                CONSTRAINT "PK_73fc40b114205776818a2f2f248" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_solution_tenant_id" ON "solution" ("tenantId")
        `)
        await queryRunner.query(`
            CREATE TABLE "solution_version" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "solutionId" character varying(21) NOT NULL,
                "version" character varying NOT NULL,
                "notes" character varying NOT NULL,
                "package" jsonb NOT NULL,
                "publishedBy" character varying(21) NOT NULL,
                CONSTRAINT "PK_796b4ed60c6d8733b5c63810b3d" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_solution_version_solution_id_version" ON "solution_version" ("solutionId", "version")
        `)
        await queryRunner.query(`
            CREATE TABLE "solution_install" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "solutionId" character varying NOT NULL,
                "solutionName" character varying NOT NULL,
                "version" character varying NOT NULL,
                "config" jsonb NOT NULL,
                "connections" jsonb NOT NULL,
                "workflowIds" character varying array NOT NULL,
                "mappingTableIds" character varying array NOT NULL,
                "skippedChecks" character varying array NOT NULL,
                "installedBy" character varying(21) NOT NULL,
                CONSTRAINT "PK_42472b41faf4453c36628855b29" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_solution_install_project_id" ON "solution_install" ("projectId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_solution_install_tenant_id_solution_id" ON "solution_install" ("tenantId", "solutionId")
        `)
        await queryRunner.query(`
            ALTER TABLE "solution"
            ADD CONSTRAINT "fk_solution_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "solution_version"
            ADD CONSTRAINT "fk_solution_version_solution_id" FOREIGN KEY ("solutionId") REFERENCES "solution"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "solution_install"
            ADD CONSTRAINT "fk_solution_install_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "solution_install" DROP CONSTRAINT "fk_solution_install_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "solution_version" DROP CONSTRAINT "fk_solution_version_solution_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "solution" DROP CONSTRAINT "fk_solution_tenant_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_solution_install_tenant_id_solution_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_solution_install_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "solution_install"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_solution_version_solution_id_version"
        `)
        await queryRunner.query(`
            DROP TABLE "solution_version"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_solution_tenant_id"
        `)
        await queryRunner.query(`
            DROP TABLE "solution"
        `)
    }

}
