import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import {
    CreatePersonalAccessTokenRequestBody,
    CreatePersonalAccessTokenResponse,
    PERSONAL_ACCESS_TOKEN_MAX_PER_USER,
    PersonalAccessToken,
    PrincipalType,
    UserPrincipal,
    UserStatus,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { userRepo } from '../user/user-service'
import { personalAccessTokenUtils } from './personal-access-token-utils'
import { PersonalAccessTokenEntity, PersonalAccessTokenSchema } from './personal-access-token.entity'

export const personalAccessTokenRepo = repoFactory(PersonalAccessTokenEntity)

export const personalAccessTokenService = (log: FastifyBaseLogger) => ({
    async list({ userId, tenantId }: UserRef): Promise<PersonalAccessToken[]> {
        const rows = await personalAccessTokenRepo().find({ where: { userId, tenantId }, order: { created: 'DESC' } })
        return rows.map(toModel)
    },

    async create({ userId, tenantId, request }: UserRef & { request: CreatePersonalAccessTokenRequestBody }): Promise<CreatePersonalAccessTokenResponse> {
        const existing = await personalAccessTokenRepo().find({ where: { userId, tenantId }, select: ['id', 'name'] })
        if (existing.length >= PERSONAL_ACCESS_TOKEN_MAX_PER_USER) {
            throw validation(`You can have at most ${PERSONAL_ACCESS_TOKEN_MAX_PER_USER} access tokens`)
        }
        const name = request.name.trim()
        if (existing.some((token) => token.name === name)) {
            throw validation('A token with this name already exists')
        }
        const value = personalAccessTokenUtils.generate()
        const now = new Date()
        const id = generateId()
        await personalAccessTokenRepo().insert({
            id,
            created: now.toISOString(),
            updated: now.toISOString(),
            tenantId,
            userId,
            name,
            tokenHash: personalAccessTokenUtils.hash(value),
            tokenHint: personalAccessTokenUtils.hint(value),
            expiresAt: personalAccessTokenUtils.expiresAt({ expiry: request.expiry, now }),
            lastUsedAt: null,
        })
        const saved = await personalAccessTokenRepo().findOneByOrFail({ id, userId, tenantId })
        log.info({ user: { id: userId } }, '[personalAccessTokenService#create] Personal access token created')
        return { token: toModel(saved), value }
    },

    async revoke({ id, userId, tenantId }: UserRef & { id: string }): Promise<PersonalAccessToken> {
        const token = await personalAccessTokenRepo().findOneBy({ id, userId, tenantId })
        if (isNil(token)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'personal_access_token', entityId: id } })
        }
        await personalAccessTokenRepo().delete({ id, userId, tenantId })
        return toModel(token)
    },

    async authenticate(value: string): Promise<UserPrincipal> {
        if (!personalAccessTokenUtils.isPersonalAccessToken(value)) {
            throw invalidToken()
        }
        const token = await personalAccessTokenRepo().findOneBy({ tokenHash: personalAccessTokenUtils.hash(value) })
        const now = new Date()
        if (isNil(token) || !personalAccessTokenUtils.matches({ value, tokenHash: token.tokenHash }) || personalAccessTokenUtils.isExpired({ expiresAt: token.expiresAt, now })) {
            throw invalidToken()
        }
        const user = await userRepo().findOneBy({ id: token.userId, tenantId: token.tenantId })
        if (isNil(user) || user.status !== UserStatus.ACTIVE) {
            throw invalidToken()
        }
        const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
        if (!identity.verified) {
            throw invalidToken()
        }
        if (personalAccessTokenUtils.shouldTouchLastUsed({ lastUsedAt: token.lastUsedAt, now })) {
            await personalAccessTokenRepo().update({ id: token.id }, { lastUsedAt: dayjs(now).toISOString() })
        }
        return {
            id: user.id,
            type: PrincipalType.USER,
            tenant: { id: token.tenantId },
            ...(isNil(identity.tokenVersion) ? {} : { tokenVersion: identity.tokenVersion }),
        }
    },
})

function toModel(row: PersonalAccessTokenSchema): PersonalAccessToken {
    return {
        id: row.id,
        created: dayjs(row.created).toISOString(),
        updated: dayjs(row.updated).toISOString(),
        name: row.name,
        tokenHint: row.tokenHint,
        expiresAt: isNil(row.expiresAt) ? null : dayjs(row.expiresAt).toISOString(),
        lastUsedAt: isNil(row.lastUsedAt) ? null : dayjs(row.lastUsedAt).toISOString(),
    }
}

function validation(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

function invalidToken(): ApplicationError {
    return new ApplicationError({ code: ErrorCode.INVALID_BEARER_TOKEN, params: { message: 'invalid or expired personal access token' } })
}

type UserRef = {
    userId: string
    tenantId: string
}
