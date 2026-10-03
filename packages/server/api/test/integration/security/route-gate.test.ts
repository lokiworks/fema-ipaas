import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, PrincipalType, rolePermissions } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { generateMockToken } from '../../helpers/auth'
import { CapturedRoute, routeRegistry } from '../../helpers/route-capture'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { routeReview } from './support/route-review'
import { securityWorld, World } from './support/world'

vi.mock('fastify', async (importOriginal) => {
    const helper = await import('../../helpers/route-capture')
    return helper.routeCapture.wrapFastify(await importOriginal(), { neutralize: true })
})

const SKIPPED_URLS: readonly string[] = ['*', '/*', '/ingest', '/ingest/*']
const SKIPPED_METHODS: readonly string[] = ['OPTIONS', 'HEAD']
const GATE_MESSAGES: readonly string[] = ['principal is not allowed', 'not an admin', 'not allowed to access this project', 'is missing permission', 'invalid bearer', 'invalid access token']
const VIEWER_PERMISSIONS: readonly string[] = rolePermissions[DefaultProjectRole.VIEWER]

type GateActor = 'tenantAdmin' | 'viewer' | 'service' | 'engine' | 'worker' | 'onboarding' | 'anonymous'

type GateContext = {
    world: World
    tokens: Record<GateActor, string | null>
}

let context: GateContext | null = null
let routes: CapturedRoute[] = []

function allowedByPrincipal({ route, actor }: { route: CapturedRoute, actor: GateActor }): boolean {
    if (route.category === 'PUBLIC' || route.category === 'NONE') {
        return true
    }
    const principalType: Record<GateActor, string> = {
        tenantAdmin: 'USER',
        viewer: 'USER',
        service: 'SERVICE',
        engine: 'ENGINE',
        worker: 'WORKER',
        onboarding: 'ONBOARDING',
        anonymous: 'UNKNOWN',
    }
    return route.principals.includes(principalType[actor])
}

function expectedToReach({ route, actor }: { route: CapturedRoute, actor: GateActor }): boolean | null {
    if (!allowedByPrincipal({ route, actor })) {
        return false
    }
    switch (route.category) {
        case 'PUBLIC':
        case 'NONE':
        case 'UNSCOPED':
        case 'ENGINE':
        case 'WORKER':
            return true
        case 'TENANT_ANY_MEMBER':
            return true
        case 'TENANT_ADMIN':
        case 'TENANT_NON_EMBED':
            return actor === 'viewer' ? false : true
        case 'PROJECT': {
            if (route.resource?.type === 'TABLE') {
                return null
            }
            if (actor === 'viewer') {
                return route.permission === null || VIEWER_PERMISSIONS.includes(route.permission)
            }
            return true
        }
        default:
            return null
    }
}

function buildUrl({ route, world }: { route: CapturedRoute, world: World }): string {
    const projectId = world.scopes.A.project.id
    const withParams = route.url.replace(/:([A-Za-z0-9_]+)\??/g, (_match, name: string) => {
        if (route.resource?.type === 'PARAM' && route.resource.key === name) {
            return projectId
        }
        return name === 'projectId' ? projectId : 'x'
    })
    const needsQuery = route.resource?.type === 'QUERY'
    if (!needsQuery) {
        return withParams
    }
    return `${withParams}?${route.resource?.key ?? 'projectId'}=${projectId}`
}

function buildBody({ route, world }: { route: CapturedRoute, world: World }): Record<string, unknown> | undefined {
    if (route.method === 'GET' || route.method === 'TRACE') {
        return undefined
    }
    if (route.resource?.type === 'BODY') {
        return { [route.resource.key]: world.scopes.A.project.id }
    }
    return route.method === 'DELETE' ? undefined : {}
}

function isGateDenial({ response }: { response: { status: number, text: string } }): boolean {
    return (response.status === 401 || response.status === 403) && GATE_MESSAGES.some((message) => response.text.includes(message))
}

function needsReachCheck({ route }: { route: CapturedRoute }): boolean {
    return !SKIPPED_URLS.includes(route.url) && !SKIPPED_METHODS.includes(route.method)
}

async function send({ route, actor }: { route: CapturedRoute, actor: GateActor }): Promise<{ status: number, text: string }> {
    const gate = context as GateContext
    const token = gate.tokens[actor]
    const body = buildBody({ route, world: gate.world })
    const response = await gate.world.app.inject({
        method: route.method as 'GET',
        url: buildUrl({ route, world: gate.world }),
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { payload: body }),
    })
    return { status: response.statusCode, text: response.body }
}

beforeAll(async () => {
    routeRegistry.reset()
    const app: FastifyInstance = await setupTestEnvironment({ fresh: true })
    const world = await securityWorld.build({ app })
    const tenantId = world.scopes.A.tenant.id
    const ownerIdentityId = (await world.app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode === 200 ? world.actors.tenantAdmin.userId : null
    const onboardingIdentity = await import('../../helpers/db').then(async ({ db }) => db.findOneBy<{ identityId: string }>('user', { id: ownerIdentityId as string }))
    context = {
        world,
        tokens: {
            tenantAdmin: world.actors.tenantAdmin.token,
            viewer: world.actors.viewer.token,
            anonymous: null,
            service: await generateMockToken({ id: generateId(), type: PrincipalType.SERVICE, tenant: { id: tenantId } }),
            engine: await generateMockToken({ id: generateId(), type: PrincipalType.ENGINE, projectId: world.scopes.A.project.id, tenant: { id: tenantId } }),
            worker: await generateMockToken({ id: generateId(), type: PrincipalType.WORKER }),
            onboarding: await generateMockToken({ id: onboardingIdentity?.identityId as string, type: PrincipalType.ONBOARDING }),
        },
    }
    const seen = new Map<string, CapturedRoute>()
    routeRegistry.read().forEach((route) => seen.set(routeReview.routeId({ route }), route))
    routes = [...seen.values()].filter((route) => needsReachCheck({ route }))
})

const ACTORS: readonly GateActor[] = ['tenantAdmin', 'viewer', 'service', 'engine', 'worker', 'onboarding', 'anonymous']

describe('route gate: every route lets in exactly the principals it declares', () => {
    it.each(ACTORS.map((actor) => [actor]))('as %s', async (actor) => {
        const failures: string[] = []
        for (const route of routes) {
            const response = await send({ route, actor })
            const reached = response.status === 200 && response.text.includes('"reached":true')
            const expected = expectedToReach({ route, actor })
            if (expected === false && reached) {
                failures.push(`${routeReview.routeId({ route })} [${route.category}] let ${actor} through (status ${response.status})`)
            }
            if (expected === false && response.status >= 200 && response.status < 300 && !reached) {
                failures.push(`${routeReview.routeId({ route })} [${route.category}] answered ${response.status} to ${actor} without reaching the neutral handler`)
            }
            if (expected === true && !reached && isGateDenial({ response })) {
                failures.push(`${routeReview.routeId({ route })} [${route.category}] should let ${actor} through but answered ${response.status}: ${response.text.slice(0, 120)}`)
            }
        }
        expect(failures).toEqual([])
    })
})
