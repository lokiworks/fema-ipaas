import { EntityId } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    CreatePersonalAccessTokenRequestBody,
    CreatePersonalAccessTokenResponse,
    NotificationPreferences,
    PersonalAccessToken,
    PrincipalType,
    UpdateProfileRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { notificationPreferenceService } from '../notification/notification-preference.service'
import { accountService } from './account.service'
import { personalAccessTokenService } from './personal-access-token.service'

export const accountController: FastifyPluginAsyncZod = async (app) => {
    app.post('/profile', UpdateProfileRequest, async (request, reply) => {
        await accountService(request.log).updateProfile({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            name: request.body.name,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/notification-preferences', UserRequest, async (request): Promise<NotificationPreferences> => {
        return notificationPreferenceService(request.log).get({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/notification-preferences', UpdatePreferencesRequest, async (request): Promise<NotificationPreferences> => {
        return notificationPreferenceService(request.log).update({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            preferences: request.body,
        })
    })

    app.get('/access-tokens', UserRequest, async (request): Promise<PersonalAccessToken[]> => {
        return personalAccessTokenService(request.log).list({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/access-tokens', CreateTokenRequest, async (request, reply) => {
        const created: CreatePersonalAccessTokenResponse = await personalAccessTokenService(request.log).create({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PERSONAL_ACCESS_TOKEN_CREATED,
            data: { token: { id: created.token.id, name: created.token.name, expiresAt: created.token.expiresAt ?? null } },
        })
        await reply.status(StatusCodes.CREATED).send(created)
    })

    app.delete('/access-tokens/:id', RevokeTokenRequest, async (request, reply) => {
        const revoked = await personalAccessTokenService(request.log).revoke({
            id: request.params.id,
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PERSONAL_ACCESS_TOKEN_REVOKED,
            data: { token: { id: revoked.id, name: revoked.name, expiresAt: revoked.expiresAt ?? null } },
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const userOnly = securityAccess.publicTenant([PrincipalType.USER])

const UserRequest = {
    config: { security: userOnly },
    schema: { tags: ['account'] },
}

const UpdateProfileRequest = {
    config: { security: userOnly },
    schema: { tags: ['account'], body: UpdateProfileRequestBody },
}

const UpdatePreferencesRequest = {
    config: { security: userOnly },
    schema: { tags: ['account'], body: NotificationPreferences },
}

const CreateTokenRequest = {
    config: { security: userOnly },
    schema: { tags: ['account'], body: CreatePersonalAccessTokenRequestBody },
}

const RevokeTokenRequest = {
    config: { security: userOnly },
    schema: { tags: ['account'], params: z.object({ id: EntityId }) },
}
