import { isNil } from '@fema-ipaas/core-utils'

export const projectCopyUtils = {
    orderFoldersParentFirst<T extends { id: string, parentId?: string | null }>(folders: T[]): T[] {
        const ids = new Set(folders.map((folder) => folder.id))
        const depthOf = (folder: T, seen: Set<string>): number => {
            if (isNil(folder.parentId) || !ids.has(folder.parentId) || seen.has(folder.id)) {
                return 0
            }
            const parent = folders.find((candidate) => candidate.id === folder.parentId)
            return isNil(parent) ? 0 : 1 + depthOf(parent, new Set([...seen, folder.id]))
        }
        return [...folders]
            .map((folder) => ({ folder, depth: depthOf(folder, new Set()) }))
            .sort((a, b) => a.depth - b.depth)
            .map(({ folder }) => folder)
    },
}
