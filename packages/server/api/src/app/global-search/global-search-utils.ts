import { GLOBAL_SEARCH_GROUP_LIMIT, GLOBAL_SEARCH_GROUP_ORDER, GlobalSearchGroup, GlobalSearchItem, GlobalSearchResultType, TenantModule } from '@fema-ipaas/shared'

function toGroup({ type, items }: { type: GlobalSearchResultType, items: GlobalSearchItem[] }): GlobalSearchGroup {
    return {
        type,
        items: items.slice(0, GLOBAL_SEARCH_GROUP_LIMIT),
        hasMore: items.length > GLOBAL_SEARCH_GROUP_LIMIT,
    }
}

function arrange(groups: GlobalSearchGroup[]): GlobalSearchGroup[] {
    return GLOBAL_SEARCH_GROUP_ORDER
        .map((type) => groups.find((group) => group.type === type))
        .filter((group): group is GlobalSearchGroup => group !== undefined && group.items.length > 0)
}

function likePattern(query: string): string {
    return `%${query.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function matches({ query, values }: { query: string, values: (string | null | undefined)[] }): boolean {
    const needle = query.trim().toLowerCase()
    return values.some((value) => typeof value === 'string' && value.toLowerCase().includes(needle))
}

function hiddenTypes({ modules }: { modules: TenantModule[] }): GlobalSearchResultType[] {
    if (modules.includes(TenantModule.PLATFORM_ADMIN)) {
        return []
    }
    const adminOnly = [GlobalSearchResultType.CONNECTOR, GlobalSearchResultType.MCP_SERVER]
    return modules.includes(TenantModule.MCP_SERVICES) ? adminOnly : [...adminOnly, GlobalSearchResultType.MCP_SERVICE]
}

export const globalSearchUtils = {
    hiddenTypes,
    toGroup,
    arrange,
    likePattern,
    matches,
    fetchSize: GLOBAL_SEARCH_GROUP_LIMIT + 1,
}
