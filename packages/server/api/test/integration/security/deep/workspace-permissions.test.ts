import { isNil } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, TemplateType, TemplateVisibility, WorkflowOperationType, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { db } from '../../../helpers/db'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { seed } from '../support/seed'
import { workspaceSeed } from '../support/workspace-seed'
import { Identity, securityWorld, World, WorldRequest, WorldResponse } from '../support/world'

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

function as({ identity, request }: { identity: Identity, request: WorldRequest }): Promise<WorldResponse> {
    return currentWorld().send({ identity, request })
}

function userId({ identity }: { identity: Identity }): string {
    return currentWorld().actors[identity].userId ?? ''
}

describe('the operator may switch a workflow on or off and nothing else', () => {
    it('lets the operator change the status', async () => {
        const workflow = await seed.workflow({ world: currentWorld(), scope: 'A' })
        const response = await as({
            identity: 'operator',
            request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: { type: WorkflowOperationType.CHANGE_STATUS, request: { status: WorkflowStatus.DISABLED } } },
        })
        expect(response.status).toBe(200)
    })

    it('refuses the operator every operation that edits, moves, hands over or publishes the workflow', async () => {
        const current = currentWorld()
        const workflow = await workspaceSeed.validWorkflow({ world: current, scope: 'A' })
        await workspaceSeed.setReleaseMode({ projectId: current.scopes.A.project.id, enabled: false })
        const folder = await workspaceSeed.folder({ world: current, scope: 'A' })
        const operations: Record<string, unknown>[] = [
            { type: WorkflowOperationType.CHANGE_NAME, request: { displayName: 'operator-rename' } },
            { type: WorkflowOperationType.CHANGE_FOLDER, request: { folderId: folder.id } },
            { type: WorkflowOperationType.UPDATE_OWNER, request: { ownerId: userId({ identity: 'operator' }) } },
            { type: WorkflowOperationType.UPDATE_METADATA, request: { metadata: { description: 'operator' } } },
            { type: WorkflowOperationType.LOCK_WORKFLOW, request: {} },
            { type: WorkflowOperationType.LOCK_AND_PUBLISH, request: { status: WorkflowStatus.DISABLED } },
            { type: WorkflowOperationType.DELETE_ACTION, request: { names: ['step_1'] } },
        ]
        for (const operation of operations) {
            const response = await as({ identity: 'operator', request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: operation } })
            expect(response.status, `${String(operation.type)} got ${response.status}`).toBe(403)
        }
        const row = await db.findOneBy<{ publishedVersionId: string | null, folderId: string | null, ownerId: string | null }>('workflow', { id: workflow.id })
        expect(row?.publishedVersionId ?? null).toBeNull()
        expect(row?.folderId ?? null).toBeNull()
        expect(row?.ownerId ?? null).not.toBe(userId({ identity: 'operator' }))
        expect(await workspaceSeed.countRows({ entity: 'workflow_version', where: { workflowId: workflow.id, state: 'LOCKED' } })).toBe(0)
        const version = await db.findOneBy<{ displayName: string, trigger: { nextAction?: { name: string } } }>('workflow_version', { workflowId: workflow.id })
        expect(version?.displayName).not.toBe('operator-rename')
        expect(version?.trigger.nextAction?.name).toBe('step_1')
    })

    it('lets a developer publish but not a viewer', async () => {
        const current = currentWorld()
        await workspaceSeed.setReleaseMode({ projectId: current.scopes.A.project.id, enabled: false })
        const workflow = await workspaceSeed.validWorkflow({ world: current, scope: 'A' })
        const body = { type: WorkflowOperationType.LOCK_AND_PUBLISH, request: { status: WorkflowStatus.DISABLED } }
        const viewer = await as({ identity: 'viewer', request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body } })
        expect(viewer.status).toBe(403)
        const developer = await as({ identity: 'developer', request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body } })
        expect(developer.status).toBe(200)
    })
})

describe('environments keep the approval step', () => {
    it('refuses a direct publish while the project has test and production environments', async () => {
        const current = currentWorld()
        await workspaceSeed.setReleaseMode({ projectId: current.scopes.A.project.id, enabled: true, approverIds: [userId({ identity: 'projectAdmin' })] })
        const workflow = await workspaceSeed.validWorkflow({ world: current, scope: 'A' })
        const response = await as({
            identity: 'developer',
            request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: { type: WorkflowOperationType.LOCK_AND_PUBLISH, request: { status: WorkflowStatus.DISABLED } } },
        })
        expect([403, 409]).toContain(response.status)
        expect((await db.findOneBy<{ publishedVersionId: string | null }>('workflow', { id: workflow.id }))?.publishedVersionId ?? null).toBeNull()
    })

    it('deploys a batch publish to test only, never straight to production', async () => {
        const current = currentWorld()
        await workspaceSeed.setReleaseMode({ projectId: current.scopes.A.project.id, enabled: true, approverIds: [userId({ identity: 'projectAdmin' })] })
        const workflow = await workspaceSeed.validWorkflow({ world: current, scope: 'A' })
        const response = await as({
            identity: 'developer',
            request: { method: 'POST', url: '/v1/project-workspace/batch/publish', body: { projectId: current.scopes.A.project.id, workflowIds: [workflow.id] } },
        })
        expect(response.status).toBe(200)
        expect((await db.findOneBy<{ publishedVersionId: string | null }>('workflow', { id: workflow.id }))?.publishedVersionId ?? null).toBeNull()
    })

    it('does not let a requester approve their own release while another approver exists', async () => {
        const current = currentWorld()
        const developer = userId({ identity: 'developer' })
        const admin = userId({ identity: 'projectAdmin' })
        await workspaceSeed.setReleaseMode({ projectId: current.scopes.A.project.id, enabled: true, approverIds: [developer, admin] })
        const workflow = await workspaceSeed.scheduledWorkflow({ world: current, scope: 'A' })
        const release = await workspaceSeed.release({
            world: current,
            projectId: current.scopes.A.project.id,
            workflowId: workflow.id,
            versionId: workflow.versionId,
            requestedBy: developer,
            approverIds: [developer, admin],
        })
        const response = await as({ identity: 'developer', request: { method: 'POST', url: `/v1/workflow-releases/${release.id}/approve`, body: {} } })
        expect(response.status).toBe(403)
        expect((await db.findOneBy<{ status: string }>('workflow_release', { id: release.id }))?.status).toBe('PENDING')
    })

    it('refuses approvers who are not allowed to edit the project', async () => {
        const current = currentWorld()
        const response = await as({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/workflow-releases/environments', body: { projectId: current.scopes.A.project.id, enabled: true, approverIds: [userId({ identity: 'viewer' })] } },
        })
        expect([403, 409]).toContain(response.status)
        const project = await db.findOneBy<{ releaseApproverIds: string[] }>('project', { id: current.scopes.A.project.id })
        expect(project?.releaseApproverIds ?? []).not.toContain(userId({ identity: 'viewer' }))
    })
})

describe('variables never leave the server in clear text except through reveal', () => {
    it('hides the value and the test value from every role in every read and write response', async () => {
        const current = currentWorld()
        const variable = await workspaceSeed.variable({ world: current, scope: 'A' })
        await as({ identity: 'projectAdmin', request: { method: 'POST', url: `/v1/variables/${variable.id}`, body: { testValue: 'test-secret-value' } } })
        const roles: Identity[] = ['viewer', 'operator', 'developer', 'projectAdmin', 'tenantAdmin']
        for (const identity of roles) {
            const list = await as({ identity, request: { method: 'GET', url: '/v1/variables', query: { projectId: current.scopes.A.project.id } } })
            expect(list.status).toBe(200)
            expect(list.text).not.toContain(variable.value)
            expect(list.text).not.toContain('test-secret-value')
        }
    })

    it('reveals the value only to roles that can manage variables', async () => {
        const current = currentWorld()
        const variable = await workspaceSeed.variable({ world: current, scope: 'A' })
        const denied: Identity[] = ['viewer', 'operator']
        for (const identity of denied) {
            const response = await as({ identity, request: { method: 'POST', url: `/v1/variables/${variable.id}/reveal`, body: {} } })
            expect(response.status).toBe(403)
            expect(response.text).not.toContain(variable.value)
        }
        const allowed = await as({ identity: 'developer', request: { method: 'POST', url: `/v1/variables/${variable.id}/reveal`, body: {} } })
        expect(allowed.status).toBe(200)
        expect(allowed.text).toContain(variable.value)
    })
})

describe('solutions are repackaged only by people who can still edit the source project', () => {
    async function developerSolution(): Promise<{ solutionId: string, developerId: string }> {
        const current = currentWorld()
        const developerId = userId({ identity: 'developer' })
        const solution = await workspaceSeed.solution({ world: current, scope: 'A', createdBy: developerId, sourceProjectId: current.scopes.A.project.id })
        return { solutionId: solution.id, developerId }
    }

    it('lets the creator publish a new version while they can edit the project', async () => {
        const { solutionId } = await developerSolution()
        const response = await as({ identity: 'developer', request: { method: 'POST', url: `/v1/solutions/${solutionId}/versions`, body: { notes: 'v2' } } })
        expect(response.status).toBe(200)
    })

    it('refuses the creator once they were demoted to viewer of the source project', async () => {
        const current = currentWorld()
        const creator = await securityWorld.createTenantMember({ tenantId: current.scopes.A.tenant.id })
        await securityWorld.addMember({ userId: creator.id, projectId: current.scopes.A.project.id, role: DefaultProjectRole.DEVELOPER })
        const token = await securityWorld.tokenFor({ user: creator, tenantId: current.scopes.A.tenant.id })
        const solution = await workspaceSeed.solution({ world: current, scope: 'A', createdBy: creator.id, sourceProjectId: current.scopes.A.project.id })
        await db.update('project_member', (await db.findOneByOrFail<{ id: string }>('project_member', { userId: creator.id, projectId: current.scopes.A.project.id })).id, { role: DefaultProjectRole.VIEWER })
        const response = await current.sendAsToken({ token, request: { method: 'POST', url: `/v1/solutions/${solution.id}/versions`, body: { notes: 'sneaky' } } })
        expect(response.status).toBe(403)
        expect(await workspaceSeed.countRows({ entity: 'solution_version', where: { solutionId: solution.id } })).toBe(1)
    })

    it('refuses the creator once they left the source project', async () => {
        const current = currentWorld()
        const creator = await securityWorld.createTenantMember({ tenantId: current.scopes.A.tenant.id })
        const token = await securityWorld.tokenFor({ user: creator, tenantId: current.scopes.A.tenant.id })
        const solution = await workspaceSeed.solution({ world: current, scope: 'A', createdBy: creator.id, sourceProjectId: current.scopes.A.project.id })
        const response = await current.sendAsToken({ token, request: { method: 'POST', url: `/v1/solutions/${solution.id}/versions`, body: { notes: 'sneaky' } } })
        expect(response.status).toBe(403)
        expect(await workspaceSeed.countRows({ entity: 'solution_version', where: { solutionId: solution.id } })).toBe(1)
    })

    it('answers 403 rather than a validation error to a member who did not create the solution', async () => {
        const { solutionId } = await developerSolution()
        const response = await as({ identity: 'projectAdmin', request: { method: 'POST', url: `/v1/solutions/${solutionId}/versions`, body: { notes: 'not mine' } } })
        expect(response.status).toBe(403)
    })
})

describe('templates belong to their tenant', () => {
    async function createTenantTemplate(): Promise<string> {
        const response = await as({
            identity: 'tenantAdmin',
            request: {
                method: 'POST',
                url: '/v1/templates',
                body: {
                    name: workspaceSeed.uniqueName({ prefix: 'sec-tenant-template' }),
                    summary: 's',
                    description: 'd',
                    tags: [],
                    author: 'sec',
                    categories: [],
                    type: TemplateType.CUSTOM,
                    workflows: [workspaceSeed.templateWorkflowBody()],
                },
            },
        })
        expect(response.status).toBe(201)
        const created = response.json()
        if (typeof created === 'object' && created !== null && 'id' in created && typeof created.id === 'string') {
            return created.id
        }
        throw new Error('template has no id')
    }

    it('serves a template maintained by the tenant admin by id to everyone as documented in brain/knowledge/workflows-execution/templates.md, but never lists it to another tenant', async () => {
        const templateId = await createTenantTemplate()
        const own = await as({ identity: 'viewer', request: { method: 'GET', url: `/v1/templates/${templateId}` } })
        const foreign = await as({ identity: 'otherTenantAdmin', request: { method: 'GET', url: `/v1/templates/${templateId}` } })
        const foreignList = await as({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/templates' } })
        expect([own.status, foreign.status]).toEqual([200, 200])
        expect(foreignList.text).not.toContain(templateId)
    })

    it('keeps a private custom template invisible to other members of the tenant', async () => {
        const current = currentWorld()
        const template = await workspaceSeed.template({ world: current, scope: 'A', createdBy: userId({ identity: 'developer' }), visibility: TemplateVisibility.PRIVATE })
        const owner = await as({ identity: 'developer', request: { method: 'GET', url: `/v1/templates/${template.id}` } })
        expect(owner.status).toBe(200)
        const other = await as({ identity: 'viewer', request: { method: 'GET', url: `/v1/templates/${template.id}` } })
        expect(other.status).toBe(404)
    })

    it('lets only the creator or a tenant admin change or delete a custom template', async () => {
        const current = currentWorld()
        const template = await workspaceSeed.template({ world: current, scope: 'A', createdBy: userId({ identity: 'developer' }), visibility: TemplateVisibility.TENANT })
        const stranger = await as({ identity: 'projectAdmin', request: { method: 'POST', url: `/v1/templates/${template.id}`, body: { description: 'defaced' } } })
        expect(stranger.status).toBe(403)
        const strangerDelete = await as({ identity: 'projectAdmin', request: { method: 'DELETE', url: `/v1/templates/${template.id}` } })
        expect(strangerDelete.status).toBe(403)
        expect(await db.findOneBy('template', { id: template.id })).not.toBeNull()
    })
})
