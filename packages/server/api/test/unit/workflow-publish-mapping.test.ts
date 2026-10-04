import { ApplicationError } from '@fema-ipaas/core-utils'
import { WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/app/mapping-table/mapping-table.service', () => ({
    mappingTableService: () => ({ list: async () => [{ id: 'mt_ok' }] }),
}))

const { workflowPublishUtils } = await import('../../src/app/workflows/workflow/workflow-publish-utils')

const target = {
    connectorName: '@fema-ipaas/connector-feishu',
    actionName: 'provision_user',
    fields: [
        { name: 'name', type: 'STRING', required: true },
        { name: 'mobile', label: '手机号', type: 'STRING', required: true },
    ],
}

function versionWith(mapping: unknown): WorkflowVersion {
    return {
        trigger: {
            name: 'trigger',
            type: 'CONNECTOR_TRIGGER',
            settings: { connectorName: '@fema-ipaas/connector-webhook', triggerName: 'catch_webhook' },
            nextAction: {
                name: 'step_1',
                type: 'CONNECTOR',
                displayName: '字段映射',
                settings: { connectorName: '@fema-ipaas/connector-data-mapper', actionName: 'map_fields', input: { mapping } },
            },
        },
    } as unknown as WorkflowVersion
}

async function check(mapping: unknown): Promise<void> {
    await workflowPublishUtils.assertMappingsValid({ version: versionWith(mapping), projectId: 'p1', log: {} as FastifyBaseLogger })
}

async function refusal(mapping: unknown): Promise<string> {
    try {
        await check(mapping)
        return ''
    }
    catch (error) {
        return error instanceof ApplicationError ? String(Reflect.get(error.error.params ?? {}, 'message')) : ''
    }
}

describe('workflowPublishUtils.assertMappingsValid', () => {
    it('lets a complete mapping through', async () => {
        await expect(check({
            destination: target,
            fields: [
                { id: 'a', target: 'name', source: 'x', transforms: [] },
                { id: 'b', target: 'mobile', source: 'y', transforms: [{ type: 'LOOKUP', arg: 'mt_ok' }] },
            ],
        })).resolves.toBeUndefined()
    })

    it('refuses to publish when a required target field has no source', async () => {
        expect(await refusal({ destination: target, fields: [{ id: 'a', target: 'name', source: 'x', transforms: [] }] })).toContain('手机号')
    })

    it('refuses a date format that would produce garbage and a deleted mapping table', async () => {
        const message = await refusal({
            fields: [
                { id: 'a', target: 'd', source: 'x', transforms: [{ type: 'DATE', arg: 'yyyy-MM-dd' }] },
                { id: 'b', target: 'c', source: 'x', transforms: [{ type: 'LOOKUP', arg: 'mt_gone' }] },
            ],
        })
        expect(message).toContain('yyyy-MM-dd')
        expect(message).toContain('映射表不存在')
    })
})
