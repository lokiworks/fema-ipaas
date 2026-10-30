import { SolutionInstallResourceStatus } from '@fema-ipaas/shared'

export const solutionInstallUtils = {
    resourceStatus,
}

function resourceStatus({ row, liveness }: { row: InstallResourceIds, liveness: InstallLiveness }): SolutionInstallResourceStatus {
    const total = row.workflowIds.length + row.mappingTableIds.length
    const existing = row.workflowIds.filter((id) => liveness.workflowIds.has(id)).length + row.mappingTableIds.filter((id) => liveness.tableNames.has(id)).length
    if (total === 0 || existing === total) {
        return SolutionInstallResourceStatus.INTACT
    }
    return existing === 0 ? SolutionInstallResourceStatus.ALL_DELETED : SolutionInstallResourceStatus.PARTIALLY_DELETED
}

type InstallResourceIds = {
    workflowIds: string[]
    mappingTableIds: string[]
}

export type InstallLiveness = {
    workflowIds: Set<string>
    tableNames: Map<string, string>
}
