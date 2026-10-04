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
    maskText,
    defaultMaskRules,
}

function maskDeep({ value, rules, maskAll }: MaskDeepParams): MaskDeepResult {
    return walk({ node: value, key: '', forced: maskAll, ...compileRules({ rules }) })
}

function maskText({ text, rules }: MaskTextParams): MaskTextResult {
    const masked = walk({ node: text, key: '', forced: false, ...compileRules({ rules }) })
    return { value: typeof masked.value === 'string' ? masked.value : text, maskedCount: masked.maskedCount }
}

function compileRules({ rules }: { rules: MaskRule[] }): CompiledRules {
    const enabled = rules.filter((rule) => rule.enabled)
    const fieldPatterns = enabled
        .filter((rule) => rule.type === MaskRuleType.FIELD && rule.pattern !== null)
        .map((rule) => compileSafely(rule.pattern ?? ''))
        .filter((regex): regex is RegExp => regex !== null)
    const detectors = enabled
        .filter((rule) => rule.type === MaskRuleType.BUILTIN && rule.detector !== null)
        .map((rule) => DETECTORS[rule.detector ?? BuiltinMaskDetector.SECRET])
    return { fieldPatterns, detectors }
}

function defaultMaskRules(): MaskRule[] {
    return [
        builtin({ id: 'builtin-phone', name: '手机号', detector: BuiltinMaskDetector.PHONE, enabled: true }),
        builtin({ id: 'builtin-id-card', name: '身份证号', detector: BuiltinMaskDetector.ID_CARD, enabled: true }),
        builtin({ id: 'builtin-bank-card', name: '银行卡号', detector: BuiltinMaskDetector.BANK_CARD, enabled: true }),
        builtin({ id: 'builtin-email', name: '邮箱', detector: BuiltinMaskDetector.EMAIL, enabled: true }),
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
            const maskedKey = scanText({ text: childKey, detectors })
            return {
                value: { ...asRecord(acc.value), [maskedKey.value]: child.value },
                maskedCount: acc.maskedCount + child.maskedCount + maskedKey.maskedCount,
            }
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
    if (hit !== undefined) {
        return { value: hit.mask(text), maskedCount: 1 }
    }
    if (typeof node !== 'string') {
        return { value: node, maskedCount: 0 }
    }
    return walkString({ text: node, fieldPatterns, detectors })
}

function walkString({ text, fieldPatterns, detectors }: { text: string, fieldPatterns: RegExp[], detectors: Detector[] }): MaskDeepResult {
    const parsed = parseStructured({ text })
    if (parsed !== null) {
        const masked = walk({ node: parsed, key: '', forced: false, fieldPatterns, detectors })
        return masked.maskedCount === 0 ? { value: text, maskedCount: 0 } : { value: JSON.stringify(masked.value), maskedCount: masked.maskedCount }
    }
    return scanText({ text, detectors })
}

function parseStructured({ text }: { text: string }): object | null {
    const trimmed = text.trim()
    if (!(trimmed.startsWith('{') && trimmed.endsWith('}')) && !(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return null
    }
    try {
        const parsed: unknown = JSON.parse(trimmed)
        return typeof parsed === 'object' ? parsed : null
    }
    catch {
        return null
    }
}

function scanText({ text, detectors }: { text: string, detectors: Detector[] }): { value: string, maskedCount: number } {
    return detectors.reduce<{ value: string, maskedCount: number }>((acc, detector) => {
        const scanned = detector.scan(acc.value)
        return { value: scanned.value, maskedCount: acc.maskedCount + scanned.maskedCount }
    }, { value: text, maskedCount: 0 })
}

function replaceAllWith({ text, pattern, mask }: { text: string, pattern: RegExp, mask: (match: string, prefix: string) => string }): { value: string, maskedCount: number } {
    const counter = { count: 0 }
    const value = text.replace(pattern, (match: string, prefix: unknown) => {
        counter.count += 1
        return mask(match, typeof prefix === 'string' ? prefix : '')
    })
    return { value, maskedCount: counter.count }
}

function digitsOf({ text }: { text: string }): string {
    return text.replace(/\D/g, '')
}

function maskPhoneNumber({ match }: { match: string }): string {
    const digits = digitsOf({ text: match })
    return keepEnds({ text: digits.length > 11 ? digits.slice(-11) : digits, head: 3, tail: 4 })
}

function maskIdCardNumber({ match }: { match: string }): string {
    const compact = match.replace(/[\s-]/g, '')
    return keepEnds({ text: compact, head: 3, tail: 4 })
}

function maskBankCardNumber({ match }: { match: string }): string {
    const digits = digitsOf({ text: match })
    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

function maskEmailAddress({ match }: { match: string }): string {
    return match.replace(/^(.)[^@]*(@.*)$/, '$1***$2')
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
        scan: (text) => replaceAllWith({ text, pattern: PHONE_PATTERN, mask: (match) => maskPhoneNumber({ match }) }),
    },
    [BuiltinMaskDetector.ID_CARD]: {
        matches: ({ key, text }) => /^\d{17}[\dXx]$/.test(text) || (/(id_?card|身份证)/i.test(key) && text.length > 0),
        mask: (text) => keepEnds({ text, head: 3, tail: 4 }),
        scan: (text) => replaceAllWith({ text, pattern: ID_CARD_PATTERN, mask: (match) => maskIdCardNumber({ match }) }),
    },
    [BuiltinMaskDetector.BANK_CARD]: {
        matches: ({ key, text }) => /^\d{16,19}$/.test(text) || (/(bank_?card|card_?no|卡号|银行卡)/i.test(key) && text.length > 0),
        mask: (text) => `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`,
        scan: (text) => replaceAllWith({ text, pattern: BANK_CARD_PATTERN, mask: (match) => maskBankCardNumber({ match }) }),
    },
    [BuiltinMaskDetector.EMAIL]: {
        matches: ({ key, text }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) || (/(email|mail|邮箱)/i.test(key) && text.length > 0),
        mask: (text) => (text.includes('@') ? text.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : MASKED_PLACEHOLDER),
        scan: (text) => replaceAllWith({ text, pattern: EMAIL_PATTERN, mask: (match) => maskEmailAddress({ match }) }),
    },
    [BuiltinMaskDetector.SECRET]: {
        matches: ({ key, text, isString }) => isString && text.length > 0 && /(secret|token|password|passwd|pwd|passphrase|private[_-]?key|credential|api[_-]?key|access[_-]?key|authorization|cookie|密码|密钥|令牌)/i.test(key),
        mask: () => MASKED_PLACEHOLDER,
        scan: (text) => {
            const keyed = replaceAllWith({ text, pattern: SECRET_ASSIGNMENT_PATTERN, mask: (match, prefix) => `${prefix}${MASKED_PLACEHOLDER}` })
            const tokens = replaceAllWith({ text: keyed.value, pattern: SECRET_TOKEN_PATTERN, mask: () => MASKED_PLACEHOLDER })
            return { value: tokens.value, maskedCount: keyed.maskedCount + tokens.maskedCount }
        },
    },
}

const PHONE_PATTERN = /(?<![\d])(?:(?:\+|00)?86[\s-]?)?(?:1[3-9]\d{9}|1[3-9]\d[\s-]\d{4}[\s-]\d{4})(?!\d)/g
const ID_CARD_PATTERN = /(?<![\dA-Za-z])\d{6}[\s-]?(?:18|19|20)\d{2}[\s-]?\d{4}[\s-]?\d{3}[\dXx](?![\dA-Za-z])/g
const BANK_CARD_PATTERN = /(?<!\d)(?:\d{16,19}|\d{4}(?:[\s-]\d{4}){3}(?:[\s-]\d{1,3})?)(?!\d)/g
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g
const SECRET_ASSIGNMENT_PATTERN = /((?:secret|token|password|passwd|pwd|api[_-]?key|access[_-]?key|authorization|cookie|密码|密钥|令牌)[\w-]*\\?["']?\s*[:=]\s*\\?["']?(?:(?:Bearer|Basic)\s+)?)[^\s"'\\,;&}\]]+/gi
const SECRET_TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,})/g

type Detector = {
    matches: (params: { key: string, text: string, isString: boolean }) => boolean
    mask: (text: string) => string
    scan: (text: string) => { value: string, maskedCount: number }
}

type CompiledRules = {
    fieldPatterns: RegExp[]
    detectors: Detector[]
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

type MaskTextParams = {
    text: string
    rules: MaskRule[]
}

export type MaskTextResult = {
    value: string
    maskedCount: number
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
