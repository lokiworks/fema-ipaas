import { PlatformId, ProjectId } from '@fema/core-utils'
import { apDayjs, apDayjsDuration } from '@fema/server-utils'
import { TriggerRunStatus, TriggerStatusReport } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import Redis from 'ioredis'
import { redisHelper } from '../../database/redis'

export const triggerRunStats = (_log: FastifyBaseLogger, redisConnection: Redis) => ({
    async save({ platformId, connectorName, status }: SaveParams): Promise<void> {
        const day = apDayjs().format('YYYY-MM-DD')
        const statusToStore = status === TriggerRunStatus.COMPLETED ? status : TriggerRunStatus.FAILED
        const redisKey = triggerRunRedisKey(platformId, connectorName, day, statusToStore)

        await redisConnection.incr(redisKey)
        await redisConnection.expire(redisKey, apDayjsDuration(14, 'days').asSeconds())
    },

    async getStatusReport(params: GetStatusReportParams): Promise<TriggerStatusReport> {
        const { platformId } = params
        const redisKeys = await redisHelper.scanAll(redisConnection, triggerRunRedisKey(platformId, '*', '*', '*'))
        if (redisKeys.length === 0) {
            return { connectors: {} }
        }
        const values = await redisConnection.mget(redisKeys)
        const parsedRecords = parseRedisRecords(redisKeys, values)
        return aggregateRecords(parsedRecords)
    },
})

export const triggerRunRedisKey = (platformId: PlatformId, connectorName: string, formattedDate: string, status: TriggerRunStatus | '*') => `trigger_run:${platformId}:${connectorName}:${formattedDate}:${status}`

type ParsedRedisRecord = {
    connectorName: string
    day: string
    status: TriggerRunStatus
    count: number
}

const parseRedisRecords = (redisKeys: string[], values: (string | null)[]): ParsedRedisRecord[] => {
    return redisKeys.map((key, index) => {
        const parts = key.split(':')
        return {
            connectorName: parts[2],
            day: parts[3],
            status: parts[4] as TriggerRunStatus,
            count: Number(values[index]) || 0,
        }
    })
}

const aggregateRecords = (records: ParsedRedisRecord[]): TriggerStatusReport => {
    const connectorNameToDayToStats = new Map<string, Map<string, { success: number, failure: number }>>()

    for (const record of records) {
        if (!connectorNameToDayToStats.has(record.connectorName)) {
            connectorNameToDayToStats.set(record.connectorName, new Map())
        }
        const dayMap = connectorNameToDayToStats.get(record.connectorName)!
        const dayKey = record.day
        if (!dayMap.has(dayKey)) {
            dayMap.set(dayKey, { success: 0, failure: 0 })
        }
        const dayStats = dayMap.get(dayKey)!
        if (record.status === TriggerRunStatus.COMPLETED) {
            dayStats.success += record.count
        }
        else {
            dayStats.failure += record.count
        }
    }
    const connectors: TriggerStatusReport['connectors'] = {}
    for (const [connectorName, dayMap] of connectorNameToDayToStats) {
        const dailyStats: Record<string, { success: number, failure: number }> = {}
        let totalRuns = 0
        for (const [day, stats] of dayMap) {
            dailyStats[day] = stats
            totalRuns += stats.success + stats.failure
        }
        connectors[connectorName] = {
            dailyStats,
            totalRuns,
        }
    }

    return { connectors }
}

type GetStatusReportParams = {
    platformId: ProjectId
}

type SaveParams = {
    platformId: PlatformId
    connectorName: string
    status: TriggerRunStatus
}