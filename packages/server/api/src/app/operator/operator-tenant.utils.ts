import { isNil } from '@fema-ipaas/core-utils'
import { OperatorTenantSummary, Tenant, TenantExternalRef, TenantLimits, TenantOwnerInput } from '@fema-ipaas/shared'

function externalRefOf({ tenant }: { tenant: Tenant }): TenantExternalRef | null {
    if (isNil(tenant.externalIssuer) || isNil(tenant.externalTenantId)) {
        return null
    }
    return { issuer: tenant.externalIssuer, tenantId: tenant.externalTenantId }
}

function toSummary({ tenant, usersCount, projectsCount, activeWorkflowsCount, owner }: ToSummaryParams): OperatorTenantSummary {
    return {
        id: tenant.id,
        created: tenant.created,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        externalRef: externalRefOf({ tenant }),
        ownerName: owner?.name ?? '',
        ownerContact: owner?.contact ?? null,
        usersCount,
        projectsCount,
        activeWorkflowsCount,
        usersLimit: tenant.usersLimit,
        projectsLimit: tenant.projectsLimit,
        activeWorkflowsLimit: tenant.activeWorkflowsLimit,
        concurrentExecutionsLimit: tenant.concurrentExecutionsLimit,
        workerGroupId: tenant.workerGroupId,
    }
}

function invitationUrl({ loginUrl, owner }: { loginUrl: string, owner: TenantOwnerInput }): string | null {
    if (!isNil(owner.email)) {
        return `${loginUrl}?email=${encodeURIComponent(owner.email)}`
    }
    if (!isNil(owner.phone)) {
        return `${loginUrl}?phone=${encodeURIComponent(owner.phone)}`
    }
    return null
}

export const operatorTenantUtils = {
    externalRefOf,
    toSummary,
    invitationUrl,
}

type ToSummaryParams = {
    tenant: Tenant & TenantLimits
    usersCount: number
    projectsCount: number
    activeWorkflowsCount: number
    owner: { name: string, contact: string | null } | null
}
