import { isObject } from '@fema/core-utils'
import {
    EngineResponse,
    EngineResponseStatus,
    ExecuteValidateAuthOperation,
    ExecuteValidateAuthResponse,
} from '@fema/shared'
import { connectorAuth } from '../core/connector/connector-auth'

export const authValidationOperation = {
    execute: async (operation: ExecuteValidateAuthOperation): Promise<EngineResponse<ExecuteValidateAuthResponse>> => {
        const call = await connectorAuth.callMethod({ operation, authValueType: operation.auth.type, methodPath: ['validate'] })
        if (!call.called) {
            return {
                status: EngineResponseStatus.OK,
                response: call.mismatch
                    ? { valid: false, error: `Connection value type does not match connector auth type: ${call.property?.type} !== ${operation.auth.type}` }
                    : { valid: true },
            }
        }
        return {
            status: EngineResponseStatus.OK,
            response: toValidateAuthResponse(call.result),
        }
    },
}

function toValidateAuthResponse(value: unknown): ExecuteValidateAuthResponse {
    if (!isObject(value)) {
        return { valid: false, error: 'Connection validation returned an unexpected result' }
    }
    if (value.valid === true) {
        return { valid: true }
    }
    return { valid: false, error: typeof value.error === 'string' ? value.error : 'Connection validation failed' }
}
