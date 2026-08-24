import { ConnectorBlueprint } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'

export const ConnectorBlueprintEntity = new EntitySchema<ConnectorBlueprint>({
    name: 'connector_blueprint',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        definition: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_connector_blueprint_tenant',
            columns: ['tenantId'],
            unique: false,
        },
    ],
})
