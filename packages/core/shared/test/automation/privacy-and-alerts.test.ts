import {
    BuiltinMaskDetector,
    MASKED_PLACEHOLDER,
    MaskRuleType,
    NotificationChannelType,
    PayloadLevel,
    privacyMasking,
    RawViewRole,
    UpdatePrivacySettingsRequestBody,
    UpsertNotificationChannelRequestBody,
} from '../../src'

describe('privacyMasking.maskDeep', () => {
    it('masks builtin detectors by value and by key', () => {
        const result = privacyMasking.maskDeep({
            value: { name: '王磊', mobile: '13812345678', idCard: '110101199001011234', nested: [{ bankCardNo: '6222021234567890123' }], token: 'abc' },
            rules: privacyMasking.defaultMaskRules(),
            maskAll: false,
        })
        expect(result.value).toEqual({
            name: '王磊',
            mobile: '138****5678',
            idCard: '110***********1234',
            nested: [{ bankCardNo: '***************0123' }],
            token: MASKED_PLACEHOLDER,
        })
        expect(result.maskedCount).toBe(4)
    })

    it('leaves emails alone while the email rule is off by default', () => {
        const result = privacyMasking.maskDeep({ value: { email: 'a@b.cn' }, rules: privacyMasking.defaultMaskRules(), maskAll: false })
        expect(result.value).toEqual({ email: 'a@b.cn' })
    })

    it('masks every value under a field rule match', () => {
        const rules = [{ id: 'salary', name: '薪资', type: MaskRuleType.FIELD, detector: null, pattern: '^salary', enabled: true }]
        const result = privacyMasking.maskDeep({ value: { salary: { base: 1000, bonus: 200 }, level: 'P6' }, rules, maskAll: false })
        expect(result.value).toEqual({ salary: { base: MASKED_PLACEHOLDER, bonus: MASKED_PLACEHOLDER }, level: 'P6' })
        expect(result.maskedCount).toBe(2)
    })

    it('masks everything when asked to', () => {
        const result = privacyMasking.maskDeep({ value: { a: 1, b: [true, 'x'] }, rules: [], maskAll: true })
        expect(result.value).toEqual({ a: MASKED_PLACEHOLDER, b: [true, MASKED_PLACEHOLDER] })
    })
})

describe('UpdatePrivacySettingsRequestBody', () => {
    const base = {
        logRetentionDays: 30,
        payloadLevel: PayloadLevel.FULL,
        rawPayloadRetentionDays: 3,
        maskRules: [],
        rawViewRoles: [RawViewRole.OWNER],
        requireRawViewReason: true,
    }

    it('accepts a valid body', () => {
        expect(UpdatePrivacySettingsRequestBody.safeParse(base).success).toBe(true)
    })

    it('rejects field patterns that match everything or do not compile', () => {
        const rule = { id: 'r', name: '全部', type: MaskRuleType.FIELD, detector: null, enabled: true }
        expect(UpdatePrivacySettingsRequestBody.safeParse({ ...base, maskRules: [{ ...rule, pattern: '.*' }] }).success).toBe(false)
        expect(UpdatePrivacySettingsRequestBody.safeParse({ ...base, maskRules: [{ ...rule, pattern: '(salary' }] }).success).toBe(false)
        expect(UpdatePrivacySettingsRequestBody.safeParse({ ...base, maskRules: [{ ...rule, pattern: '^salary$' }] }).success).toBe(true)
    })

    it('rejects unsupported retention values', () => {
        expect(UpdatePrivacySettingsRequestBody.safeParse({ ...base, logRetentionDays: 45 }).success).toBe(false)
    })

    it('keeps builtin detectors addressable', () => {
        expect(privacyMasking.defaultMaskRules().map((rule) => rule.detector)).toContain(BuiltinMaskDetector.SECRET)
    })
})

describe('UpsertNotificationChannelRequestBody', () => {
    it('validates robot webhook urls per type', () => {
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '运维群', type: NotificationChannelType.FEISHU, url: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc' }).success).toBe(true)
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '运维群', type: NotificationChannelType.FEISHU, url: 'https://example.com/hook' }).success).toBe(false)
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '财务群', type: NotificationChannelType.WECOM, url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xyz' }).success).toBe(true)
    })

    it('requires dingtalk secrets to start with SEC', () => {
        const url = 'https://oapi.dingtalk.com/robot/send?access_token=0123456789abcdef'
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '销售群', type: NotificationChannelType.DINGTALK, url, secret: 'SEC123' }).success).toBe(true)
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '销售群', type: NotificationChannelType.DINGTALK, url, secret: 'abc' }).success).toBe(false)
    })

    it('validates email recipients', () => {
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '邮件组', type: NotificationChannelType.EMAIL, recipients: ['ops@corp.cn'] }).success).toBe(true)
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '邮件组', type: NotificationChannelType.EMAIL, recipients: [] }).success).toBe(false)
        expect(UpsertNotificationChannelRequestBody.safeParse({ name: '邮件组', type: NotificationChannelType.EMAIL, recipients: ['not-an-email'] }).success).toBe(false)
    })
})
