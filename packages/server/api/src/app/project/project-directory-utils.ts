import { isNil } from '@fema-ipaas/core-utils'
import { DefaultProjectRole } from '@fema-ipaas/shared'

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
        const full = [firstName, lastName].filter((part) => !isNil(part) && part.trim().length > 0).join(' ').trim()
        return full.length > 0 ? full : email ?? ''
    },
}

type ResolveRoleParams = {
    userId: string
    ownerId: string
    isTenantAdmin: boolean
    membershipRole: DefaultProjectRole | null
}
