import { ConnectionSharePermission, User, UserIdentity } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'
import { ConnectionSchema } from './connection.entity'

export const ConnectionShareEntity = new EntitySchema<ConnectionShareSchema>({
    name: 'connection_share',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        connectionId: EntityIdSchema,
        userId: EntityIdSchema,
        permission: {
            type: String,
            nullable: false,
        },
        createdBy: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_connection_share_connection_user',
            columns: ['connectionId', 'userId'],
            unique: true,
        },
        {
            name: 'idx_connection_share_tenant_user',
            columns: ['tenantId', 'userId'],
        },
    ],
    relations: {
        connection: {
            type: 'many-to-one',
            target: 'connection',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'connectionId',
                foreignKeyConstraintName: 'fk_connection_share_connection_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_connection_share_user_id',
            },
        },
    },
})

export type ConnectionShareSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    connectionId: string
    userId: string
    permission: ConnectionSharePermission
    createdBy: string | null
    connection?: ConnectionSchema
    user?: User & { identity?: UserIdentity }
}
