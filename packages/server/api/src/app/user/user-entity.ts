import { Project, User, UserIdentity } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../database/database-common'

export type UserSchema = User & {
    projects: Project[]
    identity: UserIdentity
}

export const UserEntity = new EntitySchema<UserSchema>({
    name: 'user',
    columns: {
        ...BaseColumnSchemaPart,
        status: {
            type: String,
        },
        tenantRole: {
            type: String,
            nullable: false,
        },
        identityId: {
            type: String,
            nullable: false,
        },
        externalId: {
            type: String,
            nullable: true,
        },
        tenantId: {
            type: String,
            nullable: true,
        },
        lastActiveDate: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_user_tenant_id_email',
            columns: ['tenantId', 'identityId'],
            unique: true,
        },
        {
            name: 'idx_user_tenant_id_external_id',
            columns: ['tenantId', 'externalId'],
            unique: true,
        },
        {
            name: 'idx_user_identity_id',
            columns: ['identityId'],
        },
    ],
    relations: {
        projects: {
            type: 'one-to-many',
            target: 'project',
            inverseSide: 'owner',
        },
        identity: {
            type: 'many-to-one',
            target: 'user_identity',
            joinColumn: {
                name: 'identityId',
                referencedColumnName: 'id',
            },
        },
    },
})
