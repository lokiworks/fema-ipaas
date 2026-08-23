import { BaseModelSchema } from '@fema-ipaas/core-utils'
import { z } from 'zod'

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

export type WorkspaceMember = z.infer<typeof WorkspaceMember>
