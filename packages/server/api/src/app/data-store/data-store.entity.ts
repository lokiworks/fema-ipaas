import { DATA_STORE_DEFAULT_TTL_DAYS, DataStore, Project } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const DataStoreEntity = new EntitySchema<DataStoreSchema>({
    name: 'data_store',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        name: {
            type: String,
        },
        description: {
            type: String,
            nullable: true,
        },
        ttlDays: {
            type: Number,
            default: DATA_STORE_DEFAULT_TTL_DAYS,
        },
        ownerId: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_data_store_project_id_name',
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
                foreignKeyConstraintName: 'fk_data_store_project_id',
            },
        },
    },
})

export type DataStoreSchema = DataStore & {
    project?: Project
}
