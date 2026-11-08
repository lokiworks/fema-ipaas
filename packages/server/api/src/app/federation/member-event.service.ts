import { isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, FEDERATION_LIMITS, MemberWebhookEvent, WebhookVerification } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { applicationEvents } from '../helper/application-events'
import { encryptUtils } from '../helper/encryption'
import { tenantService } from '../tenant/tenant.service'
import { externalIdentityService } from './external-identity.service'
import { federationSignature } from './federation-signature'
import { memberDirectory } from './member-directory'
import { memberSubscriptionService } from './member-subscription.service'

export const memberEventService = (log: FastifyBaseLogger) => ({
    async receive({ tenantId, rawBody, signature, ip }: ReceiveParams): Promise<ReceiveResult> {
        const tenant = await tenantService(log).getOne(tenantId)
        const body = parseJson({ rawBody })
        if (isNil(tenant) || isNil(body)) {
            return { outcome: 'ignored', challenge: null }
        }
        const verification = WebhookVerification.safeParse(body)
        if (verification.success) {
            return { outcome: 'verification', challenge: verification.data.challenge }
        }
        const full = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const oidc = full.federatedAuthProviders.oidc
        const subscription = oidc?.memberSubscription
        if (isNil(oidc) || isNil(subscription)) {
            return { outcome: 'ignored', challenge: null }
        }
        const secret = await encryptUtils.decryptString(subscription.plainSecret)
        if (!federationSignature.verify({ rawBody, header: signature, secret })) {
            log.warn({ tenant: { id: tenantId } }, '[memberEvent] a push with a wrong signature was dropped')
            return { outcome: 'ignored', challenge: null }
        }
        const event = MemberWebhookEvent.safeParse(body)
        if (!event.success || isNil(tenant.externalTenantId) || event.data.tenantId !== tenant.externalTenantId) {
            return { outcome: 'ignored', challenge: null }
        }
        const dedupeKey = `federation:member-event:${tenantId}:${event.data.id}`
        const claimed = await distributedStore.putIfAbsent(dedupeKey, '1', FEDERATION_LIMITS.memberEventDedupeTtlSeconds)
        if (!claimed) {
            return { outcome: 'duplicate', challenge: null }
        }
        try {
            const accessToken = await memberSubscriptionService(log).accessTokenFor({ tenantId, subscription })
            const state = await memberDirectory.readState({ apiUrl: subscription.apiUrl, accessToken, memberId: event.data.object.id })
            await applyState({ log, tenantId, issuer: oidc.issuer, memberId: event.data.object.id, state, eventType: event.data.type, ip })
        }
        catch (error) {
            await distributedStore.delete(dedupeKey)
            throw new Error(error instanceof Error ? error.message : 'The member event could not be applied', { cause: error })
        }
        return { outcome: 'applied', challenge: null }
    },
})

async function applyState({ log, tenantId, issuer, memberId, state, eventType, ip }: ApplyStateParams): Promise<void> {
    const identities = externalIdentityService(log)
    if (state === 'ACTIVE') {
        const result = await identities.restoreBySubject({ issuer, subject: memberId, tenantId })
        audit({ log, tenantId, ip, target: memberId, detail: `${eventType}: member is in good standing; ${result.found ? 'access restored' : 'no matching account'}` })
        return
    }
    const result = await identities.revokeBySubject({ issuer, subject: memberId, tenantId })
    audit({ log, tenantId, ip, target: memberId, detail: `${eventType}: member is ${state === 'GONE' ? 'gone' : 'not in good standing'}; ${result.found ? 'access revoked' : 'no matching account'}` })
}

function parseJson({ rawBody }: { rawBody: string }): unknown {
    try {
        return JSON.parse(rawBody)
    }
    catch {
        return null
    }
}

function audit({ log, tenantId, ip, target, detail }: AuditParams): void {
    applicationEvents(log).sendUserEvent({ tenantId, ip }, {
        action: ApplicationEventName.TENANT_USER_ACCESS_CHANGED,
        data: { target, detail },
    })
}

export type ReceiveResult = {
    outcome: 'verification' | 'applied' | 'duplicate' | 'ignored'
    challenge: string | null
}

type ReceiveParams = {
    tenantId: string
    rawBody: string
    signature: string | undefined
    ip: string | undefined
}

type ApplyStateParams = {
    log: FastifyBaseLogger
    tenantId: string
    issuer: string
    memberId: string
    state: 'ACTIVE' | 'INACTIVE' | 'GONE'
    eventType: string
    ip: string | undefined
}

type AuditParams = {
    log: FastifyBaseLogger
    tenantId: string
    ip: string | undefined
    target: string
    detail: string
}
