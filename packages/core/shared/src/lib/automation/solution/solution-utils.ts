import { isNil } from '@fema-ipaas/core-utils'
import { SOLUTION_TABLE_PLACEHOLDER_PREFIX, SolutionConfigItem, SolutionConfigType, SolutionPatch } from './solution'

export const solutionUtils = {
    resolveConfig,
    patchValue,
    versionNewer,
    nextVersion,
    capacityError,
    tablePlaceholder,
    isTablePlaceholder,
}

function resolveConfig({ items, provided }: { items: SolutionConfigItem[], provided: Record<string, string> }): ResolvedConfig {
    const values = Object.fromEntries(items.map((item) => [item.key, provided[item.key] ?? item.defaultValue]))
    const errors = items.flatMap((item): ConfigError[] => {
        const value = values[item.key] ?? ''
        if (item.type === SolutionConfigType.TEXT) {
            return value.trim().length === 0 ? [{ key: item.key, message: 'required' }] : []
        }
        return item.options.some((option) => option.value === value) ? [] : [{ key: item.key, message: 'invalidOption' }]
    })
    return { values, errors }
}

function patchValue({ patch, selected }: { patch: SolutionPatch, selected: string }): string {
    return patch.valueByOption?.[selected] ?? patch.value ?? selected
}

function versionNewer({ candidate, current }: { candidate: string, current: string }): boolean {
    const a = candidate.split('.').map((part) => Number(part) || 0)
    const b = current.split('.').map((part) => Number(part) || 0)
    const length = Math.max(a.length, b.length)
    for (let index = 0; index < length; index++) {
        const diff = (a[index] ?? 0) - (b[index] ?? 0)
        if (diff !== 0) {
            return diff > 0
        }
    }
    return false
}

function nextVersion(current: string): string {
    const [major, minor] = current.split('.').map((part) => Number(part) || 0)
    return `${major}.${(minor ?? 0) + 1}`
}

function capacityError({ limit, current, needed }: { limit: number | null | undefined, current: number, needed: number }): string | null {
    if (isNil(limit) || limit <= 0 || current + needed <= limit) {
        return null
    }
    return `Installing needs ${needed} workflow slots but this project has ${Math.max(0, limit - current)} left (${current} of ${limit} used)`
}

function tablePlaceholder(key: string): string {
    return `${SOLUTION_TABLE_PLACEHOLDER_PREFIX}${key}`
}

function isTablePlaceholder(value: string): boolean {
    return value.startsWith(SOLUTION_TABLE_PLACEHOLDER_PREFIX)
}

type ResolvedConfig = {
    values: Record<string, string>
    errors: ConfigError[]
}

type ConfigError = {
    key: string
    message: string
}
