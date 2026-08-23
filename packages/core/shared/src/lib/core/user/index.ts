import { z } from 'zod'
import { TenantRole, UserStatus } from './user'

export * from './user'

export const UpdateUserRequestBody = z.object({
    status: z.nativeEnum(UserStatus).optional(),
    tenantRole: z.nativeEnum(TenantRole).optional(),
    externalId: z.string().optional(),
})

export type UpdateUserRequestBody = z.infer<typeof UpdateUserRequestBody>


export const ListUsersRequestBody = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    externalId: z.string().optional(),
})

export type ListUsersRequestBody = z.infer<typeof ListUsersRequestBody>
