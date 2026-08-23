import { apId } from '@fema/core-utils'
import { FileCompression, FileType, ExecutionStatus, WorkflowVersionState, RunEnvironment, RunInternalErrorSource } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { afterEach, vi } from 'vitest'
import { engineRunCallbackService } from '../../../../../src/app/workflows/execution/engine-run-callback-service'
import { fileService } from '../../../../../src/app/file/file.service'
import { system } from '../../../../../src/app/helper/system/system'
import { db } from '../../../../helpers/db'
import { createMockWorkflow, createMockExecution, createMockWorkflowVersion } from '../../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'

async function waitForCondition(fn: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await fn()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('waitForCondition timed out')
}

async function createRunningExecution(params: { workspaceId: string, logsFileId?: string }): Promise<{ runId: string }> {
    const workflow = createMockWorkflow({ workspaceId: params.workspaceId })
    await db.save('workflow', workflow)
    const workflowVersion = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED })
    await db.save('workflow_version', workflowVersion)
    const execution = createMockExecution({
        workspaceId: params.workspaceId,
        workflowId: workflow.id,
        workflowVersionId: workflowVersion.id,
        status: ExecutionStatus.RUNNING,
        environment: RunEnvironment.PRODUCTION,
        logsFileId: params.logsFileId,
    })
    await db.save('execution', execution)
    return { runId: execution.id }
}

let app: FastifyInstance
let ctx: TestContext

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    ctx = await createTestContext(app)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('uploadRunLog — execution.logsFileId FK safety', () => {
    it('backs logsFileId with a created file on a Cloud worker internal error, so the FK never dangles', async () => {
        const { runId } = await createRunningExecution({ workspaceId: ctx.workspace.id })

        // Cloud + worker-source internal error: the engine never uploaded a log file for this logsFileId.
        // uploadRunLog must materialize the file before referencing it, otherwise fk_execution_logs_file_id throws.
        await engineRunCallbackService(app.log).uploadRunLog({
            workspaceId: ctx.workspace.id,
            request: {
                runId,
                workspaceId: ctx.workspace.id,
                status: ExecutionStatus.INTERNAL_ERROR,
                logsFileId: apId(),
                internalError: {
                    source: RunInternalErrorSource.WORKER,
                    message: 'sandbox provisioning failed',
                    occurredAt: new Date().toISOString(),
                },
            },
        })

        await waitForCondition(async () => {
            const run = await db.findOneBy<{ status: string }>('execution', { id: runId })
            return run?.status === ExecutionStatus.INTERNAL_ERROR
        })

        const run = await db.findOneBy<{ status: string, logsFileId: string | null }>('execution', { id: runId })
        expect(run?.status).toBe(ExecutionStatus.INTERNAL_ERROR)
        // No FK violation: the run row updated and logsFileId points at a file that was created on demand.
        expect(run?.logsFileId).not.toBeNull()
        const fileExists = await fileService(app.log).exists({ workspaceId: ctx.workspace.id, fileId: run!.logsFileId!, type: FileType.EXECUTION_LOG })
        expect(fileExists).toBe(true)
    })

    it('links logsFileId when the log file exists (engine backup path)', async () => {
        const data = Buffer.from(JSON.stringify({ executionState: { steps: {}, tags: [] } }), 'utf-8')
        const logFile = await fileService(app.log).save({
            workspaceId: ctx.workspace.id,
            platformId: ctx.platform.id,
            type: FileType.EXECUTION_LOG,
            data,
            size: data.length,
            compression: FileCompression.NONE,
        })
        const { runId } = await createRunningExecution({ workspaceId: ctx.workspace.id })

        await engineRunCallbackService(app.log).uploadRunLog({
            workspaceId: ctx.workspace.id,
            request: {
                runId,
                workspaceId: ctx.workspace.id,
                status: ExecutionStatus.SUCCEEDED,
                logsFileId: logFile.id,
            },
        })

        await waitForCondition(async () => {
            const run = await db.findOneBy<{ logsFileId: string | null }>('execution', { id: runId })
            return run?.logsFileId === logFile.id
        })

        const run = await db.findOneBy<{ status: string, logsFileId: string | null }>('execution', { id: runId })
        expect(run?.logsFileId).toBe(logFile.id)
        expect(run?.status).toBe(ExecutionStatus.SUCCEEDED)
    })
})
