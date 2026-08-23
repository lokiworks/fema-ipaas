import { FileType, Workflow, WorkflowStatus, Workspace } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import FormData from 'form-data'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Webhook multipart file', () => {
    it('should serialize a single multipart file as a URL and persist it', async () => {
        const { mockWorkflow, mockWorkspace } = await createEnabledWorkflow()

        const form = new FormData()
        form.append('userName', 'John')
        form.append('upload', Buffer.from('hello pdf'), {
            filename: 'doc.pdf',
            contentType: 'application/pdf',
        })

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: form.getHeaders(),
            payload: form.getBuffer(),
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.headers['x-webhook-id']).toBeDefined()
        expect(response.json()).toEqual({})

        const savedFile = await db.findOneBy<SavedFile>(
            'file',
            { workspaceId: mockWorkspace.id, type: FileType.WORKFLOW_STEP_FILE },
        )
        expect(savedFile).not.toBeNull()
        expect(savedFile!.id).toBeTruthy()
        expect(savedFile!.fileName).toBe('doc.pdf')
        expect(savedFile!.type).toBe(FileType.WORKFLOW_STEP_FILE)
        expect(savedFile!.workspaceId).toBe(mockWorkspace.id)
    })

    it('should serialize multiple multipart files sharing a field name as an array of URLs', async () => {
        const { mockWorkflow, mockWorkspace } = await createEnabledWorkflow()

        const form = new FormData()
        form.append('uploads', Buffer.from('first pdf'), {
            filename: 'first.pdf',
            contentType: 'application/pdf',
        })
        form.append('uploads', Buffer.from('second pdf'), {
            filename: 'second.pdf',
            contentType: 'application/pdf',
        })

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: form.getHeaders(),
            payload: form.getBuffer(),
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.headers['x-webhook-id']).toBeDefined()
        expect(response.json()).toEqual({})

        const firstFile = await db.findOneBy<SavedFile>(
            'file',
            { workspaceId: mockWorkspace.id, fileName: 'first.pdf' },
        )
        const secondFile = await db.findOneBy<SavedFile>(
            'file',
            { workspaceId: mockWorkspace.id, fileName: 'second.pdf' },
        )
        expect(firstFile).not.toBeNull()
        expect(firstFile!.id).toBeTruthy()
        expect(firstFile!.type).toBe(FileType.WORKFLOW_STEP_FILE)
        expect(secondFile).not.toBeNull()
        expect(secondFile!.id).toBeTruthy()
        expect(secondFile!.type).toBe(FileType.WORKFLOW_STEP_FILE)
    })

    it('should stream a raw binary body to a step file', async () => {
        const { mockWorkflow, mockWorkspace } = await createEnabledWorkflow()

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: { 'content-type': 'application/pdf' },
            payload: Buffer.from('a raw pdf body streamed straight to storage'),
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const savedFile = await db.findOneBy<SavedFile>(
            'file',
            { workspaceId: mockWorkspace.id, type: FileType.WORKFLOW_STEP_FILE },
        )
        expect(savedFile).not.toBeNull()
        expect(savedFile!.fileName).toBe('file.pdf')
        expect(savedFile!.type).toBe(FileType.WORKFLOW_STEP_FILE)
    })
})

async function createEnabledWorkflow(): Promise<{ mockWorkflow: Workflow, mockWorkspace: Workspace }> {
    const { mockWorkspace } = await mockAndSaveBasicSetup()
    const mockWorkflow = createMockWorkflow({ workspaceId: mockWorkspace.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', [mockWorkflow])
    const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
    await db.save('workflow_version', [mockWorkflowVersion])
    await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })
    return { mockWorkflow, mockWorkspace }
}

type SavedFile = {
    id: string
    fileName: string
    type: FileType
    workspaceId: string
}
