import { isNil } from '@fema-ipaas/core-utils'

function ruleFor({ connectorName, actionName }: { connectorName: string, actionName: string }): VerificationRule | null {
    return RULES[`${connectorName}:${actionName}`] ?? null
}

function departmentRule({ openIdFrom }: { openIdFrom: 'input' | 'output' }): VerificationRule {
    return {
        aspect: 'department',
        readAction: READ_ACTION,
        readInput: ({ input, output }) => {
            const openId = readString(openIdFrom === 'input' ? input : output, openIdFrom === 'input' ? 'openId' : 'open_id')
            const departmentId = readString(input, 'departmentId')
            return isNil(openId) || isNil(departmentId) ? null : { openId, departmentId }
        },
        judge: ({ input, actual }) => {
            const expected = readString(input, 'departmentId')
            const departments = readStrings(actual, 'department_ids')
            if (isNil(expected)) {
                return null
            }
            if (isResigned(actual)) {
                return { ok: false, detail: RESIGNED_DETAIL }
            }
            return departments.includes(expected)
                ? { ok: true, detail: `in department ${expected}` }
                : { ok: false, detail: `the run put the account in department ${expected}, Feishu has ${departments.length === 0 ? 'none' : departments.join(', ')}` }
        },
    }
}

function suspensionRule({ expectSuspended }: { expectSuspended: boolean }): VerificationRule {
    return {
        aspect: 'suspension',
        readAction: READ_ACTION,
        readInput: ({ input }) => {
            const openId = readString(input, 'openId')
            return isNil(openId) ? null : { openId }
        },
        judge: ({ actual }) => {
            if (isResigned(actual)) {
                return { ok: false, detail: RESIGNED_DETAIL }
            }
            const suspended = typeof actual === 'object' && actual !== null && 'is_frozen' in actual && actual.is_frozen === true
            return suspended === expectSuspended
                ? { ok: true, detail: suspended ? 'account is suspended' : 'account is active' }
                : { ok: false, detail: expectSuspended ? 'the run suspended the account, Feishu still shows it as active' : 'the run resumed the account, Feishu still shows it as suspended' }
        },
    }
}

function isResigned(actual: unknown): boolean {
    return typeof actual === 'object' && actual !== null && 'is_resigned' in actual && actual.is_resigned === true
}

function readString(source: unknown, key: string): string | null {
    if (typeof source !== 'object' || source === null || !(key in source)) {
        return null
    }
    const value = Reflect.get(source, key)
    return typeof value === 'string' && value.length > 0 ? value : null
}

function readStrings(source: unknown, key: string): string[] {
    if (typeof source !== 'object' || source === null || !(key in source)) {
        return []
    }
    const value = Reflect.get(source, key)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const FEISHU = '@fema-ipaas/connector-feishu'
const READ_ACTION = 'get_user'
const RESIGNED_DETAIL = 'the account no longer exists in Feishu, it was deleted after the run'

const RULES: Record<string, VerificationRule> = {
    [`${FEISHU}:provision_user`]: departmentRule({ openIdFrom: 'output' }),
    [`${FEISHU}:update_user`]: departmentRule({ openIdFrom: 'input' }),
    [`${FEISHU}:suspend_user`]: suspensionRule({ expectSuspended: true }),
    [`${FEISHU}:resume_user`]: suspensionRule({ expectSuspended: false }),
}

export const verificationRules = { ruleFor }

export type VerificationJudgement = {
    ok: boolean
    detail: string
}

export type VerificationRule = {
    aspect: 'department' | 'suspension'
    readAction: string
    readInput: (params: { input: unknown, output: unknown }) => Record<string, unknown> | null
    judge: (params: { input: unknown, output: unknown, actual: unknown }) => VerificationJudgement | null
}
