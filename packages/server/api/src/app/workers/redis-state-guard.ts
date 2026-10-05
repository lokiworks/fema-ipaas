import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Execution, ExecutionStatus, ExecutionType, FileType, RunEnvironment, StreamStepProgress, WorkflowTriggerType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock } from '../database/redis-connections'
import { fileRepo, fileService } from '../file/file.service'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { projectService } from '../project/project-service'
import { triggerRunPolicyUtils } from '../trigger/trigger-run-policy-utils'
import { addToQueue, executionRepo } from '../workflows/execution/execution-service'
import { runsMetadataQueue } from '../workflows/execution/executions-queue'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { jobQueue } from './job-queue/job-queue'
import { queueMigration } from './migrations/queue-migration-runner'

let timer: NodeJS.Timeout | null = null

export const redisStateGuard = (log: FastifyBaseLogger) => ({
    start(): void {
        if (!isNil(timer)) {
            return
        }
        timer = setInterval(() => {
            void redisStateGuard(log).check().catch((error: unknown) => {
                log.error({ error: String(error) }, '[redisStateGuard#check] Check failed')
            })
        }, CHECK_INTERVAL_MS)
        timer.unref()
    },

    stop(): void {
        if (isNil(timer)) {
            return
        }
        clearInterval(timer)
        timer = null
    },

    async check(): Promise<RecoveryCounts | null> {
        if (await queueMigration(log).hasMarker()) {
            return null
        }
        return distributedLock(log).runExclusive({
            key: 'redis-state-recovery',
            timeoutInSeconds: RECOVERY_LOCK_SECONDS,
            fn: async () => {
                if (await queueMigration(log).hasMarker()) {
                    return null
                }
                log.error('[redisStateGuard#check] Redis lost its data (the queue marker is gone), rebuilding polling schedules and system jobs, queued runs that lost their job are put back in the queue')
                await queueMigration(log).run()
                const replayed = await systemJobsSchedule(log).replayRepeatedJobs()
                const runs = await recoverRunsThatLostTheirJob({ log })
                log.warn({ replayedSystemJobs: replayed, requeuedRuns: runs.requeued, failedRuns: runs.failed }, '[redisStateGuard#check] Recovery finished')
                return runs
            },
        })
    },
})

async function recoverRunsThatLostTheirJob({ log }: { log: FastifyBaseLogger }): Promise<RecoveryCounts> {
    const queued = await executionRepo().find({
        where: { status: ExecutionStatus.QUEUED, environment: RunEnvironment.PRODUCTION },
        take: MAX_RUNS_PER_RECOVERY,
    })
    const queues = jobQueue(log).getAllQueues()
    const lost = (await Promise.all(queued.map(async (execution) => {
        const jobs = await Promise.all(queues.map((queue) => queue.getJob(execution.id)))
        return jobs.some((job) => !isNil(job)) ? [] : [execution]
    }))).flat()
    const outcomes = await Promise.all(lost.map(async (execution) => {
        const { data: requeued, error } = await tryCatch(() => requeue({ log, execution }))
        if (!isNil(error)) {
            log.error({ error: String(error), execution: { id: execution.id } }, '[redisStateGuard#recoverRunsThatLostTheirJob] Could not put the run back in the queue')
        }
        if (requeued === true) {
            return RecoveryOutcome.REQUEUED
        }
        if (dayjs(execution.created).isAfter(dayjs().subtract(LOST_JOB_GRACE_SECONDS, 'second'))) {
            return RecoveryOutcome.LEFT_ALONE
        }
        await failRun({ log, execution })
        return RecoveryOutcome.FAILED
    }))
    return { requeued: outcomes.filter((outcome) => outcome === RecoveryOutcome.REQUEUED).length, failed: outcomes.filter((outcome) => outcome === RecoveryOutcome.FAILED).length }
}

async function requeue({ log, execution }: { log: FastifyBaseLogger, execution: Execution }): Promise<boolean> {
    const payloadFile = await fileRepo().createQueryBuilder('file')
        .where('file."projectId" = :projectId', { projectId: execution.projectId })
        .andWhere('file.type = :type', { type: FileType.WEBHOOK_PAYLOAD })
        .andWhere('file.created >= :from', { from: dayjs(execution.created).subtract(PAYLOAD_LOOKUP_WINDOW_SECONDS, 'second').toISOString() })
        .andWhere('file.created <= :to', { to: dayjs(execution.created).add(PAYLOAD_LOOKUP_WINDOW_SECONDS, 'second').toISOString() })
        .andWhere('file.metadata ->> \'executionId\' = :executionId', { executionId: execution.id })
        .getOne()
    const workflowVersion = await workflowVersionService(log).getOne(execution.workflowVersionId)
    if (isNil(payloadFile) || isNil(workflowVersion)) {
        return false
    }
    const current = await executionRepo().findOneBy({ id: execution.id, projectId: execution.projectId })
    if (current?.status !== ExecutionStatus.QUEUED) {
        return true
    }
    const stored = await fileService(log).getDataOrThrow({ projectId: execution.projectId, fileId: payloadFile.id, type: FileType.WEBHOOK_PAYLOAD })
    const payload: unknown = JSON.parse(stored.data.toString('utf8'))
    const settings = workflowVersion.trigger.type === WorkflowTriggerType.CONNECTOR ? workflowVersion.trigger.settings : undefined
    const concurrency = triggerRunPolicyUtils.ticketFor({ settings, payload, enqueuedAt: dayjs(execution.created).valueOf() })
    await addToQueue({
        execution,
        tenantId: await projectService(log).getTenantId(execution.projectId),
        payloadFileId: payloadFile.id,
        workerHandlerId: undefined,
        httpRequestId: undefined,
        streamStepProgress: StreamStepProgress.NONE,
        executionType: ExecutionType.BEGIN,
        executeTrigger: false,
        ...(isNil(concurrency) ? {} : { concurrency }),
    }, log)
    return true
}

async function failRun({ log, execution }: { log: FastifyBaseLogger, execution: Execution }): Promise<void> {
    const { error } = await tryCatch(() => runsMetadataQueue(log).add({
        id: execution.id,
        projectId: execution.projectId,
        status: ExecutionStatus.INTERNAL_ERROR,
        finishTime: dayjs().toISOString(),
        failedStep: { name: 'trigger', displayName: 'trigger', message: LOST_JOB_MESSAGE },
    }))
    if (!isNil(error)) {
        log.error({ error: String(error), execution: { id: execution.id } }, '[redisStateGuard#failRun] Could not mark the run failed')
    }
}

const CHECK_INTERVAL_MS = 10_000
const RECOVERY_LOCK_SECONDS = 600
const LOST_JOB_GRACE_SECONDS = 20
const MAX_RUNS_PER_RECOVERY = 20_000
const PAYLOAD_LOOKUP_WINDOW_SECONDS = 120
const LOST_JOB_MESSAGE = 'Redis lost its data while this run was queued, so the run was dropped before it started; start it again from the source event'

enum RecoveryOutcome {
    REQUEUED = 'REQUEUED',
    FAILED = 'FAILED',
    LEFT_ALONE = 'LEFT_ALONE',
}

type RecoveryCounts = {
    requeued: number
    failed: number
}
