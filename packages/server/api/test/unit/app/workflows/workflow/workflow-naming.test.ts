import { describe, expect, it } from 'vitest'
import { workflowNameUtils } from '../../../../../src/app/workflows/workflow/workflow-naming'

describe('workflowNameUtils', () => {
    it('detects taken names case-insensitively and ignoring surrounding spaces', () => {
        expect(workflowNameUtils.isTaken({ name: ' Daily report ', taken: ['daily REPORT'] })).toBe(true)
        expect(workflowNameUtils.isTaken({ name: 'Daily', taken: ['daily report'] })).toBe(false)
    })

    it('keeps a free name and suffixes a taken one with the next free number', () => {
        expect(workflowNameUtils.withSuffix({ base: '入职开通', taken: [] })).toBe('入职开通')
        expect(workflowNameUtils.withSuffix({ base: '入职开通', taken: ['入职开通', '入职开通 (2)'] })).toBe('入职开通 (3)')
    })

    it('never exceeds the 100 character limit', () => {
        const long = 'x'.repeat(120)
        const unique = workflowNameUtils.withSuffix({ base: long, taken: ['x'.repeat(100)] })
        expect(unique.length).toBeLessThanOrEqual(100)
        expect(unique.endsWith('(2)')).toBe(true)
    })
})
