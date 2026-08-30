import { Project, UserInvitation } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../database/database-common'

type UserInvitationSchema = UserInvitation & {
    project?: Project
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
        projectId: {
            type: String,
            nullable: true,
        },
        status: {
            type: String,
            nullable: false,
        },
        projectRoleId: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_user_invitation_email_tenant_project',
            columns: ['email', 'tenantId', 'projectId'],
            unique: true,
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
                foreignKeyConstraintName: 'fk_user_invitation_project_id',
            },
        },
    },
})
