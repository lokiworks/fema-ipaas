import { connectionAccessUtils, ConnectionPermission, ConnectionScope, ConnectionSharePermission } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'

describe('connectionAccessUtils.resolvePermission', () => {
    const base = { id: 'c1', ownerId: 'owner', scope: ConnectionScope.PROJECT, projectIds: ['p1', 'p2'], preSelectForNewProjects: false, projectMembersPermission: null }

    it('gives the owner full control', () => {
        expect(connectionAccessUtils.resolvePermission({ connection: base, userId: 'owner', shares: [], memberProjectIds: [] })).toBe(ConnectionPermission.OWNER)
    })

    it('uses the share of the user', () => {
        const shares = [{ connectionId: 'c1', userId: 'u1', permission: ConnectionSharePermission.USE }]
        expect(connectionAccessUtils.resolvePermission({ connection: base, userId: 'u1', shares, memberProjectIds: [] })).toBe(ConnectionPermission.USE)
    })

    it('ignores shares of other connections and users', () => {
        const shares = [
            { connectionId: 'c2', userId: 'u1', permission: ConnectionSharePermission.EDIT },
            { connectionId: 'c1', userId: 'u2', permission: ConnectionSharePermission.EDIT },
        ]
        expect(connectionAccessUtils.resolvePermission({ connection: base, userId: 'u1', shares, memberProjectIds: ['p1'] })).toBeNull()
    })

    it('grants the project-member permission only to members of an available project', () => {
        const connection = { ...base, projectMembersPermission: ConnectionSharePermission.EDIT }
        expect(connectionAccessUtils.resolvePermission({ connection, userId: 'u1', shares: [], memberProjectIds: ['p2'] })).toBe(ConnectionPermission.EDIT)
        expect(connectionAccessUtils.resolvePermission({ connection, userId: 'u1', shares: [], memberProjectIds: ['p9'] })).toBeNull()
    })

    it('keeps the strongest of share and member access', () => {
        const connection = { ...base, projectMembersPermission: ConnectionSharePermission.USE }
        const shares = [{ connectionId: 'c1', userId: 'u1', permission: ConnectionSharePermission.EDIT }]
        expect(connectionAccessUtils.resolvePermission({ connection, userId: 'u1', shares, memberProjectIds: ['p1'] })).toBe(ConnectionPermission.EDIT)
    })

    it('treats all-projects connections as available to any member', () => {
        const connection = { ...base, scope: ConnectionScope.TENANT, preSelectForNewProjects: true, projectIds: [], projectMembersPermission: ConnectionSharePermission.USE }
        expect(connectionAccessUtils.resolvePermission({ connection, userId: 'u1', shares: [], memberProjectIds: ['anything'] })).toBe(ConnectionPermission.USE)
        expect(connectionAccessUtils.isAvailableInProject({ connection, projectId: 'new-project' })).toBe(true)
    })

    it('keeps legacy tenant connections limited to their listed projects', () => {
        const connection = { ...base, scope: ConnectionScope.TENANT, preSelectForNewProjects: false }
        expect(connectionAccessUtils.isAvailableInProject({ connection, projectId: 'p1' })).toBe(true)
        expect(connectionAccessUtils.isAvailableInProject({ connection, projectId: 'p3' })).toBe(false)
    })

    it('lets only owners and editors manage', () => {
        expect(connectionAccessUtils.canManage(ConnectionPermission.OWNER)).toBe(true)
        expect(connectionAccessUtils.canManage(ConnectionPermission.EDIT)).toBe(true)
        expect(connectionAccessUtils.canManage(ConnectionPermission.USE)).toBe(false)
        expect(connectionAccessUtils.canManage(null)).toBe(false)
    })
})
