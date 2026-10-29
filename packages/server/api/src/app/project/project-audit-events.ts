import { ApplicationEventName, ProjectCreatedEvent } from '@fema-ipaas/shared'

function created({ id, displayName }: { id: string, displayName: string }): Pick<ProjectCreatedEvent, 'action' | 'data'> {
    return { action: ApplicationEventName.PROJECT_CREATED, data: { createdProject: { id, displayName } } }
}

export const projectAuditEvents = { created }
