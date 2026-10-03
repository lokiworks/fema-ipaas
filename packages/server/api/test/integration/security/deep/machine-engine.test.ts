import { generateId, MappingMissingBehavior } from '@fema-ipaas/core-utils'
import { ConnectionScope, FileType, PrincipalType, RunEnvironment, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { createMockConnection, createMockFile } from '../../../helpers/mocks'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { seed } from '../support/seed'
import { Scope, securityWorld, World } from '../support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (world === null) {
        throw new Error('world is not ready')
    }
    return world
}

async function engineTokenFor({ scope }: { scope: Scope }): Promise<string> {
    const w = currentWorld()
    return generateMockToken({ id: generateId(), type: PrincipalType.ENGINE, projectId: w.scopes[scope].project.id, tenant: { id: w.scopes[scope].tenant.id }, environment: RunEnvironment.PRODUCTION })
}

async function asEngine({ scope, request }: { scope: Scope, request: Parameters<World['sendAsToken']>[0]['request'] }) {
    return currentWorld().sendAsToken({ token: await engineTokenFor({ scope }), request })
}

async function seedFile({ scope, type }: { scope: Scope, type: FileType }): Promise<{ id: string, data: Buffer }> {
    const w = currentWorld()
    const data = Buffer.from(`secret-of-${scope}-${generateId()}`)
    const file = createMockFile({ projectId: w.scopes[scope].project.id, tenantId: w.scopes[scope].tenant.id, type, data, compression: 'NONE' as never })
    await db.save('file', file)
    return { id: file.id, data }
}

async function createViaApi({ scope, url, body }: { scope: Scope, url: string, body: Record<string, unknown> }): Promise<{ id: string }> {
    const w = currentWorld()
    const identity = scope === 'A' ? 'projectAdmin' : scope === 'B' ? 'foreignProjectAdmin' : 'otherTenantAdmin'
    const response = await w.send({ identity, request: { method: 'POST', url, body: { ...body, projectId: w.scopes[scope].project.id } } })
    if (response.status >= 300) {
        throw new Error(`fixture ${url} failed with ${response.status}: ${response.text}`)
    }
    return response.json() as { id: string }
}

describe('user, service and anonymous tokens cannot use engine and worker endpoints', () => {
    it.each([
        ['GET', '/v1/worker/project', undefined],
        ['GET', '/v1/worker/variables/anything', undefined],
        ['GET', '/v1/worker/connections/anything', undefined],
        ['GET', '/v1/worker/mapping-tables/aaaaaaaaaaaaaaaaaaaaa', undefined],
        ['GET', '/v1/store-entries?key=k', undefined],
        ['GET', '/v1/engine/populated-workflows', undefined],
        ['POST', '/v1/engine/run-logs', { runId: 'r', projectId: 'p' }],
        ['POST', '/v1/waitpoints', { executionId: 'e', projectId: 'p', stepName: 's', type: 'WEBHOOK', version: 'V1' }],
        ['POST', '/v1/worker/oidc-token', { audience: 'x' }],
    ] as const)('refuses %s %s for a tenant admin, a project admin, a service key and nobody', async (method, url, body) => {
        const w = currentWorld()
        const service = await generateMockToken({ id: generateId(), type: PrincipalType.SERVICE, tenant: { id: w.scopes.A.tenant.id } })
        const request = { method, url, body }
        const statuses = [
            (await w.send({ identity: 'tenantAdmin', request })).status,
            (await w.send({ identity: 'projectAdmin', request })).status,
            (await w.sendAsToken({ token: service, request })).status,
            (await w.send({ identity: 'anonymous', request })).status,
        ]

        expect(statuses).toEqual([403, 403, 403, 403])
    })
})

describe('an engine token is confined to its own project', () => {
    it('does not let a project A engine register a waitpoint on a run of project B', async () => {
        const w = currentWorld()
        const foreignRun = await seed.execution({ world: w, scope: 'B' })

        const response = await asEngine({
            scope: 'A',
            request: {
                method: 'POST',
                url: '/v1/waitpoints',
                body: { executionId: foreignRun.id, projectId: w.scopes.B.project.id, stepName: 'step_1', type: 'WEBHOOK', version: 'V1' },
            },
        })
        const withOwnProjectId = await asEngine({
            scope: 'A',
            request: {
                method: 'POST',
                url: '/v1/waitpoints',
                body: { executionId: foreignRun.id, projectId: w.scopes.A.project.id, stepName: 'step_2', type: 'WEBHOOK', version: 'V1' },
            },
        })

        expect([response.status, withOwnProjectId.status]).toEqual([403, 403])
        expect(await db.findOneBy('waitpoint', { executionId: foreignRun.id })).toBeNull()
    })

    it('does not let a project A engine rewrite the run record of project B through the run log endpoint', async () => {
        const w = currentWorld()
        const foreignRun = await seed.execution({ world: w, scope: 'B' })
        const before = await db.findOneBy<{ projectId: string, status: string }>('execution', { id: foreignRun.id })

        const response = await asEngine({
            scope: 'A',
            request: { method: 'POST', url: '/v1/engine/run-logs', body: { runId: foreignRun.id, projectId: w.scopes.A.project.id, status: 'SUCCEEDED', finishTime: new Date().toISOString() } },
        })

        expect(response.status).toBe(403)
        const after = await db.findOneBy<{ projectId: string, status: string }>('execution', { id: foreignRun.id })
        expect(after?.projectId).toBe(before?.projectId)
        expect(after?.status).toBe(before?.status)
    })

    it('does not let a project A engine overwrite or read a file of project B', async () => {
        const w = currentWorld()
        const foreignFile = await seedFile({ scope: 'B', type: FileType.WORKFLOW_STEP_FILE })
        const token = await engineTokenFor({ scope: 'A' })

        const overwrite = await w.app.inject({
            method: 'PUT',
            url: `/api/v1/files/${foreignFile.id}`,
            query: { token },
            headers: { 'content-type': 'application/octet-stream', 'x-ap-file-type': FileType.WORKFLOW_STEP_FILE, 'x-ap-file-name': 'x.txt' },
            payload: Buffer.from('overwritten by project A'),
        })
        const read = await w.app.inject({ method: 'GET', url: `/api/v1/files/${foreignFile.id}`, query: { token } })

        expect(overwrite.statusCode).toBe(403)
        expect(read.statusCode).toBe(404)
        const row = await db.findOneBy<{ projectId: string, data: Buffer | null }>('file', { id: foreignFile.id })
        expect(row?.projectId).toBe(w.scopes.B.project.id)
        expect(Buffer.from(row?.data ?? []).toString()).toBe(foreignFile.data.toString())
    })

    it('does not hand a project B workflow version, connection, variable or mapping table to a project A engine', async () => {
        const w = currentWorld()
        const foreignWorkflow = await seed.workflow({ world: w, scope: 'B', status: WorkflowStatus.DISABLED })
        const connection = createMockConnection({ tenantId: w.scopes.B.tenant.id, projectIds: [w.scopes.B.project.id], connectorName: '@fema-ipaas/connector-http' }, w.scopes.B.ownerId)
        await db.save('connection', { ...connection, scope: ConnectionScope.PROJECT })
        const variableName = `secret_${generateId().slice(0, 8).replace(/[^a-zA-Z0-9]/g, 'x')}`
        await createViaApi({ scope: 'B', url: '/v1/variables', body: { name: variableName, value: 'b-only-value' } })
        const table = await createViaApi({
            scope: 'B',
            url: '/v1/mapping-tables',
            body: { name: 'b-table', description: '', keyLabel: 'a', valueLabel: 'b', missingBehavior: MappingMissingBehavior.PASSTHROUGH, defaultValue: null, rows: [{ k: 'x', v: 'y' }] },
        })

        const version = await asEngine({ scope: 'A', request: { method: 'GET', url: '/v1/engine/workflows', query: { versionId: foreignWorkflow.versionId } } })
        const connectionResponse = await asEngine({ scope: 'A', request: { method: 'GET', url: `/v1/worker/connections/${connection.externalId}` } })
        const variableResponse = await asEngine({ scope: 'A', request: { method: 'GET', url: `/v1/worker/variables/${variableName}` } })
        const tableResponse = await asEngine({ scope: 'A', request: { method: 'GET', url: `/v1/worker/mapping-tables/${table.id}` } })

        expect(version.status).toBe(404)
        expect(connectionResponse.status).toBe(404)
        expect(variableResponse.text).not.toContain('b-only-value')
        expect(tableResponse.status).toBe(404)
    })

    it('keeps the store entries of two projects apart even for the same key', async () => {
        const forA = await asEngine({ scope: 'A', request: { method: 'POST', url: '/v1/store-entries', body: { key: 'shared-key', value: 'value-of-A' } } })
        const readFromB = await asEngine({ scope: 'B', request: { method: 'GET', url: '/v1/store-entries', query: { key: 'shared-key' } } })
        const readFromA = await asEngine({ scope: 'A', request: { method: 'GET', url: '/v1/store-entries', query: { key: 'shared-key' } } })

        expect(forA.status).toBe(200)
        expect(readFromB.status).toBe(404)
        expect(readFromA.text).toContain('value-of-A')
    })

    it('does not let a project A engine ask for the approval of a run of project B', async () => {
        const foreignRun = await seed.execution({ world: currentWorld(), scope: 'B' })

        const response = await asEngine({
            scope: 'A',
            request: {
                method: 'POST',
                url: '/v1/worker/agent-approvals',
                body: { executionId: foreignRun.id, stepName: 's', waitpointId: generateId(), tool: 't', arguments: {}, message: 'm', timeoutHours: 1 },
            },
        })

        expect(response.status).toBe(403)
        expect(await db.findOneBy('agent_approval', { executionId: foreignRun.id })).toBeNull()
    })

    it('tells a project A engine only about project A', async () => {
        const w = currentWorld()
        const response = await asEngine({ scope: 'A', request: { method: 'GET', url: '/v1/worker/project' } })
        const populated = await asEngine({ scope: 'A', request: { method: 'GET', url: '/v1/engine/populated-workflows' } })

        expect(response.status).toBe(200)
        expect((response.json() as { id: string }).id).toBe(w.scopes.A.project.id)
        expect(populated.text).not.toContain(w.scopes.B.project.id)
        expect(populated.text).not.toContain(w.scopes.T2.project.id)
    })
})
