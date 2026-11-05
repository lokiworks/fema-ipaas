import { ExternalIdentity, SsoEncryptedSecret, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const ExternalIdentityEntity = new EntitySchema<ExternalIdentitySchema>({
    name: 'external_identity',
    columns: {
        ...BaseColumnSchemaPart,
        issuer: {
            type: String,
            nullable: false,
        },
        subject: {
            type: String,
            nullable: false,
        },
        tenantId: EntityIdSchema,
        identityId: {
            ...EntityIdSchema,
            nullable: true,
        },
        userId: {
            ...EntityIdSchema,
            nullable: true,
        },
        prebindRole: {
            type: String,
            nullable: true,
        },
        status: {
            type: String,
            nullable: false,
        },
        email: {
            type: String,
            nullable: true,
        },
        displayName: {
            type: String,
            nullable: true,
        },
        refreshToken: {
            type: 'jsonb',
            nullable: true,
            select: false,
        },
        lastVerifiedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_external_identity_issuer_subject',
            columns: ['issuer', 'subject'],
            unique: true,
        },
        {
            name: 'idx_external_identity_tenant',
            columns: ['tenantId'],
        },
        {
            name: 'idx_external_identity_user',
            columns: ['userId'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_external_identity_tenant_id',
            },
        },
    },
})

export type ExternalIdentitySchema = ExternalIdentity & {
    email: string | null
    displayName: string | null
    refreshToken: SsoEncryptedSecret | null
    tenant: Tenant
}
