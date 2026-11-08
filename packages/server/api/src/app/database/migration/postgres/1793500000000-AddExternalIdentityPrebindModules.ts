import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddExternalIdentityPrebindModules1793500000000 implements Migration {
    name = 'AddExternalIdentityPrebindModules1793500000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "external_identity"
            ADD COLUMN "prebindModules" character varying array NOT NULL DEFAULT '{}'
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "external_identity" DROP COLUMN "prebindModules"')
    }
}
