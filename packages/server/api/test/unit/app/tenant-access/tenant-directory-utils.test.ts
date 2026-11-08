import { DirectoryMemberState, DirectorySkipReason, ExternalIdentityStatus, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { tenantDirectoryUtils } from '../../../../src/app/tenant-access/tenant-directory.utils'

const activeEntry = { subject: 'm1', name: '李雷', username: 'lilei', status: 'ACTIVE', inGoodStanding: true }
const suspendedEntry = { ...activeEntry, status: 'SUSPENDED', inGoodStanding: false }

describe('tenant directory utils', () => {
    describe('the state of a directory member', () => {
        it('is available when nobody added them yet and they are in good standing', () => {
            expect(tenantDirectoryUtils.stateOf({ entry: activeEntry, binding: null, user: null })).toBe(DirectoryMemberState.AVAILABLE)
        })

        it('is unavailable when they are suspended or removed in the directory', () => {
            expect(tenantDirectoryUtils.stateOf({ entry: suspendedEntry, binding: null, user: null })).toBe(DirectoryMemberState.UNAVAILABLE)
        })

        it('is added while the pick waits for the first sign-in', () => {
            const binding = { userId: null, status: ExternalIdentityStatus.ACTIVE, prebindRole: TenantRole.OPERATOR }
            const member = tenantDirectoryUtils.toDirectoryMember({ entry: activeEntry, binding, user: null })
            expect(member.state).toBe(DirectoryMemberState.ADDED)
            expect(member.tenantRole).toBe(TenantRole.OPERATOR)
        })

        it('is a member once the account exists and is active, with the role of the account', () => {
            const binding = { userId: 'u1', status: ExternalIdentityStatus.ACTIVE, prebindRole: null }
            const member = tenantDirectoryUtils.toDirectoryMember({ entry: activeEntry, binding, user: { status: UserStatus.ACTIVE, tenantRole: TenantRole.ADMIN } })
            expect(member.state).toBe(DirectoryMemberState.MEMBER)
            expect(member.tenantRole).toBe(TenantRole.ADMIN)
        })

        it('is disabled when the account or the binding was turned off', () => {
            const revoked = { userId: 'u1', status: ExternalIdentityStatus.REVOKED, prebindRole: null }
            const bound = { userId: 'u1', status: ExternalIdentityStatus.ACTIVE, prebindRole: null }
            expect(tenantDirectoryUtils.stateOf({ entry: activeEntry, binding: revoked, user: { status: UserStatus.ACTIVE, tenantRole: TenantRole.MEMBER } })).toBe(DirectoryMemberState.DISABLED)
            expect(tenantDirectoryUtils.stateOf({ entry: activeEntry, binding: bound, user: { status: UserStatus.INACTIVE, tenantRole: TenantRole.MEMBER } })).toBe(DirectoryMemberState.DISABLED)
        })

        it('can be picked again when a pick was revoked before the first sign-in', () => {
            const binding = { userId: null, status: ExternalIdentityStatus.REVOKED, prebindRole: TenantRole.MEMBER }
            const member = tenantDirectoryUtils.toDirectoryMember({ entry: activeEntry, binding, user: null })
            expect(member.state).toBe(DirectoryMemberState.AVAILABLE)
            expect(member.tenantRole).toBeNull()
        })
    })

    describe('why a pick is skipped', () => {
        it('skips a subject the directory does not know', () => {
            expect(tenantDirectoryUtils.skipReasonOf({ entry: null, binding: null })).toBe(DirectorySkipReason.NOT_IN_DIRECTORY)
        })

        it('skips someone who is already added or already has an account, so adding twice changes nothing', () => {
            expect(tenantDirectoryUtils.skipReasonOf({ entry: activeEntry, binding: { userId: null, status: ExternalIdentityStatus.ACTIVE, prebindRole: TenantRole.MEMBER } })).toBe(DirectorySkipReason.ALREADY_MEMBER)
            expect(tenantDirectoryUtils.skipReasonOf({ entry: activeEntry, binding: { userId: 'u1', status: ExternalIdentityStatus.REVOKED, prebindRole: null } })).toBe(DirectorySkipReason.ALREADY_MEMBER)
        })

        it('skips someone who is not in good standing', () => {
            expect(tenantDirectoryUtils.skipReasonOf({ entry: suspendedEntry, binding: null })).toBe(DirectorySkipReason.NOT_IN_GOOD_STANDING)
        })

        it('adds an available member', () => {
            expect(tenantDirectoryUtils.skipReasonOf({ entry: activeEntry, binding: null })).toBeNull()
            expect(tenantDirectoryUtils.skipReasonOf({ entry: activeEntry, binding: { userId: null, status: ExternalIdentityStatus.REVOKED, prebindRole: TenantRole.MEMBER } })).toBeNull()
        })
    })
})
