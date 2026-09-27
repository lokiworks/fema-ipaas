import { isNil } from '@fema-ipaas/core-utils'
import {
    INSTANCE_LIMIT_ENV_VARS,
    InstanceLimit,
    InstanceLimitKey,
    InstanceLimitSource,
    InstanceLimitUnit,
} from '@fema-ipaas/shared'
import { AppSystemProp, ENV_PREFIX, environmentVariables } from '../helper/system/system-props'
import { limitValueParsers } from './limit-value-parsers'

function resolve({ readEnv }: { readEnv: EnvReader }): ResolvedInstanceLimits {
    const runTimeout = firstDefined([
        sourced({ value: limitValueParsers.positiveInteger(readEnv(AppSystemProp.WORKFLOW_TIMEOUT_SECONDS)), source: InstanceLimitSource.LEGACY_ENV }),
        sourced({ value: limitValueParsers.durationSeconds(readEnv(AppSystemProp.RUN_TIMEOUT)), source: InstanceLimitSource.ENV }),
    ]) ?? { value: DEFAULT_RUN_TIMEOUT_SECONDS, source: InstanceLimitSource.DEFAULT }

    const logSizeMb = limitValueParsers.positiveInteger(readEnv(AppSystemProp.MAX_EXECUTION_LOG_SIZE_MB)) ?? DEFAULT_MAX_EXECUTION_LOG_SIZE_MB
    const explicitStepTimeout = limitValueParsers.durationSeconds(readEnv(AppSystemProp.STEP_TIMEOUT))
    const explicitStepPayload = limitValueParsers.sizeMegabytes(readEnv(AppSystemProp.MAX_STEP_PAYLOAD))

    const retention = firstDefined([
        sourced({ value: limitValueParsers.positiveInteger(readEnv(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS)), source: InstanceLimitSource.LEGACY_ENV }),
        sourced({ value: limitValueParsers.positiveInteger(readEnv(AppSystemProp.LOG_RETENTION_DAYS)), source: InstanceLimitSource.ENV }),
    ]) ?? { value: DEFAULT_LOG_RETENTION_DAYS, source: InstanceLimitSource.DEFAULT }

    return {
        [InstanceLimitKey.CONCURRENT_RUNS]: explicitOrDefault({ raw: readEnv(AppSystemProp.MAX_CONCURRENT_RUNS), fallback: DEFAULT_MAX_CONCURRENT_RUNS }),
        [InstanceLimitKey.RUNS_PER_MONTH]: explicitOrDefault({ raw: readEnv(AppSystemProp.MAX_RUNS_PER_MONTH), fallback: DEFAULT_MAX_RUNS_PER_MONTH }),
        [InstanceLimitKey.PROJECT_WORKFLOWS]: explicitOrDefault({ raw: readEnv(AppSystemProp.PROJECT_MAX_WORKFLOWS), fallback: DEFAULT_PROJECT_MAX_WORKFLOWS }),
        [InstanceLimitKey.NODES_PER_RUN]: explicitOrDefault({ raw: readEnv(AppSystemProp.MAX_NODES_PER_RUN), fallback: DEFAULT_MAX_NODES_PER_RUN }),
        [InstanceLimitKey.RUN_TIMEOUT]: runTimeout,
        [InstanceLimitKey.STEP_TIMEOUT]: isNil(explicitStepTimeout)
            ? { value: runTimeout.value, source: InstanceLimitSource.INHERITED }
            : { value: Math.min(explicitStepTimeout, runTimeout.value), source: InstanceLimitSource.ENV },
        [InstanceLimitKey.STEP_PAYLOAD]: isNil(explicitStepPayload)
            ? { value: logSizeMb, source: InstanceLimitSource.INHERITED }
            : { value: explicitStepPayload, source: InstanceLimitSource.ENV },
        [InstanceLimitKey.LOG_RETENTION]: retention,
    }
}

function describe({ resolved, usage }: { resolved: ResolvedInstanceLimits, usage: Partial<Record<InstanceLimitKey, number | null>> }): InstanceLimit[] {
    return Object.values(InstanceLimitKey).map((key) => ({
        key,
        value: resolved[key].value,
        unit: UNITS[key],
        envVar: INSTANCE_LIMIT_ENV_VARS[key],
        legacyEnvVar: LEGACY_ENV_VARS[key] ?? null,
        inheritedFromEnvVar: resolved[key].source === InstanceLimitSource.INHERITED ? INHERITED_FROM_ENV_VARS[key] ?? null : null,
        source: resolved[key].source,
        usage: usage[key] ?? null,
    }))
}

function current(): ResolvedInstanceLimits {
    return resolve({ readEnv: (prop) => environmentVariables.getEnvironment(prop) })
}

export const instanceLimits = {
    resolve,
    describe,
    current,
    concurrentRuns: (): number => current()[InstanceLimitKey.CONCURRENT_RUNS].value,
    runsPerMonth: (): number => current()[InstanceLimitKey.RUNS_PER_MONTH].value,
    projectWorkflows: (): number => current()[InstanceLimitKey.PROJECT_WORKFLOWS].value,
    nodesPerRun: (): number => current()[InstanceLimitKey.NODES_PER_RUN].value,
    stepTimeoutSeconds: (): number => current()[InstanceLimitKey.STEP_TIMEOUT].value,
    stepPayloadMb: (): number => current()[InstanceLimitKey.STEP_PAYLOAD].value,
    isExplicit: (key: InstanceLimitKey): boolean => current()[key].source === InstanceLimitSource.ENV,
}

function explicitOrDefault({ raw, fallback }: { raw: string | undefined, fallback: number }): ResolvedLimit {
    const parsed = limitValueParsers.positiveInteger(raw)
    return isNil(parsed) ? { value: fallback, source: InstanceLimitSource.DEFAULT } : { value: parsed, source: InstanceLimitSource.ENV }
}

function sourced({ value, source }: { value: number | null, source: InstanceLimitSource }): ResolvedLimit | null {
    return isNil(value) ? null : { value, source }
}

function firstDefined(candidates: (ResolvedLimit | null)[]): ResolvedLimit | null {
    return candidates.find((candidate): candidate is ResolvedLimit => !isNil(candidate)) ?? null
}

const DEFAULT_MAX_CONCURRENT_RUNS = 100
const DEFAULT_MAX_RUNS_PER_MONTH = 10_000_000
const DEFAULT_PROJECT_MAX_WORKFLOWS = 1000
const DEFAULT_MAX_NODES_PER_RUN = 40_000
const DEFAULT_RUN_TIMEOUT_SECONDS = 600
const DEFAULT_LOG_RETENTION_DAYS = 30
const DEFAULT_MAX_EXECUTION_LOG_SIZE_MB = 50

const UNITS: Record<InstanceLimitKey, InstanceLimitUnit> = {
    [InstanceLimitKey.CONCURRENT_RUNS]: InstanceLimitUnit.COUNT,
    [InstanceLimitKey.RUNS_PER_MONTH]: InstanceLimitUnit.COUNT,
    [InstanceLimitKey.PROJECT_WORKFLOWS]: InstanceLimitUnit.COUNT,
    [InstanceLimitKey.NODES_PER_RUN]: InstanceLimitUnit.COUNT,
    [InstanceLimitKey.RUN_TIMEOUT]: InstanceLimitUnit.SECONDS,
    [InstanceLimitKey.STEP_TIMEOUT]: InstanceLimitUnit.SECONDS,
    [InstanceLimitKey.STEP_PAYLOAD]: InstanceLimitUnit.MEGABYTES,
    [InstanceLimitKey.LOG_RETENTION]: InstanceLimitUnit.DAYS,
}

const LEGACY_ENV_VARS: Partial<Record<InstanceLimitKey, string>> = {
    [InstanceLimitKey.RUN_TIMEOUT]: `${ENV_PREFIX}${AppSystemProp.WORKFLOW_TIMEOUT_SECONDS}`,
    [InstanceLimitKey.LOG_RETENTION]: `${ENV_PREFIX}${AppSystemProp.EXECUTION_DATA_RETENTION_DAYS}`,
}

const INHERITED_FROM_ENV_VARS: Partial<Record<InstanceLimitKey, string>> = {
    [InstanceLimitKey.STEP_TIMEOUT]: `${ENV_PREFIX}${AppSystemProp.WORKFLOW_TIMEOUT_SECONDS}`,
    [InstanceLimitKey.STEP_PAYLOAD]: `${ENV_PREFIX}${AppSystemProp.MAX_EXECUTION_LOG_SIZE_MB}`,
}

type EnvReader = (prop: AppSystemProp) => string | undefined

type ResolvedLimit = {
    value: number
    source: InstanceLimitSource
}

export type ResolvedInstanceLimits = Record<InstanceLimitKey, ResolvedLimit>
