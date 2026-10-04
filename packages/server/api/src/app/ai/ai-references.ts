export const aiReferences = {
    canonicalize,
    renumber,
    referencesStep,
}

function renumber({ value, indexMap }: { value: unknown, indexMap: Map<number, number> }): unknown {
    if (typeof value === 'string') {
        return value.replace(STEP_REFERENCE, (match, index: string) => {
            const next = indexMap.get(Number(index))
            return next === undefined ? '' : match.replace(`step_${index}`, `step_${next}`)
        })
    }
    if (Array.isArray(value)) {
        return value.map((child) => renumber({ value: child, indexMap }))
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, renumber({ value: child, indexMap })]))
    }
    return value
}

function referencesStep({ value, index }: { value: unknown, index: number }): boolean {
    if (typeof value === 'string') {
        return [...value.matchAll(STEP_REFERENCE)].some((match) => Number(match[1]) === index)
    }
    if (Array.isArray(value)) {
        return value.some((child) => referencesStep({ value: child, index }))
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).some((child) => referencesStep({ value: child, index }))
    }
    return false
}

function canonicalize(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.replace(SHORT_REFERENCE, (_match, head: string, path: string) => canonicalReference({ head, path }))
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize)
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, canonicalize(child)]))
    }
    return value
}

function canonicalReference({ head, path }: { head: string, path: string }): string {
    const segments = [...path.matchAll(PATH_SEGMENT)].map((segment) => (segment[1] === undefined ? `[${segment[2]}]` : `['${segment[1]}']`))
    const fields = segments[0] === '[\'output\']' ? segments.slice(1) : segments
    return `{{${head}['output']${fields.join('')}}}`
}

const STEP_REFERENCE = /\{\{[^}]*?step_(\d+)\b[^}]*\}\}/g

const SHORT_REFERENCE = /\{\{\s*(trigger|step_\d+)((?:\.[A-Za-z0-9_$-]+|\[\d+\])*)\s*\}\}/g

const PATH_SEGMENT = /\.([A-Za-z0-9_$-]+)|\[(\d+)\]/g
