import { BackupCounts, BackupRecord, BackupSettings, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type BackupRecordSchema = Omit<BackupRecord, 'counts'> & {
    counts: BackupCounts | null
    tenant?: Tenant
}

export type BackupSettingsSchema = BackupSettings & {
    id: string
    created: string
    updated: string
    tenantId: string
    tenant?: Tenant
}

export const BackupRecordEntity = new EntitySchema<BackupRecordSchema>({
    name: 'backup_record',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        status: {
            type: String,
        },
        trigger: {
            type: String,
        },
        engine: {
            type: String,
        },
        appVersion: {
            type: String,
        },
        schemaVersion: {
            type: String,
            nullable: true,
        },
        databaseVersion: {
            type: String,
            nullable: true,
        },
        fileName: {
            type: String,
            nullable: true,
        },
        sizeBytes: {
            type: 'bigint',
            nullable: true,
            transformer: {
                to: (value: number | null) => value,
                from: (value: string | number | null) => value === null ? null : Number(value),
            },
        },
        checksum: {
            type: String,
            nullable: true,
        },
        keyFingerprint: {
            type: String,
            nullable: true,
        },
        startedAt: {
            type: 'timestamp with time zone',
        },
        finishedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        error: {
            type: String,
            nullable: true,
        },
        note: {
            type: String,
            nullable: true,
        },
        createdBy: {
            type: String,
            length: 21,
            nullable: true,
        },
        counts: {
            type: 'jsonb',
            nullable: true,
        },
        uploadedToObjectStorage: {
            type: Boolean,
            default: false,
        },
    },
    indices: [
        {
            name: 'idx_backup_record_tenant_id_started_at',
            columns: ['tenantId', 'startedAt'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_backup_record_tenant_id',
            },
        },
    },
})

export const BackupSettingsEntity = new EntitySchema<BackupSettingsSchema>({
    name: 'backup_settings',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        enabled: {
            type: Boolean,
        },
        frequency: {
            type: String,
        },
        weekday: {
            type: Number,
        },
        hour: {
            type: Number,
        },
        keep: {
            type: Number,
        },
        uploadToObjectStorage: {
            type: Boolean,
            default: false,
        },
    },
    indices: [
        {
            name: 'idx_backup_settings_tenant_id',
            columns: ['tenantId'],
            unique: true,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_backup_settings_tenant_id',
            },
        },
    },
})
