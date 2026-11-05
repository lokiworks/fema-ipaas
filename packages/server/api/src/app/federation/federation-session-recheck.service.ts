import { isNil } from '@fema-ipaas/core-utils'
import { ExternalIdentityStatus, FEDERATION_LIMITS } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { encryptUtils } from '../helper/encryption'
import { oidcClient } from '../sso/oidc-client'
import { tenantService } from '../tenant/tenant.service'
import { ExternalIdentitySchema } from './external-identity.entity'
import { externalIdentityRepo, externalIdentityService } from './external-identity.service'

export const federationSessionRecheck = (log: FastifyBaseLogger) => ({
    async runDue(): Promise<RecheckReport> {
        const report: RecheckReport = { checked: 0, revoked: 0, unavailable: 0, skipped: 0 }
        let cursor = ''
        for (;;) {
            const batch = await loadBatch({ cursor })
            if (batch.length === 0) {
                return report
            }
            for (const row of batch) {
                const outcome = await recheckOne({ log, row })
                report[outcome] += 1
            }
            cursor = batch[batch.length - 1].id
        }
    },
})

async function loadBatch({ cursor }: { cursor: string }): Promise<ExternalIdentitySchema[]> {
    return externalIdentityRepo().createQueryBuilder('identity')
        .addSelect('identity.refreshToken')
        .where('identity.status = :status', { status: ExternalIdentityStatus.ACTIVE })
        .andWhere('identity."refreshToken" IS NOT NULL')
        .andWhere('identity."userId" IS NOT NULL')
        .andWhere('identity.id > :cursor', { cursor })
        .orderBy('identity.id', 'ASC')
        .take(BATCH_SIZE)
        .getMany()
}

async function recheckOne({ log, row }: { log: FastifyBaseLogger, row: ExternalIdentitySchema }): Promise<keyof RecheckReport> {
    const encryptedToken = row.refreshToken
    if (isNil(encryptedToken)) {
        return 'skipped'
    }
    try {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(row.tenantId)
        const oidc = tenant.federatedAuthProviders.oidc
        if (isNil(oidc) || oidc.issuer !== row.issuer) {
            return 'skipped'
        }
        const minutes = oidc.sessionRecheckMinutes ?? FEDERATION_LIMITS.defaultSessionRecheckMinutes
        if (!isDue({ lastVerifiedAt: row.lastVerifiedAt, minutes, now: dayjs() })) {
            return 'skipped'
        }
        const discovery = await oidcClient.discover({ issuer: oidc.issuer })
        const outcome = await oidcClient.refresh({
            discovery,
            clientId: oidc.clientId,
            clientSecret: await encryptUtils.decryptString(oidc.clientSecret),
            refreshToken: await encryptUtils.decryptString(encryptedToken),
        })
        if (outcome.outcome === 'rejected') {
            await externalIdentityService(log).revokeBySubject({ issuer: row.issuer, subject: row.subject, tenantId: row.tenantId })
            return 'revoked'
        }
        if (outcome.outcome === 'unavailable') {
            log.warn({ tenant: { id: row.tenantId }, detail: outcome.detail }, '[federation] session recheck could not reach the identity provider')
            return 'unavailable'
        }
        if (!isNil(outcome.refreshToken)) {
            await externalIdentityService(log).saveRefreshToken({ id: row.id, tenantId: row.tenantId, refreshToken: outcome.refreshToken })
        }
        await externalIdentityService(log).markVerified({ id: row.id, tenantId: row.tenantId })
        return 'checked'
    }
    catch (error) {
        log.warn({ error, tenant: { id: row.tenantId } }, '[federation] session recheck failed and was skipped')
        return 'unavailable'
    }
}

function isDue({ lastVerifiedAt, minutes, now }: IsDueParams): boolean {
    if (isNil(lastVerifiedAt)) {
        return true
    }
    return now.diff(dayjs(lastVerifiedAt), 'minute', true) >= minutes
}

const BATCH_SIZE = 200

export const federationRecheckUtils = {
    isDue,
}

export type RecheckReport = {
    checked: number
    revoked: number
    unavailable: number
    skipped: number
}

type IsDueParams = {
    lastVerifiedAt: string | Date | null | undefined
    minutes: number
    now: dayjs.Dayjs
}
