import { PlanDedupe, PlanMappingTableHint, PlanTemplate } from '@fema-ipaas/shared'
import { StepDraft } from './ai-plan-steps'

function detect(prompt: string): { intent: ScenarioIntent, index: number } | null {
    const text = prompt.toLowerCase()
    const hits = SCENARIO_INTENTS
        .map((intent) => ({ intent, index: text.search(SCENARIO_PATTERNS[intent]) }))
        .filter((hit) => hit.index >= 0)
        .sort((a, b) => a.index - b.index)
    return hits[0] ?? null
}

function blueprint({ intent, language, facts }: { intent: ScenarioIntent, language: ScenarioLanguage, facts: ScenarioFacts }): ScenarioBlueprint {
    const text = SCENARIO_TEXTS[language]
    switch (intent) {
        case 'ARCHIVE':
            return archiveBlueprint({ facts, text })
        case 'FEISHU_EVENT':
            return feishuEventBlueprint({ facts, text })
        case 'RECONCILE':
            return reconcileBlueprint({ facts, text })
    }
}

function archiveBlueprint({ facts, text }: { facts: ScenarioFacts, text: ScenarioText }): ScenarioBlueprint {
    const record: StepDraft = {
        connector: FEISHU,
        name: 'create_bitable_record',
        displayName: text.archive.recordStep,
        input: {
            ...(facts.bitable.value === null ? {} : { appToken: facts.bitable.value }),
            fields: {
                [text.archive.columns.name]: triggerRef('employeeInfo', 'name'),
                [text.archive.columns.jobNumber]: triggerRef('recordInfo', 'jobNumber'),
                [text.archive.columns.mobile]: triggerRef('employeeInfo', 'mobilePhone'),
                [text.archive.columns.email]: triggerRef('employeeInfo', 'workEmail'),
                [text.archive.columns.changeType]: triggerRef('recordInfo', 'changeTypeOID'),
                [text.archive.columns.effectiveDate]: triggerRef('recordInfo', 'startDate'),
            },
        },
    }
    const notify: StepDraft[] = facts.wantsNotify ? [notifyStep({ facts, displayName: text.notifyStep(facts.groupLabel), content: text.archive.message })] : []
    return {
        displayName: text.archive.name,
        trigger: {
            connector: BEISEN,
            name: 'employee_changed',
            displayName: text.archive.trigger,
            input: { statusScope: 'ACTIVE', queryType: 2, timezone: 'Asia/Shanghai' },
        },
        steps: [record, ...notify],
        summary: (stepNames) => text.archive.summary(stepNames),
        warnings: [text.archive.columnsWarning, text.archive.dedupeWarning],
        dedupe: {
            keyPath: '{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.startDate}}',
            keyLabel: text.jobNumberAndDate,
            windowSeconds: ONE_DAY_SECONDS,
            reason: text.archive.dedupeReason,
        },
        missingMappingTable: null,
        questions: [
            ...(facts.recordKept && facts.bitable.value === null ? [text.questionBitable] : []),
            ...(facts.wantsNotify && facts.notifyKept && facts.chat.value === null ? [text.questionChat(facts.groupLabel)] : []),
        ],
    }
}

function feishuEventBlueprint({ facts, text }: { facts: ScenarioFacts, text: ScenarioText }): ScenarioBlueprint {
    const eventType = facts.eventType.value ?? ''
    return {
        displayName: text.event.name,
        trigger: {
            connector: FEISHU,
            name: 'event_received',
            displayName: text.event.trigger,
            input: eventType.length > 0 ? { eventType } : {},
        },
        steps: [notifyStep({ facts, displayName: text.notifyStep(facts.groupLabel), content: text.event.message })],
        summary: (stepNames) => text.event.summary(stepNames),
        warnings: [text.event.setup, text.event.token],
        dedupe: {
            keyPath: 'header.event_id',
            keyLabel: text.eventId,
            windowSeconds: ONE_DAY_SECONDS,
            reason: text.event.dedupeReason,
        },
        missingMappingTable: null,
        questions: [
            ...(facts.eventType.value === null ? [text.questionEventType] : []),
            ...(facts.notifyKept && facts.chat.value === null ? [text.questionChat(facts.groupLabel)] : []),
        ],
    }
}

function reconcileBlueprint({ facts, text }: { facts: ScenarioFacts, text: ScenarioText }): ScenarioBlueprint {
    const scope = reconcileScope(facts.prompt)
    return {
        displayName: text.reconcile.name(scope),
        trigger: {
            connector: SCHEDULE,
            name: 'every_day',
            displayName: text.reconcile.trigger,
            input: { hour_of_the_day: RECONCILE_HOUR, timezone: 'Asia/Shanghai', run_on_weekends: true },
        },
        steps: [
            {
                connector: DATE_HELPER,
                name: 'get_current_date',
                displayName: text.reconcile.now,
                input: { timeFormat: DATE_TIME_FORMAT, timeZone: 'Asia/Shanghai' },
            },
            {
                connector: DATE_HELPER,
                name: 'add_subtract_date',
                displayName: text.reconcile.windowStart,
                input: {
                    inputDate: '{{step_1[\'output\'][\'result\']}}',
                    inputDateFormat: DATE_TIME_FORMAT,
                    outputFormat: DATE_TIME_FORMAT,
                    expression: '- 1 day',
                    timeZone: 'Asia/Shanghai',
                },
            },
            {
                connector: BEISEN,
                name: 'search_changed_employees',
                displayName: text.reconcile.search(scope),
                input: {
                    startTime: '{{step_2[\'output\'][\'result\']}}',
                    stopTime: '{{step_1[\'output\'][\'result\']}}',
                    statusScope: scope,
                    queryType: 2,
                },
            },
            notifyStep({ facts, displayName: text.notifyStep(facts.groupLabel), content: text.reconcile.message(scope) }),
        ],
        summary: (stepNames) => text.reconcile.summary({ scope, stepNames }),
        warnings: [text.reconcile.summaryOnly, text.reconcile.schedule],
        dedupe: null,
        missingMappingTable: null,
        questions: facts.notifyKept && facts.chat.value === null ? [text.questionChat(facts.groupLabel)] : [],
    }
}

function notifyStep({ facts, displayName, content }: { facts: ScenarioFacts, displayName: string, content: string }): StepDraft {
    return {
        connector: FEISHU,
        name: 'send_group_message',
        displayName,
        input: {
            ...(facts.chat.value === null ? {} : { chatId: facts.chat.value }),
            messageType: 'text',
            content,
        },
    }
}

function reconcileScope(prompt: string): ReconcileScope {
    if (/离职|resign|offboard|\bleft\b/i.test(prompt)) {
        return 'LEFT'
    }
    if (/入职|新员工|onboard|new hire/i.test(prompt)) {
        return 'ONBOARDING'
    }
    return 'ACTIVE'
}

function templates({ language }: { language: ScenarioLanguage }): PlanTemplate[] {
    return TEMPLATE_ORDER.map((id) => ({ id, ...SCENARIO_TEXTS[language].templates[id] }))
}

function closestTemplates({ prompt, language, limit }: { prompt: string, language: ScenarioLanguage, limit: number }): PlanTemplate[] {
    const text = prompt.toLowerCase()
    return TEMPLATE_ORDER
        .map((id, order) => ({ id, order, score: TEMPLATE_KEYWORDS[id].filter((keyword) => text.includes(keyword)).length }))
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .slice(0, limit)
        .map(({ id }) => ({ id, ...SCENARIO_TEXTS[language].templates[id] }))
}

function triggerRef(section: 'employeeInfo' | 'recordInfo', field: string): string {
    return `{{trigger['output']['${section}']['${field}']}}`
}

export const aiRuleScenarios = {
    detect,
    blueprint,
    templates,
    closestTemplates,
}

const BEISEN = '@fema-ipaas/connector-beisen'
const FEISHU = '@fema-ipaas/connector-feishu'
const SCHEDULE = '@fema-ipaas/connector-schedule'
const DATE_HELPER = '@fema-ipaas/connector-date-helper'
const DATE_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss'
const RECONCILE_HOUR = 8
const ONE_DAY_SECONDS = 24 * 60 * 60

const SCENARIO_INTENTS: ScenarioIntent[] = ['FEISHU_EVENT', 'RECONCILE', 'ARCHIVE']
const SCENARIO_PATTERNS: Record<ScenarioIntent, RegExp> = {
    FEISHU_EVENT: /飞书(里|中|上)?(的)?(事件|消息事件|机器人)|飞书.{0,8}(收到|推送|订阅)|feishu event|lark event/,
    RECONCILE: /对账|核对|比对|校对|reconcil/,
    ARCHIVE: /信息变更|信息变动|资料变更|变更记录|归档|存档|档案|archive|profile change|info change|record change/,
}
const TEMPLATE_ORDER: TemplateId[] = ['ONBOARD', 'OFFBOARD', 'TRANSFER', 'ARCHIVE', 'FEISHU_EVENT', 'RECONCILE']
const TEMPLATE_KEYWORDS: Record<TemplateId, string[]> = {
    ONBOARD: ['入职', '新员工', '新人', '开通', '账号', 'onboard', 'new hire', 'account'],
    OFFBOARD: ['离职', '辞职', '暂停', '回收', 'resign', 'offboard', 'suspend'],
    TRANSFER: ['调岗', '转岗', '调动', '部门', 'transfer', 'department'],
    ARCHIVE: ['变更', '归档', '存档', '档案', '多维表格', '台账', '花名册', 'archive', 'bitable', 'change'],
    FEISHU_EVENT: ['飞书', '事件', '机器人', '收到', '消息', '通知', 'feishu', 'event', 'notify'],
    RECONCILE: ['对账', '核对', '比对', '每天', '每日', '定时', '汇总', 'daily', 'schedule', 'reconcil'],
}

const ZH_TEXT: ScenarioText = {
    notifyStep: (label) => `通知${label ?? '群'}`,
    jobNumberAndDate: '工号加生效日期',
    eventId: '飞书事件 ID',
    questionBitable: '建档写进哪张多维表格？请给出多维表格的链接或 appToken',
    questionChat: (label) => `通知哪个飞书群？请给出${label ?? '群'}的群 ID（以 oc_ 开头，机器人必须已在群里）`,
    questionEventType: '要响应哪类飞书事件？请给出事件类型，例如 im.message.receive_v1；回答「不限」表示收到什么事件都通知',
    archive: {
        name: '员工信息变更归档到飞书多维表格',
        trigger: '北森员工信息变更',
        recordStep: '在飞书多维表格归档',
        columns: { name: '姓名', jobNumber: '工号', mobile: '手机号', email: '邮箱', changeType: '变更类型', effectiveDate: '生效日期' },
        message: '员工信息有变更，已归档到多维表格',
        summary: (stepNames) => `北森出现员工信息变更后，依次：${stepNames.join('、')}。`,
        columnsWarning: '归档的列名按「姓名、工号、手机号、邮箱、变更类型、生效日期」预填，和你的表头不一致时在编辑器里改。变更类型是北森的变更类型编码，不是中文名称。',
        dedupeWarning: '北森每次轮询都可能把同一条变更再返回一次，所以按工号加生效日期去重；同一天内同一个人的第二次变更会被当作重复而不归档，需要的话在触发器的运行设置里关掉。',
        dedupeReason: '同一个工号、同一个生效日期，24 小时内只归档一次',
    },
    event: {
        name: '飞书事件通知到群',
        trigger: '收到飞书事件',
        message: '收到飞书事件 {{trigger[\'output\'][\'header\'][\'event_type\']}}（事件 ID {{trigger[\'output\'][\'header\'][\'event_id\']}}）',
        summary: (stepNames) => `飞书推送事件后，依次：${stepNames.join('、')}。`,
        setup: '飞书的事件订阅要在飞书开放平台里配置：把触发器上显示的请求地址贴到「事件与回调」，再订阅上面选的事件类型。',
        token: '触发器的「Verification Token」是飞书应用的凭据，没有填，请到飞书开放平台的「事件与回调」页面复制后填入。',
        dedupeReason: '飞书在对方响应超时时会重推同一个事件，按事件 ID 去重，24 小时内只通知一次',
    },
    reconcile: {
        name: (scope) => `每天对账北森${SCOPE_LABEL_ZH[scope]}员工`,
        trigger: '每天 08:00（北京时间）',
        now: '取当前时间',
        windowStart: '算出 24 小时前',
        search: (scope) => `查近 24 小时北森${SCOPE_LABEL_ZH[scope]}员工`,
        message: (scope) => `对账提醒：北森最近 24 小时有 {{step_3['output']['count']}} 名${SCOPE_LABEL_ZH[scope]}员工发生变动，请核对飞书账号是否已同步`,
        summary: ({ scope, stepNames }) => `每天早上 8 点，对账北森${SCOPE_LABEL_ZH[scope]}员工：${stepNames.join('、')}。`,
        summaryOnly: '这条流程只按北森的变动数量汇总提醒，不会逐人比对飞书账号、也不会产出差异单；逐人比对要靠能列出全量名单的对账能力，当前版本还没有。',
        schedule: '默认每天 08:00（北京时间）运行，周末也运行；要改时间在触发器里改。查询窗口取最近 24 小时，窗口里的变动超过 300 条时只统计第一页。',
    },
    templates: {
        ONBOARD: { name: '员工入职开通飞书账号', description: '北森出现入职员工后，在飞书开通账号，可选在多维表格建档、通知 HR 群', examplePrompt: '员工入职后在飞书建档、按部门开通账号并通知 HR 群' },
        OFFBOARD: { name: '员工离职暂停飞书账号', description: '北森出现离职员工后，暂停飞书账号并通知 IT 群回收设备', examplePrompt: '员工离职后暂停飞书账号并通知 IT 群' },
        TRANSFER: { name: '员工调岗同步飞书部门', description: '北森出现调岗员工后，更新飞书里的部门', examplePrompt: '员工调岗后同步飞书部门并通知 HR 群' },
        ARCHIVE: { name: '员工信息变更归档', description: '北森员工信息变更后，把变更记一行到飞书多维表格', examplePrompt: '北森员工信息变更后归档到飞书多维表格' },
        FEISHU_EVENT: { name: '飞书事件通知到群', description: '飞书推送事件（例如机器人收到消息）后，往指定群发一条通知', examplePrompt: '飞书收到机器人消息事件后通知 IT 群' },
        RECONCILE: { name: '每天对账提醒', description: '每天早上汇总北森最近 24 小时的员工变动数量，发到 HR 群提醒核对', examplePrompt: '每天对账北森员工变动并通知 HR 群' },
    },
}

const EN_TEXT: ScenarioText = {
    notifyStep: (label) => `Notify ${label ?? 'group'}`,
    jobNumberAndDate: 'employee number plus effective date',
    eventId: 'Feishu event ID',
    questionBitable: 'Which Feishu bitable should the record go into? Give its link or appToken',
    questionChat: (label) => `Which Feishu group should be notified? Give the chat ID of the ${label ?? 'group'} (starts with oc_, the bot must be in the group)`,
    questionEventType: 'Which Feishu event type should it react to? Give the type, for example im.message.receive_v1; answer "any" to notify on every event',
    archive: {
        name: 'Archive employee info changes to a Feishu bitable',
        trigger: 'Beisen employee info changed',
        recordStep: 'Archive to bitable',
        columns: { name: 'Name', jobNumber: 'Employee number', mobile: 'Mobile', email: 'Email', changeType: 'Change type', effectiveDate: 'Effective date' },
        message: 'An employee record changed and was archived to the bitable',
        summary: (stepNames) => `After Beisen reports an employee info change: ${stepNames.join(', ')}.`,
        columnsWarning: 'The columns are prefilled as Name, Employee number, Mobile, Email, Change type, Effective date. Rename them in the editor if your table differs. The change type is Beisen\'s change type code, not a label.',
        dedupeWarning: 'Beisen can return the same change again on every poll, so events are de-duplicated by employee number plus effective date; a second change for the same person on the same day counts as a duplicate and is not archived. Turn it off in the trigger run settings if you need that.',
        dedupeReason: 'The same employee number and effective date is archived once within 24 hours',
    },
    event: {
        name: 'Notify a group about a Feishu event',
        trigger: 'Feishu event received',
        message: 'Feishu event {{trigger[\'output\'][\'header\'][\'event_type\']}} received (event ID {{trigger[\'output\'][\'header\'][\'event_id\']}})',
        summary: (stepNames) => `After Feishu pushes an event: ${stepNames.join(', ')}.`,
        setup: 'The event subscription is configured in the Feishu Open Platform: paste the request URL shown on the trigger into Events & Callbacks and subscribe to the event type above.',
        token: 'The trigger\'s Verification Token is a credential of your Feishu app and was left empty. Copy it from Events & Callbacks in the Feishu Open Platform.',
        dedupeReason: 'Feishu re-sends an event when the receiver times out, so events are de-duplicated by event ID within 24 hours',
    },
    reconcile: {
        name: (scope) => `Daily reconciliation of ${SCOPE_LABEL_EN[scope]} Beisen employees`,
        trigger: 'Every day at 08:00 (Beijing time)',
        now: 'Get the current time',
        windowStart: 'Work out 24 hours ago',
        search: (scope) => `Search ${SCOPE_LABEL_EN[scope]} Beisen employees changed in the last 24 hours`,
        message: (scope) => `Reconciliation reminder: {{step_3['output']['count']}} ${SCOPE_LABEL_EN[scope]} Beisen employees changed in the last 24 hours, please check their Feishu accounts`,
        summary: ({ scope, stepNames }) => `Every day at 8 am, reconcile ${SCOPE_LABEL_EN[scope]} Beisen employees: ${stepNames.join(', ')}.`,
        summaryOnly: 'This flow only reminds with the number of Beisen changes. It does not compare people one by one against Feishu accounts and produces no difference list; that needs a reconciliation capability that can list everyone, which this version does not have yet.',
        schedule: 'It runs every day at 08:00 (Beijing time), weekends included; change the time on the trigger. The window is the last 24 hours, and only the first page is counted when more than 300 changes fall in it.',
    },
    templates: {
        ONBOARD: { name: 'Employee onboarding: create Feishu account', description: 'When Beisen reports a new hire, create the Feishu account; optionally add a bitable row and tell the HR group', examplePrompt: 'When an employee is onboarded in Beisen, create their Feishu account by department and tell the HR group' },
        OFFBOARD: { name: 'Employee offboarding: suspend Feishu account', description: 'When Beisen reports a leaver, suspend the Feishu account and tell the IT group to collect equipment', examplePrompt: 'When an employee leaves in Beisen, suspend their Feishu account and notify the IT group' },
        TRANSFER: { name: 'Employee transfer: sync Feishu department', description: 'When Beisen reports a transfer, update the department in Feishu', examplePrompt: 'When an employee transfers in Beisen, update their Feishu department and notify the HR group' },
        ARCHIVE: { name: 'Archive employee info changes', description: 'When a Beisen employee record changes, write one row per change to a Feishu bitable', examplePrompt: 'When Beisen employee info changes, archive it to a Feishu bitable' },
        FEISHU_EVENT: { name: 'Notify a group about a Feishu event', description: 'When Feishu pushes an event, such as the bot receiving a message, post a note to a group', examplePrompt: 'When Feishu pushes a bot message event, notify the IT group' },
        RECONCILE: { name: 'Daily reconciliation reminder', description: 'Every morning, count the Beisen employee changes of the last 24 hours and remind the HR group to check', examplePrompt: 'Every day reconcile Beisen employee changes and notify the HR group' },
    },
}

const SCENARIO_TEXTS: Record<ScenarioLanguage, ScenarioText> = { zh: ZH_TEXT, en: EN_TEXT }
const SCOPE_LABEL_ZH: Record<ReconcileScope, string> = { ACTIVE: '在职', ONBOARDING: '入职', LEFT: '离职' }
const SCOPE_LABEL_EN: Record<ReconcileScope, string> = { ACTIVE: 'active', ONBOARDING: 'new-hire', LEFT: 'departed' }

export type ScenarioIntent = 'ARCHIVE' | 'FEISHU_EVENT' | 'RECONCILE'
export type ScenarioLanguage = 'zh' | 'en'

export type ScenarioAnswer = {
    value: string | null
    rejected: string | null
}

export type ScenarioFacts = {
    prompt: string
    recordKept: boolean
    notifyKept: boolean
    wantsNotify: boolean
    groupLabel: string | null
    chat: ScenarioAnswer
    bitable: ScenarioAnswer
    eventType: ScenarioAnswer
}

export type ScenarioBlueprint = {
    displayName: string
    trigger: StepDraft
    steps: StepDraft[]
    summary: (stepNames: string[]) => string
    warnings: string[]
    dedupe: PlanDedupe | null
    missingMappingTable: PlanMappingTableHint | null
    questions: string[]
}

type ReconcileScope = 'ACTIVE' | 'ONBOARDING' | 'LEFT'
type TemplateId = 'ONBOARD' | 'OFFBOARD' | 'TRANSFER' | ScenarioIntent

type ScenarioText = {
    notifyStep: (label: string | null) => string
    jobNumberAndDate: string
    eventId: string
    questionBitable: string
    questionChat: (label: string | null) => string
    questionEventType: string
    archive: {
        name: string
        trigger: string
        recordStep: string
        columns: { name: string, jobNumber: string, mobile: string, email: string, changeType: string, effectiveDate: string }
        message: string
        summary: (stepNames: string[]) => string
        columnsWarning: string
        dedupeWarning: string
        dedupeReason: string
    }
    event: {
        name: string
        trigger: string
        message: string
        summary: (stepNames: string[]) => string
        setup: string
        token: string
        dedupeReason: string
    }
    reconcile: {
        name: (scope: ReconcileScope) => string
        trigger: string
        now: string
        windowStart: string
        search: (scope: ReconcileScope) => string
        message: (scope: ReconcileScope) => string
        summary: (params: { scope: ReconcileScope, stepNames: string[] }) => string
        summaryOnly: string
        schedule: string
    }
    templates: Record<TemplateId, { name: string, description: string, examplePrompt: string }>
}
