import { ConnectorBlueprintVersion } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'
import { ConnectorBlueprintSchema } from './connector-blueprint.entity'

export type ConnectorBlueprintVersionSchema = ConnectorBlueprintVersion & {
    blueprint?: ConnectorBlueprintSchema
}

export const ConnectorBlueprintVersionEntity = new EntitySchema<ConnectorBlueprintVersionSchema>({
    name: 'connector_blueprint_version',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        blueprintId: EntityIdSchema,
        connectorName: {
            type: String,
        },
        version: {
            type: String,
            length: 16,
        },
        packageVersion: {
            type: String,
            length: 32,
        },
        status: {
            type: String,
        },
        canaryProjectIds: {
            type: String,
            array: true,
            nullable: false,
        },
        description: {
            type: String,
        },
        publishedBy: EntityIdSchema,
        publishedAt: {
            type: 'timestamp with time zone',
        },
        updates: {
            type: 'jsonb',
            nullable: false,
        },
        definition: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_connector_blueprint_version_blueprint_version',
            columns: ['blueprintId', 'version'],
            unique: true,
        },
        {
            name: 'idx_connector_blueprint_version_tenant_connector',
            columns: ['tenantId', 'connectorName'],
            unique: false,
        },
    ],
    relations: {
        blueprint: {
            type: 'many-to-one',
            target: 'connector_blueprint',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'blueprintId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_connector_blueprint_version_blueprint_id',
            },
        },
    },
})
