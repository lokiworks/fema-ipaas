import { isManualConnectorTrigger, isNil } from '@fema/core-utils'
import { FlowRun, FlowTriggerType, isFailedState, isFlowRunStateTerminal, RunEnvironment, WebsocketClientEvent } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { flowVersionService } from '../flow-version/flow-version.service'

export const flowRunHooks = (log: FastifyBaseLogger) => ({
    async onFinish(flowRun: FlowRun): Promise<void> {
        if (!isFlowRunStateTerminal({
            status: flowRun.status,
            ignoreInternalError: true,
        })) {
            return
        }
        const flowVersion = await flowVersionService(log).getOne(flowRun.flowVersionId)
        const isConnectorTrigger = !isNil(flowVersion) && flowVersion.trigger.type === FlowTriggerType.CONNECTOR && !isNil(flowVersion.trigger.settings.triggerName)
        const isManualTrigger = isConnectorTrigger && isManualConnectorTrigger({ connectorName: flowVersion.trigger.settings.connectorName, triggerName: flowVersion.trigger.settings.triggerName })
        if (flowRun.environment === RunEnvironment.TESTING || isManualTrigger) {
            websocketService.to(flowRun.projectId).emit(WebsocketClientEvent.UPDATE_RUN_PROGRESS, {
                flowRun,
            })
        }
        if (isFailedState(flowRun.status) && flowRun.environment === RunEnvironment.PRODUCTION && !isNil(flowRun.failedStep)) {
            log.info({
                flowRun: { id: flowRun.id, status: flowRun.status },
                flow: { id: flowRun.flowId },
                project: { id: flowRun.projectId },
                step: { name: flowRun.failedStep },
            }, '[flowRunHooks#onFinish] Production run failed')
        }
    },
})
