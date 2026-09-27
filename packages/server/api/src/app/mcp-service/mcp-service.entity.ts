import { McpAvailabilityMode, McpCredentialMode, McpServiceAvailability, McpServiceRelease, McpServiceTool, Project, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

export const McpServiceEntity = new EntitySchema<McpServiceSchema>({
    name: 'mcp_service',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        name: {
            type: String,
        },
        description: {
            type: String,
        },
        enabled: {
            type: Boolean,
        },
        tools: {
            type: 'jsonb',
        },
        tokenHash: {
            type: String,
        },
        tokenHint: {
            type: String,
        },
        lastUsedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        key: {
            type: String,
            nullable: true,
        },
        ownerId: {
            ...EntityIdSchema,
            nullable: true,
        },
        publishedTools: {
            type: 'jsonb',
            nullable: true,
        },
        releases: {
            type: 'jsonb',
            nullable: false,
            default: [],
        },
        draftChanged: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        listed: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        credentialMode: {
            type: String,
            nullable: false,
            default: McpCredentialMode.DEVELOPER,
        },
        fixedConnections: {
            type: 'jsonb',
            nullable: false,
            default: {},
        },
        availability: {
            type: 'jsonb',
            nullable: false,
            default: { mode: McpAvailabilityMode.ALL, userIds: [] },
        },
    },
    indices: [
        {
            name: 'idx_mcp_service_project_id',
            columns: ['projectId'],
        },
        {
            name: 'idx_mcp_service_key',
            columns: ['key'],
            unique: true,
            where: '"key" IS NOT NULL',
        },
        {
            name: 'idx_mcp_service_owner_id',
            columns: ['ownerId'],
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_mcp_service_project_id',
            },
        },
        owner: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'ownerId',
                foreignKeyConstraintName: 'fk_mcp_service_owner_id',
            },
        },
    },
})

export const McpServiceMemberEntity = new EntitySchema<McpServiceMemberSchema>({
    name: 'mcp_service_member',
    columns: {
        ...BaseColumnSchemaPart,
        serviceId: EntityIdSchema,
        userId: EntityIdSchema,
        tokenHash: {
            type: String,
            nullable: false,
        },
        tokenHint: {
            type: String,
            nullable: false,
        },
        tokenEncrypted: {
            type: 'jsonb',
            nullable: false,
        },
        connections: {
            type: 'jsonb',
            nullable: false,
            default: {},
        },
    },
    indices: [
        {
            name: 'idx_mcp_service_member_service_user',
            columns: ['serviceId', 'userId'],
            unique: true,
        },
        {
            name: 'idx_mcp_service_member_token_hash',
            columns: ['tokenHash'],
            unique: true,
        },
        {
            name: 'idx_mcp_service_member_user_id',
            columns: ['userId'],
        },
    ],
    relations: {
        service: {
            type: 'many-to-one',
            target: 'mcp_service',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'serviceId',
                foreignKeyConstraintName: 'fk_mcp_service_member_service_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_mcp_service_member_user_id',
            },
        },
    },
})

export const McpServiceUsageEntity = new EntitySchema<McpServiceUsageSchema>({
    name: 'mcp_service_usage',
    columns: {
        ...BaseColumnSchemaPart,
        serviceId: EntityIdSchema,
        day: {
            type: 'date',
            nullable: false,
        },
        calls: {
            type: Number,
            nullable: false,
            default: 0,
        },
        failures: {
            type: Number,
            nullable: false,
            default: 0,
        },
    },
    indices: [
        {
            name: 'idx_mcp_service_usage_service_day',
            columns: ['serviceId', 'day'],
            unique: true,
        },
    ],
    relations: {
        service: {
            type: 'many-to-one',
            target: 'mcp_service',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'serviceId',
                foreignKeyConstraintName: 'fk_mcp_service_usage_service_id',
            },
        },
    },
})

export type McpServiceSchema = {
    id: string
    created: string
    updated: string
    projectId: string
    name: string
    description: string
    enabled: boolean
    tools: unknown[]
    tokenHash: string
    tokenHint: string
    lastUsedAt: string | null
    key: string | null
    ownerId: string | null
    publishedTools: McpServiceTool[] | null
    releases: McpServiceRelease[]
    draftChanged: boolean
    listed: boolean
    credentialMode: McpCredentialMode
    fixedConnections: Record<string, string>
    availability: McpServiceAvailability
    project?: Project
    owner?: User
}

export type McpServiceMemberSchema = {
    id: string
    created: string
    updated: string
    serviceId: string
    userId: string
    tokenHash: string
    tokenHint: string
    tokenEncrypted: EncryptedObject
    connections: Record<string, string>
    service?: McpServiceSchema
    user?: User
}

export type McpServiceUsageSchema = {
    id: string
    created: string
    updated: string
    serviceId: string
    day: string
    calls: number
    failures: number
    service?: McpServiceSchema
}
