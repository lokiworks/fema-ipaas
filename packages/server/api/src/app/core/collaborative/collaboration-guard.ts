import { workflowRepo } from '../../workflows/workflow/workflow.repo'

async function isWorkflowOfProject({ resourceId, projectId }: IsWorkflowOfProjectParams): Promise<boolean> {
    return workflowRepo().existsBy({ id: resourceId, projectId })
}

export const collaborationGuard = {
    isWorkflowOfProject,
}

type IsWorkflowOfProjectParams = {
    resourceId: string
    projectId: string
}
