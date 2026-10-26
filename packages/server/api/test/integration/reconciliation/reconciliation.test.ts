import { createAction, Property } from '@fema-ipaas/connector-sdk'
import { generateId } from '@fema-ipaas/core-utils'
import { IssueKind, IssueStatus, ReconciliationRuleBody, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { ActionRunStatus } from '../../../src/app/action-run/action-run.service'
import { issueRepo } from '../../../src/app/issue/issue.service'
import { reconciliationDifferenceRepo, ReconciliationDeps, reconciliationRuleRepo, reconciliationService } from '../../../src/app/reconciliation/reconciliation.service'
import { AppSystemProp } from '../../../src/app/helper/system/system-props'
import { system } from '../../../src/app/helper/system/system'
import * as jobs from '../../../src/app/helper/system-jobs/system-job'
import { db } from '../../helpers/db'
import { createMockWorkflow } from '../../helpers/mocks'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })
beforeEach(() => {
    const original = jobs.systemJobsSchedule
    vi.spyOn(jobs, 'systemJobsSchedule').mockImplementation((log) => ({ ...original(log), upsertJob: async () => undefined }))
})
afterEach(() => { vi.restoreAllMocks() })

const action = createAction({
    name: 'enumerate', displayName: 'Enumerate', description: '', requireAuth: false, classification: 'SEARCH',
    reliability: { enumeration: { entity: 'ACCOUNT', businessKeyPath: 'id' } },
    props: { pageToken: Property.ShortText({ displayName: 'Page', required: false }), pageSize: Property.Number({ displayName: 'Size', required: true }) },
    outputSchema: { fields: [{ key: 'items', listItems: [{ key: 'id' }] }, { key: 'nextPageToken' }] }, run: async () => undefined,
})

async function fixture() {
    const ctx = await createTestContext(app)
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const endpoint = { connectorName: 'test-source', actionName: 'enumerate', connectionExternalId: 'c', input: {}, keyPath: 'id' }
    const body = ReconciliationRuleBody.parse({ projectId: ctx.project.id, name: 'People', workflowId: workflow.id, source: endpoint, target: { ...endpoint, connectorName: 'test-target' }, expectations: [{ aspect: 'account', when: [], expect: { kind: 'EXISTS' } }], repair: { readActionName: 'get', keyInput: 'id' }, maxRepairsPerRun: 0 })
    const rule = await reconciliationRuleRepo().save({ ...body, id: generateId() })
    let target: Record<string, unknown>[] = []
    const deps: ReconciliationDeps = {
        getAction: async () => action,
        runConnectorAction: async (params) => ({ status: ActionRunStatus.SUCCEEDED, output: { items: params.connectorName === 'test-source' ? [{ id: '1' }] : target, nextPageToken: null }, durationMs: 0, neverStarted: false, errorMessage: null }),
    }
    const service = reconciliationService(app.log, deps)
    return { ctx, rule, service, setTarget: (records: Record<string, unknown>[]) => { target = records }, deps }
}

describe('reconciliation runs', () => {
    it('opens a difference once and resolves it only after a matching full scan', async () => {
        const f = await fixture()
        const first = await f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await f.service.run({ runId: first.runId, projectId: f.ctx.project.id })
        const second = await f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await f.service.run({ runId: second.runId, projectId: f.ctx.project.id })
        const differences = await reconciliationDifferenceRepo().findBy({ projectId: f.ctx.project.id, ruleId: f.rule.id })
        expect(differences).toHaveLength(1)
        expect(differences[0].status).toBe('OPEN')
        const issues = await issueRepo().findBy({ projectId: f.ctx.project.id, kind: IssueKind.RECONCILIATION })
        expect(issues).toHaveLength(1)
        f.setTarget([{ id: '1' }])
        const third = await f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await f.service.run({ runId: third.runId, projectId: f.ctx.project.id })
        expect((await reconciliationDifferenceRepo().findOneByOrFail({ id: differences[0].id, projectId: f.ctx.project.id })).status).toBe('RESOLVED')
        expect((await issueRepo().findOneByOrFail({ id: issues[0].id, projectId: f.ctx.project.id })).status).toBe(IssueStatus.RESOLVED)
    })

    it('keeps ignored differences ignored on subsequent scans', async () => {
        const f = await fixture()
        const first = await f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await f.service.run({ runId: first.runId, projectId: f.ctx.project.id })
        const differences = await reconciliationDifferenceRepo().findBy({ projectId: f.ctx.project.id, ruleId: f.rule.id })
        await f.service.ignore({ ids: [differences[0].id], projectId: f.ctx.project.id })
        const second = await f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await f.service.run({ runId: second.runId, projectId: f.ctx.project.id })
        expect(await reconciliationDifferenceRepo().countBy({ projectId: f.ctx.project.id, ruleId: f.rule.id })).toBe(1)
        expect((await reconciliationDifferenceRepo().findOneByOrFail({ id: differences[0].id, projectId: f.ctx.project.id })).status).toBe('IGNORED')
    })

    it('returns 404 for a rule or run from another project', async () => {
        const f = await fixture()
        const other = await createTestContext(app)
        const started = await f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        const run = await other.get(`/v1/reconciliation/runs/${started.runId}`, { projectId: other.project.id })
        const differences = await other.get(`/v1/reconciliation/rules/${f.rule.id}/differences`, { projectId: other.project.id })
        expect(run.statusCode).toBe(404)
        expect(differences.statusCode).toBe(404)
    })
    it('shares one queued run between concurrent requests for the same rule', async () => {
        const f = await fixture()
        const runs = await Promise.all(Array.from({ length: 5 }, () => f.service.start({ id: f.rule.id, projectId: f.ctx.project.id })))
        expect(new Set(runs.map((run) => run.runId)).size).toBe(1)
    })

    it('does not infer missing accounts or resolve old differences from a truncated target scan', async () => {
        const f = await fixture()
        const original = system.getNumberOrThrow.bind(system)
        const getter = vi.spyOn(system, 'getNumberOrThrow').mockImplementation((key) => key === AppSystemProp.RECONCILIATION_MAX_ITEMS ? 1 : original(key))
        const service = reconciliationService(app.log, { ...f.deps, runConnectorAction: async (params) => ({ status: ActionRunStatus.SUCCEEDED, output: { items: params.connectorName === 'test-source' ? [{ id: '1' }] : [{ id: 'unmanaged' }], nextPageToken: params.connectorName === 'test-source' ? null : 'more' }, durationMs: 0, neverStarted: false, errorMessage: null }) })
        try {
            const started = await service.start({ id: f.rule.id, projectId: f.ctx.project.id })
            await service.run({ runId: started.runId, projectId: f.ctx.project.id })
            expect((await service.getRun({ id: started.runId, projectId: f.ctx.project.id })).status).toBe('TRUNCATED')
            expect(await reconciliationDifferenceRepo().countBy({ projectId: f.ctx.project.id, ruleId: f.rule.id })).toBe(0)
        } finally {
            getter.mockRestore()
        }
    })

    it('paginates ten thousand accounts and closes a late-visible account without another source event', async () => {
        const f = await fixture()
        const source = Array.from({ length: 10000 }, (_, index) => ({ id: String(index) }))
        let lateVisible = false
        let pages = 0
        const service = reconciliationService(app.log, { ...f.deps, runConnectorAction: async (params) => {
            const start = Number(params.input['pageToken'] ?? 0)
            const records = params.connectorName === 'test-source' || lateVisible ? source : source.slice(0, -1)
            const size = Number(params.input['pageSize'])
            pages++
            return { status: ActionRunStatus.SUCCEEDED, output: { items: records.slice(start, start + size), nextPageToken: start + size < records.length ? String(start + size) : null }, durationMs: 0, neverStarted: false, errorMessage: null }
        } })
        const first = await service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await service.run({ runId: first.runId, projectId: f.ctx.project.id })
        expect(await service.getRun({ id: first.runId, projectId: f.ctx.project.id })).toMatchObject({ status: 'SUCCEEDED', sourceCount: 10000, targetCount: 9999, differenceCount: 1 })
        expect(await reconciliationDifferenceRepo().findBy({ projectId: f.ctx.project.id, ruleId: f.rule.id })).toEqual([expect.objectContaining({ businessKey: '9999', status: 'OPEN' })])
        lateVisible = true
        const second = await service.start({ id: f.rule.id, projectId: f.ctx.project.id })
        await service.run({ runId: second.runId, projectId: f.ctx.project.id })
        expect(await service.getRun({ id: second.runId, projectId: f.ctx.project.id })).toMatchObject({ status: 'SUCCEEDED', sourceCount: 10000, targetCount: 10000, differenceCount: 0 })
        expect(await reconciliationDifferenceRepo().findBy({ projectId: f.ctx.project.id, ruleId: f.rule.id })).toEqual([expect.objectContaining({ businessKey: '9999', status: 'RESOLVED' })])
        expect(pages).toBe(136)
    }, 60000)

})
