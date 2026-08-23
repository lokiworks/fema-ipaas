import { Metadata, Nullable, OptionalArrayFromQuery, SAFE_STRING_PATTERN } from '@fema/core-utils'
import { z } from 'zod'
import { WorkspaceIcon, WorkspaceType } from './workspace'

export const UpdateWorkspacePlatformRequest = z.object({
    releasesEnabled: z.boolean().optional(),
    notifyWorkflowOwnerOnFailure: z.boolean().optional(),
    displayName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)).optional(),
    externalId: z.string().optional(),
    metadata: z.optional(Metadata),
    icon: WorkspaceIcon.optional(),
    maxConcurrentJobs: z.optional(Nullable(z.number().int().positive())),
    workerGroupId: z.optional(Nullable(z.string())),
    executionDataRetentionDays: z.optional(Nullable(z.number().int().positive())),
})

export type UpdateWorkspacePlatformRequest = z.infer<typeof UpdateWorkspacePlatformRequest>

export const CreatePlatformWorkspaceRequest = z.object({
    displayName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    externalId: Nullable(z.string()),
    metadata: Nullable(Metadata),
    maxConcurrentJobs: Nullable(z.number()),
})

export type CreatePlatformWorkspaceRequest = z.infer<typeof CreatePlatformWorkspaceRequest>

export const ListWorkspaceRequestForPlatformQueryParams = z.object({
    externalId: z.string().optional(),
    externalUserId: z.string().optional(),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    displayName: z.string().optional(),
    types: OptionalArrayFromQuery(z.nativeEnum(WorkspaceType)),
})

export type ListWorkspaceRequestForPlatformQueryParams = z.infer<typeof ListWorkspaceRequestForPlatformQueryParams>
