import { ObjectLiteral } from 'typeorm'
import { databaseConnection } from '../../src/app/database/database-connection'

export const db = {
    async save<T extends ObjectLiteral>(entity: string, data: T | T[]): Promise<void> {
        const items = Array.isArray(data) ? data : [data]
        await databaseConnection().getRepository<T>(entity).save(items)
    },

    async update(entity: string, id: string, data: Record<string, unknown>): Promise<void> {
        await databaseConnection().getRepository(entity).update(id, data)
    },

    findOneByOrFail<T>(entity: string, where: Record<string, unknown>): Promise<T> {
        return databaseConnection().getRepository(entity).findOneByOrFail(where) as Promise<T>
    },

    findOneBy<T>(entity: string, where: Record<string, unknown>): Promise<T | null> {
        return databaseConnection().getRepository(entity).findOneBy(where) as Promise<T | null>
    },
}
