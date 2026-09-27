import { blueprintAvailability, blueprintRules, BlueprintVersionRule, isNil } from '@fema-ipaas/shared'
import { blueprintVersionRepo } from './connector-blueprint-common'

export const connectorVersionAvailability = {
    async rulesFor({ tenantId, connectorName }: RulesForParams): Promise<BlueprintVersionRule[]> {
        if (isNil(tenantId) || !blueprintRules.isBlueprintConnectorName(connectorName)) {
            return []
        }
        const versions = await blueprintVersionRepo().find({ where: { tenantId, connectorName }, select: { version: true, status: true, canaryProjectIds: true } })
        return versions.map((version) => ({ version: version.version, status: version.status, canaryProjectIds: version.canaryProjectIds }))
    },
    async rulesForTenant(tenantId: string | undefined): Promise<Map<string, BlueprintVersionRule[]>> {
        if (isNil(tenantId)) {
            return new Map()
        }
        const versions = await blueprintVersionRepo().find({ where: { tenantId }, select: { connectorName: true, version: true, status: true, canaryProjectIds: true } })
        return versions.reduce((byName, version) => new Map(byName).set(version.connectorName, [
            ...(byName.get(version.connectorName) ?? []),
            { version: version.version, status: version.status, canaryProjectIds: version.canaryProjectIds },
        ]), new Map<string, BlueprintVersionRule[]>())
    },
    pick({ rules, candidates, exact, projectId }: PickParams): string | null {
        if (rules.length === 0) {
            return null
        }
        if (exact) {
            return candidates.find((candidate) => blueprintAvailability.isRunnable({ rules, packageVersion: candidate, projectId })) ?? null
        }
        const selectable = blueprintAvailability.pickSelectable({ rules, packageVersions: candidates, projectId })
        if (!isNil(selectable)) {
            return selectable
        }
        const runnable = candidates.filter((candidate) => blueprintAvailability.isRunnable({ rules, packageVersion: candidate, projectId }))
        return runnable[0] ?? null
    },
}

type RulesForParams = {
    tenantId: string | undefined
    connectorName: string
}

type PickParams = {
    rules: BlueprintVersionRule[]
    candidates: string[]
    exact: boolean
    projectId: string | undefined
}
