export const aiReferences = {
    canonicalize,
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

const SHORT_REFERENCE = /\{\{\s*(trigger|step_\d+)((?:\.[A-Za-z0-9_$-]+|\[\d+\])*)\s*\}\}/g

const PATH_SEGMENT = /\.([A-Za-z0-9_$-]+)|\[(\d+)\]/g
