import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { PLATFORM_API, PlatformClientKind, PlatformScope } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { platformClientService } from './platform-client.service'
import { platformClientUtils } from './platform-client.utils'
import { platformIssuerVerifier } from './platform-issuer-verifier'

const callers = new WeakMap<FastifyRequest, PlatformCaller>()

async function authenticate({ request, scope }: AuthenticateParams): Promise<PlatformCaller> {
    const token = bearerTokenOf({ request })
    if (isNil(token)) {
        throw unauthorized({ message: 'A platform credential is required' })
    }
    const isApiKey = token.startsWith(PLATFORM_API.apiKeyPrefix)
    const caller = isApiKey
        ? await authenticateApiKey({ request, token })
        : await authenticateIssuerToken({ request, token })
    if (!platformClientUtils.hasScope({ scopes: caller.scopes, required: scope })) {
        throw forbidden({ message: `The platform credential lacks the ${scope} permission` })
    }
    return caller
}

async function authenticateApiKey({ request, token }: TokenParams): Promise<PlatformCaller> {
    const parsed = platformClientUtils.parseApiKey({ token })
    if (isNil(parsed)) {
        throw unauthorized({ message: 'The platform credential is invalid' })
    }
    const client = await platformClientService(request.log).findActiveByKeyPrefix({ keyPrefix: parsed.keyPrefix })
    if (isNil(client) || !platformClientUtils.secretMatches({ secret: parsed.secret, storedHash: client.secretHash })) {
        throw unauthorized({ message: 'The platform credential is invalid' })
    }
    await platformClientService(request.log).touch({ id: client.id })
    return { clientId: client.id, clientName: client.name, kind: PlatformClientKind.API_KEY, issuer: null, scopes: client.scopes }
}

async function authenticateIssuerToken({ request, token }: TokenParams): Promise<PlatformCaller> {
    const issuer = platformIssuerVerifier.unverifiedIssuer({ token })
    if (isNil(issuer)) {
        throw unauthorized({ message: 'The platform credential is invalid' })
    }
    const clients = await platformClientService(request.log).listActiveByIssuer({ issuer })
    if (clients.length === 0) {
        throw unauthorized({ message: 'The issuer is not trusted' })
    }
    const claims = await platformIssuerVerifier.verify({ token, issuer })
    if (isNil(claims)) {
        throw unauthorized({ message: 'The platform credential is invalid' })
    }
    const client = clients.find((candidate) => platformClientUtils.isSubjectAllowed({ claims, allowedSubjects: candidate.allowedSubjects }))
    if (isNil(client)) {
        throw unauthorized({ message: 'The caller is not allowed to use the platform API' })
    }
    await platformClientService(request.log).touch({ id: client.id })
    return { clientId: client.id, clientName: client.name, kind: PlatformClientKind.TRUSTED_ISSUER, issuer: client.issuer ?? null, scopes: client.scopes }
}

function bearerTokenOf({ request }: { request: FastifyRequest }): string | null {
    const header = request.headers['authorization']
    if (isNil(header) || !header.startsWith('Bearer ')) {
        return null
    }
    const token = header.slice('Bearer '.length).trim()
    return token.length === 0 ? null : token
}

function forbidden({ message }: { message: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

function unauthorized({ message }: { message: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.PLATFORM_CLIENT_UNAUTHORIZED,
        params: { message },
    })
}

function preHandler(scope: PlatformScope) {
    return async (request: FastifyRequest): Promise<void> => {
        callers.set(request, await authenticate({ request, scope }))
    }
}

function callerOf({ request }: { request: FastifyRequest }): PlatformCaller {
    const caller = callers.get(request)
    if (isNil(caller)) {
        throw unauthorized({ message: 'A platform credential is required' })
    }
    return caller
}

export const platformAuth = {
    authenticate,
    preHandler,
    callerOf,
}

export type PlatformCaller = {
    clientId: string
    clientName: string
    kind: PlatformClientKind
    issuer: string | null
    scopes: PlatformScope[]
}

type AuthenticateParams = {
    request: FastifyRequest
    scope: PlatformScope
}

type TokenParams = {
    request: FastifyRequest
    token: string
}
