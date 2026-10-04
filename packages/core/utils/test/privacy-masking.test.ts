import { describe, expect, it } from 'vitest'
import { MASKED_PLACEHOLDER, MaskRuleType, privacyMasking } from '../src/lib/privacy-masking'

const rules = privacyMasking.defaultMaskRules()

function mask(value: unknown) {
    return privacyMasking.maskDeep({ value, rules, maskAll: false })
}

describe('privacyMasking defaults', () => {
    it('turns every built-in detector on, including email', () => {
        expect(rules.map((rule) => [rule.detector, rule.enabled])).toEqual([
            ['PHONE', true],
            ['ID_CARD', true],
            ['BANK_CARD', true],
            ['EMAIL', true],
            ['SECRET', true],
        ])
    })
})

describe('privacyMasking.maskDeep', () => {
    it('masks each built-in kind by value', () => {
        expect(mask({ a: '13800138000', b: '110101199003071234', c: '6222021234567890123', d: 'li.si@corp.com' }).value).toEqual({
            a: '138****8000',
            b: '110***********1234',
            c: '***************0123',
            d: 'l***@corp.com',
        })
    })

    it('masks nested objects and arrays', () => {
        const result = mask({ family: { spouse: { contactMobile: '13800138016', IDCARD: '11010119900307123X' } }, list: [{ phone: '13800138012' }, ['13800138013']] })
        expect(result.value).toEqual({
            family: { spouse: { contactMobile: '138****8016', IDCARD: '110***********123X' } },
            list: [{ phone: '138****8012' }, ['138****8013']],
        })
    })

    it('masks numbers broken by spaces, dashes, a country code or lower case', () => {
        const text = '手机 138 0013 8001，138-0013-8002，+8613800138003，+86 138 0013 8004，身份证 11010119900307123x，卡 6222 0212 3456 7890 123'
        const masked = mask({ note: text })
        const serialized = JSON.stringify(masked.value)
        const digitsOnly = serialized.replace(/[\s-]/g, '')
        ;['13800138001', '13800138002', '13800138003', '13800138004', '11010119900307123x', '6222021234567890123'].forEach((secret) => {
            expect(digitsOnly.toLowerCase()).not.toContain(secret.toLowerCase())
        })
        expect(masked.maskedCount).toBe(6)
    })

    it('masks secrets embedded in text and in JSON strings', () => {
        const raw = JSON.stringify({ employee: { mobile: '13912345678', apiToken: 'sk-live-abcdef123456' }, tip: 'Authorization: Bearer abcdefghijklmnop' })
        const result = mask({ rawBody: raw, error: 'call failed, password=hunter2 and key sk-test-123456789' })
        const serialized = JSON.stringify(result.value)
        ;['13912345678', 'sk-live-abcdef123456', 'abcdefghijklmnop', 'hunter2', 'sk-test-123456789'].forEach((secret) => {
            expect(serialized).not.toContain(secret)
        })
    })

    it('keeps ordinary numbers and text', () => {
        const value = { count: 42, id: 'wf_12345678901', when: '2026-10-04 08:05:24', list: '10 20 30 40 50 60 70 80', ts: 1791101124000 }
        expect(mask(value)).toEqual({ value, maskedCount: 0 })
    })

    it('masks the whole value when the field name matches a field rule', () => {
        const result = privacyMasking.maskDeep({
            value: { salary: { base: 32000 }, name: 'x' },
            rules: [...rules, { id: 'f', name: 'salary', type: MaskRuleType.FIELD, detector: null, pattern: 'salary', enabled: true }],
            maskAll: false,
        })
        expect(result.value).toEqual({ salary: { base: MASKED_PLACEHOLDER }, name: 'x' })
    })

    it('masks everything when asked to mask all', () => {
        expect(privacyMasking.maskDeep({ value: { a: 'x', b: [1, { c: 'y' }] }, rules, maskAll: true }).value).toEqual({ a: MASKED_PLACEHOLDER, b: [MASKED_PLACEHOLDER, { c: MASKED_PLACEHOLDER }] })
    })
})

describe('privacyMasking.maskText', () => {
    it('masks values inside free text and JSON error messages', () => {
        expect(privacyMasking.maskText({ text: 'user 13812345678 not found', rules }).value).toBe('user 138****5678 not found')
        const json = JSON.stringify({ __apErrorVersion: 1, message: 'Bad mobile 13812345678 for a***@corp.com' })
        expect(privacyMasking.maskText({ text: json, rules }).value).not.toContain('13812345678')
    })
})
