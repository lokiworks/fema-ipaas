import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, FEDERATION_LIMITS, FederationEvent, FederationEventType, TenantStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { distributedStore } from '../database/redis-connections'
import { applicationEvents } from '../helper/application-events'
import { encryptUtils } from '../helper/encryption'
import { tenantService } from '../tenant/tenant.service'
import { externalIdentityService } from './external-identity.service'
import { federationSignature } from './federation-signature'

export const federationEventService = (log: FastifyBaseLogger) => ({
    async receive({ rawBody, signature, ip }: ReceiveParams): Promise<ReceiveResult> {
        const candidate = readCandidate({ rawBody })
        const tenant = await tenantService(log).getByExternalRef({ issuer: candidate.issuer, tenantId: candidate.externalTenantId })
        const secret = isNil(tenant) ? null : await loadSigningSecret({ log, tenantId: tenant.id })
        if (isNil(tenant) || isNil(secret) || !federationSignature.verify({ rawBody, header: signature, secret })) {
            throw unauthorized()
        }
        const event = FederationEvent.safeParse(candidate.json)
        if (!event.success) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The federation event is malformed' } })
        }
        const dedupeKey = `federation:event:${tenant.id}:${event.data.id}`
        const claimed = await distributedStore.putIfAbsent(dedupeKey, '1', FEDERATION_LIMITS.eventDedupeTtlSeconds)
        if (!claimed) {
            return { duplicate: true }
        }
        try {
            await apply({ log, tenantId: tenant.id, event: event.data, ip })
        }
        catch (error) {
            await distributedStore.delete(dedupeKey)
            throw error
        }
        return { duplicate: false }
    },
})

async function apply({ log, tenantId, event, ip }: ApplyParams): Promise<void> {
    switch (event.type) {
        case FederationEventType.MEMBER_REMOVED: {
            const subject = requireSubject({ event })
            const result = await externalIdentityService(log).revokeBySubject({ issuer: event.issuer, subject, tenantId })
            audit({ log, tenantId, ip, target: subject, detail: `member removed at the identity provider; ${result.found ? 'access revoked' : 'no matching account'}` })
            return
        }
        case FederationEventType.MEMBER_RESTORED: {
            const subject = requireSubject({ event })
            const result = await externalIdentityService(log).restoreBySubject({ issuer: event.issuer, subject, tenantId })
            audit({ log, tenantId, ip, target: subject, detail: `member restored at the identity provider; ${result.found ? 'access restored' : 'no matching account'}` })
            return
        }
        case FederationEventType.TENANT_SUSPENDED:
            await tenantService(log).setStatus({ tenantId, status: TenantStatus.SUSPENDED })
            audit({ log, tenantId, ip, target: tenantId, detail: 'suspended by a federation event', action: ApplicationEventName.OPERATOR_TENANT_STATUS_CHANGED })
            return
        case FederationEventType.TENANT_RESUMED:
            await tenantService(log).setStatus({ tenantId, status: TenantStatus.ACTIVE })
            audit({ log, tenantId, ip, target: tenantId, detail: 'resumed by a federation event', action: ApplicationEventName.OPERATOR_TENANT_STATUS_CHANGED })
            return
    }
}

async function loadSigningSecret({ log, tenantId }: { log: FastifyBaseLogger, tenantId: string }): Promise<string | null> {
    const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
    const encrypted = tenant.federatedAuthProviders.oidc?.eventSigningSecret
    return isNil(encrypted) ? null : encryptUtils.decryptString(encrypted)
}

function readCandidate({ rawBody }: { rawBody: string }): Candidate {
    let json: unknown
    try {
        json = JSON.parse(rawBody)
    }
    catch {
        throw unauthorized()
    }
    const parsed = CandidateIdentity.safeParse(json)
    if (!parsed.success) {
        throw unauthorized()
    }
    return { json, issuer: parsed.data.issuer, externalTenantId: parsed.data.externalTenantId }
}

function requireSubject({ event }: { event: FederationEvent }): string {
    if (isNil(event.subject) || event.subject.length === 0) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The federation event carries no subject' } })
    }
    return event.subject
}

function audit({ log, tenantId, ip, target, detail, action = ApplicationEventName.TENANT_USER_ACCESS_CHANGED }: AuditParams): void {
    applicationEvents(log).sendUserEvent({ tenantId, ip }, { action, data: { target, detail } })
}

function unauthorized(): ApplicationError {
    return new ApplicationError({ code: ErrorCode.AUTHENTICATION, params: { message: 'The federation event signature is invalid' } })
}

const CandidateIdentity = z.object({
    issuer: z.string().min(1).max(500),
    externalTenantId: z.string().min(1).max(200),
})

export type ReceiveResult = {
    duplicate: boolean
}

type ReceiveParams = {
    rawBody: string
    signature: string | undefined
    ip: string | undefined
}

type Candidate = {
    json: unknown
    issuer: string
    externalTenantId: string
}

type ApplyParams = {
    log: FastifyBaseLogger
    tenantId: string
    event: FederationEvent
    ip: string | undefined
}

type AuditParams = {
    log: FastifyBaseLogger
    tenantId: string
    ip: string | undefined
    target: string
    detail: string
    action?: ApplicationEventName.TENANT_USER_ACCESS_CHANGED | ApplicationEventName.OPERATOR_TENANT_STATUS_CHANGED
}
