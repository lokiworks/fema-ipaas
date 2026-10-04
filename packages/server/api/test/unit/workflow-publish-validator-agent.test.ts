import { WorkflowVersion } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { PublishValidationContext, workflowPublishValidator } from '../../src/app/workflows/workflow/workflow-publish-validator'

const hr = {
    externalId: 'hr',
    displayName: '企业人事工具',
    url: 'https://hr.corp/mcp',
    authType: 'bearer' as const,
    ok: true,
    toolNames: ['query_employee', 'create_ticket'],
}

function versionWith(input: Record<string, unknown>): WorkflowVersion {
    return {
        trigger: {
            name: 'trigger',
            type: 'EMPTY',
            valid: false,
            displayName: 'Trigger',
            settings: {},
            nextAction: {
                name: 'step_1',
                type: 'CONNECTOR',
                valid: true,
                displayName: 'AI 智能体',
                settings: { connectorName: '@fema-ipaas/connector-ai', connectorVersion: '0.1.0', actionName: 'run_agent', input },
            },
        },
    } as unknown as WorkflowVersion
}

function reasons({ input, mcpServers }: { input: Record<string, unknown>, mcpServers: PublishValidationContext['mcpServers'] }): string[] {
    const context: PublishValidationContext = { connectors: {}, connectionIds: null, mcpServers }
    return workflowPublishValidator.find({ version: versionWith(input), context })
        .filter((problem) => problem.stepName === 'step_1')
        .map((problem) => problem.reason)
}

const linked = { mcpServers: [{ server: 'hr', url: 'https://hr.corp/mcp', authorization: '{{connections[\'hr\'].props.token}}' }] }

describe('workflowPublishValidator agent servers', () => {
    it('lets a healthy picked server through', () => {
        expect(reasons({ input: linked, mcpServers: [hr] })).toEqual([])
    })

    it('refuses a deleted server and names it', () => {
        expect(reasons({ input: linked, mcpServers: [] })).toEqual(['选的 MCP 服务器「hr」已被删除，或在当前项目里不可用'])
    })

    it('refuses a server that cannot be reached', () => {
        expect(reasons({ input: linked, mcpServers: [{ ...hr, ok: false }] })).toEqual(['MCP 服务器「企业人事工具」现在连不上，恢复连接后才能发布'])
    })

    it('refuses an allowed tool the server no longer has', () => {
        expect(reasons({ input: { ...linked, allowedTools: ['query_employee', 'drop_table'] }, mcpServers: [hr] })).toEqual(['允许的工具「drop_table」在选的服务器上已经不存在'])
    })

    it('does not check servers when the list was not loaded', () => {
        expect(reasons({ input: linked, mcpServers: null })).toEqual([])
    })
})
