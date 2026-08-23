import { NetworkAgent, Workspace } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../database/database-common'

type NetworkAgentSchema = NetworkAgent & {
    tokenHash: string
    workspace?: Workspace
}

export const NetworkAgentEntity = new EntitySchema<NetworkAgentSchema>({
    name: 'network_agent',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: ApIdSchema,
        workspaceId: {
            ...ApIdSchema,
            nullable: true,
        },
        displayName: {
            type: String,
            nullable: false,
        },
        status: {
            type: String,
            nullable: false,
        },
        tokenHash: {
            type: String,
            nullable: false,
        },
        hostAllowlist: {
            type: String,
            array: true,
            nullable: false,
        },
        cidrAllowlist: {
            type: String,
            array: true,
            nullable: false,
        },
        lastSeenAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_network_agent_tenant_display_name',
            columns: ['tenantId', 'displayName'],
            unique: true,
        },
    ],
    relations: {
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            onDelete: 'CASCADE',
            nullable: true,
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_network_agent_workspace_id',
            },
        },
    },
})
