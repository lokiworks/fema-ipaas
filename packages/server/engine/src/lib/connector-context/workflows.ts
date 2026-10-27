import { ListWorkflowsContextParams, PopulatedWorkflowSummary, WorkflowsContext } from '@fema-ipaas/connector-sdk'
import { SeekPage } from '@fema-ipaas/core-utils'
import { FetchError } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { retryFetch } from '../api/retry-fetch'

export const createWorkflowsContext = ({ engineToken, internalApiUrl, workflowId, workflowVersionId }: CreateWorkflowsServiceParams): WorkflowsContext => {
    return {
        async list(params: ListWorkflowsContextParams): Promise<SeekPage<PopulatedWorkflowSummary>> {
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
            return WORKFLOWS_RESPONSE.parse(await response.json())
        },
        current: {
            id: workflowId,
            version: {
                id: workflowVersionId,
            },
        },
    }
}

const WORKFLOWS_RESPONSE = z.looseObject({
    data: z.array(z.looseObject({
        id: z.string(), externalId: z.string().optional(), projectId: z.string().optional(), status: z.string().optional(),
        version: z.looseObject({ id: z.string(), displayName: z.string(), valid: z.boolean() }),
    })),
    next: z.string().nullable(), previous: z.string().nullable(),
})

type CreateWorkflowsServiceParams = {
    engineToken: string
    internalApiUrl: string
    workflowId: string
    workflowVersionId: string
}
