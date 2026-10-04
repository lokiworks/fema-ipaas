import { describe, expect, it, vi } from 'vitest'

const workflows = vi.hoisted(() => ({ data: [] as unknown[] }))

vi.mock('../../src/app/workflows/workflow/workflow.service', () => ({
    workflowService: () => ({ list: async () => ({ data: workflows.data, next: null, previous: null }) }),
}))

const { aiRecommendations } = await import('../../src/app/ai/ai-recommendations')

const FEISHU = '@fema-ipaas/connector-feishu'

function workflowWith({ name, actionName, input }: { name: string, actionName: string, input: Record<string, unknown> }): unknown {
    return {
        version: {
            displayName: name,
            trigger: {
                name: 'trigger',
                type: 'EMPTY',
                nextAction: { name: 'step_1', type: 'CONNECTOR', settings: { connectorName: FEISHU, actionName, input } },
            },
        },
    }
}

const log = {} as never

describe('aiRecommendations', () => {
    it('recommends the group the project already posts to and says which workflow uses it', async () => {
        workflows.data = [
            workflowWith({ name: '入职通知', actionName: 'send_group_message', input: { chatId: 'oc_hr_notice' } }),
            workflowWith({ name: '调岗通知', actionName: 'send_group_message', input: { chatId: 'oc_hr_notice' } }),
            workflowWith({ name: '告警', actionName: 'send_group_message', input: { chatId: 'oc_it' } }),
            workflowWith({ name: '引用', actionName: 'send_group_message', input: { chatId: '{{trigger[\'output\'][\'x\']}}' } }),
        ]
        const [chat] = await aiRecommendations(log).forQuestions({ questions: ['通知哪个飞书群？请给出 HR 群的群 ID'], prompt: '入职后通知 HR 群', projectId: 'p1' })
        expect(chat.value).toBe('oc_hr_notice')
        expect(chat.basis).toContain('入职通知')
        expect(chat.basis).toContain('调岗通知')
    })

    it('recommends nothing and says why when no workflow has used a group or bitable', async () => {
        workflows.data = []
        const found = await aiRecommendations(log).forQuestions({ questions: ['通知哪个飞书群？', '建档写进哪张多维表格？'], prompt: '入职后建档并通知', projectId: 'p1' })
        expect(found.map((entry) => entry.value)).toEqual([null, null])
        expect(found[0].basis).toContain('没有工作流往群里发过消息')
        expect(found[1].basis).toContain('没有工作流写过多维表格')
    })

    it('falls back to the Feishu root department when no department was ever used', async () => {
        workflows.data = []
        const [department] = await aiRecommendations(log).forQuestions({ questions: ['新员工放进哪个飞书部门？'], prompt: '入职后开通账号', projectId: 'p1' })
        expect(department.value).toBe('0')
        expect(department.basis).toContain('根部门')
    })

    it('prefers a department a workflow already uses', async () => {
        workflows.data = [workflowWith({ name: '入职开通', actionName: 'provision_user', input: { departmentId: 'od-rd' } })]
        const [department] = await aiRecommendations(log).forQuestions({ questions: ['新员工放进哪个飞书部门？'], prompt: '入职后开通账号', projectId: 'p1' })
        expect(department.value).toBe('od-rd')
        expect(department.basis).toContain('入职开通')
    })

    it('picks the Feishu event type from what the description is about', async () => {
        workflows.data = []
        const ask = async (prompt: string) => (await aiRecommendations(log).forQuestions({ questions: ['要响应哪类飞书事件？请给出事件类型'], prompt, projectId: 'p1' }))[0]
        expect((await ask('飞书员工入职事件通知 IT 群')).value).toBe('contact.user.created_v3')
        expect((await ask('飞书收到消息事件后通知 IT 群')).value).toBe('im.message.receive_v1')
    })

    it('says it has nothing to go on for a question it does not know', async () => {
        workflows.data = []
        const [other] = await aiRecommendations(log).forQuestions({ questions: ['这个流程给谁用？'], prompt: '入职', projectId: 'p1' })
        expect(other.value).toBeNull()
    })
})
