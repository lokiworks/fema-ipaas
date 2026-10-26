import { fixOwnerMarker } from './fix-owner'

function build({ source, target, bindings, rootSourceKey, rootTargetId, archiveParentId, maxArchives = 10, maxMoves = 50 }: BuildParams): OrgTreePlan {
    if (new Set(source.map((node) => node.key)).size !== source.length) {
        throw new Error(fixOwnerMarker.attach({ message: 'Organization keys must be unique', owner: 'SOURCE_DATA_OWNER' }))
    }
    const siblingKeys = source.filter((node) => !node.disabled && node.key !== rootSourceKey).map((node) => JSON.stringify([node.parentKey, node.name.trim()]))
    if (new Set(siblingKeys).size !== siblingKeys.length) throw new Error(fixOwnerMarker.attach({ message: 'Active source departments under the same parent must have unique names', owner: 'SOURCE_DATA_OWNER' }))
    const targetIds = Object.entries({ ...bindings, [rootSourceKey]: rootTargetId }).filter(([key]) => source.some((node) => node.key === key)).map(([, id]) => id)
    if (new Set(targetIds).size !== targetIds.length) throw new Error(fixOwnerMarker.attach({ message: 'Each source department must bind to a different target department', owner: 'MAPPING_OWNER' }))
    const sourceByKey = new Map(source.map((node) => [node.key, node]))
    if (!sourceByKey.has(rootSourceKey)) {
        return { ops: source.map((node) => ({ op: 'ORPHAN', sourceKey: node.key })), gateExceeded: null }
    }
    const targetById = new Map(target.map((node) => [node.id, node]))
    const resolved = new Map(Object.entries(bindings))
    resolved.set(rootSourceKey, rootTargetId)
    const claimed = new Set([...resolved.values()])
    const children = new Map<string, SourceOrgNode[]>()
    for (const node of source) {
        if (node.parentKey !== null) {
            children.set(node.parentKey, [...children.get(node.parentKey) ?? [], node])
        }
    }
    const ops: OrgPlanOp[] = []
    const visited = new Set<string>([rootSourceKey])
    const pending = [...children.get(rootSourceKey) ?? []].sort((a, b) => compareNodes({ a, b })).reverse()
    while (pending.length > 0) {
        const node = pending.pop()
        if (!node || visited.has(node.key)) {
            continue
        }
        visited.add(node.key)
        const parentTargetId = resolved.get(node.parentKey ?? '')
        if (!parentTargetId) {
            ops.push({ op: 'ORPHAN', sourceKey: node.key })
            continue
        }
        const boundId = bindings[node.key]
        const customId = `bs-${node.key}`
        const bound = boundId ? targetById.get(boundId) : undefined
        const custom = target.find((item) => item.customId === customId && !claimed.has(item.id))
        const matches = target.filter((item) => item.parentId === parentTargetId && item.name === node.name && !claimed.has(item.id))
        if (!boundId && !custom && matches.length > 1) {
            throw new Error(fixOwnerMarker.attach({ message: `Several departments named ${node.name} exist under the same parent`, owner: 'TARGET_ADMIN' }))
        }
        const existing = bound ?? (!boundId ? custom ?? matches[0] : undefined)
        if (existing) {
            claimed.add(existing.id)
            resolved.set(node.key, existing.id)
            if (!boundId) {
                ops.push({ op: 'BIND', sourceKey: node.key, targetId: existing.id })
            }
            if (node.disabled) {
                if (archiveParentId && existing.parentId !== archiveParentId) {
                    ops.push({ op: 'ARCHIVE', sourceKey: node.key, targetId: existing.id })
                }
                else if (!archiveParentId) {
                    ops.push({ op: 'REPORT_DISABLED', sourceKey: node.key, targetId: existing.id })
                }
            }
            else {
                const changedName = existing.name !== node.name
                const changedParent = existing.parentId !== parentTargetId
                if (changedName || changedParent) {
                    ops.push({ op: 'UPDATE', sourceKey: node.key, targetId: existing.id, ...(changedName ? { name: node.name } : {}), ...(changedParent ? { parentSourceKey: node.parentKey ?? rootSourceKey } : {}) })
                }
            }
        }
        else if (!node.disabled) {
            resolved.set(node.key, customId)
            const create = { sourceKey: node.key, customId, name: node.name, parentSourceKey: node.parentKey ?? rootSourceKey, order: node.order }
            ops.push(boundId ? { op: 'REBIND_CREATE', staleTargetId: boundId, ...create } : { op: 'CREATE', ...create })
        }
        else {
            ops.push({ op: 'REPORT_DISABLED', sourceKey: node.key, targetId: boundId ?? '' })
        }
        pending.push(...[...children.get(node.key) ?? []].sort((a, b) => compareNodes({ a, b })).reverse())
    }
    for (const node of source) {
        if (!visited.has(node.key) || !sourceByKey.has(rootSourceKey)) {
            ops.push({ op: 'ORPHAN', sourceKey: node.key })
        }
    }
    const archives = ops.filter((op) => op.op === 'ARCHIVE').length
    const moves = ops.filter((op) => op.op === 'UPDATE' && op.parentSourceKey !== undefined).length
    return { ops, gateExceeded: archives > maxArchives || moves > maxMoves ? { archives, moves } : null }
}

function compareNodes({ a, b }: { a: SourceOrgNode, b: SourceOrgNode }): number {
    return (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key)
}

export const orgTreePlan = { build }

export type SourceOrgNode = { key: string, parentKey: string | null, name: string, order: number | null, disabled: boolean }
export type TargetOrgNode = { id: string, customId: string | null, parentId: string | null, name: string }
export type OrgPlanOp =
    | { op: 'BIND', sourceKey: string, targetId: string }
    | { op: 'CREATE', sourceKey: string, customId: string, name: string, parentSourceKey: string, order: number | null }
    | { op: 'REBIND_CREATE', sourceKey: string, staleTargetId: string, customId: string, name: string, parentSourceKey: string, order: number | null }
    | { op: 'UPDATE', sourceKey: string, targetId: string, name?: string, parentSourceKey?: string }
    | { op: 'ARCHIVE', sourceKey: string, targetId: string }
    | { op: 'REPORT_DISABLED', sourceKey: string, targetId: string }
    | { op: 'ORPHAN', sourceKey: string }
export type OrgTreePlan = { ops: OrgPlanOp[], gateExceeded: { archives: number, moves: number } | null }

type BuildParams = {
    source: SourceOrgNode[]
    target: TargetOrgNode[]
    bindings: Record<string, string>
    rootSourceKey: string
    rootTargetId: string
    archiveParentId?: string
    maxArchives?: number
    maxMoves?: number
}
