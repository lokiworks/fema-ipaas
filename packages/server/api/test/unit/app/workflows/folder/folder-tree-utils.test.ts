import { describe, expect, it } from 'vitest'
import { folderTreeUtils } from '../../../../../src/app/workflows/folder/folder-tree-utils'

describe('folderTreeUtils.assertValidName', () => {
    it('trims and accepts names up to 50 characters', () => {
        expect(folderTreeUtils.assertValidName('  财务  ')).toBe('财务')
        expect(folderTreeUtils.assertValidName('a'.repeat(50))).toBe('a'.repeat(50))
    })

    it('rejects empty and too long names', () => {
        expect(() => folderTreeUtils.assertValidName('   ')).toThrow()
        expect(() => folderTreeUtils.assertValidName('a'.repeat(51))).toThrow()
    })
})

describe('folderTreeUtils.depthOf', () => {
    const folders = [
        { id: 'a', displayName: 'A', parentId: null },
        { id: 'b', displayName: 'B', parentId: 'a' },
        { id: 'c', displayName: 'C', parentId: 'b' },
    ]

    it('counts levels from the root', () => {
        expect(folderTreeUtils.depthOf({ folderId: 'a', folders })).toBe(1)
        expect(folderTreeUtils.depthOf({ folderId: 'c', folders })).toBe(3)
    })

    it('stops on cycles instead of looping forever', () => {
        const cyclic = [
            { id: 'x', displayName: 'X', parentId: 'y' },
            { id: 'y', displayName: 'Y', parentId: 'x' },
        ]
        expect(folderTreeUtils.depthOf({ folderId: 'x', folders: cyclic })).toBe(2)
    })
})

describe('folderTreeUtils.planMoveUp', () => {
    it('keeps names that do not clash with the new siblings', () => {
        const renames = folderTreeUtils.planMoveUp({
            children: [{ id: '1', displayName: '报销' }],
            siblingNames: ['入职'],
        })
        expect(renames).toEqual([{ id: '1', displayName: '报销' }])
    })

    it('suffixes clashing names, case-insensitively, and never reuses a suffix', () => {
        const renames = folderTreeUtils.planMoveUp({
            children: [
                { id: '1', displayName: 'Sync' },
                { id: '2', displayName: 'sync' },
            ],
            siblingNames: ['SYNC'],
        })
        expect(renames).toEqual([
            { id: '1', displayName: 'Sync (2)' },
            { id: '2', displayName: 'sync (3)' },
        ])
    })
})
