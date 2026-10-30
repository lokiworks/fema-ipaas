import { BaseModelSchema, DateOrString, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { DefaultProjectRole } from './project-member'

export enum ProjectAccessRequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    WITHDRAWN = 'WITHDRAWN',
}

export const PROJECT_ACCESS_REASON_MAX_LENGTH = 200
export const DEFAULT_PROJECT_ACCESS_ROLE = DefaultProjectRole.VIEWER

export const ProjectAccessRequest = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    projectId: z.string(),
    userId: z.string(),
    reason: Nullable(z.string()),
    status: z.enum(ProjectAccessRequestStatus),
    decidedBy: Nullable(z.string()),
    decidedAt: Nullable(DateOrString),
    grantedRole: Nullable(z.enum(DefaultProjectRole)),
})
export type ProjectAccessRequest = z.infer<typeof ProjectAccessRequest>

export const ProjectAccessRequestWithUser = ProjectAccessRequest.extend({
    userEmail: Nullable(z.string()),
    userFirstName: Nullable(z.string()),
    userLastName: Nullable(z.string()),
})
export type ProjectAccessRequestWithUser = z.infer<typeof ProjectAccessRequestWithUser>

export const ProjectAccessRequestToReview = ProjectAccessRequestWithUser.extend({
    projectDisplayName: z.string(),
})
export type ProjectAccessRequestToReview = z.infer<typeof ProjectAccessRequestToReview>

export const CreateProjectAccessRequestBody = z.object({
    projectId: z.string(),
    reason: z.string().trim().max(PROJECT_ACCESS_REASON_MAX_LENGTH, 'projectAccessReasonTooLong').optional(),
})
export type CreateProjectAccessRequestBody = z.infer<typeof CreateProjectAccessRequestBody>

export const ListProjectAccessRequestsQuery = z.object({
    projectId: z.string(),
})
export type ListProjectAccessRequestsQuery = z.infer<typeof ListProjectAccessRequestsQuery>

export const ApproveProjectAccessRequestBody = z.object({
    role: z.enum(DefaultProjectRole).optional(),
})
export type ApproveProjectAccessRequestBody = z.infer<typeof ApproveProjectAccessRequestBody>
