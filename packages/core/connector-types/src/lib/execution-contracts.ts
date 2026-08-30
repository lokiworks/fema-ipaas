import { EntityId, BaseModelSchema, DateOrString, Nullable } from '@fema-ipaas/core-utils'
import * as z from 'zod/mini'
import { PackageType, ConnectorType } from './connector'
import { TriggerStrategy } from './trigger'

// Contracts that the execution layer (@fema-ipaas/workflow-core) and the engine
// need from @fema-ipaas/shared. Hosted here (the connector-types contract package) so
// the engine can name them without importing shared. See SRE-163.

// ── store-entry ────────────────────────────────────────────────────────────
export const STORE_KEY_MAX_LENGTH = 128

// ── connector version patterns ─────────────────────────────────────────────────
export const EXACT_VERSION_PATTERN = '^[0-9]+\\.[0-9]+\\.[0-9]+$'
export const EXACT_VERSION_REGEX = new RegExp(EXACT_VERSION_PATTERN)
const VERSION_PATTERN = '^([~^])?[0-9]+\\.[0-9]+\\.[0-9]+$'

export const ExactVersionType = z.string().check(z.regex(new RegExp(EXACT_VERSION_PATTERN)))
export const VersionType = z.string().check(z.regex(new RegExp(VERSION_PATTERN)))

// ── connector package ──────────────────────────────────────────────────────────
export const PrivateConnectorPackage = z.object({
    packageType: z.literal(PackageType.ARCHIVE),
    connectorType: z.enum(ConnectorType),
    connectorName: z.string(),
    connectorVersion: z.string(),
    archiveId: z.string(),
    tenantId: z.string(),
})
export type PrivateConnectorPackage = z.infer<typeof PrivateConnectorPackage>

export const OfficialConnectorPackage = z.object({
    packageType: z.literal(PackageType.REGISTRY),
    connectorType: z.literal(ConnectorType.OFFICIAL),
    connectorName: z.string(),
    connectorVersion: z.string(),
})
export type OfficialConnectorPackage = z.infer<typeof OfficialConnectorPackage>

export const CustomNpmConnectorPackage = z.object({
    packageType: z.literal(PackageType.REGISTRY),
    connectorType: z.literal(ConnectorType.CUSTOM),
    connectorName: z.string(),
    connectorVersion: z.string(),
    tenantId: z.string(),
})
export type CustomNpmConnectorPackage = z.infer<typeof CustomNpmConnectorPackage>

export const PublicConnectorPackage = z.union([OfficialConnectorPackage, CustomNpmConnectorPackage])
export type PublicConnectorPackage = OfficialConnectorPackage | CustomNpmConnectorPackage

export const ConnectorPackage = z.union([PrivateConnectorPackage, OfficialConnectorPackage, CustomNpmConnectorPackage])
export type ConnectorPackage = PrivateConnectorPackage | OfficialConnectorPackage | CustomNpmConnectorPackage

// ── trigger source / schedule ──────────────────────────────────────────────
export enum TriggerSourceScheduleType {
    CRON_EXPRESSION = 'CRON_EXPRESSION',
    INTERVAL = 'INTERVAL',
}

export const ScheduleOptions = z.discriminatedUnion('type', [
    z.object({
        type: z.literal(TriggerSourceScheduleType.CRON_EXPRESSION),
        cronExpression: z.string(),
        timezone: z.string(),
    }),
    z.object({
        type: z.literal(TriggerSourceScheduleType.INTERVAL),
        intervalMs: z.int().check(z.minimum(60000)),
    }),
])
export type ScheduleOptions = z.infer<typeof ScheduleOptions>

export const TriggerSource = z.object({
    ...BaseModelSchema,
    type: z.enum(TriggerStrategy),
    projectId: z.string(),
    workflowId: z.string(),
    triggerName: z.string(),
    schedule: Nullable(ScheduleOptions),
    workflowVersionId: z.string(),
    connectorName: z.string(),
    connectorVersion: z.string(),
    deleted: Nullable(z.string()),
    simulate: z.boolean(),
})
export type TriggerSource = z.infer<typeof TriggerSource>

// ── file ───────────────────────────────────────────────────────────────────
export type FileId = EntityId

export enum FileType {
    UNKNOWN = 'UNKNOWN',
    EXECUTION_LOG = 'EXECUTION_LOG',
    EXECUTION_LOG_SLICE = 'EXECUTION_LOG_SLICE',
    PACKAGE_ARCHIVE = 'PACKAGE_ARCHIVE',
    WORKFLOW_STEP_FILE = 'WORKFLOW_STEP_FILE',
    SAMPLE_DATA = 'SAMPLE_DATA',
    TRIGGER_PAYLOAD = 'TRIGGER_PAYLOAD',
    SAMPLE_DATA_INPUT = 'SAMPLE_DATA_INPUT',
    TRIGGER_EVENT_FILE = 'TRIGGER_EVENT_FILE',
    PROJECT_RELEASE = 'PROJECT_RELEASE',
    WORKFLOW_VERSION_BACKUP = 'WORKFLOW_VERSION_BACKUP',
    TENANT_ASSET = 'TENANT_ASSET',
    USER_PROFILE_PICTURE = 'USER_PROFILE_PICTURE',
    WEBHOOK_PAYLOAD = 'WEBHOOK_PAYLOAD',
    KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
    WORKFLOW_BUNDLE = 'WORKFLOW_BUNDLE',
}

export enum FileCompression {
    NONE = 'NONE',
    ZSTD = 'ZSTD',
}

export enum FileLocation {
    S3 = 'S3',
    DB = 'DB',
}

export const File = z.object({
    ...BaseModelSchema,
    projectId: Nullable(z.string()),
    tenantId: Nullable(z.string()),
    type: z.enum(FileType),
    compression: z.enum(FileCompression),
    data: z.optional(z.unknown()),
    location: z.enum(FileLocation),
    size: Nullable(z.number()),
    fileName: Nullable(z.string()),
    s3Key: Nullable(z.string()),
    metadata: Nullable(z.record(z.string(), z.string())),
})
export type File = z.infer<typeof File> & {
    data: Buffer
}

// ── user (meta) ────────────────────────────────────────────────────────────
export enum TenantRole {
    ADMIN = 'ADMIN',
    MEMBER = 'MEMBER',
    OPERATOR = 'OPERATOR',
}

export enum UserStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export const UserWithMetaInformation = z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    status: z.enum(UserStatus),
    externalId: Nullable(z.string()),
    tenantId: Nullable(z.string()),
    tenantRole: z.enum(TenantRole),
    lastName: z.string(),
    created: DateOrString,
    updated: DateOrString,
    lastActiveDate: Nullable(DateOrString),
    imageUrl: Nullable(z.string()),
})
export type UserWithMetaInformation = z.infer<typeof UserWithMetaInformation>
