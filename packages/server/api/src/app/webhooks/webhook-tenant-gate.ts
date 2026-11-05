import { ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import { EngineHttpResponse } from '@fema-ipaas/shared'
import { StatusCodes } from 'http-status-codes'
import { tenantStatusGuard } from '../tenant/tenant-status-guard'

async function refusalFor({ tenantId, webhookHeader, webhookRequestId }: RefusalParams): Promise<EngineHttpResponse | null> {
    const active = await tenantStatusGuard.isActive({ tenantId })
    if (active) {
        return null
    }
    return {
        status: StatusCodes.FORBIDDEN,
        body: { code: ErrorCode.TENANT_SUSPENDED },
        headers: { [webhookHeader]: webhookRequestId },
    }
}

function isRefusal(response: EngineHttpResponse | null): response is EngineHttpResponse {
    return !isNil(response)
}

export const webhookTenantGate = {
    refusalFor,
    isRefusal,
}

type RefusalParams = {
    tenantId: TenantId
    webhookHeader: string
    webhookRequestId: string
}
