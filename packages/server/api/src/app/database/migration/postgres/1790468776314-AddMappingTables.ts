import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddMappingTables1790468776314 implements Migration {
    name = 'AddMappingTables1790468776314'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "mapping_table" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "description" character varying NOT NULL,
                "keyLabel" character varying NOT NULL,
                "valueLabel" character varying NOT NULL,
                "missingBehavior" character varying NOT NULL,
                "defaultValue" character varying,
                "rows" jsonb NOT NULL,
                "updatedById" character varying(21),
                CONSTRAINT "PK_3e654fc793050420daecc7ef76c" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mapping_table_project_id_name" ON "mapping_table" ("projectId", "name")
        `)
        await queryRunner.query(`
            ALTER TABLE "mapping_table"
            ADD CONSTRAINT "fk_mapping_table_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "mapping_table" DROP CONSTRAINT "fk_mapping_table_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mapping_table_project_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "mapping_table"
        `)
    }
}
