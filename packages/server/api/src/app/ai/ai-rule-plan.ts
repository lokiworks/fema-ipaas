import {
    ApplicationError,
    ErrorCode,
    isNil,
    MappingTableSummary,
    PlanAnswer,
    PlanDedupe,
    PlanMappingTableHint,
    PlanTemplate,
    WorkflowPlan,
    WorkflowPlanSource,
} from '@fema-ipaas/shared'
import { aiPlanSteps, CatalogEntry, ConnectionRef, StepDraft } from './ai-plan-steps'
import { aiRuleScenarios, ScenarioBlueprint, ScenarioFacts, ScenarioIntent } from './ai-rule-scenarios'

export const aiRulePlanner = {
    plan,
    templates,
}

function plan({ prompt, answers, catalog, connections, mappingTables, unavailableSystems, excluded }: PlanParams): WorkflowPlan {
    const language: Language = CJK_PATTERN.test(prompt) ? 'zh' : 'en'
    const text = TEXTS[language]
    const intent = detectIntent(prompt)
    if (isNil(intent)) {
        throw validation(text.unrecognized)
    }
    if (unavailableSystems.length > 0 && !TRIGGER_SYSTEM_PATTERNS[intent].test(prompt)) {
        throw validation(text.sourceUnavailable(unavailableSystems))
    }
    const blueprint = blueprintOf({ prompt, answers, mappingTables, intent, language, excluded })
    const assembled = aiPlanSteps.assemble({ trigger: blueprint.trigger, steps: blueprint.steps, catalog, connections, excluded })
    if (isNil(assembled.trigger)) {
        throw validation(text.triggerMissing(blueprint.trigger.connector))
    }
    return {
        displayName: blueprint.displayName,
        summary: blueprint.summary(assembled.steps.map((step) => step.displayName)),
        source: WorkflowPlanSource.RULES,
        trigger: assembled.trigger,
        steps: assembled.steps,
        questions: blueprint.questions.slice(0, MAX_QUESTIONS),
        warnings: [...new Set([
            ...blueprint.warnings,
            ...(assembled.omittedSteps > 0 ? [text.omitted] : []),
            ...assembled.brokenReferences.map((name) => text.brokenReference(name)),
        ])],
        unavailableSystems,
        omittedSteps: assembled.omittedSteps,
        recommendations: [],
        dedupe: blueprint.dedupe,
        missingMappingTable: blueprint.missingMappingTable,
        removedSteps: assembled.removedSteps,
    }
}

function templates({ prompt }: { prompt: string }): PlanTemplate[] {
    const language: Language = CJK_PATTERN.test(prompt) ? 'zh' : 'en'
    return aiRuleScenarios.closestTemplates({ prompt, language, limit: CLOSEST_TEMPLATES })
}

function blueprintOf({ prompt, answers, mappingTables, intent, language, excluded }: { prompt: string, answers: PlanAnswer[], mappingTables: MappingTableSummary[], intent: Intent, language: Language, excluded: string[] }): ScenarioBlueprint {
    const text = TEXTS[language]
    const dropped = new Set(excluded.map((key) => key.split('/').pop() ?? key))
    if (isScenarioIntent(intent)) {
        return aiRuleScenarios.blueprint({ intent, language, facts: scenarioFacts({ prompt, answers, dropped }) })
    }
    const facts = readFacts({ prompt, answers, mappingTables, intent, dropped })
    const blueprint = blueprintFor({ intent, facts, text })
    return {
        displayName: text.names[intent],
        trigger: blueprint.trigger,
        steps: blueprint.steps,
        summary: (stepNames) => text.summary({ intent, stepNames, mappingTable: facts.mappingTable?.name ?? null }),
        warnings: [...blueprint.warnings, ...invalidAnswerWarnings({ facts, text })],
        dedupe: dedupeFor({ intent, text }),
        missingMappingTable: missingTableFor({ facts, text }),
        questions: openQuestions({ facts, text }),
    }
}

function scenarioFacts({ prompt, answers, dropped }: { prompt: string, answers: PlanAnswer[], dropped: Set<string> }): ScenarioFacts {
    const text = prompt.toLowerCase()
    return {
        prompt,
        recordKept: !dropped.has('create_bitable_record'),
        notifyKept: !dropped.has('send_group_message'),
        wantsNotify: NOTIFY_PATTERN.test(text) || GROUP_PATTERN.test(text),
        groupLabel: groupLabelOf(prompt),
        chat: answerFor({ answers, kind: 'chat', pattern: CHAT_ID_PATTERN }),
        bitable: answerFor({ answers, kind: 'bitable', pattern: BITABLE_TOKEN_PATTERN }),
        eventType: eventTypeAnswer({ answers }),
    }
}

function eventTypeAnswer({ answers }: { answers: PlanAnswer[] }): ParsedAnswer {
    const given = answers.find((answer) => QUESTION_PREFIXES.eventType.some((prefix) => answer.question.startsWith(prefix)))
    const answer = given?.answer.trim() ?? ''
    if (answer.length === 0) {
        return { value: null, rejected: null }
    }
    if (ANY_EVENT_PATTERN.test(answer)) {
        return { value: '', rejected: null }
    }
    const matched = answer.match(EVENT_TYPE_PATTERN)
    return matched === null ? { value: null, rejected: answer } : { value: matched[1], rejected: null }
}

function dedupeFor({ intent, text }: { intent: HrIntent, text: Text }): PlanDedupe {
    const withDate = intent === 'TRANSFER'
    return {
        keyPath: withDate ? '{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.startDate}}' : 'recordInfo.jobNumber',
        keyLabel: withDate ? text.jobNumberAndDate : text.jobNumber,
        windowSeconds: THIRTY_DAYS_SECONDS,
        reason: text.dedupeReasons[intent],
    }
}

function missingTableFor({ facts, text }: { facts: Facts, text: Text }): PlanMappingTableHint | null {
    return needsDepartmentOf({ facts }) && facts.mappingTable === null ? text.mappingTableHint : null
}

function isScenarioIntent(intent: Intent): intent is ScenarioIntent {
    return intent === 'ARCHIVE' || intent === 'FEISHU_EVENT' || intent === 'RECONCILE'
}

function detectIntent(prompt: string): Intent | null {
    const text = prompt.toLowerCase()
    const hr = HR_INTENTS
        .map((intent) => ({ intent, index: text.search(INTENT_PATTERNS[intent]) }))
        .filter((hit) => hit.index >= 0)
    const scenario = aiRuleScenarios.detect(prompt)
    const hits = [...hr, ...(isNil(scenario) ? [] : [scenario])].sort((a, b) => a.index - b.index)
    return hits[0]?.intent ?? null
}

function readFacts({ prompt, answers, mappingTables, intent, dropped }: { prompt: string, answers: PlanAnswer[], mappingTables: MappingTableSummary[], intent: HrIntent, dropped: Set<string> }): Facts {
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
        kept: {
            record: !dropped.has('create_bitable_record'),
            account: !dropped.has('provision_user'),
            update: !dropped.has('update_user'),
            notify: !dropped.has('send_group_message'),
            find: !dropped.has('find_user'),
            suspend: !dropped.has('suspend_user'),
        },
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

function blueprintFor({ intent, facts, text }: { intent: HrIntent, facts: Facts, text: Text }): Blueprint {
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
                ...(facts.wantsRecord && facts.kept.record ? [text.recordColumns] : []),
                ...departmentWarnings({ facts, text, needsDepartment: facts.wantsAccount && facts.kept.account }),
            ],
        }
    }
    const find = [findUserStep({ text })]
    if (intent === 'OFFBOARD') {
        return {
            trigger,
            steps: [...find, suspendStep({ text }), ...(facts.wantsNotify ? [notifyStep({ facts, text })] : [])],
            warnings: [...(facts.kept.find ? [text.notFoundFails] : []), ...(facts.wantsDelete && facts.kept.suspend ? [text.noDelete] : [])],
        }
    }
    const mapped = departmentStep
    return {
        trigger,
        steps: [...find, ...mapped, updateDepartmentStep({ facts, text, mapStepIndex: mapped.length > 0 ? 2 : null }), ...(facts.wantsNotify ? [notifyStep({ facts, text })] : [])],
        warnings: [...(facts.kept.find ? [text.notFoundFails] : []), ...departmentWarnings({ facts, text, needsDepartment: facts.kept.update })],
    }
}

function departmentWarnings({ facts, text, needsDepartment }: { facts: Facts, text: Text, needsDepartment: boolean }): string[] {
    if (!needsDepartment || facts.mappingTable !== null) {
        return []
    }
    return [facts.department.value === null ? text.noMappingTable : text.fixedDepartment]
}

function openQuestions({ facts, text }: { facts: Facts, text: Text }): string[] {
    const chat = facts.wantsNotify && facts.kept.notify && facts.chat.value === null ? [text.questionChat(facts.groupLabel)] : []
    const bitable = facts.wantsRecord && facts.kept.record && facts.bitable.value === null ? [text.questionBitable] : []
    const needsDepartment = needsDepartmentOf({ facts })
    const department = needsDepartment && facts.mappingTable === null && facts.department.value === null ? [text.questionDepartment(facts.intent)] : []
    return [...department, ...bitable, ...chat].slice(0, MAX_QUESTIONS)
}

function needsDepartmentOf({ facts }: { facts: Facts }): boolean {
    return (facts.intent === 'ONBOARD' && facts.wantsAccount && facts.kept.account) || (facts.intent === 'TRANSFER' && facts.kept.update)
}

function invalidAnswerWarnings({ facts, text }: { facts: Facts, text: Text }): string[] {
    return [
        ...(facts.chat.rejected === null ? [] : [text.invalidChat(facts.chat.rejected)]),
        ...(facts.bitable.rejected === null ? [] : [text.invalidBitable(facts.bitable.rejected)]),
        ...(facts.department.rejected === null ? [] : [text.invalidDepartment(facts.department.rejected)]),
    ]
}

function triggerFor({ intent, text }: { intent: HrIntent, text: Text }): StepDraft {
    const scope = SCOPES[intent]
    return {
        connector: BEISEN,
        name: 'employee_changed',
        displayName: text.triggerNames[intent],
        input: {
            statusScope: scope.statusScope,
            queryType: 2,
            timezone: 'Asia/Shanghai',
            ...(scope.changeTypes.length > 0 ? { changeTypes: scope.changeTypes } : {}),
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
        input: { openId: '{{step_1[\'output\'][\'open_id\']}}' },
    }
}

function updateDepartmentStep({ facts, text, mapStepIndex }: { facts: Facts, text: Text, mapStepIndex: number | null }): StepDraft {
    return {
        connector: FEISHU,
        name: 'update_user',
        displayName: text.stepNames.update,
        input: { openId: '{{step_1[\'output\'][\'open_id\']}}', ...departmentInput({ facts, mapStepIndex }) },
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
const HR_INTENTS: HrIntent[] = ['OFFBOARD', 'TRANSFER', 'ONBOARD']
const FEISHU_PATTERN = /飞书|feishu|lark/i
const TRIGGER_SYSTEM_PATTERNS: Record<Intent, RegExp> = {
    ONBOARD: BEISEN_PATTERN,
    OFFBOARD: BEISEN_PATTERN,
    TRANSFER: BEISEN_PATTERN,
    ARCHIVE: BEISEN_PATTERN,
    RECONCILE: BEISEN_PATTERN,
    FEISHU_EVENT: FEISHU_PATTERN,
}
const INTENT_PATTERNS: Record<HrIntent, RegExp> = {
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
const EVENT_TYPE_PATTERN = /([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)/
const ANY_EVENT_PATTERN = /^(不限|所有|全部|任意|all|any|every)/i
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60
const CLOSEST_TEMPLATES = 3
const SCOPES: Record<HrIntent, { statusScope: string, changeTypes: string[] }> = {
    ONBOARD: { statusScope: 'ONBOARDING', changeTypes: ['1', '2'] },
    OFFBOARD: { statusScope: 'LEFT', changeTypes: [] },
    TRANSFER: { statusScope: 'ACTIVE', changeTypes: ['7', '9'] },
}
const QUESTION_PREFIXES: Record<QuestionKind, string[]> = {
    chat: ['通知哪个飞书群', 'Which Feishu group'],
    bitable: ['建档写进哪张多维表格', 'Which Feishu bitable'],
    department: ['新员工放进哪个飞书部门', '调岗后放进哪个飞书部门', 'Which Feishu department'],
    eventType: ['要响应哪类飞书事件', 'Which Feishu event type'],
}

const ZH: Text = {
    unrecognized: '没有听出要做的事。规则规划认识这几类：北森员工的入职、离职、调岗、信息变更归档，飞书事件通知到群，以及每天对账提醒。请写明「哪个系统、什么事件、要做什么」，或从下面最接近的模板里选一个。配置模型连接后可以规划更多场景。',
    sourceUnavailable: (systems) => `描述里提到的「${systems.join('」「')}」在这个实例里没有对应的连接器，无法确定由哪个系统触发。请写明触发的系统（例如北森），或让管理员先安装对应的连接器。`,
    triggerMissing: (connector) => `这个实例里没有${connector === FEISHU ? '飞书' : '北森'}连接器，规则规划无法搭出触发器。请让管理员先安装${connector === FEISHU ? '飞书' : '北森'}连接器。`,
    omitted: '有些步骤用到的连接器在这个实例里没有，没有生成。可以在编辑器里用「发送 HTTP 请求」调用对方接口。',
    brokenReference: (stepName) => `「${stepName}」引用过没有生成或已移除的步骤的输出，这些引用已留空，需要在编辑器里补填。`,
    jobNumber: '工号',
    jobNumberAndDate: '工号加生效日期',
    dedupeReasons: {
        ONBOARD: '同一个工号 30 天内只开通一次账号，北森重复返回同一条入职记录时不会再开一次',
        OFFBOARD: '同一个工号 30 天内只处理一次离职，北森重复返回同一条离职记录时不会再处理一次',
        TRANSFER: '同一个工号、同一个生效日期，30 天内只同步一次调岗；同一个人再次调岗（生效日期不同）仍会处理',
    },
    mappingTableHint: { name: '部门对照', keyLabel: '北森部门编号', valueLabel: '飞书部门 ID' },
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
    notFoundFails: '飞书里找不到这个人时，后面的步骤会失败并生成问题，在「问题」页处理。需要跳过的话，在编辑器里加一个条件分支。',
    noDelete: '平台不提供删除飞书账号：离职当天先暂停账号（数据保留、可恢复），缓冲期后由飞书管理员交接并删除。',
    questionChat: (label) => `通知哪个飞书群？请给出${label ?? '群'}的群 ID（以 oc_ 开头，机器人必须已在群里）`,
    questionBitable: '建档写进哪张多维表格？请给出多维表格的链接或 appToken',
    questionDepartment: (intent) => (intent === 'TRANSFER' ? '调岗后放进哪个飞书部门？请给出飞书部门 ID（没有部门对照表时先用固定部门）' : '新员工放进哪个飞书部门？请给出飞书部门 ID（没有部门对照表时先用固定部门）'),
    invalidChat: (answer) => `「${answer}」不像飞书群 ID（以 oc_ 开头），群还没有填。`,
    invalidBitable: (answer) => `「${answer}」不像多维表格的链接或 appToken，建档的表格还没有填。`,
    invalidDepartment: (answer) => `「${answer}」不像飞书部门 ID（od- 开头或纯数字），部门还没有填。`,
}

const EN: Text = {
    unrecognized: 'Could not tell what to automate. Rule-based planning understands Beisen employee onboarding, offboarding, transfers and info-change archiving, Feishu events to a group, and a daily reconciliation reminder. Name the system, the event and the action, or pick the closest template below. Connect a model to plan more scenarios.',
    sourceUnavailable: (systems) => `"${systems.join('", "')}" has no connector in this instance, so the trigger system is unclear. Name the system that starts the workflow (for example Beisen), or ask an admin to install the connector.`,
    triggerMissing: (connector) => `This instance has no ${connector === FEISHU ? 'Feishu' : 'Beisen'} connector, so rule-based planning cannot build a trigger. Ask an admin to install it.`,
    omitted: 'Some steps need connectors that this instance does not have, so they were left out. Use "Send HTTP request" in the editor to call their API.',
    brokenReference: (stepName) => `"${stepName}" referred to the output of a step that was not generated or was removed. Those references were left empty; fill them in the editor.`,
    jobNumber: 'employee number',
    jobNumberAndDate: 'employee number plus effective date',
    dedupeReasons: {
        ONBOARD: 'The same employee number gets an account once within 30 days, even if Beisen returns the same onboarding record again',
        OFFBOARD: 'The same employee number is handled once within 30 days, even if Beisen returns the same leaving record again',
        TRANSFER: 'The same employee number and effective date is synced once within 30 days; a later transfer of the same person (another effective date) is still handled',
    },
    mappingTableHint: { name: 'Department mapping', keyLabel: 'Beisen department code', valueLabel: 'Feishu department ID' },
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
const INTENT_LABELS_ZH: Record<HrIntent, string> = { ONBOARD: '入职', OFFBOARD: '离职', TRANSFER: '调岗' }
const INTENT_LABELS_EN: Record<HrIntent, string> = { ONBOARD: 'new-hire', OFFBOARD: 'leaving', TRANSFER: 'transferred' }

type HrIntent = 'ONBOARD' | 'OFFBOARD' | 'TRANSFER'
type Intent = HrIntent | ScenarioIntent
type Language = 'zh' | 'en'
type QuestionKind = 'chat' | 'bitable' | 'department' | 'eventType'

type ParsedAnswer = {
    value: string | null
    rejected: string | null
}

type Facts = {
    intent: HrIntent
    wantsRecord: boolean
    wantsAccount: boolean
    wantsNotify: boolean
    wantsDelete: boolean
    kept: { record: boolean, account: boolean, update: boolean, notify: boolean, find: boolean, suspend: boolean }
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
    triggerMissing: (connector: string) => string
    omitted: string
    brokenReference: (stepName: string) => string
    jobNumber: string
    jobNumberAndDate: string
    dedupeReasons: Record<HrIntent, string>
    mappingTableHint: PlanMappingTableHint
    names: Record<HrIntent, string>
    triggerNames: Record<HrIntent, string>
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
    messages: Record<HrIntent, (name: string, jobNumber: string) => string>
    summary: (params: { intent: HrIntent, stepNames: string[], mappingTable: string | null }) => string
    recordColumns: string
    noMappingTable: string
    fixedDepartment: string
    notFoundFails: string
    noDelete: string
    questionChat: (label: string | null) => string
    questionBitable: string
    questionDepartment: (intent: HrIntent) => string
    invalidChat: (answer: string) => string
    invalidBitable: (answer: string) => string
    invalidDepartment: (answer: string) => string
}

type PlanParams = {
    excluded: string[]
    prompt: string
    answers: PlanAnswer[]
    catalog: CatalogEntry[]
    connections: ConnectionRef[]
    mappingTables: MappingTableSummary[]
    unavailableSystems: string[]
}
