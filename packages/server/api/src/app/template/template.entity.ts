import { Template, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
} from '../database/database-common'

type TemplateSchema = Template & {
    tenant: Tenant
}

export const TemplateEntity = new EntitySchema<TemplateSchema>({
    name: 'template',
    columns: {
        ...BaseColumnSchemaPart,
        name: {
            type: String,
        },
        summary: {
            type: String,
            nullable: false,
        },
        description: {
            type: String,
        },
        type: {
            type: String,
        },
        tenantId: {
            type: String,
            nullable: true,
        },
        status: {
            type: String,
            nullable: false,
        },
        workflows: {
            type: 'jsonb',
            nullable: true,
        },
        tables: {
            type: 'jsonb',
            nullable: true,
        },
        tags: {
            type: 'jsonb',
            nullable: false,
        },
        blogUrl: {
            type: String,
            nullable: true,
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
        author: {
            type: String,
            nullable: false,
        },
        categories: {
            type: String,
            array: true,
            nullable: false,
        },
        connectors: {
            type: String,
            array: true,
        },
    },
    indices: [
        {
            name: 'idx_template_connectors',
            columns: ['connectors'],
            unique: false,
        },
        {
            name: 'idx_template_categories',
            columns: ['categories'],
            unique: false,
        },
        {
            name: 'idx_template_tenant_id',
            columns: ['tenantId'],
            unique: false,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            nullable: true,
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_template_tenant_id',
            },
        },
    },
})
