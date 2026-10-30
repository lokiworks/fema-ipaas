import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GlobalSearchItem, GlobalSearchResultType, ISSUE_TITLE_CATEGORY_ENGLISH, IssueKind, IssueTitleCategory, TenantModule } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { globalSearchUtils, ISSUE_TITLE_CATEGORY_CHINESE } from '../../../../src/app/global-search/global-search-utils'

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

    it('hides admin-only results from members and MCP services from members without the module', () => {
        expect(globalSearchUtils.hiddenTypes({ modules: [TenantModule.BUSINESS_INTEGRATION, TenantModule.PLATFORM_ADMIN] })).toEqual([])
        expect(globalSearchUtils.hiddenTypes({ modules: [TenantModule.BUSINESS_INTEGRATION, TenantModule.MCP_SERVICES] })).toEqual([GlobalSearchResultType.CONNECTOR, GlobalSearchResultType.MCP_SERVER])
        expect(globalSearchUtils.hiddenTypes({ modules: [TenantModule.BUSINESS_INTEGRATION] })).toEqual([GlobalSearchResultType.CONNECTOR, GlobalSearchResultType.MCP_SERVER, GlobalSearchResultType.MCP_SERVICE])
    })

    it('finds issues by the Chinese title the issue list shows, although the title is stored in English', () => {
        expect(globalSearchUtils.issueTitlePatterns('步骤失败')).toEqual(['Step failed%'])
        expect(globalSearchUtils.issueTitlePatterns('步骤')).toEqual(['Step failed%'])
        expect(globalSearchUtils.issueTitlePatterns('步骤失败：校验订单')).toEqual(['Step failed: %校验订单%'])
        expect(globalSearchUtils.issueTitlePatterns('步骤失败 写入_外部')).toEqual(['Step failed: %写入\\_外部%'])
        expect(globalSearchUtils.issueTitlePatterns('映射表缺少')).toEqual(['Missing mapping value%'])
        expect(globalSearchUtils.issueTitlePatterns('订单')).toEqual([])
        expect(globalSearchUtils.issueTitlePatterns('  ')).toEqual([])
    })

    it('finds connection and mismatch issues by the words their displayed title uses', () => {
        expect(globalSearchUtils.issueKindsMatching('认证失败')).toEqual([IssueKind.CONNECTION])
        expect(globalSearchUtils.issueKindsMatching('结果对不上')).toEqual([IssueKind.DRIFT])
        expect(globalSearchUtils.issueKindsMatching('失')).toEqual([])
    })

    it('keeps the Chinese issue titles in step with the web translation', () => {
        const zh: Record<string, string> = JSON.parse(readFileSync(resolve(__dirname, '../../../../../../web/public/locales/zh/translation.json'), 'utf8'))
        for (const category of Object.values(IssueTitleCategory)) {
            expect(zh[ISSUE_TITLE_CATEGORY_ENGLISH[category]]).toBe(ISSUE_TITLE_CATEGORY_CHINESE[category])
        }
    })
})
