import { collectionTransformComponent } from '../src/lib/data/collection-transform'
import { dateTransformComponent } from '../src/lib/data/date-transform'
import { filterComponent } from '../src/lib/data/filter'
import { jsonTransformComponent } from '../src/lib/data/json-transform'
import { setVariableComponent } from '../src/lib/data/set-variable'
import { textTransformComponent } from '../src/lib/data/text-transform'

function run(component: { run: (context: never) => Promise<unknown> }, input: Record<string, unknown>) {
    return component.run({ input } as never)
}

describe('data/set-variable', () => {
    it('names a value under the given key', async () => {
        await expect(run(setVariableComponent, { name: 'total', value: 42 })).resolves.toEqual({ total: 42 })
    })
})

describe('data/filter', () => {
    const items = [{ n: 1, tag: 'a' }, { n: 5, tag: '' }, { n: 9, tag: 'b' }]

    it('keeps matching items and reports how many were removed', async () => {
        await expect(run(filterComponent, { items, field: 'tag', operator: 'is_not_empty' }))
            .resolves.toEqual({ items: [items[0], items[2]], count: 2, removed: 1 })
    })

    it('compares numerically for greater than', async () => {
        const result = await run(filterComponent, { items, field: 'n', operator: 'greater_than', value: 4 })
        expect(Reflect.get(result as object, 'count')).toBe(2)
    })

    it('tests the item itself when no field is given', async () => {
        const result = await run(filterComponent, { items: ['x', '', 'y'], operator: 'is_not_empty' })
        expect(Reflect.get(result as object, 'items')).toEqual(['x', 'y'])
    })

    it('rejects a non-list input rather than silently returning nothing', async () => {
        await expect(run(filterComponent, { items: 'not-a-list', operator: 'is_empty' })).rejects.toThrow(/must be a list/)
    })

    it('refuses to compare a non-numeric value as a number', async () => {
        await expect(run(filterComponent, { items: [{ n: 'abc' }], field: 'n', operator: 'greater_than', value: 1 }))
            .rejects.toThrow(/as a number/)
    })
})

describe('data/json-transform', () => {
    it('parses text and leaves already-parsed values alone', async () => {
        await expect(run(jsonTransformComponent, { operation: 'parse', value: '{"a":1}' })).resolves.toEqual({ result: { a: 1 } })
        await expect(run(jsonTransformComponent, { operation: 'parse', value: { a: 1 } })).resolves.toEqual({ result: { a: 1 } })
    })

    it('reads a dot path through objects and arrays', async () => {
        await expect(run(jsonTransformComponent, {
            operation: 'get_path',
            value: { data: { items: [{ name: 'first' }] } },
            path: 'data.items.0.name',
        })).resolves.toEqual({ result: 'first' })
    })

    it('returns undefined for a path that does not exist instead of throwing', async () => {
        await expect(run(jsonTransformComponent, { operation: 'get_path', value: {}, path: 'a.b.c' }))
            .resolves.toEqual({ result: undefined })
    })

    it('merges with the second object winning', async () => {
        await expect(run(jsonTransformComponent, { operation: 'merge', value: { a: 1, b: 1 }, second: { b: 2 } }))
            .resolves.toEqual({ result: { a: 1, b: 2 } })
    })
})

describe('data/text-transform', () => {
    it('replaces every occurrence, not just the first', async () => {
        await expect(run(textTransformComponent, { operation: 'replace', text: 'a-a-a', find: '-', replaceWith: '+' }))
            .resolves.toEqual({ result: 'a+a+a' })
    })

    it('slugifies accented text', async () => {
        await expect(run(textTransformComponent, { operation: 'slugify', text: 'Crème Brûlée Recipe!' }))
            .resolves.toEqual({ result: 'creme-brulee-recipe' })
    })

    it('falls back only when the text is blank', async () => {
        await expect(run(textTransformComponent, { operation: 'default', text: '   ', replaceWith: 'fallback' }))
            .resolves.toEqual({ result: 'fallback' })
        await expect(run(textTransformComponent, { operation: 'default', text: 'kept', replaceWith: 'fallback' }))
            .resolves.toEqual({ result: 'kept' })
    })

    it('rejects an unknown operation instead of returning the input unchanged', async () => {
        await expect(run(textTransformComponent, { operation: 'nope', text: 'x' })).rejects.toThrow(/Unknown text operation/)
    })
})

describe('data/date-transform', () => {
    it('measures the gap between two dates regardless of order', async () => {
        const forward = await run(dateTransformComponent, {
            operation: 'difference',
            date: '2026-01-01T00:00:00Z',
            otherDate: '2026-01-03T00:00:00Z',
        })
        const backward = await run(dateTransformComponent, {
            operation: 'difference',
            date: '2026-01-03T00:00:00Z',
            otherDate: '2026-01-01T00:00:00Z',
        })
        expect(Reflect.get(forward as object, 'days')).toBe(2)
        expect(backward).toEqual(forward)
    })

    it('adds and subtracts in the chosen unit', async () => {
        await expect(run(dateTransformComponent, { operation: 'add', date: '2026-01-01T00:00:00Z', amount: 2, unit: 'days' }))
            .resolves.toEqual({ result: '2026-01-03T00:00:00.000Z' })
        await expect(run(dateTransformComponent, { operation: 'subtract', date: '2026-01-03T00:00:00Z', amount: 2, unit: 'days' }))
            .resolves.toEqual({ result: '2026-01-01T00:00:00.000Z' })
    })

    it('names the field when a date cannot be parsed', async () => {
        await expect(run(dateTransformComponent, { operation: 'format', date: 'not-a-date' }))
            .rejects.toThrow(/Date could not be parsed/)
    })
})

describe('data/collection-transform', () => {
    const items = [{ id: 2, kind: 'a', n: 10 }, { id: 1, kind: 'b', n: 5 }, { id: 2, kind: 'a', n: 1 }]

    it('picks one field from each item', async () => {
        await expect(run(collectionTransformComponent, { operation: 'pluck', items, field: 'kind' }))
            .resolves.toEqual({ result: ['a', 'b', 'a'] })
    })

    it('sorts numerically, and reverses when descending', async () => {
        const ascending = await run(collectionTransformComponent, { operation: 'sort', items, field: 'n' })
        expect((Reflect.get(ascending as object, 'result') as { n: number }[]).map((item) => item.n)).toEqual([1, 5, 10])
        const descending = await run(collectionTransformComponent, { operation: 'sort', items, field: 'n', descending: true })
        expect((Reflect.get(descending as object, 'result') as { n: number }[]).map((item) => item.n)).toEqual([10, 5, 1])
    })

    it('deduplicates by a field, keeping the first occurrence', async () => {
        const result = await run(collectionTransformComponent, { operation: 'unique', items, field: 'id' })
        expect((Reflect.get(result as object, 'result') as { n: number }[]).map((item) => item.n)).toEqual([10, 5])
    })

    it('sums a field, treating non-numeric values as zero', async () => {
        await expect(run(collectionTransformComponent, {
            operation: 'sum',
            items: [{ n: 3 }, { n: 'x' }, { n: 4 }],
            field: 'n',
        })).resolves.toEqual({ result: 7 })
    })

    it('groups by a field', async () => {
        const result = await run(collectionTransformComponent, { operation: 'group_by', items, field: 'kind' })
        expect(Object.keys(Reflect.get(result as object, 'result') as object).sort()).toEqual(['a', 'b'])
    })

    it('rejects a non-list input', async () => {
        await expect(run(collectionTransformComponent, { operation: 'count', items: 42 })).rejects.toThrow(/must be a list/)
    })
})
