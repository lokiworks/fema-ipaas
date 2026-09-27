import { ApplicationError, ErrorCode, isMultipartFile, isNil } from '@fema-ipaas/core-utils'
import { LoginSecuritySettings, TENANT_BRANDING_LIMITS, UpdateLoginSecurityRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { emailService } from '../helper/email/email-service'
import { tenantRepo } from '../tenant/tenant.service'
import { tenantAccessUtils } from './tenant-access.utils'

export const loginSecurityService = (log: FastifyBaseLogger) => ({
    async get({ tenantId }: TenantParams): Promise<LoginSecuritySettings> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        return {
            methods: tenantAccessUtils.loginMethods({ emailAuthEnabled: tenant.emailAuthEnabled }),
            passwordMinLength: tenant.passwordMinLength,
            sessionDurationDays: tenant.sessionDurationDays,
            emailDelivery: emailService(log).isConfigured(),
        }
    },

    async update({ tenantId, request }: UpdateParams): Promise<LoginSecuritySettings> {
        if (request.emailAuthEnabled === false) {
            assertAnotherMethodStaysEnabled({ emailAuthEnabled: false })
        }
        await tenantRepo().update({ id: tenantId }, {
            ...(isNil(request.emailAuthEnabled) ? {} : { emailAuthEnabled: request.emailAuthEnabled }),
            ...(isNil(request.passwordMinLength) ? {} : { passwordMinLength: request.passwordMinLength }),
            ...(isNil(request.sessionDurationDays) ? {} : { sessionDurationDays: request.sessionDurationDays }),
        })
        return this.get({ tenantId })
    },
})

function assertAnotherMethodStaysEnabled({ emailAuthEnabled }: { emailAuthEnabled: boolean }): void {
    const methods = tenantAccessUtils.loginMethods({ emailAuthEnabled })
    if (tenantAccessUtils.countEnabledLoginMethods(methods) === 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'At least one sign-in method must stay enabled' },
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
