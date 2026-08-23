import { Flow, Folder as Folder, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../../database/database-common'

export type FolderSchema = {
    flows: Flow[]
    workspace: Workspace
} & Folder

export const FolderEntity = new EntitySchema<FolderSchema>({
    name: 'folder',
    columns: {
        ...BaseColumnSchemaPart,
        displayName: {
            type: String,
        },
        workspaceId: ApIdSchema,
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
            name: 'idx_folder_workspace_id_display_name',
            columns: ['workspaceId', 'displayName'],
            unique: true,
        },
        {
            name: 'idx_folder_workspace_id_external_id',
            columns: ['workspaceId', 'externalId'],
            unique: true,
            where: '"externalId" IS NOT NULL',
        },
    ],
    relations: {
        flows: {
            type: 'one-to-many',
            target: 'flow',
            inverseSide: 'folder',
        },
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_folder_workspace',
            },
        },
    },
})