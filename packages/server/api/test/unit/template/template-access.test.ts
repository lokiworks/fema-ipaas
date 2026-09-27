import { TemplateType, TemplateVisibility } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { templateAccess } from '../../../src/app/template/template-access'

const me = { userId: 'user-me', tenantId: 'tenant-1' }
const colleague = { userId: 'user-other', tenantId: 'tenant-1' }
const outsider = { userId: 'user-x', tenantId: 'tenant-2' }
const anonymous = { userId: null, tenantId: null }

const official = { type: TemplateType.OFFICIAL, tenantId: null, createdBy: null, visibility: null }
const curated = { type: TemplateType.CUSTOM, tenantId: 'tenant-1', createdBy: null, visibility: null }
const myPrivate = { type: TemplateType.CUSTOM, tenantId: 'tenant-1', createdBy: 'user-me', visibility: TemplateVisibility.PRIVATE }
const myShared = { type: TemplateType.CUSTOM, tenantId: 'tenant-1', createdBy: 'user-me', visibility: TemplateVisibility.TENANT }

describe('templateAccess.canView', () => {
    it('lets anyone open official and admin curated templates', () => {
        expect(templateAccess.canView({ template: official, viewer: anonymous })).toBe(true)
        expect(templateAccess.canView({ template: curated, viewer: outsider })).toBe(true)
    })

    it('shows a private template only to its creator', () => {
        expect(templateAccess.canView({ template: myPrivate, viewer: me })).toBe(true)
        expect(templateAccess.canView({ template: myPrivate, viewer: colleague })).toBe(false)
        expect(templateAccess.canView({ template: myPrivate, viewer: anonymous })).toBe(false)
    })

    it('shows a tenant shared template to members of the same tenant only', () => {
        expect(templateAccess.canView({ template: myShared, viewer: colleague })).toBe(true)
        expect(templateAccess.canView({ template: myShared, viewer: outsider })).toBe(false)
        expect(templateAccess.canView({ template: myShared, viewer: anonymous })).toBe(false)
    })
})

describe('templateAccess.isCreator', () => {
    it('is true only for the creator inside the same tenant', () => {
        expect(templateAccess.isCreator({ template: myShared, viewer: me })).toBe(true)
        expect(templateAccess.isCreator({ template: myShared, viewer: colleague })).toBe(false)
        expect(templateAccess.isCreator({ template: curated, viewer: me })).toBe(false)
        expect(templateAccess.isCreator({ template: { ...myShared, tenantId: 'tenant-2' }, viewer: me })).toBe(false)
    })
})
