import { resolveTxt } from 'node:dns/promises'
import { ApplicationError, ErrorCode, generateId, isNil, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import { TenantDomain, TenantDomainPurpose } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { TenantDomainEntity } from './tenant-domain.entity'
import { tenantDomainUtils } from './tenant-domain.utils'

export const tenantDomainRepo = repoFactory<TenantDomain>(TenantDomainEntity)

export const tenantDomainService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: TenantParams): Promise<TenantDomain[]> {
        return tenantDomainRepo().find({ where: { tenantId }, order: { created: 'ASC' } })
    },

    async add({ tenantId, domain, purpose }: AddParams): Promise<TenantDomain> {
        const existing = await tenantDomainRepo().findOneBy({ domain, purpose })
        if (!isNil(existing)) {
            await assertClaimable({ existing, tenantId })
            await tenantDomainRepo().delete({ id: existing.id })
        }
        const now = dayjs().toISOString()
        const created = await tenantDomainRepo().save({
            id: generateId(),
            created: now,
            updated: now,
            tenantId,
            domain,
            purpose,
            verificationRecord: tenantDomainUtils.buildVerificationRecord({ domain }),
            verifiedAt: null,
        })
        log.info({ tenant: { id: tenantId }, domain, purpose }, '[tenantDomain] domain added')
        return created
    },

    async verify({ tenantId, id }: IdParams): Promise<TenantDomain> {
        const entry = await this.getOneOrThrow({ tenantId, id })
        if (!isNil(entry.verifiedAt)) {
            return entry
        }
        const { data: answers, error } = await tryCatch(() => resolveTxt(entry.verificationRecord.name))
        if (!isNil(error)) {
            log.info({ tenant: { id: tenantId }, domain: entry.domain, error: String(error) }, '[tenantDomain] TXT lookup returned nothing')
        }
        if (isNil(answers) || !tenantDomainUtils.txtMatches({ answers, expected: entry.verificationRecord })) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'domainVerificationFailed' },
            })
        }
        const takenByOther = await tenantDomainRepo().findOneBy({ domain: entry.domain, purpose: entry.purpose })
        if (!isNil(takenByOther) && takenByOther.id !== entry.id && !isNil(takenByOther.verifiedAt)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'domainAlreadyClaimed' },
            })
        }
        const verifiedAt = dayjs().toISOString()
        await tenantDomainRepo().update({ id: entry.id, tenantId }, { verifiedAt, updated: verifiedAt })
        log.info({ tenant: { id: tenantId }, domain: entry.domain, purpose: entry.purpose }, '[tenantDomain] domain verified')
        return this.getOneOrThrow({ tenantId, id })
    },

    async remove({ tenantId, id }: IdParams): Promise<TenantDomain> {
        const entry = await this.getOneOrThrow({ tenantId, id })
        await tenantDomainRepo().delete({ id: entry.id, tenantId })
        log.info({ tenant: { id: tenantId }, domain: entry.domain, purpose: entry.purpose }, '[tenantDomain] domain removed')
        return entry
    },

    async getOneOrThrow({ tenantId, id }: IdParams): Promise<TenantDomain> {
        const entry = await tenantDomainRepo().findOneBy({ id, tenantId })
        if (isNil(entry)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'tenant_domain', entityId: id },
            })
        }
        return entry
    },

    async findTenantIdsForEmailDomain({ domain }: { domain: string }): Promise<TenantId[]> {
        const rows = await tenantDomainRepo()
            .createQueryBuilder('tenant_domain')
            .select('tenant_domain."tenantId"', 'tenantId')
            .where('tenant_domain.domain = :domain', { domain })
            .andWhere('tenant_domain.purpose = :purpose', { purpose: TenantDomainPurpose.LOGIN_DISCOVERY })
            .andWhere('tenant_domain."verifiedAt" IS NOT NULL')
            .orderBy('tenant_domain.created', 'ASC')
            .getRawMany<{ tenantId: string }>()
        return rows.map((row) => row.tenantId)
    },

    async findTenantIdForHost({ host }: { host: string }): Promise<TenantId | null> {
        const row = await tenantDomainRepo().findOne({
            where: { domain: host, purpose: TenantDomainPurpose.HOST },
        })
        return isNil(row) || isNil(row.verifiedAt) ? null : row.tenantId
    },
})

async function assertClaimable({ existing, tenantId }: { existing: TenantDomain, tenantId: TenantId }): Promise<void> {
    if (existing.tenantId === tenantId) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'domainAlreadyAdded' },
        })
    }
    if (!isNil(existing.verifiedAt)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'domainAlreadyClaimed' },
        })
    }
}

type TenantParams = {
    tenantId: TenantId
}

type IdParams = TenantParams & {
    id: string
}

type AddParams = TenantParams & {
    domain: string
    purpose: TenantDomainPurpose
}
