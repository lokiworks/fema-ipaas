import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { types } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { spreadIfDefined } from '@fema-ipaas/core-utils'
import { RuntimeEnvironment } from '@fema-ipaas/shared'
import { DataSource } from 'typeorm'
import { PGliteDriver } from 'typeorm-pglite'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { commonProperties } from './database-connection'
import { getMigrations } from './postgres-connection'

const getPGliteDataPathFromDisk = (): string => {
    const configDirectoryPath = system.getOrThrow(AppSystemProp.CONFIG_PATH)
    const pgliteDataPath = path.resolve(path.join(configDirectoryPath, 'pglite'))
    mkdirSync(pgliteDataPath, { recursive: true })
    return pgliteDataPath
}

const getPGliteDataPath = (): string | undefined => {
    const env = system.getOrThrow<RuntimeEnvironment>(AppSystemProp.ENVIRONMENT)

    if (env === RuntimeEnvironment.TESTING) {
        return undefined // In-memory mode
    }
    return getPGliteDataPathFromDisk()
}

export const createPGliteDataSource = (): DataSource => {
    const env = system.getOrThrow<RuntimeEnvironment>(AppSystemProp.ENVIRONMENT)

    const dataPath = getPGliteDataPath()

    return new DataSource({
        type: 'postgres',
        driver: new PGliteDriver({
            ...spreadIfDefined('dataDir', dataPath),
            extensions: { vector },
            serializers: {
                [types.BOOL]: (val: unknown): string => {
                    if (val === true || val === 'true' || val === 1) return 'TRUE'
                    if (val === false || val === 'false' || val === 0) return 'FALSE'
                    return String(val)
                },

            },
            parsers: {
                [types.BYTEA]: (val: unknown): Buffer => {
                    if (val instanceof Buffer) {
                        return val
                    }
                    if (typeof val === 'string') {
                        if (val.startsWith('\\x')) {
                            return Buffer.from(val.slice(2), 'hex')
                        }
                        return Buffer.from(val)
                    }
                    if (val && typeof val === 'object' && 'length' in val) {
                        return Buffer.from(val as Uint8Array)
                    }
                    throw new Error(`Unexpected bytea value type: ${typeof val}`)
                },
            },
        }).driver,
        migrationsRun: env !== RuntimeEnvironment.TESTING,
        migrationsTransactionMode: 'each',
        migrations: env !== RuntimeEnvironment.TESTING ? getMigrations() : [],
        synchronize: env === RuntimeEnvironment.TESTING,
        ...commonProperties,
    })
}

