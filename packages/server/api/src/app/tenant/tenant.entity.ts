import { Tenant, TenantLimits, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../database/database-common'

type TenantSchema = Tenant & TenantLimits & {
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
        welcomeText: {
            type: String,
            nullable: true,
        },
        passwordMinLength: {
            type: Number,
            nullable: false,
            default: 10,
        },
        sessionDurationDays: {
            type: Number,
            nullable: false,
            default: 7,
        },
        moduleAccessSettings: {
            type: 'jsonb',
            nullable: true,
        },
        slug: {
            type: String,
            nullable: false,
        },
        status: {
            type: String,
            nullable: false,
            default: 'ACTIVE',
        },
        externalIssuer: {
            type: String,
            nullable: true,
        },
        externalTenantId: {
            type: String,
            nullable: true,
        },
        mfaPolicy: {
            type: String,
            nullable: false,
            default: 'OPTIONAL',
        },
        phoneAuthEnabled: {
            type: Boolean,
            nullable: false,
            default: true,
        },
        usersLimit: {
            type: Number,
            nullable: true,
        },
        projectsLimit: {
            type: Number,
            nullable: true,
        },
        activeWorkflowsLimit: {
            type: Number,
            nullable: true,
        },
        concurrentExecutionsLimit: {
            type: Number,
            nullable: true,
        },
        workerGroupId: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_tenant_slug',
            columns: ['slug'],
            unique: true,
        },
        {
            name: 'idx_tenant_external_ref',
            columns: ['externalIssuer', 'externalTenantId'],
            unique: true,
            where: '"externalIssuer" IS NOT NULL',
        },
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
