import { Permission } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, rolePermissions } from '@fema-ipaas/shared'
import { ALL_IDENTITIES, Identity, Scope, World, WorldRequest, WorldResponse } from './world'

const DENIED_STATUSES: readonly number[] = [401, 403, 404]
const ROLE_OF_IDENTITY: Partial<Record<Identity, DefaultProjectRole>> = {
    projectAdmin: DefaultProjectRole.ADMIN,
    developer: DefaultProjectRole.DEVELOPER,
    operator: DefaultProjectRole.OPERATOR,
    viewer: DefaultProjectRole.VIEWER,
}
const SAME_TENANT_MEMBERS: readonly Identity[] = ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin', 'nonMember', 'foreignProjectAdmin']
const PROJECT_MEMBERS: readonly Identity[] = ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin']

function allowedIdentities({ access }: { access: Access }): readonly Identity[] {
    switch (access.type) {
        case 'project': {
            const permission = access.permission
            return PROJECT_MEMBERS.filter((identity) => {
                const role = ROLE_OF_IDENTITY[identity]
                if (role === undefined) {
                    return true
                }
                return permission === undefined || rolePermissions[role].includes(permission)
            })
        }
        case 'tenantAdmin':
            return ['tenantAdmin']
        case 'tenantAdminSelf':
            return ['tenantAdmin', 'otherTenantAdmin']
        case 'tenantMember':
            return SAME_TENANT_MEMBERS
        case 'authenticated':
            return ALL_IDENTITIES.filter((identity) => identity !== 'anonymous')
        case 'custom':
            return access.allow
    }
}

function isDenied({ status, extra }: { status: number, extra: readonly number[] | undefined }): boolean {
    return DENIED_STATUSES.includes(status) || (extra?.includes(status) ?? false)
}

function isOk({ status, expectOk }: { status: number, expectOk: readonly number[] | undefined }): boolean {
    if (expectOk !== undefined) {
        return expectOk.includes(status)
    }
    return status >= 200 && status < 300
}

function containsAny({ text, needles }: { text: string, needles: readonly string[] }): string | null {
    return needles.find((needle) => needle.length > 0 && text.includes(needle)) ?? null
}

async function runIdentity({ world, matrixCase, identity }: { world: World, matrixCase: MatrixCase, identity: Identity }): Promise<void> {
    const allowed = allowedIdentities({ access: matrixCase.access }).includes(identity)
    const prepared = await matrixCase.prepare({ world, scope: 'A' })
    const response = await world.send({ identity, request: prepared.request })
    if (allowed) {
        if (!isOk({ status: response.status, expectOk: matrixCase.expectOk })) {
            throw new Error(`${matrixCase.id}: ${identity} should be allowed but got ${response.status}: ${response.text.slice(0, 300)}`)
        }
        await matrixCase.afterAllowed?.({ world, prepared, response, identity })
    }
    else {
        if (!isDenied({ status: response.status, extra: matrixCase.alsoDeniedWith })) {
            throw new Error(`${matrixCase.id}: ${identity} must be denied (401/403/404) but got ${response.status}: ${response.text.slice(0, 300)}`)
        }
        await matrixCase.afterDenied?.({ world, prepared, response, identity })
    }
    const succeeded = response.status >= 200 && response.status < 300
    const forbiddenNeedles = matrixCase.forbiddenIds === undefined
        ? forbiddenFor({ world, identity, extra: prepared.foreignIds ?? [] })
        : matrixCase.forbiddenIds({ world, identity })
    const leaked = succeeded ? containsAny({ text: response.text, needles: forbiddenNeedles }) : null
    if (leaked !== null) {
        throw new Error(`${matrixCase.id}: response for ${identity} contains foreign identifier ${leaked}: ${response.text.slice(0, 300)}`)
    }
}

function forbiddenFor({ world, identity, extra }: { world: World, identity: Identity, extra: readonly string[] }): string[] {
    const foreignTenant = [world.scopes.T2.project.id, world.scopes.T2.tenant.id]
    const otherProject = [world.scopes.B.project.id]
    const ownProject = [world.scopes.A.project.id]
    switch (identity) {
        case 'otherTenantAdmin':
            return [...ownProject, ...otherProject, world.scopes.A.tenant.id, ...extra]
        case 'foreignProjectAdmin':
            return [...ownProject, ...foreignTenant, ...extra]
        case 'tenantAdmin':
            return [...foreignTenant]
        case 'anonymous':
            return [...ownProject, ...otherProject, ...foreignTenant, ...extra]
        default:
            return [...otherProject, ...foreignTenant]
    }
}

async function runScopedRead({ world, matrixCase, scope }: { world: World, matrixCase: MatrixCase, scope: Scope }): Promise<void> {
    const info = world.scopes[scope]
    const prepared = await matrixCase.prepare({ world, scope })
    const response = await world.send({ identity: info.actor.identity, request: prepared.request })
    if (!isOk({ status: response.status, expectOk: matrixCase.expectOk })) {
        throw new Error(`${matrixCase.id}: scope ${scope} owner request should succeed but got ${response.status}: ${response.text.slice(0, 300)}`)
    }
    const otherScopes = (['A', 'B', 'T2'] as Scope[]).filter((other) => other !== scope)
    const needles = otherScopes.flatMap((other) => [world.scopes[other].project.id, ...(other === 'T2' || scope === 'T2' ? [world.scopes[other].tenant.id] : [])])
    const leaked = containsAny({ text: response.text, needles: needles.filter((needle) => needle !== info.project.id && needle !== info.tenant.id) })
    if (leaked !== null) {
        throw new Error(`${matrixCase.id}: scope ${scope} response contains identifier ${leaked} of another scope: ${response.text.slice(0, 300)}`)
    }
}

function crossScopeEnabled({ matrixCase }: { matrixCase: MatrixCase }): boolean {
    if (matrixCase.crossScope !== undefined) {
        return matrixCase.crossScope
    }
    return matrixCase.access.type === 'project' || matrixCase.access.type === 'tenantAdmin' || matrixCase.access.type === 'tenantMember'
}

function crossScopeCombinations({ matrixCase }: { matrixCase: MatrixCase }): [Identity, Scope][] {
    if (matrixCase.access.type === 'project') {
        return [['projectAdmin', 'B'], ['viewer', 'B'], ['tenantAdmin', 'T2'], ['projectAdmin', 'T2']]
    }
    return [['tenantAdmin', 'T2'], ['projectAdmin', 'T2']]
}

async function runCrossScope({ world, matrixCase, identity, scope }: { world: World, matrixCase: MatrixCase, identity: Identity, scope: Scope }): Promise<void> {
    const prepared = await matrixCase.prepare({ world, scope })
    const response = await world.send({ identity, request: prepared.request })
    if (!isDenied({ status: response.status, extra: matrixCase.alsoDeniedWith })) {
        throw new Error(`${matrixCase.id}: ${identity} used a resource of scope ${scope} and must be denied (401/403/404) but got ${response.status}: ${response.text.slice(0, 300)}`)
    }
    await matrixCase.afterDenied?.({ world, prepared, response, identity })
}

function describeMatrix({ name, getWorld, cases }: { name: string, getWorld: () => World, cases: readonly MatrixCase[] }): void {
    describe(name, () => {
        cases.forEach((matrixCase) => {
            describe(matrixCase.id + (matrixCase.label === undefined ? '' : ` (${matrixCase.label})`), () => {
                const identities = matrixCase.identities ?? ALL_IDENTITIES
                it.each(identities.map((identity) => [identity]))('as %s', async (identity) => {
                    await runIdentity({ world: getWorld(), matrixCase, identity })
                })
                if (crossScopeEnabled({ matrixCase })) {
                    it.each(crossScopeCombinations({ matrixCase }))('IDOR: %s using a resource of scope %s is denied', async (identity, scope) => {
                        await runCrossScope({ world: getWorld(), matrixCase, identity, scope })
                    })
                }
                if (matrixCase.scopedRead === true) {
                    it.each([['B'], ['T2']] as [Scope][])('scope %s owner sees only own data', async (scope) => {
                        await runScopedRead({ world: getWorld(), matrixCase, scope })
                    })
                }
            })
        })
    })
}

export const securityMatrix = {
    describeMatrix,
    allowedIdentities,
}

export type Access =
    | { type: 'project', permission: Permission | undefined }
    | { type: 'tenantAdmin' }
    | { type: 'tenantAdminSelf' }
    | { type: 'tenantMember' }
    | { type: 'authenticated' }
    | { type: 'custom', allow: readonly Identity[] }

export type PreparedRequest = {
    request: WorldRequest
    foreignIds?: string[]
    state?: Record<string, unknown>
}

export type MatrixHookParams = {
    world: World
    prepared: PreparedRequest
    response: WorldResponse
    identity: Identity
}

export type MatrixCase = {
    id: string
    label?: string
    access: Access
    prepare: (params: { world: World, scope: Scope }) => Promise<PreparedRequest>
    expectOk?: readonly number[]
    alsoDeniedWith?: readonly number[]
    identities?: readonly Identity[]
    scopedRead?: boolean
    crossScope?: boolean
    forbiddenIds?: (params: { world: World, identity: Identity }) => string[]
    afterDenied?: (params: MatrixHookParams) => Promise<void>
    afterAllowed?: (params: MatrixHookParams) => Promise<void>
}
