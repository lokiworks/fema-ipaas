import { ApplicationError, ErrorCode, isNil, Permission, tryCatch } from '@fema-ipaas/core-utils'
import { ALL_PRINCIPAL_TYPES, CreateTemplateRequestBody, GenerateTemplateFromWorkflowRequestBody, ListTemplatesRequestQuery, Principal, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, Template, TemplateType, UpdateTemplateRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { tenantGuards } from '../core/security/tenant-guards'
import { migrateWorkflowVersionTemplateList } from '../workflows/workflow-version/migrations'
import { communityTemplates } from './community-templates.service'
import { templateAccess, TemplateViewer } from './template-access'
import { templateService } from './template.service'


export const templateController: FastifyPluginAsyncZod = async (app) => {
    app.get('/:id', GetParams, async (request) => {
        const template = await templateService(app.log).getOne({ id: request.params.id })
        if (isNil(template)) {
            return communityTemplates.getOrThrow(request.params.id)
        }
        if (!templateAccess.canView({ template, viewer: viewerOf(request.principal) })) {
            throw templateNotFound(request.params.id)
        }
        return template
    })

    app.get('/categories', GetCategoriesParams, async () => {
        return communityTemplates.getCategories()
    })

    app.get('/', ListTemplatesParams, async (request) => {
        const officialTemplates = await loadOfficialTemplatesOrReturnEmpty(app.log, request.query)
        const customTemplates = await loadCustomTemplatesOrReturnEmpty(app.log, request.query, request.principal)

        return {
            data: [...officialTemplates, ...customTemplates],
            next: null,
            previous: null,
        }
    })

    app.post('/from-workflow', GenerateFromWorkflowParams, async (request, reply) => {
        const template = await templateService(request.log).createFromWorkflow({
            projectId: request.projectId,
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            request: request.body,
        })
        return reply.status(StatusCodes.CREATED).send(template)
    })

    app.post('/:id/usage', RecordUsageParams, async (request, reply) => {
        const template = await templateService(request.log).getOne({ id: request.params.id })
        if (!isNil(template)) {
            if (!templateAccess.canView({ template, viewer: viewerOf(request.principal) })) {
                throw templateNotFound(request.params.id)
            }
            await templateService(request.log).incrementUsage({ id: template.id, tenantId: request.principal.tenant.id })
        }
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post('/', {
        ...CreateParams,
        preValidation: async (request) => {
            const migratedWorkflows = await migrateWorkflowVersionTemplateList(request.body.workflows ?? [])
            request.body.workflows = migratedWorkflows
        },
    }, async (request, reply) => {
        const { type } = request.body
        let tenantId: string | undefined

        switch (type) {
            case TemplateType.CUSTOM: {
                await tenantGuards.assertPrincipalIsTenantAdmin({ principal: request.principal, log: request.log })
                tenantId = request.principal.tenant.id
            }
                break
            case TemplateType.SHARED:
                break
            case TemplateType.OFFICIAL: {
                throw new ApplicationError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: 'Official templates are not supported to being created',
                    },
                })
            }
        }
        const result = await templateService(app.log).create({ tenantId, params: request.body })
        return reply.status(StatusCodes.CREATED).send(result)
    })

    app.post('/:id', { ...UpdateParams,
        preValidation: async (request) => {
            const migratedWorkflows = await migrateWorkflowVersionTemplateList(request.body.workflows ?? [])
            request.body.workflows = migratedWorkflows
        },
    }, async (request, reply) => {
        const template = await templateService(app.log).getOneOrThrow({ id: request.params.id })
        const { isAdmin } = await assertCanManageTemplate({ template, principal: request.principal, log: request.log })
        const params = isAdmin ? request.body : { ...request.body, featured: undefined }
        const result = await templateService(app.log).update({ id: request.params.id, params })
        return reply.status(StatusCodes.OK).send(result)
    })

    app.delete('/:id', DeleteParams, async (request, reply) => {
        const template = await templateService(app.log).getOneOrThrow({ id: request.params.id })
        await assertCanManageTemplate({ template, principal: request.principal, log: request.log })
        await templateService(app.log).delete({
            id: request.params.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

}

const GetIdParams = z.object({
    id: z.string(),
})
type GetIdParams = z.infer<typeof GetIdParams>

const GetCategoriesParams = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        tags: ['templates'],
        description: 'Get categories of templates.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const GetParams = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        tags: ['templates'],
        description: 'Get a template.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: GetIdParams,
    },
}

const ListTemplatesParams = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        tags: ['templates'],
        description: 'List templates.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListTemplatesRequestQuery,
    },
}

const GenerateFromWorkflowParams = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.MANAGE_TEMPLATE, { type: ProjectResourceType.BODY }),
    },
    schema: {
        description: 'Create a template from the published version of a workflow.',
        tags: ['templates'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: GenerateTemplateFromWorkflowRequestBody,
    },
}

const RecordUsageParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        description: 'Record that a template was used to create a workflow.',
        tags: ['templates'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: GetIdParams,
    },
}

const DeleteParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        description: 'Delete a template.',
        tags: ['templates'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: GetIdParams,
    },
}

const CreateParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        description: 'Create a template.',
        tags: ['templates'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: CreateTemplateRequestBody,
    },
}

const UpdateParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        description: 'Update a template.',
        tags: ['templates'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: GetIdParams,
        body: UpdateTemplateRequestBody,
    },
}

function viewerOf(principal: Principal): TemplateViewer {
    return {
        userId: principal.type === PrincipalType.USER ? principal.id : null,
        tenantId: 'tenant' in principal ? principal.tenant.id : null,
    }
}

function templateNotFound(id: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: {
            entityType: 'template',
            entityId: id,
            message: `Template ${id} not found`,
        },
    })
}

async function assertCanManageTemplate({ template, principal, log }: AssertCanManageTemplateParams): Promise<{ isAdmin: boolean }> {
    switch (template.type) {
        case TemplateType.OFFICIAL:
        case TemplateType.SHARED:
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Cannot change official or shared templates' },
            })
        case TemplateType.CUSTOM: {
            const principalTenantId = 'tenant' in principal ? principal.tenant.id : null
            assertTemplateBelongsToTenant({
                templateTenantId: template.tenantId,
                principalTenantId,
            })
            const { error } = await tryCatch(() => tenantGuards.assertPrincipalIsTenantAdmin({ principal, log }))
            const isAdmin = isNil(error)
            const isCreator = templateAccess.isCreator({ template, viewer: viewerOf(principal) })
            if (!isAdmin && !isCreator) {
                throw new ApplicationError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Only the template creator or a tenant admin can change this template' },
                })
            }
            if (!isAdmin && !templateAccess.canView({ template, viewer: viewerOf(principal) })) {
                throw templateNotFound(template.id)
            }
            return { isAdmin }
        }
    }
}

function assertTemplateBelongsToTenant({ templateTenantId, principalTenantId }: {
    templateTenantId: string | null | undefined
    principalTenantId: string | null
}): void {
    if (isNil(principalTenantId) || templateTenantId !== principalTenantId) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Template does not belong to your tenant' },
        })
    }
}

async function loadOfficialTemplatesOrReturnEmpty(
    log: FastifyBaseLogger,
    query: ListTemplatesRequestQuery,
): Promise<Template[]> {
    if (!isNil(query.type) && query.type !== TemplateType.OFFICIAL) {
        return []
    }
    const storedOfficialTemplates = await templateService(log).list({ ...query, tenantId: null, type: TemplateType.OFFICIAL })
    const loadTemplatesFromCloud = await communityTemplates.list({ ...query, type: TemplateType.OFFICIAL })
    const storedIds = new Set(storedOfficialTemplates.data.map((template) => template.id))
    return [...storedOfficialTemplates.data, ...loadTemplatesFromCloud.data.filter((template) => !storedIds.has(template.id))]
}

async function loadCustomTemplatesOrReturnEmpty(
    log: FastifyBaseLogger,
    query: ListTemplatesRequestQuery,
    principal: Principal,
): Promise<Template[]> {
    if ((!isNil(query.type) && query.type !== TemplateType.CUSTOM)) {
        return []
    }
    const { tenantId, userId } = viewerOf(principal)
    if (isNil(tenantId)) {
        return []
    }
    const customTemplates = await templateService(log).list({ ...query, tenantId, type: TemplateType.CUSTOM, viewerUserId: userId })
    return customTemplates.data
}

type AssertCanManageTemplateParams = {
    template: Template
    principal: Principal
    log: FastifyBaseLogger
}
