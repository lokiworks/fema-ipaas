import { EntitySchema, ObjectLiteral } from 'typeorm'
import { databaseConnection } from '../../database/database-connection'

async function deleteWhere({ entity, column, value }: DeleteWhereParams): Promise<number> {
    return deleteWhereIn({ entity, column, values: [value] })
}

async function deleteWhereIn({ entity, column, values }: DeleteWhereInParams): Promise<number> {
    if (values.length === 0) {
        return 0
    }
    let total = 0
    let batch = await idsOf({ entity, column, values })
    while (batch.length > 0) {
        await databaseConnection()
            .createQueryBuilder()
            .delete()
            .from(entity)
            .where('id IN (:...ids)', { ids: batch })
            .execute()
        total += batch.length
        batch = batch.length === BATCH_SIZE ? await idsOf({ entity, column, values }) : []
    }
    return total
}

async function idsOf({ entity, column, values }: DeleteWhereInParams): Promise<string[]> {
    const rows = await databaseConnection()
        .createQueryBuilder()
        .select('purged.id', 'id')
        .from(entity, 'purged')
        .withDeleted()
        .where(`purged."${column}" IN (:...values)`, { values })
        .limit(BATCH_SIZE)
        .getRawMany<{ id: string }>()
    return rows.map((row) => row.id)
}

async function idsWhere({ entity, column, value }: DeleteWhereParams): Promise<string[]> {
    const rows = await databaseConnection()
        .createQueryBuilder()
        .select('found.id', 'id')
        .from(entity, 'found')
        .withDeleted()
        .where(`found."${column}" = :value`, { value })
        .getRawMany<{ id: string }>()
    return rows.map((row) => row.id)
}

export const purgeBatch = {
    deleteWhere,
    deleteWhereIn,
    idsWhere,
}

const BATCH_SIZE = 1000

type DeleteWhereParams = {
    entity: EntitySchema<ObjectLiteral>
    column: string
    value: string
}

type DeleteWhereInParams = {
    entity: EntitySchema<ObjectLiteral>
    column: string
    values: string[]
}
