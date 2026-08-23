import { z } from 'zod'
import { User } from '../../user/user'
import { UserIdentity } from '../user-identity'


export const UserWithoutPassword = User.pick({ id: true, tenantRole: true, status: true, externalId: true, tenantId: true })
export type UserWithoutPassword = z.infer<typeof UserWithoutPassword>

export const AuthenticationResponse = UserWithoutPassword.merge(
    UserIdentity.pick({ verified: true, firstName: true, lastName: true, email: true, trackEvents: true, newsLetter: true }),
).merge(
    z.object({
        token: z.string(),
        workspaceId: z.string().nullable(),
    }),
)
export type AuthenticationResponse = z.infer<typeof AuthenticationResponse>
