import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, AuthenticationResponse, MfaDisableRequest, MfaEnrollConfirmRequest, MfaEnrollConfirmResponse, MfaEnrollStartRequest, MfaEnrollStartResponse, MfaVerifyRequest, PrincipalType, TelemetryEventName } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { authnRateLimit } from '../../core/security/rate-limit'
import { authenticateOrThrow } from '../../core/security/v2/authn/authenticate'
import { applicationEvents } from '../../helper/application-events'
import { networkUtils } from '../../helper/network-utils'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { telemetry } from '../../helper/telemetry.utils'
import { userService } from '../../user/user-service'
import { authenticationService } from '../authentication.service'
import { userIdentityService } from '../user-identity/user-identity-service'
import { mfaService } from './mfa.service'

export const mfaController: FastifyPluginAsyncZod = async (app) => {
    app.post('/verify', VerifyRequestOptions, async (request) => {
        const challenge = await mfaService(request.log).verifyChallenge({
            challengeToken: request.body.challengeToken,
            code: request.body.code,
        })
        const response = await authenticationService(request.log).completeAfterMfa({
            identityId: challenge.identityId,
            tenantId: challenge.tenantId,
        })
        announceSignIn({ request, response, method: 'mfa' })
        return response
    })

    app.post('/enroll/start', EnrollStartRequestOptions, async (request): Promise<MfaEnrollStartResponse> => {
        const subject = await resolveEnrollmentSubject({ request, challengeToken: request.body.challengeToken })
        const identity = await userIdentityService(request.log).getOneOrFail({ id: subject.identityId })
        return mfaService(request.log).startEnrollment({ identity, tenantId: subject.tenantId })
    })

    app.post('/enroll/confirm', EnrollConfirmRequestOptions, async (request): Promise<MfaEnrollConfirmResponse> => {
        const subject = await resolveEnrollmentSubject({ request, challengeToken: request.body.challengeToken })
        if (isNil(subject.challengeToken)) {
            const recoveryCodes = await mfaService(request.log).confirmEnrollment({ identityId: subject.identityId, code: request.body.code })
            return { recoveryCodes, authentication: null }
        }
        await mfaService(request.log).spendAttempt({ challengeToken: subject.challengeToken })
        const recoveryCodes = await mfaService(request.log).confirmEnrollment({ identityId: subject.identityId, code: request.body.code })
        await mfaService(request.log).finishChallenge({ challengeToken: subject.challengeToken })
        const authentication = await authenticationService(request.log).completeAfterMfa({
            identityId: subject.identityId,
            tenantId: subject.tenantId,
        })
        announceSignIn({ request, response: authentication, method: 'mfa' })
        return { recoveryCodes, authentication }
    })

    app.post('/disable', DisableRequestOptions, async (request, reply) => {
        const principal = request.principal
        if (principal.type !== PrincipalType.USER) {
            throw notSignedIn()
        }
        const user = await userService(request.log).getOneOrFail({ id: principal.id })
        const memberships = await userService(request.log).getByIdentityId({ identityId: user.identityId })
        const tenantIds = memberships.flatMap((membership) => isNil(membership.tenantId) ? [] : [membership.tenantId])
        if (await mfaService(request.log).isRequiredByAnyTenant({ tenantIds })) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'mfaRequiredByTenant' },
            })
        }
        await mfaService(request.log).disable({ identityId: user.identityId, code: request.body.code })
        return reply.code(StatusCodes.NO_CONTENT).send()
    })
}

async function resolveEnrollmentSubject({ request, challengeToken }: ResolveSubjectParams): Promise<EnrollmentSubject> {
    if (!isNil(challengeToken)) {
        const challenge = await mfaService(request.log).resolveChallenge({ challengeToken, enrollment: true })
        return { identityId: challenge.identityId, tenantId: challenge.tenantId, challengeToken }
    }
    const principal = await authenticateOrThrow(request.log, request.headers.authorization ?? null)
    if (principal.type !== PrincipalType.USER) {
        throw notSignedIn()
    }
    const user = await userService(request.log).getOneOrFail({ id: principal.id })
    return { identityId: user.identityId, tenantId: principal.tenant.id, challengeToken: null }
}

function announceSignIn({ request, response, method }: AnnounceParams): void {
    if (isNil(response.tenantId)) {
        return
    }
    applicationEvents(request.log).sendUserEvent({
        tenantId: response.tenantId,
        userId: response.id,
        projectId: response.projectId ?? undefined,
        ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
    }, {
        action: ApplicationEventName.USER_SIGNED_IN,
        data: { method },
    })
    rejectedPromiseHandler(telemetry(request.log).trackUser(response.id, {
        name: TelemetryEventName.SIGNED_IN,
        payload: {
            userId: response.id,
            tenantId: response.tenantId,
        },
    }, { tenant: response.tenantId }), request.log)
}

function notSignedIn(): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.AUTHENTICATION,
        params: { message: 'Sign in to manage two-step verification' },
    })
}

const VerifyRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: MfaVerifyRequest,
    },
}

const EnrollStartRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: MfaEnrollStartRequest,
        response: {
            [StatusCodes.OK]: MfaEnrollStartResponse,
        },
    },
}

const EnrollConfirmRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: MfaEnrollConfirmRequest,
        response: {
            [StatusCodes.OK]: MfaEnrollConfirmResponse,
        },
    },
}

const DisableRequestOptions = {
    config: {
        security: securityAccess.unscoped([PrincipalType.USER]),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: MfaDisableRequest,
    },
}

type ResolveSubjectParams = {
    request: FastifyRequest
    challengeToken: string | undefined
}

type EnrollmentSubject = {
    identityId: string
    tenantId: string | null
    challengeToken: string | null
}

type AnnounceParams = {
    request: FastifyRequest
    response: AuthenticationResponse
    method: 'mfa'
}
