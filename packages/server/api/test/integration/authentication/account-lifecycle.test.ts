import { generateId } from '@fema-ipaas/core-utils'
import { InvitationStatus, InvitationType, PrincipalType, ProjectType, TenantRole, UserStatus } from '@fema-ipaas/shared'
import bcrypt from 'bcrypt'
import { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { generateMockToken } from '../../helpers/auth'
import { db } from '../../helpers/db'
import { createMockConnection, createMockProject, createMockUserInvitation } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
let ctx: TestContext
let counter = 0

beforeAll(async () => {
    app = await setupTestEnvironment()
    ctx = await createTestContext(app, { tenant: { emailAuthEnabled: true, passwordMinLength: 10, sessionDurationDays: 7, created: '2000-01-01T00:00:00.000Z' }, project: { type: ProjectType.TEAM } })
})

beforeEach(async () => {
    await databaseConnection().getRepository('tenant').update({ id: ctx.tenant.id }, { passwordMinLength: 10, sessionDurationDays: 7, emailAuthEnabled: true })
})

describe('session length', () => {
    it.each([1, 7, 30])('issues password sessions that last %i days when the tenant says so', async (days) => {
        const saved = await ctx.post('/v1/tenant-access/login-security', { sessionDurationDays: days })
        expect(saved.statusCode).toBe(200)
        const member = await createMember({ password: 'a-long-enough-password' })

        const response = await signIn({ email: member.email, password: 'a-long-enough-password' })

        expect(response.statusCode).toBe(200)
        const claims = jwt.decode(response.json().token)
        expect(typeof claims === 'object' && claims !== null ? Number(claims.exp) - Number(claims.iat) : 0).toBe(days * 86400)
    })

    it('rejects a session length that is not on the menu', async () => {
        const response = await ctx.post('/v1/tenant-access/login-security', { sessionDurationDays: 365 })

        expect(response.statusCode).toBe(400)
    })
})

describe('password policy', () => {
    it('rejects a new password shorter than the tenant minimum and accepts one that is long enough', async () => {
        await ctx.post('/v1/tenant-access/login-security', { passwordMinLength: 14 })
        const email = `invited-${generateId().toLowerCase()}@example.com`
        await db.save('user_invitation', { ...createMockUserInvitation({ email, tenantId: ctx.tenant.id, projectId: null, type: InvitationType.TENANT, status: InvitationStatus.ACCEPTED }), tenantRole: TenantRole.MEMBER, projectRoleId: null })

        const tooShort = await app.inject({ method: 'POST', url: '/api/v1/authentication/sign-up', headers: { 'x-real-ip': nextIp() }, body: signUpBody({ email, password: 'only-12-chars' }) })
        const longEnough = await app.inject({ method: 'POST', url: '/api/v1/authentication/sign-up', headers: { 'x-real-ip': nextIp() }, body: signUpBody({ email, password: 'this-is-long-enough' }) })

        expect(tooShort.statusCode).toBe(409)
        expect(tooShort.json().params.message).toContain('14')
        expect(longEnough.statusCode).toBe(200)
    })

    it('never lets the administrator set a minimum below the platform floor', async () => {
        const response = await ctx.post('/v1/tenant-access/login-security', { passwordMinLength: 4 })

        expect(response.statusCode).toBe(400)
    })

    it('makes the temporary password an administrator hands out at least as long as the minimum, and ends the old sessions', async () => {
        await ctx.post('/v1/tenant-access/login-security', { passwordMinLength: 20 })
        const member = await createMember({ password: 'a-long-enough-password' })
        const before = await signIn({ email: member.email, password: 'a-long-enough-password' })

        const reset = await ctx.post(`/v1/tenant-access/members/${member.userId}/reset-password`)

        expect(reset.statusCode).toBe(200)
        expect(String(reset.json().temporaryPassword).length).toBeGreaterThanOrEqual(20)
        const oldSession = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${before.json().token}` } })
        expect(oldSession.statusCode).toBe(403)
        const oldPassword = await signIn({ email: member.email, password: 'a-long-enough-password' })
        expect(oldPassword.statusCode).toBe(401)
        const temporary = await signIn({ email: member.email, password: reset.json().temporaryPassword })
        expect(temporary.statusCode).toBe(200)
    })
})

describe('leaving the company', () => {
    it('ends the session of a user who is deleted', async () => {
        const member = await createMember({ password: 'a-long-enough-password' })
        const token = await tokenFor({ userId: member.userId })
        expect((await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200)

        const removed = await ctx.delete(`/v1/tenant-access/members/${member.userId}`)

        expect(removed.statusCode).toBe(204)
        const after = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${token}` } })
        expect(after.statusCode).toBe(401)
    })

    it('refuses to remove a user who still owns resources until someone takes them over, then moves them', async () => {
        const member = await createMember({ password: 'a-long-enough-password' })
        const connection = createMockConnection({ displayName: 'offboarding-connection', projectIds: [ctx.project.id] }, member.userId)
        await db.save('connection', { ...connection, tenantId: ctx.tenant.id })

        const refused = await ctx.delete(`/v1/tenant-access/members/${member.userId}`)
        expect(refused.statusCode).toBe(409)

        const removed = await ctx.delete(`/v1/tenant-access/members/${member.userId}`, undefined, { query: { transferToUserId: ctx.user.id } })
        expect(removed.statusCode).toBe(204)
        const moved = await db.findOneBy<{ ownerId: string }>('connection', { id: connection.id })
        expect(moved?.ownerId).toBe(ctx.user.id)
    })

    it('takes effect immediately when an administrator changes a role and leaves an audit trail', async () => {
        const member = await createMember({ password: 'a-long-enough-password' })
        const token = await tokenFor({ userId: member.userId })
        const adminRoute = () => app.inject({ method: 'GET', url: '/api/v1/tenant-access/members', headers: { authorization: `Bearer ${token}` } })
        expect((await adminRoute()).statusCode).toBe(403)

        const promoted = await ctx.post(`/v1/tenant-access/members/${member.userId}/access`, { tenantRole: TenantRole.ADMIN })
        expect(promoted.statusCode).toBe(200)
        expect((await adminRoute()).statusCode).toBe(200)

        const demoted = await ctx.post(`/v1/tenant-access/members/${member.userId}/access`, { tenantRole: TenantRole.MEMBER })
        expect(demoted.statusCode).toBe(200)
        expect((await adminRoute()).statusCode).toBe(403)

        await ctx.post(`/v1/tenant-access/members/${member.userId}/disable`)
        await ctx.delete(`/v1/tenant-access/members/${member.userId}`)
        await waitFor(async () => {
            const changed = await listAudit('tenant.user.access.changed')
            const removed = await listAudit('tenant.user.removed')
            const details = changed.map((event) => `${event.data.target} ${event.data.detail}`).join('|')
            return details.includes(`${member.email} ${TenantRole.ADMIN}`) && details.includes(`${member.email} disabled`) && removed.length > 0
        })
    })

    it('lets the administrator disable several users one after another and every one of them is shut out', async () => {
        const members = await Promise.all([createMember({ password: 'a-long-enough-password' }), createMember({ password: 'a-long-enough-password' }), createMember({ password: 'a-long-enough-password' })])
        const tokens = await Promise.all(members.map((member) => tokenFor({ userId: member.userId })))

        const results = await Promise.all(members.map((member) => ctx.post(`/v1/tenant-access/members/${member.userId}/disable`)))

        expect(results.map((result) => result.statusCode)).toEqual([200, 200, 200])
        for (const token of tokens) {
            const response = await app.inject({ method: 'GET', url: '/api/v1/tenant-access/me', headers: { authorization: `Bearer ${token}` } })
            expect(response.statusCode).toBe(403)
        }
        for (const member of members) {
            const stored = await db.findOneBy<{ status: UserStatus }>('user', { id: member.userId })
            expect(stored?.status).toBe(UserStatus.INACTIVE)
        }
    })
})

async function createMember({ password }: { password: string }): Promise<{ userId: string, email: string }> {
    const email = `member-${generateId().toLowerCase()}@example.com`
    const identityId = generateId()
    const userId = generateId()
    await db.save('user_identity', { id: identityId, email, password: bcrypt.hashSync(password, 10), firstName: 'Life', lastName: 'Cycle', verified: true, provider: 'EMAIL', trackEvents: false, newsLetter: false, tokenVersion: generateId(), created: new Date().toISOString(), updated: new Date().toISOString() })
    await db.save('user', { id: userId, identityId, tenantId: ctx.tenant.id, tenantRole: TenantRole.MEMBER, status: UserStatus.ACTIVE, created: new Date().toISOString(), updated: new Date().toISOString() })
    await db.save('project', createMockProject({ tenantId: ctx.tenant.id, ownerId: userId, type: ProjectType.PERSONAL }))
    return { userId, email }
}

function signIn({ email, password }: { email: string, password: string }) {
    return app.inject({ method: 'POST', url: '/api/v1/authentication/sign-in', headers: { 'x-real-ip': nextIp() }, body: { email, password } })
}

function signUpBody({ email, password }: { email: string, password: string }): Record<string, unknown> {
    return { email, password, firstName: 'New', lastName: 'Hire', trackEvents: false, newsLetter: false }
}

async function tokenFor({ userId }: { userId: string }): Promise<string> {
    const user = await db.findOneBy<{ identityId: string }>('user', { id: userId })
    const userIdentity = await db.findOneBy<{ tokenVersion: string }>('user_identity', { id: user?.identityId ?? '' })
    return generateMockToken({ id: userId, type: PrincipalType.USER, tenant: { id: ctx.tenant.id }, tokenVersion: userIdentity?.tokenVersion })
}

async function listAudit(action: string): Promise<{ data: Record<string, unknown> & { target?: string, detail?: string } }[]> {
    const rows = await databaseConnection().getRepository('audit_event').find({ where: { action, tenantId: ctx.tenant.id } })
    return rows.map((row) => ({ data: row.data }))
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

function nextIp(): string {
    counter += 1
    return `10.9.${Math.floor(counter / 250)}.${(counter % 250) + 1}`
}
