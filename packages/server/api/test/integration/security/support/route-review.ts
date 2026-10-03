import { CapturedRoute } from '../../../helpers/route-capture'
import { MatrixCase } from './matrix'

function routeId({ route }: { route: CapturedRoute }): string {
    const url = route.url.startsWith('/api/') ? route.url.slice('/api'.length) : route.url
    return `${route.method} ${url}`
}

function isMutating({ route }: { route: CapturedRoute }): boolean {
    return route.method !== 'GET' && route.method !== 'HEAD' && route.method !== 'OPTIONS'
}

function permissionHeldByViewer({ permission, viewerPermissions }: { permission: string | null, viewerPermissions: readonly string[] }): boolean {
    return permission === null || viewerPermissions.includes(permission)
}

function needsReview({ route, viewerPermissions }: { route: CapturedRoute, viewerPermissions: readonly string[] }): boolean {
    switch (route.category) {
        case 'PUBLIC':
        case 'NONE':
        case 'NONE_AUTHORIZATION':
        case 'UNSCOPED':
        case 'TENANT_ANY_MEMBER':
        case 'TENANT_NON_EMBED':
            return true
        case 'PROJECT':
            return route.permission === null || (isMutating({ route }) && permissionHeldByViewer({ permission: route.permission, viewerPermissions }))
        default:
            return false
    }
}

function format({ route }: { route: CapturedRoute }): string {
    const resource = route.resource === null
        ? '-'
        : `${route.resource.type}:${route.resource.table === undefined ? '' : `${route.resource.table}.${route.resource.entityField}@${route.resource.source}/`}${route.resource.key}`
    return `${routeId({ route })} | ${route.category} | ${route.principals.join(',') || '-'} | ${route.permission ?? '-'} | ${resource}`
}

function resourceLabel({ route }: { route: CapturedRoute }): string {
    if (route.resource === null) {
        return '-'
    }
    const table = route.resource.table === undefined ? '' : `${route.resource.table}.${route.resource.entityField} (${route.resource.source}) `
    return `${route.resource.type} ${table}${route.resource.key}`
}

function renderTable({ rows, reviews, exemptions, caseIds }: { rows: CapturedRoute[], reviews: Record<string, Review>, exemptions: Record<string, string>, caseIds: Set<string> }): string {
    const header = '| 路由 | 类型 | 允许的主体 | 需要的权限 | 资源定位 | 矩阵覆盖 | 审查结论 |\n|---|---|---|---|---|---|---|'
    const lines = rows.map((route) => {
        const id = routeId({ route })
        const review = reviews[id]
        const coverage = caseIds.has(id) ? '矩阵用例' : id in exemptions ? `豁免：${exemptions[id]}` : '-'
        const verdict = review === undefined ? '-' : `${review.verdict}：${review.note}`
        return `| \`${id}\` | ${route.category} | ${route.principals.join(', ') || '-'} | ${route.permission ?? '-'} | ${resourceLabel({ route })} | ${coverage} | ${verdict} |`
    })
    return [header, ...lines].join('\n')
}

function renderReport({ routes, reviews, exemptions, caseIds, viewerPermissions }: { routes: CapturedRoute[], reviews: Record<string, Review>, exemptions: Record<string, string>, caseIds: Set<string>, viewerPermissions: readonly string[] }): string {
    const counts = routes.reduce<Record<string, number>>((acc, route) => ({ ...acc, [route.category]: (acc[route.category] ?? 0) + 1 }), {})
    const summary = Object.entries(counts).map(([category, count]) => `| ${category} | ${count} |`).join('\n')
    const flagged = routes.filter((route) => needsReview({ route, viewerPermissions }) || !route.hasSecurityConfig)
    return [
        '# 路由鉴权清单（自动生成）',
        '',
        `路由总数（方法 + 路径去重，不含自动生成的 HEAD）：${routes.length}`,
        '',
        '| 安全类型 | 数量 |',
        '|---|---|',
        summary,
        '',
        '## 需要逐条审查的路由（无 security 配置 / public / unscoped / publicTenant / 无权限的项目路由 / 变更类却只要 Viewer 已有权限）',
        '',
        renderTable({ rows: flagged, reviews, exemptions, caseIds }),
        '',
        '## 全部路由',
        '',
        renderTable({ rows: routes, reviews, exemptions, caseIds }),
        '',
    ].join('\n')
}

function sameForMethods({ url, methods, review }: { url: string, methods: readonly string[], review: Review }): Record<string, Review> {
    return Object.fromEntries(methods.map((method) => [`${method} ${url}`, review]))
}

export const routeReview = {
    sameForMethods,
    routeId,
    isMutating,
    needsReview,
    format,
    renderReport,
}

export type Review = {
    verdict: 'ok' | 'fixed' | 'needs-decision'
    note: string
}

export type DomainModule = {
    cases: MatrixCase[]
    reviews: Record<string, Review>
    exemptions: Record<string, string>
}
