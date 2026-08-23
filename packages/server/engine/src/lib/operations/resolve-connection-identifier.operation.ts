import {
    EngineResponse,
    EngineResponseStatus,
    ExecuteResolveConnectionIdentifierOperation,
    ExecuteResolveConnectionIdentifierResponse,
} from '@fema-ipaas/shared'
import { connectorAuth } from '../core/connector/connector-auth'

export const resolveConnectionIdentifierOperation = {
    execute: async (operation: ExecuteResolveConnectionIdentifierOperation): Promise<EngineResponse<ExecuteResolveConnectionIdentifierResponse>> => {
        const call = await connectorAuth.callMethod({ operation, authValueType: operation.connectionType, methodPath: ['getConnectionIdentifier'] })
        const identifier = call.called ? call.result : undefined
        return {
            status: EngineResponseStatus.OK,
            response: { identifier: typeof identifier === 'string' ? identifier : undefined },
        }
    },
}
