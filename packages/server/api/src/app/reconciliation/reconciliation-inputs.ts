import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'

function authReference(externalId: string): string {
    if (!externalId || /['\\\r\n{}]/.test(externalId)) throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'reconciliation.unsupportedConnectionReference' } })
    return `{{connections['${externalId}']}}`
}

export const reconciliationInputs = { authReference }
