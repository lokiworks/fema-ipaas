import { BaseModelSchema } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user/user'

export enum DefaultWorkspaceRole {
    ADMIN = 'Admin',
    DEVELOPER = 'Developer',
    OPERATOR = 'Operator',
    VIEWER = 'Viewer',
}

export const WorkspaceMember = z.object({
    ...BaseModelSchema,
    workspaceId: z.string(),
    userId: z.string(),
    role: z.enum(DefaultWorkspaceRole),
})

export const WorkspaceMemberWithUser = WorkspaceMember.extend({
    user: UserWithMetaInformation,
})

export type WorkspaceMember = z.infer<typeof WorkspaceMember>
export type WorkspaceMemberWithUser = z.infer<typeof WorkspaceMemberWithUser>
