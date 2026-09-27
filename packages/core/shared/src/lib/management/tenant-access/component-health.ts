import { z } from 'zod'

export enum HealthComponent {
    DATABASE = 'DATABASE',
    QUEUE = 'QUEUE',
    TRIGGER_SCHEDULING = 'TRIGGER_SCHEDULING',
    WEBHOOK_INTAKE = 'WEBHOOK_INTAKE',
    FILE_STORAGE = 'FILE_STORAGE',
    CONNECTOR_REGISTRY = 'CONNECTOR_REGISTRY',
    SMTP = 'SMTP',
    BACKUP = 'BACKUP',
    VERSION = 'VERSION',
    WORKERS = 'WORKERS',
}

export enum ComponentHealthLevel {
    OK = 'OK',
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    NOT_CONFIGURED = 'NOT_CONFIGURED',
}

export const ComponentHealthFact = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type ComponentHealthFact = z.infer<typeof ComponentHealthFact>

export const ComponentHealthCheck = z.object({
    component: z.enum(HealthComponent),
    level: z.enum(ComponentHealthLevel),
    facts: z.record(z.string(), ComponentHealthFact),
})
export type ComponentHealthCheck = z.infer<typeof ComponentHealthCheck>

export const ComponentHealthReport = z.object({
    checkedAt: z.string(),
    checks: z.array(ComponentHealthCheck),
})
export type ComponentHealthReport = z.infer<typeof ComponentHealthReport>

export const HEALTH_REFRESH_SECONDS = 30
export const BACKUP_STALE_DAYS = 7
