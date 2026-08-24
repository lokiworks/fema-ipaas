import { Tenant, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../database/database-common'

type TenantSchema = Tenant & {
    owner: User
}

export const TenantEntity = new EntitySchema<TenantSchema>({
    name: 'tenant',
    columns: {
        ...BaseColumnSchemaPart,
        ownerId: {
            ...EntityIdSchema,
            nullable: false,
        },
        name: {
            type: String,
            nullable: false,
        },
        primaryColor: {
            type: String,
            nullable: false,
        },
        themeColors: {
            type: 'jsonb',
            nullable: true,
        },
        logoIconUrl: {
            type: String,
            nullable: false,
        },
        fullLogoUrl: {
            type: String,
            nullable: false,
        },
        favIconUrl: {
            type: String,
            nullable: false,
        },
        cloudAuthEnabled: {
            type: Boolean,
            nullable: false,
            default: true,
        },
        googleAuthEnabled: {
            type: Boolean,
            nullable: false,
            default: true,
        },
        allowedAuthDomains: {
            type: String,
            array: true,
        },
        allowedEmbedOrigins: {
            type: String,
            array: true,
            nullable: false,
            default: [],
        },
        ssoDomain: {
            type: String,
            nullable: true,
        },
        ssoDomainVerification: {
            type: 'jsonb',
            nullable: true,
        },
        enforceAllowedAuthDomains: {
            type: Boolean,
            nullable: false,
        },
        emailAuthEnabled: {
            type: Boolean,
            nullable: false,
        },
        federatedAuthProviders: {
            type: 'jsonb',
            select: false,
        },
        pinnedConnectors: {
            type: String,
            array: true,
            nullable: false,
        },
        connectorSelectorConfig: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_tenant_sso_domain',
            columns: ['ssoDomain'],
            unique: true,
            where: '"ssoDomain" IS NOT NULL',
        },
    ],
    relations: {
        owner: {
            type: 'one-to-one',
            target: 'user',
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'ownerId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_tenant_user',
            },
        },
    },
})
