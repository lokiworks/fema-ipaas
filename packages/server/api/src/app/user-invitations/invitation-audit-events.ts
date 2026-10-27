import { ApplicationEventName, InvitationEvent, MemberAddedEvent } from '@fema-ipaas/shared'

function memberJoined({ userId, role, email }: MemberJoinedParams): Pick<MemberAddedEvent, 'action' | 'data'> {
    return {
        action: ApplicationEventName.MEMBER_ADDED,
        data: { member: { userId, role, email } },
    }
}

function sent({ email, role }: InvitationParams): Pick<InvitationEvent, 'action' | 'data'> {
    return {
        action: ApplicationEventName.INVITATION_SENT,
        data: { invitation: { email, role } },
    }
}

function revoked({ email, role }: InvitationParams): Pick<InvitationEvent, 'action' | 'data'> {
    return {
        action: ApplicationEventName.INVITATION_REVOKED,
        data: { invitation: { email, role } },
    }
}

export const invitationAuditEvents = { memberJoined, sent, revoked }

type MemberJoinedParams = {
    userId: string
    role: string
    email: string
}

type InvitationParams = {
    email: string
    role: string | undefined
}
