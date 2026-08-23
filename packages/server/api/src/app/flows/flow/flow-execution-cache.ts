import { FlowId, isNil } from '@fema/core-utils'
import { apDayjsDuration } from '@fema/server-utils'
import { FlowExecutionState, flowExecutionStateKey } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../database/redis-connections'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { webhookHandshake } from '../../webhooks/webhook-handshake'
import { workspaceService } from '../../workspace/workspace-service'
import { flowService } from './flow.service'

export const flowExecutionCache = (log: FastifyBaseLogger) => ({
    get: async (params: GetParams): Promise<FlowExecutionState> => {
        const { simulate } = params
        if (simulate) {
            return getFlowExecutionCache(params, log)
        }
        const cachedValue = await distributedStore.get<FlowExecutionState>(flowExecutionStateKey(params.flowId))
        if (isNil(cachedValue)) {
            const flowExecutionCache = await getFlowExecutionCache(params, log)
            await distributedStore.put(flowExecutionStateKey(params.flowId), flowExecutionCache, apDayjsDuration(30, 'day').asSeconds())
            return flowExecutionCache
        }
        return cachedValue
    },
    invalidate: async (...flowIds: FlowId[]): Promise<void> => {
        if (flowIds.length === 0) return
        const keys: string[] = flowIds.map(flowExecutionStateKey)
        await distributedStore.delete(keys)
    },
})


async function getFlowExecutionCache(params: GetParams, log: FastifyBaseLogger): Promise<FlowExecutionState> {
    const flow = await flowService(log).getOneById(params.flowId)
    if (isNil(flow)) {
        return {
            exists: false,
        }
    }
    const triggerSource = await triggerSourceService(log).getByFlowId({
        flowId: flow.id,
        workspaceId: flow.workspaceId,
        simulate: params.simulate,
    })
    return {
        exists: true,
        handshakeConfiguration: await webhookHandshake.getWebhookHandshakeConfiguration({ triggerSource, logger: log }) ?? undefined,
        flow,
        platformId: await workspaceService(log).getPlatformId(flow.workspaceId),
    }
}

type GetParams = {
    flowId: FlowId
    simulate: boolean
}
