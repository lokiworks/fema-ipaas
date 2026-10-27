import { DefaultProjectRole } from '@fema-ipaas/shared'
import { personName } from '../helper/person-name'

export const projectDirectoryUtils = {
    resolveRole({ userId, ownerId, isTenantAdmin, membershipRole }: ResolveRoleParams): DefaultProjectRole | null {
        if (ownerId === userId || isTenantAdmin) {
            return DefaultProjectRole.ADMIN
        }
        return membershipRole
    },
    memberCount({ ownerId, memberUserIds }: { ownerId: string, memberUserIds: string[] }): number {
        return new Set([ownerId, ...memberUserIds]).size
    },
    displayName({ firstName, lastName, email }: { firstName: string | null, lastName: string | null, email: string | null }): string {
        const full = personName.format({ firstName, lastName })
        return full.length > 0 ? full : email ?? ''
    },
}

type ResolveRoleParams = {
    userId: string
    ownerId: string
    isTenantAdmin: boolean
    membershipRole: DefaultProjectRole | null
}
