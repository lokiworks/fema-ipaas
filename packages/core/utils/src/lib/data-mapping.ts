import { z } from 'zod/mini'

export enum MappingTransformType {
    TRIM = 'TRIM',
    NUMBER = 'NUMBER',
    STRING = 'STRING',
    DATE = 'DATE',
    DEFAULT = 'DEFAULT',
    LOOKUP = 'LOOKUP',
    ROUND = 'ROUND',
    UPPER = 'UPPER',
    LOWER = 'LOWER',
    SPLIT = 'SPLIT',
}

export enum MappingMissingBehavior {
    ERROR = 'ERROR',
    DEFAULT = 'DEFAULT',
    PASSTHROUGH = 'PASSTHROUGH',
}

export const MappingTransform = z.object({
    type: z.enum(MappingTransformType),
    arg: z.optional(z.string()),
})
export type MappingTransform = z.infer<typeof MappingTransform>

export const MappingItemRow = z.object({
    id: z.string(),
    target: z.string(),
    itemPath: z.optional(z.string()),
    constant: z.optional(z.unknown()),
    transforms: z.array(MappingTransform),
})
export type MappingItemRow = z.infer<typeof MappingItemRow>

export const MappingRow = z.object({
    id: z.string(),
    target: z.string(),
    source: z.optional(z.unknown()),
    constant: z.optional(z.unknown()),
    transforms: z.array(MappingTransform),
    each: z.optional(z.array(MappingItemRow)),
})
export type MappingRow = z.infer<typeof MappingRow>

export const MappingSpec = z.object({
    fields: z.array(MappingRow),
})
export type MappingSpec = z.infer<typeof MappingSpec>

export const MappingTableData = z.object({
    id: z.string(),
    name: z.string(),
    rows: z.array(z.object({ k: z.string(), v: z.string() })),
    missingBehavior: z.enum(MappingMissingBehavior),
    defaultValue: z.nullable(z.string()),
})
export type MappingTableData = z.infer<typeof MappingTableData>

export const dataMapping = {
    evaluate,
    applyTransform,
    lookupTableIds,
    readPath,
}

function evaluate({ spec, tables }: EvaluateParams): MappingResult {
    const rows = spec.fields
        .filter((row) => row.target.trim().length > 0)
        .map((row) => evaluateRow({ row, tables }))
    return {
        value: Object.fromEntries(rows.map((row) => [row.target, row.value])),
        rows,
    }
}

function evaluateRow({ row, tables }: { row: MappingRow, tables: MappingTableData[] }): MappingRowResult {
    const initial = row.source === undefined || row.source === '' ? row.constant : row.source
    if (row.each !== undefined) {
        return evaluateEach({ row, list: initial, tables })
    }
    const { value, error } = runTransforms({ value: initial, transforms: row.transforms, tables })
    return { id: row.id, target: row.target, value, error }
}

function evaluateEach({ row, list, tables }: { row: MappingRow, list: unknown, tables: MappingTableData[] }): MappingRowResult {
    if (!Array.isArray(list)) {
        return { id: row.id, target: row.target, value: [], error: 'Source is not a list' }
    }
    const items = list.map((item: unknown, index) => {
        const fields = (row.each ?? []).filter((field) => field.target.trim().length > 0).map((field) => {
            const raw = field.itemPath === undefined || field.itemPath.length === 0 ? field.constant : readPath({ root: item, path: field.itemPath })
            const result = runTransforms({ value: raw, transforms: field.transforms, tables })
            return { target: field.target, value: result.value, error: result.error === null ? null : `[${index + 1}].${field.target}: ${result.error}` }
        })
        return {
            value: Object.fromEntries(fields.map((field) => [field.target, field.value])),
            error: fields.find((field) => field.error !== null)?.error ?? null,
        }
    })
    return {
        id: row.id,
        target: row.target,
        value: items.map((item) => item.value),
        error: items.find((item) => item.error !== null)?.error ?? null,
    }
}

function runTransforms({ value, transforms, tables }: { value: unknown, transforms: MappingTransform[], tables: MappingTableData[] }): TransformResult {
    return transforms.reduce<TransformResult>(
        (acc, transform) => (acc.error === null ? applyTransform({ value: acc.value, transform, tables }) : acc),
        { value, error: null },
    )
}

function applyTransform({ value, transform, tables }: ApplyTransformParams): TransformResult {
    switch (transform.type) {
        case MappingTransformType.TRIM:
            return ok(typeof value === 'string' ? value.trim() : value)
        case MappingTransformType.STRING:
            return ok(value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))
        case MappingTransformType.UPPER:
            return ok(typeof value === 'string' ? value.toUpperCase() : value)
        case MappingTransformType.LOWER:
            return ok(typeof value === 'string' ? value.toLowerCase() : value)
        case MappingTransformType.NUMBER:
            return toNumber(value)
        case MappingTransformType.ROUND:
            return ok(typeof value === 'number' ? Number(value.toFixed(clampDigits(transform.arg))) : value)
        case MappingTransformType.DEFAULT:
            return ok(isBlank(value) ? transform.arg ?? '' : value)
        case MappingTransformType.SPLIT:
            return ok(typeof value === 'string' ? value.split(transform.arg === undefined || transform.arg.length === 0 ? ',' : transform.arg).map((part) => part.trim()).filter((part) => part.length > 0) : value)
        case MappingTransformType.DATE:
            return formatDate({ value, pattern: transform.arg ?? 'YYYY-MM-DD' })
        case MappingTransformType.LOOKUP:
            return lookup({ value, tableId: transform.arg, tables })
    }
}

function toNumber(value: unknown): TransformResult {
    if (value === undefined || value === null || value === '') {
        return ok(value)
    }
    if (typeof value === 'number') {
        return ok(value)
    }
    const parsed = Number(String(value).replace(/,/g, ''))
    return Number.isFinite(parsed) ? ok(parsed) : fail(value, `"${String(value)}" is not a number`)
}

function formatDate({ value, pattern }: { value: unknown, pattern: string }): TransformResult {
    if (isBlank(value)) {
        return ok(value)
    }
    const date = typeof value === 'number' ? new Date(value) : new Date(String(value).replace(/\//g, '-'))
    if (Number.isNaN(date.getTime())) {
        return fail(value, `"${String(value)}" is not a valid date`)
    }
    const pad = (part: number): string => String(part).padStart(2, '0')
    const formatted = pattern
        .replace('YYYY', String(date.getFullYear()))
        .replace('MM', pad(date.getMonth() + 1))
        .replace('DD', pad(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()))
    return ok(formatted)
}

function lookup({ value, tableId, tables }: { value: unknown, tableId: string | undefined, tables: MappingTableData[] }): TransformResult {
    const table = tables.find((candidate) => candidate.id === tableId)
    if (table === undefined) {
        return fail(value, 'Mapping table not found')
    }
    const key = value === undefined || value === null ? '' : String(value)
    const row = table.rows.find((candidate) => candidate.k === key)
    if (row !== undefined) {
        return ok(row.v)
    }
    switch (table.missingBehavior) {
        case MappingMissingBehavior.DEFAULT:
            return ok(table.defaultValue ?? '')
        case MappingMissingBehavior.PASSTHROUGH:
            return ok(value)
        case MappingMissingBehavior.ERROR:
            return fail(value, `"${key}" is not in mapping table "${table.name}"`)
    }
}

function lookupTableIds(spec: MappingSpec): string[] {
    const ids = spec.fields.flatMap((row) => [
        ...row.transforms,
        ...(row.each ?? []).flatMap((field) => field.transforms),
    ]).filter((transform) => transform.type === MappingTransformType.LOOKUP && transform.arg !== undefined).map((transform) => transform.arg ?? '')
    return [...new Set(ids)]
}

function readPath({ root, path }: { root: unknown, path: string }): unknown {
    return path
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .filter((segment) => segment.length > 0)
        .reduce<unknown>((acc, segment) => (typeof acc === 'object' && acc !== null ? Reflect.get(acc, segment) : undefined), root)
}

function clampDigits(arg: string | undefined): number {
    const digits = Number(arg ?? 2)
    return Number.isInteger(digits) ? Math.min(Math.max(digits, 0), 10) : 2
}

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)
}

function ok(value: unknown): TransformResult {
    return { value, error: null }
}

function fail(value: unknown, error: string): TransformResult {
    return { value, error }
}

type EvaluateParams = {
    spec: MappingSpec
    tables: MappingTableData[]
}

type ApplyTransformParams = {
    value: unknown
    transform: MappingTransform
    tables: MappingTableData[]
}

type TransformResult = {
    value: unknown
    error: string | null
}

export type MappingRowResult = {
    id: string
    target: string
    value: unknown
    error: string | null
}

export type MappingResult = {
    value: Record<string, unknown>
    rows: MappingRowResult[]
}
