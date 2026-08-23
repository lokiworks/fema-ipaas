import { ListWorkflowsContextParams, WorkflowsContext } from '@fema/connector-sdk'
import { SeekPage } from '@fema/core-utils'
import { FetchError, PopulatedWorkflow } from '@fema/shared'
import { retryFetch } from '../api/retry-fetch'

export const createWorkflowsContext = ({ engineToken, internalApiUrl, workflowId, workflowVersionId }: CreateWorkflowsServiceParams): WorkflowsContext => {
    return {
        async list(params: ListWorkflowsContextParams): Promise<SeekPage<PopulatedWorkflow>> {
            const queryParams = new URLSearchParams()
            if (params?.externalIds) {
                queryParams.set('externalIds', params.externalIds.join(','))
            }
            const url = `${internalApiUrl}v1/engine/populated-workflows?${queryParams.toString()}`
            const response = await retryFetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${engineToken}`,
                },
            })
            if (!response.ok) {
                throw new FetchError(url, `status=${response.status}`)
            }
            return response.json()
        },
        current: {
            id: workflowId,
            version: {
                id: workflowVersionId,
            },
        },
    }
}

type CreateWorkflowsServiceParams = {
    engineToken: string
    internalApiUrl: string
    workflowId: string
    workflowVersionId: string
}
