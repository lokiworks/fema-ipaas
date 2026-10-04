import { WorkflowVersion } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { ConnectorSpecStatus, PublishValidationContext, workflowPublishValidator } from '../../src/app/workflows/workflow/workflow-publish-validator'

const FEISHU = '@fema-ipaas/connector-feishu'

const context: PublishValidationContext = {
    connectors: {
        [FEISHU]: {
            status: ConnectorSpecStatus.LOADED,
            requiresAuth: true,
            triggers: {},
            actions: {
                send_group_message: {
                    requiresAuth: true,
                    props: [
                        { name: 'chatId', displayName: '群聊', required: true },
                        { name: 'content', displayName: '内容', required: true },
                    ],
                },
            },
        },
        '@fema-ipaas/connector-webhook': {
            status: ConnectorSpecStatus.LOADED,
            requiresAuth: false,
            actions: {},
            triggers: { catch_webhook: { requiresAuth: false, props: [] } },
        },
    },
    connectionIds: new Set(['feishu-main']),
}

function versionWith(input: Record<string, unknown>, nextAction?: unknown): WorkflowVersion {
    return {
        trigger: {
            name: 'trigger',
            type: 'CONNECTOR_TRIGGER',
            valid: true,
            displayName: '收到请求',
            settings: { connectorName: '@fema-ipaas/connector-webhook', connectorVersion: '0.1.0', triggerName: 'catch_webhook', input: {} },
            nextAction: {
                name: 'step_1',
                type: 'CONNECTOR',
                valid: true,
                displayName: '通知 HR 群',
                settings: { connectorName: FEISHU, connectorVersion: '0.1.0', actionName: 'send_group_message', input },
                nextAction,
            },
        },
    } as unknown as WorkflowVersion
}

function reasons(version: WorkflowVersion): string[] {
    return workflowPublishValidator.find({ version, context }).map((problem) => `${problem.stepDisplayName}:${problem.reason}`)
}

describe('workflowPublishValidator', () => {
    it('lets a complete flow through', () => {
        expect(reasons(versionWith({ auth: '{{connections[\'feishu-main\']}}', chatId: 'oc_1', content: 'hi' }))).toEqual([])
    })

    it('names every missing required field and the missing connection', () => {
        expect(reasons(versionWith({ content: 'hi' }))).toEqual([
            '通知 HR 群:还没有选择连接',
            '通知 HR 群:缺少必填项「群聊」',
        ])
    })

    it('refuses a connection that no longer exists in the project', () => {
        expect(reasons(versionWith({ auth: '{{connections[\'gone\']}}', chatId: 'oc_1', content: 'hi' }))).toEqual(['通知 HR 群:选的连接「gone」不存在或已被删除'])
    })

    it('refuses a reference to a deleted step and a step that is not upstream', () => {
        const found = reasons(versionWith({ auth: '{{connections[\'feishu-main\']}}', chatId: 'oc_1', content: '{{step_9[\'output\'][\'x\']}} {{step_2[\'output\'][\'y\']}}' }, {
            name: 'step_2',
            type: 'CONNECTOR',
            valid: true,
            displayName: '再通知',
            settings: { connectorName: FEISHU, connectorVersion: '0.1.0', actionName: 'send_group_message', input: { auth: '{{connections[\'feishu-main\']}}', chatId: 'oc_1', content: 'ok' } },
        }))
        expect(found.some((reason) => reason.includes('引用了已删除的步骤'))).toBe(true)
        expect(found.some((reason) => reason.includes('不在它的上游'))).toBe(true)
    })

    it('falls back to a generic reason when only the saved valid flag says the step is broken', () => {
        const version = versionWith({ auth: '{{connections[\'feishu-main\']}}', chatId: 'oc_1', content: 'hi' })
        Reflect.set(Reflect.get(version.trigger, 'nextAction'), 'valid', false)
        expect(reasons(version)).toEqual(['通知 HR 群:配置还不完整，请打开这一步检查'])
    })

    it('skips steps that are switched off', () => {
        const version = versionWith({ content: 'hi' })
        Reflect.set(Reflect.get(version.trigger, 'nextAction'), 'skip', true)
        expect(reasons(version)).toEqual([])
    })

    it('describes the problems in one readable sentence', () => {
        const message = workflowPublishValidator.describe(workflowPublishValidator.find({ version: versionWith({ content: 'hi' }), context }))
        expect(message).toContain('流程还有 2 个问题')
        expect(message).toContain('「通知 HR 群」缺少必填项「群聊」')
    })
})
