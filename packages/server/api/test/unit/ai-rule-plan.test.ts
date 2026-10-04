import { ApplicationError, MappingMissingBehavior } from '@fema-ipaas/core-utils'
import { MappingTableSummary, WorkflowPlan, WorkflowPlanSource } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { aiPlanSteps, CatalogEntry } from '../../src/app/ai/ai-plan-steps'
import { aiReferences } from '../../src/app/ai/ai-references'
import { aiRulePlanner } from '../../src/app/ai/ai-rule-plan'
import { aiSystems } from '../../src/app/ai/ai-systems'

const BEISEN = '@fema-ipaas/connector-beisen'
const FEISHU = '@fema-ipaas/connector-feishu'
const DATA_MAPPER = '@fema-ipaas/connector-data-mapper'

function operation({ name, props }: { name: string, props: string[] }): { name: string, displayName: string, props: Record<string, unknown> } {
    return { name, displayName: name, props: Object.fromEntries(props.map((prop) => [prop, {}])) }
}

const CATALOG: CatalogEntry[] = [
    {
        name: BEISEN,
        displayName: '北森',
        auth: {},
        suggestedTriggers: [operation({ name: 'employee_changed', props: ['statusScope', 'queryType', 'timezone', 'filterColumn', 'filterValues'] })],
        suggestedActions: [],
    },
    {
        name: FEISHU,
        displayName: '飞书',
        auth: {},
        suggestedTriggers: [],
        suggestedActions: [
            operation({ name: 'provision_user', props: ['name', 'mobile', 'departmentId', 'employeeType', 'email', 'employeeNo'] }),
            operation({ name: 'send_group_message', props: ['chatId', 'messageType', 'content'] }),
            operation({ name: 'create_bitable_record', props: ['appToken', 'tableId', 'fields'] }),
            operation({ name: 'find_user', props: ['lookupBy', 'value'] }),
            operation({ name: 'suspend_user', props: ['openId'] }),
            operation({ name: 'update_user', props: ['openId', 'departmentId'] }),
        ],
    },
    {
        name: DATA_MAPPER,
        displayName: '数据映射',
        suggestedTriggers: [],
        suggestedActions: [operation({ name: 'map_fields', props: ['mapping', 'failOnError'] })],
    },
]

const DEPARTMENT_TABLE: MappingTableSummary = {
    id: 'mt_dept',
    created: '2026-10-01T00:00:00.000Z',
    updated: '2026-10-01T00:00:00.000Z',
    projectId: 'p1',
    name: '北森部门到飞书部门',
    description: '',
    keyLabel: '北森部门',
    valueLabel: '飞书部门',
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
    updatedById: null,
    rowCount: 3,
}

function plan({ prompt, answers = [], mappingTables = [], catalog = CATALOG }: { prompt: string, answers?: { question: string, answer: string }[], mappingTables?: MappingTableSummary[], catalog?: CatalogEntry[] }): WorkflowPlan {
    return aiRulePlanner.plan({
        prompt,
        answers,
        catalog,
        connections: [{ externalId: 'feishu-main', connectorName: FEISHU, displayName: '飞书主连接' }],
        mappingTables,
        unavailableSystems: aiSystems.unavailable({ prompt, catalog }),
    })
}

function refusal(attempt: () => unknown): string {
    try {
        attempt()
    }
    catch (error) {
        return error instanceof ApplicationError ? JSON.stringify(error.error.params) : String(error)
    }
    return ''
}

describe('aiRulePlanner', () => {
    it('plans the onboarding scenario with record, account and notification steps', () => {
        const result = plan({ prompt: '员工入职后在飞书建档、按部门开通账号并通知 HR 群' })
        expect(result.source).toBe(WorkflowPlanSource.RULES)
        expect(result.trigger.operationName).toBe('employee_changed')
        expect(result.trigger.input).toMatchObject({ statusScope: 'ONBOARDING', filterColumn: 'recordInfo.changeTypeOID' })
        expect(result.steps.map((step) => step.operationName)).toEqual(['create_bitable_record', 'provision_user', 'send_group_message'])
        expect(result.steps[1].input).toMatchObject({ name: "{{trigger['output']['employeeInfo']['name']}}", employeeNo: "{{trigger['output']['recordInfo']['jobNumber']}}" })
        expect(result.steps[1].connectionExternalId).toBe('feishu-main')
        expect(result.steps[1].connectionDisplayName).toBe('飞书主连接')
        expect(result.trigger.connectionExternalId).toBeNull()
        expect(result.trigger.requiresConnection).toBe(true)
    })

    it('asks about the group, table and department instead of inventing them', () => {
        const result = plan({ prompt: '员工入职后在飞书建档、按部门开通账号并通知 HR 群' })
        expect(result.questions).toHaveLength(3)
        expect(result.questions.some((question) => question.startsWith('通知哪个飞书群'))).toBe(true)
        expect(result.warnings.some((warning) => warning.includes('部门对照表'))).toBe(true)
        const notify = result.steps.find((step) => step.operationName === 'send_group_message')
        expect(notify?.input['chatId']).toBeUndefined()
        const provision = result.steps.find((step) => step.operationName === 'provision_user')
        expect(provision?.input['departmentId']).toBeUndefined()
    })

    it('uses the department mapping table of the project and wires the lookup result into the account step', () => {
        const result = plan({ prompt: '员工入职后在飞书开通账号', mappingTables: [DEPARTMENT_TABLE] })
        expect(result.steps.map((step) => step.operationName)).toEqual(['map_fields', 'provision_user'])
        expect(result.steps[1].input['departmentId']).toBe("{{step_1['output']['departmentId']}}")
        expect(result.questions).toEqual([])
        expect(result.summary).toContain('北森部门到飞书部门')
    })

    it('applies answers and keeps rejecting answers that do not look right', () => {
        const prompt = '员工入职后开通飞书账号并通知 HR 群'
        const asked = plan({ prompt })
        const chatQuestion = asked.questions.find((question) => question.startsWith('通知哪个飞书群'))
        expect(chatQuestion).toBeDefined()
        const departmentQuestion = asked.questions.find((question) => question.startsWith('新员工放进哪个飞书部门'))
        const answered = plan({
            prompt,
            answers: [
                { question: chatQuestion ?? '', answer: '群是 oc_hr_notice' },
                { question: departmentQuestion ?? '', answer: 'od-rd' },
            ],
        })
        expect(answered.questions).toEqual([])
        expect(answered.steps.find((step) => step.operationName === 'send_group_message')?.input['chatId']).toBe('oc_hr_notice')
        expect(answered.steps.find((step) => step.operationName === 'provision_user')?.input['departmentId']).toBe('od-rd')
        const rejected = plan({ prompt, answers: [{ question: chatQuestion ?? '', answer: '人事群' }] })
        expect(rejected.questions.some((question) => question.startsWith('通知哪个飞书群'))).toBe(true)
        expect(rejected.warnings.some((warning) => warning.includes('不像飞书群 ID'))).toBe(true)
    })

    it('suspends instead of deleting when the description asks to delete the account', () => {
        const result = plan({ prompt: '员工离职后删除飞书账号并通知 IT 群' })
        expect(result.steps.map((step) => step.operationName)).toEqual(['find_user', 'suspend_user', 'send_group_message'])
        expect(result.steps[1].input['openId']).toBe("{{step_1['output']['open_id']}}")
        expect(result.warnings.some((warning) => warning.includes('不提供删除飞书账号'))).toBe(true)
        expect(result.trigger.input).toMatchObject({ statusScope: 'LEFT' })
    })

    it('plans a transfer with the mapped department', () => {
        const result = plan({ prompt: '员工调岗后同步飞书部门', mappingTables: [DEPARTMENT_TABLE] })
        expect(result.steps.map((step) => step.operationName)).toEqual(['find_user', 'map_fields', 'update_user'])
        expect(result.steps[2].input).toMatchObject({ openId: "{{step_1['output']['open_id']}}", departmentId: "{{step_2['output']['departmentId']}}" })
    })

    it('refuses descriptions it cannot understand with a readable reason', () => {
        expect(refusal(() => plan({ prompt: '帮我自动化一下' }))).toContain('没有听出要做的事')
    })

    it('refuses when the only named system has no connector', () => {
        expect(refusal(() => plan({ prompt: '员工入职后在 SAP 里建档' }))).toContain('SAP')
    })

    it('keeps planning when an extra unavailable system is named and reports it', () => {
        const result = plan({ prompt: '北森员工入职后开通飞书账号，再同步到金蝶' })
        expect(result.unavailableSystems).toEqual(['金蝶'])
        expect(result.steps.map((step) => step.operationName)).toEqual(['provision_user'])
    })

    it('reports a missing trigger connector instead of an empty plan', () => {
        const withoutBeisen = CATALOG.filter((entry) => entry.name !== BEISEN)
        expect(refusal(() => plan({ prompt: '员工入职后开通飞书账号', catalog: withoutBeisen }))).toContain('北森连接器')
    })

    it('writes English text for English descriptions', () => {
        const result = plan({ prompt: 'When an employee is onboarded in Beisen, create their Feishu account and notify the HR group' })
        expect(result.displayName).toBe('Employee onboarding: create Feishu account')
        expect(result.questions[0]).toContain('Feishu')
    })
})

describe('aiSystems.unavailable', () => {
    it('matches ASCII names as whole words only', () => {
        expect(aiSystems.unavailable({ prompt: 'send it to WhatsApp', catalog: CATALOG })).toEqual([])
        expect(aiSystems.unavailable({ prompt: 'write to SAP', catalog: CATALOG })).toEqual(['SAP'])
    })

    it('does not report systems that have a connector', () => {
        const catalog: CatalogEntry[] = [...CATALOG, { name: '@fema-ipaas/connector-dingtalk', displayName: '钉钉', suggestedTriggers: [], suggestedActions: [] }]
        expect(aiSystems.unavailable({ prompt: '钉钉审批通过后通知金蝶', catalog })).toEqual(['金蝶'])
    })
})

describe('aiPlanSteps.assemble', () => {
    it('renumbers step references when an earlier step is left out and drops references to the removed step', () => {
        const assembled = aiPlanSteps.assemble({
            trigger: { connector: BEISEN, name: 'employee_changed', displayName: '' },
            steps: [
                { connector: '@fema-ipaas/connector-missing', name: 'x', displayName: 'gone' },
                { connector: FEISHU, name: 'find_user', displayName: 'find', input: { lookupBy: 'mobile', value: '1' } },
                { connector: FEISHU, name: 'suspend_user', displayName: 'suspend', input: { openId: "{{step_2['output']['open_id']}}" } },
                { connector: FEISHU, name: 'send_group_message', displayName: 'notify', input: { content: "{{step_1['output']['x']}}" } },
            ],
            catalog: CATALOG,
            connections: [],
        })
        expect(assembled.omittedSteps).toBe(1)
        expect(assembled.steps.map((step) => step.operationName)).toEqual(['find_user', 'suspend_user', 'send_group_message'])
        expect(assembled.steps[1].input['openId']).toBe("{{step_1['output']['open_id']}}")
        expect(assembled.steps[2].input['content']).toBe('')
    })
})

describe('aiReferences', () => {
    it('detects references to a step', () => {
        expect(aiReferences.referencesStep({ value: { a: ["{{step_3['output']['x']}}"] }, index: 3 })).toBe(true)
        expect(aiReferences.referencesStep({ value: "{{step_13['output']['x']}}", index: 3 })).toBe(false)
    })
})
