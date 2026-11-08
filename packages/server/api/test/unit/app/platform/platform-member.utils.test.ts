import { ExternalIdentityStatus, InvitationStatus, InvitationType, PlatformMemberStatus, TenantRole } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { MemberNoticeChannel, platformMemberUtils } from '../../../../src/app/platform/platform-member.utils'

function invitation(overrides: { email: string, status?: InvitationStatus, tenantRole?: TenantRole | null }) {
    return {
        id: 'inv-1',
        created: '2026-11-01T00:00:00.000Z',
        updated: '2026-11-01T00:00:00.000Z',
        tenantId: 'tenant-1',
        type: InvitationType.TENANT,
        status: overrides.status ?? InvitationStatus.PENDING,
        email: overrides.email,
        tenantRole: overrides.tenantRole ?? TenantRole.MEMBER,
        projectId: null,
        projectRoleId: null,
        projectRole: null,
    }
}

describe('platform member utils', () => {
    describe('notification channel', () => {
        it('sends an invitation email to a member with an email address when mail is configured', () => {
            expect(platformMemberUtils.channelFor({ subject: undefined, email: 'a@acme.test', smtpConfigured: true })).toBe(MemberNoticeChannel.EMAIL_INVITATION)
        })

        it('creates the account straight away when mail is not configured', () => {
            expect(platformMemberUtils.channelFor({ subject: undefined, email: 'a@acme.test', smtpConfigured: false })).toBe(MemberNoticeChannel.DIRECT_ACCOUNT)
        })

        it('does not message a member who only has a phone number, whatever the mail setup', () => {
            expect(platformMemberUtils.channelFor({ subject: undefined, email: undefined, smtpConfigured: true })).toBe(MemberNoticeChannel.DIRECT_ACCOUNT)
            expect(platformMemberUtils.channelFor({ subject: undefined, email: '', smtpConfigured: true })).toBe(MemberNoticeChannel.DIRECT_ACCOUNT)
        })

        it('never notifies a federated member, even one with an email address', () => {
            expect(platformMemberUtils.channelFor({ subject: 'member-1', email: 'a@acme.test', smtpConfigured: true })).toBe(MemberNoticeChannel.FEDERATED)
        })
    })

    describe('pending invitations', () => {
        it('shows an invitation that was sent as invited and notified', () => {
            const member = platformMemberUtils.fromInvitation({ invitation: invitation({ email: 'a@acme.test', tenantRole: TenantRole.ADMIN }) })

            expect(member).toMatchObject({ userId: null, subject: null, email: 'a@acme.test', role: TenantRole.ADMIN, status: PlatformMemberStatus.INVITED, notified: true })
        })

        it('falls back to the member role when the invitation has none', () => {
            const member = platformMemberUtils.fromInvitation({ invitation: invitation({ email: 'a@acme.test', tenantRole: null }) })

            expect(member.role).toBe(TenantRole.MEMBER)
        })

        it('skips invitations that were accepted or whose address already belongs to a member', () => {
            const kept = platformMemberUtils.pendingInvitations({
                invitations: [
                    invitation({ email: 'new@acme.test' }),
                    invitation({ email: 'done@acme.test', status: InvitationStatus.ACCEPTED }),
                    invitation({ email: 'Member@Acme.test' }),
                ],
                memberEmails: new Set(['member@acme.test']),
            })

            expect(kept.map((entry) => entry.email)).toEqual(['new@acme.test'])
        })
    })

    describe('pending bindings', () => {
        const binding = {
            id: 'b1',
            created: '2026-11-01T00:00:00.000Z',
            updated: '2026-11-01T00:00:00.000Z',
            issuer: 'https://iam.example.com',
            subject: 'member-2',
            tenantId: 'tenant-1',
            identityId: null,
            userId: null,
            prebindRole: TenantRole.MEMBER,
            prebindModules: [],
            status: ExternalIdentityStatus.ACTIVE,
            lastVerifiedAt: null,
            email: 'two@acme.test',
            displayName: 'Two',
        }

        it('marks a prebound federated member as not notified', () => {
            expect(platformMemberUtils.fromPendingBinding(binding)).toMatchObject({ subject: 'member-2', status: PlatformMemberStatus.PENDING_BINDING, notified: false })
        })

        it('shows a revoked binding as inactive', () => {
            expect(platformMemberUtils.fromPendingBinding({ ...binding, status: ExternalIdentityStatus.REVOKED }).status).toBe(PlatformMemberStatus.INACTIVE)
        })
    })
})
