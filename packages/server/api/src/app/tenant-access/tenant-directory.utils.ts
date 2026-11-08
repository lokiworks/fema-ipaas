import { isNil } from '@fema-ipaas/core-utils'
import { DirectoryMemberState, DirectorySkipReason, ExternalIdentityStatus, TenantDirectoryMember, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { DirectoryEntry } from '../federation/member-directory'

function toDirectoryMember({ entry, binding, user }: ToDirectoryMemberParams): TenantDirectoryMember {
    return {
        subject: entry.subject,
        name: entry.name,
        username: entry.username,
        state: stateOf({ entry, binding, user }),
        tenantRole: roleOf({ binding, user }),
    }
}

function stateOf({ entry, binding, user }: ToDirectoryMemberParams): DirectoryMemberState {
    if (!isNil(binding) && !isNil(binding.userId)) {
        const active = binding.status === ExternalIdentityStatus.ACTIVE && user?.status === UserStatus.ACTIVE
        return active ? DirectoryMemberState.MEMBER : DirectoryMemberState.DISABLED
    }
    if (!isNil(binding) && binding.status === ExternalIdentityStatus.ACTIVE) {
        return DirectoryMemberState.ADDED
    }
    return entry.inGoodStanding ? DirectoryMemberState.AVAILABLE : DirectoryMemberState.UNAVAILABLE
}

function skipReasonOf({ entry, binding }: SkipReasonParams): DirectorySkipReason | null {
    if (isNil(entry)) {
        return DirectorySkipReason.NOT_IN_DIRECTORY
    }
    const alreadyAdded = !isNil(binding) && (!isNil(binding.userId) || binding.status === ExternalIdentityStatus.ACTIVE)
    if (alreadyAdded) {
        return DirectorySkipReason.ALREADY_MEMBER
    }
    return entry.inGoodStanding ? null : DirectorySkipReason.NOT_IN_GOOD_STANDING
}

function roleOf({ binding, user }: Pick<ToDirectoryMemberParams, 'binding' | 'user'>): TenantRole | null {
    if (!isNil(user)) {
        return user.tenantRole
    }
    if (!isNil(binding) && isNil(binding.userId) && binding.status === ExternalIdentityStatus.ACTIVE) {
        return binding.prebindRole ?? null
    }
    return null
}

export const tenantDirectoryUtils = {
    toDirectoryMember,
    stateOf,
    skipReasonOf,
}

export type DirectoryBinding = {
    userId?: string | null
    status: ExternalIdentityStatus
    prebindRole?: TenantRole | null
}

export type DirectoryUser = {
    status: UserStatus
    tenantRole: TenantRole
}

type ToDirectoryMemberParams = {
    entry: DirectoryEntry
    binding: DirectoryBinding | null
    user: DirectoryUser | null
}

type SkipReasonParams = {
    entry: DirectoryEntry | null
    binding: DirectoryBinding | null
}
