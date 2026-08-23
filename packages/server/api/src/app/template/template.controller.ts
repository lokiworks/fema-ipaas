import { ApplicationError, ErrorCode, isNil } from '@fema/core-utils'
import { ALL_PRINCIPAL_TYPES, CreateTemplateRequestBody, ListTemplatesRequestQuery, Principal, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, Template, TemplateType, UpdateTemplateRequestBody } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { tenantGuards } from '../core/security/tenant-guards'
import { tenantService } from '../tenant/tenant.service'
import { migrateWorkflowVersionTemplateList } from '../workflows/workflow-version/migrations'
import { communityTemplates } from './community-templates.service'
import { templateService } from './template.service'


export const templateController: FastifyPluginAsyncZod = async (app) => {
    app.get('/:id', GetParams, async (request) => {
        const template = await templateService(app.log).getOne({ id: request.params.id })
        if (!isNil(template)) {
            return template
        }
        return communityTemplates.getOrThrow(request.params.id)
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

        switch (template.type) {
            case TemplateType.OFFICIAL:
            case TemplateType.SHARED:
                throw new ApplicationError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Cannot update official or shared templates' },
                })
            case TemplateType.CUSTOM: {
                await tenantGuards.assertPrincipalIsTenantAdmin({ principal: request.principal, log: request.log })
                assertTemplateBelongsToTenant({
                    templateTenantId: template.tenantId,
                    principalTenantId: request.principal.tenant.id,
                })
                break
            }
        }

        const result = await templateService(app.log).update({ id: request.params.id, params: request.body })
        return reply.status(StatusCodes.OK).send(result)
    })

    app.delete('/:id', DeleteParams, async (request, reply) => {
        const template = await templateService(app.log).getOneOrThrow({ id: request.params.id })

        switch (template.type) {
            case TemplateType.OFFICIAL:
            case TemplateType.SHARED:
                throw new ApplicationError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Cannot delete official or shared templates' },
                })
            case TemplateType.CUSTOM: {
                await tenantGuards.assertPrincipalIsTenantAdmin({ principal: request.principal, log: request.log })
                assertTemplateBelongsToTenant({
                    templateTenantId: template.tenantId,
                    principalTenantId: request.principal.tenant.id,
                })
                break
            }
        }

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
        security: securityAccess.public(),
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

function assertTemplateBelongsToTenant({ templateTenantId, principalTenantId }: {
    templateTenantId: string | null | undefined
    principalTenantId: string
}): void {
    if (templateTenantId !== principalTenantId) {
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
    const loadTemplatesFromCloud = await communityTemplates.list({ ...query, type: TemplateType.OFFICIAL })
    return loadTemplatesFromCloud.data
}

async function loadCustomTemplatesOrReturnEmpty(
    log: FastifyBaseLogger,
    query: ListTemplatesRequestQuery,
    principal: Principal,
): Promise<Template[]> {
    if ((!isNil(query.type) && query.type !== TemplateType.CUSTOM)) {
        return []
    }
    const tenantId = principal.type === PrincipalType.UNKNOWN || principal.type === PrincipalType.WORKER || principal.type === PrincipalType.ONBOARDING ? null : principal.tenant.id
    if (isNil(tenantId)) {
        return []
    }
    const tenant = await tenantService(log).getOneWithPlanOrThrow(tenantId)
    if (!tenant.plan.manageTemplatesEnabled) {
        return []
    }
    const customTemplates = await templateService(log).list({ tenantId, type: TemplateType.CUSTOM, ...query })
    return customTemplates.data
}