import { isManualConnectorTrigger, isNil } from '@fema/core-utils'
import { Execution, FlowTriggerType, isExecutionStateTerminal, isFailedState, RunEnvironment, WebsocketClientEvent } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { flowVersionService } from '../flow-version/flow-version.service'

export const executionHooks = (log: FastifyBaseLogger) => ({
    async onFinish(execution: Execution): Promise<void> {
        if (!isExecutionStateTerminal({
            status: execution.status,
            ignoreInternalError: true,
        })) {
            return
        }
        const flowVersion = await flowVersionService(log).getOne(execution.flowVersionId)
        const isConnectorTrigger = !isNil(flowVersion) && flowVersion.trigger.type === FlowTriggerType.CONNECTOR && !isNil(flowVersion.trigger.settings.triggerName)
        const isManualTrigger = isConnectorTrigger && isManualConnectorTrigger({ connectorName: flowVersion.trigger.settings.connectorName, triggerName: flowVersion.trigger.settings.triggerName })
        if (execution.environment === RunEnvironment.TESTING || isManualTrigger) {
            websocketService.to(execution.workspaceId).emit(WebsocketClientEvent.UPDATE_RUN_PROGRESS, {
                execution,
            })
        }
        if (isFailedState(execution.status) && execution.environment === RunEnvironment.PRODUCTION && !isNil(execution.failedStep)) {
            log.info({
                execution: { id: execution.id, status: execution.status },
                flow: { id: execution.flowId },
                workspace: { id: execution.workspaceId },
                step: { name: execution.failedStep },
            }, '[executionHooks#onFinish] Production run failed')
        }
    },
})
