import { Tenant, TenantDomain } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const TenantDomainEntity = new EntitySchema<TenantDomainSchema>({
    name: 'tenant_domain',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        domain: {
            type: String,
            nullable: false,
        },
        purpose: {
            type: String,
            nullable: false,
        },
        verificationRecord: {
            type: 'jsonb',
            nullable: false,
        },
        verifiedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_tenant_domain_domain_purpose',
            columns: ['domain', 'purpose'],
            unique: true,
        },
        {
            name: 'idx_tenant_domain_tenant',
            columns: ['tenantId'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_tenant_domain_tenant_id',
            },
        },
    },
})

type TenantDomainSchema = TenantDomain & {
    tenant: Tenant
}
