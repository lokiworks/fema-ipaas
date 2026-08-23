import {
    Connection,
    ConnectionStatus,
    User,
    UserIdentity,
} from '@fema/shared'
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
        platformId: {
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
        projectIds: {
            type: String,
            array: true,
            nullable: false,
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
        preSelectForNewProjects: {
            type: Boolean,
            nullable: false,
            default: false,
        },
    },
    indices: [
        {
            name: 'idx_connection_platform_id_and_external_id',
            columns: ['platformId', 'externalId'],
        },
        {
            name: 'idx_connection_owner_id',
            columns: ['ownerId'],
        },
        {
            name: 'idx_connection_project_ids_gin',
            columns: ['projectIds'],
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
