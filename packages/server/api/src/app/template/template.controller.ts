import { ErrorCode, isNil, PlatformError } from '@fema/core-utils'
import { ALL_PRINCIPAL_TYPES, CreateTemplateRequestBody, ListTemplatesRequestQuery, Principal, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, Template, TemplateType, UpdateTemplateRequestBody } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { platformGuards } from '../core/security/platform-guards'
import { platformService } from '../platform/platform.service'
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
        let platformId: string | undefined

        switch (type) {
            case TemplateType.CUSTOM: {
                await platformGuards.assertPrincipalIsPlatformAdmin({ principal: request.principal, log: request.log })
                platformId = request.principal.platform.id
            }
                break
            case TemplateType.SHARED:
                break
            case TemplateType.OFFICIAL: {
                throw new PlatformError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: 'Official templates are not supported to being created',
                    },
                })
            }
        }
        const result = await templateService(app.log).create({ platformId, params: request.body })
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
                throw new PlatformError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Cannot update official or shared templates' },
                })
            case TemplateType.CUSTOM: {
                await platformGuards.assertPrincipalIsPlatformAdmin({ principal: request.principal, log: request.log })
                assertTemplateBelongsToPlatform({
                    templatePlatformId: template.platformId,
                    principalPlatformId: request.principal.platform.id,
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
                throw new PlatformError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Cannot delete official or shared templates' },
                })
            case TemplateType.CUSTOM: {
                await platformGuards.assertPrincipalIsPlatformAdmin({ principal: request.principal, log: request.log })
                assertTemplateBelongsToPlatform({
                    templatePlatformId: template.platformId,
                    principalPlatformId: request.principal.platform.id,
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
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
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
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
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
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        description: 'Update a template.',
        tags: ['templates'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: GetIdParams,
        body: UpdateTemplateRequestBody,
    },
}

function assertTemplateBelongsToPlatform({ templatePlatformId, principalPlatformId }: {
    templatePlatformId: string | null | undefined
    principalPlatformId: string
}): void {
    if (templatePlatformId !== principalPlatformId) {
        throw new PlatformError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Template does not belong to your platform' },
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
    const platformId = principal.type === PrincipalType.UNKNOWN || principal.type === PrincipalType.WORKER || principal.type === PrincipalType.ONBOARDING ? null : principal.platform.id
    if (isNil(platformId)) {
        return []
    }
    const platform = await platformService(log).getOneWithPlanOrThrow(platformId)
    if (!platform.plan.manageTemplatesEnabled) {
        return []
    }
    const customTemplates = await templateService(log).list({ platformId, type: TemplateType.CUSTOM, ...query })
    return customTemplates.data
}