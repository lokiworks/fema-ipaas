import { z } from 'zod'

export enum InstanceLimitKey {
    CONCURRENT_RUNS = 'CONCURRENT_RUNS',
    RUNS_PER_MONTH = 'RUNS_PER_MONTH',
    PROJECT_WORKFLOWS = 'PROJECT_WORKFLOWS',
    NODES_PER_RUN = 'NODES_PER_RUN',
    RUN_TIMEOUT = 'RUN_TIMEOUT',
    STEP_TIMEOUT = 'STEP_TIMEOUT',
    STEP_PAYLOAD = 'STEP_PAYLOAD',
    LOG_RETENTION = 'LOG_RETENTION',
}

export enum InstanceLimitUnit {
    COUNT = 'COUNT',
    SECONDS = 'SECONDS',
    MEGABYTES = 'MEGABYTES',
    DAYS = 'DAYS',
}

export enum InstanceLimitSource {
    ENV = 'ENV',
    LEGACY_ENV = 'LEGACY_ENV',
    DEFAULT = 'DEFAULT',
    INHERITED = 'INHERITED',
}

export const InstanceLimit = z.object({
    key: z.enum(InstanceLimitKey),
    value: z.number().nullable(),
    unit: z.enum(InstanceLimitUnit),
    envVar: z.string(),
    legacyEnvVar: z.string().nullable(),
    inheritedFromEnvVar: z.string().nullable(),
    source: z.enum(InstanceLimitSource),
    usage: z.number().nullable(),
})
export type InstanceLimit = z.infer<typeof InstanceLimit>

export const InstanceLimitsResponse = z.object({
    limits: z.array(InstanceLimit),
    monthStart: z.string(),
    monthEnd: z.string(),
    runsThisMonth: z.number(),
})
export type InstanceLimitsResponse = z.infer<typeof InstanceLimitsResponse>

export const LimitUsage = z.object({
    used: z.number(),
    limit: z.number().nullable(),
    override: z.number().nullable(),
})
export type LimitUsage = z.infer<typeof LimitUsage>

export const ProjectLimitsUsage = z.object({
    projectId: z.string(),
    workflows: LimitUsage,
    monthlyRuns: LimitUsage,
    monthStart: z.string(),
})
export type ProjectLimitsUsage = z.infer<typeof ProjectLimitsUsage>

export const ProjectLimitsRow = ProjectLimitsUsage.extend({
    displayName: z.string(),
    ownerName: z.string().nullable(),
    memberCount: z.number(),
    succeededThisMonth: z.number(),
    failedThisMonth: z.number(),
})
export type ProjectLimitsRow = z.infer<typeof ProjectLimitsRow>

export const ProjectLimitsListResponse = z.object({
    data: z.array(ProjectLimitsRow),
    workflowsCeiling: z.number(),
    monthlyRunsCeiling: z.number(),
    monthStart: z.string(),
    runsInDeletedProjects: z.number(),
})
export type ProjectLimitsListResponse = z.infer<typeof ProjectLimitsListResponse>

export const UpdateProjectLimitsRequestBody = z.object({
    workflowsLimit: z.number().int('positiveIntegerRequired').min(1, 'positiveIntegerRequired').nullable(),
    monthlyRunsLimit: z.number().int('positiveIntegerRequired').min(1, 'positiveIntegerRequired').nullable(),
})
export type UpdateProjectLimitsRequestBody = z.infer<typeof UpdateProjectLimitsRequestBody>

export const INSTANCE_LIMIT_ENV_VARS: Record<InstanceLimitKey, string> = {
    [InstanceLimitKey.CONCURRENT_RUNS]: 'FEMA_MAX_CONCURRENT_RUNS',
    [InstanceLimitKey.RUNS_PER_MONTH]: 'FEMA_MAX_RUNS_PER_MONTH',
    [InstanceLimitKey.PROJECT_WORKFLOWS]: 'FEMA_PROJECT_MAX_WORKFLOWS',
    [InstanceLimitKey.NODES_PER_RUN]: 'FEMA_MAX_NODES_PER_RUN',
    [InstanceLimitKey.RUN_TIMEOUT]: 'FEMA_RUN_TIMEOUT',
    [InstanceLimitKey.STEP_TIMEOUT]: 'FEMA_STEP_TIMEOUT',
    [InstanceLimitKey.STEP_PAYLOAD]: 'FEMA_MAX_STEP_PAYLOAD',
    [InstanceLimitKey.LOG_RETENTION]: 'FEMA_LOG_RETENTION_DAYS',
}

export const CAPACITY_ALERT_THRESHOLDS: number[] = [50, 70, 80, 90]
export const LIMIT_USAGE_DANGER_RATIO = 0.9
export const LIMIT_USAGE_WARNING_RATIO = 0.7
