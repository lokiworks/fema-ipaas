import { isNil, WorkflowId } from '@fema/core-utils'
import { apDayjsDuration } from '@fema/server-utils'
import { WorkflowExecutionState, workflowExecutionStateKey } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../database/redis-connections'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { webhookHandshake } from '../../webhooks/webhook-handshake'
import { workspaceService } from '../../workspace/workspace-service'
import { workflowService } from './workflow.service'

export const workflowExecutionCache = (log: FastifyBaseLogger) => ({
    get: async (params: GetParams): Promise<WorkflowExecutionState> => {
        const { simulate } = params
        if (simulate) {
            return getWorkflowExecutionCache(params, log)
        }
        const cachedValue = await distributedStore.get<WorkflowExecutionState>(workflowExecutionStateKey(params.workflowId))
        if (isNil(cachedValue)) {
            const workflowExecutionCache = await getWorkflowExecutionCache(params, log)
            await distributedStore.put(workflowExecutionStateKey(params.workflowId), workflowExecutionCache, apDayjsDuration(30, 'day').asSeconds())
            return workflowExecutionCache
        }
        return cachedValue
    },
    invalidate: async (...workflowIds: WorkflowId[]): Promise<void> => {
        if (workflowIds.length === 0) return
        const keys: string[] = workflowIds.map(workflowExecutionStateKey)
        await distributedStore.delete(keys)
    },
})


async function getWorkflowExecutionCache(params: GetParams, log: FastifyBaseLogger): Promise<WorkflowExecutionState> {
    const workflow = await workflowService(log).getOneById(params.workflowId)
    if (isNil(workflow)) {
        return {
            exists: false,
        }
    }
    const triggerSource = await triggerSourceService(log).getByWorkflowId({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        simulate: params.simulate,
    })
    return {
        exists: true,
        handshakeConfiguration: await webhookHandshake.getWebhookHandshakeConfiguration({ triggerSource, logger: log }) ?? undefined,
        workflow,
        platformId: await workspaceService(log).getPlatformId(workflow.workspaceId),
    }
}

type GetParams = {
    workflowId: WorkflowId
    simulate: boolean
}
