import { FlowsContext, ListFlowsContextParams } from '@fema/connector-sdk'
import { SeekPage } from '@fema/core-utils'
import { FetchError, PopulatedFlow } from '@fema/shared'
import { retryFetch } from '../api/retry-fetch'

export const createFlowsContext = ({ engineToken, internalApiUrl, flowId, flowVersionId }: CreateFlowsServiceParams): FlowsContext => {
    return {
        async list(params: ListFlowsContextParams): Promise<SeekPage<PopulatedFlow>> {
            const queryParams = new URLSearchParams()
            if (params?.externalIds) {
                queryParams.set('externalIds', params.externalIds.join(','))
            }
            const url = `${internalApiUrl}v1/engine/populated-flows?${queryParams.toString()}`
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
            id: flowId,
            version: {
                id: flowVersionId,
            },
        },
    }
}

type CreateFlowsServiceParams = {
    engineToken: string
    internalApiUrl: string
    flowId: string
    flowVersionId: string
}
