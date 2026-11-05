import { ApplicationEventName, PrincipalType, TenantAdminEvent } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { applicationEvents } from '../helper/application-events'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

function recordByOperator({ request, tenantId, action, target, detail }: OperatorAuditParams): void {
    const principal = request.principal
    if (principal.type !== PrincipalType.USER) {
        return
    }
    applicationEvents(request.log).sendUserEvent({
        tenantId: tenantId ?? principal.tenant.id,
        userId: principal.id,
        ip: clientIp({ request }),
    }, {
        action,
        data: { target, ...(detail === undefined ? {} : { detail }) },
    })
}

function recordByPlatformClient({ request, tenantId, clientName, operation, target }: PlatformAuditParams): void {
    applicationEvents(request.log).sendUserEvent({
        tenantId,
        ip: clientIp({ request }),
    }, {
        action: ApplicationEventName.PLATFORM_API_CALLED,
        data: { target, detail: `${clientName}: ${operation}` },
    })
}

function clientIp({ request }: { request: FastifyRequest }): string {
    return networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
}

export const operatorAudit = {
    recordByOperator,
    recordByPlatformClient,
}

type OperatorAuditParams = {
    request: FastifyRequest
    tenantId?: string
    action: TenantAdminEvent['action']
    target: string
    detail?: string
}

type PlatformAuditParams = {
    request: FastifyRequest
    tenantId: string
    clientName: string
    operation: string
    target: string
}
