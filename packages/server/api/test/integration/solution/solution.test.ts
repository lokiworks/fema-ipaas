import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, SolutionPackage, WorkflowActionType, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function savePublishedWorkflow({ ctx, name }: { ctx: TestContext, name: string }): Promise<string> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    const version = createMockWorkflowVersion({
        workflowId: workflow.id,
        displayName: name,
        state: WorkflowVersionState.LOCKED,
        valid: true,
        trigger: {
            type: WorkflowTriggerType.EMPTY,
            name: 'trigger',
            settings: {},
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: dayjs().toISOString(),
            nextAction: {
                type: WorkflowActionType.CODE,
                name: 'step_1',
                valid: true,
                displayName: 'Code',
                lastUpdatedDate: dayjs().toISOString(),
                settings: {
                    sourceCodeHash: 'x',
                    input: {},
                    sourceCode: { code: 'export const code = async () => 1', packageJson: '{}' },
                },
            },
        },
    })
    await db.save('workflow', workflow)
    await db.save('workflow_version', version)
    await db.save('workflow', { ...workflow, publishedVersionId: version.id })
    return workflow.id
}

function createBody({ ctx, workflowIds, name = 'People sync' }: { ctx: TestContext, workflowIds: string[], name?: string }): Record<string, unknown> {
    return {
        projectId: ctx.project.id,
        workflowIds,
        name,
        summary: 'Keep people in step',
        category: 'HR',
        visibility: 'TENANT',
        manualChecks: [{ label: 'The app can see every department' }],
    }
}


async function fetchInstall({ ctx, installId }: { ctx: TestContext, installId: string }): Promise<{ id: string, version: string, workflowIds: string[], skippedChecks: string[] }> {
    const installs: { id: string, version: string, workflowIds: string[], skippedChecks: string[] }[] = (await ctx.get('/v1/solutions/installs', { projectId: ctx.project.id })).json()
    return installs.find((install) => install.id === installId)!
}

async function publishPackageVersion({ ctx, solutionId, version, pkg }: { ctx: TestContext, solutionId: string, version: string, pkg: SolutionPackage }): Promise<void> {
    await db.save('solution_version', { id: generateId(), solutionId, version, notes: `notes ${version}`, package: pkg, publishedBy: ctx.user.id })
    await db.update('solution', solutionId, { currentVersion: version })
}

function renamed({ pkg, key, name }: { pkg: SolutionPackage, key: string, name: string }): SolutionPackage['workflows'][number] {
    return { ...pkg.workflows.find((workflow) => workflow.key === key)!, name }
}

async function draftName({ ctx, workflowId }: { ctx: TestContext, workflowId: string }): Promise<string> {
    const workflow = (await ctx.get(`/v1/workflows/${workflowId}`)).json()
    return workflow.version.displayName
}

async function workflowCount({ ctx }: { ctx: TestContext }): Promise<number> {
    return databaseConnection().getRepository('workflow').countBy({ projectId: ctx.project.id })
}

const installBody = ({ ctx, acknowledgedChecks = [] }: { ctx: TestContext, acknowledgedChecks?: string[] }) => ({
    projectId: ctx.project.id,
    connections: {},
    config: {},
    acknowledgedChecks,
})

describe('Solutions API', () => {
    it('starts with an empty library instead of failing', async () => {
        const ctx = await createTestContext(app!)
        const response = await ctx.get('/v1/solutions')
        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json()).toEqual([])
    })

    it('refuses to package a workflow that was never published', async () => {
        const ctx = await createTestContext(app!)
        const workflow = createMockWorkflow({ projectId: ctx.project.id })
        await db.save('workflow', workflow)
        await db.save('workflow_version', createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.DRAFT }))

        const response = await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflow.id] }))

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('packages published workflows into version 1.0 and lists it', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })

        const created = await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))
        expect(created.statusCode).toBe(StatusCodes.CREATED)
        const detail = created.json()
        expect(detail.currentVersion).toBe('1.0')
        expect(detail.workflowCount).toBe(1)
        expect(detail.package.workflows[0].name).toBe('Onboard')
        expect(detail.package.checks.some((check: { kind: string }) => check.kind === 'MANUAL')).toBe(true)

        const list = await ctx.get('/v1/solutions')
        expect(list.json().map((solution: { id: string }) => solution.id)).toEqual([detail.id])
    })

    it('keeps another tenant from seeing the solution', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx: owner, name: 'Onboard' })
        const created = (await owner.post('/v1/solutions', createBody({ ctx: owner, workflowIds: [workflowId] }))).json()

        expect((await outsider.get('/v1/solutions')).json()).toEqual([])
        expect((await outsider.get(`/v1/solutions/${created.id}`)).statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('installs as draft workflows, records the install and counts it', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()

        const preview = await ctx.post(`/v1/solutions/${solution.id}/preview`, { projectId: ctx.project.id, connections: {}, config: {} })
        expect(preview.statusCode).toBe(StatusCodes.OK)
        expect(preview.json().workflows).toHaveLength(1)
        expect(preview.json().capacityError).toBeNull()

        const install = await ctx.post(`/v1/solutions/${solution.id}/install`, {
            projectId: ctx.project.id,
            connections: {},
            config: {},
            acknowledgedChecks: [],
        })
        expect(install.statusCode).toBe(StatusCodes.CREATED)
        const result = install.json()
        expect(result.workflows).toHaveLength(1)
        expect(result.install.version).toBe('1.0')

        const installs = await ctx.get('/v1/solutions/installs', { projectId: ctx.project.id })
        expect(installs.json().map((entry: { id: string }) => entry.id)).toEqual([result.install.id])

        const detail = await ctx.get(`/v1/solutions/${solution.id}`)
        expect(detail.json().installCount).toBe(1)
    })

    it('upgrades an install after a new version is published', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()
        const installed = (await ctx.post(`/v1/solutions/${solution.id}/install`, {
            projectId: ctx.project.id,
            connections: {},
            config: {},
            acknowledgedChecks: [],
        })).json()

        const published = await ctx.post(`/v1/solutions/${solution.id}/versions`, { notes: 'Second version' })
        expect(published.statusCode).toBe(StatusCodes.OK)
        expect(published.json().currentVersion).toBe('1.1')

        const [stale] = (await ctx.get('/v1/solutions/installs', { projectId: ctx.project.id })).json()
        expect(stale.version).toBe('1.0')
        expect(stale.latestVersion).toBe('1.1')

        const upgraded = await ctx.post(`/v1/solutions/installs/${installed.install.id}/upgrade`)
        expect(upgraded.statusCode).toBe(StatusCodes.OK)
        expect(upgraded.json().version).toBe('1.1')

        const again = await ctx.post(`/v1/solutions/installs/${installed.install.id}/upgrade`)
        expect(again.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('does not let a read-only member install into the project', async () => {
        const ctx = await createTestContext(app!)
        const viewer = await createMemberContext(app!, ctx, { projectRole: DefaultProjectRole.VIEWER })
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()

        const response = await viewer.post(`/v1/solutions/${solution.id}/install`, {
            projectId: ctx.project.id,
            connections: {},
            config: {},
            acknowledgedChecks: [],
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('only lets the creator publish a new version', async () => {
        const ctx = await createTestContext(app!)
        const editor = await createMemberContext(app!, ctx, { projectRole: DefaultProjectRole.EDITOR })
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()

        const response = await editor.post(`/v1/solutions/${solution.id}/versions`, { notes: 'Mine now' })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
    it('packages a workflow once even when its id is sent twice', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })

        const created = await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId, workflowId] }))

        expect(created.statusCode).toBe(StatusCodes.CREATED)
        expect(created.json().workflowCount).toBe(1)
        expect(created.json().package.workflows).toHaveLength(1)
    })

    it('records every recommended check that did not pass as skipped, acknowledged or not', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', {
            ...createBody({ ctx, workflowIds: [workflowId] }),
            manualChecks: [{ label: 'Scope granted' }, { label: 'Departments mapped' }],
        })).json()

        const install = await ctx.post(`/v1/solutions/${solution.id}/install`, installBody({ ctx, acknowledgedChecks: ['manual:1'] }))

        expect(install.statusCode).toBe(StatusCodes.CREATED)
        expect(install.json().skippedChecks).toEqual(['Scope granted', 'Departments mapped'])
        expect(install.json().install.skippedChecks).toEqual(['Scope granted', 'Departments mapped'])
    })

    it('refuses to install into a project without room for the workflows and creates nothing', async () => {
        const ctx = await createTestContext(app!)
        const first = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const second = await savePublishedWorkflow({ ctx, name: 'Offboard' })
        await db.update('project', ctx.project.id, { workflowsLimit: 3 })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [first, second] }))).json()
        const before = await workflowCount({ ctx })

        const preview = await ctx.post(`/v1/solutions/${solution.id}/preview`, { projectId: ctx.project.id, connections: {}, config: {} })
        const install = await ctx.post(`/v1/solutions/${solution.id}/install`, installBody({ ctx }))

        expect(preview.json().capacityError).not.toBeNull()
        expect(install.statusCode).toBe(StatusCodes.CONFLICT)
        expect(await workflowCount({ ctx })).toBe(before)
    })

    describe('upgrading across several versions', () => {
        async function installedWithThree({ ctx }: { ctx: TestContext }) {
            const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name) => savePublishedWorkflow({ ctx, name })))
            const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [a, b, c] }))).json()
            const installed = (await ctx.post(`/v1/solutions/${solution.id}/install`, installBody({ ctx }))).json()
            const pkg: SolutionPackage = solution.package
            const keys = pkg.workflows.map((workflow) => workflow.key)
            return { solution, installId: installed.install.id as string, pkg, keyA: keys[0], keyB: keys[1], keyC: keys[2], idsV1: installed.install.workflowIds as string[] }
        }

        it('keeps each workflow tied to its own draft when flows leave, come back and change order', async () => {
            const ctx = await createTestContext(app!)
            const { solution, installId, pkg, keyA, keyB, keyC, idsV1 } = await installedWithThree({ ctx })
            const [idA, idB, idC] = idsV1
            const extra = { ...renamed({ pkg, key: keyA, name: 'D v2' }), key: 'extra-d' }

            await publishPackageVersion({ ctx, solutionId: solution.id, version: '1.1', pkg: { ...pkg, workflows: [renamed({ pkg, key: keyA, name: 'A v2' }), renamed({ pkg, key: keyC, name: 'C v2' }), extra] } })
            expect((await ctx.post(`/v1/solutions/installs/${installId}/upgrade`)).statusCode).toBe(StatusCodes.OK)
            const afterV2 = await fetchInstall({ ctx, installId })
            const idD = afterV2.workflowIds[2]
            expect(afterV2.workflowIds).toEqual([idA, idC, idD, idB])
            expect(await draftName({ ctx, workflowId: idA })).toBe('A v2')
            expect(await draftName({ ctx, workflowId: idC })).toBe('C v2')
            expect(await draftName({ ctx, workflowId: idD })).toBe('D v2')
            expect(await draftName({ ctx, workflowId: idB })).toBe('B (2)')

            await publishPackageVersion({ ctx, solutionId: solution.id, version: '1.2', pkg: { ...pkg, workflows: [renamed({ pkg, key: keyB, name: 'B v3' }), renamed({ pkg, key: keyA, name: 'A v3' }), { ...extra, name: 'D v3' }] } })
            expect((await ctx.post(`/v1/solutions/installs/${installId}/upgrade`)).statusCode).toBe(StatusCodes.OK)
            const afterV3 = await fetchInstall({ ctx, installId })

            expect(afterV3.version).toBe('1.2')
            expect(afterV3.workflowIds).toEqual([idB, idA, idD, idC])
            expect(await draftName({ ctx, workflowId: idB })).toBe('B v3')
            expect(await draftName({ ctx, workflowId: idA })).toBe('A v3')
            expect(await draftName({ ctx, workflowId: idD })).toBe('D v3')
            expect(await draftName({ ctx, workflowId: idC })).toBe('C v2')
            expect(await workflowCount({ ctx })).toBe(7)
        })

        it('upgrades installs created before workflow keys were stored', async () => {
            const ctx = await createTestContext(app!)
            const { solution, installId, pkg, keyA, keyB, keyC, idsV1 } = await installedWithThree({ ctx })
            await db.update('solution_install', installId, { workflowKeys: null })
            await publishPackageVersion({ ctx, solutionId: solution.id, version: '1.1', pkg: { ...pkg, workflows: [renamed({ pkg, key: keyC, name: 'C v2' }), renamed({ pkg, key: keyA, name: 'A v2' })] } })

            expect((await ctx.post(`/v1/solutions/installs/${installId}/upgrade`)).statusCode).toBe(StatusCodes.OK)
            const upgraded = await fetchInstall({ ctx, installId })

            expect(upgraded.workflowIds).toEqual([idsV1[2], idsV1[0], idsV1[1]])
            expect(await draftName({ ctx, workflowId: idsV1[2] })).toBe('C v2')
            expect(await draftName({ ctx, workflowId: idsV1[0] })).toBe('A v2')
            expect(await draftName({ ctx, workflowId: idsV1[1] })).toBe('B (2)')
            expect(keyB).toBeDefined()
        })

        it('creates a workflow again when the installed one was deleted instead of failing', async () => {
            const ctx = await createTestContext(app!)
            const { solution, installId, pkg, idsV1 } = await installedWithThree({ ctx })
            await databaseConnection().getRepository('workflow').delete({ id: idsV1[1] })
            await publishPackageVersion({ ctx, solutionId: solution.id, version: '1.1', pkg: { ...pkg, workflows: pkg.workflows.map((workflow) => ({ ...workflow, name: `${workflow.name} v2` })) } })

            expect((await ctx.post(`/v1/solutions/installs/${installId}/upgrade`)).statusCode).toBe(StatusCodes.OK)
            const upgraded = await fetchInstall({ ctx, installId })

            expect(upgraded.workflowIds).toHaveLength(3)
            expect(upgraded.workflowIds[0]).toBe(idsV1[0])
            expect(upgraded.workflowIds[2]).toBe(idsV1[2])
            expect(upgraded.workflowIds[1]).not.toBe(idsV1[1])
            expect(await draftName({ ctx, workflowId: upgraded.workflowIds[1] })).toBe('B v2')
        })

        it('checks room for the new workflows before it touches any draft', async () => {
            const ctx = await createTestContext(app!)
            const { solution, installId, pkg, keyA, idsV1 } = await installedWithThree({ ctx })
            await db.update('project', ctx.project.id, { workflowsLimit: 3 })
            const extra = { ...renamed({ pkg, key: keyA, name: 'D v2' }), key: 'extra-d' }
            await publishPackageVersion({ ctx, solutionId: solution.id, version: '1.1', pkg: { ...pkg, workflows: [...pkg.workflows.map((workflow) => ({ ...workflow, name: `${workflow.name} v2` })), extra] } })

            const response = await ctx.post(`/v1/solutions/installs/${installId}/upgrade`)

            expect(response.statusCode).toBe(StatusCodes.CONFLICT)
            expect(await draftName({ ctx, workflowId: idsV1[0] })).toBe('A (2)')
            expect((await fetchInstall({ ctx, installId })).version).toBe('1.0')
        })
    })
})
