import { inspect } from 'util'
import { formatConnectorError, tryCatch } from '@fema/core-utils'
import { EngineOperation, EngineOperationType, EngineResponse, EngineResponseStatus, ExecuteActionOperation, ExecuteExtractConnectorMetadataOperation, ExecuteFlowOperation, ExecutePropsOptions, ExecuteRefreshTokenAuthOperation, ExecuteResolveConnectionIdentifierOperation, ExecuteTriggerOperation, ExecuteValidateAuthOperation, ExecutionError, ExecutionErrorType, TriggerHookType } from '@fema/shared'
import { actionOperation } from './action.operation'
import { authRefreshOperation } from './auth-refresh.operation'
import { authValidationOperation } from './auth-validation.operation'
import { connectorMetadataOperation } from './connector-metadata.operation'
import { flowOperation } from './flow.operation'
import { propertyOperation } from './property.operation'
import { resolveConnectionIdentifierOperation } from './resolve-connection-identifier.operation'
import { triggerHookOperation } from './trigger-hook.operation'


export async function execute(operationType: EngineOperationType, operation: EngineOperation): Promise<EngineResponse<unknown>> {
    const result = await tryCatch(async () => {
        switch (operationType) {
            case EngineOperationType.EXTRACT_CONNECTOR_METADATA: {
                return connectorMetadataOperation.extract(operation as ExecuteExtractConnectorMetadataOperation)
            }
            case EngineOperationType.EXECUTE_FLOW: {
                return flowOperation.execute(operation as ExecuteFlowOperation)
            }
            case EngineOperationType.EXECUTE_ACTION: {
                return actionOperation.execute(operation as ExecuteActionOperation)
            }
            case EngineOperationType.EXECUTE_PROPERTY: {
                return propertyOperation.execute(operation as ExecutePropsOptions)
            }
            case EngineOperationType.EXECUTE_TRIGGER_HOOK: {
                return triggerHookOperation.execute(operation as ExecuteTriggerOperation<TriggerHookType>)
            }
            case EngineOperationType.EXECUTE_VALIDATE_AUTH: {
                return authValidationOperation.execute(operation as ExecuteValidateAuthOperation)
            }
            case EngineOperationType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER: {
                return resolveConnectionIdentifierOperation.execute(operation as ExecuteResolveConnectionIdentifierOperation)
            }
            case EngineOperationType.EXECUTE_REFRESH_TOKEN_AUTH: {
                return authRefreshOperation.execute(operation as ExecuteRefreshTokenAuthOperation)
            }
            default: {
                throw new ExecutionError('Unsupported operation type', `Unsupported operation type: ${operationType}`, ExecutionErrorType.ENGINE)
            }
        }
    })
    if (result.error) {
        console.error(result.error)
        return {
            response: undefined,
            status: EngineResponseStatus.INTERNAL_ERROR,
            error: JSON.stringify(formatConnectorError(result.error, { raw: inspect(result.error) })),
        }
    }
    return result.data
}