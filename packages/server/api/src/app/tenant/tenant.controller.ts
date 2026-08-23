import { ApId, ApplicationError, ErrorCode } from '@fema/core-utils'
import { AuthenticationResponse, CreateTenantRequest, FileType, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, TenantWithoutSensitiveData, UpdateTenantRequestBody } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { fileService } from '../file/file.service'
import { attachMultipartFieldsToBody } from '../helper/multipart-body'
import { userService } from '../user/user-service'
import { tenantService } from './tenant.service'

export const tenantController: FastifyPluginAsyncZod = async (app) => {
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
        const { response } = await tenantService(req.log).createTenantWithWorkspace({
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
        return tenantService(req.log).getOneWithPlanAndUsageOrThrow(tenantId)
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
        const tenant = await tenantService(req.log).getOneWithPlanAndUsageOrThrow(req.principal.tenant.id)
        return tenant
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
        body: UpdateTenantRequestBody,
        params: z.object({
            id: ApId,
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
            id: ApId,
        }),
        response: {
            [StatusCodes.OK]: TenantWithoutSensitiveData,
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

