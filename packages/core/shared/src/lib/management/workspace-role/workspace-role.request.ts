import { RoleType, SAFE_STRING_PATTERN } from '@fema/core-utils'
import { z } from 'zod'

export const CreateWorkspaceRoleRequestBody = z.object({
    name: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    permissions: z.array(z.string()),
    type: z.nativeEnum(RoleType),
})

export type CreateWorkspaceRoleRequestBody = z.infer<typeof CreateWorkspaceRoleRequestBody>

export const UpdateWorkspaceRoleRequestBody = z.object({
    name: z.string().regex(new RegExp(SAFE_STRING_PATTERN)).optional(),
    permissions: z.array(z.string()).optional(),
})

export type UpdateWorkspaceRoleRequestBody = z.infer<typeof UpdateWorkspaceRoleRequestBody>

export const ListWorkspaceMembersForWorkspaceRoleRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
})

export type ListWorkspaceMembersForWorkspaceRoleRequestQuery = z.infer<typeof ListWorkspaceMembersForWorkspaceRoleRequestQuery>
