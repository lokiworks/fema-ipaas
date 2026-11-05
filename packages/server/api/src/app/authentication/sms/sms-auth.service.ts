import { ApplicationError, ErrorCode, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import { AuthenticationResponse, FlagId, UserIdentity, UserIdentityProvider } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { flagService } from '../../flags/flag.service'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { tenantService } from '../../tenant/tenant.service'
import { userService } from '../../user/user-service'
import { userInvitationsService } from '../../user-invitations/user-invitation.service'
import { authenticationService, LoginChannel } from '../authentication.service'
import { captcha } from '../captcha/captcha'
import { phoneNumber } from '../lib/phone-number'
import { tenantLookup } from '../lib/tenant-lookup'
import { userIdentityService } from '../user-identity/user-identity-service'
import { SmsCodePurpose, smsCodeService } from './sms-code.service'
import { smsSettingsService } from './sms-settings.service'

export const smsAuthService = (log: FastifyBaseLogger) => ({
    async requestLoginCode({ phone, tenantId, captchaToken, remoteIp }: RequestLoginCodeParams): Promise<void> {
        await assertSmsReady({ tenantId })
        await captcha.assertSolved({ token: captchaToken, remoteIp, log })
        await smsCodeService(log).reserveSlot({ phone })
        const identity = await userIdentityService(log).getByPhone(phone)
        const allowed = await mayUseSms({ log, tenantId, identity })
        if (!allowed) {
            log.info({ tenantId }, '[sms] sign-in code withheld, the number may not join the tenant')
            return
        }
        await smsCodeService(log).send({ phone, purpose: SmsCodePurpose.LOGIN })
    },

    async verifyLoginCode({ phone, code, tenantId }: VerifyLoginCodeParams): Promise<AuthenticationResponse> {
        await assertSmsReady({ tenantId })
        const accepted = await smsCodeService(log).verify({ phone, purpose: SmsCodePurpose.LOGIN, code })
        if (!accepted) {
            throw new ApplicationError({ code: ErrorCode.INVALID_OTP, params: {} })
        }
        const existing = await userIdentityService(log).getByPhone(phone)
        const allowed = await mayUseSms({ log, tenantId, identity: existing })
        if (!allowed) {
            throw new ApplicationError({
                code: ErrorCode.INVITATION_ONLY_SIGN_UP,
                params: { message: 'User is not invited to the tenant' },
            })
        }
        const identity = await ensureIdentity({ log, phone, existing })
        if (!isNil(tenantId)) {
            await userService(log).getOrCreateWithProject({ identity, tenantId })
            if (!isNil(identity.email)) {
                await userInvitationsService(log).provisionUserInvitation({ email: identity.email })
            }
        }
        await flagService(log).save({ id: FlagId.USER_CREATED, value: true })
        return authenticationService(log).completeLogin({
            identity,
            requestedTenantId: tenantId,
            method: LoginChannel.SMS,
        })
    },

    async requestBindingCode({ identityId, phone, captchaToken, remoteIp }: RequestBindingCodeParams): Promise<void> {
        if (!await smsSettingsService.isAvailable()) {
            throw new ApplicationError({ code: ErrorCode.SMS_NOT_CONFIGURED, params: {} })
        }
        await captcha.assertSolved({ token: captchaToken, remoteIp, log })
        await assertPhoneIsFree({ log, identityId, phone })
        await smsCodeService(log).reserveSlot({ phone })
        await smsCodeService(log).send({ phone, purpose: SmsCodePurpose.BIND })
    },

    async confirmBinding({ identityId, phone, code }: ConfirmBindingParams): Promise<UserIdentity> {
        await assertPhoneIsFree({ log, identityId, phone })
        const accepted = await smsCodeService(log).verify({ phone, purpose: SmsCodePurpose.BIND, code })
        if (!accepted) {
            throw new ApplicationError({ code: ErrorCode.INVALID_OTP, params: {} })
        }
        return userIdentityService(log).bindPhone({ id: identityId, phone })
    },
})

async function assertSmsReady({ tenantId }: TenantParams): Promise<void> {
    if (!await smsSettingsService.isAvailable()) {
        throw new ApplicationError({ code: ErrorCode.SMS_NOT_CONFIGURED, params: {} })
    }
    if (isNil(tenantId)) {
        return
    }
    const tenant = await tenantLookup.findOrFail({ tenantId })
    if (!tenant.phoneAuthEnabled) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Phone sign-in is disabled for this tenant' },
        })
    }
}

async function mayUseSms({ log, tenantId, identity }: MayUseSmsParams): Promise<boolean> {
    if (isNil(tenantId)) {
        return !isNil(identity) || await mayOnboard({ log })
    }
    if (system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) === 'true') {
        return true
    }
    if (isNil(identity)) {
        return false
    }
    const membership = await userService(log).getOneByIdentityAndTenant({ identityId: identity.id, tenantId })
    if (!isNil(membership)) {
        return true
    }
    if (isNil(identity.email)) {
        return false
    }
    return userInvitationsService(log).hasAnyAcceptedInvitations({ tenantId, email: identity.email })
}

async function mayOnboard({ log }: { log: FastifyBaseLogger }): Promise<boolean> {
    if (system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) === 'true') {
        return true
    }
    const { error } = await tryCatch(() => tenantService(log).assertOnboardingAllowed())
    return isNil(error)
}

async function ensureIdentity({ log, phone, existing }: EnsureIdentityParams): Promise<UserIdentity> {
    if (!isNil(existing)) {
        return existing.phoneVerified ? existing : userIdentityService(log).bindPhone({ id: existing.id, phone })
    }
    return userIdentityService(log).create({
        email: null,
        phone,
        phoneVerified: true,
        password: await cryptoUtils.generateRandomPassword(),
        firstName: phoneNumber.mask({ phone }),
        lastName: '',
        trackEvents: true,
        newsLetter: false,
        provider: UserIdentityProvider.PHONE,
        verified: true,
    })
}

async function assertPhoneIsFree({ log, identityId, phone }: AssertPhoneFreeParams): Promise<void> {
    const owner = await userIdentityService(log).getByPhone(phone)
    if (!isNil(owner) && owner.id !== identityId) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'phoneAlreadyBound' },
        })
    }
}

type TenantParams = {
    tenantId: string | null
}

type RequestLoginCodeParams = TenantParams & {
    phone: string
    captchaToken: string | undefined
    remoteIp: string | undefined
}

type VerifyLoginCodeParams = TenantParams & {
    phone: string
    code: string
}

type RequestBindingCodeParams = {
    identityId: string
    phone: string
    captchaToken: string | undefined
    remoteIp: string | undefined
}

type ConfirmBindingParams = {
    identityId: string
    phone: string
    code: string
}

type MayUseSmsParams = TenantParams & {
    log: FastifyBaseLogger
    identity: UserIdentity | null
}

type EnsureIdentityParams = {
    log: FastifyBaseLogger
    phone: string
    existing: UserIdentity | null
}

type AssertPhoneFreeParams = {
    log: FastifyBaseLogger
    identityId: string
    phone: string
}

