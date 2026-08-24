import { Runtime } from '@fema-ipaas/sandbox'
import { Logger } from '@fema-ipaas/server-utils'
import { ApiToWorkerContract, WorkerToApiContract } from '@fema-ipaas/shared'

export function createApiToWorkerHandlers({ getRuntime, apiClient, getPublicApiUrl, log }: CreateApiToWorkerHandlersParams): ApiToWorkerContract {
    return {
        workflowPublished({ workflowId, workflowVersionId, workspaceId }) {
            log.info({ workflowId, workflowVersionId, workspaceId, message: 'Workflow published, prewarming workflow cache' })
            void getRuntime()?.prewarm({
                log,
                apiClient,
                publicApiUrl: getPublicApiUrl(),
                workflow: { id: workflowId, versionId: workflowVersionId, workspaceId },
            })
        },
    }
}

type CreateApiToWorkerHandlersParams = {
    getRuntime: () => Runtime | null
    apiClient: WorkerToApiContract
    getPublicApiUrl: () => string
    log: Logger
}
