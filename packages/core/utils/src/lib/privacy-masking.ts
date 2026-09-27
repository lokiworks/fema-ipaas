export enum PayloadLevel {
    FULL = 'FULL',
    METADATA = 'METADATA',
    NONE = 'NONE',
}

export enum MaskRuleType {
    BUILTIN = 'BUILTIN',
    FIELD = 'FIELD',
}

export enum BuiltinMaskDetector {
    PHONE = 'PHONE',
    ID_CARD = 'ID_CARD',
    BANK_CARD = 'BANK_CARD',
    EMAIL = 'EMAIL',
    SECRET = 'SECRET',
}

export const privacyMasking = {
    maskDeep,
    defaultMaskRules,
}

function maskDeep({ value, rules, maskAll }: MaskDeepParams): MaskDeepResult {
    const enabled = rules.filter((rule) => rule.enabled)
    const fieldPatterns = enabled
        .filter((rule) => rule.type === MaskRuleType.FIELD && rule.pattern !== null)
        .map((rule) => compileSafely(rule.pattern ?? ''))
        .filter((regex): regex is RegExp => regex !== null)
    const detectors = enabled
        .filter((rule) => rule.type === MaskRuleType.BUILTIN && rule.detector !== null)
        .map((rule) => DETECTORS[rule.detector ?? BuiltinMaskDetector.SECRET])
    return walk({ node: value, key: '', forced: maskAll, fieldPatterns, detectors })
}

function defaultMaskRules(): MaskRule[] {
    return [
        builtin({ id: 'builtin-phone', name: '手机号', detector: BuiltinMaskDetector.PHONE, enabled: true }),
        builtin({ id: 'builtin-id-card', name: '身份证号', detector: BuiltinMaskDetector.ID_CARD, enabled: true }),
        builtin({ id: 'builtin-bank-card', name: '银行卡号', detector: BuiltinMaskDetector.BANK_CARD, enabled: true }),
        builtin({ id: 'builtin-email', name: '邮箱', detector: BuiltinMaskDetector.EMAIL, enabled: false }),
        builtin({ id: 'builtin-secret', name: '密钥与令牌', detector: BuiltinMaskDetector.SECRET, enabled: true }),
    ]
}

function walk({ node, key, forced, fieldPatterns, detectors }: WalkParams): MaskDeepResult {
    if (Array.isArray(node)) {
        return node.reduce<MaskDeepResult>((acc, item) => {
            const child = walk({ node: item, key, forced, fieldPatterns, detectors })
            return { value: [...asArray(acc.value), child.value], maskedCount: acc.maskedCount + child.maskedCount }
        }, { value: [], maskedCount: 0 })
    }
    if (isPlainObject(node)) {
        return Object.entries(node).reduce<MaskDeepResult>((acc, [childKey, childValue]) => {
            const hard = forced || fieldPatterns.some((regex) => regex.test(childKey))
            const child = walk({ node: childValue, key: childKey, forced: hard, fieldPatterns, detectors })
            return { value: { ...asRecord(acc.value), [childKey]: child.value }, maskedCount: acc.maskedCount + child.maskedCount }
        }, { value: {}, maskedCount: 0 })
    }
    if (node === null || node === undefined || typeof node === 'boolean') {
        return { value: node, maskedCount: 0 }
    }
    if (forced) {
        return { value: MASKED_PLACEHOLDER, maskedCount: 1 }
    }
    const text = String(node)
    const hit = detectors.find((detector) => detector.matches({ key, text, isString: typeof node === 'string' }))
    return hit === undefined ? { value: node, maskedCount: 0 } : { value: hit.mask(text), maskedCount: 1 }
}

function builtin({ id, name, detector, enabled }: { id: string, name: string, detector: BuiltinMaskDetector, enabled: boolean }): MaskRule {
    return { id, name, type: MaskRuleType.BUILTIN, detector, pattern: null, enabled }
}

function keepEnds({ text, head, tail }: { text: string, head: number, tail: number }): string {
    if (text.length <= head + tail) {
        return '****'
    }
    return `${text.slice(0, head)}${'*'.repeat(text.length - head - tail)}${text.slice(-tail)}`
}

function compileSafely(pattern: string): RegExp | null {
    try {
        return new RegExp(pattern, 'i')
    }
    catch {
        return null
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : {}
}


const DETECTORS: Record<BuiltinMaskDetector, Detector> = {
    [BuiltinMaskDetector.PHONE]: {
        matches: ({ key, text }) => /^1\d{10}$/.test(text) || (/(mobile|phone|^tel$|手机|电话)/i.test(key) && text.length > 0),
        mask: (text) => keepEnds({ text, head: 3, tail: 4 }),
    },
    [BuiltinMaskDetector.ID_CARD]: {
        matches: ({ key, text }) => /^\d{17}[\dXx]$/.test(text) || (/(id_?card|身份证)/i.test(key) && text.length > 0),
        mask: (text) => keepEnds({ text, head: 3, tail: 4 }),
    },
    [BuiltinMaskDetector.BANK_CARD]: {
        matches: ({ key, text }) => /^\d{16,19}$/.test(text) || (/(bank_?card|card_?no|卡号|银行卡)/i.test(key) && text.length > 0),
        mask: (text) => `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`,
    },
    [BuiltinMaskDetector.EMAIL]: {
        matches: ({ key, text }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) || (/(email|mail|邮箱)/i.test(key) && text.length > 0),
        mask: (text) => (text.includes('@') ? text.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : MASKED_PLACEHOLDER),
    },
    [BuiltinMaskDetector.SECRET]: {
        matches: ({ key, text, isString }) => isString && text.length > 0 && /(secret|token|password|passwd|api[_-]?key|authorization|cookie|密码|密钥|令牌)/i.test(key),
        mask: () => MASKED_PLACEHOLDER,
    },
}

type Detector = {
    matches: (params: { key: string, text: string, isString: boolean }) => boolean
    mask: (text: string) => string
}

type WalkParams = {
    node: unknown
    key: string
    forced: boolean
    fieldPatterns: RegExp[]
    detectors: Detector[]
}

type MaskDeepParams = {
    value: unknown
    rules: MaskRule[]
    maskAll: boolean
}

export const MASKED_PLACEHOLDER = '******'

export type MaskDeepResult = {
    value: unknown
    maskedCount: number
}

export type MaskRule = {
    id: string
    name: string
    type: MaskRuleType
    detector: BuiltinMaskDetector | null
    pattern: string | null
    enabled: boolean
}
