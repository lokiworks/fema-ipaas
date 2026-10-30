import { SolutionInstallResourceStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { solutionInstallUtils } from '../../../../src/app/solution/solution-install-utils'

const row = { workflowIds: ['w1', 'w2'], mappingTableIds: ['t1'] }

describe('solutionInstallUtils.resourceStatus', () => {
    it('treats an install as intact while every resource it created still exists', () => {
        expect(solutionInstallUtils.resourceStatus({ row, liveness: { workflowIds: new Set(['w1', 'w2']), tableNames: new Map([['t1', 'Departments']]) } })).toBe(SolutionInstallResourceStatus.INTACT)
    })

    it('reports a partly deleted install when only some resources are gone', () => {
        expect(solutionInstallUtils.resourceStatus({ row, liveness: { workflowIds: new Set(['w1']), tableNames: new Map([['t1', 'Departments']]) } })).toBe(SolutionInstallResourceStatus.PARTIALLY_DELETED)
        expect(solutionInstallUtils.resourceStatus({ row, liveness: { workflowIds: new Set(), tableNames: new Map([['t1', 'Departments']]) } })).toBe(SolutionInstallResourceStatus.PARTIALLY_DELETED)
    })

    it('reports an install whose resources were all deleted, so it stops counting as installed', () => {
        expect(solutionInstallUtils.resourceStatus({ row, liveness: { workflowIds: new Set(), tableNames: new Map() } })).toBe(SolutionInstallResourceStatus.ALL_DELETED)
    })

    it('does not call an install without resources deleted', () => {
        expect(solutionInstallUtils.resourceStatus({ row: { workflowIds: [], mappingTableIds: [] }, liveness: { workflowIds: new Set(), tableNames: new Map() } })).toBe(SolutionInstallResourceStatus.INTACT)
    })
})
