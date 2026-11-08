import { isNil } from '@fema-ipaas/core-utils'
import { ExternalIdentityStatus, InvitationStatus, PlatformMember, PlatformMemberStatus, TenantRole, UserInvitation } from '@fema-ipaas/shared'
import { ExternalIdentityRecord } from '../federation/external-identity.service'

export enum MemberNoticeChannel {
    EMAIL_INVITATION = 'EMAIL_INVITATION',
    DIRECT_ACCOUNT = 'DIRECT_ACCOUNT',
    FEDERATED = 'FEDERATED',
}

function channelFor({ subject, email, smtpConfigured }: ChannelParams): MemberNoticeChannel {
    if (!isNil(subject)) {
        return MemberNoticeChannel.FEDERATED
    }
    const canInviteByEmail = !isNil(email) && email.length > 0 && smtpConfigured
    return canInviteByEmail ? MemberNoticeChannel.EMAIL_INVITATION : MemberNoticeChannel.DIRECT_ACCOUNT
}

function fromInvitation({ invitation }: { invitation: UserInvitation }): PlatformMember {
    return {
        userId: null,
        subject: null,
        email: invitation.email,
        phone: null,
        name: '',
        role: invitation.tenantRole ?? TenantRole.MEMBER,
        status: PlatformMemberStatus.INVITED,
        notified: true,
    }
}

function pendingInvitations({ invitations, memberEmails }: { invitations: UserInvitation[], memberEmails: Set<string> }): UserInvitation[] {
    return invitations.filter((invitation) => invitation.status === InvitationStatus.PENDING && !memberEmails.has(invitation.email.toLowerCase()))
}

function fromPendingBinding(binding: ExternalIdentityRecord): PlatformMember {
    return {
        userId: null,
        subject: binding.subject,
        email: binding.email,
        phone: null,
        name: binding.displayName ?? '',
        role: binding.prebindRole ?? TenantRole.MEMBER,
        status: binding.status === ExternalIdentityStatus.REVOKED ? PlatformMemberStatus.INACTIVE : PlatformMemberStatus.PENDING_BINDING,
        notified: false,
    }
}

export const platformMemberUtils = {
    channelFor,
    fromInvitation,
    fromPendingBinding,
    pendingInvitations,
}

type ChannelParams = {
    subject: string | undefined
    email: string | undefined
    smtpConfigured: boolean
}
