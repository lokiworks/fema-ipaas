import { BaseModelSchema, Nullable, NullableEnum, WorkspaceRole } from '@fema/core-utils'
import { z } from 'zod'
import { PlatformRole } from '../../core/user/index'

export enum InvitationType {
    PLATFORM = 'PLATFORM',
    WORKSPACE = 'WORKSPACE',
}

export enum InvitationStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
}

export const UserInvitation = z.object({
    ...BaseModelSchema,
    email: z.string(),
    status: z.nativeEnum(InvitationStatus),
    type: z.nativeEnum(InvitationType),
    platformId: z.string(),
    platformRole: NullableEnum(PlatformRole),
    workspaceId: Nullable(z.string()),
    workspaceRoleId: Nullable(z.string()),
    workspaceRole: Nullable(WorkspaceRole),
})

export type UserInvitation = z.infer<typeof UserInvitation>

export const UserInvitationWithLink = UserInvitation.extend({
    link: z.string().optional(),
})

export type UserInvitationWithLink = z.infer<typeof UserInvitationWithLink>

export const SendUserInvitationRequest = z.union([
    z.object({
        type: z.literal(InvitationType.WORKSPACE),
        email: z.string(),
        workspaceId: z.string(),
        workspaceRole: z.string(),
    }),
    z.object({
        type: z.literal(InvitationType.PLATFORM),
        email: z.string(),
        platformRole: z.nativeEnum(PlatformRole),
    }),
])


export type SendUserInvitationRequest = z.infer<typeof SendUserInvitationRequest>

export const AcceptUserInvitationRequest = z.object({
    invitationToken: z.string(),
})

export type AcceptUserInvitationRequest = z.infer<typeof AcceptUserInvitationRequest>

export const ListUserInvitationsRequest = z.object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    type: z.nativeEnum(InvitationType),
    workspaceId: Nullable(z.string()),
    status: z.nativeEnum(InvitationStatus).optional(),
})

export type ListUserInvitationsRequest = z.infer<typeof ListUserInvitationsRequest>
