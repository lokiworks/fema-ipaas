import { Permission } from '@fema-ipaas/core-utils'
import { ConnectionSharePermission, CopilotMode } from '@fema-ipaas/shared'
import { integrationsSeed } from '../support/integrations-seed'
import { MatrixCase } from '../support/matrix'
import { Scope, World, WorldRequest } from '../support/world'

function post({ url, body }: { url: string, body: unknown }): WorldRequest {
    return { method: 'POST', url, body }
}

async function visibleModel({ world, scope }: { world: World, scope: Scope }): Promise<string> {
    const model = await integrationsSeed.aiModel({ world, scope, projectMembersPermission: ConnectionSharePermission.USE })
    return model.externalId
}

const PLAN = {
    displayName: 'sec',
    summary: 'sec',
    trigger: { connectorName: '@sec/missing', connectorDisplayName: 'x', operationName: 'x', operationDisplayName: 'x', displayName: 'x', input: {}, requiresConnection: false, connectionExternalId: null },
    steps: [],
    questions: [],
    warnings: [],
    omittedSteps: 0,
}

export const integrationsAiCases: MatrixCase[] = [
    {
        id: 'GET /v1/ai/model-connections',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const shared = await visibleModel({ world, scope })
            const privateModel = await integrationsSeed.aiModel({ world, scope, projectMembersPermission: null })
            return { request: { method: 'GET', url: '/v1/ai/model-connections', query: { projectId: world.scopes[scope].project.id } }, state: { shared, privateExternalId: privateModel.externalId } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            expect(response.text).toContain(String(prepared.state?.shared))
            expect(response.text).not.toContain(integrationsSeed.SECRET_MARKER)
            if (identity !== 'tenantAdmin') {
                expect(response.text).not.toContain(String(prepared.state?.privateExternalId))
            }
        },
    },
    {
        id: 'GET /v1/ai/usage',
        access: { type: 'project', permission: Permission.READ_PROJECT },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({
            request: { method: 'GET', url: '/v1/ai/usage', query: { projectId: world.scopes[scope].project.id, createdAfter: '2020-01-01T00:00:00.000Z', createdBefore: '2100-01-01T00:00:00.000Z' } },
        }),
    },
    {
        id: 'POST /v1/ai/copilot',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        expectOk: [400, 409],
        prepare: async ({ world, scope }) => ({
            request: post({
                url: '/v1/ai/copilot',
                body: { projectId: world.scopes[scope].project.id, workflowId: world.newId(), modelConnectionExternalId: 'missing-model', mode: CopilotMode.EXPLAIN },
            }),
        }),
    },
    {
        id: 'POST /v1/ai/field-mapping',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [400, 409],
        prepare: async ({ world, scope }) => ({
            request: post({
                url: '/v1/ai/field-mapping',
                body: { projectId: world.scopes[scope].project.id, modelConnectionExternalId: 'missing-model', targets: ['a'], sources: [{ path: 'b', sample: 'c' }] },
            }),
        }),
    },
    {
        id: 'POST /v1/ai/workflow-plans',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [400, 409],
        prepare: async ({ world, scope }) => ({
            request: post({ url: '/v1/ai/workflow-plans', body: { projectId: world.scopes[scope].project.id, modelConnectionExternalId: 'missing-model', prompt: 'sec' } }),
        }),
    },
    {
        id: 'POST /v1/ai/workflow-plans/apply',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [400, 409],
        prepare: async ({ world, scope }) => ({
            request: post({ url: '/v1/ai/workflow-plans/apply', body: { projectId: world.scopes[scope].project.id, plan: PLAN } }),
        }),
    },
]
