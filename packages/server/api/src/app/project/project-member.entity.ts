import { Project, ProjectMember, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

type ProjectMemberSchema = ProjectMember & {
    project?: Project
    user?: User
}

export const ProjectMemberEntity = new EntitySchema<ProjectMemberSchema>({
    name: 'project_member',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        userId: EntityIdSchema,
        role: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_project_member_project_user',
            columns: ['projectId', 'userId'],
            unique: true,
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_project_member_project_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_project_member_user_id',
            },
        },
    },
})
