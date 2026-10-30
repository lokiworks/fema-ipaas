import { isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, ProjectAccessRequest, ProjectAccessRequestEvent } from '@fema-ipaas/shared'

function requested({ request, email }: EventParams): ProjectAccessAuditEvent {
    return { action: ApplicationEventName.PROJECT_ACCESS_REQUESTED, data: { accessRequest: describe({ request, email }) } }
}

function decided({ request, email }: EventParams): ProjectAccessAuditEvent {
    return { action: ApplicationEventName.PROJECT_ACCESS_DECIDED, data: { accessRequest: describe({ request, email }) } }
}

function withdrawn({ request, email }: EventParams): ProjectAccessAuditEvent {
    return { action: ApplicationEventName.PROJECT_ACCESS_WITHDRAWN, data: { accessRequest: describe({ request, email }) } }
}

function describe({ request, email }: EventParams): ProjectAccessRequestEvent['data']['accessRequest'] {
    return {
        id: request.id,
        userId: request.userId,
        status: request.status,
        ...(isNil(email) ? {} : { email }),
        ...(isNil(request.grantedRole) ? {} : { role: request.grantedRole }),
    }
}

export const projectAccessRequestAuditEvents = { requested, decided, withdrawn }

type EventParams = {
    request: ProjectAccessRequest
    email: string | null | undefined
}

type ProjectAccessAuditEvent = Pick<ProjectAccessRequestEvent, 'action' | 'data'>
