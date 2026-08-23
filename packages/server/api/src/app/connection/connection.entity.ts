import {
    Connection,
    ConnectionStatus,
    User,
    UserIdentity,
} from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
} from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

export type ConnectionSchema = Omit<Connection, 'value'> & {
    value: EncryptedObject
    owner?: (User & { identity?: UserIdentity })
}

export const ConnectionEntity = new EntitySchema<ConnectionSchema>({
    name: 'connection',
    columns: {
        ...BaseColumnSchemaPart,
        displayName: {
            type: String,
        },
        externalId: {
            type: String,
        },
        type: {
            type: String,
        },
        status: {
            type: String,
            default: ConnectionStatus.ACTIVE,
        },
        tenantId: {
            type: String,
            nullable: false,
        },
        connectorName: {
            type: String,
        },
        ownerId: {
            type: String,
            nullable: true,
        },
        workspaceIds: {
            type: String,
            array: true,
            nullable: false,
        },
        networkAgentId: {
            type: String,
            nullable: true,
        },
        scope: {
            type: String,
        },
        value: {
            type: 'jsonb',
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
        connectorVersion: {
            type: String,
        },
        preSelectForNewWorkspaces: {
            type: Boolean,
            nullable: false,
            default: false,
        },
    },
    indices: [
        {
            name: 'idx_connection_tenant_id_and_external_id',
            columns: ['tenantId', 'externalId'],
        },
        {
            name: 'idx_connection_owner_id',
            columns: ['ownerId'],
        },
        {
            name: 'idx_connection_workspace_ids_gin',
            columns: ['workspaceIds'],
            synchronize: false,
        },
    ],
    relations: {
        owner: {
            type: 'many-to-one',
            target: 'user',
            cascade: true,
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'ownerId',
                foreignKeyConstraintName: 'fk_connection_owner_id',
            },
        },
    },
})
