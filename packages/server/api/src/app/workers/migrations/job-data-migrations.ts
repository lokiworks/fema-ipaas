import { apId, isNil } from '@fema-ipaas/core-utils'
import { ExecutionType, JobData, ResumeReason, StreamStepProgress, WorkerJobType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { workflowVersionService } from '../../workflows/workflow-version/workflow-version.service'

const LegacyExecuteWorkflowFields = z.object({
    streamStepProgress: z.enum(StreamStepProgress).optional(),
    progressUpdateType: z.string().optional(),
    workerHandlerId: z.string().nullish(),
    synchronousHandlerId: z.string().nullish(),
})

function deriveExecuteWorkflowMigrationFields(job: JobData): { streamStepProgress: StreamStepProgress, workerHandlerId: string | null } {
    const legacy = LegacyExecuteWorkflowFields.parse(job)
    return {
        streamStepProgress: legacy.streamStepProgress ?? migrateProgressUpdateType(legacy.progressUpdateType),
        workerHandlerId: legacy.workerHandlerId ?? legacy.synchronousHandlerId ?? null,
    }
}

function createMigrations(log: FastifyBaseLogger): JobMigration[] {
    const enrichWorkflowId: JobMigration = {
        runAtSchemaVersion: 0,
        migrate: async (job: JobData) => {
            if (job.jobType === WorkerJobType.EXECUTE_WORKFLOW) {
                const workflowVersion = await workflowVersionService(log).getOne(job.workflowVersionId)
                const logsFileId = 'logsFileId' in job ? job.logsFileId : apId()
                return {
                    ...job,
                    workflowId: workflowVersion!.workflowId,
                    schemaVersion: 4,
                    logsFileId,
                }
            }
            return {
                ...job,
                schemaVersion: 4,
            }
        },
    }
    const migratePayloadToUnion: JobMigration = {
        runAtSchemaVersion: 4,
        migrate: async (job: JobData) => {
            if (job.jobType === WorkerJobType.EXECUTE_WORKFLOW || job.jobType === WorkerJobType.EXECUTE_WEBHOOK) {
                return {
                    ...job,
                    schemaVersion: 5,
                    payload: { type: 'inline', value: job.payload },
                }
            }
            return { ...job, schemaVersion: 5 }
        },
    }
    const renameProgressAndHandlerFields: JobMigration = {
        runAtSchemaVersion: 5,
        migrate: async (job: JobData) => {
            if (job.jobType === WorkerJobType.EXECUTE_WORKFLOW) {
                return {
                    ...job,
                    schemaVersion: 6,
                    ...deriveExecuteWorkflowMigrationFields(job),
                }
            }
            return { ...job, schemaVersion: 6 }
        },
    }
    const dropLogsUploadUrl: JobMigration = {
        runAtSchemaVersion: 6,
        migrate: async (job: JobData) => {
            if (job.jobType !== WorkerJobType.EXECUTE_WORKFLOW) {
                return { ...job, schemaVersion: 7 }
            }
            const legacy = job as Record<string, unknown>
            delete legacy['logsUploadUrl']
            return {
                ...job,
                schemaVersion: 7,
            }
        },
    }
    const backfillRequiredExecuteWorkflowFields: JobMigration = {
        runAtSchemaVersion: 7,
        migrate: async (job: JobData) => {
            if (job.jobType !== WorkerJobType.EXECUTE_WORKFLOW) {
                return { ...job, schemaVersion: 8 }
            }
            return {
                ...job,
                schemaVersion: 8,
                ...deriveExecuteWorkflowMigrationFields(job),
            }
        },
    }
    const bridgeV8ToV9: JobMigration = {
        runAtSchemaVersion: 8,
        migrate: async (job: JobData) => ({ ...job, schemaVersion: 9 }),
    }
    const addResumeReason: JobMigration = {
        runAtSchemaVersion: 9,
        migrate: async (job: JobData) => {
            if (job.jobType !== WorkerJobType.EXECUTE_WORKFLOW || job.executionType !== ExecutionType.RESUME) {
                return { ...job, schemaVersion: 10 }
            }
            const isLegacyRetry = job.payload.type === 'inline' && isNil(job.payload.value)
            return {
                ...job,
                schemaVersion: 10,
                resumeReason: isLegacyRetry ? ResumeReason.RETRY : ResumeReason.WAITPOINT,
            }
        },
    }

    return [enrichWorkflowId, migratePayloadToUnion, renameProgressAndHandlerFields, dropLogsUploadUrl, backfillRequiredExecuteWorkflowFields, bridgeV8ToV9, addResumeReason]
}

function migrateProgressUpdateType(progressUpdateType: string | undefined): StreamStepProgress {
    if (progressUpdateType === 'TEST_WORKFLOW' || progressUpdateType === 'WEBHOOK_RESPONSE') {
        return StreamStepProgress.WEBSOCKET
    }
    return StreamStepProgress.NONE
}

export const jobMigrations = (log: FastifyBaseLogger) => ({
    apply: async (job: Record<string, unknown>): Promise<JobData> => {
        let jobData = job as JobData
        log.info({
            schemaVersion: jobData.schemaVersion,
            job: { type: jobData.jobType },
            workspace: { id: jobData.workspaceId },
        }, '[jobMigrations] Apply migration for job')
        const migrations = createMigrations(log)
        for (const migration of migrations) {
            const schemaVersion = getSchemaVersion(jobData)
            if (schemaVersion === migration.runAtSchemaVersion) {
                jobData = await migration.migrate(jobData)
            }
        }
        return jobData
    },
})

function getSchemaVersion(job: JobData): number {
    return 'schemaVersion' in job ? job.schemaVersion : 0
}


type JobMigration = {
    runAtSchemaVersion: number
    migrate: (job: JobData) => Promise<JobData>
}
