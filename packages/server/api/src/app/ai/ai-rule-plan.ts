import {
    ApplicationError,
    ErrorCode,
    isNil,
    MappingTableSummary,
    PlanAnswer,
    WorkflowPlan,
    WorkflowPlanSource,
} from '@fema-ipaas/shared'
import { aiPlanSteps, CatalogEntry, ConnectionRef, StepDraft } from './ai-plan-steps'

export const aiRulePlanner = {
    plan,
}

function plan({ prompt, answers, catalog, connections, mappingTables, unavailableSystems }: PlanParams): WorkflowPlan {
    const language: Language = CJK_PATTERN.test(prompt) ? 'zh' : 'en'
    const text = TEXTS[language]
    const intent = detectIntent(prompt)
    if (isNil(intent)) {
        throw validation(text.unrecognized)
    }
    if (unavailableSystems.length > 0 && !BEISEN_PATTERN.test(prompt)) {
        throw validation(text.sourceUnavailable(unavailableSystems))
    }
    const facts = readFacts({ prompt, answers, mappingTables, intent })
    const blueprint = blueprintFor({ intent, facts, text })
    const assembled = aiPlanSteps.assemble({ trigger: blueprint.trigger, steps: blueprint.steps, catalog, connections })
    if (isNil(assembled.trigger)) {
        throw validation(text.triggerMissing)
    }
    const questions = openQuestions({ facts, text })
    return {
        displayName: text.names[intent],
        summary: text.summary({ intent, stepNames: blueprint.steps.map((step) => step.displayName), mappingTable: facts.mappingTable?.name ?? null }),
        source: WorkflowPlanSource.RULES,
        trigger: assembled.trigger,
        steps: assembled.steps,
        questions,
        warnings: [...new Set([...blueprint.warnings, ...invalidAnswerWarnings({ facts, text }), ...(assembled.omittedSteps > 0 ? [text.omitted] : [])])],
        unavailableSystems,
        omittedSteps: assembled.omittedSteps,
    }
}

function detectIntent(prompt: string): Intent | null {
    const text = prompt.toLowerCase()
    const hits = INTENTS
        .map((intent) => ({ intent, index: text.search(INTENT_PATTERNS[intent]) }))
        .filter((hit) => hit.index >= 0)
        .sort((a, b) => a.index - b.index)
    return hits[0]?.intent ?? null
}

function readFacts({ prompt, answers, mappingTables, intent }: { prompt: string, answers: PlanAnswer[], mappingTables: MappingTableSummary[], intent: Intent }): Facts {
    const text = prompt.toLowerCase()
    const chat = answerFor({ answers, kind: 'chat', pattern: CHAT_ID_PATTERN })
    const bitable = answerFor({ answers, kind: 'bitable', pattern: BITABLE_TOKEN_PATTERN })
    const department = answerFor({ answers, kind: 'department', pattern: DEPARTMENT_ID_PATTERN })
    const wantsRecord = intent === 'ONBOARD' && RECORD_PATTERN.test(text)
    const wantsNotify = NOTIFY_PATTERN.test(text) || GROUP_PATTERN.test(text)
    const wantsAccount = intent === 'ONBOARD' && (ACCOUNT_PATTERN.test(text) || (!wantsRecord && !wantsNotify))
    return {
        intent,
        wantsRecord,
        wantsAccount,
        wantsNotify,
        wantsDelete: intent === 'OFFBOARD' && DELETE_PATTERN.test(text),
        groupLabel: groupLabelOf(prompt),
        mappingTable: mappingTables.find((table) => DEPARTMENT_TABLE_PATTERN.test(table.name)) ?? null,
        chat,
        bitable,
        department,
    }
}

function answerFor({ answers, kind, pattern }: { answers: PlanAnswer[], kind: QuestionKind, pattern: RegExp }): ParsedAnswer {
    const given = answers.find((answer) => QUESTION_PREFIXES[kind].some((prefix) => answer.question.startsWith(prefix)))
    if (isNil(given) || given.answer.trim().length === 0) {
        return { value: null, rejected: null }
    }
    const matched = given.answer.match(pattern)
    const value = matched?.[1] ?? matched?.[0] ?? null
    return { value, rejected: isNil(value) ? given.answer.trim() : null }
}

function groupLabelOf(prompt: string): string | null {
    const label = prompt.match(/(HR|IT|人事|行政|财务)\s*群/i)?.[1]
    if (isNil(label)) {
        return null
    }
    return ASCII_LABEL.test(label) ? `${label.toUpperCase()} 群` : `${label}群`
}

function blueprintFor({ intent, facts, text }: { intent: Intent, facts: Facts, text: Text }): Blueprint {
    const departmentStep = facts.mappingTable !== null && (intent === 'ONBOARD' ? facts.wantsAccount : true) ? [departmentMapStep({ table: facts.mappingTable, text })] : []
    const trigger = triggerFor({ intent, text })
    if (intent === 'ONBOARD') {
        const record = facts.wantsRecord ? [recordStep({ facts, text })] : []
        const mapped = facts.wantsAccount ? departmentStep : []
        const account = facts.wantsAccount ? [provisionStep({ facts, text, mapStepIndex: mapped.length > 0 ? record.length + 1 : null })] : []
        const notify = facts.wantsNotify ? [notifyStep({ facts, text })] : []
        return {
            trigger,
            steps: [...record, ...mapped, ...account, ...notify],
            warnings: [
                ...(facts.wantsRecord ? [text.recordColumns] : []),
                ...departmentWarnings({ facts, text, needsDepartment: facts.wantsAccount }),
            ],
        }
    }
    const find = [findUserStep({ text })]
    if (intent === 'OFFBOARD') {
        return {
            trigger,
            steps: [...find, suspendStep({ text }), ...(facts.wantsNotify ? [notifyStep({ facts, text })] : [])],
            warnings: [text.notFoundFails, ...(facts.wantsDelete ? [text.noDelete] : [])],
        }
    }
    const mapped = departmentStep
    return {
        trigger,
        steps: [...find, ...mapped, updateDepartmentStep({ facts, text, mapStepIndex: mapped.length > 0 ? 2 : null }), ...(facts.wantsNotify ? [notifyStep({ facts, text })] : [])],
        warnings: [text.notFoundFails, ...departmentWarnings({ facts, text, needsDepartment: true })],
    }
}

function departmentWarnings({ facts, text, needsDepartment }: { facts: Facts, text: Text, needsDepartment: boolean }): string[] {
    if (!needsDepartment || facts.mappingTable !== null) {
        return []
    }
    return [facts.department.value === null ? text.noMappingTable : text.fixedDepartment]
}

function openQuestions({ facts, text }: { facts: Facts, text: Text }): string[] {
    const chat = facts.wantsNotify && facts.chat.value === null ? [text.questionChat(facts.groupLabel)] : []
    const bitable = facts.wantsRecord && facts.bitable.value === null ? [text.questionBitable] : []
    const needsDepartment = (facts.intent === 'ONBOARD' && facts.wantsAccount) || facts.intent === 'TRANSFER'
    const department = needsDepartment && facts.mappingTable === null && facts.department.value === null ? [text.questionDepartment(facts.intent)] : []
    return [...department, ...bitable, ...chat].slice(0, MAX_QUESTIONS)
}

function invalidAnswerWarnings({ facts, text }: { facts: Facts, text: Text }): string[] {
    return [
        ...(facts.chat.rejected === null ? [] : [text.invalidChat(facts.chat.rejected)]),
        ...(facts.bitable.rejected === null ? [] : [text.invalidBitable(facts.bitable.rejected)]),
        ...(facts.department.rejected === null ? [] : [text.invalidDepartment(facts.department.rejected)]),
    ]
}

function triggerFor({ intent, text }: { intent: Intent, text: Text }): StepDraft {
    const scope = SCOPES[intent]
    return {
        connector: BEISEN,
        name: 'employee_changed',
        displayName: text.triggerNames[intent],
        input: {
            statusScope: scope.statusScope,
            queryType: 2,
            timezone: 'Asia/Shanghai',
            ...(scope.changeTypes.length > 0 ? { filterColumn: 'recordInfo.changeTypeOID', filterValues: scope.changeTypes } : {}),
        },
    }
}

function recordStep({ facts, text }: { facts: Facts, text: Text }): StepDraft {
    return {
        connector: FEISHU,
        name: 'create_bitable_record',
        displayName: text.stepNames.record,
        input: {
            ...(facts.bitable.value === null ? {} : { appToken: facts.bitable.value }),
            fields: {
                [text.columns.name]: triggerRef('employeeInfo', 'name'),
                [text.columns.jobNumber]: triggerRef('recordInfo', 'jobNumber'),
                [text.columns.mobile]: triggerRef('employeeInfo', 'mobilePhone'),
                [text.columns.email]: triggerRef('employeeInfo', 'workEmail'),
                [text.columns.startDate]: triggerRef('recordInfo', 'startDate'),
            },
        },
    }
}

function departmentMapStep({ table, text }: { table: MappingTableSummary, text: Text }): StepDraft {
    return {
        connector: DATA_MAPPER,
        name: 'map_fields',
        displayName: text.stepNames.department,
        input: {
            mapping: { fields: [{ id: 'department', target: 'departmentId', source: triggerRef('recordInfo', 'oIdDepartment'), transforms: [{ type: 'LOOKUP', arg: table.id }] }] },
            failOnError: true,
        },
    }
}

function provisionStep({ facts, text, mapStepIndex }: { facts: Facts, text: Text, mapStepIndex: number | null }): StepDraft {
    return {
        connector: FEISHU,
        name: 'provision_user',
        displayName: text.stepNames.provision,
        input: {
            name: triggerRef('employeeInfo', 'name'),
            mobile: triggerRef('employeeInfo', 'mobilePhone'),
            ...departmentInput({ facts, mapStepIndex }),
            employeeType: 1,
            email: triggerRef('employeeInfo', 'workEmail'),
            employeeNo: triggerRef('recordInfo', 'jobNumber'),
        },
    }
}

function findUserStep({ text }: { text: Text }): StepDraft {
    return {
        connector: FEISHU,
        name: 'find_user',
        displayName: text.stepNames.find,
        input: { lookupBy: 'mobile', value: `+86${triggerRef('employeeInfo', 'mobilePhone')}` },
    }
}

function suspendStep({ text }: { text: Text }): StepDraft {
    return {
        connector: FEISHU,
        name: 'suspend_user',
        displayName: text.stepNames.suspend,
        input: { openId: "{{step_1['output']['open_id']}}" },
    }
}

function updateDepartmentStep({ facts, text, mapStepIndex }: { facts: Facts, text: Text, mapStepIndex: number | null }): StepDraft {
    return {
        connector: FEISHU,
        name: 'update_user',
        displayName: text.stepNames.update,
        input: { openId: "{{step_1['output']['open_id']}}", ...departmentInput({ facts, mapStepIndex }) },
    }
}

function notifyStep({ facts, text }: { facts: Facts, text: Text }): StepDraft {
    return {
        connector: FEISHU,
        name: 'send_group_message',
        displayName: text.stepNames.notify(facts.groupLabel),
        input: {
            ...(facts.chat.value === null ? {} : { chatId: facts.chat.value }),
            messageType: 'text',
            content: text.messages[facts.intent](triggerRef('employeeInfo', 'name'), triggerRef('recordInfo', 'jobNumber')),
        },
    }
}

function departmentInput({ facts, mapStepIndex }: { facts: Facts, mapStepIndex: number | null }): Record<string, string> {
    if (mapStepIndex !== null) {
        return { departmentId: `{{step_${mapStepIndex}['output']['departmentId']}}` }
    }
    return facts.department.value === null ? {} : { departmentId: facts.department.value }
}

function triggerRef(section: 'employeeInfo' | 'recordInfo', field: string): string {
    return `{{trigger['output']['${section}']['${field}']}}`
}

function validation(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

const BEISEN = '@fema-ipaas/connector-beisen'
const FEISHU = '@fema-ipaas/connector-feishu'
const DATA_MAPPER = '@fema-ipaas/connector-data-mapper'
const ASCII_LABEL = /^[A-Za-z]+$/
const CJK_PATTERN = /[一-鿿]/
const MAX_QUESTIONS = 3
const BEISEN_PATTERN = /北森|beisen/i
const INTENTS: Intent[] = ['OFFBOARD', 'TRANSFER', 'ONBOARD']
const INTENT_PATTERNS: Record<Intent, RegExp> = {
    OFFBOARD: /离职|辞职|离开公司|resign|offboard|\bleaves?\b|\bleft\b|terminat/,
    TRANSFER: /调岗|转岗|调动|换部门|调部门|transfer|department change/,
    ONBOARD: /入职|新员工|新人|onboard|new hire|\bhires?\b/,
}
const RECORD_PATTERN = /建档|多维表格|花名册|台账|bitable|roster/
const ACCOUNT_PATTERN = /账号|开通|开户|provision|account/
const NOTIFY_PATTERN = /通知|告知|提醒|发消息|发送消息|notify|message|tell/
const GROUP_PATTERN = /群|group/
const DELETE_PATTERN = /删除|注销|delete|remove/
const DEPARTMENT_TABLE_PATTERN = /部门|department/i
const CHAT_ID_PATTERN = /(oc_[A-Za-z0-9_-]+)/
const BITABLE_TOKEN_PATTERN = /(?:base\/)?([A-Za-z0-9]{12,})/
const DEPARTMENT_ID_PATTERN = /\b(od-[A-Za-z0-9]+)\b|^\s*(\d+)\s*$/
const SCOPES: Record<Intent, { statusScope: string, changeTypes: string[] }> = {
    ONBOARD: { statusScope: 'ONBOARDING', changeTypes: ['1', '2'] },
    OFFBOARD: { statusScope: 'LEFT', changeTypes: [] },
    TRANSFER: { statusScope: 'ACTIVE', changeTypes: ['7', '9'] },
}
const QUESTION_PREFIXES: Record<QuestionKind, string[]> = {
    chat: ['通知哪个飞书群', 'Which Feishu group'],
    bitable: ['建档写进哪张多维表格', 'Which Feishu bitable'],
    department: ['新员工放进哪个飞书部门', '调岗后放进哪个飞书部门', 'Which Feishu department'],
}

const ZH: Text = {
    unrecognized: '没有听出要做的事。规则规划目前只认识北森员工的入职、离职和调岗，请写明「哪个系统、什么事件、要做什么」。配置模型连接后可以规划更多场景。',
    sourceUnavailable: (systems) => `描述里提到的「${systems.join('」「')}」在这个实例里没有对应的连接器，无法确定由哪个系统触发。请写明触发的系统（例如北森），或让管理员先安装对应的连接器。`,
    triggerMissing: '这个实例里没有北森连接器，规则规划无法搭出触发器。请让管理员先安装北森连接器。',
    omitted: '有些步骤用到的连接器在这个实例里没有，没有生成。可以在编辑器里用「发送 HTTP 请求」调用对方接口。',
    names: { ONBOARD: '员工入职开通飞书账号', OFFBOARD: '员工离职暂停飞书账号', TRANSFER: '员工调岗同步飞书部门' },
    triggerNames: { ONBOARD: '北森员工入职', OFFBOARD: '北森员工离职', TRANSFER: '北森员工调岗' },
    stepNames: {
        record: '在飞书多维表格建档',
        department: '部门对照',
        provision: '开通飞书账号',
        find: '按手机号找飞书账号',
        suspend: '暂停飞书账号',
        update: '更新飞书部门',
        notify: (label) => `通知${label ?? '群'}`,
    },
    columns: { name: '姓名', jobNumber: '工号', mobile: '手机号', email: '邮箱', startDate: '入职日期' },
    messages: {
        ONBOARD: (name, jobNumber) => `${name}（工号 ${jobNumber}）已入职，飞书账号已开通`,
        OFFBOARD: (name, jobNumber) => `${name}（工号 ${jobNumber}）已离职，飞书账号已暂停，请回收设备`,
        TRANSFER: (name, jobNumber) => `${name}（工号 ${jobNumber}）已调岗，飞书部门已同步`,
    },
    summary: ({ intent, stepNames, mappingTable }) => `北森出现${INTENT_LABELS_ZH[intent]}的员工后，依次：${stepNames.join('、')}。${mappingTable === null ? '' : `部门按映射表「${mappingTable}」对照。`}`,
    recordColumns: '建档的列名按「姓名、工号、手机号、邮箱、入职日期」预填，和你的表头不一致时在编辑器里改。',
    noMappingTable: '项目里还没有部门对照表。北森的部门编号和飞书的部门 ID 不是一回事：先在「映射表」里建一张，再重新规划；或者回答下面的问题，先用一个固定部门。',
    fixedDepartment: '所有员工都会放进同一个飞书部门。要按部门对应，请先在「映射表」里建一张部门对照表，再重新规划。',
    notFoundFails: '飞书里找不到这个人时，后面的步骤会失败并进入问题中心。需要跳过的话，在编辑器里加一个条件分支。',
    noDelete: '平台不提供删除飞书账号：离职当天先暂停账号（数据保留、可恢复），缓冲期后由飞书管理员交接并删除。',
    questionChat: (label) => `通知哪个飞书群？请给出${label ?? '群'}的群 ID（以 oc_ 开头，机器人必须已在群里）`,
    questionBitable: '建档写进哪张多维表格？请给出多维表格的链接或 appToken',
    questionDepartment: (intent) => (intent === 'TRANSFER' ? '调岗后放进哪个飞书部门？请给出飞书部门 ID（没有部门对照表时先用固定部门）' : '新员工放进哪个飞书部门？请给出飞书部门 ID（没有部门对照表时先用固定部门）'),
    invalidChat: (answer) => `「${answer}」不像飞书群 ID（以 oc_ 开头），群还没有填。`,
    invalidBitable: (answer) => `「${answer}」不像多维表格的链接或 appToken，建档的表格还没有填。`,
    invalidDepartment: (answer) => `「${answer}」不像飞书部门 ID（od- 开头或纯数字），部门还没有填。`,
}

const EN: Text = {
    unrecognized: 'Could not tell what to automate. Rule-based planning only understands Beisen employee onboarding, offboarding and transfers; name the system, the event and the action. Connect a model to plan more scenarios.',
    sourceUnavailable: (systems) => `"${systems.join('", "')}" has no connector in this instance, so the trigger system is unclear. Name the system that starts the workflow (for example Beisen), or ask an admin to install the connector.`,
    triggerMissing: 'This instance has no Beisen connector, so rule-based planning cannot build a trigger. Ask an admin to install it.',
    omitted: 'Some steps need connectors that this instance does not have, so they were left out. Use "Send HTTP request" in the editor to call their API.',
    names: { ONBOARD: 'Employee onboarding: create Feishu account', OFFBOARD: 'Employee offboarding: suspend Feishu account', TRANSFER: 'Employee transfer: sync Feishu department' },
    triggerNames: { ONBOARD: 'Beisen employee onboarded', OFFBOARD: 'Beisen employee left', TRANSFER: 'Beisen employee transferred' },
    stepNames: {
        record: 'Create bitable record',
        department: 'Map department',
        provision: 'Create Feishu account',
        find: 'Find Feishu account by mobile',
        suspend: 'Suspend Feishu account',
        update: 'Update Feishu department',
        notify: (label) => `Notify ${label ?? 'group'}`,
    },
    columns: { name: 'Name', jobNumber: 'Employee number', mobile: 'Mobile', email: 'Email', startDate: 'Start date' },
    messages: {
        ONBOARD: (name, jobNumber) => `${name} (no. ${jobNumber}) has joined, Feishu account created`,
        OFFBOARD: (name, jobNumber) => `${name} (no. ${jobNumber}) has left, Feishu account suspended, please collect equipment`,
        TRANSFER: (name, jobNumber) => `${name} (no. ${jobNumber}) has transferred, Feishu department synced`,
    },
    summary: ({ intent, stepNames, mappingTable }) => `After Beisen reports a ${INTENT_LABELS_EN[intent]} employee: ${stepNames.join(', ')}.${mappingTable === null ? '' : ` Departments are mapped with the table "${mappingTable}".`}`,
    recordColumns: 'The record columns are prefilled as Name, Employee number, Mobile, Email, Start date. Rename them in the editor if your table differs.',
    noMappingTable: 'This project has no department mapping table. Beisen department codes are not Feishu department IDs: create a mapping table and plan again, or answer the question below to use one fixed department.',
    fixedDepartment: 'Every employee goes into the same Feishu department. To map by department, create a department mapping table and plan again.',
    notFoundFails: 'When the person has no Feishu account the later steps fail and show up in the problem center. Add a condition in the editor to skip them.',
    noDelete: 'The platform does not delete Feishu accounts: the account is suspended on the leaving day (data kept, reversible), and a Feishu admin hands over and deletes it after the buffer period.',
    questionChat: (label) => `Which Feishu group should be notified? Give the chat ID of the ${label ?? 'group'} (starts with oc_, the bot must be in the group)`,
    questionBitable: 'Which Feishu bitable should the record go into? Give its link or appToken',
    questionDepartment: (intent) => (intent === 'TRANSFER' ? 'Which Feishu department after the transfer? Give a department ID (a fixed one until a mapping table exists)' : 'Which Feishu department should new hires join? Give a department ID (a fixed one until a mapping table exists)'),
    invalidChat: (answer) => `"${answer}" does not look like a Feishu chat ID (starts with oc_), so the group is still empty.`,
    invalidBitable: (answer) => `"${answer}" does not look like a bitable link or appToken, so the table is still empty.`,
    invalidDepartment: (answer) => `"${answer}" does not look like a Feishu department ID (od-… or digits), so the department is still empty.`,
}

const TEXTS: Record<Language, Text> = { zh: ZH, en: EN }
const INTENT_LABELS_ZH: Record<Intent, string> = { ONBOARD: '入职', OFFBOARD: '离职', TRANSFER: '调岗' }
const INTENT_LABELS_EN: Record<Intent, string> = { ONBOARD: 'new-hire', OFFBOARD: 'leaving', TRANSFER: 'transferred' }

type Intent = 'ONBOARD' | 'OFFBOARD' | 'TRANSFER'
type Language = 'zh' | 'en'
type QuestionKind = 'chat' | 'bitable' | 'department'

type ParsedAnswer = {
    value: string | null
    rejected: string | null
}

type Facts = {
    intent: Intent
    wantsRecord: boolean
    wantsAccount: boolean
    wantsNotify: boolean
    wantsDelete: boolean
    groupLabel: string | null
    mappingTable: MappingTableSummary | null
    chat: ParsedAnswer
    bitable: ParsedAnswer
    department: ParsedAnswer
}

type Blueprint = {
    trigger: StepDraft
    steps: StepDraft[]
    warnings: string[]
}

type Text = {
    unrecognized: string
    sourceUnavailable: (systems: string[]) => string
    triggerMissing: string
    omitted: string
    names: Record<Intent, string>
    triggerNames: Record<Intent, string>
    stepNames: {
        record: string
        department: string
        provision: string
        find: string
        suspend: string
        update: string
        notify: (label: string | null) => string
    }
    columns: { name: string, jobNumber: string, mobile: string, email: string, startDate: string }
    messages: Record<Intent, (name: string, jobNumber: string) => string>
    summary: (params: { intent: Intent, stepNames: string[], mappingTable: string | null }) => string
    recordColumns: string
    noMappingTable: string
    fixedDepartment: string
    notFoundFails: string
    noDelete: string
    questionChat: (label: string | null) => string
    questionBitable: string
    questionDepartment: (intent: Intent) => string
    invalidChat: (answer: string) => string
    invalidBitable: (answer: string) => string
    invalidDepartment: (answer: string) => string
}

type PlanParams = {
    prompt: string
    answers: PlanAnswer[]
    catalog: CatalogEntry[]
    connections: ConnectionRef[]
    mappingTables: MappingTableSummary[]
    unavailableSystems: string[]
}
