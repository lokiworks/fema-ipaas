import { ApplicationEvent, ApplicationEventName, DefaultProjectRole } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { invitationAuditEvents } from '../../../src/app/user-invitations/invitation-audit-events'

function asStoredEvent(event: ReturnType<typeof invitationAuditEvents.sent>): unknown {
    return {
        id: 'e1',
        tenantId: 't1',
        projectId: 'p1',
        created: '2026-10-28T08:00:00Z',
        updated: '2026-10-28T08:00:00Z',
        ...event,
    }
}

describe('invitationAuditEvents', () => {
    it('records a joined member with the member audit event, so invite links and direct adds share one action', () => {
        const event = invitationAuditEvents.memberJoined({ userId: 'u1', role: DefaultProjectRole.DEVELOPER, email: 'a@corp.test' })
        expect(event.action).toBe(ApplicationEventName.MEMBER_ADDED)
        expect(event.data).toEqual({ member: { userId: 'u1', role: DefaultProjectRole.DEVELOPER, email: 'a@corp.test' } })
    })

    it('records a sent invitation with the invitee email and the role it grants', () => {
        const event = invitationAuditEvents.sent({ email: 'b@corp.test', role: DefaultProjectRole.VIEWER })
        expect(event.action).toBe(ApplicationEventName.INVITATION_SENT)
        expect(event.data).toEqual({ invitation: { email: 'b@corp.test', role: DefaultProjectRole.VIEWER } })
    })

    it('records a revoked invitation even when the role is unknown', () => {
        const event = invitationAuditEvents.revoked({ email: 'c@corp.test', role: undefined })
        expect(event.action).toBe(ApplicationEventName.INVITATION_REVOKED)
        expect(event.data.invitation.email).toBe('c@corp.test')
    })

    it('produces payloads the shared audit event schema accepts', () => {
        const events = [
            invitationAuditEvents.sent({ email: 'b@corp.test', role: DefaultProjectRole.VIEWER }),
            invitationAuditEvents.revoked({ email: 'c@corp.test', role: undefined }),
        ]
        for (const event of events) {
            expect(ApplicationEvent.safeParse(asStoredEvent(event)).success).toBe(true)
        }
    })
})
