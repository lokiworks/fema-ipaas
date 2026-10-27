import { ApplicationEventName } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { auditEventScope } from '../../../../src/app/helper/audit-event-scope'

describe('auditEventScope.projectIdFor', () => {
    it.each([
        ApplicationEventName.USER_SIGNED_IN,
        ApplicationEventName.USER_SIGNED_UP,
        ApplicationEventName.USER_SIGN_IN_FAILED,
        ApplicationEventName.USER_PASSWORD_RESET,
        ApplicationEventName.USER_EMAIL_VERIFIED,
    ])('records %s at platform level even when a project is known', (action) => {
        expect(auditEventScope.projectIdFor({ action, projectId: 'project-1' })).toBeUndefined()
    })

    it('keeps the project for project events', () => {
        expect(auditEventScope.projectIdFor({ action: ApplicationEventName.WORKFLOW_CREATED, projectId: 'project-1' })).toBe('project-1')
    })

    it('keeps an absent project absent', () => {
        expect(auditEventScope.projectIdFor({ action: ApplicationEventName.WORKFLOW_CREATED, projectId: undefined })).toBeUndefined()
    })
})
