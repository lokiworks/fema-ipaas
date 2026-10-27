import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { DefaultProjectRole } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { projectMemberRules } from '../../../../src/app/project/project-member-rules'

describe('projectMemberRules.assertRoleChangeAllowed', () => {
    it('rejects demoting the project owner', () => {
        for (const nextRole of [DefaultProjectRole.DEVELOPER, DefaultProjectRole.OPERATOR, DefaultProjectRole.VIEWER]) {
            expect(() => projectMemberRules.assertRoleChangeAllowed({ ownerId: 'owner', userId: 'owner', nextRole })).toThrow(ApplicationError)
        }
    })

    it('reports a validation error code', () => {
        try {
            projectMemberRules.assertRoleChangeAllowed({ ownerId: 'owner', userId: 'owner', nextRole: DefaultProjectRole.VIEWER })
            expect.unreachable()
        }
        catch (error) {
            expect(error).toBeInstanceOf(ApplicationError)
            expect(error instanceof ApplicationError && error.error.code).toBe(ErrorCode.VALIDATION)
        }
    })

    it('allows keeping the owner as admin', () => {
        expect(() => projectMemberRules.assertRoleChangeAllowed({ ownerId: 'owner', userId: 'owner', nextRole: DefaultProjectRole.ADMIN })).not.toThrow()
    })

    it('allows changing other members freely', () => {
        expect(() => projectMemberRules.assertRoleChangeAllowed({ ownerId: 'owner', userId: 'other', nextRole: DefaultProjectRole.VIEWER })).not.toThrow()
        expect(() => projectMemberRules.assertRoleChangeAllowed({ ownerId: 'owner', userId: 'other', nextRole: DefaultProjectRole.ADMIN })).not.toThrow()
    })
})
