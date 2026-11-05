import { isNil } from '@fema-ipaas/core-utils'
import { platformClientUtils } from './platform-client.utils'

function mayManageTenant({ callerIssuer, tenantExternalIssuer }: { callerIssuer: string | null, tenantExternalIssuer: string | null | undefined }): boolean {
    if (isNil(callerIssuer)) {
        return true
    }
    if (isNil(tenantExternalIssuer)) {
        return false
    }
    return platformClientUtils.normalizeIssuer({ issuer: callerIssuer }) === platformClientUtils.normalizeIssuer({ issuer: tenantExternalIssuer })
}

export const platformAccessUtils = {
    mayManageTenant,
}
