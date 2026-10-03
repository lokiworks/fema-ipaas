import { ConnectionSharePermission } from '@fema-ipaas/shared'
import { ALL_IDENTITIES, Identity, World } from '../support/world'

function exposurePermission({ exposure }: { exposure: Exposure }): ConnectionSharePermission | null {
    switch (exposure) {
        case 'private':
            return null
        case 'use':
            return ConnectionSharePermission.USE
        case 'edit':
            return ConnectionSharePermission.EDIT
    }
}

function seeSet({ exposure }: { exposure: Exposure }): Identity[] {
    return exposure === 'private' ? ['tenantAdmin'] : ['tenantAdmin', 'projectAdmin', 'developer', 'operator', 'viewer']
}

function manageSet({ exposure }: { exposure: Exposure }): Identity[] {
    return exposure === 'edit' ? ['tenantAdmin', 'projectAdmin', 'developer'] : ['tenantAdmin']
}

function allowedFor({ exposure, need }: { exposure: Exposure, need: Need }): Identity[] {
    switch (need) {
        case 'see':
            return seeSet({ exposure })
        case 'manage':
            return manageSet({ exposure })
        case 'owner':
            return ['tenantAdmin']
    }
}

function deniedOnly({ allowed }: { allowed: readonly Identity[] }): Identity[] {
    return ALL_IDENTITIES.filter((identity) => !allowed.includes(identity))
}

function tenantOneIdentifiers({ world }: { world: World }): string[] {
    const users = (['projectAdmin', 'developer', 'operator', 'viewer', 'nonMember', 'foreignProjectAdmin', 'tenantAdmin'] as const).map((identity) => world.actors[identity].userId)
    return [world.scopes.A.tenant.id, world.scopes.A.project.id, world.scopes.B.project.id, ...users.filter((userId): userId is string => userId !== null)]
}

function selfTenantForbiddenIds({ world, identity }: { world: World, identity: Identity }): string[] {
    if (identity === 'otherTenantAdmin') {
        return tenantOneIdentifiers({ world })
    }
    return [world.scopes.T2.project.id, world.scopes.T2.tenant.id]
}

export const SAME_TENANT_IDENTITIES: readonly Identity[] = ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin', 'nonMember', 'foreignProjectAdmin']
export const EVERY_TENANT_USER: readonly Identity[] = [...SAME_TENANT_IDENTITIES, 'otherTenantAdmin']
export const EXPOSURES: readonly Exposure[] = ['private', 'use', 'edit']

export const integrationsCommon = {
    exposurePermission,
    allowedFor,
    deniedOnly,
    selfTenantForbiddenIds,
}

export type Exposure = 'private' | 'use' | 'edit'

export type Need = 'see' | 'manage' | 'owner'
