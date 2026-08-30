import { Metadata, Nullable, OptionalArrayFromQuery, SAFE_STRING_PATTERN } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { ProjectIcon, ProjectType } from './project'

export const UpdateProjectTenantRequest = z.object({
    releasesEnabled: z.boolean().optional(),
    notifyWorkflowOwnerOnFailure: z.boolean().optional(),
    displayName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)).optional(),
    externalId: z.string().optional(),
    metadata: z.optional(Metadata),
    icon: ProjectIcon.optional(),
    maxConcurrentJobs: z.optional(Nullable(z.number().int().positive())),
    workerGroupId: z.optional(Nullable(z.string())),
    executionDataRetentionDays: z.optional(Nullable(z.number().int().positive())),
})

export type UpdateProjectTenantRequest = z.infer<typeof UpdateProjectTenantRequest>

export const CreateTenantProjectRequest = z.object({
    displayName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    externalId: Nullable(z.string()),
    metadata: Nullable(Metadata),
    maxConcurrentJobs: Nullable(z.number()),
})

export type CreateTenantProjectRequest = z.infer<typeof CreateTenantProjectRequest>

export const ListProjectRequestForTenantQueryParams = z.object({
    externalId: z.string().optional(),
    externalUserId: z.string().optional(),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    displayName: z.string().optional(),
    types: OptionalArrayFromQuery(z.nativeEnum(ProjectType)),
})

export type ListProjectRequestForTenantQueryParams = z.infer<typeof ListProjectRequestForTenantQueryParams>
