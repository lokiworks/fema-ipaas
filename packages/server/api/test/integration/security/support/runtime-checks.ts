import { db } from '../../../helpers/db'
import { PreparedRequest } from './matrix'

function stateString({ prepared, key }: { prepared: PreparedRequest, key: string }): string {
    const value = prepared.state?.[key]
    if (typeof value !== 'string') {
        throw new Error(`prepared state is missing ${key}`)
    }
    return value
}

async function column({ entity, id, name }: { entity: string, id: string, name: string }): Promise<unknown> {
    const row = await db.findOneByOrFail<Record<string, unknown>>(entity, { id })
    return row[name]
}

async function rowExists({ entity, where }: { entity: string, where: Record<string, unknown> }): Promise<boolean> {
    return (await db.findOneBy<Record<string, unknown>>(entity, where)) !== null
}

async function reset({ entity, id, values }: { entity: string, id: string, values: Record<string, unknown> }): Promise<void> {
    await db.update(entity, id, values)
}

function field({ value, key }: { value: unknown, key: string }): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

export const runtimeChecks = {
    field,
    stateString,
    column,
    rowExists,
    reset,
}
