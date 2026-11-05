import { Tenant } from '@fema-ipaas/shared'
import { repoFactory } from '../../core/db/repo-factory'
import { tenantStatusGuard } from '../../tenant/tenant-status-guard'
import { TenantEntity } from '../../tenant/tenant.entity'

const tenantRepo = repoFactory<Tenant>(TenantEntity)

async function findOrFail({ tenantId }: TenantIdParams): Promise<Tenant> {
    return tenantRepo().findOneByOrFail({ id: tenantId })
}

async function find({ tenantId }: TenantIdParams): Promise<Tenant | null> {
    return tenantRepo().findOneBy({ id: tenantId })
}

async function assertActive({ tenantId }: TenantIdParams): Promise<void> {
    await tenantStatusGuard.assertActive({ tenantId })
}

export const tenantLookup = {
    find,
    findOrFail,
    assertActive,
}

type TenantIdParams = {
    tenantId: string
}
