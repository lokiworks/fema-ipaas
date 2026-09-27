import { isNil } from '@fema-ipaas/core-utils'
import { Template, TemplateType, TemplateVisibility } from '@fema-ipaas/shared'

export const templateAccess = {
    canView({ template, viewer }: TemplateAccessParams): boolean {
        if (isNil(template.tenantId) || isNil(template.createdBy)) {
            return true
        }
        if (template.tenantId !== viewer.tenantId) {
            return false
        }
        if (template.createdBy === viewer.userId) {
            return true
        }
        return template.visibility === TemplateVisibility.TENANT
    },
    isCreator({ template, viewer }: TemplateAccessParams): boolean {
        return template.type === TemplateType.CUSTOM
            && !isNil(template.createdBy)
            && !isNil(template.tenantId)
            && template.tenantId === viewer.tenantId
            && template.createdBy === viewer.userId
    },
}

type TemplateAccessParams = {
    template: Pick<Template, 'tenantId' | 'createdBy' | 'visibility' | 'type'>
    viewer: TemplateViewer
}

export type TemplateViewer = {
    userId: string | null
    tenantId: string | null
}
