import { isManualConnectorTrigger, isNil } from '@fema-ipaas/core-utils'
import { Execution, isExecutionStateTerminal, isFailedState, RunEnvironment, WebsocketClientEvent, WorkflowTriggerType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { workflowVersionService } from '../workflow-version/workflow-version.service'

export const executionHooks = (log: FastifyBaseLogger) => ({
    async onFinish(execution: Execution): Promise<void> {
        if (!isExecutionStateTerminal({
            status: execution.status,
            ignoreInternalError: true,
        })) {
            return
        }
        const workflowVersion = await workflowVersionService(log).getOne(execution.workflowVersionId)
        const isConnectorTrigger = !isNil(workflowVersion) && workflowVersion.trigger.type === WorkflowTriggerType.CONNECTOR && !isNil(workflowVersion.trigger.settings.triggerName)
        const isManualTrigger = isConnectorTrigger && isManualConnectorTrigger({ connectorName: workflowVersion.trigger.settings.connectorName, triggerName: workflowVersion.trigger.settings.triggerName })
        if (execution.environment === RunEnvironment.TESTING || isManualTrigger) {
            websocketService.to(execution.workspaceId).emit(WebsocketClientEvent.UPDATE_RUN_PROGRESS, {
                execution,
            })
        }
        if (isFailedState(execution.status) && execution.environment === RunEnvironment.PRODUCTION && !isNil(execution.failedStep)) {
            log.info({
                execution: { id: execution.id, status: execution.status },
                workflow: { id: execution.workflowId },
                workspace: { id: execution.workspaceId },
                step: { name: execution.failedStep },
            }, '[executionHooks#onFinish] Production run failed')
        }
    },
})
