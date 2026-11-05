import { PlatformClient } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const PlatformClientEntity = new EntitySchema<PlatformClientSchema>({
    name: 'platform_client',
    columns: {
        ...BaseColumnSchemaPart,
        name: {
            type: String,
            nullable: false,
        },
        kind: {
            type: String,
            nullable: false,
        },
        keyPrefix: {
            type: String,
            nullable: true,
        },
        secretHash: {
            type: String,
            nullable: true,
            select: false,
        },
        issuer: {
            type: String,
            nullable: true,
        },
        allowedSubjects: {
            type: String,
            array: true,
            nullable: false,
            default: [],
        },
        scopes: {
            type: String,
            array: true,
            nullable: false,
        },
        createdByIdentityId: {
            ...EntityIdSchema,
            nullable: true,
        },
        lastUsedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        revokedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_platform_client_key_prefix',
            columns: ['keyPrefix'],
            unique: true,
            where: '"keyPrefix" IS NOT NULL',
        },
    ],
})

export type PlatformClientSchema = PlatformClient & {
    secretHash: string | null
    createdByIdentityId: string | null
}
