import { generateId } from '@fema-ipaas/core-utils'
import { FastifyInstance } from 'fastify'
import { storeEntryService } from '../../../src/app/store-entry/store-entry.service'
import { pollCursorGuard } from '../../../src/app/trigger/poll-cursor-guard'
import { mockAndSaveBasicSetup } from '../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function arrange() {
    const { mockProject } = await mockAndSaveBasicSetup()
    const workflowId = generateId()
    const base = { projectId: mockProject.id, workflowId }
    await put({ ...base, name: 'lastPoll', value: 100 })
    await put({ ...base, name: 'seenRecords', value: { E1: 100 } })
    return { ...base, guard: pollCursorGuard(app.log) }
}

async function put({ projectId, workflowId, name, value }: { projectId: string, workflowId: string, name: string, value: unknown }): Promise<void> {
    await storeEntryService.upsert({ projectId, request: { key: `workflow_${workflowId}/${name}`, value } })
}

async function read({ projectId, workflowId, name }: { projectId: string, workflowId: string, name: string }): Promise<unknown> {
    return (await storeEntryService.getOne({ projectId, key: `workflow_${workflowId}/${name}` }))?.value ?? null
}

describe('pollCursorGuard', () => {
    it('puts every trigger state key back when the poll failed', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await put({ projectId, workflowId, name: 'lastPoll', value: 200 })
        await put({ projectId, workflowId, name: 'seenRecords', value: { E1: 100, E2: 200 } })
        await put({ projectId, workflowId, name: 'addedByThisPoll', value: true })

        await guard.settle({ projectId, workflowId, jobId: 'job-1', failed: true })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(100)
        expect(await read({ projectId, workflowId, name: 'seenRecords' })).toEqual({ E1: 100 })
        expect(await read({ projectId, workflowId, name: 'addedByThisPoll' })).toBeNull()
    })

    it('rolls back when the events were being handed over but the hand-over never finished', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await put({ projectId, workflowId, name: 'lastPoll', value: 200 })
        await guard.markSubmitting({ projectId, workflowId })

        await guard.settle({ projectId, workflowId, jobId: 'job-1', failed: false })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(100)
    })

    it('keeps the advanced cursor once the runs were started', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await put({ projectId, workflowId, name: 'lastPoll', value: 200 })
        await guard.markSubmitting({ projectId, workflowId })
        await guard.commit({ projectId, workflowId })
        await guard.settle({ projectId, workflowId, jobId: 'job-1', failed: false })

        await guard.begin({ projectId, workflowId, jobId: 'job-2' })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(200)
    })

    it('keeps the advanced cursor when the poll found nothing to hand over', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await put({ projectId, workflowId, name: 'lastPoll', value: 200 })

        await guard.settle({ projectId, workflowId, jobId: 'job-1', failed: false })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(200)
    })

    it('rolls back what a crashed poll left behind when the same job is dequeued again', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await put({ projectId, workflowId, name: 'lastPoll', value: 200 })
        await guard.markSubmitting({ projectId, workflowId })

        await guard.begin({ projectId, workflowId, jobId: 'job-1' })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(100)
    })

    it('leaves a poll that is still running alone when another job of the same trigger starts', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await put({ projectId, workflowId, name: 'lastPoll', value: 200 })

        await guard.begin({ projectId, workflowId, jobId: 'job-2' })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(200)
    })

    it('forgets a pending snapshot when the trigger is disabled so a later enable starts from its own cursor', async () => {
        const { guard, projectId, workflowId } = await arrange()
        await guard.begin({ projectId, workflowId, jobId: 'job-1' })
        await guard.discard({ projectId, workflowId })
        await put({ projectId, workflowId, name: 'lastPoll', value: 900 })

        await guard.begin({ projectId, workflowId, jobId: 'job-2' })

        expect(await read({ projectId, workflowId, name: 'lastPoll' })).toBe(900)
    })
})
