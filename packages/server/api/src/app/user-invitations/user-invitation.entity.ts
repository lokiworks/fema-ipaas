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
        tenantId: {
            type: String,
            nullable: false,
        },
        type: {
            type: String,
            nullable: false,
        },
        tenantRole: {
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
            name: 'idx_user_invitation_email_tenant_workspace',
            columns: ['email', 'tenantId', 'workspaceId'],
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
