import { Permission } from '@fema-ipaas/core-utils'
import { SolutionVisibility, TemplateType, TemplateVisibility } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { Access, MatrixCase, MatrixHookParams } from '../support/matrix'
import { workspaceSeed } from '../support/workspace-seed'
import { Identity, Scope, World } from '../support/world'

const OUTSIDERS: readonly Identity[] = ['nonMember', 'foreignProjectAdmin', 'otherTenantAdmin']

function installBody({ world, scope }: { world: World, scope: Scope }): Record<string, unknown> {
    return { projectId: world.scopes[scope].project.id, connections: {}, config: {}, acknowledgedChecks: [] }
}

function visibilityHook({ mustSee }: { mustSee: boolean }): (params: MatrixHookParams) => Promise<void> {
    return async ({ prepared, response, identity }) => {
        const marker = String(prepared.state?.marker)
        const insider = !OUTSIDERS.includes(identity)
        if (mustSee && insider) {
            expect(response.text).toContain(marker)
            return
        }
        if (OUTSIDERS.includes(identity)) {
            expect(response.text).not.toContain(marker)
        }
    }
}

function customCreator({ identities }: { identities: readonly Identity[] }): Access {
    return { type: 'custom', allow: identities }
}

export const workspaceSolutionCases: MatrixCase[] = [
    {
        id: 'GET /v1/solutions',
        label: 'a project-visible solution is listed only to readers of its source project',
        access: { type: 'authenticated' },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope, visibility: SolutionVisibility.PROJECT, sourceProjectId: world.scopes[scope].project.id })
            return { request: { method: 'GET', url: '/v1/solutions' }, state: { marker: solution.id } }
        },
        afterAllowed: visibilityHook({ mustSee: true }),
    },
    {
        id: 'GET /v1/solutions/:id',
        label: 'a project-visible solution is readable by readers of its source project only',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope, visibility: SolutionVisibility.PROJECT, sourceProjectId: world.scopes[scope].project.id })
            return { request: { method: 'GET', url: `/v1/solutions/${solution.id}` } }
        },
    },
    {
        id: 'GET /v1/solutions/installs',
        label: 'installs are listed only for projects the caller can read',
        access: { type: 'authenticated' },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope })
            const install = await workspaceSeed.solutionInstall({ world, scope, solutionId: solution.id })
            return { request: { method: 'GET', url: '/v1/solutions/installs' }, state: { marker: install.id } }
        },
        afterAllowed: visibilityHook({ mustSee: true }),
    },
    {
        id: 'POST /v1/solutions',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const workflow = await workspaceSeed.validWorkflow({ world, scope, published: true })
            const name = workspaceSeed.uniqueName({ prefix: 'sec-solution' })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/solutions',
                    body: { projectId: world.scopes[scope].project.id, workflowIds: [workflow.id], name, summary: 'sec', category: 'HR', visibility: SolutionVisibility.PROJECT, manualChecks: [] },
                },
                state: { name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('solution', { name: String(prepared.state?.name) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/solutions/:id/versions',
        label: 'only the creator, while still allowed to write the source project',
        access: customCreator({ identities: ['developer'] }),
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({
                world,
                scope,
                createdBy: world.actors.developer.userId ?? world.scopes[scope].ownerId,
                sourceProjectId: world.scopes[scope].project.id,
            })
            return { request: { method: 'POST', url: `/v1/solutions/${solution.id}/versions`, body: { notes: 'v2' } }, state: { solutionId: solution.id } }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ currentVersion: string }>('solution', { id: String(prepared.state?.solutionId) })
            expect(row?.currentVersion).toBe('1.0')
        },
    },
    {
        id: 'POST /v1/solutions/:id/preview',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope })
            return { request: { method: 'POST', url: `/v1/solutions/${solution.id}/preview`, body: { projectId: world.scopes[scope].project.id, connections: {}, config: {} } } }
        },
    },
    {
        id: 'POST /v1/solutions/:id/checks',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope })
            return { request: { method: 'POST', url: `/v1/solutions/${solution.id}/checks`, body: { projectId: world.scopes[scope].project.id, connections: {} } } }
        },
    },
    {
        id: 'POST /v1/solutions/:id/install',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope })
            return { request: { method: 'POST', url: `/v1/solutions/${solution.id}/install`, body: installBody({ world, scope }) }, state: { solutionId: solution.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'solution_install', where: { solutionId: String(prepared.state?.solutionId) } })).toBe(0)
        },
    },
    {
        id: 'POST /v1/solutions/installs/:installId/upgrade',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const solution = await workspaceSeed.solution({ world, scope, newerVersion: true })
            const install = await workspaceSeed.solutionInstall({ world, scope, solutionId: solution.id })
            return { request: { method: 'POST', url: `/v1/solutions/installs/${install.id}/upgrade`, body: {} }, state: { installId: install.id } }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ version: string }>('solution_install', { id: String(prepared.state?.installId) })
            expect(row?.version).toBe('1.0')
        },
    },
]

function templateCase({ id, method, url, body, allow, expectOk, afterDenied }: TemplateCaseParams): MatrixCase {
    return {
        id,
        access: { type: 'custom', allow },
        expectOk,
        prepare: async ({ world, scope }) => {
            const template = await workspaceSeed.template({
                world,
                scope,
                createdBy: world.actors.developer.userId ?? world.scopes[scope].ownerId,
                visibility: TemplateVisibility.TENANT,
            })
            return { request: { method, url: url({ templateId: template.id }), ...(body === undefined ? {} : { body }) }, state: { templateId: template.id } }
        },
        afterDenied,
    }
}

export const workspaceTemplateCases: MatrixCase[] = [
    {
        id: 'POST /v1/templates',
        label: 'CUSTOM templates belong to the tenant admin',
        access: { type: 'tenantAdminSelf' },
        expectOk: [201],
        prepare: async () => {
            const name = workspaceSeed.uniqueName({ prefix: 'sec-template' })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/templates',
                    body: { name, summary: 's', description: 'd', tags: [], author: 'sec', categories: [], type: TemplateType.CUSTOM, workflows: [workspaceSeed.templateWorkflowBody()] },
                },
                state: { name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('template', { name: String(prepared.state?.name) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/templates',
        label: 'SHARED templates may be created by any signed-in member (public by id, by design)',
        access: { type: 'authenticated' },
        expectOk: [201],
        prepare: async () => {
            const name = workspaceSeed.uniqueName({ prefix: 'sec-shared' })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/templates',
                    body: { name, summary: 's', description: 'd', tags: [], author: 'sec', categories: [], type: TemplateType.SHARED, workflows: [workspaceSeed.templateWorkflowBody()] },
                },
            }
        },
    },
    templateCase({
        id: 'POST /v1/templates/:id',
        method: 'POST',
        url: ({ templateId }) => `/v1/templates/${templateId}`,
        body: { description: 'changed-by-matrix' },
        allow: ['developer', 'tenantAdmin'],
        expectOk: [200],
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ description: string }>('template', { id: String(prepared.state?.templateId) })
            expect(row?.description).not.toBe('changed-by-matrix')
        },
    }),
    templateCase({
        id: 'DELETE /v1/templates/:id',
        method: 'DELETE',
        url: ({ templateId }) => `/v1/templates/${templateId}`,
        allow: ['developer', 'tenantAdmin'],
        expectOk: [204],
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('template', { id: String(prepared.state?.templateId) })).not.toBeNull()
        },
    }),
    {
        id: 'POST /v1/templates/:id/usage',
        access: { type: 'tenantMember' },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const template = await workspaceSeed.template({ world, scope, createdBy: world.actors.developer.userId ?? world.scopes[scope].ownerId, visibility: TemplateVisibility.TENANT })
            return { request: { method: 'POST', url: `/v1/templates/${template.id}/usage`, body: {} }, state: { templateId: template.id } }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ usageCount: number }>('template', { id: String(prepared.state?.templateId) })
            expect(row?.usageCount).toBe(0)
        },
    },
    {
        id: 'POST /v1/templates/from-workflow',
        access: { type: 'project', permission: Permission.MANAGE_TEMPLATE },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const workflow = await workspaceSeed.validWorkflow({ world, scope, published: true })
            const name = workspaceSeed.uniqueName({ prefix: 'sec-from-workflow' })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/templates/from-workflow',
                    body: { projectId: world.scopes[scope].project.id, workflowId: workflow.id, name, description: 'd', category: 'HR', blogUrl: '', visibility: TemplateVisibility.TENANT },
                },
                state: { name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('template', { name: String(prepared.state?.name) })).toBeNull()
        },
    },
]

type TemplateCaseParams = {
    id: string
    method: 'POST' | 'DELETE'
    url: (params: { templateId: string }) => string
    body?: Record<string, unknown>
    allow: readonly Identity[]
    expectOk: readonly number[]
    afterDenied: (params: MatrixHookParams) => Promise<void>
}
