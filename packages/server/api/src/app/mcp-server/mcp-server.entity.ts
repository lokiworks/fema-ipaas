import { McpServerAuthType, McpServerProbeError, McpServerTool, McpServerTransport } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { ConnectionSchema } from '../connection/connection.entity'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const McpServerEntity = new EntitySchema<McpServerSchema>({
    name: 'mcp_server',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        connectionId: EntityIdSchema,
        description: {
            type: String,
            nullable: false,
            default: '',
        },
        url: {
            type: String,
            nullable: false,
        },
        transport: {
            type: String,
            nullable: false,
        },
        authType: {
            type: String,
            nullable: false,
        },
        tools: {
            type: 'jsonb',
            nullable: false,
            default: [],
        },
        lastSyncedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        lastError: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_mcp_server_connection_id',
            columns: ['connectionId'],
            unique: true,
        },
        {
            name: 'idx_mcp_server_tenant_id',
            columns: ['tenantId'],
        },
    ],
    relations: {
        connection: {
            type: 'one-to-one',
            target: 'connection',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'connectionId',
                foreignKeyConstraintName: 'fk_mcp_server_connection_id',
            },
        },
    },
})

export type McpServerSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    connectionId: string
    description: string
    url: string
    transport: McpServerTransport
    authType: McpServerAuthType
    tools: McpServerTool[]
    lastSyncedAt: string | null
    lastError: McpServerProbeError | null
    connection?: ConnectionSchema
}
