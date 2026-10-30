import { MappingMissingBehavior } from '@fema-ipaas/core-utils'
import { PropertyExecutionType, WorkflowTrigger } from '@fema-ipaas/shared'

function beisenTrigger({ displayName, statusScope, changeTypes, dedupeKey, dedupeDays, serial, orderKeyPath, nextAction }: BeisenTriggerParams): WorkflowTrigger {
    return WorkflowTrigger.parse({
        name: 'trigger',
        type: 'CONNECTOR_TRIGGER',
        valid: true,
        displayName,
        lastUpdatedDate: STAMP,
        settings: {
            connectorName: BEISEN,
            connectorVersion: BEISEN_VERSION,
            triggerName: 'employee_changed',
            input: {
                auth: BEISEN_AUTH,
                statusScope,
                queryType: 2,
                timezone: 'Asia/Shanghai',
                ...(changeTypes.length > 0 ? { filterColumn: 'recordInfo.changeTypeOID', filterValues: changeTypes } : {}),
            },
            propertySettings: {},
            dedupe: { enabled: true, keyPath: dedupeKey, windowSeconds: dedupeDays * 24 * 60 * 60 },
            ...concurrencyOf({ serial, orderKeyPath }),
        },
        nextAction,
    })
}

function concurrencyOf({ serial, orderKeyPath }: { serial?: boolean, orderKeyPath?: string }): Record<string, unknown> {
    if (serial) {
        return { concurrency: { maxConcurrentRuns: 1 } }
    }
    return orderKeyPath === undefined ? {} : { concurrency: { maxConcurrentRuns: 0, orderKeyPath } }
}

function connectorStep({ name, displayName, connectorName, connectorVersion, actionName, input, retry, dynamic = [], nextAction }: ConnectorStepParams): Record<string, unknown> {
    return {
        type: 'CONNECTOR',
        name,
        displayName,
        valid: true,
        lastUpdatedDate: STAMP,
        settings: {
            connectorName,
            connectorVersion,
            actionName,
            input,
            propertySettings: Object.fromEntries(dynamic.map((key) => [key, { type: PropertyExecutionType.DYNAMIC }])),
            errorHandlingOptions: retry ? { retryOnFailure: { value: true }, continueOnFailure: { value: false } } : {},
        },
        ...(nextAction ? { nextAction } : {}),
    }
}

function routerStep({ name, displayName, condition, branchName, fallbackName, child }: RouterStepParams): Record<string, unknown> {
    return {
        type: 'ROUTER',
        name,
        displayName,
        valid: true,
        lastUpdatedDate: STAMP,
        settings: {
            executionType: 'EXECUTE_FIRST_MATCH',
            branches: [
                { branchType: 'CONDITION', branchName, conditions: [[condition]] },
                { branchType: 'FALLBACK', branchName: fallbackName },
            ],
        },
        children: [child, null],
    }
}

function ref(section: 'employeeInfo' | 'recordInfo', field: string): string {
    return `{{trigger['output']['${section}']['${field}']}}`
}

export const BEISEN = '@fema-ipaas/connector-beisen'
export const FEISHU = '@fema-ipaas/connector-feishu'
export const DATA_MAPPER = '@fema-ipaas/connector-data-mapper'
export const STORE = '@fema-ipaas/connector-store'
export const STORE_VERSION = '~0.6.0'
export const BEISEN_VERSION = '~0.4.0'
export const FEISHU_VERSION = '~0.5.0'
export const BEISEN_AUTH = '{{connections[\'beisen-connection\']}}'
export const FEISHU_AUTH = '{{connections[\'feishu-connection\']}}'
export const STAMP = '2026-10-03T00:00:00.000Z'
export const DEPARTMENT_OID = '{{trigger[\'output\'][\'recordInfo\'][\'oIdDepartment\']}}'

export const DEPARTMENT_TABLE = {
    id: 'mt_beisen_department',
    key: 'department',
    name: '北森部门到飞书部门',
    description: '用北森任职部门的 OId 查飞书部门 ID',
    keyLabel: '北森部门 OId',
    valueLabel: '飞书部门 ID',
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
    rows: [],
}

type BeisenTriggerParams = {
    displayName: string
    statusScope: 'ACTIVE' | 'LEFT' | 'ONBOARDING' | 'ALL'
    changeTypes: string[]
    dedupeKey: string
    dedupeDays: number
    serial?: boolean
    orderKeyPath?: string
    nextAction: Record<string, unknown>
}

type ConnectorStepParams = {
    name: string
    displayName: string
    connectorName: string
    connectorVersion: string
    actionName: string
    input: Record<string, unknown>
    retry?: boolean
    dynamic?: string[]
    nextAction?: Record<string, unknown>
}

type RouterStepParams = {
    name: string
    displayName: string
    condition: Record<string, unknown>
    branchName: string
    fallbackName: string
    child: Record<string, unknown>
}

export { beisenTrigger, connectorStep, ref, routerStep }
