import { UserInvitation, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../database/database-common'

type UserInvitationSchema = UserInvitation & {
    workspace?: Workspace
}
export const UserInvitationEntity = new EntitySchema<UserInvitationSchema>({
    name: 'user_invitation',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            type: String,
            nullable: false,
        },
        type: {
            type: String,
            nullable: false,
        },
        platformRole: {
            type: String,
            nullable: true,
        },
        email: {
            type: String,
        },
        workspaceId: {
            type: String,
            nullable: true,
        },
        status: {
            type: String,
            nullable: false,
        },
        workspaceRoleId: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_user_invitation_email_platform_workspace',
            columns: ['email', 'platformId', 'workspaceId'],
            unique: true,
        },
    ],
    relations: {
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_user_invitation_workspace_id',
            },
        },
    },
})
