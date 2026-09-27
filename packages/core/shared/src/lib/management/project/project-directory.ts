import { Nullable, SAFE_STRING_PATTERN } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { ProjectIcon } from './project'
import { DefaultProjectRole } from './project-member'

export const ProjectDirectoryItem = z.object({
    id: z.string(),
    displayName: z.string(),
    description: Nullable(z.string()),
    icon: ProjectIcon,
    ownerId: z.string(),
    ownerName: Nullable(z.string()),
    created: z.string(),
    updated: z.string(),
    myRole: Nullable(z.enum(DefaultProjectRole)),
    workflowCount: z.number(),
    runningCount: z.number(),
    memberCount: z.number(),
    workflowsLimit: Nullable(z.number()),
    monthlyRunsLimit: Nullable(z.number()),
    releasesEnabled: z.boolean(),
})
export type ProjectDirectoryItem = z.infer<typeof ProjectDirectoryItem>

export const SaveProjectInfoRequestBody = z.object({
    displayName: z.string().trim().min(1, 'formErrors.required').max(100, 'projectNameTooLong').regex(new RegExp(SAFE_STRING_PATTERN), 'projectNameInvalidCharacters'),
    description: z.string().trim().max(300, 'projectDescriptionTooLong').optional(),
    icon: ProjectIcon,
})
export type SaveProjectInfoRequestBody = z.infer<typeof SaveProjectInfoRequestBody>

export const ProjectResourceCounts = z.object({
    workflows: z.number(),
    folders: z.number(),
    variables: z.number(),
    mappingTables: z.number(),
    dataStores: z.number(),
    members: z.number(),
})
export type ProjectResourceCounts = z.infer<typeof ProjectResourceCounts>

export const CopyProjectResponse = z.object({
    projectId: z.string(),
    displayName: z.string(),
    copied: ProjectResourceCounts.omit({ members: true }),
    clearedConnections: z.number(),
})
export type CopyProjectResponse = z.infer<typeof CopyProjectResponse>

export const CopyProjectRequestBody = z.object({
    displayName: z.string().trim().min(1, 'formErrors.required').max(100, 'projectNameTooLong').regex(new RegExp(SAFE_STRING_PATTERN), 'projectNameInvalidCharacters'),
})
export type CopyProjectRequestBody = z.infer<typeof CopyProjectRequestBody>

export const PROJECT_NAME_MAX_LENGTH = 100
export const PROJECT_DESCRIPTION_MAX_LENGTH = 300
