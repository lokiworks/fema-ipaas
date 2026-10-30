import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddNotificationResolution1793200000000 implements Migration {
    name = 'AddNotificationResolution1793200000000'
    breaking = false
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "notification" ADD "subjectId" character varying(21)
        `)
        await queryRunner.query(`
            ALTER TABLE "notification" ADD "resolution" character varying
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_notification_subject" ON "notification" ("tenantId", "type", "subjectId")
            WHERE "subjectId" IS NOT NULL
        `)
        await queryRunner.query(`
            UPDATE "notification" AS "n"
            SET "subjectId" = "m"."requestId"
            FROM (
                SELECT "candidate"."id" AS "notificationId", (
                    SELECT "r"."id"
                    FROM "project_access_request" AS "r"
                    WHERE "r"."tenantId" = "candidate"."tenantId"
                        AND "r"."projectId" = "candidate"."projectId"
                        AND "r"."reason" IS NOT DISTINCT FROM "candidate"."body"
                        AND "r"."created" BETWEEN "candidate"."created" - INTERVAL '5 minutes' AND "candidate"."created" + INTERVAL '5 minutes'
                    ORDER BY ABS(EXTRACT(EPOCH FROM ("r"."created" - "candidate"."created")))
                    LIMIT 1
                ) AS "requestId"
                FROM "notification" AS "candidate"
                WHERE "candidate"."type" = 'PROJECT_ACCESS_REQUESTED'
                    AND "candidate"."subjectId" IS NULL
            ) AS "m"
            WHERE "n"."id" = "m"."notificationId"
                AND "m"."requestId" IS NOT NULL
        `)
        await queryRunner.query(`
            UPDATE "notification" AS "n"
            SET "resolution" = "r"."status", "read" = true
            FROM "project_access_request" AS "r"
            WHERE "n"."type" = 'PROJECT_ACCESS_REQUESTED'
                AND "n"."resolution" IS NULL
                AND "n"."subjectId" = "r"."id"
                AND "r"."status" IN ('APPROVED', 'REJECTED', 'WITHDRAWN')
        `)
        await queryRunner.query(`
            UPDATE "notification" AS "n"
            SET "resolution" = 'PROJECT_DELETED', "read" = true
            FROM "project" AS "p"
            WHERE "n"."type" = 'PROJECT_ACCESS_REQUESTED'
                AND "n"."resolution" IS NULL
                AND "p"."id" = "n"."projectId"
                AND "p"."deleted" IS NOT NULL
        `)
        await queryRunner.query(`
            UPDATE "notification"
            SET "resolution" = 'REQUESTER_REMOVED', "read" = true
            WHERE "type" = 'PROJECT_ACCESS_REQUESTED'
                AND "resolution" IS NULL
                AND "subjectId" IS NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."idx_notification_subject"
        `)
        await queryRunner.query(`
            ALTER TABLE "notification" DROP COLUMN "resolution"
        `)
        await queryRunner.query(`
            ALTER TABLE "notification" DROP COLUMN "subjectId"
        `)
    }
}
