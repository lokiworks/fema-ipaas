import { PropertyType } from '@fema/connector-sdk'
import { isObject } from '@fema/core-utils'
import {
    ConnectionType,
    EngineResponse,
    EngineResponseStatus,
    ExecuteRefreshTokenAuthOperation,
    ExecuteRefreshTokenAuthResponse,
} from '@fema/shared'
import { connectorAuth } from '../core/connector/connector-auth'

export const authRefreshOperation = {
    execute: async (operation: ExecuteRefreshTokenAuthOperation): Promise<EngineResponse<ExecuteRefreshTokenAuthResponse>> => {
        return {
            status: EngineResponseStatus.OK,
            response: await refreshAuth(operation),
        }
    },
}

async function refreshAuth(operation: ExecuteRefreshTokenAuthOperation): Promise<ExecuteRefreshTokenAuthResponse> {
    if (operation.auth.type !== ConnectionType.CUSTOM_AUTH) {
        return { skipped: true }
    }
    const call = await connectorAuth.callMethod({ operation, authValueType: operation.auth.type, methodPath: ['refresh', 'generate'] })
    if (!call.called || call.property.type !== PropertyType.CUSTOM_AUTH || !isObject(call.result) || typeof call.result.access_token !== 'string') {
        return { skipped: true }
    }
    return {
        skipped: false,
        access_token: call.result.access_token,
        expires_in: typeof call.result.expires_in === 'number' ? call.result.expires_in : call.property.refresh?.defaultExpiresIn ?? DEFAULT_REFRESH_EXPIRES_IN_SECONDS,
    }
}

const DEFAULT_REFRESH_EXPIRES_IN_SECONDS = 3300
