import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, PersonalAccessTokenExpiry, ProjectType, TenantRole, User } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { createMockProject } from '../../../helpers/mocks'
import { Identity, Scope, securityWorld, World } from './world'

const ROLE_HOLDERS: readonly { identity: Identity, role: DefaultProjectRole }[] = [
    { identity: 'projectAdmin', role: DefaultProjectRole.ADMIN },
    { identity: 'developer', role: DefaultProjectRole.DEVELOPER },
    { identity: 'operator', role: DefaultProjectRole.OPERATOR },
    { identity: 'viewer', role: DefaultProjectRole.VIEWER },
]

async function freshTeamProject({ world, scope }: { world: World, scope?: Scope }): Promise<{ id: string }> {
    const info = world.scopes[scope ?? 'A']
    const project = createMockProject({
        tenantId: info.tenant.id,
        ownerId: info.ownerId,
        type: ProjectType.TEAM,
        displayName: `sec-${generateId()}`.slice(0, 20),
    })
    await db.save('project', project)
    if (info.scope === 'B') {
        const adminId = info.actor.userId
        if (adminId !== null) {
            await securityWorld.addMember({ userId: adminId, projectId: project.id, role: DefaultProjectRole.ADMIN })
        }
        return { id: project.id }
    }
    if (info.scope === 'T2') {
        return { id: project.id }
    }
    await Promise.all(ROLE_HOLDERS.map(async ({ identity, role }) => {
        const userId = world.actors[identity].userId
        if (userId !== null) {
            await securityWorld.addMember({ userId, projectId: project.id, role })
        }
    }))
    return { id: project.id }
}

async function tenantUser({ world, tenantRole, scope }: { world: World, tenantRole?: TenantRole, scope?: Scope }): Promise<User> {
    const user = await securityWorld.createTenantMember({ tenantId: world.scopes[scope ?? 'A'].tenant.id })
    if (tenantRole !== undefined && tenantRole !== TenantRole.MEMBER) {
        await db.update('user', user.id, { tenantRole })
    }
    return user
}

async function personalAccessToken({ world, identity }: { world: World, identity: Identity }): Promise<{ id: string, value: string }> {
    const response = await world.send({
        identity,
        request: { method: 'POST', url: '/v1/account/access-tokens', body: { name: `sec-${generateId()}`.slice(0, 20), expiry: PersonalAccessTokenExpiry.DAYS_30 } },
    })
    const body = response.json() as { token: { id: string }, value: string }
    return { id: body.token.id, value: body.value }
}

function tenantAdminIdentityOf({ scope }: { scope: Scope }): Identity {
    return scope === 'T2' ? 'otherTenantAdmin' : 'tenantAdmin'
}

export const identitySeed = {
    tenantAdminIdentityOf,
    freshTeamProject,
    tenantUser,
    personalAccessToken,
}
