import { describe, expect, it } from 'vitest'
import { verificationRules } from '../../src/app/verification/verification-rules'

const FEISHU = '@fema-ipaas/connector-feishu'

describe('verificationRules.ruleFor', () => {
    it('knows the four Feishu write actions and nothing else', () => {
        for (const actionName of ['provision_user', 'update_user', 'suspend_user', 'resume_user']) {
            expect(verificationRules.ruleFor({ connectorName: FEISHU, actionName })).not.toBeNull()
        }
        expect(verificationRules.ruleFor({ connectorName: FEISHU, actionName: 'send_group_message' })).toBeNull()
        expect(verificationRules.ruleFor({ connectorName: '@fema-ipaas/connector-http', actionName: 'provision_user' })).toBeNull()
    })
})

describe('provision_user rule', () => {
    const rule = verificationRules.ruleFor({ connectorName: FEISHU, actionName: 'provision_user' })

    it('reads back the account that the output names, in the department format that was written', () => {
        expect(rule?.readInput({ input: { departmentId: 'od-rd' }, output: { open_id: 'ou_1' } })).toEqual({ openId: 'ou_1', departmentId: 'od-rd' })
    })

    it('cannot read back without an open id or a department', () => {
        expect(rule?.readInput({ input: { departmentId: 'od-rd' }, output: {} })).toBeNull()
        expect(rule?.readInput({ input: {}, output: { open_id: 'ou_1' } })).toBeNull()
    })

    it('accepts an account that is in the department and flags one that is not', () => {
        expect(rule?.judge({ input: { departmentId: 'od-rd' }, output: {}, actual: { department_ids: ['od-rd'] } })?.ok).toBe(true)
        const mismatch = rule?.judge({ input: { departmentId: 'od-rd' }, output: {}, actual: { department_ids: ['od-hr'] } })
        expect(mismatch?.ok).toBe(false)
        expect(mismatch?.detail).toContain('od-rd')
        expect(mismatch?.detail).toContain('od-hr')
    })
})

describe('update_user rule', () => {
    const rule = verificationRules.ruleFor({ connectorName: FEISHU, actionName: 'update_user' })

    it('reads the account from the input and skips updates that did not touch the department', () => {
        expect(rule?.readInput({ input: { openId: 'ou_1', departmentId: 'od-hr' }, output: {} })).toEqual({ openId: 'ou_1', departmentId: 'od-hr' })
        expect(rule?.readInput({ input: { openId: 'ou_1', jobTitle: 'Lead' }, output: {} })).toBeNull()
    })
})

describe('suspension rules', () => {
    const suspend = verificationRules.ruleFor({ connectorName: FEISHU, actionName: 'suspend_user' })
    const resume = verificationRules.ruleFor({ connectorName: FEISHU, actionName: 'resume_user' })

    it('expects a suspended account after suspend and an active one after resume', () => {
        expect(suspend?.judge({ input: {}, output: {}, actual: { is_frozen: true } })?.ok).toBe(true)
        expect(suspend?.judge({ input: {}, output: {}, actual: { is_frozen: false } })?.ok).toBe(false)
        expect(resume?.judge({ input: {}, output: {}, actual: { is_frozen: false } })?.ok).toBe(true)
        expect(resume?.judge({ input: {}, output: {}, actual: { is_frozen: true } })?.ok).toBe(false)
    })

    it('treats a missing answer as not suspended', () => {
        expect(suspend?.judge({ input: {}, output: {}, actual: null })?.ok).toBe(false)
    })
})

describe('an account that was deleted after the run', () => {
    it.each(['provision_user', 'update_user', 'suspend_user', 'resume_user'])('counts as a difference for %s', (actionName) => {
        const rule = verificationRules.ruleFor({ connectorName: FEISHU, actionName })
        const judgement = rule?.judge({ input: { departmentId: 'od-rd' }, output: {}, actual: { department_ids: ['od-rd'], is_frozen: actionName === 'suspend_user', is_resigned: true } })
        expect(judgement?.ok).toBe(false)
        expect(judgement?.detail).toContain('no longer exists')
    })

    it('does not mistake an account that is still employed for a deleted one', () => {
        const rule = verificationRules.ruleFor({ connectorName: FEISHU, actionName: 'resume_user' })
        expect(rule?.judge({ input: {}, output: {}, actual: { is_frozen: false, is_resigned: false } })?.ok).toBe(true)
    })
})
