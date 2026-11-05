import { UserIdentity } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'

export const UserIdentityEntity = new EntitySchema<UserIdentity>({
    name: 'user_identity',
    columns: {
        ...BaseColumnSchemaPart,
        email: {
            type: String,
            nullable: true,
            unique: true,
        },
        contactEmail: {
            type: String,
            nullable: true,
        },
        phone: {
            type: String,
            nullable: true,
        },
        phoneVerified: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        mfaEnabled: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        mfaSecret: {
            type: String,
            nullable: true,
            select: false,
        },
        mfaRecoveryCodes: {
            type: 'jsonb',
            nullable: true,
            select: false,
        },
        instanceRole: {
            type: String,
            nullable: true,
        },
        password: {
            type: String,
        },
        trackEvents: {
            type: Boolean,
            nullable: true,
        },
        newsLetter: {
            type: Boolean,
            nullable: true,
        },
        verified: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        firstName: {
            type: String,
            nullable: false,
        },
        lastName: {
            type: String,
            nullable: false,
        },
        tokenVersion: {
            type: String,
            nullable: true,
        },
        provider: {
            type: String,
            nullable: false,
        },
        imageUrl: {
            type: String,
            nullable: true,
        },
        lastLoggedInTenantId: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_user_identity_email',
            columns: ['email'],
            unique: true,
        },
        {
            name: 'idx_user_identity_phone',
            columns: ['phone'],
            unique: true,
            where: '"phone" IS NOT NULL',
        },
    ],
})
