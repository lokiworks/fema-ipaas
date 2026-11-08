import { Permission } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, ProjectAccessRequestStatus } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { identitySeed } from '../support/identity-seed'
import { MatrixCase, MatrixHookParams } from '../support/matrix'
import { Identity } from '../support/world'

const PROJECT_REVIEWERS: readonly Identity[] = ['projectAdmin', 'tenantAdmin']
const PROJECT_B_REVIEWERS: readonly Identity[] = ['foreignProjectAdmin', 'tenantAdmin']

async function requestStatus({ prepared }: Pick<MatrixHookParams, 'prepared'>): Promise<string | undefined> {
    const row = await db.findOneBy<{ status: string }>('project_access_request', { id: String(prepared.state?.requestId) })
    return row?.status
}

async function expectStillPending({ prepared }: MatrixHookParams): Promise<void> {
    expect(await requestStatus({ prepared })).toBe(ProjectAccessRequestStatus.PENDING)
    expect(await db.findOneBy('project_member', { userId: String(prepared.state?.requesterId) })).toBeNull()
}

export const identityAccessRequestCases: MatrixCase[] = [
    {
        id: 'POST /v1/project-access-requests',
        label: 'only a tenant member who is not yet in the project can ask, and the request is recorded for the caller',
        access: { type: 'custom', allow: ['nonMember', 'foreignProjectAdmin'] },
        crossScope: true,
        expectOk: [201],
        alsoDeniedWith: [409],
        prepare: async ({ world, scope }) => {
            const project = await identitySeed.freshTeamProject({ world, scope })
            return { request: { method: 'POST', url: '/v1/project-access-requests', body: { projectId: project.id, reason: 'sec-audit' } }, state: { projectId: project.id } }
        },
        afterDenied: async ({ prepared, world, identity }) => {
            const userId = world.actors[identity].userId
            if (userId !== null) {
                expect(await db.findOneBy('project_access_request', { projectId: String(prepared.state?.projectId), userId })).toBeNull()
            }
        },
        afterAllowed: async ({ prepared, world, identity }) => {
            const row = await db.findOneBy<{ userId: string, status: string }>('project_access_request', { projectId: String(prepared.state?.projectId), userId: String(world.actors[identity].userId) })
            expect(row?.status).toBe(ProjectAccessRequestStatus.PENDING)
        },
    },
    {
        id: 'GET /v1/project-access-requests/me',
        access: { type: 'authenticated' },
        prepare: async ({ world }) => {
            const request = await identitySeed.pendingAccessRequest({ world, scope: 'A', requesterId: String(world.actors.nonMember.userId) })
            return { request: { method: 'GET', url: '/v1/project-access-requests/me' }, state: { requestId: request.id } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            if (identity === 'nonMember') {
                expect(response.text).toContain(String(prepared.state?.requestId))
            }
            else {
                expect(response.text).not.toContain(String(prepared.state?.requestId))
            }
        },
    },
    {
        id: 'GET /v1/project-access-requests/to-review',
        access: { type: 'authenticated' },
        prepare: async ({ world }) => {
            const onA = await identitySeed.pendingAccessRequest({ world, scope: 'A' })
            const onB = await identitySeed.pendingAccessRequest({ world, scope: 'B' })
            const onT2 = await identitySeed.pendingAccessRequest({ world, scope: 'T2' })
            return { request: { method: 'GET', url: '/v1/project-access-requests/to-review' }, state: { requestIdA: onA.id, requestIdB: onB.id, requestIdT2: onT2.id } }
        },
        afterAllowed: async ({ identity, response, prepared }) => {
            const seesA = PROJECT_REVIEWERS.includes(identity)
            const seesB = PROJECT_B_REVIEWERS.includes(identity)
            expect(response.text.includes(String(prepared.state?.requestIdA))).toBe(seesA)
            expect(response.text.includes(String(prepared.state?.requestIdB))).toBe(seesB)
            expect(response.text.includes(String(prepared.state?.requestIdT2))).toBe(identity === 'otherTenantAdmin')
        },
    },
    {
        id: 'POST /v1/project-access-requests/:id/withdraw',
        label: 'only the person who asked can withdraw, anyone else gets not found',
        access: { type: 'custom', allow: ['nonMember'] },
        prepare: async ({ world }) => {
            const request = await identitySeed.pendingAccessRequest({ world, scope: 'A', requesterId: String(world.actors.nonMember.userId) })
            return { request: { method: 'POST', url: `/v1/project-access-requests/${request.id}/withdraw` }, state: { requestId: request.id, requesterId: request.requesterId } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await requestStatus({ prepared })).toBe(ProjectAccessRequestStatus.PENDING)
        },
        afterAllowed: async ({ prepared }) => {
            expect(await requestStatus({ prepared })).toBe(ProjectAccessRequestStatus.WITHDRAWN)
        },
    },
    {
        id: 'GET /v1/project-access-requests',
        access: { type: 'project', permission: Permission.WRITE_PROJECT_MEMBER },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const request = await identitySeed.pendingAccessRequest({ world, scope })
            return { request: { method: 'GET', url: '/v1/project-access-requests', query: { projectId: world.scopes[scope].project.id } }, state: { requestId: request.id } }
        },
        afterAllowed: async ({ response, prepared }) => {
            expect(response.text).toContain(String(prepared.state?.requestId))
        },
    },
    {
        id: 'POST /v1/project-access-requests/:id/approve',
        access: { type: 'project', permission: Permission.WRITE_PROJECT_MEMBER },
        prepare: async ({ world, scope }) => {
            const request = await identitySeed.pendingAccessRequest({ world, scope })
            return { request: { method: 'POST', url: `/v1/project-access-requests/${request.id}/approve`, body: { role: DefaultProjectRole.VIEWER } }, state: { requestId: request.id, requesterId: request.requesterId } }
        },
        afterDenied: expectStillPending,
        afterAllowed: async ({ prepared }) => {
            expect(await requestStatus({ prepared })).toBe(ProjectAccessRequestStatus.APPROVED)
            expect(await db.findOneBy('project_member', { userId: String(prepared.state?.requesterId) })).not.toBeNull()
        },
    },
    {
        id: 'POST /v1/project-access-requests/:id/reject',
        access: { type: 'project', permission: Permission.WRITE_PROJECT_MEMBER },
        prepare: async ({ world, scope }) => {
            const request = await identitySeed.pendingAccessRequest({ world, scope })
            return { request: { method: 'POST', url: `/v1/project-access-requests/${request.id}/reject` }, state: { requestId: request.id, requesterId: request.requesterId } }
        },
        afterDenied: expectStillPending,
        afterAllowed: async ({ prepared }) => {
            expect(await requestStatus({ prepared })).toBe(ProjectAccessRequestStatus.REJECTED)
            expect(await db.findOneBy('project_member', { userId: String(prepared.state?.requesterId) })).toBeNull()
        },
    },
]
