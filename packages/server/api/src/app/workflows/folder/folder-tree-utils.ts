import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { FOLDER_NAME_MAX_LENGTH } from '@fema-ipaas/shared'

function normalize(name: string): string {
    return name.trim().toLowerCase()
}

function uniqueAmong({ name, taken }: { name: string, taken: string[] }): string {
    const used = new Set(taken.map(normalize))
    if (!used.has(normalize(name))) {
        return name
    }
    const stem = name.slice(0, FOLDER_NAME_MAX_LENGTH - 5)
    const candidate = Array.from({ length: taken.length + 1 }, (_, index) => `${stem} (${index + 2})`)
        .find((option) => !used.has(normalize(option)))
    return candidate ?? `${stem} (${taken.length + 2})`
}

export const folderTreeUtils = {
    assertValidName(displayName: string): string {
        const trimmed = displayName.trim()
        if (trimmed.length === 0 || trimmed.length > FOLDER_NAME_MAX_LENGTH) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'folderNameInvalid' },
            })
        }
        return trimmed
    },
    depthOf({ folderId, folders }: { folderId: string, folders: FolderNode[] }): number {
        const byId = new Map(folders.map((folder) => [folder.id, folder]))
        const walk = (id: string | null, depth: number, seen: Set<string>): number => {
            if (isNil(id) || seen.has(id)) {
                return depth
            }
            const folder = byId.get(id)
            if (isNil(folder)) {
                return depth
            }
            return walk(folder.parentId ?? null, depth + 1, new Set([...seen, id]))
        }
        return walk(folderId, 0, new Set())
    },
    planMoveUp({ children, siblingNames }: { children: FolderNode[], siblingNames: string[] }): FolderRename[] {
        return children.reduce<{ renames: FolderRename[], taken: string[] }>((acc, child) => {
            const displayName = uniqueAmong({ name: child.displayName, taken: acc.taken })
            return {
                renames: [...acc.renames, { id: child.id, displayName }],
                taken: [...acc.taken, displayName],
            }
        }, { renames: [], taken: siblingNames }).renames
    },
}

export type FolderNode = {
    id: string
    displayName: string
    parentId?: string | null
}

export type FolderRename = {
    id: string
    displayName: string
}
