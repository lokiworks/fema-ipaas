import { GlobalSearchItem, GlobalSearchResultType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { globalSearchUtils } from '../../../../src/app/global-search/global-search-utils'

function items(count: number, type: GlobalSearchResultType): GlobalSearchItem[] {
    return Array.from({ length: count }, (_, index) => ({ id: `${type}-${index}`, type, label: `item ${index}`, subtitle: null, projectId: null, projectName: null }))
}

describe('globalSearchUtils', () => {
    it('caps a group at five items and flags that there are more', () => {
        const group = globalSearchUtils.toGroup({ type: GlobalSearchResultType.WORKFLOW, items: items(globalSearchUtils.fetchSize, GlobalSearchResultType.WORKFLOW) })
        expect(group.items).toHaveLength(5)
        expect(group.hasMore).toBe(true)
        expect(globalSearchUtils.toGroup({ type: GlobalSearchResultType.ISSUE, items: items(5, GlobalSearchResultType.ISSUE) }).hasMore).toBe(false)
    })

    it('drops empty groups and keeps the fixed group order', () => {
        const arranged = globalSearchUtils.arrange([
            globalSearchUtils.toGroup({ type: GlobalSearchResultType.MCP_SERVER, items: items(1, GlobalSearchResultType.MCP_SERVER) }),
            globalSearchUtils.toGroup({ type: GlobalSearchResultType.CONNECTION, items: [] }),
            globalSearchUtils.toGroup({ type: GlobalSearchResultType.WORKFLOW, items: items(2, GlobalSearchResultType.WORKFLOW) }),
        ])
        expect(arranged.map((group) => group.type)).toEqual([GlobalSearchResultType.WORKFLOW, GlobalSearchResultType.MCP_SERVER])
    })

    it('escapes LIKE wildcards in the query', () => {
        expect(globalSearchUtils.likePattern(' 100%_off ')).toBe('%100\\%\\_off%')
    })

    it('matches case-insensitively and ignores empty values', () => {
        expect(globalSearchUtils.matches({ query: 'HR', values: [null, 'Onboarding hr sync'] })).toBe(true)
        expect(globalSearchUtils.matches({ query: 'finance', values: [undefined, 'Onboarding'] })).toBe(false)
    })
})
