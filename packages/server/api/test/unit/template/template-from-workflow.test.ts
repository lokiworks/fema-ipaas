import { PropertyExecutionType, TemplateType, TemplateVisibility, WorkflowActionType, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { templateFromWorkflow } from '../../../src/app/template/template-from-workflow'

const NOW = '2026-09-01T00:00:00.000Z'

function connectorAction({ name, input, nextAction }: { name: string, input: Record<string, unknown>, nextAction?: unknown }): Record<string, unknown> {
    return {
        name,
        displayName: `Step ${name}`,
        valid: true,
        lastUpdatedDate: NOW,
        type: WorkflowActionType.CONNECTOR,
        settings: {
            connectorName: '@fema-ipaas/connector-feishu',
            connectorVersion: '1.0.0',
            actionName: 'send_message',
            input,
            propertySettings: { chat: { type: PropertyExecutionType.MANUAL } },
            errorHandlingOptions: undefined,
        },
        nextAction,
    }
}

function publishedVersion(): WorkflowVersion {
    return {
        id: 'version-1',
        created: NOW,
        updated: NOW,
        workflowId: 'workflow-1',
        displayName: 'Approval notification',
        updatedBy: 'user-1',
        valid: true,
        schemaVersion: '20',
        agentIds: [],
        state: WorkflowVersionState.LOCKED,
        connectionIds: ['conn-a', 'conn-b'],
        backupFiles: null,
        notes: [],
        graph: null,
        trigger: {
            name: 'trigger',
            displayName: 'New approval',
            valid: true,
            lastUpdatedDate: NOW,
            type: WorkflowTriggerType.CONNECTOR,
            settings: {
                connectorName: '@fema-ipaas/connector-feishu',
                connectorVersion: '1.0.0',
                triggerName: 'approval_approved',
                propertySettings: {},
                input: { auth: '{{connections[\'conn-a\']}}', approvalCode: 'A-1' },
            },
            nextAction: connectorAction({
                name: 'step_1',
                input: {
                    auth: '{{connections[\'conn-b\']}}',
                    chat: 'oc_123',
                    nested: { token: '{{connections.conn-b.access_token}}', keep: 'yes' },
                    list: ['{{connections[\'conn-b\']}}', 'plain'],
                    text: 'Bearer {{connections[\'conn-b\'].token}}',
                },
                nextAction: connectorAction({ name: 'step_2', input: { auth: '{{connections[\'conn-b\']}}', body: '{{trigger.body}}' } }),
            }),
        },
    }
}

describe('templateFromWorkflow.toWorkflowTemplate', () => {
    const template = templateFromWorkflow.toWorkflowTemplate(publishedVersion())
    const steps = workflowStructureUtil.getAllSteps(template.trigger)

    it('keeps only the portable fields of the version', () => {
        expect(template).not.toHaveProperty('id')
        expect(template).not.toHaveProperty('workflowId')
        expect(template).not.toHaveProperty('connectionIds')
        expect(template.displayName).toBe('Approval notification')
        expect(steps.map((step) => step.name)).toEqual(['trigger', 'step_1', 'step_2'])
    })

    it('removes the auth input of every step', () => {
        expect(steps.every((step) => !('auth' in step.settings.input))).toBe(true)
    })

    it('removes connection references nested anywhere in the input and keeps the rest', () => {
        expect(steps[0].settings.input).toEqual({ approvalCode: 'A-1' })
        expect(steps[1].settings.input).toEqual({
            chat: 'oc_123',
            nested: { keep: 'yes' },
            list: ['plain'],
            text: 'Bearer ',
        })
        expect(steps[2].settings.input).toEqual({ body: '{{trigger.body}}' })
    })

    it('does not mutate the published version', () => {
        const version = publishedVersion()
        templateFromWorkflow.toWorkflowTemplate(version)
        expect(version.trigger.settings.input.auth).toBe('{{connections[\'conn-a\']}}')
    })
})

describe('templateFromWorkflow.buildCreateBody', () => {
    it('builds a tenant template with the trimmed fields and one category', () => {
        const body = templateFromWorkflow.buildCreateBody({
            request: {
                projectId: 'project-1',
                workflowId: 'workflow-1',
                name: '  审批通知  ',
                description: ' 审批通过后通知 ',
                category: ' 审批 ',
                blogUrl: '',
                visibility: TemplateVisibility.TENANT,
            },
            version: publishedVersion(),
            author: '林晓',
            externalId: 'ext-1',
        })
        expect(body).toMatchObject({
            name: '审批通知',
            summary: '审批通过后通知',
            description: '审批通过后通知',
            categories: ['审批'],
            blogUrl: undefined,
            author: '林晓',
            type: TemplateType.CUSTOM,
            metadata: { externalId: 'ext-1' },
        })
        expect(body.workflows).toHaveLength(1)
    })

    it('stores no category when none is given', () => {
        const body = templateFromWorkflow.buildCreateBody({
            request: {
                projectId: 'project-1',
                workflowId: 'workflow-1',
                name: 'x',
                description: '',
                category: '   ',
                blogUrl: 'https://docs.example.com/x',
                visibility: TemplateVisibility.PRIVATE,
            },
            version: publishedVersion(),
            author: 'a',
            externalId: null,
        })
        expect(body.categories).toEqual([])
        expect(body.blogUrl).toBe('https://docs.example.com/x')
        expect(body.metadata).toBeNull()
    })
})

describe('templateFromWorkflow.authorName', () => {
    it('joins first and last name and falls back to the email', () => {
        expect(templateFromWorkflow.authorName({ firstName: 'Xiao', lastName: 'Lin', email: 'x@a.com' })).toBe('Xiao Lin')
        expect(templateFromWorkflow.authorName({ firstName: ' ', lastName: null, email: 'x@a.com' })).toBe('x@a.com')
    })
})
