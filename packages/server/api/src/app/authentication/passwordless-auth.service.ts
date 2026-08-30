import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import { AuthenticationResponse, FlagId, OtpType, TelemetryEventName, UserIdentity, UserIdentityProvider } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { flagService } from '../flags/flag.service'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { telemetry } from '../helper/telemetry.utils'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { authenticationUtils } from './authentication-utils'
import { authenticationService } from './authentication.service'
import { disposableEmail } from './lib/disposable-email'
import { signupNames } from './lib/signup-names'
import { turnstile } from './lib/turnstile'
import { otpService } from './otp/otp-service'
import { userIdentityService } from './user-identity/user-identity-service'

export const passwordlessAuthService = (log: FastifyBaseLogger) => ({
    async requestCode({ email, tenantId, captchaToken, remoteIp }: RequestCodeParams): Promise<void> {
        await turnstile.assertSolved({ token: captchaToken, remoteIp, log })
        const existingIdentity = await userIdentityService(log).getIdentityByEmail(email)
        if (isNil(existingIdentity)) {
            await disposableEmail.assertMaySignUp({ email, log })
        }
        if (!isNil(tenantId)) {
            await assertTenantAuthIsOpenTo({ email, tenantId, log })
            const mayJoin = await mayJoinTenant({ email, tenantId, identity: existingIdentity, log })
            if (!mayJoin) {
                return
            }
        }
        if (isNil(existingIdentity)) {
            await userIdentityService(log).create({
                email,
                password: await cryptoUtils.generateRandomPassword(),
                firstName: signupNames.firstNameFromEmail(email),
                lastName: '',
                trackEvents: true,
                newsLetter: false,
                provider: UserIdentityProvider.EMAIL,
                verified: false,
            })
        }
        await otpService(log).createAndSend({
            tenantId,
            email,
            type: OtpType.EMAIL_LOGIN,
        })
        const identity = await userIdentityService(log).getIdentityByEmail(email)
        if (!isNil(identity)) {
            rejectedPromiseHandler(telemetry(log).trackIdentity(identity.id, {
                name: TelemetryEventName.EMAIL_CODE_REQUESTED,
                payload: { isNewIdentity: isNil(existingIdentity) },
            }), log)
        }
    },

    async verifyCode({ email, code, tenantId }: VerifyCodeParams): Promise<AuthenticationResponse> {
        const identity = await userIdentityService(log).getIdentityByEmail(email)
        if (isNil(identity)) {
            throw new ApplicationError({ code: ErrorCode.INVALID_OTP, params: {} })
        }
        if (!isNil(tenantId)) {
            await assertTenantAuthIsOpenTo({ email, tenantId, log })
        }
        const codeIsValid = await otpService(log).confirm({
            identityId: identity.id,
            type: OtpType.EMAIL_LOGIN,
            value: code,
        })
        if (!codeIsValid) {
            throw new ApplicationError({ code: ErrorCode.INVALID_OTP, params: {} })
        }
        const verifiedIdentity = identity.verified ? identity : await userIdentityService(log).verifyAndDiscardPassword(identity.id)
        await flagService(log).save({ id: FlagId.USER_CREATED, value: true })

        const preferredTenantId = isNil(tenantId)
            ? await authenticationService(log).resolvePreferredTenantId({ identityId: verifiedIdentity.id })
            : tenantId
        rejectedPromiseHandler(telemetry(log).trackIdentity(verifiedIdentity.id, {
            name: TelemetryEventName.EMAIL_CODE_VERIFIED,
            payload: { needsNameStep: isNil(preferredTenantId) },
        }), log)

        if (!isNil(tenantId)) {
            const mayJoin = await mayJoinTenant({ email, tenantId, identity: verifiedIdentity, log })
            if (!mayJoin) {
                throw new ApplicationError({
                    code: ErrorCode.INVITATION_ONLY_SIGN_UP,
                    params: { message: 'User is not invited to the tenant' },
                })
            }
            const user = await userService(log).getOrCreateWithProject({
                identity: verifiedIdentity,
                tenantId,
            })
            await userInvitationsService(log).provisionUserInvitation({ email })
            return authenticationUtils(log).getProjectAndToken({
                userId: user.id,
                tenantId,
                projectId: null,
            })
        }

        if (!isNil(preferredTenantId)) {
            await assertTenantAuthIsOpenTo({ email, tenantId: preferredTenantId, log })
            const user = await userService(log).getOrCreateWithProject({
                identity: verifiedIdentity,
                tenantId: preferredTenantId,
            })
            return authenticationUtils(log).getProjectAndToken({
                userId: user.id,
                tenantId: preferredTenantId,
                projectId: null,
            })
        }
        return authenticationUtils(log).getOnboardingResponse({ identityId: verifiedIdentity.id })
    },

    async completeSignUp({ identityId, fullName }: CompleteSignUpParams): Promise<CompleteSignUpResult> {
        const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
        const { firstName, lastName } = signupNames.splitFullName({ fullName, email: identity.email })
        const writeNames = async (): Promise<void> => {
            await userIdentityService(log).updateNames({ id: identityId, firstName, lastName })
        }
        const { response, provisioned } = await tenantService(log).createTenantWithProject({
            identityId,
            name: signupNames.tenantNameFromPerson({ firstName, email: identity.email }),
            invalidatePreviousTokens: false,
            isFirstTenant: true,
            callerTokenVersion: undefined,
            beforeProvision: writeNames,
        })
        return { response, signedUp: provisioned }
    },
})

async function assertTenantAuthIsOpenTo({ email, tenantId, log }: TenantGateParams): Promise<void> {
    await authenticationUtils(log).assertEmailAuthIsEnabled({
        tenantId,
        provider: UserIdentityProvider.EMAIL,
    })
    await authenticationUtils(log).assertDomainIsAllowed({ email, tenantId })
}

async function mayJoinTenant({ email, tenantId, identity, log }: MayJoinTenantParams): Promise<boolean> {
    if (system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) === 'true') {
        return true
    }
    const isExistingMember = !isNil(identity)
        && !isNil(await userService(log).getOneByIdentityAndTenant({ identityId: identity.id, tenantId }))
    if (isExistingMember) {
        return true
    }
    return userInvitationsService(log).hasAnyAcceptedInvitations({ tenantId, email })
}

type RequestCodeParams = {
    email: string
    tenantId: string | null
    captchaToken: string | undefined
    remoteIp: string | undefined
}

type CompleteSignUpResult = {
    response: AuthenticationResponse
    signedUp: boolean
}

type CompleteSignUpParams = {
    identityId: string
    fullName: string
}

type VerifyCodeParams = {
    email: string
    code: string
    tenantId: string | null
}

type TenantGateParams = {
    email: string
    tenantId: string
    log: FastifyBaseLogger
}

type MayJoinTenantParams = TenantGateParams & {
    identity: UserIdentity | null
}
