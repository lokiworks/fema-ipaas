import { AuditActor, defineAuditAction } from '@fema-ipaas/server-utils'
import { Principal, PrincipalType } from '@fema-ipaas/shared'

const connectionListed = defineAuditAction('connection.listed', { target: 'workspace' })
const globalConnectionListed = defineAuditAction('global-connection.listed', { target: 'tenant' })

export const auditEvents = {
    connectionListed,
    globalConnectionListed,
    actorFromPrincipal,
}

function actorFromPrincipal(principal: Principal): AuditActor {
    switch (principal.type) {
        case PrincipalType.USER:
            return { type: 'user', id: principal.id }
        case PrincipalType.SERVICE:
            return { type: 'api', id: principal.id }
        default:
            return { type: 'system', id: principal.id }
    }
}
