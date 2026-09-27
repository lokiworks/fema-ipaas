import { MappingTable, Project } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type MappingTableSchema = MappingTable & {
    project?: Project
}

export const MappingTableEntity = new EntitySchema<MappingTableSchema>({
    name: 'mapping_table',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        name: {
            type: String,
        },
        description: {
            type: String,
        },
        keyLabel: {
            type: String,
        },
        valueLabel: {
            type: String,
        },
        missingBehavior: {
            type: String,
        },
        defaultValue: {
            type: String,
            nullable: true,
        },
        rows: {
            type: 'jsonb',
        },
        updatedById: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_mapping_table_project_id_name',
            columns: ['projectId', 'name'],
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
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_mapping_table_project_id',
            },
        },
    },
})
