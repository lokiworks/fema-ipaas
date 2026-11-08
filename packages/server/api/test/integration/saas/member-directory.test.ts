import http from 'node:http'
import { generateId } from '@fema-ipaas/core-utils'
import { ConnectionType, DefaultProjectRole, DirectoryMemberState, DirectorySkipReason, OAuth2GrantType, SsoLoginErrorCode, TenantMemberStatus, TenantModule, TenantRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { oidcClient } from '../../../src/app/sso/oidc-client'
import { db } from '../../helpers/db'
import { FakeIdp, startFakeIdp } from '../../helpers/fake-oidc-idp'
import { createMockConnection } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment } from '../../helpers/test-setup'

process.env['FEMA_SSRF_ALLOW_LIST'] = '127.0.0.1'

let app: FastifyInstance
let idp: FakeIdp
let fema: FakeDirectory
let counter = 0

beforeAll(async () => {
    app = await setupTestEnvironment()
    idp = await startFakeIdp()
    fema = await startFakeDirectory()
    const probe = await createTestContext(app)
    idp.allowRedirect((await probe.get('/v1/tenant-access/sso')).json().redirectUri)
})

afterAll(async () => {
    await idp.close()
    await fema.close()
})

beforeEach(async () => {
    app = await setupTestEnvironment()
    oidcClient.clearCache()
    fema.reset()
})

describe('adding members from the member directory', () => {
    describe('who can see the directory', () => {
        it('tells the members page that a federated tenant has a directory', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })

            const members = await tenant.ctx.get('/v1/tenant-access/members')

            expect(members.statusCode).toBe(StatusCodes.OK)
            expect(members.json().memberDirectory).toBe(true)
        })

        it('refuses a member who is not a tenant admin', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [directoryMember({ id: 'm-li', name: '李雷' })] })
            const member = await createMemberContext(app, tenant.ctx, { projectRole: DefaultProjectRole.ADMIN })

            const list = await member.get('/v1/tenant-access/members/directory')
            const add = await member.post('/v1/tenant-access/members/directory/add', { subjects: ['m-li'], tenantRole: TenantRole.ADMIN, modules: [] })

            expect(list.statusCode).toBe(StatusCodes.FORBIDDEN)
            expect(add.statusCode).toBe(StatusCodes.FORBIDDEN)
            expect(await bindingsOf({ tenantId: tenant.ctx.tenant.id })).toHaveLength(0)
        })

        it('is not offered to a tenant that matches people by email', async () => {
            const tenant = await federatedTenant({ code: 'T-A', matchBy: 'EMAIL' })

            const members = await tenant.ctx.get('/v1/tenant-access/members')
            const list = await tenant.ctx.get('/v1/tenant-access/members/directory')
            const add = await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-li'], tenantRole: TenantRole.MEMBER, modules: [] })

            expect(members.json().memberDirectory).toBe(false)
            expect(list.statusCode).toBe(StatusCodes.CONFLICT)
            expect(list.json().params.message).toBe('memberDirectoryUnavailable')
            expect(add.statusCode).toBe(StatusCodes.CONFLICT)
            expect(fema.calls()).toBe(0)
        })

        it('is not offered to a tenant without a company sign-in or without the integration application', async () => {
            const plain = await createTestContext(app)
            const noSubscription = await federatedTenant({ code: 'T-A', withSubscription: false })

            expect((await plain.get('/v1/tenant-access/members')).json().memberDirectory).toBe(false)
            expect((await plain.get('/v1/tenant-access/members/directory')).statusCode).toBe(StatusCodes.CONFLICT)
            expect((await noSubscription.ctx.get('/v1/tenant-access/members')).json().memberDirectory).toBe(false)
            expect((await noSubscription.ctx.get('/v1/tenant-access/members/directory')).statusCode).toBe(StatusCodes.CONFLICT)
        })

        it('reports a directory that cannot be read instead of an empty list', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.failNext()

            const list = await tenant.ctx.get('/v1/tenant-access/members/directory')

            expect(list.statusCode).toBe(StatusCodes.CONFLICT)
            expect(list.json().params.message).toBe('memberDirectoryUnreachable')
        })
    })

    describe('reading the directory', () => {
        it('reads the members of this tenant with its integration application and marks who is already in', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [
                directoryMember({ id: 'm-li', name: '李雷', username: 'lilei' }),
                directoryMember({ id: 'm-han', name: '韩梅梅', status: 'PENDING' }),
                directoryMember({ id: 'm-sus', name: 'Suspended Sam', status: 'SUSPENDED' }),
            ] })
            await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-han'], tenantRole: TenantRole.OPERATOR, modules: [] })

            const list = await tenant.ctx.get('/v1/tenant-access/members/directory')

            expect(list.statusCode).toBe(StatusCodes.OK)
            expect(list.json().items).toEqual([
                { subject: 'm-li', name: '李雷', username: 'lilei', state: DirectoryMemberState.AVAILABLE, tenantRole: null },
                { subject: 'm-han', name: '韩梅梅', username: null, state: DirectoryMemberState.ADDED, tenantRole: TenantRole.OPERATOR },
                { subject: 'm-sus', name: 'Suspended Sam', username: null, state: DirectoryMemberState.UNAVAILABLE, tenantRole: null },
            ])
            expect(fema.lastToken()).toBe(tenant.token)
        })

        it('searches by name or username and pages through the directory', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [
                directoryMember({ id: 'm-1', name: '王一' }),
                directoryMember({ id: 'm-2', name: '王二' }),
                directoryMember({ id: 'm-3', name: '赵三', username: 'wangsan' }),
                directoryMember({ id: 'm-4', name: '钱四' }),
            ] })

            const first = await tenant.ctx.get('/v1/tenant-access/members/directory', { keyword: '王', limit: 2 })
            const byUsername = await tenant.ctx.get('/v1/tenant-access/members/directory', { keyword: 'wang', limit: 2 })
            const second = await tenant.ctx.get('/v1/tenant-access/members/directory', { page: 2, limit: 2 })

            expect(first.json().items.map((item: { subject: string }) => item.subject)).toEqual(['m-1', 'm-2'])
            expect(first.json().hasNext).toBe(false)
            expect(byUsername.json().items.map((item: { subject: string }) => item.subject)).toEqual(['m-3'])
            expect(second.json().items.map((item: { subject: string }) => item.subject)).toEqual(['m-3', 'm-4'])
            expect(second.json().page).toBe(2)
        })
    })

    describe('adding the people picked', () => {
        it('lets a picked member who has only a phone number sign in with the company account, with the role and modules chosen', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [directoryMember({ id: 'm-phone', name: '只有手机号' })] })
            idp.setUser({ email: 'm-phone', claims: { sub: 'm-phone', name: '只有手机号' } })
            const refused = await signIn({ ctx: tenant.ctx, key: 'm-phone' })
            expect(refused.error).toBe(SsoLoginErrorCode.USER_NOT_PROVISIONED)

            const added = await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-phone'], tenantRole: TenantRole.OPERATOR, modules: [TenantModule.CONNECTOR_DEVELOPMENT] })

            expect(added.statusCode).toBe(StatusCodes.OK)
            expect(added.json()).toEqual({ added: [{ subject: 'm-phone', name: '只有手机号' }], skipped: [] })
            const pending = (await tenant.ctx.get('/v1/tenant-access/members')).json().members.find((member: { kind: string }) => member.kind === 'BINDING')
            expect(pending).toMatchObject({ firstName: '只有手机号', status: TenantMemberStatus.PENDING, tenantRole: TenantRole.OPERATOR })
            const flow = await signIn({ ctx: tenant.ctx, key: 'm-phone' })
            expect(flow.error).toBeNull()
            const session = await exchange({ ticket: flow.ticket })
            expect(session.statusCode).toBe(StatusCodes.OK)
            expect(session.json().tenantRole).toBe(TenantRole.OPERATOR)
            const user = await db.findOneBy<{ tenantRole: string, modules: string[], tenantId: string }>('user', { id: session.json().id })
            expect(user).toMatchObject({ tenantRole: TenantRole.OPERATOR, modules: [TenantModule.CONNECTOR_DEVELOPMENT], tenantId: tenant.ctx.tenant.id })
            const members = (await tenant.ctx.get('/v1/tenant-access/members')).json().members
            expect(members.filter((member: { kind: string }) => member.kind === 'BINDING')).toHaveLength(0)
            expect(members.some((member: { id: string, kind: string }) => member.kind === 'USER' && member.id === session.json().id)).toBe(true)
            const directory = (await tenant.ctx.get('/v1/tenant-access/members/directory')).json().items
            expect(directory[0]).toMatchObject({ subject: 'm-phone', state: DirectoryMemberState.MEMBER, tenantRole: TenantRole.OPERATOR })
            await expectAudited({ tenantId: tenant.ctx.tenant.id, action: 'tenant.users.invited', contains: '只有手机号' })
        })

        it('does nothing the second time, before or after the first sign-in', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [directoryMember({ id: 'm-li', name: '李雷' })] })
            idp.setUser({ email: 'm-li', claims: { sub: 'm-li', name: '李雷' } })
            await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-li'], tenantRole: TenantRole.MEMBER, modules: [] })

            const again = await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-li', 'm-li'], tenantRole: TenantRole.ADMIN, modules: [] })
            const session = await exchange({ ticket: (await signIn({ ctx: tenant.ctx, key: 'm-li' })).ticket })
            const afterSignIn = await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-li'], tenantRole: TenantRole.ADMIN, modules: [] })

            expect(again.json()).toEqual({ added: [], skipped: [{ subject: 'm-li', name: '李雷', reason: DirectorySkipReason.ALREADY_MEMBER }] })
            expect(afterSignIn.json().skipped[0].reason).toBe(DirectorySkipReason.ALREADY_MEMBER)
            expect(session.json().tenantRole).toBe(TenantRole.MEMBER)
            expect(await bindingsOf({ tenantId: tenant.ctx.tenant.id })).toHaveLength(1)
            expect(await db.findOneBy<{ tenantRole: string }>('user', { id: session.json().id })).toMatchObject({ tenantRole: TenantRole.MEMBER })
        })

        it('skips who the directory does not know or who is not in good standing, whatever the browser sends', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [directoryMember({ id: 'm-sus', name: 'Suspended Sam', status: 'SUSPENDED' })] })

            const response = await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-sus', 'm-unknown'], tenantRole: TenantRole.ADMIN, modules: [] })

            expect(response.json()).toEqual({
                added: [],
                skipped: [
                    { subject: 'm-sus', name: 'Suspended Sam', reason: DirectorySkipReason.NOT_IN_GOOD_STANDING },
                    { subject: 'm-unknown', name: null, reason: DirectorySkipReason.NOT_IN_DIRECTORY },
                ],
            })
            expect(await bindingsOf({ tenantId: tenant.ctx.tenant.id })).toHaveLength(0)
        })

        it('lets the admin cancel a pick before the first sign-in, after which signing in is refused again', async () => {
            const tenant = await federatedTenant({ code: 'T-A' })
            fema.seed({ token: tenant.token, members: [directoryMember({ id: 'm-li', name: '李雷' })] })
            idp.setUser({ email: 'm-li', claims: { sub: 'm-li', name: '李雷' } })
            await tenant.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-li'], tenantRole: TenantRole.MEMBER, modules: [] })
            const [binding] = await bindingsOf({ tenantId: tenant.ctx.tenant.id })

            const cancelled = await tenant.ctx.delete(`/v1/tenant-access/members/bindings/${binding?.id}`)
            const flow = await signIn({ ctx: tenant.ctx, key: 'm-li' })

            expect(cancelled.statusCode).toBe(StatusCodes.NO_CONTENT)
            expect(await bindingsOf({ tenantId: tenant.ctx.tenant.id })).toHaveLength(0)
            expect(flow.error).toBe(SsoLoginErrorCode.USER_NOT_PROVISIONED)
        })
    })

    describe('isolation between tenants', () => {
        it('reads each tenant only through its own integration application and never touches the picks of another tenant', async () => {
            const a = await federatedTenant({ code: 'T-A' })
            const b = await federatedTenant({ code: 'T-B' })
            fema.seed({ token: a.token, members: [directoryMember({ id: 'm-a', name: 'Alice of A' })] })
            fema.seed({ token: b.token, members: [directoryMember({ id: 'm-b', name: 'Bob of B' })] })
            await a.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-a'], tenantRole: TenantRole.MEMBER, modules: [] })
            const [bindingOfA] = await bindingsOf({ tenantId: a.ctx.tenant.id })

            const listOfB = await b.ctx.get('/v1/tenant-access/members/directory')
            const addByB = await b.ctx.post('/v1/tenant-access/members/directory/add', { subjects: ['m-a'], tenantRole: TenantRole.ADMIN, modules: [] })
            const cancelByB = await b.ctx.delete(`/v1/tenant-access/members/bindings/${bindingOfA?.id}`)
            const membersOfB = (await b.ctx.get('/v1/tenant-access/members')).json().members

            expect(listOfB.json().items.map((item: { subject: string }) => item.subject)).toEqual(['m-b'])
            expect(addByB.json()).toEqual({ added: [], skipped: [{ subject: 'm-a', name: null, reason: DirectorySkipReason.NOT_IN_DIRECTORY }] })
            expect(cancelByB.statusCode).toBe(StatusCodes.NOT_FOUND)
            expect(membersOfB.some((member: { kind: string }) => member.kind === 'BINDING')).toBe(false)
            expect(await bindingsOf({ tenantId: a.ctx.tenant.id })).toHaveLength(1)
            expect(await bindingsOf({ tenantId: b.ctx.tenant.id })).toHaveLength(0)
        })
    })
})

async function federatedTenant({ code, matchBy = 'SUBJECT', withSubscription = true }: FederatedTenantParams): Promise<FederatedTenant> {
    const ctx = await createTestContext(app)
    const token = `token-${code}-${generateId()}`
    const connection = createMockConnection({ tenantId: ctx.tenant.id, projectIds: [ctx.project.id], externalId: 'fema-iam', connectorName: '@fema-ipaas/connector-fema' }, ctx.user.id)
    await db.save('connection', {
        ...connection,
        type: ConnectionType.OAUTH2,
        value: await encryptUtils.encryptObject({
            type: ConnectionType.OAUTH2,
            client_id: `app-${code}`,
            client_secret: 'app-secret',
            grant_type: OAuth2GrantType.CLIENT_CREDENTIALS,
            access_token: token,
            expires_in: 3600,
            claimed_at: Math.round(Date.now() / 1000),
            token_type: 'Bearer',
            data: {},
            redirect_url: 'https://ipaas.test/redirect',
            scope: '',
            props: { tokenUrl: `${fema.url}/token` },
        }),
    })
    await databaseConnection().getRepository('tenant').update({ id: ctx.tenant.id }, {
        externalIssuer: idp.issuer,
        externalTenantId: code,
        federatedAuthProviders: {
            saml: null,
            oidc: {
                enabled: true,
                displayName: 'Company login',
                allowedDomains: [],
                autoCreateUsers: false,
                defaultRole: TenantRole.MEMBER,
                roleMapping: null,
                defaultProject: null,
                verifiedAt: '2026-11-08T00:00:00.000Z',
                lastLoginAt: null,
                issuer: idp.issuer,
                clientId: idp.clientId,
                clientSecret: await encryptUtils.encryptString(idp.clientSecret),
                scopes: 'openid profile',
                emailClaim: 'email',
                requireVerifiedEmail: false,
                matchBy,
                extraAuthParams: { tenant: code },
                provisioned: true,
                ...(withSubscription ? {
                    memberSubscription: {
                        subscriptionId: `sub-${code}`,
                        code: `ipaas-members-${code}`,
                        plainSecret: await encryptUtils.encryptString('member-events-secret'),
                        endpoint: `https://ipaas.test/api/v1/federation/members/${ctx.tenant.id}`,
                        apiUrl: `${fema.url}/api`,
                        connectionExternalId: 'fema-iam',
                        projectId: ctx.project.id,
                        createdAt: '2026-11-08T00:00:00.000Z',
                    },
                } : {}),
            },
        },
    })
    return { ctx, token }
}

function directoryMember({ id, name, username = null, status = 'ACTIVE' }: { id: string, name: string, username?: string | null, status?: string }): DirectoryRow {
    return { id, status: { '@type': 'MemberStatus', code: status, name: status }, card: { displayName: name, username, accountStatus: 'ACTIVE' } }
}

async function bindingsOf({ tenantId }: { tenantId: string }): Promise<Array<{ id: string, subject: string }>> {
    const rows = await databaseConnection().getRepository('external_identity').find({ where: { tenantId } })
    return rows.map((row) => ({ id: String(row.id), subject: String(row.subject) }))
}

async function signIn({ ctx, key }: { ctx: TestContext, key: string }): Promise<{ error: string | null, ticket: string | null }> {
    const start = await app.inject({ method: 'GET', url: '/api/v1/authn/sso/start', query: { provider: 'OIDC' }, headers: { 'x-real-ip': nextIp(), 'x-fema-tenant': ctx.tenant.id } })
    const authorizeUrl = start.headers.location
    if (typeof authorizeUrl !== 'string' || !authorizeUrl.startsWith(idp.issuer)) {
        return { error: errorOf(start.headers.location), ticket: null }
    }
    const cookie = bindingCookieOf(start.headers['set-cookie'])
    idp.setNext({ email: key })
    const authorize = await fetch(authorizeUrl, { redirect: 'manual' })
    const callback = new URL(authorize.headers.get('location') ?? '')
    const response = await app.inject({ method: 'GET', url: `${callback.pathname}${callback.search}`, headers: { cookie, 'x-real-ip': nextIp() } })
    const location = String(response.headers.location ?? '')
    return { error: errorOf(location), ticket: new URL(location, 'http://localhost').searchParams.get('ticket') }
}

function exchange({ ticket }: { ticket: string | null }) {
    return app.inject({ method: 'POST', url: '/api/v1/authn/sso/exchange', headers: { 'x-real-ip': nextIp() }, body: { ticket: ticket ?? 'missing' } })
}

async function expectAudited({ tenantId, action, contains }: { tenantId: string, action: string, contains: string }): Promise<void> {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
        const rows = await databaseConnection().getRepository('audit_event').find({ where: { action, tenantId } })
        if (rows.some((row) => JSON.stringify(row.data).includes(contains))) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`no ${action} audit event mentions ${contains}`)
}

function errorOf(location: string | string[] | undefined): string | null {
    if (typeof location !== 'string') {
        return null
    }
    return new URL(location, 'http://localhost').searchParams.get('ssoError')
}

function bindingCookieOf(header: string | string[] | undefined): string {
    const values = Array.isArray(header) ? header : typeof header === 'string' ? [header] : []
    const found = values.find((value) => value.startsWith('fema_sso_binding='))
    return found === undefined ? '' : (found.split(';')[0] ?? '')
}

function nextIp(): string {
    counter += 1
    return `10.9.${Math.floor(counter / 250)}.${(counter % 250) + 1}`
}

async function startFakeDirectory(): Promise<FakeDirectory> {
    const state: DirectoryState = { byToken: new Map(), calls: 0, lastToken: null, failNext: false }
    const server = http.createServer((req, res) => {
        readBody(req).then((raw) => answer({ req, res, raw, state })).catch((error: unknown) => {
            res.statusCode = 500
            res.end(String(error))
        })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    return {
        url: `http://127.0.0.1:${port}`,
        seed: ({ token, members }) => {
            state.byToken.set(token, members)
        },
        reset: () => {
            state.byToken.clear()
            state.calls = 0
            state.lastToken = null
            state.failNext = false
        },
        failNext: () => {
            state.failNext = true
        },
        calls: () => state.calls,
        lastToken: () => state.lastToken,
        close: () => new Promise<void>((resolve) => {
            server.closeAllConnections()
            server.close(() => resolve())
        }),
    }
}

function answer({ req, res, raw, state }: { req: http.IncomingMessage, res: http.ServerResponse, raw: string, state: DirectoryState }): void {
    if (req.method !== 'POST' || req.url !== '/api/iam-identity/member/find-all') {
        return reply({ res, status: 404, body: { code: 'NOT_FOUND', message: 'no such path', data: null } })
    }
    state.calls += 1
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    state.lastToken = token
    if (state.failNext) {
        state.failNext = false
        return reply({ res, status: 500, body: { code: 'INTERNAL_ERROR', message: 'boom', data: null } })
    }
    const members = state.byToken.get(token)
    if (members === undefined) {
        return reply({ res, status: 401, body: { code: 'UNAUTHORIZED', message: 'unknown token', data: null } })
    }
    const query: DirectoryQuery = JSON.parse(raw)
    const matching = members.filter((member) => matches({ member, filter: query.filter }))
    const page = query.page ?? 1
    const size = query.size ?? 20
    const items = matching.slice((page - 1) * size, page * size)
    reply({ res, status: 200, body: { code: 'SUCCESS', message: null, data: { items, page, pageSize: size, hasNext: page * size < matching.length, total: matching.length } } })
}

function matches({ member, filter }: { member: DirectoryRow, filter: DirectoryQuery['filter'] }): boolean {
    if (filter === undefined) {
        return true
    }
    if (filter.id !== undefined) {
        return filter.id.in.includes(member.id)
    }
    return (filter.$or ?? []).some((condition) => {
        const name = condition['card.displayName']?.like
        const username = condition['card.username']?.like
        return (name !== undefined && member.card.displayName.includes(name)) || (username !== undefined && (member.card.username ?? '').includes(username))
    })
}

function reply({ res, status, body }: { res: http.ServerResponse, status: number, body: unknown }): void {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let data = ''
        req.on('data', (chunk: Buffer) => {
            data += chunk.toString()
        })
        req.on('end', () => resolve(data))
    })
}

type FederatedTenantParams = {
    code: string
    matchBy?: 'SUBJECT' | 'EMAIL'
    withSubscription?: boolean
}

type FederatedTenant = {
    ctx: TestContext
    token: string
}

type DirectoryRow = {
    id: string
    status: { '@type': string, code: string, name: string }
    card: { displayName: string, username: string | null, accountStatus: string }
}

type DirectoryQuery = {
    filter?: {
        id?: { in: string[] }
        $or?: Array<Record<string, { like: string } | undefined>>
    }
    page?: number
    size?: number
}

type DirectoryState = {
    byToken: Map<string, DirectoryRow[]>
    calls: number
    lastToken: string | null
    failNext: boolean
}

type FakeDirectory = {
    url: string
    seed: (params: { token: string, members: DirectoryRow[] }) => void
    reset: () => void
    failNext: () => void
    calls: () => number
    lastToken: () => string | null
    close: () => Promise<void>
}
