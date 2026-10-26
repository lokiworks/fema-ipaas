import { ApplicationError, ErrorCode, generateId, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { RunVerificationRequestBody, VerificationRun } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { distributedLock, redisConnections } from '../database/redis-connections'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { verificationService } from './verification.service'

export const verificationRunService = (log: FastifyBaseLogger) => ({
    async start({ projectId, tenantId, sinceHours }: StartParams): Promise<{ runId: string }> {
        const runId = generateId()
        await write({ runId, projectId, tenantId, status: 'QUEUED', result: null, error: null })
        const { error } = await tryCatch(() => systemJobsSchedule(log).upsertJob({
            job: { name: SystemJobName.VERIFY_RESULTS_MANUAL, jobId: `verification-run-${runId}`, data: { runId, projectId, tenantId, sinceHours } },
            schedule: { type: 'one-time', date: dayjsUtil() },
            customConfig: { attempts: 1 },
        }))
        if (error) {
            await write({ runId, projectId, tenantId, status: 'FAILED', result: null, error: 'verification.failed' })
            throw error
        }
        return { runId }
    },

    async get({ runId, projectId }: { runId: string, projectId: string }): Promise<VerificationRun> {
        const stored = await read(runId)
        if (isNil(stored) || stored.projectId !== projectId) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'VerificationRun', entityId: runId } })
        }
        return { status: stored.status, result: stored.result, error: stored.error }
    },

    async execute({ runId, projectId, tenantId, sinceHours }: ExecuteParams): Promise<void> {
        await distributedLock(log).runExclusive({ key: `verification-run:${projectId}:${runId}`, timeoutInSeconds: 60, fn: async () => {
            const previous = await read(runId)
            if (isNil(previous) || previous.projectId !== projectId || previous.tenantId !== tenantId || previous.status === 'SUCCEEDED') {
                return
            }
            await write({ ...previous, status: 'RUNNING' })
            const { data: result, error } = await tryCatch(() => verificationService(log).run({ projectId, tenantId, sinceHours }))
            await write({ ...previous, status: error ? 'FAILED' : 'SUCCEEDED', result, error: error ? 'verification.failed' : null })
            if (error) {
                throw error
            }
        } })
    },
})

async function read(runId: string): Promise<StoredRun | null> {
    const redis = await redisConnections.useExisting()
    const value = await redis.get(`verification-run:${runId}`)
    if (isNil(value)) {
        return null
    }
    const { data, error } = await tryCatch(async () => StoredRun.parse(JSON.parse(value)))
    return error ? null : data
}

async function write(run: StoredRun): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.set(`verification-run:${run.runId}`, JSON.stringify(run), 'EX', 24 * 60 * 60)
}

const StoredRun = VerificationRun.extend({ runId: z.string(), projectId: z.string(), tenantId: z.string() })
type StoredRun = z.infer<typeof StoredRun>
type StartParams = RunVerificationRequestBody & { tenantId: string }
type ExecuteParams = StartParams & { runId: string }
