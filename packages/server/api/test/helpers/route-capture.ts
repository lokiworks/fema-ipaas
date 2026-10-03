import { RouteOptions } from 'fastify'

const REGISTRY_KEY = '__CAPTURED_ROUTES__'

function describeResource(resource: unknown): RouteResourceDescription | null {
    if (typeof resource !== 'object' || resource === null || !('type' in resource)) {
        return null
    }
    const type = String(resource.type)
    if (type === 'TABLE') {
        const tableResource = resource as {
            tableName?: { options?: { name?: string } }
            entitySourceType?: string
            lookup?: { paramKey: string, entityField: string }
        }
        return {
            type,
            key: tableResource.lookup?.paramKey ?? 'id',
            table: tableResource.tableName?.options?.name ?? 'unknown',
            source: tableResource.entitySourceType ?? 'PARAM',
            entityField: tableResource.lookup?.entityField ?? 'id',
        }
    }
    const keyedResource = resource as { queryKey?: string, bodyKey?: string, paramKey?: string }
    return {
        type,
        key: keyedResource.queryKey ?? keyedResource.bodyKey ?? keyedResource.paramKey ?? 'projectId',
    }
}

function describeSecurity(security: unknown): RouteSecurityDescription {
    if (typeof security !== 'object' || security === null) {
        return { category: 'NONE', principals: [], permission: null, resource: null }
    }
    const typed = security as {
        kind?: string
        authorization?: {
            type?: string
            adminOnly?: boolean
            nonEmbedUsersOnly?: boolean
            allowedPrincipals?: string[]
            permission?: string
            projectResource?: unknown
            reason?: string
        }
    }
    if (typed.kind === 'PUBLIC') {
        return { category: 'PUBLIC', principals: [], permission: null, resource: null }
    }
    const authorization = typed.authorization
    const principals = [...(authorization?.allowedPrincipals ?? [])]
    if (authorization?.type === 'PROJECT') {
        return { category: 'PROJECT', principals, permission: authorization.permission ?? null, resource: describeResource(authorization.projectResource) }
    }
    if (authorization?.type === 'TENANT') {
        const category = authorization.adminOnly ? 'TENANT_ADMIN' : authorization.nonEmbedUsersOnly ? 'TENANT_NON_EMBED' : 'TENANT_ANY_MEMBER'
        return { category, principals, permission: null, resource: describeResource(authorization.projectResource) }
    }
    if (authorization?.type === 'UNSCOPED') {
        return { category: principals.length === 1 && principals[0] === 'ENGINE' ? 'ENGINE' : principals.length === 1 && principals[0] === 'WORKER' ? 'WORKER' : 'UNSCOPED', principals, permission: null, resource: null }
    }
    return { category: 'NONE_AUTHORIZATION', principals, permission: null, resource: null }
}

function register(route: RouteOptions): void {
    const registry = routeRegistry.read()
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).filter((method) => method !== 'HEAD')
    const configuredSecurity = (route.config as Record<string, unknown> | undefined)?.security
    const description = describeSecurity(configuredSecurity)
    methods.forEach((method) => {
        registry.push({ method, url: route.url, hasSecurityConfig: configuredSecurity !== undefined && configuredSecurity !== null, ...description })
    })
}

function neutralizeHandlerAndValidation(route: RouteOptions): void {
    route.handler = async () => ({ reached: true })
    delete route.schema
}

export const routeRegistry = {
    read(): CapturedRoute[] {
        const holder = globalThis as Record<string, unknown>
        if (!Array.isArray(holder[REGISTRY_KEY])) {
            holder[REGISTRY_KEY] = []
        }
        return holder[REGISTRY_KEY] as CapturedRoute[]
    },
    reset(): void {
        (globalThis as Record<string, unknown>)[REGISTRY_KEY] = []
    },
}

export const routeCapture = {
    wrapFastify<T extends { default: (opts: never) => { addHook: (name: 'onRoute', hook: (route: RouteOptions) => void) => unknown } }>(original: T, params: { neutralize: boolean }): T {
        const wrapped = (opts: never) => {
            const instance = original.default(opts)
            instance.addHook('onRoute', (route: RouteOptions) => {
                register(route)
                if (params.neutralize) {
                    neutralizeHandlerAndValidation(route)
                }
            })
            return instance
        }
        return { ...original, default: Object.assign(wrapped, original.default) }
    },
}

export type RouteResourceDescription = {
    type: string
    key: string
    table?: string
    source?: string
    entityField?: string
}

export type RouteSecurityDescription = {
    category: 'NONE' | 'PUBLIC' | 'PROJECT' | 'TENANT_ADMIN' | 'TENANT_NON_EMBED' | 'TENANT_ANY_MEMBER' | 'ENGINE' | 'WORKER' | 'UNSCOPED' | 'NONE_AUTHORIZATION'
    principals: string[]
    permission: string | null
    resource: RouteResourceDescription | null
}

export type CapturedRoute = RouteSecurityDescription & {
    method: string
    url: string
    hasSecurityConfig: boolean
}
