import { SolutionConfigItem, SolutionConfigType, solutionUtils } from '../../src'

const leaveItem: SolutionConfigItem = {
    key: 'openAt',
    label: 'Open time',
    type: SolutionConfigType.RADIO,
    options: [{ value: 'day0', label: 'On the day' }, { value: 'day-1', label: 'The day before' }],
    defaultValue: 'day-1',
    affectsWorkflows: ['onboard'],
    patches: [],
}

const chatItem: SolutionConfigItem = {
    key: 'chat',
    label: 'Chat',
    type: SolutionConfigType.TEXT,
    options: [],
    defaultValue: '',
    affectsWorkflows: ['onboard'],
    patches: [],
}

describe('solutionUtils.resolveConfig', () => {
    it('falls back to the default and accepts a listed option', () => {
        expect(solutionUtils.resolveConfig({ items: [leaveItem], provided: {} })).toEqual({ values: { openAt: 'day-1' }, errors: [] })
        expect(solutionUtils.resolveConfig({ items: [leaveItem], provided: { openAt: 'day0' } }).values.openAt).toBe('day0')
    })

    it('rejects an option that is not listed and a blank required text', () => {
        const result = solutionUtils.resolveConfig({ items: [leaveItem, chatItem], provided: { openAt: 'later', chat: '  ' } })
        expect(result.errors).toEqual([{ key: 'openAt', message: 'invalidOption' }, { key: 'chat', message: 'required' }])
    })
})

describe('solutionUtils.patchValue', () => {
    it('prefers the value mapped from the chosen option, then a fixed value, then the choice itself', () => {
        expect(solutionUtils.patchValue({ patch: { workflowKey: 'w', stepName: 's', inputKey: 'k', valueByOption: { day0: '08:00' } }, selected: 'day0' })).toBe('08:00')
        expect(solutionUtils.patchValue({ patch: { workflowKey: 'w', stepName: 's', inputKey: 'k', value: 'fixed', valueByOption: { day0: 'x' } }, selected: 'other' })).toBe('fixed')
        expect(solutionUtils.patchValue({ patch: { workflowKey: 'w', stepName: 's', inputKey: 'k' }, selected: 'HR group' })).toBe('HR group')
    })
})

describe('solutionUtils versions', () => {
    it('compares dotted versions numerically', () => {
        expect(solutionUtils.versionNewer({ candidate: '1.10', current: '1.9' })).toBe(true)
        expect(solutionUtils.versionNewer({ candidate: '1.0', current: '1.0' })).toBe(false)
        expect(solutionUtils.versionNewer({ candidate: '1.2', current: '2.0' })).toBe(false)
    })

    it('bumps the minor number', () => {
        expect(solutionUtils.nextVersion('1.0')).toBe('1.1')
        expect(solutionUtils.nextVersion('1.9')).toBe('1.10')
    })
})

describe('solutionUtils.capacityError', () => {
    it('allows installs that fit and when there is no limit', () => {
        expect(solutionUtils.capacityError({ limit: 15, current: 12, needed: 3 })).toBeNull()
        expect(solutionUtils.capacityError({ limit: null, current: 99, needed: 3 })).toBeNull()
    })

    it('names the slots missing when the install would go over the limit', () => {
        expect(solutionUtils.capacityError({ limit: 15, current: 14, needed: 3 })).toContain('3 workflow slots')
        expect(solutionUtils.capacityError({ limit: 15, current: 14, needed: 3 })).toContain('1 left')
    })
})

describe('solutionUtils table placeholders', () => {
    it('round trips the table placeholder', () => {
        expect(solutionUtils.tablePlaceholder('dept')).toBe('table:dept')
        expect(solutionUtils.isTablePlaceholder('table:dept')).toBe(true)
        expect(solutionUtils.isTablePlaceholder('mt_123')).toBe(false)
    })
})
