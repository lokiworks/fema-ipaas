import { ConnectorBlueprint, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'
import { EncryptedObject } from '../../helper/encryption'

export type ConnectorBlueprintSchema = ConnectorBlueprint & {
    authTestData: EncryptedObject | null
    tenant?: Tenant
}

export const ConnectorBlueprintEntity = new EntitySchema<ConnectorBlueprintSchema>({
    name: 'connector_blueprint',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        identifier: {
            type: String,
            length: 40,
        },
        connectorName: {
            type: String,
        },
        ownerId: EntityIdSchema,
        collaboratorIds: {
            type: String,
            array: true,
            nullable: false,
        },
        definition: {
            type: 'jsonb',
            nullable: false,
        },
        publishedDefinition: {
            type: 'jsonb',
            nullable: true,
        },
        authState: {
            type: 'jsonb',
            nullable: false,
        },
        authTestData: {
            type: 'jsonb',
            nullable: true,
        },
        debugRecords: {
            type: 'jsonb',
            nullable: false,
        },
        draftBuild: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_connector_blueprint_tenant',
            columns: ['tenantId'],
            unique: false,
        },
        {
            name: 'idx_connector_blueprint_tenant_identifier',
            columns: ['tenantId', 'identifier'],
            unique: true,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_connector_blueprint_tenant_id',
            },
        },
    },
})
