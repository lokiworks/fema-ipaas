import { ExecutionStatus, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { createMockExecution, createMockFolder, createMockWorkflow, createMockWorkflowVersion } from '../../../helpers/mocks'
import { Scope, World } from './world'

async function workflow({ world, scope, status }: { world: World, scope: Scope, status?: WorkflowStatus }): Promise<SeededWorkflow> {
    const info = world.scopes[scope]
    const mockWorkflow = createMockWorkflow({ projectId: info.project.id, status: status ?? WorkflowStatus.DISABLED, folderId: null, publishedVersionId: null })
    await db.save('workflow', mockWorkflow)
    const version = createMockWorkflowVersion({ workflowId: mockWorkflow.id, state: WorkflowVersionState.DRAFT, valid: false })
    await db.save('workflow_version', version)
    return { id: mockWorkflow.id, versionId: version.id, projectId: info.project.id }
}

async function folder({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string }> {
    const info = world.scopes[scope]
    const mockFolder = createMockFolder({ projectId: info.project.id })
    await db.save('folder', mockFolder)
    return { id: mockFolder.id }
}

async function execution({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string, workflowId: string }> {
    const info = world.scopes[scope]
    const seededWorkflow = await workflow({ world, scope })
    const mockExecution = createMockExecution({
        projectId: info.project.id,
        workflowId: seededWorkflow.id,
        workflowVersionId: seededWorkflow.versionId,
        status: ExecutionStatus.FAILED,
        environment: RunEnvironment.PRODUCTION,
    })
    await db.save('execution', mockExecution)
    return { id: mockExecution.id, workflowId: seededWorkflow.id }
}

export const seed = {
    workflow,
    folder,
    execution,
}

export type SeededWorkflow = {
    id: string
    versionId: string
    projectId: string
}
