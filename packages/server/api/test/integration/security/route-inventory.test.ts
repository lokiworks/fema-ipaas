import fs from 'fs'
import path from 'path'
import { DefaultProjectRole, rolePermissions } from '@fema-ipaas/shared'
import { CapturedRoute, routeRegistry } from '../../helpers/route-capture'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { securityDomains } from './cases'
import { Review, routeReview } from './support/route-review'

vi.mock('fastify', async (importOriginal) => {
    const helper = await import('../../helpers/route-capture')
    return helper.routeCapture.wrapFastify(await importOriginal(), { neutralize: false })
})

const SNAPSHOT_PATH = path.resolve(__dirname, 'route-security.snapshot.txt')
const VIEWER_PERMISSIONS: readonly string[] = rolePermissions[DefaultProjectRole.VIEWER]
const MATRIX_CATEGORIES: readonly string[] = ['PROJECT', 'TENANT_ADMIN', 'TENANT_ANY_MEMBER', 'TENANT_NON_EMBED']

const UNPROTECTED_ALLOWLIST: Record<string, string> = {
    'OPTIONS *': 'CORS preflight, answered by @fastify/cors',
    'GET /redirect': 'OAuth2 popup landing page, renders the escaped code into a static page',
    'GET /*': 'static frontend assets served by @fastify/static',
}
const UNPROTECTED_ALLOWLIST_PREFIXES: Record<string, string> = {
    '/ingest': 'PostHog ingestion proxy with a fixed upstream host',
}

let routes: CapturedRoute[] = []

function isAllowlistedUnprotected({ id, route }: { id: string, route: CapturedRoute }): boolean {
    return id in UNPROTECTED_ALLOWLIST || Object.keys(UNPROTECTED_ALLOWLIST_PREFIXES).some((prefix) => route.url === prefix || route.url.startsWith(`${prefix}/`))
}

function dedupe({ captured }: { captured: CapturedRoute[] }): CapturedRoute[] {
    const byId = new Map<string, CapturedRoute>()
    captured.forEach((route) => byId.set(routeReview.routeId({ route }), route))
    return [...byId.values()].sort((a, b) => routeReview.routeId({ route: a }).localeCompare(routeReview.routeId({ route: b })))
}

function allReviews(): Record<string, Review> {
    return Object.assign({}, ...Object.values(securityDomains).map((domain) => domain.reviews))
}

function allExemptions(): Record<string, string> {
    return Object.assign({}, ...Object.values(securityDomains).map((domain) => domain.exemptions))
}

function allCaseIds(): Set<string> {
    return new Set(Object.values(securityDomains).flatMap((domain) => domain.cases.map((matrixCase) => matrixCase.id)))
}

beforeAll(async () => {
    routeRegistry.reset()
    await setupTestEnvironment({ fresh: true })
    routes = dedupe({ captured: routeRegistry.read() })
})

describe('route security inventory', () => {
    it('matches the checked-in snapshot, so a new or changed route has to be reviewed on purpose', () => {
        const current = routes.map((route) => routeReview.format({ route })).join('\n') + '\n'
        if (process.env.UPDATE_ROUTE_SECURITY_SNAPSHOT === '1') {
            fs.writeFileSync(SNAPSHOT_PATH, current)
        }
        const expected = fs.existsSync(SNAPSHOT_PATH) ? fs.readFileSync(SNAPSHOT_PATH, 'utf8') : ''
        const currentLines = new Set(current.split('\n'))
        const expectedLines = new Set(expected.split('\n'))
        const added = [...currentLines].filter((line) => !expectedLines.has(line))
        const removed = [...expectedLines].filter((line) => !currentLines.has(line))
        expect({ added, removed }).toEqual({ added: [], removed: [] })
    })

    it('has no route without a security configuration, except the reviewed allowlist', () => {
        const unprotected = routes
            .filter((route) => !route.hasSecurityConfig)
            .map((route) => ({ route, id: routeReview.routeId({ route }) }))
            .filter(({ id, route }) => !isAllowlistedUnprotected({ id, route }))
            .map(({ id }) => id)
        expect(unprotected).toEqual([])
    })

    it('never lets an authenticated route accept the UNKNOWN or ONBOARDING principal unless it is a reviewed public-by-design route', () => {
        const wide = routes
            .filter((route) => route.category === 'UNSCOPED' && route.principals.includes('UNKNOWN'))
            .map((route) => routeReview.routeId({ route }))
        const reviews = allReviews()
        expect(wide.filter((id) => !(id in reviews))).toEqual([])
    })

    it('requires a recorded review for every route that is public, unscoped, tenant-wide or without a permission', () => {
        const reviews = allReviews()
        const unreviewed = routes
            .filter((route) => routeReview.needsReview({ route, viewerPermissions: VIEWER_PERMISSIONS }))
            .filter((route) => !isAllowlistedUnprotected({ id: routeReview.routeId({ route }), route }))
            .map((route) => routeReview.routeId({ route }))
            .filter((id) => !(id in reviews))
        expect(unreviewed).toEqual([])
    })

    it('requires a matrix case or an explicit exemption for every user-facing route', () => {
        const caseIds = allCaseIds()
        const exemptions = allExemptions()
        const uncovered = routes
            .filter((route) => MATRIX_CATEGORIES.includes(route.category))
            .map((route) => routeReview.routeId({ route }))
            .filter((id) => !caseIds.has(id) && !(id in exemptions))
        expect(uncovered).toEqual([])
    })

    it('has no matrix case or review for a route that no longer exists', () => {
        const known = new Set(routes.map((route) => routeReview.routeId({ route })))
        const stale = [...allCaseIds(), ...Object.keys(allReviews()), ...Object.keys(allExemptions())].filter((id) => !known.has(id))
        expect(stale).toEqual([])
    })

    it('never grants a mutating project route with a permission the Viewer role already holds, unless it is reviewed', () => {
        const reviews = allReviews()
        const suspicious = routes
            .filter((route) => route.category === 'PROJECT' && routeReview.isMutating({ route }) && (route.permission === null || VIEWER_PERMISSIONS.includes(route.permission)))
            .map((route) => routeReview.routeId({ route }))
            .filter((id) => !(id in reviews))
        expect(suspicious).toEqual([])
    })
})

afterAll(() => {
    const reportPath = process.env.AUTH_AUDIT_ROUTES_REPORT
    if (reportPath === undefined || reportPath.length === 0) {
        return
    }
    fs.writeFileSync(reportPath, routeReview.renderReport({ routes, reviews: allReviews(), exemptions: allExemptions(), caseIds: allCaseIds(), viewerPermissions: VIEWER_PERMISSIONS }))
})
