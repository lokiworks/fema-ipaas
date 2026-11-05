import { isNil } from '@fema-ipaas/core-utils'
import { TenantLimits } from '@fema-ipaas/shared'

function stricter({ first, second }: { first: number | null | undefined, second: number | null | undefined }): number | null {
    if (isNil(first)) {
        return second ?? null
    }
    if (isNil(second)) {
        return first
    }
    return Math.min(first, second)
}

function effective({ row, system }: { row: TenantLimits, system: TenantLimits }): TenantLimits {
    return {
        usersLimit: stricter({ first: row.usersLimit, second: system.usersLimit }),
        projectsLimit: stricter({ first: row.projectsLimit, second: system.projectsLimit }),
        activeWorkflowsLimit: stricter({ first: row.activeWorkflowsLimit, second: system.activeWorkflowsLimit }),
        concurrentExecutionsLimit: stricter({ first: row.concurrentExecutionsLimit, second: system.concurrentExecutionsLimit }),
        workerGroupId: row.workerGroupId ?? system.workerGroupId ?? null,
    }
}

function isReached({ limit, current }: { limit: number | null, current: number }): boolean {
    return !isNil(limit) && current >= limit
}

export const tenantLimitsUtils = {
    stricter,
    effective,
    isReached,
}
