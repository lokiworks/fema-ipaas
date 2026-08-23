import { ApId, BaseModelSchema, DateOrString, Metadata, Nullable } from '@fema/core-utils'
import { z } from 'zod'

export enum ColorName {
    RED = 'RED',
    BLUE = 'BLUE',
    YELLOW = 'YELLOW',
    PURPLE = 'PURPLE',
    GREEN = 'GREEN',
    PINK = 'PINK',
    VIOLET = 'VIOLET',
    ORANGE = 'ORANGE',
    DARK_GREEN = 'DARK_GREEN',
    CYAN = 'CYAN',
    LAVENDER = 'LAVENDER',
    DEEP_ORANGE = 'DEEP_ORANGE',
}

export enum ConnectorsFilterType {
    NONE = 'NONE',
    ALLOWED = 'ALLOWED',
}

export enum WorkspaceType {
    TEAM = 'TEAM',
    PERSONAL = 'PERSONAL',
}



export const WorkspaceIcon = z.object({
    color: z.nativeEnum(ColorName),
})
export type WorkspaceIcon = z.infer<typeof WorkspaceIcon>

export const Workspace = z.object({
    ...BaseModelSchema,
    deleted: Nullable(DateOrString),
    ownerId: z.string(),
    displayName: z.string(),
    tenantId: ApId,
    maxConcurrentJobs: Nullable(z.number()),
    type: z.nativeEnum(WorkspaceType),
    icon: WorkspaceIcon,
    externalId: Nullable(z.string()),
    releasesEnabled: z.boolean(),
    notifyWorkflowOwnerOnFailure: z.boolean(),
    metadata: Nullable(Metadata),
    workerGroupId: Nullable(z.string()),
    executionDataRetentionDays: Nullable(z.number()),
})

const workspaceAnalytics = z.object({
    totalWorkflows: z.number(),
    activeWorkflows: z.number(),
})
export type Workspace = z.infer<typeof Workspace>

export const WorkspaceWithLimits = Workspace.omit({ deleted: true }).extend({
    analytics: workspaceAnalytics,
})

export type WorkspaceWithLimits = z.infer<typeof WorkspaceWithLimits>

export const WorkspaceMetaData = z.object({
    id: z.string(),
    displayName: z.string(),
})

export type WorkspaceMetaData = z.infer<typeof WorkspaceMetaData>

export const WorkspaceWithLimitsWithTenant = z.object({
    tenantName: z.string(),
    workspaces: z.array(WorkspaceWithLimits),
})

export type WorkspaceWithLimitsWithTenant = z.infer<typeof WorkspaceWithLimitsWithTenant>


const WorkspaceColor = z.object({
    textColor: z.string(),
    color: z.string(),
})
type WorkspaceColor = z.infer<typeof WorkspaceColor>

export const WORKSPACE_COLOR_PALETTE: Record<ColorName, WorkspaceColor> = {
    [ColorName.RED]: {
        textColor: '#ffffff',
        color: '#ef4444',
    },
    [ColorName.BLUE]: {
        textColor: '#ffffff',
        color: '#3b82f6',
    },
    [ColorName.YELLOW]: {
        textColor: '#ffffff',
        color: '#eab308',
    },
    [ColorName.PURPLE]: {
        textColor: '#ffffff',
        color: '#a855f7',
    },
    [ColorName.GREEN]: {
        textColor: '#ffffff',
        color: '#22c55e',
    },
    [ColorName.PINK]: {
        textColor: '#ffffff',
        color: '#f472b6',
    },
    [ColorName.VIOLET]: {
        textColor: '#ffffff',
        color: '#9333ea',
    },
    [ColorName.ORANGE]: {
        textColor: '#ffffff',
        color: '#f97316',
    },
    [ColorName.DARK_GREEN]: {
        textColor: '#ffffff',
        color: '#15803d',
    },
    [ColorName.CYAN]: {
        textColor: '#ffffff',
        color: '#06b6d4',
    },
    [ColorName.LAVENDER]: {
        textColor: '#ffffff',
        color: '#8b5cf6',
    },
    [ColorName.DEEP_ORANGE]: {
        textColor: '#ffffff',
        color: '#ea580c',
    },
}
