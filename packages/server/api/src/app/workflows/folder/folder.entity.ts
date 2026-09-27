import { Folder as Folder, Project, Workflow } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../../database/database-common'

export type FolderSchema = {
    workflows: Workflow[]
    project: Project
    parent?: Folder | null
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
        parentId: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_folder_project_id_display_name',
            columns: ['projectId', 'displayName'],
            unique: true,
            where: '"parentId" IS NULL',
        },
        {
            name: 'idx_folder_parent_id_display_name',
            columns: ['parentId', 'displayName'],
            unique: true,
            where: '"parentId" IS NOT NULL',
        },
        {
            name: 'idx_folder_project_id_external_id',
            columns: ['projectId', 'externalId'],
            unique: true,
            where: '"externalId" IS NOT NULL',
        },
    ],
    relations: {
        parent: {
            type: 'many-to-one',
            target: 'folder',
            onDelete: 'CASCADE',
            nullable: true,
            joinColumn: {
                name: 'parentId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_folder_parent_id',
            },
        },
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