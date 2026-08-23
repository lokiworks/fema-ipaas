import { Runtime } from '@fema/sandbox'
import { ApLogger } from '@fema/server-utils'
import { ApiToWorkerContract, WorkerToApiContract } from '@fema/shared'

export function createApiToWorkerHandlers({ getRuntime, apiClient, getPublicApiUrl, log }: CreateApiToWorkerHandlersParams): ApiToWorkerContract {
    return {
        flowPublished({ flowId, flowVersionId, workspaceId }) {
            log.info({ flowId, flowVersionId, workspaceId, message: 'Flow published, prewarming flow cache' })
            void getRuntime()?.prewarm({
                log,
                apiClient,
                publicApiUrl: getPublicApiUrl(),
                flow: { id: flowId, versionId: flowVersionId, workspaceId },
            })
        },
    }
}

type CreateApiToWorkerHandlersParams = {
    getRuntime: () => Runtime | null
    apiClient: WorkerToApiContract
    getPublicApiUrl: () => string
    log: ApLogger
}
