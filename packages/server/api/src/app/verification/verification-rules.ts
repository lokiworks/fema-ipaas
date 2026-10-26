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

function organizationRule({ archive }: { archive: boolean }): VerificationRule {
    return {
        aspect: 'organization', readAction: 'get_department',
        readInput: ({ input, output }) => {
            const parent = readString(input, archive ? 'archiveParentId' : 'parentDepartmentId')
            const departmentId = readString(output, parent?.startsWith('od-') ? 'open_department_id' : 'department_id')
            return departmentId ? { departmentId } : null
        },
        judge: ({ input, actual }) => {
            const parent = readString(input, archive ? 'archiveParentId' : 'parentDepartmentId')
            const name = readString(input, 'name')
            const parentMatches = parent === readString(actual, 'parent_department_id')
            const nameMatches = archive || name === readString(actual, 'name')
            return { ok: parentMatches && nameMatches, detail: parentMatches && nameMatches ? 'department name and parent match' : 'department name or parent differs from the requested state' }
        },
    }
}

function directoryMemberRule({ suspension, enabled }: { suspension: boolean, enabled?: boolean }): VerificationRule {
    return {
        aspect: suspension ? 'suspension' : 'department', readAction: 'get_user',
        readInput: ({ input, output }) => {
            const userid = readString(input, 'userid') ?? readString(output, 'userid'); return userid ? { userid } : null 
        },
        judge: ({ input, actual }) => {
            const expected = readString(input, 'departmentId')
            const ok = suspension ? typeof actual === 'object' && actual !== null && 'is_frozen' in actual && actual.is_frozen === !enabled : expected !== null && readStrings(actual, 'department_ids').includes(expected)
            return { ok, detail: ok ? 'member state matches' : 'member state differs from the requested department or enabled state' }
        },
    }
}

function numericDepartmentRule({ archive, parentKey }: { archive: boolean, parentKey: string }): VerificationRule {
    return { aspect: 'organization', readAction: 'get_department', readInput: ({ input, output }) => {
        const departmentId = readString(output, 'id') ?? readString(input, 'departmentId'); return departmentId ? { departmentId } : null 
    }, judge: ({ input, actual }) => {
        const expectedParent = readString(input, archive ? 'archiveParentId' : 'parentDepartmentId'); const ok = expectedParent === readString(actual, parentKey) && (archive || readString(input, 'name') === readString(actual, 'name')); return { ok, detail: ok ? 'department name and parent match' : 'department name or parent differs' } 
    } }
}

function pendingResignationRule(): VerificationRule {
    return { aspect: 'department', readAction: 'get_user', readInput: ({ input }) => {
        const userid = readString(input, 'userid'); return userid ? { userid } : null 
    }, judge: ({ input, actual }) => {
        const expected = readString(input, 'pendingDepartmentId'); const ok = expected !== null && readStrings(actual, 'department_ids').includes(expected); return { ok, detail: ok ? 'member is in the pending resignation department; the account remains usable until an administrator completes resignation' : 'member is outside the pending resignation department' } 
    } }
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
    [`${FEISHU}:upsert_department`]: organizationRule({ archive: false }),
    [`${FEISHU}:archive_department`]: organizationRule({ archive: true }),
    '@fema-ipaas/connector-dingtalk:provision_user': directoryMemberRule({ suspension: false }),
    '@fema-ipaas/connector-dingtalk:update_user': directoryMemberRule({ suspension: false }),
    '@fema-ipaas/connector-dingtalk:suspend_user': pendingResignationRule(),
    '@fema-ipaas/connector-dingtalk:upsert_department': numericDepartmentRule({ archive: false, parentKey: 'parentId' }),
    '@fema-ipaas/connector-dingtalk:archive_department': numericDepartmentRule({ archive: true, parentKey: 'parentId' }),
    '@fema-ipaas/connector-wecom:upsert_department': numericDepartmentRule({ archive: false, parentKey: 'parentid' }),
    '@fema-ipaas/connector-wecom:archive_department': numericDepartmentRule({ archive: true, parentKey: 'parentid' }),
    '@fema-ipaas/connector-wecom:provision_user': directoryMemberRule({ suspension: false }),
    '@fema-ipaas/connector-wecom:update_user': directoryMemberRule({ suspension: false }),
    '@fema-ipaas/connector-wecom:suspend_user': directoryMemberRule({ suspension: true, enabled: false }),
    '@fema-ipaas/connector-wecom:resume_user': directoryMemberRule({ suspension: true, enabled: true }),
}

export const verificationRules = { ruleFor }

export type VerificationJudgement = {
    ok: boolean
    detail: string
}

export type VerificationRule = {
    aspect: 'department' | 'suspension' | 'organization'
    readAction: string
    readInput: (params: { input: unknown, output: unknown }) => Record<string, unknown> | null
    judge: (params: { input: unknown, output: unknown, actual: unknown }) => VerificationJudgement | null
}
