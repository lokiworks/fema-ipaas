import { ApplicationError, ErrorCode, isMultipartFile, isNil } from '@fema-ipaas/core-utils'
import { LoginMethod, LoginMethodStatus, LoginSecuritySettings, TENANT_BRANDING_LIMITS, UpdateLoginSecurityRequestBody, UpdateTenantMfaPolicyRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { mfaService } from '../authentication/mfa/mfa.service'
import { smsSettingsService } from '../authentication/sms/sms-settings.service'
import { emailService } from '../helper/email/email-service'
import { ssoConfigUtils } from '../sso/sso-config.service'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { tenantAccessUtils } from './tenant-access.utils'
import { tenantMembersService } from './tenant-members.service'

export const loginSecurityService = (log: FastifyBaseLogger) => ({
    async get({ tenantId }: TenantParams): Promise<LoginSecuritySettings> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const smsAvailable = await smsSettingsService.isAvailable()
        return {
            methods: withPhoneMethod({
                methods: tenantAccessUtils.loginMethods({ emailAuthEnabled: tenant.emailAuthEnabled, providers: tenant.federatedAuthProviders }),
                smsAvailable,
                phoneAuthEnabled: tenant.phoneAuthEnabled,
            }),
            passwordMinLength: tenant.passwordMinLength,
            sessionDurationDays: tenant.sessionDurationDays,
            emailDelivery: emailService(log).isConfigured(),
            smsDelivery: smsAvailable,
            phoneAuthEnabled: tenant.phoneAuthEnabled,
            mfaPolicy: tenant.mfaPolicy,
        }
    },

    async updateMfaPolicy({ tenantId, request }: UpdateMfaPolicyParams): Promise<LoginSecuritySettings> {
        if (request.phoneAuthEnabled === true && !await smsSettingsService.isAvailable()) {
            throw new ApplicationError({ code: ErrorCode.SMS_NOT_CONFIGURED, params: {} })
        }
        await tenantRepo().update({ id: tenantId }, {
            mfaPolicy: request.mfaPolicy,
            ...(isNil(request.phoneAuthEnabled) ? {} : { phoneAuthEnabled: request.phoneAuthEnabled }),
        })
        return this.get({ tenantId })
    },

    async resetMemberMfa({ tenantId, userId, actorId }: ResetMemberMfaParams): Promise<void> {
        const member = await tenantMembersService(log).assertEditable({ tenantId, userId, actorId })
        await mfaService(log).adminReset({ identityId: member.identityId })
        log.info({ tenant: { id: tenantId }, user: { id: userId } }, '[loginSecurity] two-step verification reset by admin')
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

function withPhoneMethod({ methods, smsAvailable, phoneAuthEnabled }: WithPhoneMethodParams): LoginMethodStatus[] {
    return methods.map((status) => status.method === LoginMethod.PHONE_SMS
        ? { method: LoginMethod.PHONE_SMS, available: smsAvailable, configured: smsAvailable, enabled: smsAvailable && phoneAuthEnabled }
        : status)
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

type UpdateMfaPolicyParams = TenantParams & {
    request: UpdateTenantMfaPolicyRequestBody
}

type ResetMemberMfaParams = TenantParams & {
    userId: string
    actorId: string
}

type WithPhoneMethodParams = {
    methods: LoginMethodStatus[]
    smsAvailable: boolean
    phoneAuthEnabled: boolean
}

type UpdateParams = TenantParams & {
    request: UpdateLoginSecurityRequestBody
}
