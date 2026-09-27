import { z } from 'zod'

export enum UpdateCheckStatus {
    UP_TO_DATE = 'UP_TO_DATE',
    UPDATE_AVAILABLE = 'UPDATE_AVAILABLE',
    FAILED = 'FAILED',
}

export enum EncryptionKeySource {
    ENVIRONMENT = 'ENVIRONMENT',
    GENERATED_FILE = 'GENERATED_FILE',
    MISSING = 'MISSING',
}

export enum OptionalServiceKind {
    SMTP = 'SMTP',
    OBJECT_STORAGE = 'OBJECT_STORAGE',
    CONNECTOR_REGISTRY = 'CONNECTOR_REGISTRY',
    TEMPLATE_REGISTRY = 'TEMPLATE_REGISTRY',
}

export enum SetupCheckKind {
    DATABASE = 'DATABASE',
    REDIS = 'REDIS',
    ENCRYPTION_KEY = 'ENCRYPTION_KEY',
    FILE_STORAGE = 'FILE_STORAGE',
    WORKERS = 'WORKERS',
}

export enum SetupCheckLevel {
    OK = 'OK',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

export const OptionalServiceStatus = z.object({
    kind: z.enum(OptionalServiceKind),
    enabled: z.boolean(),
    detail: z.string().nullable(),
})

export const SystemOverview = z.object({
    release: z.object({
        current: z.string(),
        latest: z.string().nullable(),
        updateCheck: z.enum(UpdateCheckStatus),
        checkedAt: z.string(),
    }),
    installedAt: z.string(),
    database: z.object({
        ok: z.boolean(),
        version: z.string().nullable(),
    }),
    redis: z.object({
        ok: z.boolean(),
        type: z.string(),
        version: z.string().nullable(),
    }),
    workers: z.object({
        online: z.number(),
        versions: z.array(z.string()),
    }),
    encryptionKey: z.object({
        source: z.enum(EncryptionKeySource),
        path: z.string().nullable(),
        retiredKeys: z.number(),
    }),
    fileStorage: z.object({
        location: z.string().nullable(),
        multiInstanceReady: z.boolean(),
    }),
    containerType: z.string().nullable(),
    frontendUrl: z.string().nullable(),
    services: z.array(OptionalServiceStatus),
})

export const DiagnosticsBundle = z.object({
    generatedAt: z.string(),
    overview: SystemOverview,
    counts: z.object({
        projects: z.number(),
        workflows: z.number(),
        enabledWorkflows: z.number(),
        users: z.number(),
        openIssues: z.number(),
    }),
    excluded: z.array(z.string()),
})

export const SetupCheck = z.object({
    kind: z.enum(SetupCheckKind),
    level: z.enum(SetupCheckLevel),
    detail: z.string().nullable(),
})

export const SetupStatus = z.object({
    initialized: z.boolean(),
    version: z.string().nullable(),
    checks: z.array(SetupCheck),
    services: z.array(OptionalServiceStatus),
})

export const SetupChecklist = z.object({
    membersInvited: z.boolean(),
    loginMethodsConfigured: z.boolean(),
    alertChannelsConfigured: z.boolean(),
    smtpEnabled: z.boolean(),
    encryptionKeyFromFile: z.boolean(),
})

export type SetupCheck = z.infer<typeof SetupCheck>
export type SetupStatus = z.infer<typeof SetupStatus>
export type SetupChecklist = z.infer<typeof SetupChecklist>
export type OptionalServiceStatus = z.infer<typeof OptionalServiceStatus>
export type SystemOverview = z.infer<typeof SystemOverview>
export type DiagnosticsBundle = z.infer<typeof DiagnosticsBundle>
