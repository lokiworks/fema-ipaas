import { ConnectorTriggerSettings } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { triggerRunPolicyUtils } from '../../src/app/trigger/trigger-run-policy-utils'

function settingsWithKey(keyPath: string | null): ConnectorTriggerSettings {
    return {
        connectorName: '@fema-ipaas/connector-beisen',
        connectorVersion: '0.1.0',
        triggerName: 'onboarding_completed',
        input: {},
        propertySettings: {},
        ...(keyPath === null ? {} : { dedupe: { enabled: true, keyPath, windowSeconds: 3600 } }),
    } as unknown as ConnectorTriggerSettings
}

describe('triggerRunPolicyUtils.businessKeyOf', () => {
    it('reads the business key from the dedupe key path, plain or templated', () => {
        expect(triggerRunPolicyUtils.businessKeyOf({ settings: settingsWithKey('employee_id'), payload: { employee_id: 'XH20260918' } })).toBe('XH20260918')
        expect(triggerRunPolicyUtils.businessKeyOf({ settings: settingsWithKey('{{trigger.employee_id}}-{{trigger.effective_date}}'), payload: { employee_id: 'XH1', effective_date: '2026-10-08' } })).toBe('XH1-2026-10-08')
    })

    it('has no business key without a dedupe key, with an invalid one, or when the payload lacks it', () => {
        expect(triggerRunPolicyUtils.businessKeyOf({ settings: undefined, payload: { employee_id: 'XH1' } })).toBeNull()
        expect(triggerRunPolicyUtils.businessKeyOf({ settings: settingsWithKey(null), payload: { employee_id: 'XH1' } })).toBeNull()
        expect(triggerRunPolicyUtils.businessKeyOf({ settings: settingsWithKey('{{step_1.id}}'), payload: { id: 'x' } })).toBeNull()
        expect(triggerRunPolicyUtils.businessKeyOf({ settings: settingsWithKey('employee_id'), payload: {} })).toBeNull()
    })

    it('keeps the key within the column length', () => {
        const key = triggerRunPolicyUtils.businessKeyOf({ settings: settingsWithKey('id'), payload: { id: 'x'.repeat(400) } })
        expect(key?.length).toBe(255)
    })
})
