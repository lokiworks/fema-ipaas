import { ConnectorDemandStatus, Tenant, User, UserIdentity } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'

export const ConnectorDemandEntity = new EntitySchema<ConnectorDemandSchema>({
    name: 'connector_demand',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        requesterId: {
            ...EntityIdSchema,
            nullable: true,
        },
        appName: {
            type: String,
            nullable: false,
        },
        capability: {
            type: String,
            nullable: false,
        },
        status: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_connector_demand_tenant_created',
            columns: ['tenantId', 'created'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_connector_demand_tenant_id',
            },
        },
        requester: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'requesterId',
                foreignKeyConstraintName: 'fk_connector_demand_requester_id',
            },
        },
    },
})

export type ConnectorDemandSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    requesterId: string | null
    appName: string
    capability: string
    status: ConnectorDemandStatus
    requester?: User & { identity?: UserIdentity }
    tenant?: Tenant
}
