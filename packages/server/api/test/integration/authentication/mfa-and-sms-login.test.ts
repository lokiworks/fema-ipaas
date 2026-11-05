import { createHash } from 'node:crypto'
import { generateId } from '@fema-ipaas/core-utils'
import { LOGIN_METHOD_LIMITS, ProjectType, TenantRole, UserStatus } from '@fema-ipaas/shared'
import bcrypt from 'bcrypt'
import { FastifyInstance } from 'fastify'
import { totp } from '../../../src/app/authentication/mfa/totp'
import { smsSender } from '../../../src/app/authentication/sms/sms-sender'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { distributedStore } from '../../../src/app/database/redis-connections'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { captchaHelper } from '../../helpers/captcha'
import { db } from '../../helpers/db'
import { createMockProject } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
let ctx: TestContext
let counter = 0

const PASSWORD = 'a-long-enough-password'
let PHONE = freshPhone()

beforeAll(async () => {
    app = await setupTestEnvironment()
    ctx = await createTestContext(app, { tenant: { emailAuthEnabled: true, passwordMinLength: 10, sessionDurationDays: 7, created: '2000-01-01T00:00:00.000Z' }, project: { type: ProjectType.TEAM } })
})

beforeEach(async () => {
    PHONE = freshPhone()
    await databaseConnection().getRepository('tenant').update({ id: ctx.tenant.id }, { emailAuthEnabled: true, mfaPolicy: 'OPTIONAL', phoneAuthEnabled: false })
    await databaseConnection().getRepository('flag').delete({ id: 'SMS_SETTINGS' })
    vi.restoreAllMocks()
    await resetSmsCounters()
})

describe('two-step verification', () => {
    it('enrolls from a session, then demands a code at the next password sign-in', async () => {
        const member = await createMember()
        const session = await signInOk({ email: member.email })

        const started = await post({ url: '/v1/authentication/mfa/enroll/start', token: session, body: {} })
        expect(started.statusCode).toBe(200)
        const { secret, otpauthUrl } = started.json()
        expect(otpauthUrl).toContain('otpauth://totp/')

        const wrong = await post({ url: '/v1/authentication/mfa/enroll/confirm', token: session, body: { code: '000000' } })
        expect(wrong.json().code).toBe('INVALID_MFA_CODE')

        const confirmed = await post({ url: '/v1/authentication/mfa/enroll/confirm', token: session, body: { code: codeFor({ secret, offset: 0 }) } })
        expect(confirmed.statusCode).toBe(200)
        expect(confirmed.json().recoveryCodes).toHaveLength(LOGIN_METHOD_LIMITS.recoveryCodeCount)
        expect(confirmed.json().authentication).toBeNull()

        const status = await app.inject({ method: 'GET', url: '/api/v1/users/me/security', headers: { authorization: `Bearer ${session}` } })
        expect(status.json()).toMatchObject({ mfaEnabled: true, recoveryCodesRemaining: 10 })

        const challenged = await signIn({ email: member.email })
        expect(challenged.statusCode).toBe(401)
        expect(challenged.json().code).toBe('MFA_REQUIRED')
        const challengeToken: string = challenged.json().params.challengeToken

        const verified = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken, code: codeFor({ secret, offset: 1 }) } })
        expect(verified.statusCode).toBe(200)
        expect(verified.json().token).toBeDefined()
        expect(verified.json().tenantId).toBe(ctx.tenant.id)

        const replay = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken, code: codeFor({ secret, offset: 1 }) } })
        expect(replay.json().code).toBe('INVALID_MFA_CODE')
    })

    it('voids a challenge after five wrong codes', async () => {
        const member = await createMember()
        const secret = await enable({ identityId: member.identityId })
        const challenged = await signIn({ email: member.email })
        const challengeToken: string = challenged.json().params.challengeToken

        for (let attempt = 0; attempt < LOGIN_METHOD_LIMITS.mfaMaxChallengeAttempts; attempt++) {
            const response = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken, code: '000000' } })
            expect(response.json().code).toBe('INVALID_MFA_CODE')
        }
        const lateButRight = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken, code: codeFor({ secret, offset: 0 }) } })
        expect(lateButRight.json().code).toBe('INVALID_MFA_CODE')
    })

    it('accepts a recovery code once and counts it off', async () => {
        const member = await createMember()
        const session = await signInOk({ email: member.email })
        const { secret } = (await post({ url: '/v1/authentication/mfa/enroll/start', token: session, body: {} })).json()
        const { recoveryCodes } = (await post({ url: '/v1/authentication/mfa/enroll/confirm', token: session, body: { code: codeFor({ secret, offset: 0 }) } })).json()

        const first = await signIn({ email: member.email })
        const accepted = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken: first.json().params.challengeToken, code: recoveryCodes[0] } })
        expect(accepted.statusCode).toBe(200)

        const second = await signIn({ email: member.email })
        const reused = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken: second.json().params.challengeToken, code: recoveryCodes[0] } })
        expect(reused.json().code).toBe('INVALID_MFA_CODE')

        const status = await app.inject({ method: 'GET', url: '/api/v1/users/me/security', headers: { authorization: `Bearer ${accepted.json().token}` } })
        expect(status.json().recoveryCodesRemaining).toBe(9)
    })

    it('forces enrollment when the tenant requires it and signs the user in once they finish', async () => {
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'REQUIRED' })
        const member = await createMember()

        const challenged = await signIn({ email: member.email })
        expect(challenged.json().code).toBe('MFA_ENROLLMENT_REQUIRED')
        const challengeToken: string = challenged.json().params.challengeToken

        const started = await post({ url: '/v1/authentication/mfa/enroll/start', body: { challengeToken } })
        expect(started.statusCode).toBe(200)
        const confirmed = await post({ url: '/v1/authentication/mfa/enroll/confirm', body: { challengeToken, code: codeFor({ secret: started.json().secret, offset: 0 }) } })

        expect(confirmed.statusCode).toBe(200)
        expect(confirmed.json().recoveryCodes).toHaveLength(10)
        expect(confirmed.json().authentication.token).toBeDefined()
        const reused = await post({ url: '/v1/authentication/mfa/enroll/start', body: { challengeToken } })
        expect(reused.json().code).toBe('INVALID_MFA_CODE')
    })

    it('refuses to turn off two-step verification while the tenant requires it, and lets an admin reset a locked member', async () => {
        const member = await createMember()
        const secret = await enable({ identityId: member.identityId })
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'REQUIRED' })
        const challenged = await signIn({ email: member.email })
        const verified = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken: challenged.json().params.challengeToken, code: codeFor({ secret, offset: 0 }) } })

        const refused = await post({ url: '/v1/authentication/mfa/disable', token: verified.json().token, body: { code: codeFor({ secret, offset: -1 }) } })
        expect(refused.statusCode).toBe(409)

        const reset = await ctx.post(`/v1/tenant-access/members/${member.userId}/reset-mfa`)
        expect(reset.statusCode).toBe(204)
        const stored = await db.findOneBy<{ mfaEnabled: boolean }>('user_identity', { id: member.identityId })
        expect(stored?.mfaEnabled).toBe(false)
    })

    it('turns off with a valid code when the tenant does not require it', async () => {
        const member = await createMember()
        const secret = await enable({ identityId: member.identityId })
        const challenged = await signIn({ email: member.email })
        const verified = await post({ url: '/v1/authentication/mfa/verify', body: { challengeToken: challenged.json().params.challengeToken, code: codeFor({ secret, offset: 0 }) } })

        const wrong = await post({ url: '/v1/authentication/mfa/disable', token: verified.json().token, body: { code: '000000' } })
        expect(wrong.json().code).toBe('INVALID_MFA_CODE')
        const disabled = await post({ url: '/v1/authentication/mfa/disable', token: verified.json().token, body: { code: codeFor({ secret, offset: -1 }) } })
        expect(disabled.statusCode).toBe(204)
        expect((await signIn({ email: member.email })).statusCode).toBe(200)
    })
})

describe('sms sign-in', () => {
    it('stays hidden until the operator has configured and tested a provider', async () => {
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'OPTIONAL', phoneAuthEnabled: true })
        const status = await ctx.get('/v1/tenant-access/login-security')
        expect(status.json().smsDelivery).toBe(false)
        expect(status.json().phoneAuthEnabled).toBe(false)

        const response = await requestSms({ phone: PHONE })
        expect(response.json().code).toBe('SMS_NOT_CONFIGURED')
    })

    it('signs a member in with a code, once, and withholds the code from strangers', async () => {
        await configureSms()
        const sent: string[] = []
        vi.spyOn(smsSender, 'send').mockImplementation(async ({ code }) => {
            sent.push(code)
            return { ok: true }
        })
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'OPTIONAL', phoneAuthEnabled: true })
        const member = await createMember({ phone: PHONE })

        const requested = await requestSms({ phone: PHONE })
        expect(requested.statusCode).toBe(204)
        expect(sent).toHaveLength(1)

        const tooSoon = await requestSms({ phone: PHONE })
        expect(tooSoon.statusCode).toBe(409)
        expect(sent).toHaveLength(1)

        const wrong = await verifySms({ phone: PHONE, code: wrongCodeFor(sent[0]) })
        expect(wrong.statusCode).toBe(410)

        const accepted = await verifySms({ phone: PHONE, code: sent[0] })
        expect(accepted.statusCode).toBe(200)
        expect(accepted.json().tenantId).toBe(ctx.tenant.id)
        expect(accepted.json().id).toBe(member.userId)

        const reused = await verifySms({ phone: PHONE, code: sent[0] })
        expect(reused.statusCode).toBe(410)

        const strangerPhone = freshPhone()
        const stranger = await requestSms({ phone: strangerPhone })
        expect(stranger.statusCode).toBe(204)
        expect(sent).toHaveLength(1)
        expect(await db.findOneBy('user_identity', { phone: strangerPhone })).toBeNull()
    })

    it('invalidates a code after five wrong guesses', async () => {
        await configureSms()
        const sent: string[] = []
        vi.spyOn(smsSender, 'send').mockImplementation(async ({ code }) => {
            sent.push(code)
            return { ok: true }
        })
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'OPTIONAL', phoneAuthEnabled: true })
        await createMember({ phone: PHONE })
        await requestSms({ phone: PHONE })

        for (let attempt = 0; attempt < 5; attempt++) {
            expect((await verifySms({ phone: PHONE, code: wrongCodeFor(sent[0]) })).statusCode).toBe(410)
        }
        expect((await verifySms({ phone: PHONE, code: sent[0] })).statusCode).toBe(410)
    })

    it('refuses sign-in by phone when the tenant has not turned it on', async () => {
        await configureSms()
        await createMember({ phone: PHONE })

        const response = await requestSms({ phone: PHONE })

        expect(response.statusCode).toBe(403)
    })

    it('asks for the second step after the code when the account has one', async () => {
        await configureSms()
        const sent: string[] = []
        vi.spyOn(smsSender, 'send').mockImplementation(async ({ code }) => {
            sent.push(code)
            return { ok: true }
        })
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'OPTIONAL', phoneAuthEnabled: true })
        const member = await createMember({ phone: PHONE })
        await enable({ identityId: member.identityId })
        await requestSms({ phone: PHONE })

        const response = await verifySms({ phone: PHONE, code: sent[0] })

        expect(response.statusCode).toBe(401)
        expect(response.json().code).toBe('MFA_REQUIRED')
    })

    it('binds a phone number to the signed-in account', async () => {
        await configureSms()
        const sent: string[] = []
        vi.spyOn(smsSender, 'send').mockImplementation(async ({ code }) => {
            sent.push(code)
            return { ok: true }
        })
        const member = await createMember()
        const session = await signInOk({ email: member.email })

        const requested = await post({ url: '/v1/users/me/phone/request', token: session, body: { phone: PHONE, captchaToken: await captchaHelper.solvedToken({ app }) } })
        expect(requested.statusCode).toBe(204)
        const confirmed = await post({ url: '/v1/users/me/phone/confirm', token: session, body: { phone: PHONE, code: sent[0] } })

        expect(confirmed.statusCode).toBe(200)
        expect(confirmed.json()).toMatchObject({ phone: PHONE, phoneVerified: true })
        const stored = await db.findOneBy<{ phone: string }>('user_identity', { id: member.identityId })
        expect(stored?.phone).toBe(PHONE)
    })
})

describe('phone invitations', () => {
    it('lets an invited number sign in by sms and shows it as pending until then', async () => {
        await configureSms()
        const sent: string[] = []
        vi.spyOn(smsSender, 'send').mockImplementation(async ({ code }) => {
            sent.push(code)
            return { ok: true }
        })
        await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'OPTIONAL', phoneAuthEnabled: true })

        const invited = await ctx.post('/v1/tenant-access/members/invite', { emails: [], phones: [PHONE], tenantRole: TenantRole.MEMBER, modules: [] })
        expect(invited.statusCode).toBe(201)
        expect(invited.json().invited).toEqual([{ email: '', phone: PHONE, link: null, external: false }])

        const listed = await ctx.get('/v1/tenant-access/members')
        const pending = listed.json().members.find((member: { phone: string | null }) => member.phone === PHONE)
        expect(pending).toMatchObject({ kind: 'USER', status: 'PENDING', email: '', tenantRole: TenantRole.MEMBER })

        expect((await requestSms({ phone: PHONE })).statusCode).toBe(204)
        const accepted = await verifySms({ phone: PHONE, code: sent[0] })
        expect(accepted.statusCode).toBe(200)
        expect(accepted.json().tenantId).toBe(ctx.tenant.id)

        const afterwards = await ctx.get('/v1/tenant-access/members')
        expect(afterwards.json().members.find((member: { phone: string | null }) => member.phone === PHONE)?.status).toBe('ACTIVE')
    })

    it('refuses phone invitations while the tenant has phone sign-in off', async () => {
        const invited = await ctx.post('/v1/tenant-access/members/invite', { emails: [], phones: [PHONE], tenantRole: TenantRole.MEMBER, modules: [] })

        expect(invited.statusCode).toBe(409)
        expect(await db.findOneBy('user_identity', { phone: PHONE })).toBeNull()
    })
})

describe('login security settings', () => {
    it('reports the two-step policy and the phone method', async () => {
        const updated = await ctx.post('/v1/tenant-access/login-security/mfa-policy', { mfaPolicy: 'REQUIRED' })
        expect(updated.statusCode).toBe(200)
        expect(updated.json()).toMatchObject({ mfaPolicy: 'REQUIRED', phoneAuthEnabled: false, smsDelivery: false })
        const phone = updated.json().methods.find((method: { method: string }) => method.method === 'PHONE_SMS')
        expect(phone).toEqual({ method: 'PHONE_SMS', available: false, configured: false, enabled: false })
    })
})

async function configureSms(): Promise<void> {
    await databaseConnection().getRepository('flag').save({
        id: 'SMS_SETTINGS',
        value: {
            provider: 'ALIYUN',
            accessKeyId: 'id',
            accessKeySecret: await encryptUtils.encryptString('secret'),
            signName: 'sign',
            templateCode: 'SMS_1',
            sdkAppId: null,
            region: null,
            verifiedAt: new Date().toISOString(),
        },
    })
}

async function createMember({ phone }: { phone?: string } = {}): Promise<Member> {
    const email = `member-${generateId().toLowerCase()}@example.com`
    const identityId = generateId()
    const userId = generateId()
    await db.save('user_identity', {
        id: identityId,
        email,
        password: bcrypt.hashSync(PASSWORD, 10),
        firstName: 'Second',
        lastName: 'Step',
        verified: true,
        provider: 'EMAIL',
        trackEvents: false,
        newsLetter: false,
        tokenVersion: generateId(),
        phone: phone ?? null,
        phoneVerified: phone !== undefined,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
    })
    await db.save('user', { id: userId, identityId, tenantId: ctx.tenant.id, tenantRole: TenantRole.MEMBER, status: UserStatus.ACTIVE, created: new Date().toISOString(), updated: new Date().toISOString() })
    await db.save('project', createMockProject({ tenantId: ctx.tenant.id, ownerId: userId, type: ProjectType.PERSONAL }))
    return { userId, identityId, email }
}

async function enable({ identityId }: { identityId: string }): Promise<string> {
    const secret = totp.generateSecret()
    await databaseConnection().getRepository('user_identity').update({ id: identityId }, {
        mfaEnabled: true,
        mfaSecret: JSON.stringify(await encryptUtils.encryptString(secret)),
        mfaRecoveryCodes: [],
    })
    return secret
}

async function resetSmsCounters(): Promise<void> {
    const digest = createHash('sha256').update(PHONE).digest('hex')
    await distributedStore.delete([`sms-resend:${digest}`, `sms-daily:${digest}`])
}

function codeFor({ secret, offset }: { secret: string, offset: number }): string {
    return totp.codeAtStep({ secret, step: totp.stepAt({ nowMs: Date.now() }) + offset })
}

function freshPhone(): string {
    return `+86139${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`
}

function wrongCodeFor(code: string): string {
    return ((Number.parseInt(code, 10) + 1) % 1000000).toString().padStart(6, '0')
}

function nextIp(): string {
    counter += 1
    return `10.8.${Math.floor(counter / 250)}.${(counter % 250) + 1}`
}

function signIn({ email }: { email: string }) {
    return app.inject({ method: 'POST', url: '/api/v1/authentication/sign-in', headers: { 'x-real-ip': nextIp() }, body: { email, password: PASSWORD } })
}

async function signInOk({ email }: { email: string }): Promise<string> {
    const response = await signIn({ email })
    expect(response.statusCode).toBe(200)
    return response.json().token
}

function post({ url, body, token }: { url: string, body: Record<string, unknown>, token?: string }) {
    return app.inject({
        method: 'POST',
        url: `/api${url}`,
        headers: { 'x-real-ip': nextIp(), ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
        body,
    })
}

async function requestSms({ phone }: { phone: string }) {
    return post({ url: '/v1/authentication/sms/request', body: { phone, captchaToken: await captchaHelper.solvedToken({ app }) } })
}

function verifySms({ phone, code }: { phone: string, code: string }) {
    return post({ url: '/v1/authentication/sms/verify', body: { phone, code } })
}

type Member = {
    userId: string
    identityId: string
    email: string
}
