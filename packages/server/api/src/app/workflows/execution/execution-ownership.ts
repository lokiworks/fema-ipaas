import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { executionRepo } from './execution-service'

async function assertNotOwnedByAnotherProject({ executionId, projectId }: AssertNotOwnedByAnotherProjectParams): Promise<void> {
    const existing = await executionRepo().findOne({ where: { id: executionId }, select: ['id', 'projectId'] })
    if (!isNil(existing) && existing.projectId !== projectId) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Run belongs to another project' },
        })
    }
}

export const executionOwnership = {
    assertNotOwnedByAnotherProject,
}

type AssertNotOwnedByAnotherProjectParams = {
    executionId: string
    projectId: string
}
