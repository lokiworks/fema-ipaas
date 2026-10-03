import { isNil } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, WORKFLOW_EXPORT_FORMAT, WORKFLOW_EXPORT_VERSION, WorkflowOperationType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { db } from '../../../helpers/db'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { seed } from '../support/seed'
import { workspaceSeed } from '../support/workspace-seed'
import { securityWorld, World, WorldRequest, WorldResponse } from '../support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (isNil(world)) {
        throw new Error('world is not ready')
    }
    return world
}

const REFUSED: readonly number[] = [400, 401, 403, 404, 409]

function expectRefused({ response }: { response: WorldResponse }): void {
    expect(REFUSED, `got ${response.status}: ${response.text.slice(0, 200)}`).toContain(response.status)
}

async function attack({ request }: { request: WorldRequest }): Promise<WorldResponse> {
    return currentWorld().send({ identity: 'projectAdmin', request })
}

async function splitRoleUser({ roleInA, roleInB }: { roleInA: DefaultProjectRole, roleInB: DefaultProjectRole }): Promise<{ token: string, userId: string }> {
    const current = currentWorld()
    const user = await securityWorld.createTenantMember({ tenantId: current.scopes.A.tenant.id })
    await securityWorld.addMember({ userId: user.id, projectId: current.scopes.A.project.id, role: roleInA })
    await securityWorld.addMember({ userId: user.id, projectId: current.scopes.B.project.id, role: roleInB })
    return { token: await securityWorld.tokenFor({ user, tenantId: current.scopes.A.tenant.id }), userId: user.id }
}

describe('workflow folders never cross a project boundary', () => {
    it('refuses to create a workflow inside a folder of another project', async () => {
        const folderInB = await workspaceSeed.folder({ world: currentWorld(), scope: 'B' })
        const response = await attack({
            request: { method: 'POST', url: '/v1/workflows', body: { displayName: 'idor-create', projectId: currentWorld().scopes.A.project.id, folderId: folderInB.id } },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'workflow', where: { folderId: folderInB.id } })).toBe(0)
    })

    it('refuses to create a workflow inside a folder of another tenant', async () => {
        const folderInT2 = await workspaceSeed.folder({ world: currentWorld(), scope: 'T2' })
        const response = await attack({
            request: { method: 'POST', url: '/v1/workflows', body: { displayName: 'idor-create-t2', projectId: currentWorld().scopes.A.project.id, folderId: folderInT2.id } },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'workflow', where: { folderId: folderInT2.id } })).toBe(0)
    })

    it('refuses to move a workflow into a folder of another project', async () => {
        const workflow = await seed.workflow({ world: currentWorld(), scope: 'A' })
        const folderInB = await workspaceSeed.folder({ world: currentWorld(), scope: 'B' })
        const response = await attack({
            request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: { type: WorkflowOperationType.CHANGE_FOLDER, request: { folderId: folderInB.id } } },
        })
        expectRefused({ response })
        expect((await db.findOneBy<{ folderId: string | null }>('workflow', { id: workflow.id }))?.folderId ?? null).toBeNull()
    })

    it('does not leak a foreign folder workflow count into the folder of the other project', async () => {
        const folderInB = await workspaceSeed.folder({ world: currentWorld(), scope: 'B' })
        await attack({
            request: { method: 'POST', url: '/v1/workflows', body: { displayName: 'idor-count', projectId: currentWorld().scopes.A.project.id, folderId: folderInB.id } },
        })
        const response = await currentWorld().send({ identity: 'foreignProjectAdmin', request: { method: 'GET', url: `/v1/folders/${folderInB.id}` } })
        expect(response.status).toBe(200)
        expect(JSON.stringify(response.json())).toContain('"numberOfWorkflows":0')
    })

    it('refuses to hand a workflow to a user of another tenant', async () => {
        const workflow = await seed.workflow({ world: currentWorld(), scope: 'A' })
        const foreignUserId = currentWorld().scopes.T2.ownerId
        const response = await currentWorld().send({
            identity: 'developer',
            request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: { type: WorkflowOperationType.UPDATE_OWNER, request: { ownerId: foreignUserId } } },
        })
        expectRefused({ response })
        expect((await db.findOneBy<{ ownerId: string | null }>('workflow', { id: workflow.id }))?.ownerId ?? null).not.toBe(foreignUserId)
    })
})

describe('project workspace batch endpoints ignore ids of other projects', () => {
    it('moves nothing when the workflow belongs to another project', async () => {
        const foreign = await seed.workflow({ world: currentWorld(), scope: 'B' })
        const folderInA = await workspaceSeed.folder({ world: currentWorld(), scope: 'A' })
        const response = await attack({
            request: { method: 'POST', url: '/v1/project-workspace/batch/move', body: { projectId: currentWorld().scopes.A.project.id, workflowIds: [foreign.id], folderId: folderInA.id } },
        })
        expect(JSON.stringify(response.json())).toContain('"moved":0')
        expect((await db.findOneBy<{ folderId: string | null }>('workflow', { id: foreign.id }))?.folderId ?? null).toBeNull()
    })

    it('refuses to move workflows into a folder of another project', async () => {
        const workflow = await seed.workflow({ world: currentWorld(), scope: 'A' })
        const folderInB = await workspaceSeed.folder({ world: currentWorld(), scope: 'B' })
        const response = await attack({
            request: { method: 'POST', url: '/v1/project-workspace/batch/move', body: { projectId: currentWorld().scopes.A.project.id, workflowIds: [workflow.id], folderId: folderInB.id } },
        })
        expectRefused({ response })
        expect((await db.findOneBy<{ folderId: string | null }>('workflow', { id: workflow.id }))?.folderId ?? null).toBeNull()
    })

    it('deletes nothing when the workflow belongs to another project', async () => {
        const foreign = await seed.workflow({ world: currentWorld(), scope: 'B' })
        const response = await attack({
            request: { method: 'DELETE', url: '/v1/project-workspace/batch', body: { projectId: currentWorld().scopes.A.project.id, workflowIds: [foreign.id] } },
        })
        expect(JSON.stringify(response.json())).toContain('"deleted":0')
        expect((await db.findOneBy<{ operationStatus: string }>('workflow', { id: foreign.id }))?.operationStatus).toBe('NONE')
    })

    it('publishes nothing and reports nothing when the workflow belongs to another project', async () => {
        const foreign = await workspaceSeed.validWorkflow({ world: currentWorld(), scope: 'B' })
        const check = await attack({
            request: { method: 'POST', url: '/v1/project-workspace/batch/publish-check', body: { projectId: currentWorld().scopes.A.project.id, workflowIds: [foreign.id] } },
        })
        expect(check.text).not.toContain(foreign.id)
        const publish = await attack({
            request: { method: 'POST', url: '/v1/project-workspace/batch/publish', body: { projectId: currentWorld().scopes.A.project.id, workflowIds: [foreign.id] } },
        })
        expect(publish.text).not.toContain(foreign.id)
        expect((await db.findOneBy<{ publishedVersionId: string | null }>('workflow', { id: foreign.id }))?.publishedVersionId ?? null).toBeNull()
    })

    it('refuses to copy a workflow of another project even when the body names the caller project', async () => {
        const foreign = await workspaceSeed.validWorkflow({ world: currentWorld(), scope: 'B' })
        const before = await workspaceSeed.countRows({ entity: 'workflow', where: { projectId: currentWorld().scopes.A.project.id } })
        const response = await attack({
            request: {
                method: 'POST',
                url: `/v1/project-workspace/workflows/${foreign.id}/copy`,
                body: { projectId: currentWorld().scopes.A.project.id, targetProjectId: currentWorld().scopes.A.project.id },
            },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'workflow', where: { projectId: currentWorld().scopes.A.project.id } })).toBe(before)
    })

    it('refuses to copy into a project where the caller can only read', async () => {
        const caller = await splitRoleUser({ roleInA: DefaultProjectRole.DEVELOPER, roleInB: DefaultProjectRole.VIEWER })
        const source = await workspaceSeed.validWorkflow({ world: currentWorld(), scope: 'A' })
        const before = await workspaceSeed.countRows({ entity: 'workflow', where: { projectId: currentWorld().scopes.B.project.id } })
        const response = await currentWorld().sendAsToken({
            token: caller.token,
            request: {
                method: 'POST',
                url: `/v1/project-workspace/workflows/${source.id}/copy`,
                body: { projectId: currentWorld().scopes.A.project.id, targetProjectId: currentWorld().scopes.B.project.id },
            },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'workflow', where: { projectId: currentWorld().scopes.B.project.id } })).toBe(before)
    })

    it('copies into a project where the caller can write, reading the source with read access only', async () => {
        const caller = await splitRoleUser({ roleInA: DefaultProjectRole.VIEWER, roleInB: DefaultProjectRole.DEVELOPER })
        const source = await workspaceSeed.validWorkflow({ world: currentWorld(), scope: 'A' })
        const response = await currentWorld().sendAsToken({
            token: caller.token,
            request: {
                method: 'POST',
                url: `/v1/project-workspace/workflows/${source.id}/copy`,
                body: { projectId: currentWorld().scopes.A.project.id, targetProjectId: currentWorld().scopes.B.project.id },
            },
        })
        expect(response.status).toBe(201)
    })

    it('refuses to import into a folder of another project', async () => {
        const folderInB = await workspaceSeed.folder({ world: currentWorld(), scope: 'B' })
        const name = workspaceSeed.uniqueName({ prefix: 'idor-import' })
        const response = await attack({
            request: {
                method: 'POST',
                url: '/v1/project-workspace/workflows/import',
                body: {
                    projectId: currentWorld().scopes.A.project.id,
                    folderId: folderInB.id,
                    file: {
                        format: WORKFLOW_EXPORT_FORMAT,
                        version: WORKFLOW_EXPORT_VERSION,
                        exportedAt: dayjs().toISOString(),
                        workflow: { name, trigger: workspaceSeed.emptyValidTrigger(), schemaVersion: null },
                    },
                },
            },
        })
        expectRefused({ response })
        expect(await db.findOneBy('workflow_version', { displayName: name })).toBeNull()
    })
})

describe('release endpoints stay inside the project of the caller', () => {
    it('refuses to request a release for a workflow of another project', async () => {
        const foreign = await workspaceSeed.scheduledWorkflow({ world: currentWorld(), scope: 'B' })
        await workspaceSeed.setReleaseMode({ projectId: currentWorld().scopes.A.project.id, enabled: true })
        const response = await attack({
            request: { method: 'POST', url: '/v1/workflow-releases', body: { projectId: currentWorld().scopes.A.project.id, workflowId: foreign.id, note: 'idor' } },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'workflow_release', where: { workflowId: foreign.id } })).toBe(0)
    })

    it('refuses to deploy a workflow of another project to test', async () => {
        const foreign = await workspaceSeed.validWorkflow({ world: currentWorld(), scope: 'B' })
        await workspaceSeed.setReleaseMode({ projectId: currentWorld().scopes.A.project.id, enabled: true })
        const response = await attack({
            request: { method: 'POST', url: '/v1/workflow-releases/deploy-to-test', body: { projectId: currentWorld().scopes.A.project.id, workflowId: foreign.id } },
        })
        expectRefused({ response })
        expect((await db.findOneBy<{ testVersionId: string | null }>('workflow', { id: foreign.id }))?.testVersionId ?? null).toBeNull()
    })

    it('refuses to roll back a workflow of another project', async () => {
        const foreign = await workspaceSeed.validWorkflow({ world: currentWorld(), scope: 'B', published: true })
        const response = await attack({
            request: { method: 'POST', url: '/v1/workflow-releases/rollback', body: { projectId: currentWorld().scopes.A.project.id, workflowId: foreign.id, versionId: foreign.versionId } },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'workflow_version', where: { workflowId: foreign.id } })).toBe(1)
    })

    it('refuses to decide a release of another project', async () => {
        const current = currentWorld()
        const foreign = await workspaceSeed.scheduledWorkflow({ world: current, scope: 'B' })
        const adminOfA = current.actors.projectAdmin.userId ?? ''
        const release = await workspaceSeed.release({ world: current, projectId: current.scopes.B.project.id, workflowId: foreign.id, versionId: foreign.versionId, approverIds: [adminOfA] })
        const approve = await attack({ request: { method: 'POST', url: `/v1/workflow-releases/${release.id}/approve`, body: {} } })
        expectRefused({ response: approve })
        const reject = await attack({ request: { method: 'POST', url: `/v1/workflow-releases/${release.id}/reject`, body: { comment: 'no' } } })
        expectRefused({ response: reject })
        expect((await db.findOneBy<{ status: string }>('workflow_release', { id: release.id }))?.status).toBe('PENDING')
    })

    it('refuses to list the releases or environments of another project through the caller project', async () => {
        const current = currentWorld()
        const foreign = await workspaceSeed.validWorkflow({ world: current, scope: 'B' })
        await workspaceSeed.release({ world: current, projectId: current.scopes.B.project.id, workflowId: foreign.id, versionId: foreign.versionId, approverIds: [] })
        const list = await attack({ request: { method: 'GET', url: '/v1/workflow-releases', query: { projectId: current.scopes.A.project.id, workflowId: foreign.id } } })
        expect(list.status).toBe(200)
        expect(list.text).not.toContain(foreign.id)
    })
})

describe('variables, data stores and mapping tables of another project stay out of reach', () => {
    it('refuses every variable operation on a variable of another project', async () => {
        const variable = await workspaceSeed.variable({ world: currentWorld(), scope: 'B' })
        const before = await db.findOneBy<{ value: unknown }>('variable', { id: variable.id })
        const update = await attack({ request: { method: 'POST', url: `/v1/variables/${variable.id}`, body: { value: 'hijacked' } } })
        const reveal = await attack({ request: { method: 'POST', url: `/v1/variables/${variable.id}/reveal`, body: {} } })
        const remove = await attack({ request: { method: 'DELETE', url: `/v1/variables/${variable.id}` } })
        for (const response of [update, reveal, remove]) {
            expectRefused({ response })
            expect(response.text).not.toContain(variable.value)
        }
        const after = await db.findOneBy<{ value: unknown }>('variable', { id: variable.id })
        expect(JSON.stringify(after?.value)).toBe(JSON.stringify(before?.value))
    })

    it('refuses every data store operation on a store of another project', async () => {
        const store = await workspaceSeed.dataStore({ world: currentWorld(), scope: 'B' })
        await workspaceSeed.dataStoreRecord({ world: currentWorld(), scope: 'B', storeId: store.id, key: 'k1' })
        const responses = await Promise.all([
            attack({ request: { method: 'GET', url: `/v1/data-stores/${store.id}/records` } }),
            attack({ request: { method: 'POST', url: `/v1/data-stores/${store.id}/records`, body: { mode: 'CREATE', key: 'planted', value: 'v' } } }),
            attack({ request: { method: 'DELETE', url: `/v1/data-stores/${store.id}/records`, query: { key: 'k1' } } }),
            attack({ request: { method: 'POST', url: `/v1/data-stores/${store.id}/clear`, body: {} } }),
            attack({ request: { method: 'DELETE', url: `/v1/data-stores/${store.id}` } }),
        ])
        responses.forEach((response) => expectRefused({ response }))
        expect(await workspaceSeed.countRows({ entity: 'store-entry', where: { dataStoreId: store.id } })).toBe(1)
        expect(await db.findOneBy('data_store', { id: store.id })).not.toBeNull()
    })

    it('does not let a mapping table update reach across projects through the body project id', async () => {
        const current = currentWorld()
        const tableInA = await workspaceSeed.mappingTable({ world: current, scope: 'A' })
        const tableInB = await workspaceSeed.mappingTable({ world: current, scope: 'B' })
        const hijackBody = { ...workspaceSeed.mappingTableBody({ projectId: current.scopes.B.project.id, name: tableInB.name }), description: 'hijacked' }
        const toForeignTable = await attack({ request: { method: 'POST', url: `/v1/mapping-tables/${tableInB.id}`, body: hijackBody } })
        expectRefused({ response: toForeignTable })
        const viaOwnTable = await attack({ request: { method: 'POST', url: `/v1/mapping-tables/${tableInA.id}`, body: hijackBody } })
        expectRefused({ response: viaOwnTable })
        expect((await db.findOneBy<{ description: string }>('mapping_table', { id: tableInB.id }))?.description).not.toBe('hijacked')
        expect((await db.findOneBy<{ description: string }>('mapping_table', { id: tableInA.id }))?.description).not.toBe('hijacked')
    })
})

describe('trigger and sample data endpoints stay inside the project of the caller', () => {
    it('refuses to run a step, test a trigger or save an event for a workflow of another project', async () => {
        const current = currentWorld()
        const foreign = await workspaceSeed.validWorkflow({ world: current, scope: 'B' })
        const projectId = current.scopes.A.project.id
        const responses = await Promise.all([
            attack({ request: { method: 'POST', url: '/v1/sample-data/test-step', body: { projectId, workflowVersionId: foreign.versionId, stepName: 'step_1' } } }),
            attack({ request: { method: 'POST', url: '/v1/test-trigger', body: { projectId, workflowId: foreign.id, workflowVersionId: foreign.versionId, testStrategy: 'TEST_FUNCTION' } } }),
            attack({ request: { method: 'DELETE', url: '/v1/test-trigger', body: { projectId, workflowId: foreign.id } } }),
            attack({ request: { method: 'POST', url: '/v1/trigger-events', body: { projectId, workflowId: foreign.id, mockData: { planted: true } } } }),
            attack({ request: { method: 'GET', url: '/v1/trigger-events', query: { projectId, workflowId: foreign.id } } }),
            attack({ request: { method: 'GET', url: '/v1/sample-data', query: { projectId, workflowId: foreign.id, workflowVersionId: foreign.versionId, stepName: 'trigger', type: 'OUTPUT' } } }),
        ])
        responses.forEach((response) => expectRefused({ response }))
        expect(await workspaceSeed.countRows({ entity: 'execution', where: { workflowId: foreign.id } })).toBe(0)
        expect(await workspaceSeed.countRows({ entity: 'trigger_event', where: { workflowId: foreign.id } })).toBe(0)
    })

    it('refuses to read the versions of a workflow of another project', async () => {
        const foreign = await seed.workflow({ world: currentWorld(), scope: 'B' })
        const response = await attack({ request: { method: 'GET', url: `/v1/workflows/${foreign.id}/versions` } })
        expectRefused({ response })
    })
})

describe('solutions and templates stay inside the project of the caller', () => {
    it('refuses to package a workflow of another project', async () => {
        const current = currentWorld()
        const foreign = await workspaceSeed.validWorkflow({ world: current, scope: 'B', published: true })
        const name = workspaceSeed.uniqueName({ prefix: 'idor-solution' })
        const response = await attack({
            request: {
                method: 'POST',
                url: '/v1/solutions',
                body: { projectId: current.scopes.A.project.id, workflowIds: [foreign.id], name, summary: 's', category: 'HR', visibility: 'TENANT', manualChecks: [] },
            },
        })
        expectRefused({ response })
        expect(await db.findOneBy('solution', { name })).toBeNull()
    })

    it('refuses to turn a workflow of another project into a template', async () => {
        const current = currentWorld()
        const foreign = await workspaceSeed.validWorkflow({ world: current, scope: 'B', published: true })
        const name = workspaceSeed.uniqueName({ prefix: 'idor-template' })
        const response = await attack({
            request: {
                method: 'POST',
                url: '/v1/templates/from-workflow',
                body: { projectId: current.scopes.A.project.id, workflowId: foreign.id, name, description: 'd', category: 'HR', blogUrl: '', visibility: 'TENANT' },
            },
        })
        expectRefused({ response })
        expect(await db.findOneBy('template', { name })).toBeNull()
    })

    it('refuses to install a solution into a project the caller does not belong to', async () => {
        const current = currentWorld()
        const solution = await workspaceSeed.solution({ world: current, scope: 'A' })
        const response = await attack({
            request: {
                method: 'POST',
                url: `/v1/solutions/${solution.id}/install`,
                body: { projectId: current.scopes.B.project.id, connections: {}, config: {}, acknowledgedChecks: [] },
            },
        })
        expectRefused({ response })
        expect(await workspaceSeed.countRows({ entity: 'solution_install', where: { solutionId: solution.id } })).toBe(0)
    })

    it('refuses to upgrade an install of a project the caller can only read', async () => {
        const current = currentWorld()
        const solution = await workspaceSeed.solution({ world: current, scope: 'A', newerVersion: true })
        const install = await workspaceSeed.solutionInstall({ world: current, scope: 'A', solutionId: solution.id })
        const response = await current.send({ identity: 'viewer', request: { method: 'POST', url: `/v1/solutions/installs/${install.id}/upgrade`, body: {} } })
        expectRefused({ response })
        expect((await db.findOneBy<{ version: string }>('solution_install', { id: install.id }))?.version).toBe('1.0')
    })

    it('hides the installs of a project the caller cannot read', async () => {
        const current = currentWorld()
        const solution = await workspaceSeed.solution({ world: current, scope: 'A' })
        const install = await workspaceSeed.solutionInstall({ world: current, scope: 'A', solutionId: solution.id })
        const outsider = await current.send({ identity: 'foreignProjectAdmin', request: { method: 'GET', url: '/v1/solutions/installs', query: { projectId: current.scopes.A.project.id } } })
        expect(outsider.status).toBe(200)
        expect(outsider.text).not.toContain(install.id)
    })
})
