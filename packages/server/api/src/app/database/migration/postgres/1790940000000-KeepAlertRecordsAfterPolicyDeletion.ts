import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class KeepAlertRecordsAfterPolicyDeletion1790940000000 implements Migration {
    name = 'KeepAlertRecordsAfterPolicyDeletion1790940000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "alert_record" DROP CONSTRAINT IF EXISTS "fk_alert_record_policy_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_record"
            ADD CONSTRAINT "fk_alert_record_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "alert_record" DROP CONSTRAINT IF EXISTS "fk_alert_record_tenant_id"
        `)
        await queryRunner.query(`
            DELETE FROM "alert_record" WHERE "policyId" NOT IN (SELECT "id" FROM "alert_policy")
        `)
        await queryRunner.query(`
            ALTER TABLE "alert_record"
            ADD CONSTRAINT "fk_alert_record_policy_id" FOREIGN KEY ("policyId") REFERENCES "alert_policy"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }
}
