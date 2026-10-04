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

export enum MappingFieldType {
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    ARRAY = 'ARRAY',
    OBJECT = 'OBJECT',
    ANY = 'ANY',
}

export enum MappingIssueCode {
    TARGET_EMPTY = 'TARGET_EMPTY',
    DUPLICATE_TARGET = 'DUPLICATE_TARGET',
    REQUIRED_UNMAPPED = 'REQUIRED_UNMAPPED',
    REQUIRED_EMPTY = 'REQUIRED_EMPTY',
    UNKNOWN_TARGET = 'UNKNOWN_TARGET',
    TYPE_MISMATCH = 'TYPE_MISMATCH',
    OPTION_NOT_ALLOWED = 'OPTION_NOT_ALLOWED',
    NUMBER_INVALID = 'NUMBER_INVALID',
    DATE_INVALID = 'DATE_INVALID',
    DATE_PATTERN_INVALID = 'DATE_PATTERN_INVALID',
    LOOKUP_MISS = 'LOOKUP_MISS',
    LOOKUP_TABLE_NOT_FOUND = 'LOOKUP_TABLE_NOT_FOUND',
    LOOKUP_TABLE_NOT_SELECTED = 'LOOKUP_TABLE_NOT_SELECTED',
    SOURCE_NOT_LIST = 'SOURCE_NOT_LIST',
    ITEM_FIELD_MISSING = 'ITEM_FIELD_MISSING',
}

export enum MappingIssueSeverity {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
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

export const MappingTargetItemField = z.object({
    name: z.string(),
    label: z.optional(z.string()),
    type: z.enum(MappingFieldType),
    required: z.boolean(),
})
export type MappingTargetItemField = z.infer<typeof MappingTargetItemField>

export const MappingTargetField = z.object({
    name: z.string(),
    label: z.optional(z.string()),
    type: z.enum(MappingFieldType),
    required: z.boolean(),
    options: z.optional(z.array(z.union([z.string(), z.number()]))),
    item: z.optional(z.array(MappingTargetItemField)),
})
export type MappingTargetField = z.infer<typeof MappingTargetField>

export const MappingTarget = z.object({
    connectorName: z.string(),
    actionName: z.string(),
    displayName: z.optional(z.string()),
    fields: z.array(MappingTargetField),
})
export type MappingTarget = z.infer<typeof MappingTarget>

export const MappingSpec = z.object({
    fields: z.array(MappingRow),
    destination: z.optional(MappingTarget),
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
    validateSpec,
    describeIssue,
    blockingIssues,
    applyTransform,
    lookupTableIds,
    lookupKeys,
    readPath,
    isValidDatePattern,
}

function evaluate({ spec, tables }: EvaluateParams): MappingResult {
    const named = spec.fields.filter((row) => row.target.trim().length > 0)
    const rows = named.map((row) => evaluateRow({ row, field: findField({ spec, name: row.target }), tables }))
    const emptied = new Set(rows.flatMap((row) => row.issues).filter((found) => found.code === MappingIssueCode.REQUIRED_EMPTY).map((found) => found.target))
    const issues = uniqueIssues([
        ...validateSpec(spec).filter((found) => !(found.code === MappingIssueCode.REQUIRED_UNMAPPED && emptied.has(found.target))),
        ...rows.flatMap((row) => row.issues),
    ])
    return {
        value: Object.fromEntries(rows.map((row) => [row.target, row.value])),
        rows: rows.map((row) => withRowError({ row, issues })),
        issues,
    }
}

function validateSpec(spec: MappingSpec): MappingIssue[] {
    const targets = spec.fields.map((row) => row.target.trim()).filter((target) => target.length > 0)
    const duplicates = [...new Set(targets.filter((target, index) => targets.indexOf(target) !== index))]
    const unnamed = spec.fields.filter((row) => row.target.trim().length === 0 && !isRowEmpty(row))
    const unknown = spec.destination === undefined
        ? []
        : spec.fields.filter((row) => row.target.trim().length > 0 && findField({ spec, name: row.target }) === undefined)
    const unmapped = (spec.destination?.fields ?? [])
        .filter((field) => field.required && !spec.fields.some((row) => row.target.trim() === field.name && hasValueSource(row)))
    return [
        ...unnamed.map((row) => issue({ code: MappingIssueCode.TARGET_EMPTY, rowId: row.id, target: '' })),
        ...duplicates.map((target) => issue({ code: MappingIssueCode.DUPLICATE_TARGET, rowId: spec.fields.find((row) => row.target.trim() === target)?.id ?? null, target })),
        ...unknown.map((row) => issue({ code: MappingIssueCode.UNKNOWN_TARGET, rowId: row.id, target: row.target.trim() })),
        ...unmapped.map((field) => issue({ code: MappingIssueCode.REQUIRED_UNMAPPED, rowId: null, target: field.name, params: { label: field.label ?? field.name } })),
        ...spec.fields.flatMap((row) => [
            ...transformIssues({ row, target: row.target.trim(), transforms: row.transforms }),
            ...unmappedItemFields({ spec, row }),
            ...(row.each ?? []).flatMap((item) => transformIssues({ row, target: `${row.target.trim()}[].${item.target.trim()}`, transforms: item.transforms })),
        ]),
    ]
}

function transformIssues({ row, target, transforms }: { row: MappingRow, target: string, transforms: MappingTransform[] }): MappingIssue[] {
    return transforms.flatMap((transform) => {
        if (transform.type === MappingTransformType.DATE && !isValidDatePattern(transform.arg ?? DEFAULT_DATE_PATTERN)) {
            return [issue({ code: MappingIssueCode.DATE_PATTERN_INVALID, rowId: row.id, target, params: { pattern: transform.arg ?? '' } })]
        }
        if (transform.type === MappingTransformType.LOOKUP && (transform.arg === undefined || transform.arg.length === 0)) {
            return [issue({ code: MappingIssueCode.LOOKUP_TABLE_NOT_SELECTED, rowId: row.id, target })]
        }
        return []
    })
}

function unmappedItemFields({ spec, row }: { spec: MappingSpec, row: MappingRow }): MappingIssue[] {
    const itemFields = findField({ spec, name: row.target })?.item ?? []
    if (row.each === undefined) {
        return []
    }
    return itemFields
        .filter((field) => field.required && !(row.each ?? []).some((item) => item.target.trim() === field.name && hasItemValueSource(item)))
        .map((field) => issue({ code: MappingIssueCode.REQUIRED_UNMAPPED, rowId: row.id, target: `${row.target.trim()}[].${field.name}`, params: { label: field.label ?? field.name } }))
}

function evaluateRow({ row, field, tables }: { row: MappingRow, field: MappingTargetField | undefined, tables: MappingTableData[] }): RowEvaluation {
    const target = row.target.trim()
    const initial = isBlank(row.source) ? row.constant : row.source
    if (row.each !== undefined) {
        return evaluateEach({ row, field, list: initial, tables })
    }
    const transformed = runTransforms({ value: initial, transforms: row.transforms, tables })
    const transformIssue = transformed.issue === null ? [] : [issue({ ...transformed.issue, rowId: row.id, target })]
    const typeIssues = transformIssue.length > 0 || field === undefined ? [] : checkValue({ field, value: transformed.value, row, target })
    return { id: row.id, target: row.target, value: transformed.value, issues: [...transformIssue, ...typeIssues] }
}

function checkValue({ field, value, row, target }: { field: MappingTargetField, value: unknown, row: MappingRow, target: string }): MappingIssue[] {
    if (isBlank(value)) {
        return field.required ? [issue({ code: MappingIssueCode.REQUIRED_EMPTY, rowId: row.id, target, params: { label: field.label ?? field.name } })] : []
    }
    if (!matchesType({ value, type: field.type })) {
        return [issue({ code: MappingIssueCode.TYPE_MISMATCH, rowId: row.id, target, params: { expected: field.type, actual: typeName(value), value: preview(value) } })]
    }
    if (field.options !== undefined && field.options.length > 0 && !field.options.includes(typeof value === 'number' ? value : String(value))) {
        return [issue({ code: MappingIssueCode.OPTION_NOT_ALLOWED, rowId: row.id, target, params: { value: preview(value), options: field.options.join(' / ') } })]
    }
    return []
}

function evaluateEach({ row, field, list, tables }: { row: MappingRow, field: MappingTargetField | undefined, list: unknown, tables: MappingTableData[] }): RowEvaluation {
    const target = row.target.trim()
    if (!Array.isArray(list)) {
        const missing = isBlank(list) ? [] : [issue({ code: MappingIssueCode.SOURCE_NOT_LIST, rowId: row.id, target })]
        const required = isBlank(list) && field?.required === true ? [issue({ code: MappingIssueCode.REQUIRED_EMPTY, rowId: row.id, target, params: { label: field.label ?? field.name } })] : []
        return { id: row.id, target: row.target, value: [], issues: [...missing, ...required] }
    }
    const itemFields = field?.item ?? []
    const items = list.map((item: unknown, index) => {
        const evaluated = (row.each ?? []).filter((entry) => entry.target.trim().length > 0).map((entry) => {
            const itemField = itemFields.find((candidate) => candidate.name === entry.target.trim())
            const hasPath = entry.itemPath !== undefined && entry.itemPath.length > 0
            const raw = hasPath ? readPath({ root: item, path: entry.itemPath ?? '' }) : entry.constant
            const result = runTransforms({ value: raw, transforms: entry.transforms, tables })
            const label = `${target}[${index + 1}].${entry.target.trim()}`
            return {
                target: entry.target.trim(),
                value: result.value,
                issues: itemIssues({ row, entry, itemField, hasPath, raw, result, index, label }),
            }
        })
        return {
            value: Object.fromEntries(evaluated.map((entry) => [entry.target, entry.value])),
            issues: evaluated.flatMap((entry) => entry.issues),
        }
    })
    return { id: row.id, target: row.target, value: items.map((item) => item.value), issues: items.flatMap((item) => item.issues) }
}

function itemIssues({ row, entry, itemField, hasPath, raw, result, index, label }: ItemIssuesParams): MappingIssue[] {
    const rowId = row.id
    const position = String(index + 1)
    const field = entry.target.trim()
    if (result.issue !== null) {
        return [issue({ ...result.issue, rowId, target: label, params: { ...result.issue.params, index: position } })]
    }
    const hasDefault = entry.transforms.some((transform) => transform.type === MappingTransformType.DEFAULT && !isBlank(transform.arg))
    if (hasPath && isBlank(raw) && !hasDefault) {
        const required = itemField?.required === true
        return [issue({ code: MappingIssueCode.ITEM_FIELD_MISSING, rowId, target: label, severity: required ? MappingIssueSeverity.ERROR : MappingIssueSeverity.WARNING, params: { index: position, field, path: entry.itemPath ?? '' } })]
    }
    if (itemField === undefined || isBlank(result.value)) {
        return []
    }
    return matchesType({ value: result.value, type: itemField.type })
        ? []
        : [issue({ code: MappingIssueCode.TYPE_MISMATCH, rowId, target: label, params: { expected: itemField.type, actual: typeName(result.value), value: preview(result.value), index: position } })]
}

function runTransforms({ value, transforms, tables }: { value: unknown, transforms: MappingTransform[], tables: MappingTableData[] }): TransformResult {
    return transforms.reduce<TransformResult>(
        (acc, transform) => (acc.issue === null ? applyTransform({ value: acc.value, transform, tables }) : acc),
        { value, issue: null },
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
            return formatDate({ value, pattern: transform.arg ?? DEFAULT_DATE_PATTERN })
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
    const parsed = Number(String(value).trim().replace(/,/g, ''))
    return typeof value !== 'boolean' && String(value).trim().length > 0 && Number.isFinite(parsed)
        ? ok(parsed)
        : fail({ value, code: MappingIssueCode.NUMBER_INVALID, params: { value: preview(value) } })
}

function formatDate({ value, pattern }: { value: unknown, pattern: string }): TransformResult {
    if (isBlank(value)) {
        return ok(value)
    }
    if (!isValidDatePattern(pattern)) {
        return fail({ value, code: MappingIssueCode.DATE_PATTERN_INVALID, params: { pattern } })
    }
    const parts = parseDateParts(value)
    if (parts === null) {
        return fail({ value, code: MappingIssueCode.DATE_INVALID, params: { value: preview(value) } })
    }
    const pad = (part: number): string => String(part).padStart(2, '0')
    const tokens: Record<string, string> = {
        YYYY: String(parts.year),
        YY: String(parts.year).slice(-2),
        MM: pad(parts.month),
        DD: pad(parts.day),
        HH: pad(parts.hour),
        mm: pad(parts.minute),
        ss: pad(parts.second),
    }
    return ok(pattern.replace(DATE_TOKENS, (token) => tokens[token] ?? token))
}

function isValidDatePattern(pattern: string): boolean {
    const tokens = pattern.match(DATE_TOKENS) ?? []
    const leftover = pattern.replace(DATE_TOKENS, '').replace(/T/g, '')
    return tokens.length > 0 && !/[A-Za-z]/.test(leftover)
}

function parseDateParts(value: unknown): DateParts | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? partsFromEpoch(value) : null
    }
    const text = String(value).trim()
    const compact = COMPACT_DATE.exec(text)
    const match = compact ?? WRITTEN_DATE.exec(text)
    if (match === null) {
        return null
    }
    const [, year, month, day, hour, minute, second] = match
    const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour ?? 0), minute: Number(minute ?? 0), second: Number(second ?? 0) }
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
    const valid = check.getUTCFullYear() === parts.year
        && check.getUTCMonth() === parts.month - 1
        && check.getUTCDate() === parts.day
        && parts.hour < 24
        && parts.minute < 60
        && parts.second < 60
    return valid ? parts : null
}

function partsFromEpoch(epoch: number): DateParts | null {
    const milliseconds = Math.abs(epoch) < SECONDS_LIMIT ? epoch * 1000 : epoch
    const shifted = new Date(milliseconds + CHINA_OFFSET_MS)
    if (Number.isNaN(shifted.getTime())) {
        return null
    }
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
    }
}

function lookup({ value, tableId, tables }: { value: unknown, tableId: string | undefined, tables: MappingTableData[] }): TransformResult {
    const table = tables.find((candidate) => candidate.id === tableId)
    if (table === undefined) {
        return fail({ value, code: MappingIssueCode.LOOKUP_TABLE_NOT_FOUND, params: {} })
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
            return fail({ value, code: MappingIssueCode.LOOKUP_MISS, params: { value: key, table: table.name } })
    }
}

function lookupTableIds(spec: MappingSpec): string[] {
    const ids = spec.fields.flatMap((row) => [
        ...row.transforms,
        ...(row.each ?? []).flatMap((field) => field.transforms),
    ]).filter((transform) => transform.type === MappingTransformType.LOOKUP && transform.arg !== undefined && transform.arg.length > 0).map((transform) => transform.arg ?? '')
    return [...new Set(ids)]
}

function lookupKeys({ row, tables }: { row: MappingRow, tables: MappingTableData[] }): MappingLookupKey[] {
    const target = row.target.trim()
    const initial = isBlank(row.source) ? row.constant : row.source
    if (row.each !== undefined) {
        const entries = row.each
        return Array.isArray(initial)
            ? initial.flatMap((item: unknown) => entries.flatMap((entry) => {
                const hasPath = entry.itemPath !== undefined && entry.itemPath.length > 0
                const raw = hasPath ? readPath({ root: item, path: entry.itemPath ?? '' }) : entry.constant
                return keysAlong({ rowId: row.id, target, value: raw, transforms: entry.transforms, tables })
            }))
            : []
    }
    return keysAlong({ rowId: row.id, target, value: initial, transforms: row.transforms, tables })
}

function keysAlong({ rowId, target, value, transforms, tables }: { rowId: string, target: string, value: unknown, transforms: MappingTransform[], tables: MappingTableData[] }): MappingLookupKey[] {
    return transforms.reduce<{ value: unknown, stopped: boolean, keys: MappingLookupKey[] }>((acc, transform) => {
        if (acc.stopped) {
            return acc
        }
        const isLookup = transform.type === MappingTransformType.LOOKUP && transform.arg !== undefined && transform.arg.length > 0
        const key = acc.value === undefined || acc.value === null ? '' : String(acc.value)
        const keys = isLookup && key.trim().length > 0 ? [...acc.keys, { rowId, target, tableId: transform.arg ?? '', key }] : acc.keys
        const result = applyTransform({ value: acc.value, transform, tables })
        return { value: result.value, stopped: result.issue !== null, keys }
    }, { value, stopped: false, keys: [] }).keys
}

function blockingIssues(issues: MappingIssue[]): MappingIssue[] {
    return issues.filter((candidate) => candidate.severity === MappingIssueSeverity.ERROR)
}

function describeIssue(found: MappingIssue): string {
    const position = found.params['index']
    const prefix = position !== undefined && found.code !== MappingIssueCode.ITEM_FIELD_MISSING ? `第 ${position} 项：` : ''
    return `${prefix}${describeCode(found)}`
}

function describeCode(found: MappingIssue): string {
    const field = found.target
    switch (found.code) {
        case MappingIssueCode.TARGET_EMPTY:
            return '有来源但没有填写目标字段名'
        case MappingIssueCode.DUPLICATE_TARGET:
            return `目标字段「${field}」重复`
        case MappingIssueCode.REQUIRED_UNMAPPED:
            return `必填字段「${found.params['label'] ?? field}」还没有映射来源`
        case MappingIssueCode.REQUIRED_EMPTY:
            return `必填字段「${found.params['label'] ?? field}」取到的值为空`
        case MappingIssueCode.UNKNOWN_TARGET:
            return `目标里没有字段「${field}」，可能已改名或被删除`
        case MappingIssueCode.TYPE_MISMATCH:
            return `类型不符：需要${typeLabel(found.params['expected'])}，实际是${typeLabel(found.params['actual'])}（${found.params['value'] ?? ''}）${typeAdvice(found.params)}`
        case MappingIssueCode.OPTION_NOT_ALLOWED:
            return `「${found.params['value'] ?? ''}」不在可选值里（${found.params['options'] ?? ''}）`
        case MappingIssueCode.NUMBER_INVALID:
            return `「${found.params['value'] ?? ''}」不是数字`
        case MappingIssueCode.DATE_INVALID:
            return `「${found.params['value'] ?? ''}」不是有效的日期`
        case MappingIssueCode.DATE_PATTERN_INVALID:
            return `日期格式「${found.params['pattern'] ?? ''}」无法识别，请用 YYYY-MM-DD、YYYY/MM/DD HH:mm:ss 这类写法（年 YYYY、月 MM、日 DD、时 HH、分 mm、秒 ss，区分大小写）`
        case MappingIssueCode.LOOKUP_MISS:
            return `「${found.params['value'] ?? ''}」不在映射表「${found.params['table'] ?? ''}」里，请先在映射表中补上这个值，再重试`
        case MappingIssueCode.LOOKUP_TABLE_NOT_FOUND:
            return '映射表不存在或已被删除'
        case MappingIssueCode.LOOKUP_TABLE_NOT_SELECTED:
            return '「查映射表」还没有选择映射表'
        case MappingIssueCode.SOURCE_NOT_LIST:
            return '来源不是列表，无法逐项映射'
        case MappingIssueCode.ITEM_FIELD_MISSING:
            return `第 ${found.params['index'] ?? ''} 项缺少「${found.params['path'] ?? found.params['field'] ?? ''}」`
    }
}

function typeAdvice(params: Record<string, string>): string {
    if (params['expected'] === MappingFieldType.NUMBER) {
        return '，可以加「转数字」'
    }
    if (params['expected'] === MappingFieldType.STRING) {
        return '，可以加「转文本」'
    }
    if (params['expected'] === MappingFieldType.DATE) {
        return '，可以加「日期格式」'
    }
    return ''
}

function typeLabel(type: string | undefined): string {
    switch (type) {
        case MappingFieldType.STRING:
            return '文本'
        case MappingFieldType.NUMBER:
            return '数字'
        case MappingFieldType.BOOLEAN:
            return '布尔值'
        case MappingFieldType.DATE:
            return '日期'
        case MappingFieldType.ARRAY:
            return '列表'
        case MappingFieldType.OBJECT:
            return '对象'
        default:
            return '任意类型'
    }
}

function matchesType({ value, type }: { value: unknown, type: MappingFieldType }): boolean {
    switch (type) {
        case MappingFieldType.STRING:
            return typeof value === 'string'
        case MappingFieldType.NUMBER:
            return typeof value === 'number' && Number.isFinite(value)
        case MappingFieldType.BOOLEAN:
            return typeof value === 'boolean'
        case MappingFieldType.DATE:
            return typeof value === 'string' && parseDateParts(value) !== null
        case MappingFieldType.ARRAY:
            return Array.isArray(value)
        case MappingFieldType.OBJECT:
            return typeof value === 'object' && value !== null && !Array.isArray(value)
        case MappingFieldType.ANY:
            return true
    }
}

function typeName(value: unknown): MappingFieldType {
    if (typeof value === 'string') {
        return MappingFieldType.STRING
    }
    if (typeof value === 'number') {
        return MappingFieldType.NUMBER
    }
    if (typeof value === 'boolean') {
        return MappingFieldType.BOOLEAN
    }
    if (Array.isArray(value)) {
        return MappingFieldType.ARRAY
    }
    return MappingFieldType.OBJECT
}

function preview(value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
    return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text
}

function findField({ spec, name }: { spec: MappingSpec, name: string }): MappingTargetField | undefined {
    return spec.destination?.fields.find((field) => field.name === name.trim())
}

function hasValueSource(row: MappingRow): boolean {
    return !isBlank(row.source) || !isBlank(row.constant) || row.each !== undefined || row.transforms.some((transform) => transform.type === MappingTransformType.DEFAULT && !isBlank(transform.arg))
}

function hasItemValueSource(item: MappingItemRow): boolean {
    return !isBlank(item.itemPath) || !isBlank(item.constant) || item.transforms.some((transform) => transform.type === MappingTransformType.DEFAULT && !isBlank(transform.arg))
}

function isRowEmpty(row: MappingRow): boolean {
    return !hasValueSource(row) && row.transforms.length === 0
}

function withRowError({ row, issues }: { row: RowEvaluation, issues: MappingIssue[] }): MappingRowResult {
    const own = blockingIssues(issues).find((candidate) => candidate.rowId === row.id)
    return { id: row.id, target: row.target, value: row.value, error: own === undefined ? null : describeIssue(own), issues: issues.filter((candidate) => candidate.rowId === row.id) }
}

function uniqueIssues(issues: MappingIssue[]): MappingIssue[] {
    return [...new Map(issues.map((candidate) => [JSON.stringify([candidate.code, candidate.rowId, candidate.target, candidate.params]), candidate])).values()]
}

function issue({ code, rowId, target, severity = MappingIssueSeverity.ERROR, params = {} }: IssueParams): MappingIssue {
    return { code, rowId, target, severity, params }
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
    return { value, issue: null }
}

function fail({ value, code, params }: { value: unknown, code: MappingIssueCode, params: Record<string, string> }): TransformResult {
    return { value, issue: { code, params } }
}

const DEFAULT_DATE_PATTERN = 'YYYY-MM-DD'
const DATE_TOKENS = /YYYY|YY|MM|DD|HH|mm|ss/g
const WRITTEN_DATE = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[T\s]+(\d{1,2})[:：时](\d{1,2})(?:[:：分](\d{1,2}))?秒?)?(?:\.\d+)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)?$/
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/
const SECONDS_LIMIT = 100000000000
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000
const PREVIEW_LIMIT = 60

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
    issue: { code: MappingIssueCode, params: Record<string, string> } | null
}

type DateParts = {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

type RowEvaluation = {
    id: string
    target: string
    value: unknown
    issues: MappingIssue[]
}

type IssueParams = {
    code: MappingIssueCode
    rowId: string | null
    target: string
    severity?: MappingIssueSeverity
    params?: Record<string, string>
}

type ItemIssuesParams = {
    row: MappingRow
    entry: MappingItemRow
    itemField: MappingTargetItemField | undefined
    hasPath: boolean
    raw: unknown
    result: TransformResult
    index: number
    label: string
}

export type MappingLookupKey = {
    rowId: string
    target: string
    tableId: string
    key: string
}

export type MappingIssue = {
    code: MappingIssueCode
    rowId: string | null
    target: string
    severity: MappingIssueSeverity
    params: Record<string, string>
}

export type MappingRowResult = {
    id: string
    target: string
    value: unknown
    error: string | null
    issues: MappingIssue[]
}

export type MappingResult = {
    value: Record<string, unknown>
    rows: MappingRowResult[]
    issues: MappingIssue[]
}
