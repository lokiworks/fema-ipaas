import { ApplicationError, ErrorCode, isMultipartFile, isNil } from '@fema-ipaas/core-utils'
import { LoginSecuritySettings, TENANT_BRANDING_LIMITS, UpdateLoginSecurityRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { emailService } from '../helper/email/email-service'
import { ssoConfigUtils } from '../sso/sso-config.service'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { tenantAccessUtils } from './tenant-access.utils'

export const loginSecurityService = (log: FastifyBaseLogger) => ({
    async get({ tenantId }: TenantParams): Promise<LoginSecuritySettings> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        return {
            methods: tenantAccessUtils.loginMethods({ emailAuthEnabled: tenant.emailAuthEnabled, providers: tenant.federatedAuthProviders }),
            passwordMinLength: tenant.passwordMinLength,
            sessionDurationDays: tenant.sessionDurationDays,
            emailDelivery: emailService(log).isConfigured(),
        }
    },

    async update({ tenantId, request }: UpdateParams): Promise<LoginSecuritySettings> {
        if (request.emailAuthEnabled === false) {
            await assertAnotherMethodStaysEnabled({ log, tenantId })
        }
        await tenantRepo().update({ id: tenantId }, {
            ...(isNil(request.emailAuthEnabled) ? {} : { emailAuthEnabled: request.emailAuthEnabled }),
            ...(isNil(request.passwordMinLength) ? {} : { passwordMinLength: request.passwordMinLength }),
            ...(isNil(request.sessionDurationDays) ? {} : { sessionDurationDays: request.sessionDurationDays }),
        })
        return this.get({ tenantId })
    },
})

async function assertAnotherMethodStaysEnabled({ log, tenantId }: { log: FastifyBaseLogger, tenantId: string }): Promise<void> {
    const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
    const methods = tenantAccessUtils.loginMethods({ emailAuthEnabled: false, providers: tenant.federatedAuthProviders })
    if (tenantAccessUtils.countEnabledLoginMethods(methods) === 0 || !ssoConfigUtils.hasVerifiedEnabled(tenant.federatedAuthProviders)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'Turn on a single sign-in method and pass its test sign-in before turning off password sign-in' },
        })
    }
}

function assertBrandingAssetsWithinLimit(files: unknown[]): void {
    const tooLarge = files.some((file) => isMultipartFile(file) && file.data.length > TENANT_BRANDING_LIMITS.logoMaxBytes)
    if (tooLarge) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `Logo files must be at most ${TENANT_BRANDING_LIMITS.logoMaxBytes / 1024} KB` },
        })
    }
}

export const tenantSettingsGuards = {
    assertAnotherMethodStaysEnabled,
    assertBrandingAssetsWithinLimit,
}

type TenantParams = {
    tenantId: string
}

type UpdateParams = TenantParams & {
    request: UpdateLoginSecurityRequestBody
}
