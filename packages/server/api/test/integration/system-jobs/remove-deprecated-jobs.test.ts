import { Queue } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import IORedis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SystemJobName } from '../../../src/app/helper/system-jobs/common'
import { redisAvailability } from '../../helpers/redis-availability'

const SYSTEM_JOB_QUEUE = 'system-job-queue'
const REDIS_HOST = redisAvailability.host
const REDIS_PORT = redisAvailability.port
const REDIS_REACHABLE = await redisAvailability.isReachable()
const REDIS_DB = 9

const loggedErrors: unknown[] = []
const log: FastifyBaseLogger = {
    debug: () => {}, info: () => {}, warn: () => {}, trace: () => {}, fatal: () => {}, silent: () => {},
    error: (obj: unknown) => {
        loggedErrors.push(obj)
    },
    child: () => log,
    level: 'info',
} as unknown as FastifyBaseLogger

let seedQueue: Queue
let systemJobsSchedule: typeof import('../../../src/app/helper/system-jobs/system-job').systemJobsSchedule

describe.skipIf(!REDIS_REACHABLE)('removeDeprecatedJobs', () => {
    beforeAll(async () => {
        process.env.FEMA_REDIS_TYPE = 'default'
        process.env.FEMA_REDIS_HOST = REDIS_HOST
        process.env.FEMA_REDIS_PORT = String(REDIS_PORT)
        process.env.FEMA_REDIS_DB = String(REDIS_DB)
        delete process.env.FEMA_REDIS_URL
        systemJobsSchedule = (await import('../../../src/app/helper/system-jobs/system-job')).systemJobsSchedule

        seedQueue = new Queue(SYSTEM_JOB_QUEUE, {
            connection: new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: REDIS_DB, maxRetriesPerRequest: null }),
        })
        await seedQueue.waitUntilReady()
        await seedQueue.obliterate({ force: true })
    })

    afterAll(async () => {
        await seedQueue.obliterate({ force: true })
        await seedQueue.close()
        await systemJobsSchedule(log).close()
    })

    it('removes deprecated schedulers and their delayed jobs while keeping live ones', async () => {
        await seedQueue.add('usage-report', {}, { repeat: { pattern: '0 * * * *', tz: 'UTC' } })
        await seedQueue.upsertJobScheduler('trial-tracker', { pattern: '0 * * * *', tz: 'UTC' }, { name: 'trial-tracker', data: {} })
        await seedQueue.add('issue-reminder', {}, { jobId: 'issue-reminder-one-off', delay: 60_000 })
        await seedQueue.add('bundle-connector', { name: '@fema-ipaas/connector-slack', version: '1.0.0' }, { jobId: 'bundle-connector:@fema-ipaas/connector-slack:1.0.0', delay: 60_000 })
        await seedQueue.upsertJobScheduler(SystemJobName.CONNECTORS_ANALYTICS, { pattern: '0 * * * *', tz: 'UTC' }, { name: SystemJobName.CONNECTORS_ANALYTICS, data: {} })

        await systemJobsSchedule(log).init()

        const schedulerNames = (await seedQueue.getJobSchedulers()).map(scheduler => scheduler.name)
        const jobNames = (await seedQueue.getJobs()).map(job => job.name)

        expect(loggedErrors).toHaveLength(0)
        expect(schedulerNames).toEqual([SystemJobName.CONNECTORS_ANALYTICS])
        expect(jobNames).toEqual([SystemJobName.CONNECTORS_ANALYTICS])
    })
})
