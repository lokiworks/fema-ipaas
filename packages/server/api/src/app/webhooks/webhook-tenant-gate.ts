import { ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import { EngineHttpResponse } from '@fema-ipaas/shared'
import { StatusCodes } from 'http-status-codes'
import { tenantStatusGuard } from '../tenant/tenant-status-guard'

async function refusalFor({ tenantId, webhookHeader, webhookRequestId }: RefusalParams): Promise<EngineHttpResponse | null> {
    const standing = await tenantStatusGuard.standingOf({ tenantId })
    if (standing === 'ACTIVE') {
        return null
    }
    if (standing === 'GONE') {
        return {
            status: StatusCodes.GONE,
            body: {},
            headers: { [webhookHeader]: webhookRequestId },
        }
    }
    return {
        status: StatusCodes.FORBIDDEN,
        body: { code: ErrorCode.TENANT_SUSPENDED },
        headers: { [webhookHeader]: webhookRequestId },
    }
}

function isTenantGone(response: EngineHttpResponse | null): boolean {
    return !isNil(response) && response.status === StatusCodes.GONE
}

function isRefusal(response: EngineHttpResponse | null): response is EngineHttpResponse {
    return !isNil(response)
}

export const webhookTenantGate = {
    refusalFor,
    isRefusal,
    isTenantGone,
}

type RefusalParams = {
    tenantId: TenantId
    webhookHeader: string
    webhookRequestId: string
}
