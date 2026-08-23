import { ConnectorBlueprint } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

export const ConnectorBlueprintEntity = new EntitySchema<ConnectorBlueprint>({
    name: 'connector_blueprint',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: ApIdSchema,
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
