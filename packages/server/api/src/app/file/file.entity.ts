import { File, FileCompression, FileType, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../database/database-common'

type FileSchema = File & {
    workspace: Workspace
}

export const FileEntity = new EntitySchema<FileSchema>({
    name: 'file',
    columns: {
        ...BaseColumnSchemaPart,
        workspaceId: { ...ApIdSchema, nullable: true },
        tenantId: { ...ApIdSchema, nullable: true },
        data: {
            type: 'bytea',
            nullable: true,
        },
        location: {
            type: String,
            nullable: false,
        },
        fileName: {
            type: String,
            nullable: true,
        },
        size: {
            type: Number,
            nullable: true,
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
        s3Key: {
            type: String,
            nullable: true,
        },
        type: {
            type: String,
            default: FileType.UNKNOWN,
            nullable: false,
        },
        compression: {
            type: String,
            default: FileCompression.NONE,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_file_workspace_id_type_created',
            columns: ['workspaceId', 'type', 'created'],
        },
        {
            name: 'idx_file_type_created_desc',
            columns: ['type', 'created'],
        },
        {
            name: 'idx_file_tenant_id_null_workspace',
            columns: ['tenantId'],
            where: '"workspaceId" IS NULL',
        },
        {
            // Real index is a partial expression index on (type, (metadata->>'workflowId')),
            // created in 1815000000000-AddSampleDataWorkflowIdIndexToFile. EntitySchema can't
            // express the expression, so synchronize:false stops migration:generate dropping it.
            name: 'idx_file_sample_data_workflow_id',
            columns: ['type'],
            synchronize: false,
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
                foreignKeyConstraintName: 'fk_file_workspace_id',
            },
        },
    },
})
