import { User, Workspace, WorkspaceMember } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

type WorkspaceMemberSchema = WorkspaceMember & {
    workspace?: Workspace
    user?: User
}

export const WorkspaceMemberEntity = new EntitySchema<WorkspaceMemberSchema>({
    name: 'workspace_member',
    columns: {
        ...BaseColumnSchemaPart,
        workspaceId: EntityIdSchema,
        userId: EntityIdSchema,
        role: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_workspace_member_workspace_user',
            columns: ['workspaceId', 'userId'],
            unique: true,
        },
    ],
    relations: {
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_workspace_member_workspace_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_workspace_member_user_id',
            },
        },
    },
})
