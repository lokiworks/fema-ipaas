import { PersonalAccessToken, Tenant, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const PersonalAccessTokenEntity = new EntitySchema<PersonalAccessTokenSchema>({
    name: 'personal_access_token',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        userId: EntityIdSchema,
        name: {
            type: String,
            nullable: false,
        },
        tokenHash: {
            type: String,
            nullable: false,
        },
        tokenHint: {
            type: String,
            nullable: false,
        },
        expiresAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        lastUsedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_personal_access_token_hash',
            columns: ['tokenHash'],
            unique: true,
        },
        {
            name: 'idx_personal_access_token_user',
            columns: ['tenantId', 'userId'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_personal_access_token_tenant_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_personal_access_token_user_id',
            },
        },
    },
})

export type PersonalAccessTokenSchema = PersonalAccessToken & {
    tenantId: string
    userId: string
    tokenHash: string
    tenant: Tenant
    user: User
}
