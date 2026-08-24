import { Permission } from '@fema-ipaas/core-utils'
import { DefaultWorkspaceRole, rolePermissions } from '../../src/index'

describe('workspace role permissions', () => {
    it('gives every role a permission set', () => {
        for (const role of Object.values(DefaultWorkspaceRole)) {
            expect(rolePermissions[role].length).toBeGreaterThan(0)
        }
    })

    it('never grants a write permission to a viewer', () => {
        const writePermissions = [
            Permission.WRITE_WORKFLOW,
            Permission.DELETE_WORKFLOW,
            Permission.PUBLISH_WORKFLOW,
            Permission.WRITE_CONNECTION,
            Permission.WRITE_RUN,
            Permission.WRITE_VARIABLE,
            Permission.WRITE_WORKSPACE_MEMBER,
            Permission.WRITE_WORKSPACE,
            Permission.MANAGE_CONNECTOR,
            Permission.READ_AUDIT,
        ]
        for (const permission of writePermissions) {
            expect(rolePermissions[DefaultWorkspaceRole.VIEWER]).not.toContain(permission)
        }
    })

    it('escalates strictly from viewer to operator to developer to admin', () => {
        const ladder = [
            DefaultWorkspaceRole.VIEWER,
            DefaultWorkspaceRole.OPERATOR,
            DefaultWorkspaceRole.DEVELOPER,
            DefaultWorkspaceRole.ADMIN,
        ]
        for (let index = 1; index < ladder.length; index++) {
            const lower = new Set(rolePermissions[ladder[index - 1]])
            const higher = new Set(rolePermissions[ladder[index]])
            for (const permission of lower) {
                expect(higher).toContain(permission)
            }
            expect(higher.size).toBeGreaterThan(lower.size)
        }
    })

    it('keeps workspace administration out of the developer role', () => {
        expect(rolePermissions[DefaultWorkspaceRole.DEVELOPER]).not.toContain(Permission.WRITE_WORKSPACE_MEMBER)
        expect(rolePermissions[DefaultWorkspaceRole.DEVELOPER]).not.toContain(Permission.WRITE_WORKSPACE)
    })

    it('keeps workflow authoring out of the operator role', () => {
        expect(rolePermissions[DefaultWorkspaceRole.OPERATOR]).not.toContain(Permission.WRITE_WORKFLOW)
        expect(rolePermissions[DefaultWorkspaceRole.OPERATOR]).toContain(Permission.UPDATE_WORKFLOW_STATUS)
    })

    it('uses the RESOURCE:ACTION vocabulary from the design doc', () => {
        for (const permission of Object.values(Permission)) {
            expect(permission).toMatch(/^[A-Z_]+:[A-Z_]+$/)
        }
    })
})
