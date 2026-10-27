import { describe, expect, it } from 'vitest'
import { ListExecutionsRequestQuery } from '../../src/lib/execution/dto/list-executions-request'

const PROJECT_ID = 'Ab12Cd34Ef56Gh78Ij90K'

describe('ListExecutionsRequestQuery.excludeStepTests', () => {
    it('parses the query string flag into a boolean', () => {
        const parsed = ListExecutionsRequestQuery.parse({ projectId: PROJECT_ID, excludeStepTests: 'true' })

        expect(parsed.excludeStepTests).toBe(true)
    })

    it('defaults to undefined so existing callers keep seeing every run', () => {
        const parsed = ListExecutionsRequestQuery.parse({ projectId: PROJECT_ID })

        expect(parsed.excludeStepTests).toBeUndefined()
    })

    it('treats false as false', () => {
        const parsed = ListExecutionsRequestQuery.parse({ projectId: PROJECT_ID, excludeStepTests: 'false' })

        expect(parsed.excludeStepTests).toBe(false)
    })
})
