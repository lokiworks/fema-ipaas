import { Permission } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, rolePermissions } from '../../src/index'

describe('project role permissions', () => {
    it('gives every role a permission set', () => {
        for (const role of Object.values(DefaultProjectRole)) {
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
            Permission.WRITE_PROJECT_MEMBER,
            Permission.WRITE_PROJECT,
            Permission.MANAGE_CONNECTOR,
            Permission.READ_AUDIT,
        ]
        for (const permission of writePermissions) {
            expect(rolePermissions[DefaultProjectRole.VIEWER]).not.toContain(permission)
        }
    })

    it('escalates strictly from viewer to operator to developer to admin', () => {
        const ladder = [
            DefaultProjectRole.VIEWER,
            DefaultProjectRole.OPERATOR,
            DefaultProjectRole.DEVELOPER,
            DefaultProjectRole.ADMIN,
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

    it('keeps project administration out of the developer role', () => {
        expect(rolePermissions[DefaultProjectRole.DEVELOPER]).not.toContain(Permission.WRITE_PROJECT_MEMBER)
        expect(rolePermissions[DefaultProjectRole.DEVELOPER]).not.toContain(Permission.WRITE_PROJECT)
    })

    it('keeps workflow authoring out of the operator role', () => {
        expect(rolePermissions[DefaultProjectRole.OPERATOR]).not.toContain(Permission.WRITE_WORKFLOW)
        expect(rolePermissions[DefaultProjectRole.OPERATOR]).toContain(Permission.UPDATE_WORKFLOW_STATUS)
    })

    it('uses the RESOURCE:ACTION vocabulary from the design doc', () => {
        for (const permission of Object.values(Permission)) {
            expect(permission).toMatch(/^[A-Z_]+:[A-Z_]+$/)
        }
    })
})
