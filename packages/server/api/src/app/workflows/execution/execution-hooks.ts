import { isManualConnectorTrigger, isNil, isObject } from '@fema-ipaas/core-utils'
import { Execution, isExecutionStateTerminal, isFailedState, RunEnvironment, StepOutputStatus, WebsocketClientEvent, WorkflowActionType, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { otelExecutionMetrics } from '../../helper/otel-execution-metrics'
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
        recordConnectorActionMetrics({ execution, workflowVersion })
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

function recordConnectorActionMetrics({ execution, workflowVersion }: RecordConnectorActionMetricsParams): void {
    if (isNil(workflowVersion) || isNil(execution.steps)) {
        return
    }
    const connectorByStepName = new Map(
        workflowStructureUtil.getAllSteps(workflowVersion.trigger)
            .filter((step) => step.type === WorkflowActionType.CONNECTOR)
            .map((step) => [step.name, step.settings.connectorName]),
    )
    for (const [stepName, stepOutput] of Object.entries(execution.steps)) {
        const connectorName = connectorByStepName.get(stepName)
        if (isNil(connectorName) || !isObject(stepOutput)) {
            continue
        }
        otelExecutionMetrics.recordConnectorAction({
            connectorName,
            failed: Reflect.get(stepOutput, 'status') === StepOutputStatus.FAILED,
        })
    }
}

type RecordConnectorActionMetricsParams = {
    execution: Execution
    workflowVersion: WorkflowVersion | null
}
