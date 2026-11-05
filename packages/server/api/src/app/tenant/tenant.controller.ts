import { ApplicationError, EntityId, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, AuthenticationResponse, CreateTenantRequest, FileType, PrincipalType, ProjectWithLimitsWithTenant, PublicTenantInfo, SERVICE_KEY_SECURITY_OPENAPI, TenantDiscoveryRequestBody, TenantDiscoveryResponse, TenantWithoutSensitiveData, UpdateTenantRequestBody, UpdateTenantSlugRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { authnRateLimit } from '../core/security/rate-limit'
import { fileService } from '../file/file.service'
import { applicationEvents } from '../helper/application-events'
import { attachMultipartFieldsToBody } from '../helper/multipart-body'
import { projectService } from '../project/project-service'
import { projectSideEffects } from '../project/project-side-effects'
import { tenantSettingsGuards } from '../tenant-access/login-security.service'
import { userService } from '../user/user-service'
import { tenantPublicInfoService } from './tenant-public-info.service'
import { tenantService } from './tenant.service'

export const tenantController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListMyTenantsEndpoint, async (req): Promise<ProjectWithLimitsWithTenant[]> => {
        const currentUser = await userService(req.log).getOneOrFail({ id: req.principal.id })
        const memberships = await userService(req.log).getUsersByIdentityId({ identityId: currentUser.identityId })
        const perTenant = await Promise.all(memberships.map(async (membership) => {
            if (isNil(membership.tenantId)) {
                return null
            }
            const tenant = await tenantService(req.log).getOne(membership.tenantId)
            if (isNil(tenant)) {
                return null
            }
            const user = await userService(req.log).getOneOrFail({ id: membership.id })
            const projects = await projectService(req.log).getAllForUser({
                tenantId: membership.tenantId,
                userId: membership.id,
                isPrivileged: userService(req.log).isUserPrivileged(user),
            })
            const enriched = await Promise.all(projects.map((project) => projectSideEffects(req.log).enrich(project)))
            return { tenantName: tenant.name, projects: enriched }
        }))
        return perTenant.filter((entry): entry is ProjectWithLimitsWithTenant => !isNil(entry))
    })

    app.post('/', CreateTenantEndpoint, async (req) => {
        const isOnboarding = req.principal.type === PrincipalType.ONBOARDING
        if (!isOnboarding) {
            // only first ee/ce user will be able to have onboarding token. which means any other principal type should not be able to create tenant
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'This action is unauthorized in non cloud editions',
                },
            })
        }
        const identityId = isOnboarding
            ? req.principal.id
            : (await userService(req.log).getOneOrFail({ id: req.principal.id })).identityId
        const { response } = await tenantService(req.log).createTenantWithProject({
            identityId,
            name: req.body.name,
            invalidatePreviousTokens: isOnboarding,
            isFirstTenant: isOnboarding,
            callerTokenVersion: req.principal.type === PrincipalType.ONBOARDING ? req.principal.tokenVersion : undefined,
        })
        return response
    })

    app.post('/:id', UpdateTenantRequest, async (req, _res) => {
        if (req.principal.tenant.id !== req.params.id) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'You are not authorized to access this tenant',
                },
            })
        }
        const tenantId = req.principal.tenant.id
        tenantSettingsGuards.assertBrandingAssetsWithinLimit([req.body.logoIcon, req.body.fullLogo, req.body.favIcon])
        if (req.body.emailAuthEnabled === false) {
            await tenantSettingsGuards.assertAnotherMethodStaysEnabled({ log: req.log, tenantId })
        }

        const [logoIconUrl, fullLogoUrl, favIconUrl] = await Promise.all([
            fileService(app.log).uploadPublicAsset({
                file: req.body.logoIcon,
                type: FileType.TENANT_ASSET,
                tenantId,
                metadata: { tenantId },
            }),
            fileService(app.log).uploadPublicAsset({
                file: req.body.fullLogo,
                type: FileType.TENANT_ASSET,
                tenantId,
                metadata: { tenantId },
            }),
            fileService(app.log).uploadPublicAsset({
                file: req.body.favIcon,
                type: FileType.TENANT_ASSET,
                tenantId,
                metadata: { tenantId },
            }),
        ])

        await tenantService(req.log).update({
            id: tenantId,
            ...req.body,
            logoIconUrl,
            fullLogoUrl,
            favIconUrl,
        })
        return tenantService(req.log).getOneWithLimitsOrThrow(tenantId)
    })

    app.get('/:id', GetTenantRequest, async (req) => {
        if (req.principal.tenant.id !== req.params.id) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'You are not authorized to access this tenant',
                },
            })
        }
        const tenant = await tenantService(req.log).getOneWithLimitsOrThrow(req.principal.tenant.id)
        return tenant
    })

    app.post('/:id/slug', UpdateSlugRequest, async (req) => {
        if (req.principal.tenant.id !== req.params.id) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'You are not authorized to access this tenant',
                },
            })
        }
        const tenant = await tenantService(req.log).updateSlug({ tenantId: req.params.id, slug: req.body.slug })
        applicationEvents(req.log).sendUserEvent(req, {
            action: ApplicationEventName.TENANT_SLUG_CHANGED,
            data: { target: tenant.name, detail: tenant.slug },
        })
        return tenantService(req.log).getOneWithLimitsOrThrow(tenant.id)
    })

    app.get('/public/:slugOrId', GetPublicTenantRequest, async (req) => {
        const info = await tenantPublicInfoService(req.log).getBySlugOrId({ slugOrId: req.params.slugOrId })
        if (isNil(info)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'tenant', entityId: req.params.slugOrId },
            })
        }
        return info
    })

    app.post('/discover', DiscoverTenantsRequest, async (req) => {
        return tenantPublicInfoService(req.log).discoverByEmail({ email: req.body.email })
    })

    app.get('/assets/:id', GetAssetRequest, async (req, reply) => {
        const { fileName, metadata, data } = await fileService(app.log).getDataOrThrow({
            fileId: req.params.id,
            type: [FileType.TENANT_ASSET, FileType.USER_PROFILE_PICTURE],
        })

        return reply
            .header(
                'Content-Disposition',
                `attachment; filename="${encodeURI(fileName ?? '')}"`,
            )
            .type(metadata?.mimetype ?? 'application/octet-stream')
            .status(StatusCodes.OK)
            .send(data)
    })


}

const ListMyTenantsEndpoint = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER]),
    },
    schema: {
        response: {
            [StatusCodes.OK]: z.array(ProjectWithLimitsWithTenant),
        },
    },
}

const CreateTenantEndpoint = {
    config: {
        security: securityAccess.unscoped([PrincipalType.ONBOARDING, PrincipalType.USER]),
    },
    schema: {
        body: CreateTenantRequest,
        response: {
            [StatusCodes.OK]: AuthenticationResponse,
        },
    },
}

const UpdateTenantRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    preValidation: attachMultipartFieldsToBody,
    schema: {
        tags: ['tenants'],
        description: 'Update a tenant, including its allowed embed origins.',
        body: UpdateTenantRequestBody,
        params: z.object({
            id: EntityId,
        }),
        response: {
            [StatusCodes.OK]: TenantWithoutSensitiveData,
        },
    },
}


const GetTenantRequest = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['tenants'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Get a tenant by id',
        params: z.object({
            id: EntityId,
        }),
        response: {
            [StatusCodes.OK]: TenantWithoutSensitiveData,
        },
    },
}

const UpdateSlugRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['tenants'],
        description: 'Change the login address (slug) of a tenant',
        params: z.object({
            id: EntityId,
        }),
        body: UpdateTenantSlugRequestBody,
        response: {
            [StatusCodes.OK]: TenantWithoutSensitiveData,
        },
    },
}

const GetPublicTenantRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['tenants'],
        params: z.object({
            slugOrId: z.string().min(1).max(200),
        }),
        response: {
            [StatusCodes.OK]: PublicTenantInfo,
        },
    },
}

const DiscoverTenantsRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['tenants'],
        body: TenantDiscoveryRequestBody,
        response: {
            [StatusCodes.OK]: TenantDiscoveryResponse,
        },
    },
}

const GetAssetRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}

