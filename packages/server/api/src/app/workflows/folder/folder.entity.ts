import { Folder as Folder, Project, Workflow } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../../database/database-common'

export type FolderSchema = {
    workflows: Workflow[]
    project: Project
} & Folder

export const FolderEntity = new EntitySchema<FolderSchema>({
    name: 'folder',
    columns: {
        ...BaseColumnSchemaPart,
        displayName: {
            type: String,
        },
        projectId: EntityIdSchema,
        displayOrder: {
            type: Number,
            default: 0,
        },
        externalId: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_folder_project_id_display_name',
            columns: ['projectId', 'displayName'],
            unique: true,
        },
        {
            name: 'idx_folder_project_id_external_id',
            columns: ['projectId', 'externalId'],
            unique: true,
            where: '"externalId" IS NOT NULL',
        },
    ],
    relations: {
        workflows: {
            type: 'one-to-many',
            target: 'workflow',
            inverseSide: 'folder',
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_folder_project',
            },
        },
    },
})