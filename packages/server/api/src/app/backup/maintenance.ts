import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { RedisType } from '@fema-ipaas/server-utils'
import lockfile from 'proper-lockfile'
import { redisConnections } from '../database/redis-connections'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

async function active(): Promise<boolean> {
    if (existsSync(markerPath())) return true
    if (system.get(AppSystemProp.REDIS_TYPE) === RedisType.MEMORY) return false
    return (await (await redisConnections.useExisting()).exists(KEY)) === 1
}

async function assertAvailable(): Promise<void> {
    if (await active()) throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'system.restoreMaintenance' } })
}

async function begin(): Promise<string> {
    const owner = randomUUID()
    await fs.mkdir(path.dirname(markerPath()), { recursive: true })
    await fs.writeFile(markerPath(), owner, { flag: 'wx' })
    if (system.get(AppSystemProp.REDIS_TYPE) !== RedisType.MEMORY) {
        const redis = await redisConnections.useExisting()
        if (await redis.set(KEY, owner, 'NX') !== 'OK') {
            await fs.rm(markerPath()); throw new Error('Another restore owns the maintenance flag') 
        }
    }
    return owner
}

async function finish(owner: string): Promise<void> {
    if (system.get(AppSystemProp.REDIS_TYPE) !== RedisType.MEMORY) {
        const redis = await redisConnections.useExisting()
        await redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end', 1, KEY, owner)
    }
    if (await fs.readFile(markerPath(), 'utf8') === owner) await fs.rm(markerPath())
}

async function lockLocalDatabase(): Promise<() => Promise<void>> {
    const directory = path.resolve(system.getOrThrow(AppSystemProp.CONFIG_PATH))
    await fs.mkdir(directory, { recursive: true })
    return lockfile.lock(path.join(directory, 'pglite'), { realpath: false, stale: 120000, update: 10000, retries: 0 })
}

function markerPath(): string {
    return path.join(path.resolve(system.getOrThrow(AppSystemProp.CONFIG_PATH)), 'restore-maintenance') 
}

const KEY = 'instance:restore-maintenance'
export const restoreMaintenance = { active, assertAvailable, begin, finish, lockLocalDatabase, markerPath }
