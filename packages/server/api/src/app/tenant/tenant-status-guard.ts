import { ApplicationError, ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import { Tenant, TenantLimits, TenantStatus } from '@fema-ipaas/shared'
import { repoFactory } from '../core/db/repo-factory'
import { TenantEntity } from './tenant.entity'

const tenantRepo = repoFactory<Tenant & TenantLimits>(TenantEntity)
const statusCache = new Map<TenantId, CachedStatus>()

async function statusOf({ tenantId, now }: { tenantId: TenantId, now: number }): Promise<TenantStatus | null> {
    const cached = statusCache.get(tenantId)
    if (!isNil(cached) && cached.expiresAt > now) {
        return cached.status
    }
    const row = await tenantRepo().findOne({ where: { id: tenantId }, select: ['id', 'status'] })
    const status = row?.status ?? null
    statusCache.set(tenantId, { status, expiresAt: now + STATUS_CACHE_TTL_MS })
    return status
}

async function assertActive({ tenantId }: { tenantId: TenantId }): Promise<void> {
    const status = await statusOf({ tenantId, now: Date.now() })
    if (isBlocked({ status })) {
        throw new ApplicationError({
            code: ErrorCode.TENANT_SUSPENDED,
            params: { tenantId },
        })
    }
}

async function isActive({ tenantId }: { tenantId: TenantId }): Promise<boolean> {
    const status = await statusOf({ tenantId, now: Date.now() })
    return !isBlocked({ status })
}

async function standingOf({ tenantId }: { tenantId: TenantId }): Promise<TenantStanding> {
    const status = await statusOf({ tenantId, now: Date.now() })
    if (isNil(status)) {
        return 'GONE'
    }
    return isBlocked({ status }) ? 'BLOCKED' : 'ACTIVE'
}

function isBlocked({ status }: { status: TenantStatus | null }): boolean {
    return !isNil(status) && status !== TenantStatus.ACTIVE
}

function invalidate({ tenantId }: { tenantId: TenantId }): void {
    statusCache.delete(tenantId)
}

function clear(): void {
    statusCache.clear()
}

export const tenantStatusGuard = {
    assertActive,
    isActive,
    standingOf,
    invalidate,
    clear,
}

const STATUS_CACHE_TTL_MS = 5_000

export type TenantStanding = 'ACTIVE' | 'BLOCKED' | 'GONE'

type CachedStatus = {
    status: TenantStatus | null
    expiresAt: number
}
