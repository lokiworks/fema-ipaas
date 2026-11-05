import { ApplicationError, ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import { Tenant } from '@fema-ipaas/shared'
import { repoFactory } from '../core/db/repo-factory'
import { TenantEntity } from '../tenant/tenant.entity'

const tenantRepo = repoFactory<Tenant>(TenantEntity)

async function anchorTenant(): Promise<Pick<Tenant, 'id' | 'name' | 'created'> | null> {
    const oldest = await tenantRepo().findOne({
        where: {},
        select: ['id', 'name', 'created'],
        order: { created: 'ASC', id: 'ASC' },
    })
    return oldest ?? null
}

async function tenantId(): Promise<TenantId | null> {
    const anchor = await anchorTenant()
    return anchor?.id ?? null
}

async function requireTenantId(): Promise<TenantId> {
    const id = await tenantId()
    if (isNil(id)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'tenant', entityId: 'instance' },
        })
    }
    return id
}

export const instanceScope = {
    anchorTenant,
    tenantId,
    requireTenantId,
}
