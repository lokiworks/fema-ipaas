import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { DefaultProjectRole } from '@fema-ipaas/shared'

export const projectMemberRules = {
    isOwnerDemotion({ ownerId, userId, nextRole }: RoleChangeParams): boolean {
        return userId === ownerId && nextRole !== DefaultProjectRole.ADMIN
    },
    assertRoleChangeAllowed(params: RoleChangeParams): void {
        if (projectMemberRules.isOwnerDemotion(params)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'The project needs at least one owner.', messageKey: 'The project needs at least one owner.' },
            })
        }
    },
}

type RoleChangeParams = {
    ownerId: string
    userId: string
    nextRole: DefaultProjectRole
}
