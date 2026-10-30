import { GLOBAL_SEARCH_GROUP_LIMIT, GLOBAL_SEARCH_GROUP_ORDER, GlobalSearchGroup, GlobalSearchItem, GlobalSearchResultType, ISSUE_TITLE_CATEGORY_ENGLISH, IssueKind, IssueTitleCategory, TenantModule } from '@fema-ipaas/shared'

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
    return `%${escapeLike(query.trim())}%`
}

function issueTitlePatterns(query: string): string[] {
    const needle = query.trim()
    if (needle.length === 0) {
        return []
    }
    const patterns = Object.values(IssueTitleCategory).flatMap((category) => [ISSUE_TITLE_CATEGORY_CHINESE[category], ...(RETIRED_ISSUE_TITLE_CATEGORY_CHINESE[category] ?? [])]
        .flatMap((localized) => localizedTitlePatterns({ needle, english: ISSUE_TITLE_CATEGORY_ENGLISH[category], localized })))
    return [...new Set(patterns)]
}

function localizedTitlePatterns({ needle, english, localized }: { needle: string, english: string, localized: string }): string[] {
    if (localized.includes(needle)) {
        return [`${escapeLike(english)}%`]
    }
    if (!needle.startsWith(localized)) {
        return []
    }
    const object = needle.slice(localized.length).replace(TITLE_SEPARATOR, '').trim()
    return object.length === 0 ? [`${escapeLike(english)}%`] : [`${escapeLike(english)}: %${escapeLike(object)}%`]
}

function issueKindsMatching(query: string): IssueKind[] {
    const needle = query.trim()
    if (needle.length < MIN_KIND_NEEDLE_LENGTH) {
        return []
    }
    return ISSUE_KIND_CHINESE.filter(({ label }) => label.includes(needle) || needle.includes(label)).map(({ kind }) => kind)
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`)
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
    issueTitlePatterns,
    issueKindsMatching,
    matches,
    fetchSize: GLOBAL_SEARCH_GROUP_LIMIT + 1,
}

const MIN_KIND_NEEDLE_LENGTH = 2
const ISSUE_KIND_CHINESE: { kind: IssueKind, label: string }[] = [
    { kind: IssueKind.CONNECTION, label: '认证失败' },
    { kind: IssueKind.DRIFT, label: '结果对不上' },
]
const TITLE_SEPARATOR = /^\s*[:：]?\s*/

export const ISSUE_TITLE_CATEGORY_CHINESE: Record<IssueTitleCategory, string> = {
    [IssueTitleCategory.RATE_LIMITED]: '对方系统限流',
    [IssueTitleCategory.ACCESS_DENIED]: '访问被拒绝',
    [IssueTitleCategory.NOT_FOUND]: '找不到对象',
    [IssueTitleCategory.SERVER_ERROR]: '对方服务出错',
    [IssueTitleCategory.TIMED_OUT]: '超时',
    [IssueTitleCategory.REQUEST_REJECTED]: '对方系统拒绝了请求',
    [IssueTitleCategory.MAPPING_MISSING]: '映射表缺少对应值',
    [IssueTitleCategory.TRIGGER_FAILED]: '触发器检查失败',
    [IssueTitleCategory.STEP_FAILED]: '节点失败',
}

const RETIRED_ISSUE_TITLE_CATEGORY_CHINESE: Partial<Record<IssueTitleCategory, string[]>> = {
    [IssueTitleCategory.STEP_FAILED]: ['步骤失败'],
}
