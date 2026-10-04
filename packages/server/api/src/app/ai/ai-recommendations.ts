import { isNil, PlanRecommendation, ProjectId, WorkflowActionType, workflowStructureUtil } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { workflowService } from '../workflows/workflow/workflow.service'

export const aiRecommendations = (log: FastifyBaseLogger) => ({
    async forQuestions({ questions, prompt, projectId }: { questions: string[], prompt: string, projectId: ProjectId }): Promise<PlanRecommendation[]> {
        const language: Language = CJK_PATTERN.test(prompt) ? 'zh' : 'en'
        const kinds = questions.map((question) => ({ question, kind: kindOf(question) }))
        const needsEvidence = kinds.some(({ kind }) => EVIDENCE_KINDS.includes(kind))
        const evidence = needsEvidence ? await loadEvidence({ log, projectId }) : []
        return kinds.map(({ question, kind }) => recommend({ question, kind, prompt, evidence, language }))
    },
})

function recommend({ question, kind, prompt, evidence, language }: { question: string, kind: QuestionKind, prompt: string, evidence: Evidence[], language: Language }): PlanRecommendation {
    const text = TEXTS[language]
    switch (kind) {
        case 'chat':
        case 'bitable':
        case 'department': {
            const best = mostUsed({ evidence: evidence.filter((entry) => entry.kind === kind) })
            if (!isNil(best)) {
                return { question, value: best.value, basis: text.usedBy({ names: best.workflowNames }) }
            }
            return kind === 'department'
                ? { question, value: ROOT_DEPARTMENT_ID, basis: text.rootDepartment }
                : { question, value: null, basis: text.noEvidence[kind] }
        }
        case 'eventType': {
            const event = eventFor({ prompt })
            return { question, value: event.type, basis: text.eventBasis(event.reason) }
        }
        case 'other':
            return { question, value: null, basis: text.noRecommendation }
    }
}

function eventFor({ prompt }: { prompt: string }): { type: string, reason: EventReason } {
    if (/入职|新员工|新增员工|onboard|new hire/i.test(prompt)) {
        return { type: 'contact.user.created_v3', reason: 'created' }
    }
    if (/离职|删除员工|offboard|resign/i.test(prompt)) {
        return { type: 'contact.user.deleted_v3', reason: 'deleted' }
    }
    return { type: 'im.message.receive_v1', reason: 'message' }
}

function kindOf(question: string): QuestionKind {
    if (/事件类型|event type/i.test(question)) {
        return 'eventType'
    }
    if (/多维表格|bitable|appToken/i.test(question)) {
        return 'bitable'
    }
    if (/部门|department/i.test(question)) {
        return 'department'
    }
    if (/群|group|chat/i.test(question)) {
        return 'chat'
    }
    return 'other'
}

function mostUsed({ evidence }: { evidence: Evidence[] }): { value: string, workflowNames: string[] } | null {
    const grouped = evidence.reduce<Map<string, string[]>>((map, entry) => {
        const names = map.get(entry.value) ?? []
        return new Map(map).set(entry.value, names.includes(entry.workflowName) ? names : [...names, entry.workflowName])
    }, new Map())
    const [first] = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)
    return isNil(first) ? null : { value: first[0], workflowNames: first[1].slice(0, MAX_NAMES_SHOWN) }
}

async function loadEvidence({ log, projectId }: { log: FastifyBaseLogger, projectId: ProjectId }): Promise<Evidence[]> {
    const page = await workflowService(log).list({ projectIds: [projectId], cursorRequest: null, limit: EVIDENCE_WORKFLOW_LIMIT, includeTriggerSource: false })
    return page.data.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.version.trigger).flatMap((step): Evidence[] => {
        if (step.type !== WorkflowActionType.CONNECTOR || step.settings.connectorName !== FEISHU) {
            return []
        }
        const input = step.settings.input
        const literal = (field: string): string | null => {
            const value = input[field]
            return typeof value === 'string' && value.length > 0 && !value.includes('{{') ? value : null
        }
        const found: [QuestionKind, string | null][] = [
            ['chat', step.settings.actionName === SEND_GROUP_MESSAGE ? literal('chatId') : null],
            ['bitable', BITABLE_ACTIONS.includes(step.settings.actionName ?? '') ? literal('appToken') : null],
            ['department', DEPARTMENT_ACTIONS.includes(step.settings.actionName ?? '') ? literal('departmentId') : null],
        ]
        return found.flatMap(([kind, value]) => (isNil(value) ? [] : [{ kind, value, workflowName: workflow.version.displayName }]))
    }))
}

const FEISHU = '@fema-ipaas/connector-feishu'
const SEND_GROUP_MESSAGE = 'send_group_message'
const BITABLE_ACTIONS = ['create_bitable_record', 'search_bitable_records']
const DEPARTMENT_ACTIONS = ['provision_user', 'update_user']
const EVIDENCE_KINDS: QuestionKind[] = ['chat', 'bitable', 'department']
const ROOT_DEPARTMENT_ID = '0'
const CJK_PATTERN = /[一-鿿]/
const EVIDENCE_WORKFLOW_LIMIT = 100
const MAX_NAMES_SHOWN = 2

const ZH: Texts = {
    usedBy: ({ names }) => `这个项目里的工作流「${names.join('」「')}」已经在用这个值`,
    rootDepartment: '飞书的根部门 ID 固定是 0，项目里也没有工作流填过别的部门。先把所有人放进根部门，建好部门对照表再按部门细分',
    noEvidence: {
        chat: '项目里还没有工作流往群里发过消息，没有可参考的群。群 ID 请在飞书里打开群设置复制，机器人必须已在群里',
        bitable: '项目里还没有工作流写过多维表格，没有可参考的表。请在飞书里打开多维表格，复制地址栏里 /base/ 后面的部分',
    },
    eventBasis: (reason) => EVENT_BASIS_ZH[reason],
    noRecommendation: '这个问题没有可参考的依据，需要你自己回答',
}

const EN: Texts = {
    usedBy: ({ names }) => `The workflows "${names.join('", "')}" in this project already use this value`,
    rootDepartment: 'The Feishu root department ID is always 0 and no workflow in this project sets another department. Put everyone in the root first, then split by department once a mapping table exists',
    noEvidence: {
        chat: 'No workflow in this project has posted to a group yet, so there is no group to suggest. Copy the chat ID from the group settings in Feishu; the bot must be in the group',
        bitable: 'No workflow in this project has written to a bitable yet, so there is no table to suggest. Open the bitable in Feishu and copy what follows /base/ in the address bar',
    },
    eventBasis: (reason) => EVENT_BASIS_EN[reason],
    noRecommendation: 'There is nothing to base a suggestion on; this one needs your answer',
}

const EVENT_BASIS_ZH: Record<EventReason, string> = {
    created: '描述里说的是员工入职，飞书的「员工新增」事件是 contact.user.created_v3',
    deleted: '描述里说的是员工离职，飞书的「员工删除」事件是 contact.user.deleted_v3',
    message: '描述里没有说是哪类事件；机器人收到消息是飞书事件里最常见的一类，事件类型是 im.message.receive_v1',
}

const EVENT_BASIS_EN: Record<EventReason, string> = {
    created: 'The description is about a new hire, and the Feishu "user created" event is contact.user.created_v3',
    deleted: 'The description is about a leaver, and the Feishu "user deleted" event is contact.user.deleted_v3',
    message: 'The description does not name an event; the bot receiving a message is the most common Feishu event, im.message.receive_v1',
}

const TEXTS: Record<Language, Texts> = { zh: ZH, en: EN }

type Language = 'zh' | 'en'
type QuestionKind = 'chat' | 'bitable' | 'department' | 'eventType' | 'other'
type EventReason = 'created' | 'deleted' | 'message'

type Evidence = {
    kind: QuestionKind
    value: string
    workflowName: string
}

type Texts = {
    usedBy: (params: { names: string[] }) => string
    rootDepartment: string
    noEvidence: { chat: string, bitable: string }
    eventBasis: (reason: EventReason) => string
    noRecommendation: string
}
