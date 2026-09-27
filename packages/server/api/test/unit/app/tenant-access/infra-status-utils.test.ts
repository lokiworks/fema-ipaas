import { ComponentHealthLevel } from '@fema-ipaas/shared'
import { encryptionStatusUtils } from '../../../../src/app/core/security/encryption/encryption-status.service'
import { componentHealthUtils } from '../../../../src/app/health/component-health.service'
import { workerFleetUtils } from '../../../../src/app/workers/machine/worker-fleet.service'

describe('infrastructure status utils', () => {
    it('parses worker labels, dedupes them and keeps at most five', () => {
        expect(workerFleetUtils.parseLabels(undefined)).toEqual([])
        expect(workerFleetUtils.parseLabels('Intranet, gpu  gpu,a,b,c,d')).toEqual(['intranet', 'gpu', 'a', 'b', 'c'])
    })

    it('treats a worker as offline after sixty seconds without a heartbeat', () => {
        const now = '2026-01-01T00:01:30.000Z'
        expect(workerFleetUtils.isStale('2026-01-01T00:01:00.000Z', now)).toBe(false)
        expect(workerFleetUtils.isStale('2026-01-01T00:00:00.000Z', now)).toBe(true)
    })

    it('recommends rotating an encryption key only after ninety days', () => {
        expect(encryptionStatusUtils.rotationRecommended(null)).toBe(false)
        expect(encryptionStatusUtils.rotationRecommended(90)).toBe(false)
        expect(encryptionStatusUtils.rotationRecommended(91)).toBe(true)
    })

    it('fingerprints a key without revealing it', () => {
        const id = encryptionStatusUtils.fingerprint('0123456789abcdef0123456789abcdef')
        expect(id).toHaveLength(8)
        expect(id).not.toContain('0123')
    })

    it('grades the backup marker', () => {
        const now = '2026-01-10T00:00:00.000Z'
        expect(componentHealthUtils.backupLevel({ confirmedAt: null, now })).toBe(ComponentHealthLevel.NOT_CONFIGURED)
        expect(componentHealthUtils.backupLevel({ confirmedAt: '2026-01-08T00:00:00.000Z', now })).toBe(ComponentHealthLevel.OK)
        expect(componentHealthUtils.backupLevel({ confirmedAt: '2026-01-01T00:00:00.000Z', now })).toBe(ComponentHealthLevel.WARNING)
    })

    it('flags workers and triggers', () => {
        expect(componentHealthUtils.workersLevel({ online: 0, draining: 0, offline: 0, versionMismatched: 0 })).toBe(ComponentHealthLevel.ERROR)
        expect(componentHealthUtils.workersLevel({ online: 2, draining: 0, offline: 1, versionMismatched: 0 })).toBe(ComponentHealthLevel.WARNING)
        expect(componentHealthUtils.workersLevel({ online: 2, draining: 1, offline: 0, versionMismatched: 0 })).toBe(ComponentHealthLevel.OK)
        expect(componentHealthUtils.triggerLevel({ registered: 3, onlineWorkers: 0, queueOk: true })).toBe(ComponentHealthLevel.WARNING)
        expect(componentHealthUtils.triggerLevel({ registered: 3, onlineWorkers: 1, queueOk: false })).toBe(ComponentHealthLevel.ERROR)
        expect(componentHealthUtils.hostOf('https://registry.example.com/v1')).toBe('registry.example.com')
        expect(componentHealthUtils.hostOf('not a url')).toBeNull()
    })
})
