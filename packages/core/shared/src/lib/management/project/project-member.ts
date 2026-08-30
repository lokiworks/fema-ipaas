import { BaseModelSchema } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user/user'

export enum DefaultProjectRole {
    ADMIN = 'Admin',
    DEVELOPER = 'Developer',
    OPERATOR = 'Operator',
    VIEWER = 'Viewer',
}

export const ProjectMember = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    userId: z.string(),
    role: z.enum(DefaultProjectRole),
})

export const ProjectMemberWithUser = ProjectMember.extend({
    user: UserWithMetaInformation,
})

export type ProjectMember = z.infer<typeof ProjectMember>
export type ProjectMemberWithUser = z.infer<typeof ProjectMemberWithUser>
