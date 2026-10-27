import { ApplicationEventName, PLATFORM_LEVEL_AUDIT_ACTIONS } from '@fema-ipaas/shared'

function projectIdFor({ action, projectId }: ProjectIdForParams): string | undefined {
    return PLATFORM_LEVEL_AUDIT_ACTIONS.includes(action) ? undefined : projectId
}

export const auditEventScope = { projectIdFor }

type ProjectIdForParams = {
    action: ApplicationEventName
    projectId: string | undefined
}
