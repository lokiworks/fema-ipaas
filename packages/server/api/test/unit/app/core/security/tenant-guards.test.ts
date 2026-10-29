import { ApplicationError, ErrorCode, tryCatchSync } from '@fema-ipaas/core-utils'
import { ProjectType } from '@fema-ipaas/shared'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../src/app/project/project-service', () => ({ projectService: vi.fn() }))
vi.mock('../../../../../src/app/user/user-service', () => ({ userService: vi.fn() }))

const { PERSONAL_PROJECT_HAS_NO_MEMBERS, tenantGuards } = await import('../../../../../src/app/core/security/tenant-guards')

function errorOf(run: () => void): ApplicationError | null {
    const { error } = tryCatchSync(run)
    return error instanceof ApplicationError ? error : null
}

describe('tenantGuards.assertTeamProject', () => {
    it('lets team projects through', () => {
        expect(errorOf(() => tenantGuards.assertTeamProject({ project: { type: ProjectType.TEAM } }))).toBeNull()
    })

    it('rejects a personal project with a validation code and a message key the web app can translate', () => {
        const error = errorOf(() => tenantGuards.assertTeamProject({ project: { type: ProjectType.PERSONAL } }))
        expect(error?.error.code).toBe(ErrorCode.VALIDATION)
        expect(error?.error.params).toMatchObject({ messageKey: PERSONAL_PROJECT_HAS_NO_MEMBERS })
    })

    it('keeps treating a missing project as an authorization failure', () => {
        const error = errorOf(() => tenantGuards.assertTeamProject({ project: null }))
        expect(error?.error.code).toBe(ErrorCode.AUTHORIZATION)
    })
})
