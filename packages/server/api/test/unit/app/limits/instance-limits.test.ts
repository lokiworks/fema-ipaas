import { InstanceLimitKey, InstanceLimitSource } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { instanceLimits, ResolvedInstanceLimits } from '../../../../src/app/limits/instance-limits'
import { limitValueParsers } from '../../../../src/app/limits/limit-value-parsers'

function resolveWith(env: Partial<Record<AppSystemProp, string>>): ResolvedInstanceLimits {
    return instanceLimits.resolve({ readEnv: (prop) => env[prop] })
}

describe('limitValueParsers', () => {
    it('parses positive integers with separators and rejects everything else', () => {
        expect(limitValueParsers.positiveInteger('10,000,000')).toBe(10000000)
        expect(limitValueParsers.positiveInteger('1_000')).toBe(1000)
        expect(limitValueParsers.positiveInteger('0')).toBeNull()
        expect(limitValueParsers.positiveInteger('-5')).toBeNull()
        expect(limitValueParsers.positiveInteger('1.5')).toBeNull()
        expect(limitValueParsers.positiveInteger(undefined)).toBeNull()
    })

    it('parses durations into seconds', () => {
        expect(limitValueParsers.durationSeconds('600')).toBe(600)
        expect(limitValueParsers.durationSeconds('600s')).toBe(600)
        expect(limitValueParsers.durationSeconds('30m')).toBe(1800)
        expect(limitValueParsers.durationSeconds('4h')).toBe(14400)
        expect(limitValueParsers.durationSeconds('1d')).toBe(86400)
        expect(limitValueParsers.durationSeconds('four hours')).toBeNull()
        expect(limitValueParsers.durationSeconds('0')).toBeNull()
    })

    it('parses sizes into megabytes', () => {
        expect(limitValueParsers.sizeMegabytes('4')).toBe(4)
        expect(limitValueParsers.sizeMegabytes('4MB')).toBe(4)
        expect(limitValueParsers.sizeMegabytes('512KB')).toBe(0.5)
        expect(limitValueParsers.sizeMegabytes('1g')).toBe(1024)
        expect(limitValueParsers.sizeMegabytes('big')).toBeNull()
    })
})

describe('instanceLimits.resolve', () => {
    it('keeps today\'s behaviour when nothing is configured', () => {
        const resolved = resolveWith({})
        expect(resolved[InstanceLimitKey.CONCURRENT_RUNS]).toEqual({ value: 100, source: InstanceLimitSource.DEFAULT })
        expect(resolved[InstanceLimitKey.RUNS_PER_MONTH]).toEqual({ value: 10000000, source: InstanceLimitSource.DEFAULT })
        expect(resolved[InstanceLimitKey.PROJECT_WORKFLOWS]).toEqual({ value: 1000, source: InstanceLimitSource.DEFAULT })
        expect(resolved[InstanceLimitKey.NODES_PER_RUN]).toEqual({ value: 40000, source: InstanceLimitSource.DEFAULT })
        expect(resolved[InstanceLimitKey.RUN_TIMEOUT]).toEqual({ value: 600, source: InstanceLimitSource.DEFAULT })
        expect(resolved[InstanceLimitKey.STEP_TIMEOUT]).toEqual({ value: 600, source: InstanceLimitSource.INHERITED })
        expect(resolved[InstanceLimitKey.STEP_PAYLOAD]).toEqual({ value: 50, source: InstanceLimitSource.INHERITED })
        expect(resolved[InstanceLimitKey.LOG_RETENTION]).toEqual({ value: 30, source: InstanceLimitSource.DEFAULT })
    })

    it('prefers the existing variables over their new aliases', () => {
        const resolved = resolveWith({
            [AppSystemProp.WORKFLOW_TIMEOUT_SECONDS]: '900',
            [AppSystemProp.RUN_TIMEOUT]: '4h',
            [AppSystemProp.EXECUTION_DATA_RETENTION_DAYS]: '14',
            [AppSystemProp.LOG_RETENTION_DAYS]: '60',
        })
        expect(resolved[InstanceLimitKey.RUN_TIMEOUT]).toEqual({ value: 900, source: InstanceLimitSource.LEGACY_ENV })
        expect(resolved[InstanceLimitKey.LOG_RETENTION]).toEqual({ value: 14, source: InstanceLimitSource.LEGACY_ENV })
    })

    it('reads the new aliases when the existing variables are unset', () => {
        const resolved = resolveWith({ [AppSystemProp.RUN_TIMEOUT]: '4h', [AppSystemProp.LOG_RETENTION_DAYS]: '60' })
        expect(resolved[InstanceLimitKey.RUN_TIMEOUT]).toEqual({ value: 14400, source: InstanceLimitSource.ENV })
        expect(resolved[InstanceLimitKey.STEP_TIMEOUT]).toEqual({ value: 14400, source: InstanceLimitSource.INHERITED })
        expect(resolved[InstanceLimitKey.LOG_RETENTION]).toEqual({ value: 60, source: InstanceLimitSource.ENV })
    })

    it('never lets the step timeout exceed the run timeout', () => {
        const resolved = resolveWith({ [AppSystemProp.WORKFLOW_TIMEOUT_SECONDS]: '300', [AppSystemProp.STEP_TIMEOUT]: '10m' })
        expect(resolved[InstanceLimitKey.STEP_TIMEOUT]).toEqual({ value: 300, source: InstanceLimitSource.ENV })
    })

    it('uses explicit values and ignores invalid ones', () => {
        const resolved = resolveWith({
            [AppSystemProp.MAX_CONCURRENT_RUNS]: '250',
            [AppSystemProp.PROJECT_MAX_WORKFLOWS]: 'lots',
            [AppSystemProp.MAX_STEP_PAYLOAD]: '4MB',
            [AppSystemProp.MAX_EXECUTION_LOG_SIZE_MB]: '80',
        })
        expect(resolved[InstanceLimitKey.CONCURRENT_RUNS]).toEqual({ value: 250, source: InstanceLimitSource.ENV })
        expect(resolved[InstanceLimitKey.PROJECT_WORKFLOWS]).toEqual({ value: 1000, source: InstanceLimitSource.DEFAULT })
        expect(resolved[InstanceLimitKey.STEP_PAYLOAD]).toEqual({ value: 4, source: InstanceLimitSource.ENV })
    })

    it('describes every limit with its variable names', () => {
        const described = instanceLimits.describe({ resolved: resolveWith({}), usage: { [InstanceLimitKey.CONCURRENT_RUNS]: 3 } })
        expect(described).toHaveLength(8)
        const runTimeout = described.find((limit) => limit.key === InstanceLimitKey.RUN_TIMEOUT)
        expect(runTimeout?.envVar).toBe('FEMA_RUN_TIMEOUT')
        expect(runTimeout?.legacyEnvVar).toBe('FEMA_WORKFLOW_TIMEOUT_SECONDS')
        const payload = described.find((limit) => limit.key === InstanceLimitKey.STEP_PAYLOAD)
        expect(payload?.inheritedFromEnvVar).toBe('FEMA_MAX_EXECUTION_LOG_SIZE_MB')
        expect(described.find((limit) => limit.key === InstanceLimitKey.CONCURRENT_RUNS)?.usage).toBe(3)
    })
})
