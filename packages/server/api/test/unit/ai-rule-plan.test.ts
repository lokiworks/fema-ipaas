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
const SCHEDULE = '@fema-ipaas/connector-schedule'
const DATE_HELPER = '@fema-ipaas/connector-date-helper'

function operation({ name, props }: { name: string, props: string[] }): { name: string, displayName: string, props: Record<string, unknown> } {
    return { name, displayName: name, props: Object.fromEntries(props.map((prop) => [prop, {}])) }
}

const CATALOG: CatalogEntry[] = [
    {
        name: FEISHU,
        displayName: '飞书',
        auth: {},
        suggestedTriggers: [operation({ name: 'event_received', props: ['verificationToken', 'encryptKey', 'eventType'] })],
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
        name: BEISEN,
        displayName: '北森',
        auth: {},
        suggestedTriggers: [operation({ name: 'employee_changed', props: ['statusScope', 'queryType', 'timezone', 'changeTypes', 'filterColumn', 'filterValues'] })],
        suggestedActions: [operation({ name: 'search_changed_employees', props: ['startTime', 'stopTime', 'statusScope', 'queryType'] })],
    },
    {
        name: SCHEDULE,
        displayName: '定时',
        suggestedTriggers: [operation({ name: 'every_day', props: ['hour_of_the_day', 'timezone', 'run_on_weekends'] })],
        suggestedActions: [],
    },
    {
        name: DATE_HELPER,
        displayName: '日期工具',
        suggestedTriggers: [],
        suggestedActions: [
            operation({ name: 'get_current_date', props: ['timeFormat', 'timeZone'] }),
            operation({ name: 'add_subtract_date', props: ['inputDate', 'inputDateFormat', 'outputFormat', 'expression', 'timeZone'] }),
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

function plan({ prompt, answers = [], mappingTables = [], catalog = CATALOG, excluded = [] }: { prompt: string, answers?: { question: string, answer: string }[], mappingTables?: MappingTableSummary[], catalog?: CatalogEntry[], excluded?: string[] }): WorkflowPlan {
    return aiRulePlanner.plan({
        prompt,
        answers,
        catalog,
        connections: [{ externalId: 'feishu-main', connectorName: FEISHU, displayName: '飞书主连接' }],
        mappingTables,
        unavailableSystems: aiSystems.unavailable({ prompt, catalog }),
        excluded,
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
        expect(result.trigger.input).toMatchObject({ statusScope: 'ONBOARDING', changeTypes: ['1', '2'] })
        expect(result.steps.map((step) => step.operationName)).toEqual(['create_bitable_record', 'provision_user', 'send_group_message'])
        expect(result.steps[1].input).toMatchObject({ name: '{{trigger[\'output\'][\'employeeInfo\'][\'name\']}}', employeeNo: '{{trigger[\'output\'][\'recordInfo\'][\'jobNumber\']}}' })
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
        expect(result.steps[1].input['departmentId']).toBe('{{step_1[\'output\'][\'departmentId\']}}')
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
        expect(result.steps[1].input['openId']).toBe('{{step_1[\'output\'][\'open_id\']}}')
        expect(result.warnings.some((warning) => warning.includes('不提供删除飞书账号'))).toBe(true)
        expect(result.trigger.input).toMatchObject({ statusScope: 'LEFT' })
    })

    it('plans a transfer with the mapped department', () => {
        const result = plan({ prompt: '员工调岗后同步飞书部门', mappingTables: [DEPARTMENT_TABLE] })
        expect(result.steps.map((step) => step.operationName)).toEqual(['find_user', 'map_fields', 'update_user'])
        expect(result.steps[2].input).toMatchObject({ openId: '{{step_1[\'output\'][\'open_id\']}}', departmentId: '{{step_2[\'output\'][\'departmentId\']}}' })
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

describe('aiRulePlanner scenarios beyond hiring and leaving', () => {
    it('archives Beisen employee info changes to a Feishu bitable', () => {
        const result = plan({ prompt: '北森员工信息变更后归档到飞书多维表格' })
        expect(result.trigger.operationName).toBe('employee_changed')
        expect(result.trigger.input).toMatchObject({ statusScope: 'ACTIVE' })
        expect(result.steps.map((step) => step.operationName)).toEqual(['create_bitable_record'])
        expect(result.questions.some((question) => question.startsWith('建档写进哪张多维表格'))).toBe(true)
        expect(result.dedupe).toMatchObject({ keyPath: '{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.startDate}}', windowSeconds: 86400 })
        expect(result.warnings.some((warning) => warning.includes('生效日期去重'))).toBe(true)
    })

    it('turns a Feishu event into a group notification and asks for the event type and group', () => {
        const result = plan({ prompt: '飞书收到机器人消息事件后通知 IT 群' })
        expect(result.trigger.connectorName).toBe(FEISHU)
        expect(result.trigger.operationName).toBe('event_received')
        expect(result.steps.map((step) => step.operationName)).toEqual(['send_group_message'])
        expect(result.questions.map((question) => question.slice(0, 7))).toEqual(['要响应哪类飞书', '通知哪个飞书群'])
        expect(result.dedupe?.keyPath).toBe('header.event_id')
        expect(result.warnings.some((warning) => warning.includes('Verification Token'))).toBe(true)
    })

    it('takes the event type from the answer, and accepts "any" as no filter', () => {
        const asked = plan({ prompt: '飞书收到事件后通知 IT 群' })
        const eventQuestion = asked.questions[0]
        const typed = plan({ prompt: '飞书收到事件后通知 IT 群', answers: [{ question: eventQuestion, answer: '事件类型是 im.message.receive_v1' }] })
        expect(typed.trigger.input).toMatchObject({ eventType: 'im.message.receive_v1' })
        expect(typed.questions.some((question) => question.startsWith('要响应哪类飞书事件'))).toBe(false)
        const any = plan({ prompt: '飞书收到事件后通知 IT 群', answers: [{ question: eventQuestion, answer: '不限' }] })
        expect(any.trigger.input['eventType']).toBeUndefined()
        expect(any.questions.some((question) => question.startsWith('要响应哪类飞书事件'))).toBe(false)
    })

    it('plans a daily reconciliation reminder with a 24 hour window wired through the steps', () => {
        const result = plan({ prompt: '每天对账北森入职员工并通知 HR 群' })
        expect(result.trigger.connectorName).toBe(SCHEDULE)
        expect(result.steps.map((step) => step.operationName)).toEqual(['get_current_date', 'add_subtract_date', 'search_changed_employees', 'send_group_message'])
        expect(result.steps[2].input).toMatchObject({ startTime: '{{step_2[\'output\'][\'result\']}}', stopTime: '{{step_1[\'output\'][\'result\']}}', statusScope: 'ONBOARDING' })
        expect(result.steps[3].input['content']).toContain('{{step_3[\'output\'][\'count\']}}')
        expect(result.dedupe).toBeNull()
        expect(result.warnings.some((warning) => warning.includes('不会逐人比对'))).toBe(true)
    })

    it('keeps the Beisen hiring rules ahead of the new scenarios when the description starts with them', () => {
        expect(plan({ prompt: '员工入职后在飞书开通账号' }).trigger.input).toMatchObject({ statusScope: 'ONBOARDING' })
    })

    it('gives the onboarding, offboarding and transfer flows a business key and a window', () => {
        expect(plan({ prompt: '员工入职后在飞书开通账号' }).dedupe).toMatchObject({ keyPath: 'recordInfo.jobNumber', windowSeconds: 2592000 })
        expect(plan({ prompt: '员工离职后暂停飞书账号' }).dedupe).toMatchObject({ keyPath: 'recordInfo.jobNumber' })
        expect(plan({ prompt: '员工调岗后同步飞书部门' }).dedupe?.keyPath).toBe('{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.startDate}}')
    })

    it('asks for a department mapping table to be created when none exists, and not when one does', () => {
        expect(plan({ prompt: '员工入职后在飞书开通账号' }).missingMappingTable).toMatchObject({ name: '部门对照' })
        expect(plan({ prompt: '员工入职后在飞书开通账号', mappingTables: [DEPARTMENT_TABLE] }).missingMappingTable).toBeNull()
        expect(plan({ prompt: '员工离职后暂停飞书账号' }).missingMappingTable).toBeNull()
    })
})

describe('aiRulePlanner step removal', () => {
    it('drops the removed step, its question and its warning, and lists it so it can be restored', () => {
        const prompt = '员工入职后在飞书建档、按部门开通账号并通知 HR 群'
        const result = plan({ prompt, excluded: [`${FEISHU}/send_group_message`, `${FEISHU}/create_bitable_record`] })
        expect(result.steps.map((step) => step.operationName)).toEqual(['provision_user'])
        expect(result.questions.map((question) => question.slice(0, 5))).toEqual(['新员工放进'])
        expect(result.warnings.some((warning) => warning.includes('列名'))).toBe(false)
        expect(result.removedSteps.map((removed) => removed.key)).toEqual([`${FEISHU}/create_bitable_record`, `${FEISHU}/send_group_message`])
        expect(result.summary).not.toContain('通知')
    })

    it('keeps the other answers when a step is removed', () => {
        const prompt = '员工入职后在飞书建档、按部门开通账号并通知 HR 群'
        const asked = plan({ prompt })
        const chat = asked.questions.find((question) => question.startsWith('通知哪个飞书群')) ?? ''
        const result = plan({ prompt, answers: [{ question: chat, answer: 'oc_hr_notice' }], excluded: [`${FEISHU}/create_bitable_record`] })
        expect(result.steps.find((step) => step.operationName === 'send_group_message')?.input['chatId']).toBe('oc_hr_notice')
        expect(result.steps.map((step) => step.operationName)).toEqual(['provision_user', 'send_group_message'])
    })

    it('says which later step lost its reference when the step it read from is removed', () => {
        const result = plan({ prompt: '员工离职后暂停飞书账号', excluded: [`${FEISHU}/find_user`] })
        expect(result.steps.map((step) => step.operationName)).toEqual(['suspend_user'])
        expect(result.steps[0].input['openId']).toBe('')
        expect(result.warnings.some((warning) => warning.includes('暂停飞书账号') && warning.includes('引用'))).toBe(true)
        expect(result.warnings.some((warning) => warning.includes('找不到这个人'))).toBe(false)
    })
})

describe('aiRulePlanner.templates', () => {
    it('always returns the three closest templates, closest first', () => {
        const found = aiRulePlanner.templates({ prompt: '每天定时核对一下花名册' })
        expect(found).toHaveLength(3)
        expect(found[0].id).toBe('RECONCILE')
        expect(found.every((template) => template.examplePrompt.length > 0)).toBe(true)
    })

    it('still returns three templates when nothing matches, and writes English for English prompts', () => {
        const found = aiRulePlanner.templates({ prompt: 'do something clever' })
        expect(found).toHaveLength(3)
        expect(found[0].name).toMatch(/[A-Za-z]/)
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
                { connector: FEISHU, name: 'suspend_user', displayName: 'suspend', input: { openId: '{{step_2[\'output\'][\'open_id\']}}' } },
                { connector: FEISHU, name: 'send_group_message', displayName: 'notify', input: { content: '{{step_1[\'output\'][\'x\']}}' } },
            ],
            catalog: CATALOG,
            connections: [],
        })
        expect(assembled.omittedSteps).toBe(1)
        expect(assembled.steps.map((step) => step.operationName)).toEqual(['find_user', 'suspend_user', 'send_group_message'])
        expect(assembled.steps[1].input['openId']).toBe('{{step_1[\'output\'][\'open_id\']}}')
        expect(assembled.steps[2].input['content']).toBe('')
    })
})

describe('aiReferences', () => {
    it('detects references to a step', () => {
        expect(aiReferences.referencesStep({ value: { a: ['{{step_3[\'output\'][\'x\']}}'] }, index: 3 })).toBe(true)
        expect(aiReferences.referencesStep({ value: '{{step_13[\'output\'][\'x\']}}', index: 3 })).toBe(false)
    })
})
