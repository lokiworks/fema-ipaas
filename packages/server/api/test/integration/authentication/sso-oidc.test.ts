import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, InvitationStatus, InvitationType, PrincipalType, ProjectType, SsoLoginErrorCode, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { oidcClient } from '../../../src/app/sso/oidc-client'
import { generateMockToken } from '../../helpers/auth'
import { db } from '../../helpers/db'
import { FakeIdp, NextBehavior, startFakeIdp } from '../../helpers/fake-oidc-idp'
import { createMockProject, createMockUserInvitation } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment } from '../../helpers/test-setup'

process.env['FEMA_SSRF_ALLOW_LIST'] = '127.0.0.1'

let app: FastifyInstance
let ctx: TestContext
let idp: FakeIdp
let counter = 0

beforeAll(async () => {
    app = await setupTestEnvironment()
    idp = await startFakeIdp()
    ctx = await createTestContext(app, { tenant: { emailAuthEnabled: true, passwordMinLength: 10, created: '2000-01-01T00:00:00.000Z' } })
    const settings = await ctx.get('/v1/tenant-access/sso')
    idp.allowRedirect(settings.json().redirectUri)
})

afterAll(async () => {
    await idp.close()
})

beforeEach(async () => {
    oidcClient.clearCache()
    idp.setDiscoveryIssuer(null)
    await databaseConnection().getRepository('tenant').update({ id: ctx.tenant.id }, {
        federatedAuthProviders: { saml: null },
        emailAuthEnabled: true,
        enforceAllowedAuthDomains: false,
        allowedAuthDomains: [],
    })
})

describe('OIDC single sign-on', () => {
    describe('signing in', () => {
        it('creates the account, applies the role mapping and issues a session through a one-time ticket', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email, groups: ['fema-ops'], name: 'Olivia Ops' })

            const flow = await signIn({ email })

            expect(flow.error).toBeNull()
            expect(flow.ticket).not.toBeNull()
            const session = await exchange({ ticket: flow.ticket })
            expect(session.statusCode).toBe(200)
            const body = session.json()
            expect(body.email).toBe(email)
            expect(body.tenantRole).toBe(TenantRole.OPERATOR)
            expect(body.token).toEqual(expect.any(String))
            const me = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${body.token}` } })
            expect(me.statusCode).toBe(200)
            const identity = await identityByEmail(email)
            expect(identity?.provider).toBe('OIDC')
            expect(identity?.verified).toBe(true)
        })

        it('does not let a ticket be used twice', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })
            const flow = await signIn({ email })

            const first = await exchange({ ticket: flow.ticket })
            const second = await exchange({ ticket: flow.ticket })

            expect(first.statusCode).toBe(200)
            expect(second.statusCode).toBe(401)
        })

        it('matches an existing member by email instead of creating a second account', async () => {
            await configureAndEnable({ autoCreateUsers: false })
            const member = await createMember()
            addIdpUser({ email: member.email })

            const flow = await signIn({ email: member.email })
            const session = await exchange({ ticket: flow.ticket })

            expect(session.json().id).toBe(member.userId)
            expect(await countUsers({ email: member.email })).toBe(1)
        })

        it('adds new accounts to the configured default project with the configured role', async () => {
            const project = createMockProject({ tenantId: ctx.tenant.id, ownerId: ctx.user.id })
            await db.save('project', project)
            await configureAndEnable({ autoCreateUsers: true, defaultProject: { projectId: project.id, role: DefaultProjectRole.VIEWER } })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email })
            const session = await exchange({ ticket: flow.ticket })

            const membership = await db.findOneBy<{ role: string }>('project_member', { projectId: project.id, userId: session.json().id })
            expect(membership?.role).toBe(DefaultProjectRole.VIEWER)
        })

        it('applies the highest matching role and keeps it in sync on later sign-ins when asked to', async () => {
            await configureAndEnable({ autoCreateUsers: true, syncOnLogin: true })
            const email = freshEmail()
            addIdpUser({ email, groups: ['staff'] })
            const first = await exchange({ ticket: (await signIn({ email })).ticket })
            expect(first.json().tenantRole).toBe(TenantRole.MEMBER)

            addIdpUser({ email, groups: ['fema-ops', 'fema-admins'] })
            const second = await exchange({ ticket: (await signIn({ email })).ticket })

            expect(second.json().tenantRole).toBe(TenantRole.ADMIN)
        })

        it('leaves the role alone on later sign-ins when syncing is off', async () => {
            await configureAndEnable({ autoCreateUsers: true, syncOnLogin: false })
            const email = freshEmail()
            addIdpUser({ email, groups: ['staff'] })
            await exchange({ ticket: (await signIn({ email })).ticket })

            addIdpUser({ email, groups: ['fema-admins'] })
            const second = await exchange({ ticket: (await signIn({ email })).ticket })

            expect(second.json().tenantRole).toBe(TenantRole.MEMBER)
        })

        it('never changes the role of the tenant owner when syncing roles', async () => {
            await configureAndEnable({ autoCreateUsers: true, syncOnLogin: true })
            const ownerEmail = ctx.userIdentity.email
            addIdpUser({ email: ownerEmail, groups: ['staff'] })

            const session = await exchange({ ticket: (await signIn({ email: ownerEmail })).ticket })

            expect(session.json().tenantRole).toBe(TenantRole.ADMIN)
        })

        it('reads the email from the configured claim and falls back to the userinfo endpoint', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, next: { omitClaims: ['email', 'email_verified'] } })
            expect(flow.error).toBeNull()
            expect((await exchange({ ticket: flow.ticket })).json().email).toBe(email)
        })
    })

    describe('rejecting sign-ins', () => {
        it('rejects a wrong client secret with a readable code and creates no account', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            idp.rotateSecret('the-secret-was-rotated-at-the-provider')
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email })
            idp.rotateSecret(idp.clientSecret)

            expect(flow.error).toBe(SsoLoginErrorCode.CLIENT_REJECTED)
            expect(await countUsers({ email })).toBe(0)
            await expectFailureAudited({ email: '', code: SsoLoginErrorCode.CLIENT_REJECTED })
        })

        it('rejects a callback whose state was tampered with', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, mutateCallback: (url) => {
                url.searchParams.set('state', `${url.searchParams.get('state')}x`) 
            } })

            expect(flow.error).toBe(SsoLoginErrorCode.STATE_INVALID)
            expect(await countUsers({ email })).toBe(0)
        })

        it('rejects a callback without any state', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, mutateCallback: (url) => {
                url.searchParams.delete('state') 
            } })

            expect(flow.error).toBe(SsoLoginErrorCode.STATE_INVALID)
        })

        it('rejects a replayed callback and creates no second session', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })
            const first = await signIn({ email })
            expect(first.ticket).not.toBeNull()

            const replay = await app.inject({ method: 'GET', url: first.callbackPath, headers: { cookie: first.cookie, 'x-real-ip': nextIp() } })

            expect(errorOf(replay.headers.location)).toBe(SsoLoginErrorCode.STATE_REPLAYED)
        })

        it('rejects a callback that arrives in a different browser than the one that started the sign-in', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, dropCookie: true })

            expect(flow.error).toBe(SsoLoginErrorCode.BROWSER_MISMATCH)
            expect(await countUsers({ email })).toBe(0)
        })

        it('rejects an authorization code the identity provider no longer accepts', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, next: { expireCode: true } })

            expect(flow.error).toBe(SsoLoginErrorCode.CODE_REJECTED)
            expect(await countUsers({ email })).toBe(0)
        })

        it('reports a refusal at the identity provider', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, next: { deny: true } })

            expect(flow.error).toBe(SsoLoginErrorCode.IDP_DENIED)
        })

        it('rejects an identity provider user whose email is not verified', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email, emailVerified: false })

            const flow = await signIn({ email })

            expect(flow.error).toBe(SsoLoginErrorCode.EMAIL_NOT_VERIFIED)
            expect(await countUsers({ email })).toBe(0)
            await expectFailureAudited({ email, code: SsoLoginErrorCode.EMAIL_NOT_VERIFIED })
        })

        it('accepts an unverified email only when the administrator opted out of the check', async () => {
            await configureAndEnable({ autoCreateUsers: true, requireVerifiedEmail: false })
            const email = freshEmail()
            addIdpUser({ email, emailVerified: false })

            const flow = await signIn({ email })

            expect(flow.error).toBeNull()
        })

        it('rejects a user whose email has no address', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, next: { omitClaims: ['email', 'email_verified'] }, userinfoMissingEmail: true })

            expect(flow.error).toBe(SsoLoginErrorCode.EMAIL_MISSING)
        })

        it('rejects an email domain that is not on the provider allow list', async () => {
            await configureAndEnable({ autoCreateUsers: true, allowedDomains: ['example.com'] })
            const email = `${generateId()}@outsider.test`
            addIdpUser({ email })

            const flow = await signIn({ email })

            expect(flow.error).toBe(SsoLoginErrorCode.DOMAIN_NOT_ALLOWED)
            expect(await countUsers({ email })).toBe(0)
        })

        it('rejects an email domain the tenant forbids even when the provider list is empty', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            await databaseConnection().getRepository('tenant').update({ id: ctx.tenant.id }, { enforceAllowedAuthDomains: true, allowedAuthDomains: ['corp.test'] })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email })

            expect(flow.error).toBe(SsoLoginErrorCode.DOMAIN_NOT_ALLOWED)
        })

        it('rejects a disabled user and does not touch their role', async () => {
            await configureAndEnable({ autoCreateUsers: true, syncOnLogin: true })
            const member = await createMember({ status: UserStatus.INACTIVE })
            addIdpUser({ email: member.email, groups: ['fema-admins'] })

            const flow = await signIn({ email: member.email })

            expect(flow.error).toBe(SsoLoginErrorCode.USER_DISABLED)
            const stored = await db.findOneBy<{ tenantRole: string }>('user', { id: member.userId })
            expect(stored?.tenantRole).toBe(TenantRole.MEMBER)
            await expectFailureAudited({ email: member.email, code: SsoLoginErrorCode.USER_DISABLED })
        })

        it('rejects an unknown user when automatic account creation is off', async () => {
            await configureAndEnable({ autoCreateUsers: false })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email })

            expect(flow.error).toBe(SsoLoginErrorCode.USER_NOT_PROVISIONED)
            expect(await countUsers({ email })).toBe(0)
        })

        it('lets an invited person in when automatic account creation is off', async () => {
            await configureAndEnable({ autoCreateUsers: false })
            const email = freshEmail()
            addIdpUser({ email })
            await db.save('user_invitation', { ...createMockUserInvitation({ email, tenantId: ctx.tenant.id, projectId: null, type: InvitationType.TENANT, status: InvitationStatus.ACCEPTED }), tenantRole: TenantRole.OPERATOR, projectRoleId: null })

            const flow = await signIn({ email })

            expect(flow.error).toBeNull()
            expect((await exchange({ ticket: flow.ticket })).json().tenantRole).toBe(TenantRole.OPERATOR)
        })

        it.each<[string, NextBehavior['tamper']]>([
            ['a signature made with another key', 'bad-signature'],
            ['an issuer that is not the configured one', 'wrong-issuer'],
            ['an audience that is another client', 'wrong-audience'],
            ['a nonce from another sign-in request', 'wrong-nonce'],
            ['an expired token', 'expired'],
            ['the none algorithm', 'alg-none'],
            ['a symmetric algorithm', 'hs256-confusion'],
            ['a key id the provider does not publish', 'unknown-kid'],
            ['a token without a subject', 'missing-sub'],
        ])('rejects an ID token with %s', async (_label, tamper) => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, next: { tamper } })

            expect([SsoLoginErrorCode.TOKEN_INVALID, SsoLoginErrorCode.ISSUER_MISMATCH]).toContain(flow.error)
            expect(await countUsers({ email })).toBe(0)
            await expectFailureAudited({ email: '', code: flow.error ?? '' })
        })

        it('reports an issuer mismatch when the token issuer differs from the configured issuer', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, next: { tamper: 'wrong-issuer' } })

            expect(flow.error).toBe(SsoLoginErrorCode.ISSUER_MISMATCH)
        })

        it('refuses to save a configuration whose issuer differs from what the provider reports', async () => {
            idp.setDiscoveryIssuer('https://somewhere-else.example.com')

            const response = await ctx.post('/v1/tenant-access/sso/oidc', oidcBody({ autoCreateUsers: true }))

            expect(response.statusCode).toBe(409)
            expect(response.json().params.message).toContain('somewhere-else.example.com')
            expect(response.json().params.message).toContain(idp.issuer)
        })

        it('refuses to save a configuration when the provider cannot be reached', async () => {
            const response = await ctx.post('/v1/tenant-access/sso/oidc', oidcBody({ issuer: 'http://127.0.0.1:1', autoCreateUsers: true }))

            expect(response.statusCode).toBe(409)
        })

        it('refuses to start a sign-in while the provider is switched off', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            await ctx.post('/v1/tenant-access/sso/OIDC/enabled', { enabled: false })

            const start = await app.inject({ method: 'GET', url: '/api/v1/authn/sso/start', query: { provider: 'OIDC' }, headers: { 'x-real-ip': nextIp() } })

            expect(errorOf(start.headers.location)).toBe(SsoLoginErrorCode.PROVIDER_NOT_ENABLED)
        })
    })

    describe('configuration', () => {
        it('never echoes the client secret', async () => {
            await configureAndEnable({ autoCreateUsers: true })

            const settings = await ctx.get('/v1/tenant-access/sso')

            expect(settings.body).not.toContain('test-secret-value')
            expect(settings.json().oidc.hasClientSecret).toBe(true)
            expect(settings.json().oidc.clientSecret).toBeUndefined()
        })

        it('stores the client secret encrypted', async () => {
            await configureAndEnable({ autoCreateUsers: true })

            const raw = await databaseConnection().query<{ federatedAuthProviders: { oidc: { clientSecret: { data: string } } } }[]>('select "federatedAuthProviders" from tenant where id = $1', [ctx.tenant.id])

            expect(JSON.stringify(raw[0]?.federatedAuthProviders)).not.toContain('test-secret-value')
            expect(raw[0]?.federatedAuthProviders.oidc.clientSecret.data).toEqual(expect.any(String))
        })

        it('refuses to turn a provider on before a test sign-in succeeded', async () => {
            await saveOidc({ autoCreateUsers: true, enabled: false })

            const response = await ctx.post('/v1/tenant-access/sso/OIDC/enabled', { enabled: true })

            expect(response.statusCode).toBe(409)
        })

        it('requires a new test sign-in after the credentials change', async () => {
            await configureAndEnable({ autoCreateUsers: true })

            await saveOidc({ clientSecret: 'test-secret-value', autoCreateUsers: true, enabled: false, allowUnverified: true })
            const response = await ctx.post('/v1/tenant-access/sso/OIDC/enabled', { enabled: true })

            expect(response.statusCode).toBe(409)
        })

        it('rejects a test sign-in by someone other than the administrator running it', async () => {
            await saveOidc({ autoCreateUsers: true, enabled: false })
            const email = freshEmail()
            addIdpUser({ email })

            const flow = await signIn({ email, mode: 'test' })

            expect(flow.testResult).toBe(SsoLoginErrorCode.TEST_ACCOUNT_MISMATCH)
            const settings = await ctx.get('/v1/tenant-access/sso')
            expect(settings.json().oidc.verifiedAt).toBeNull()
        })

        it('writes configuration changes to the audit log without any secret', async () => {
            await configureAndEnable({ autoCreateUsers: true })

            await waitFor(async () => {
                const events = await auditEvents('tenant.sso.settings.updated')
                return events.length >= 2
            })
            const events = await auditEvents('tenant.sso.settings.updated')
            expect(JSON.stringify(events)).not.toContain('test-secret-value')
            expect(events.map((event) => event.data.detail).join(' ')).toContain('enabled')
        })

        it('is closed to members and to other tenants', async () => {
            const member = await createMember()
            const memberToken = await tokenFor({ userId: member.userId })
            const foreign = await createTestContext(app, { tenant: { emailAuthEnabled: true, created: '2999-01-01T00:00:00.000Z' } })

            const asMember = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/sso', headers: { authorization: `Bearer ${memberToken}` } })
            const memberWrite = await app.inject({ method: 'POST', url: '/api/v1/tenant-access/sso/oidc', headers: { authorization: `Bearer ${memberToken}` }, body: oidcBody({ autoCreateUsers: true }) })
            const foreignSettings = await foreign.get('/v1/tenant-access/sso')
            const anonymous = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/sso' })

            expect(asMember.statusCode).toBe(403)
            expect(memberWrite.statusCode).toBe(403)
            expect(anonymous.statusCode).toBe(403)
            expect(foreignSettings.json().oidc).toBeNull()
        })
    })

    describe('turning password sign-in off', () => {
        it('refuses while no single sign-on method has passed its test', async () => {
            await saveOidc({ autoCreateUsers: true, enabled: false })

            const response = await ctx.post('/v1/tenant-access/login-security', { emailAuthEnabled: false })

            expect(response.statusCode).toBe(409)
            expect((await ctx.get('/v1/tenant-access/login-security')).json().methods[0].enabled).toBe(true)
        })

        it('refuses through the tenant update route as well', async () => {
            await saveOidc({ autoCreateUsers: true, enabled: false })

            const response = await ctx.post(`/v1/tenants/${ctx.tenant.id}`, { emailAuthEnabled: 'false' })

            expect(response.statusCode).toBe(409)
        })

        it('blocks password sign-in afterwards while single sign-on keeps working', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const off = await ctx.post('/v1/tenant-access/login-security', { emailAuthEnabled: false })
            expect(off.statusCode).toBe(200)
            const email = freshEmail()
            addIdpUser({ email })

            const password = await app.inject({ method: 'POST', url: '/api/v1/authentication/sign-in', headers: { 'x-real-ip': nextIp() }, body: { email: ctx.userIdentity.email, password: 'whatever-it-is' } })
            const sso = await signIn({ email })

            expect(password.statusCode).toBe(403)
            expect(password.json().code).toBe('EMAIL_AUTH_DISABLED')
            expect(sso.error).toBeNull()
            await expectAuditedAction({ action: 'user.sign.in.failed', contains: 'password: EMAIL_AUTH_DISABLED' })
        })

        it('keeps the provider from being switched off or reconfigured into a lockout', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            await ctx.post('/v1/tenant-access/login-security', { emailAuthEnabled: false })

            const disable = await ctx.post('/v1/tenant-access/sso/OIDC/enabled', { enabled: false })
            const reconfigure = await ctx.post('/v1/tenant-access/sso/oidc', oidcBody({ clientSecret: 'another-secret', autoCreateUsers: true }))

            expect(disable.statusCode).toBe(409)
            expect(reconfigure.statusCode).toBe(409)
        })
    })

    describe('login audit', () => {
        it('records failed password sign-ins with the attempted address and the reason', async () => {
            const email = freshEmail()

            const response = await app.inject({ method: 'POST', url: '/api/v1/authentication/sign-in', headers: { 'x-real-ip': nextIp() }, body: { email, password: 'wrong-password-123' } })

            expect(response.statusCode).toBe(401)
            await expectAuditedAction({ action: 'user.sign.in.failed', contains: email })
            await expectAuditedAction({ action: 'user.sign.in.failed', contains: 'password: INVALID_CREDENTIALS' })
        })

        it('records successful single sign-on sign-ins with the method', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })

            await exchange({ ticket: (await signIn({ email })).ticket })

            await waitFor(async () => (await auditEvents('user.signed.in')).some((event) => event.data.method === 'sso' && event.userEmail === email))
        })
    })

    describe('after sign-in', () => {
        it('stops a session of a user who is disabled afterwards', async () => {
            await configureAndEnable({ autoCreateUsers: true })
            const email = freshEmail()
            addIdpUser({ email })
            const session = await exchange({ ticket: (await signIn({ email })).ticket })
            const userId = session.json().id
            const token = session.json().token
            expect((await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200)

            const disabled = await ctx.post(`/v1/tenant-access/members/${userId}/disable`)
            const after = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${token}` } })

            expect(disabled.statusCode).toBe(200)
            expect(after.statusCode).toBe(403)
            expect(after.json().code).toBe('SESSION_EXPIRED')
        })
    })
})

async function configureAndEnable(params: ConfigureParams): Promise<void> {
    await saveOidc({ ...params, enabled: false })
    await verifyAsAdmin()
    const enabled = await ctx.post('/v1/tenant-access/sso/OIDC/enabled', { enabled: true })
    expect(enabled.statusCode).toBe(200)
}

async function verifyAsAdmin(): Promise<void> {
    addIdpUser({ email: ctx.userIdentity.email, groups: ['fema-admins'] })
    const flow = await signIn({ email: ctx.userIdentity.email, mode: 'test' })
    expect(flow.testResult).toBe('ok')
}

async function saveOidc(params: ConfigureParams & { enabled?: boolean, allowUnverified?: boolean }): Promise<void> {
    const response = await ctx.post('/v1/tenant-access/sso/oidc', oidcBody(params))
    if (response.statusCode !== 200 && params.allowUnverified !== true) {
        throw new Error(`saving the configuration failed: ${response.body}`)
    }
}

function oidcBody(params: ConfigureParams & { enabled?: boolean, issuer?: string, clientSecret?: string }): Record<string, unknown> {
    return {
        enabled: params.enabled ?? false,
        displayName: 'Acme',
        allowedDomains: params.allowedDomains ?? [],
        autoCreateUsers: params.autoCreateUsers ?? true,
        defaultRole: TenantRole.MEMBER,
        roleMapping: {
            claim: 'groups',
            rules: [{ value: 'fema-admins', role: TenantRole.ADMIN }, { value: 'fema-ops', role: TenantRole.OPERATOR }],
            syncOnLogin: params.syncOnLogin ?? false,
        },
        defaultProject: params.defaultProject ?? null,
        issuer: params.issuer ?? idp.issuer,
        clientId: idp.clientId,
        clientSecret: params.clientSecret ?? idp.clientSecret,
        scopes: 'openid email profile groups',
        emailClaim: 'email',
        requireVerifiedEmail: params.requireVerifiedEmail ?? true,
    }
}

async function signIn({ email, next, mutateCallback, dropCookie, mode = 'login', userinfoMissingEmail }: SignInParams): Promise<FlowResult> {
    const start = mode === 'test'
        ? await ctx.post('/v1/tenant-access/sso/OIDC/test')
        : await app.inject({ method: 'GET', url: '/api/v1/authn/sso/start', query: { provider: 'OIDC' }, headers: { 'x-real-ip': nextIp() } })
    const authorizeUrl = mode === 'test' ? start.json().url : start.headers.location
    if (typeof authorizeUrl !== 'string' || !authorizeUrl.startsWith(idp.issuer)) {
        return { error: errorOf(start.headers.location), ticket: null, testResult: null, callbackPath: '', cookie: '' }
    }
    const cookie = bindingCookieOf(start.headers['set-cookie'])
    idp.setNext({ email, ...next })
    if (userinfoMissingEmail === true) {
        idp.setUser({ email, claims: { sub: `sub-${email}`, name: 'No Mail' } })
    }
    const authorize = await fetch(authorizeUrl, { redirect: 'manual' })
    const callback = new URL(authorize.headers.get('location') ?? '')
    mutateCallback?.(callback)
    const callbackPath = `${callback.pathname}${callback.search}`
    const response = await app.inject({ method: 'GET', url: callbackPath, headers: { ...(dropCookie === true ? {} : { cookie }), 'x-real-ip': nextIp() } })
    const location = String(response.headers.location ?? '')
    const target = new URL(location, 'http://localhost')
    return {
        error: mode === 'login' ? errorOf(location) : null,
        ticket: target.searchParams.get('ticket'),
        testResult: mode === 'test' ? target.searchParams.get('ssoTest') : null,
        callbackPath,
        cookie,
    }
}

function exchange({ ticket }: { ticket: string | null }) {
    return app.inject({ method: 'POST', url: '/api/v1/authn/sso/exchange', headers: { 'x-real-ip': nextIp() }, body: { ticket: ticket ?? 'missing' } })
}

function addIdpUser({ email, groups = ['staff'], emailVerified = true, name = 'Test Person' }: { email: string, groups?: string[], emailVerified?: boolean, name?: string }): void {
    idp.setUser({ email, claims: { sub: `sub-${email}`, email, email_verified: emailVerified, name, groups } })
}

async function createMember({ status = UserStatus.ACTIVE }: { status?: UserStatus } = {}): Promise<{ userId: string, email: string }> {
    const email = freshEmail()
    const identityId = generateId()
    const userId = generateId()
    await db.save('user_identity', { id: identityId, email, password: 'x', firstName: 'Existing', lastName: 'Member', verified: true, provider: 'EMAIL', trackEvents: false, newsLetter: false, tokenVersion: generateId(), created: new Date().toISOString(), updated: new Date().toISOString() })
    await db.save('user', { id: userId, identityId, tenantId: ctx.tenant.id, tenantRole: TenantRole.MEMBER, status, created: new Date().toISOString(), updated: new Date().toISOString() })
    await db.save('project', createMockProject({ tenantId: ctx.tenant.id, ownerId: userId, type: ProjectType.PERSONAL }))
    return { userId, email }
}

async function tokenFor({ userId }: { userId: string }): Promise<string> {
    return generateMockToken({ id: userId, type: PrincipalType.USER, tenant: { id: ctx.tenant.id } })
}

async function identityByEmail(email: string): Promise<{ provider: string, verified: boolean } | null> {
    return db.findOneBy<{ provider: string, verified: boolean }>('user_identity', { email })
}

async function countUsers({ email }: { email: string }): Promise<number> {
    const identity = await db.findOneBy<{ id: string }>('user_identity', { email })
    if (identity === null) {
        return 0
    }
    return databaseConnection().getRepository('user').countBy({ identityId: identity.id })
}

async function auditEvents(action: string): Promise<AuditRow[]> {
    const rows = await databaseConnection().getRepository('audit_event').find({ where: { action, tenantId: ctx.tenant.id } })
    return rows.map((row) => ({ action: row.action, userEmail: row.userEmail, data: row.data }))
}

async function expectFailureAudited({ email, code }: { email: string, code: string }): Promise<void> {
    await waitFor(async () => {
        const events = await auditEvents('user.sign.in.failed')
        return events.some((event) => String(event.data.detail).includes(code) && (email === '' || event.data.target === email))
    })
}

async function expectAuditedAction({ action, contains }: { action: string, contains: string }): Promise<void> {
    await waitFor(async () => (await auditEvents(action)).some((event) => JSON.stringify(event.data).includes(contains)))
}

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
        if (await condition()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('condition was not met in time')
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

function freshEmail(): string {
    return `sso-${generateId().toLowerCase()}@example.com`
}

function nextIp(): string {
    counter += 1
    return `10.7.${Math.floor(counter / 250)}.${(counter % 250) + 1}`
}

type ConfigureParams = {
    autoCreateUsers?: boolean
    syncOnLogin?: boolean
    allowedDomains?: string[]
    requireVerifiedEmail?: boolean
    defaultProject?: { projectId: string, role: DefaultProjectRole } | null
    clientSecret?: string
    issuer?: string
}

type SignInParams = {
    email: string
    next?: Omit<NextBehavior, 'email'>
    mutateCallback?: (url: URL) => void
    dropCookie?: boolean
    mode?: 'login' | 'test'
    userinfoMissingEmail?: boolean
}

type FlowResult = {
    error: string | null
    ticket: string | null
    testResult: string | null
    callbackPath: string
    cookie: string
}

type AuditRow = {
    action: string
    userEmail: string | null
    data: Record<string, unknown>
}
