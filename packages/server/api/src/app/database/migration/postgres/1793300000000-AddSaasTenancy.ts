import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddSaasTenancy1793300000000 implements Migration {
    name = 'AddSaasTenancy1793300000000'
    breaking = true
    release = '0.89.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "tenant"
            ADD COLUMN "slug" character varying,
            ADD COLUMN "status" character varying NOT NULL DEFAULT 'ACTIVE',
            ADD COLUMN "externalIssuer" character varying,
            ADD COLUMN "externalTenantId" character varying,
            ADD COLUMN "mfaPolicy" character varying NOT NULL DEFAULT 'OPTIONAL',
            ADD COLUMN "phoneAuthEnabled" boolean NOT NULL DEFAULT true,
            ADD COLUMN "usersLimit" integer,
            ADD COLUMN "projectsLimit" integer,
            ADD COLUMN "activeWorkflowsLimit" integer,
            ADD COLUMN "concurrentExecutionsLimit" integer,
            ADD COLUMN "workerGroupId" character varying
        `)
        await queryRunner.query(`
            UPDATE "tenant"
            SET "slug" = 't' || substring(md5("id") from 1 for 10)
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant" ALTER COLUMN "slug" SET NOT NULL
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_tenant_slug" ON "tenant" ("slug")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_tenant_external_ref" ON "tenant" ("externalIssuer", "externalTenantId") WHERE "externalIssuer" IS NOT NULL
        `)

        await queryRunner.query(`
            ALTER TABLE "user_identity"
            ALTER COLUMN "email" DROP NOT NULL,
            ADD COLUMN "contactEmail" character varying,
            ADD COLUMN "phone" character varying,
            ADD COLUMN "phoneVerified" boolean NOT NULL DEFAULT false,
            ADD COLUMN "mfaEnabled" boolean NOT NULL DEFAULT false,
            ADD COLUMN "mfaSecret" character varying,
            ADD COLUMN "mfaRecoveryCodes" jsonb,
            ADD COLUMN "instanceRole" character varying
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_identity_phone" ON "user_identity" ("phone") WHERE "phone" IS NOT NULL
        `)
        await queryRunner.query(`
            UPDATE "user_identity" SET "instanceRole" = 'OPERATOR'
            WHERE "id" = (
                SELECT "user"."identityId" FROM "tenant"
                JOIN "user" ON "user"."id" = "tenant"."ownerId"
                ORDER BY "tenant"."created" ASC
                LIMIT 1
            )
        `)

        await queryRunner.query(`
            CREATE TABLE "external_identity" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "issuer" character varying NOT NULL,
                "subject" character varying NOT NULL,
                "tenantId" character varying(21) NOT NULL,
                "identityId" character varying(21),
                "userId" character varying(21),
                "prebindRole" character varying,
                "status" character varying NOT NULL,
                "email" character varying,
                "displayName" character varying,
                "refreshToken" jsonb,
                "lastVerifiedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_external_identity" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_external_identity_issuer_subject" ON "external_identity" ("issuer", "subject")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_external_identity_tenant" ON "external_identity" ("tenantId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_external_identity_user" ON "external_identity" ("userId")
        `)
        await queryRunner.query(`
            ALTER TABLE "external_identity"
            ADD CONSTRAINT "fk_external_identity_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            CREATE TABLE "tenant_domain" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tenantId" character varying(21) NOT NULL,
                "domain" character varying NOT NULL,
                "purpose" character varying NOT NULL,
                "verificationRecord" jsonb NOT NULL,
                "verifiedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_tenant_domain" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_tenant_domain_domain_purpose" ON "tenant_domain" ("domain", "purpose")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_tenant_domain_tenant" ON "tenant_domain" ("tenantId")
        `)
        await queryRunner.query(`
            ALTER TABLE "tenant_domain"
            ADD CONSTRAINT "fk_tenant_domain_tenant_id" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            CREATE TABLE "platform_client" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "kind" character varying NOT NULL,
                "keyPrefix" character varying,
                "secretHash" character varying,
                "issuer" character varying,
                "allowedSubjects" character varying array NOT NULL DEFAULT '{}',
                "scopes" character varying array NOT NULL,
                "createdByIdentityId" character varying(21),
                "lastUsedAt" TIMESTAMP WITH TIME ZONE,
                "revokedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_platform_client" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_platform_client_key_prefix" ON "platform_client" ("keyPrefix") WHERE "keyPrefix" IS NOT NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "platform_client"')
        await queryRunner.query('DROP TABLE "tenant_domain"')
        await queryRunner.query('DROP TABLE "external_identity"')
        await queryRunner.query('DROP INDEX "idx_user_identity_phone"')
        await queryRunner.query(`
            ALTER TABLE "user_identity"
            DROP COLUMN "contactEmail",
            DROP COLUMN "phone",
            DROP COLUMN "phoneVerified",
            DROP COLUMN "mfaEnabled",
            DROP COLUMN "mfaSecret",
            DROP COLUMN "mfaRecoveryCodes",
            DROP COLUMN "instanceRole"
        `)
        await queryRunner.query('DROP INDEX "idx_tenant_external_ref"')
        await queryRunner.query('DROP INDEX "idx_tenant_slug"')
        await queryRunner.query(`
            ALTER TABLE "tenant"
            DROP COLUMN "slug",
            DROP COLUMN "status",
            DROP COLUMN "externalIssuer",
            DROP COLUMN "externalTenantId",
            DROP COLUMN "mfaPolicy",
            DROP COLUMN "phoneAuthEnabled",
            DROP COLUMN "usersLimit",
            DROP COLUMN "projectsLimit",
            DROP COLUMN "activeWorkflowsLimit",
            DROP COLUMN "concurrentExecutionsLimit",
            DROP COLUMN "workerGroupId"
        `)
    }
}
