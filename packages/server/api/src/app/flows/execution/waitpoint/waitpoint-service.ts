import { apId, isNil } from '@fema/core-utils'
import { ExecutionStatus } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { transaction } from '../../../core/db/transaction'
import { SystemJobName } from '../../../helper/system-jobs/common'
import { systemJobsSchedule } from '../../../helper/system-jobs/system-job'
import { WaitpointEntity } from './waitpoint-entity'
import { CompleteParams, CompleteResult, CreateForPauseParams, CreateForPauseResult, FindPendingByVersionParams, HandleResumeSignalParams, Waitpoint, WaitpointStatus } from './waitpoint-types'

const waitpointRepo = repoFactory(WaitpointEntity)

export const waitpointService = (log: FastifyBaseLogger) => ({
    async createForPause(params: CreateForPauseParams): Promise<CreateForPauseResult> {
        const preCompleted = await waitpointRepo().findOneBy({
            executionId: params.executionId,
            stepName: params.stepName,
            status: WaitpointStatus.COMPLETED,
        })
        if (!isNil(preCompleted)) {
            log.info({ execution: { id: params.executionId }, step: { name: params.stepName }, existingStatus: preCompleted.status }, '[waitpointService#createForPause] Waitpoint already pre-completed for this step')
            return { inserted: false, waitpoint: preCompleted }
        }

        const id = apId()
        await waitpointRepo()
            .createQueryBuilder()
            .insert()
            .into('waitpoint')
            .values({
                id,
                executionId: params.executionId,
                workspaceId: params.workspaceId,
                stepName: params.stepName,
                type: params.type,
                version: params.version,
                status: WaitpointStatus.PENDING,
                resumeDateTime: params.resumeDateTime ?? null,
                responseToSend: params.responseToSend ?? null,
                workerHandlerId: params.workerHandlerId ?? null,
                httpRequestId: params.httpRequestId ?? null,
                resumePayload: null,
            })
            .orIgnore()
            .execute()

        const waitpoint = await waitpointRepo().findOneByOrFail({ executionId: params.executionId, stepName: params.stepName })
        const inserted = waitpoint.id === id
        if (inserted) {
            log.info({ execution: { id: params.executionId }, waitpoint: { id } }, '[waitpointService#createForPause] Waitpoint created')
        }
        else {
            log.info({ execution: { id: params.executionId }, existingStatus: waitpoint.status }, '[waitpointService#createForPause] Waitpoint already exists')
        }
        if (!isNil(params.resumeDateTime)) {
            await systemJobsSchedule(log).upsertJob({
                job: {
                    name: SystemJobName.RESUME_DELAY_WAITPOINT,
                    data: { executionId: params.executionId, workspaceId: params.workspaceId, waitpointId: waitpoint.id },
                    jobId: `resume-delay-${params.executionId}`,
                },
                schedule: {
                    type: 'one-time',
                    date: dayjs(params.resumeDateTime),
                },
            })
        }
        return { inserted, waitpoint }
    },

    async complete(params: CompleteParams): Promise<CompleteResult> {
        return transaction(async (entityManager) => {
            const repo = waitpointRepo(entityManager)

            const pending = await repo
                .createQueryBuilder('waitpoint')
                .setLock('pessimistic_write')
                .where({ id: params.waitpointId, executionId: params.executionId, status: WaitpointStatus.PENDING })
                .getOne()

            if (isNil(pending)) {
                log.info({ execution: { id: params.executionId }, waitpoint: { id: params.waitpointId } }, '[waitpointService#complete] No pending waitpoint matches; dropping stale resume signal')
                return { completedExisting: false, waitpoint: null }
            }

            const updated: Waitpoint = {
                ...pending,
                status: WaitpointStatus.COMPLETED,
                resumePayload: params.resumePayload,
                workerHandlerId: params.workerHandlerId ?? pending.workerHandlerId,
            }
            await repo.save(updated)
            log.info({ execution: { id: params.executionId } }, '[waitpointService#complete] Completed existing PENDING waitpoint')
            return { completedExisting: true, waitpoint: updated }
        })
    },

    async handleResumeSignal(params: HandleResumeSignalParams): Promise<boolean> {
        const { executionId, waitpointId, executionStatus, workspaceId, resumePayload, workerHandlerId, onReady } = params

        if (executionStatus === ExecutionStatus.PAUSED) {
            const waitpoint = await transaction(async (entityManager) => {
                const repo = waitpointRepo(entityManager)
                const found = await repo
                    .createQueryBuilder('waitpoint')
                    .setLock('pessimistic_write')
                    .where({ id: waitpointId, executionId })
                    .getOne()
                if (isNil(found)) {
                    return null
                }
                await onReady(found)
                await repo.delete({ id: found.id })
                return found
            })
            if (isNil(waitpoint)) {
                log.info({ execution: { id: executionId }, waitpoint: { id: waitpointId } }, '[waitpointService#handleResumeSignal] Stale waitpointId, ignoring')
                return false
            }
            log.info({ execution: { id: executionId }, waitpoint: { id: waitpointId } }, '[waitpointService#handleResumeSignal] Resume triggered')
            return true
        }

        if (executionStatus === ExecutionStatus.RUNNING || executionStatus === ExecutionStatus.QUEUED) {
            const { completedExisting } = await this.complete({ executionId, workspaceId, waitpointId, resumePayload, workerHandlerId })
            if (!completedExisting) {
                log.info({ execution: { id: executionId }, waitpoint: { id: waitpointId } }, '[waitpointService#handleResumeSignal] Stale resume signal during RUNNING/QUEUED, ignoring')
                return false
            }
            log.info({ execution: { id: executionId } }, '[waitpointService#handleResumeSignal] Marked PENDING waitpoint COMPLETED while flow still RUNNING/QUEUED; runsMetadataQueue will trigger resume on PAUSED upload')
            return true
        }

        log.info({ execution: { id: executionId }, executionStatus }, '[waitpointService#handleResumeSignal] Flow run not in resumable state, ignoring')
        return false
    },

    async findPendingByVersion({ executionId, version }: FindPendingByVersionParams): Promise<Waitpoint | null> {
        return waitpointRepo().findOne({
            where: { executionId, status: WaitpointStatus.PENDING, version },
        })
    },

    async findByIdAndExecutionId({ waitpointId, executionId }: { waitpointId: string, executionId: string }): Promise<Waitpoint | null> {
        return waitpointRepo().findOneBy({ id: waitpointId, executionId })
    },

    async getByExecutionId(executionId: string): Promise<Waitpoint | null> {
        const completed = await waitpointRepo().findOneBy({ executionId, status: WaitpointStatus.COMPLETED })
        return completed ?? waitpointRepo().findOneBy({ executionId })
    },

    async delete({ id }: { id: string }): Promise<void> {
        await waitpointRepo().delete({ id })
        log.info({ waitpoint: { id } }, '[waitpointService#delete] Waitpoint deleted')
    },

    async deleteByExecutionId(executionId: string): Promise<void> {
        await waitpointRepo().delete({ executionId })
        log.info({ execution: { id: executionId } }, '[waitpointService#deleteByExecutionId] Waitpoint deleted')
    },
})
