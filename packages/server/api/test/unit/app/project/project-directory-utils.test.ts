import { DefaultProjectRole } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { projectCopyUtils } from '../../../../src/app/project/project-copy-utils'
import { projectDirectoryUtils } from '../../../../src/app/project/project-directory-utils'

describe('projectDirectoryUtils.resolveRole', () => {
    it('gives owners and tenant admins the owner role', () => {
        expect(projectDirectoryUtils.resolveRole({ userId: 'u1', ownerId: 'u1', isTenantAdmin: false, membershipRole: null })).toBe(DefaultProjectRole.ADMIN)
        expect(projectDirectoryUtils.resolveRole({ userId: 'u1', ownerId: 'u2', isTenantAdmin: true, membershipRole: null })).toBe(DefaultProjectRole.ADMIN)
    })

    it('uses the membership role, or no access', () => {
        expect(projectDirectoryUtils.resolveRole({ userId: 'u1', ownerId: 'u2', isTenantAdmin: false, membershipRole: DefaultProjectRole.VIEWER })).toBe(DefaultProjectRole.VIEWER)
        expect(projectDirectoryUtils.resolveRole({ userId: 'u1', ownerId: 'u2', isTenantAdmin: false, membershipRole: null })).toBeNull()
    })
})

describe('projectDirectoryUtils.memberCount', () => {
    it('counts the owner once even without a member row', () => {
        expect(projectDirectoryUtils.memberCount({ ownerId: 'o', memberUserIds: [] })).toBe(1)
        expect(projectDirectoryUtils.memberCount({ ownerId: 'o', memberUserIds: ['o', 'a', 'b'] })).toBe(3)
    })
})

describe('projectDirectoryUtils.displayName', () => {
    it('prefers the full name and falls back to the email', () => {
        expect(projectDirectoryUtils.displayName({ firstName: '明', lastName: '王', email: 'w@x.cn' })).toBe('明 王')
        expect(projectDirectoryUtils.displayName({ firstName: ' ', lastName: null, email: 'w@x.cn' })).toBe('w@x.cn')
    })
})

describe('projectCopyUtils.orderFoldersParentFirst', () => {
    it('orders folders so every parent comes before its children', () => {
        const ordered = projectCopyUtils.orderFoldersParentFirst([
            { id: 'c', parentId: 'b' },
            { id: 'a', parentId: null },
            { id: 'b', parentId: 'a' },
        ])
        expect(ordered.map((folder) => folder.id)).toEqual(['a', 'b', 'c'])
    })
})
